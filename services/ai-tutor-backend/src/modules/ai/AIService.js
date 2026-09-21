/**
 * AI 服务层
 *
 * 负责与大模型交互，包括:
 * - 动态 Prompt 组装
 * - 调用大模型 API (支持 NVIDIA/OpenAI 兼容格式)
 * - 苏格拉底式教学响应
 * - 答案校验
 */

export class AIService {
  constructor() {
    // 初始化配置
    this.apiKey = process.env.LLM_API_KEY;
    this.apiURL = process.env.LLM_API_URL || 'https://integrate.api.nvidia.com/v1/chat/completions';
    this.model = process.env.LLM_MODEL || 'stepfun-ai/step-3.7-flash';
    this.provider = process.env.LLM_PROVIDER || 'nvidia';

    // System Prompt 模板
    this.systemPrompt = `你是一位专业的 K12 数学老师，采用苏格拉底式教学法。

核心原则:
1. 永远不要直接给出答案
2. 通过提问引导学生思考
3. 根据学生的反应调整讲解方式
4. 使用鼓励性语言，保持耐心
5. 数学公式使用 LaTeX 格式，如 $x^2 + y^2 = r^2$

回复要求:
- 简短精炼，每次回复不超过 100 字
- 使用亲切的语气
- 针对学生的年级调整语言难度`;

    // 各状态的 Prompt 模板
    this.statePrompts = {
      WAIT_START: '学生刚开始学习，用亲切的语气打招呼，询问学生想学习什么知识点。',
      DIAGNOSING: '学生正在做诊断题，根据学生的回答给予适当的提示或鼓励。如果学生答对了，给予肯定；如果答错了，给予提示。',
      TEACHING: '学生在听你讲解知识点，用简单易懂的语言解释概念，可以举例说明。',
      INTERACTION: '学生在提问或与你交流，耐心解答学生的问题，引导学生思考。',
      CHECK_UNDERSTAND: '确认学生是否理解了知识点，可以通过提问的方式检查。',
      QUIZZING: '学生正在做测验题，根据学生的答案给予反馈。',
      EVAL_QUIZ: '测验结束了，根据学生的正确率给予评价和建议。',
      REMEDIATE: '学生需要补救学习，重新讲解重点内容，用更简单的方式说明。',
      EXPAND: '学生已经掌握了当前知识点，鼓励学生进入下一个知识点的学习。',
      MASTERED: '恭喜学生完成了本单元的学习，总结学生的表现。'
    };
  }

  /**
   * 生成教学响应（主入口）
   */
  async generateResponse(context) {
    const {
      studentGrade = 8,
      knowledgePoint = '勾股定理',
      conversationHistory = [],
      currentState = 'WAIT_START',
      studentAnswer = null,
      question = null
    } = context;

    try {
      // 检查 API Key 是否配置
      if (!this.apiKey || !this.apiKey.startsWith('nvapi-')) {
        console.log('[AI] API Key 未配置，使用 Mock 响应');
        return this._getMockResponse(currentState, context);
      }

      // 调用大模型 API
      const response = await this._callLLMWithState(
        currentState,
        knowledgePoint,
        conversationHistory,
        studentAnswer,
        question
      );

      return {
        content: response.content,
        metadata: {
          model: this.model,
          provider: this.provider,
          tokens: response.usage
        }
      };
    } catch (error) {
      console.error('AI 调用失败:', error);
      return this._getMockResponse(currentState, context);
    }
  }

