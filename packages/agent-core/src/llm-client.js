/**
 * LlmClient —— LLM 调用客户端（从 services/api tuition llm.service.ts 平移）。
 * 与旧版差异：配置不再硬读 loadConfig().llm，而是经 model-router 注入的 resolveConfig(routeKey)，
 * 每轮调用实时解析 —— 大模型切换写表即对下一轮生效，无需重启。
 *
 * 契约：
 *   - Real key（nvapi-）→ 直调 OpenAI 兼容 chat/completions + multimodal。
 *   - 无/非 nvapi- → isRealKey()=false，调用方走本地降级（AgentCore 默认策略 / mock）。
 *   - **cli 路由**（resolve 回 cliBackend / provider='cli'）→ 不 POST，改调注入的 CliBackendRegistry
 *     （B-3a）执行外部 CLI agent，取其 `text` 当 content（B-3b「换脑子」）。未注入 registry → 明确抛错。
 *   - 429 指数退避、AbortController 超时、content||reasoning_content||reasoning 兜底、3 层 JSON 解析。
 */

/** @typedef {{role:string, content:string}} LlmMessage */

export class LlmClient {
  /**
   * @param {Function} resolveConfig async (routeKey, opts:{multimodal?:boolean}) => {apiKey,provider,model,multimodalModel,baseUrl,cliBackend?}
   * @param {{run: (id: string, opts: {prompt: string, cwd?: string, timeoutMs?: number}) => Promise<{text: string, error?: string|null, timedOut?: boolean}>}} [cliBackends]
   *        可空：外部 CLI 后端注册表（B-3a CliBackendRegistry）。缺省 → cli 路由无后端可用 → 明确抛错（不静默降级）。
   */
  constructor(resolveConfig, cliBackends = null) {
    this._resolveConfig = resolveConfig;
    this.cliBackends = cliBackends || null;
  }

  async _cfg(routeKey, multimodal) {
    return this._resolveConfig(routeKey == null ? 'default' : String(routeKey), { multimodal: !!multimodal });
  }

  /** @param {string} [routeKey] */
  async isRealKey(routeKey) {
    const cfg = await this._cfg(routeKey, false);
    if (cfg.cliBackend || cfg.provider === 'cli') return true; // CLI 路由：由路由行显式开启 → 视为真（不落 mock）
    return !!cfg.apiKey && cfg.apiKey.startsWith('nvapi-');
  }

  /**
   * 结构化 LLM 调用。返回 {content, usage, toolCalls}；失败抛错（调用方 mock 兜底）。
   * cli 路由 → 走 CliBackendRegistry（不 POST）。
   * @param {LlmMessage[]} messages
   * @param {string} [routeKey]
   * @param {object} [opts] {temperature,max_tokens,timeoutMs,maxRetries,baseDelayMs,tools,cwd}
   *   tools: OpenAI 兼容 function 定义数组，缺省不传（纯对话）；cli 分支忽略（外部 agent 自带工具）。
   */
  async chat(messages, routeKey = 'default', opts = {}) {
    const cfg = await this._cfg(routeKey, false);
    if (cfg.cliBackend || cfg.provider === 'cli') {
      return this._chatViaCli(cfg, messages, opts); // 换脑子：外部 CLI 后端，不发 HTTP
    }
    const model = cfg.model;
    const payload = {
      model,
      messages,
      temperature: opts.temperature ?? 0.7,
      max_tokens: opts.max_tokens ?? 4096,
      stream: false,
    };
    if (opts.tools && Array.isArray(opts.tools) && opts.tools.length) payload.tools = opts.tools;
    return this._post(cfg, payload, opts);
  }

  /**
   * cli 路由分支（B-3b）：prompt 走 argv 数组（B-3a 已保 shell:false），绝不拼密钥/token。
   * prompt 口径：默认取**本轮 user message**（最后一条 role='user' 消息）；会话续接（resumeKey）留 B-3c。
   * 超时：opts.timeoutMs 显式传入，否则由 B-3a 用**后端默认** timeoutMs（claude-code 600s / codex 900s…）。
   * 失败语义（C5）：registry 未注入 / run 抛错 / timedOut / 空文本 → **一律明确抛错**（不静默返回空）。
   * @param {{cliBackend?:string|null, model:string}} cfg
   * @param {LlmMessage[]} messages
   * @param {object} opts
   */
  async _chatViaCli(cfg, messages, opts = {}) {
    const backendId = cfg.cliBackend || cfg.model;
    if (!this.cliBackends || typeof this.cliBackends.run !== 'function') {
      throw new Error(
        `CLI 路由已启用（backend='${backendId}'）但未注入 CliBackendRegistry —— 拒绝静默降级`,
      );
    }
    const prompt = this._promptFromMessages(messages);
    if (!prompt || !prompt.trim()) throw new Error(`CLI 后端 '${backendId}'：prompt 为空（无可发送的本轮输入）`);
    const runOpts = { prompt };
    if (opts.cwd != null) runOpts.cwd = opts.cwd;
    if (opts.timeoutMs != null) runOpts.timeoutMs = opts.timeoutMs; // 未传则用后端默认（B-3a）
    const res = await this.cliBackends.run(backendId, runOpts);
    if (!res || res.timedOut || res.error) {
      const why = (res && (res.error || (res.timedOut ? '超时' : null))) || '无结果';
      throw new Error(`CLI 后端 '${backendId}' 调用失败：${why}`);
    }
    const text = typeof res.text === 'string' ? res.text : '';
    if (!text.trim()) throw new Error(`CLI 后端 '${backendId}' 返回空文本 —— 拒绝静默返回空`);
    return { content: text, usage: null, toolCalls: null };
  }

