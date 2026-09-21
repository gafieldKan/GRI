/**
 * ExamScannerAgent - 试卷识别 Agent
 *
 * 功能：
 * 1. 接收图片（拍照上传）
 * 2. 调用 OCR 识别题目
 * 3. AI 分析题目类型和内容
 * 4. 输出结构化题目数据
 */

import { AIService } from '../modules/ai/AIService.js';

export class ExamScannerAgent {
  constructor() {
    this.aiService = new AIService();
    this.apiKey = process.env.LLM_API_KEY;
    // 支持多模态的模型配置
    this.multimodalModel = process.env.LLM_MULTIMODAL_MODEL || 'nvidia/neva-22b';
  }

  /**
   * 扫描并识别试卷
   * @param {Object} params - 参数
   * @param {string} params.imageUrl - 图片 URL 或 Base64
   * @param {string} params.subject - 学科
   * @param {string} params.gradeLevel - 年级
   * @returns {Promise<Object>} 识别结果
   */
  async scanExam(params) {
    const { imageUrl, subject, gradeLevel } = params;

    try {
      // Step 1: 调用多模态模型进行 OCR 和题目识别
      const ocrResult = await this._performOCR(imageUrl);

      // Step 2: AI 分析题目类型和结构
      const parsedQuestions = await this._parseQuestions(ocrResult.rawText, subject, gradeLevel);

      return {
        success: true,
        ocr: ocrResult,
        parsedQuestions: parsedQuestions,
        metadata: {
          subject,
          gradeLevel,
          timestamp: new Date().toISOString()
        }
      };
    } catch (error) {
      console.error('[ExamScanner] 识别失败:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * 执行 OCR 识别（多模态模型）
   */
  async _performOCR(imageUrl) {
    // 如果有 NVIDIA 多模态 API，调用真实 OCR
    if (this.apiKey && this.apiKey.startsWith('nvapi-')) {
      try {
        return await this._callNVIDIAMultimodal(imageUrl);
      } catch (error) {
        console.error('[ExamScanner] NVIDIA API 失败，回退到 Mock 模式:', error.message);
        return this._getMockOCRResult();
      }
    }

    // Mock 模式：返回示例数据
    return this._getMockOCRResult();
  }

  /**
   * 调用 NVIDIA 多模态 API
   */
  async _callNVIDIAMultimodal(imageUrl) {
    const payload = {
      model: this.multimodalModel,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image_url',
              image_url: { url: imageUrl }
            },
            {
              type: 'text',
              text: `请识别这张试卷图片中的所有题目内容，按以下 JSON 格式返回：
{
  "raw_text": "完整识别的文本内容",
  "questions": [
    {
      "id": "q1",
      "type": "choice|fill|solution",
      "content": "题目内容",
      "options": ["A 选项", "B 选项"],
      "answer": "答案"
    }
  ]
}`
            }
          ]
        }
      ],
      temperature: 0.2,
      top_p: 0.95,
      max_tokens: 4096,
      stream: false
    };

    const response = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
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
      throw new Error(`NVIDIA API 调用失败：${response.status} - ${error}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    try {
      const parsed = JSON.parse(content);
      return {
        rawText: parsed.raw_text || content,
        questions: parsed.questions || []
      };
    } catch {
      return {
        rawText: content,
        questions: []
      };
    }
  }

  /**
   * Mock OCR 结果（用于演示）
   */
  _getMockOCRResult() {
    return {
      rawText: `1. 已知直角三角形的两条直角边分别是 3 和 4，求斜边的长度。
A. 5  B. 6  C. 7  D. 8

2. 若一次函数 y = kx + b 的图像经过点 (1, 2) 和 (3, 6)，求 k 和 b 的值。

3. 解方程：2x + 5 = 15`,
      questions: []
    };
  }

  /**
   * 解析题目（AI 分析）
   */
  async _parseQuestions(rawText, subject, gradeLevel) {
    const prompt = `请分析以下试卷内容，识别出每道题目的类型和内容：

试卷内容：
${rawText}

学科：${subject}
年级：${gradeLevel}

请按以下 JSON 格式返回分析结果：
[
  {
    "id": "q1",
    "type": "choice|fill|solution",
    "content": "题目完整内容",
    "options": ["选项 A", "选项 B", "选项 C", "选项 D"],
    "answer": "正确答案",
    "knowledgePoint": "知识点名称",
    "difficulty": 0.5
  }
]

如果没有选项，options 返回空数组。`;

    const messages = [
      { role: 'system', content: '你是一个专业的 K12 试卷分析助手，负责识别和结构化试卷题目。' },
      { role: 'user', content: prompt }
    ];

    try {
      const result = await this.aiService._callLLM(messages, 'WAIT_START');
      const content = result.content;

      // 尝试解析 JSON
      const jsonMatch = content.match(/\[.*\]/s);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }

      // 解析失败时返回空数组
      return [];
    } catch (error) {
      console.error('[ExamScanner] 题目解析失败:', error);
      return [];
    }
  }

  /**
   * 批量处理多页试卷
   */
  async scanExamBatch(params) {
    const { imageUrls, subject, gradeLevel } = params;

    const results = await Promise.all(
      imageUrls.map(url => this.scanExam({ imageUrl: url, subject, gradeLevel }))
    );

    // 合并所有结果
    const allQuestions = [];
    results.forEach(result => {
      if (result.success && result.parsedQuestions) {
        allQuestions.push(...result.parsedQuestions);
      }
    });

    return {
      success: true,
      totalPages: results.length,
      questions: allQuestions,
      metadata: {
        subject,
        gradeLevel,
        timestamp: new Date().toISOString()
      }
    };
  }
}