  /**
   * 一体式教学响应生成 (替代 analyzeUserMessage + generateResponse 两次调用)
   * LLM 一次性返回: phase, action, answerCorrect, suggestedResponse
   */
  async generateTeachingResponse(context) {
    const {
      phase = 'welcome',
      knowledgePoint = '当前知识点',
      conversationHistory = [],
      userMessage,
      currentQuestion = null,
      diagnosisProgress = null,   // { answered, total }
      quizProgress = null,        // { answered, total }
      diagnosisResult = null,     // { correctCount, total, correctRate } — 诊断刚完成
    } = context;

    if (!this.apiKey || !this.apiKey.startsWith('nvapi-')) {
      return null; // 降级到本地关键词
    }

    const questionInfo = currentQuestion
      ? `\n当前题目：${currentQuestion.content || ''}\n题目类型：${currentQuestion.type || 'text'}\n正确答案：${currentQuestion.answer || ''}`
      : '';

    const progressInfo = [];
    if (phase === 'diagnosis' && diagnosisProgress) {
      progressInfo.push(`诊断进度：已答${diagnosisProgress.answered}/${diagnosisProgress.total}题`);
    }
    if (phase === 'quizzing' && quizProgress) {
      progressInfo.push(`测验进度：已答${quizProgress.answered}/${quizProgress.total}题`);
    }
    if (diagnosisResult) {
      progressInfo.push(`诊断结果：正确${diagnosisResult.correctCount}/${diagnosisResult.total} (${Math.round(diagnosisResult.correctRate * 100)}%)`);
    }

    const prompt = `你是一位专业的K12数学老师，采用启发式教学。你需要分析学生消息并同时给出回复。

当前阶段：${phase}
知识点：${knowledgePoint}${questionInfo}
${progressInfo.join('\n')}

对话历史：
${conversationHistory.slice(-6).map(m => `${m.role}: ${m.content}`).join('\n')}

学生最新消息：${userMessage}

请以JSON格式返回（只返回JSON，不要其他文字）：
{
  "phase": "welcome|diagnosis|teaching|quizzing|done",
  "action": "greet|ask_question|evaluate_answer|teach|respond|give_quiz|complete",
  "answerCorrect": true|false|null,
  "studentAnswer": "从消息中提取的答案部分",
  "suggestedResponse": "回复内容",
  "analysis": "简短分析(10字内)"
}

phase 判定规则：
- welcome: 学生首次打招呼，尚未开始学习
- diagnosis: 在诊断测试阶段，或应该进入诊断阶段
- teaching: 在讲解/互动阶段。当学生明确要求直接教学/跳过题目、说"不能/不知道"时，phase=teaching
- quizzing: 学生确认理解后进入，或已在测验阶段
- done: 所有测验已完成

action 判定规则：
- greet: 首次打招呼
- ask_question: 需要出一道题给学生（仅在 diagnosis/quizzing 阶段）
- evaluate_answer: 学生在答题，需要评判并反馈
- teach: 直接讲解概念/知识点，不抛出问题
- respond: 回应学生的闲聊/提问/困惑
- give_quiz: 开始给出测验题
- complete: 学习已完成

重要行为准则：
- 当学生说"不能"、"不知道"、"直接教学"、"跳过"、"讲给我听"、"先回答我的问题"时，phase=teaching, action=teach，直接讲解知识点的核心概念
- teaching 阶段的 suggestedResponse 应直接讲解（如概念解释、公式），不再出题或反问。用简短讲解后以提问确认理解结尾
- 仅当 action=ask_question 或 action=give_quiz 时，服务器才会从题库推送题目
- 当 diagnosis 阶段的题目全部做完后，服务器会自动推送 diagnosisResult，你应在看到诊断结果后将 phase 改为 teaching`;

    try {
      const messages = [
        { role: 'system', content: prompt },
        ...conversationHistory.slice(-8).map(m => ({
          role: m.role === 'assistant' ? 'assistant' : 'user',
          content: m.content
        })),
        { role: 'user', content: `[待响应] ${userMessage}` }
      ];

      const responseObj = await this._callLLMWithRetry(messages, {
        temperature: 0.3,
        max_tokens: 4096,
        timeoutMs: 60000,
        maxRetries: 2,
        baseDelayMs: 2000
      });

      const parsed = this._parseAnalysisJSON(responseObj.content);
      if (parsed) {
        if (!parsed.phase) parsed.phase = phase;
        if (!parsed.action) parsed.action = 'respond';
        if (!parsed.suggestedResponse) parsed.suggestedResponse = '请继续学习，有什么问题可以问我。';
        return parsed;
      }

      console.log('[AI] generateTeachingResponse JSON 解析失败');
      return null;
    } catch (error) {
      console.log('[AI] generateTeachingResponse 失败:', error.message);
      return null;
    }
  }