  /** 从消息数组取「本轮 user message」（最后一条 role='user'）；回退最后一条内容。 */
  _promptFromMessages(messages) {
    const list = Array.isArray(messages) ? messages : [];
    for (let i = list.length - 1; i >= 0; i--) {
      const m = list[i];
      if (m && m.role === 'user' && typeof m.content === 'string' && m.content.trim()) return m.content;
    }
    const last = list[list.length - 1];
    return last && typeof last.content === 'string' ? last.content : '';
  }

  /**
   * 多模态调用（OCR 等）：base64 data-URL 图片 + 提示词。
   * 无 key → throw 'NO_LLM_KEY'（调用方回退 mock）。
   * @param {string} imageDataUrl
   * @param {string} text
   * @param {string} [routeKey]
   */
  async chatMultimodal(imageDataUrl, text, routeKey = 'default', opts = {}) {
    const cfg = await this._cfg(routeKey, true);
    if (!cfg.apiKey || !cfg.apiKey.startsWith('nvapi-')) throw new Error('NO_LLM_KEY');
    const payload = {
      model: cfg.multimodalModel || cfg.model,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image_url', image_url: { url: imageDataUrl } },
            { type: 'text', text },
          ],
        },
      ],
      temperature: 0.2,
      top_p: 0.95,
      max_tokens: opts.max_tokens ?? 4096,
      stream: false,
    };
    return this._post(cfg, payload, { ...opts, temperature: 0.2 });
  }

  /** 3 层 JSON 解析：直接 → 正则 `\{[\s\S]*\}` → null。 */
  parseJSON(rawContent) {
    if (!rawContent) return null;
    const s = String(rawContent).trim();
    try {
      return JSON.parse(s);
    } catch {
      const m = s.match(/\{[\s\S]*\}/);
      if (m) {
        try {
          return JSON.parse(m[0]);
        } catch {
          return null;
        }
      }
    }
    return null;
  }

  async _post(cfg, payload, opts = {}) {
    const { timeoutMs = 60000, maxRetries = 3, baseDelayMs = 1000 } = opts;
    let lastError;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const controller = new AbortController();
      const tid = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetch(cfg.baseUrl, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${cfg.apiKey}`,
            Accept: 'application/json',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });
        clearTimeout(tid);
        if (!response.ok) {
          const err = await response.text();
          if (response.status === 429 && attempt < maxRetries) {
            await new Promise((r) => setTimeout(r, baseDelayMs * 2 ** attempt));
            continue;
          }
          throw new Error(`LLM 调用失败：${response.status} - ${err}`);
        }
        const data = await response.json();
        const message = (data && data.choices && data.choices[0] && data.choices[0].message) || {};
        return {
          content: message.content || message.reasoning_content || message.reasoning || '{}',
          toolCalls: message.tool_calls || null, // OpenAI 兼容函数调用（tools 已传入时）
          usage: data && data.usage,
        };
      } catch (error) {
        clearTimeout(tid);
        if (error && error.name === 'AbortError') throw new Error(`LLM 请求超时（${timeoutMs}ms）`);
        lastError = error;
        if (attempt >= maxRetries) throw error;
      }
    }
    throw lastError;
  }

  /** 确定性答案校验（选择/填空/文本/essay），供本地降级路径与 teaching 工具复用。 */
  validateAnswer(question, studentAnswer) {
    if (!question) return { valid: false, correct: false, answer: '', explanation: '题目不存在', confidence: 0 };
    const correct = String(question.answer == null ? '' : question.answer).toLowerCase().trim();
    const raw = String(studentAnswer == null ? '' : studentAnswer).toLowerCase().trim();
    const text = raw
      .replace('我选择：', '')
      .replace('选择', '')
      .replace('答案是', '')
      .replace('答案：', '')
      .replace('选项', '')
      .trim();

    if (question.type === 'choice') {
      const sOpt = text.toUpperCase();
      const cOpt = correct.toUpperCase();
      const ok = sOpt === cOpt || text === cOpt || raw.includes(cOpt);
      return this._graded(ok, question);
    }

    if (question.type === 'fill' || question.type === 'text') {
      const sn = this.extractNumber(text);
      const cn = this.extractNumber(correct);
      if (sn !== null && cn !== null) {
        const ok = Math.abs(sn - cn) / (Math.abs(cn) + 0.001) < 0.01;
        return this._graded(ok, question);
      }
      const ns = this.normalizeText(text);
      const nc = this.normalizeText(correct);
      const ok = ns === nc || text.includes(correct) || correct.includes(text);
      return this._graded(ok, question);
    }

    if (question.type === 'essay') {
      return { valid: true, correct: true, correctAnswer: studentAnswer, explanation: '回答合理', confidence: 0.8 };
    }

    return { valid: false, correct: false, correctAnswer: question.answer, explanation: '答案格式不匹配', confidence: 0 };
  }

  _graded(ok, question) {
    return {
      valid: true,
      correct: ok,
      correctAnswer: question.answer,
      explanation: ok
        ? question.explanation ? `回答正确！${question.explanation}` : '回答正确！'
        : `正确答案是：${question.answer}. ${question.explanation || ''}`,
      confidence: 1.0,
    };
  }

  normalizeText(text) {
    if (!text) return '';
    return String(text)
      .toLowerCase()
      .replace(/\s+/g, '')
      .replace(/[,.!?;:，。！？；：]/g, '')
      .trim();
  }

  extractNumber(str) {
    if (!str) return null;
    const m = String(str).match(/-?\d+(\.\d+)?/);
    return m ? parseFloat(m[0]) : null;
  }
}