  /**
   * 一体式教学响应生成 (替代 analyzeUserMessage + generateResponse 两次调用)
   */
  async analyzeUserMessage(context) {
    const {
      currentState = 'WAIT_START',
      knowledgePoint = '当前知识点',
      conversationHistory = [],
      userMessage,
      currentQuestion = null
    } = context;

    if (!userMessage) return null;
    if (!this.apiKey || !this.apiKey.startsWith('nvapi-')) return null;

    // 构建分析 prompt
    const questionInfo = currentQuestion
      ? `\n当前题目：${currentQuestion.content || ''}\n题目类型：${currentQuestion.type || 'text'}\n正确答案：${currentQuestion.answer || ''}`
      : '';

    const analysisPrompt = `你是一个教学分析助手。请分析学生的这条消息，判断其意图和答案正确性。

当前教学状态：${currentState}
知识点：${knowledgePoint}${questionInfo}

对话历史：
${conversationHistory.slice(-6).map(m => `${m.role}: ${m.content}`).join('\n')}

学生最新消息：${userMessage}

请以 JSON 格式返回分析结果（只返回 JSON，不要其他文字）：
{
  "intent": "answer|greeting|understood|confused|next|complete|chat|skip_diagnosis",
  "answerCorrect": true|false|null,
  "answerValue": "从消息中提取的答案部分（如果 intent=answer）",
  "analysis": "对消息的简短分析（20字以内）",
  "suggestedResponse": "建议给学生的回复（50字以内）",
  "confidence": 0.0-1.0
}

intent 说明：
- answer: 学生在提交题目答案
- greeting: 学生在打招呼/开始对话
- understood: 学生表示理解了
- confused: 学生表示困惑/不懂
- next: 学生想进入下一阶段
- complete: 学生想结束学习
- chat: 学生在闲聊/评论（非提交答案）
- skip_diagnosis: 学生明确要求跳过题目/直接讲解/直接教学，或学生连续多次表示困惑且对话历史显示老师持续出题未被回应

重要行为准则：
- 当学生说"不能"、"不知道"、"直接教学"、"跳过题目"、"讲给我听"、"什么是"时，intent=skip_diagnosis
- 当 intent=skip_diagnosis 时，suggestedResponse 应直接开始讲解知识点的核心内容（如概念解释、公式），不再出题或反问。简短讲解20-30字后，用提问确认理解。例如："勾股定理是直角三角形中两条直角边的平方和等于斜边的平方，即a²+b²=c²。你理解这个关系吗？"
- 当当前状态为 DIAGNOSING 且学生明确表达不耐烦时，应识别为 skip_diagnosis
- answerCorrect 仅当 intent="answer" 且有当前题目时判断`;

    try {
      const messages = [
        { role: 'system', content: analysisPrompt },
        ...conversationHistory.slice(-8).map(m => ({
          role: m.role === 'assistant' ? 'assistant' : 'user',
          content: m.content
        })),
        { role: 'user', content: `[待分析消息] ${userMessage}` }
      ];

      const response = await this._callLLMRaw(messages);

      // 3 层 JSON 解析
      const parsed = this._parseAnalysisJSON(response.content);
      if (parsed) {
        if (parsed.confidence == null) parsed.confidence = 0.7;
        if (!parsed.intent) parsed.intent = 'chat';
        return parsed;
      }

      console.log('[AI] 无法解析 LLM 分析 JSON，降级到关键词检测');
      return null;
    } catch (error) {
      console.log('[AI] analyzeUserMessage 失败，降级到关键词检测:', error.message);
      return null;
    }
  }

  /**
   * 3 层 JSON 解析：直接解析 → 正则提取 → null
   */
  _parseAnalysisJSON(rawContent) {
    if (!rawContent) return null;

    // Layer 1: 直接 JSON.parse
    try {
      return JSON.parse(rawContent.trim());
    } catch (e1) {
      // Layer 2: 正则提取 {...}
      const match = rawContent.match(/\{[\s\S]*\}/);
      if (match) {
        try {
          return JSON.parse(match[0]);
        } catch (e2) {
          // Layer 3: null
        }
      }
    }
    return null;
  }

  /**
   * 根据状态调用 AI 生成响应
   */
  async _callLLMWithState(currentState, knowledgePoint, conversationHistory, studentAnswer, question) {
    // 获取当前状态的 Prompt
    const statePrompt = this.statePrompts[currentState] || this.statePrompts.WAIT_START;

    // 构建系统消息
    const systemMessage = {
      role: 'system',
      content: `${this.systemPrompt}\n\n当前任务：${statePrompt}\n知识点：${knowledgePoint}`
    };

    // 构建对话历史
    const messages = [
      systemMessage,
      ...conversationHistory.slice(-10).map(msg => ({
        role: msg.role === 'assistant' ? 'assistant' : 'user',
        content: msg.content
      }))
    ];

    // 添加当前问题或答案
    if (question) {
      messages.push({
        role: 'user',
        content: `题目：${question}\n请根据学生的回答给出反馈。`
      });
    }

    if (studentAnswer) {
      messages.push({
        role: 'user',
        content: `学生的回答：${studentAnswer}`
      });
    } else if (messages.length === 1) {
      // 如果是对话的第一条消息
      messages.push({
        role: 'user',
        content: '学生：你好，我想学习数学。'
      });
    }

    // 构建请求体
    const payload = {
      model: this.model,
      messages: messages,
      temperature: 0.7,
      top_p: 0.95,
      max_tokens: 4096,
      stream: false
    };

    const response = await fetch(this.apiURL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`API 调用失败：${response.status} - ${error}`);
    }

    const data = await response.json();
    const message = data.choices?.[0]?.message || {};

    // Reasoning models (like stepfun-ai/step-3.7-flash) may put the final answer
    // in reasoning_content when max_tokens is exhausted before content generation.
    // Prefer content, fallback to reasoning if content is null/empty.
    const content = message.content || message.reasoning_content || message.reasoning;

    return {
      content: content || '很好！请继续思考。',
      usage: data.usage
    };
  }

  /**
   * 内部通用 LLM 调用 (带超时 + 429 重试)
   * @param {Array} messages
   * @param {Object} options - { temperature, max_tokens, timeoutMs }
   */
  async _callLLMWithRetry(messages, options = {}) {
    const {
      temperature = 0.7,
      top_p = 0.95,
      max_tokens = 4096,
      timeoutMs = 30000,
      maxRetries = 3,
      baseDelayMs = 1000
    } = options;

    const payload = {
      model: this.model,
      messages,
      temperature,
      top_p,
      max_tokens,
      stream: false
    };

    let lastError;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const timeoutController = new AbortController();
      const timeoutId = setTimeout(() => timeoutController.abort(), timeoutMs);

      try {
        const response = await fetch(this.apiURL, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Accept': 'application/json',
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(payload),
          signal: timeoutController.signal
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          const error = await response.text();

          // 429 限流：重试
          if (response.status === 429 && attempt < maxRetries) {
            const delay = baseDelayMs * Math.pow(2, attempt); // 指数退避: 1s, 2s, 4s
            console.log(`[AI] 收到 429 限流, ${delay}ms 后重试 (第 ${attempt + 1}/${maxRetries} 次)`);
            await new Promise(r => setTimeout(r, delay));
            continue;
          }

          throw new Error(`API 调用失败：${response.status} - ${error}`);
        }

        const data = await response.json();
        const message = data.choices?.[0]?.message || {};

        return {
          content: message.content || message.reasoning_content || message.reasoning || '{}',
          usage: data.usage
        };
      } catch (error) {
        clearTimeout(timeoutId);
        lastError = error;
        if (error.name === 'AbortError') {
          throw new Error(`AI API 请求超时（${timeoutMs}ms）`);
        }
        // 非 429 错误不重试
        if (attempt === maxRetries || !error.message.includes('429')) {
          throw error;
        }
      }
    }
    throw lastError;
  }

  /**
   * 原始 API 调用 (不注入 Socratic system prompt)
   * 仅用于 analyzeUserMessage 等结构化分析场景
   */
  async _callLLMRaw(messages) {
    return this._callLLMWithRetry(messages, {
      temperature: 0.3,
      max_tokens: 4096,
      timeoutMs: 60000,
      maxRetries: 2,
      baseDelayMs: 2000
    });
  }

  /**
   * 调用大模型 API (NVIDIA/OpenAI 兼容格式) — 注入 Socratic system prompt
   */
  async _callLLM(messages, currentState) {
    const allMessages = [
      { role: 'system', content: this.systemPrompt },
      ...messages
    ];
    return this._callLLMWithRetry(allMessages, {
      temperature: 0.7,
      max_tokens: 4096,
      timeoutMs: 60000,
      maxRetries: 2,
      baseDelayMs: 2000
    });
  }

  /**
   * 校验答案（支持选择题、填空题、文本题）
   * 支持多种格式：字母选项、数值、文本、数学表达式
   */
  validateAnswer(question, studentAnswer, context = {}) {
    if (!question) {
      return { valid: false, correct: false, error: '题目不存在', explanation: '', confidence: 0 };
    }

    const correctAnswer = question?.answer?.toString().toLowerCase().trim();
    const answer = (studentAnswer || '').toString().toLowerCase().trim();

    // 提取用户答案中的关键部分
    const answerText = answer
      .replace('我选择：', '')
      .replace('选择', '')
      .replace('答案是', '')
      .replace('答案：', '')
      .replace('选项', '')
      .trim();

    // 选择题校验
    if (question.type === 'choice') {
      // 标准化答案格式（A/B/C/D 或 a/b/c/d）
      const studentOption = answerText.toUpperCase();
      const correctOption = correctAnswer.toUpperCase();

      const isCorrect = studentOption === correctOption ||
        answerText === correctOption ||
        answer.includes(correctOption);

      return {
        valid: true,
        correct: isCorrect,
        correctAnswer: question.answer,
        explanation: isCorrect
          ? (question.explanation ? `回答正确！${question.explanation}` : '回答正确！')
          : `正确答案是：${question.answer}. ${question.explanation || ''}`,
        confidence: 1.0,
        feedback: isCorrect ? 'positive' : 'corrective'
      };
    }

    // 填空题/计算题校验
    if (question.type === 'fill' || question.type === 'text') {
      // 1. 数字答案比对（支持近似值）
      const answerNum = this.extractNumber(answerText);
      const correctNum = this.extractNumber(correctAnswer);

      if (answerNum !== null && correctNum !== null) {
        // 数值比较（允许 1% 误差）
        const isCorrect = Math.abs(answerNum - correctNum) / (Math.abs(correctNum) + 0.001) < 0.01;
        return {
          valid: true,
          correct: isCorrect,
          correctAnswer: question.answer,
          explanation: isCorrect
            ? (question.explanation ? `回答正确！${question.explanation}` : '回答正确！')
            : `正确答案是：${question.answer}. ${question.explanation || ''}`,
          confidence: 1.0,
          feedback: isCorrect ? 'positive' : 'corrective'
        };
      }

      // 2. 文本答案标准化比较
      const normalizedStudent = this.normalizeText(answerText);
      const normalizedCorrect = this.normalizeText(correctAnswer);

      // 精确匹配或包含关键词
      const isExactMatch = normalizedStudent === normalizedCorrect ||
        answerText.includes(correctAnswer) ||
        correctAnswer.includes(answerText);

      return {
        valid: true,
        correct: isExactMatch,
        correctAnswer: question.answer,
        explanation: isExactMatch
          ? (question.explanation ? `回答正确！${question.explanation}` : '回答正确！')
          : `正确答案是：${question.answer}. ${question.explanation || ''}`,
        confidence: 1.0,
        feedback: isExactMatch ? 'positive' : 'corrective'
      };
    }

    // 文本问答题 - 使用 AI 判断（如果有上下文）
    if (question.type === 'text' || question.type === 'essay') {
      return {
        valid: true,
        correct: true, // 文本题默认给分
        correctAnswer: studentAnswer,
        explanation: '回答合理',
        confidence: 0.8,
        feedback: 'positive'
      };
    }

    return {
      valid: false,
      correct: false,
      correctAnswer: question.answer,
      explanation: '答案格式不匹配',
      confidence: 0,
      feedback: 'neutral'
    };
  }

  /**
   * 文本标准化（用于比较）
   */
  normalizeText(text) {
    if (!text) return '';
    return text.toString()
      .toLowerCase()
      .replace(/\s+/g, '') // 移除空格
      .replace(/[,.!?;:，。！？；：]/g, '') // 移除标点
      .trim();
  }

  /**
   * 从字符串中提取数字
   */
  extractNumber(str) {
    if (!str) return null;
    const match = str.toString().match(/-?\d+(\.\d+)?/);
    return match ? parseFloat(match[0]) : null;
  }

  /**
   * 检索相关知识 (RAG)
   */
  async retrieveKnowledge(knowledgePointId) {
    // 从数据库或缓存中检索知识点信息
    const knowledgePoints = {
      'math_pythagorean': {
        definition: '直角三角形两直角边的平方和等于斜边的平方',
        formula: 'a² + b² = c²',
        examples: ['3, 4, 5', '5, 12, 13', '6, 8, 10'],
        commonMistakes: ['混淆直角边和斜边', '忘记开平方']
      },
      'math_linear_equation': {
        definition: '只含有一个未知数且次数为 1 的方程',
        formula: 'ax + b = 0 (a≠0)',
        examples: ['2x + 3 = 7', '3x - 5 = 10'],
        commonMistakes: ['移项忘记变号', '除法运算错误']
      },
      'math_quadratic_function': {
        definition: '形如 y = ax² + bx + c 的函数 (a≠0)',
        formula: 'y = a(x-h)² + k',
        examples: ['y = x²', 'y = (x-2)² + 1'],
        commonMistakes: ['开口方向判断错误', '顶点坐标计算错误']
      },
      'math_similar_triangles': {
        definition: '对应角相等，对应边成比例的两个三角形',
        formula: '△ABC ~ △DEF',
        examples: ['AAA 判定', '两边成比例且夹角相等'],
        commonMistakes: ['边长比与面积比混淆', '对应关系找错']
      }
    };

    return knowledgePoints[knowledgePointId] || {
      definition: '知识点定义',
      examples: ['示例 1', '示例 2'],
      commonMistakes: ['常见错误 1', '常见错误 2']
    };
  }

  /**
   * 生成变式题
   */
  async generateVariantQuestion(originalQuestion, difficulty = 1) {
    // Try AI generation first
    if (this.apiKey && this.apiKey.startsWith('nvapi-')) {
      try {
        const messages = [
          {
            role: 'user',
            content: `请根据以下题目生成一道难度级别为 ${difficulty} 的变式题。保持相同的知识点和题型，但改变数值或情境。

原始题目：${originalQuestion.content || JSON.stringify(originalQuestion)}
原始答案：${originalQuestion.answer}
题型：${originalQuestion.type || 'fill'}

请以JSON格式返回：{"question": "变式题题干", "answer": "答案", "explanation": "解析", "type": "题型"}`
          }
        ];
        const response = await this._callLLM(messages, 'QUIZZING');
        try {
          const parsed = JSON.parse(response.content);
          return {
            question: parsed.question || '变式题',
            answer: parsed.answer || '',
            explanation: parsed.explanation || '',
            type: parsed.type || originalQuestion.type
          };
        } catch (parseErr) {
          return {
            question: response.content || '变式题',
            answer: '',
            explanation: '请根据题目自行作答',
          };
        }
      } catch (e) {
        console.log('[AI] 变式题生成失败，使用变体:', e.message);
      }
    }

    // Fallback: simple numeric variation
    const baseAnswer = parseFloat(originalQuestion.answer);
    if (!isNaN(baseAnswer)) {
      const factor = 1 + difficulty * 0.5;
      const newAnswer = Math.round(baseAnswer * factor);
      return {
        question: `变式题：计算 ${originalQuestion.content?.substring(0, 20) || '这道题'} 在难度${difficulty}下的结果`,
        answer: String(newAnswer),
        explanation: `原题答案 ${baseAnswer} × ${factor.toFixed(1)} ≈ ${newAnswer}`,
      };
    }

    return {
      question: `请根据"${originalQuestion.content || originalQuestion}"的变式进行求解`,
      answer: originalQuestion.answer,
      explanation: '变式题保持相同解题思路',
    };
  }

  /**
   * 模拟响应 (用于演示)
   */
  _getMockResponse(state, context = {}) {
    const kp = context.knowledgePoint || '当前知识点';
    const responses = {
      WAIT_START: `你好！我是你的 AI 数学老师。今天想学习什么知识点呢？你可以告诉我你想学习的内容，我会为你提供诊断测试。`,
      DIAGNOSING: context.studentAnswer
        ? '好的，让我看看你的答案。继续做下一道题吧！'
        : `让我们开始诊断测试。请问关于${kp}，你知道哪些内容？`,
      ANALYZING: '我正在分析你的诊断结果...通过你的答题情况，我发现了一些值得关注的地方。',
      TEACHING: `关于${kp}，让我来为你讲解。你有什么不明白的地方可以随时提问。`,
      INTERACTION: '你有什么问题想问吗？我会耐心为你解答。',
      CHECK_UNDERSTAND: '很好！现在我们来确认一下你是否真的理解了。请准备好做几道测验题。',
      QUIZZING: '现在来做几道练习题吧！请认真作答。',
      EVAL_QUIZ: '测验结束了。让我看看你的表现如何...',
      REMEDIATE: '没关系，学习是一个循序渐进的过程。让我们重新梳理一下关键概念。',
      EXPAND: '太棒了！你已经掌握了这个知识点。我们可以继续学习下一个相关内容。',
      MASTERED: '恭喜你完成了本单元的学习！你已经很好地掌握了这部分知识。'
    };

    return {
      content: responses[state] || `关于${kp}的学习内容`,
      metadata: {
        model: 'mock'
      }
    };
  }
}
