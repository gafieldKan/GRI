import { LlmService } from './llm.service';
import { loadConfig } from '../../../config/config';

jest.mock('../../../config/config', () => ({
  loadConfig: jest.fn(),
}));

// @gri/agent-core 是 ESM，jest 不解析 node_modules export 语法（与本仓其它 @gri 消费方一致）。
// 本仓消费方不注入 db → router 为 null，ModelRouter/storeFrom 不被实例化，给最小桩即可。
jest.mock('@gri/agent-core', () => ({ ModelRouter: class {}, storeFrom: (q: unknown) => q }));
const mockLoadConfig = loadConfig as jest.Mock;

function mockCfg(over: { apiKey?: string; apiUrl?: string; multimodalModel?: string }) {
  mockLoadConfig.mockReturnValue({
    llm: {
      apiKey: over.apiKey ?? '',
      apiUrl: over.apiUrl ?? 'https://integrate.api.nvidia.com/v1/chat/completions',
      model: 'deepseek-ai/deepseek-v4-flash-0731',
      provider: 'nvidia',
      multimodalModel: over.multimodalModel ?? 'nvidia/neva-22b',
    },
  });
}

/** 构造一个真实 fetch 假的响应对象 */
function okResponse(json: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(json),
    json: async () => json,
  } as Response;
}

describe('LlmService', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    mockLoadConfig.mockReset();
  });

  describe('mock gate（isRealKey）', () => {
    it('无 key → false（mock gate）', () => {
      mockCfg({ apiKey: '' });
      const svc = new LlmService();
      expect(svc.isRealKey()).toBe(false);
    });

    it('非 nvapi- key → false（mock gate）', () => {
      mockCfg({ apiKey: 'sk-abc123' });
      const svc = new LlmService();
      expect(svc.isRealKey()).toBe(false);
    });

    it('nvapi- key → true（真实路径）', () => {
      mockCfg({ apiKey: 'nvapi-secret' });
      const svc = new LlmService();
      expect(svc.isRealKey()).toBe(true);
    });
  });

  describe('generateTeachingResponse（无 key 降级）', () => {
    it('无 key → 返回 null，不发起 fetch', async () => {
      mockCfg({ apiKey: '' });
      const svc = new LlmService();
      const fetchSpy = jest.spyOn(global, 'fetch');
      const res = await svc.generateTeachingResponse({ userMessage: '你好', phase: 'welcome' });
      expect(res).toBeNull();
      expect(fetchSpy).not.toHaveBeenCalled();
    });
  });

  describe('chatCompletion + _callLLMWithRetry', () => {
    it('正常返回 content，且 content/reasoning_content/reasoning 兜底取首个非空', async () => {
      mockCfg({ apiKey: 'nvapi-x' });
      const svc = new LlmService();
      const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue(
        okResponse({ choices: [{ message: { reasoning_content: '先推理（无 content）' } }] }),
      );
      const res = await svc.chatCompletion([{ role: 'user', content: 'hi' }]);
      expect(res.content).toBe('先推理（无 content）'); // content 空 → reasoning_content
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    it('429 → 指数退避重试后成功', async () => {
      mockCfg({ apiKey: 'nvapi-x' });
      const svc = new LlmService();
      jest
        .spyOn(global, 'fetch')
        .mockResolvedValueOnce(okResponse({}, 429))
        .mockResolvedValueOnce(okResponse({ choices: [{ message: { content: '重试成功' } }] }));
      const res = await svc.chatCompletion(
        [{ role: 'user', content: 'hi' }],
        { maxRetries: 2, baseDelayMs: 1 },
      );
      expect(res.content).toBe('重试成功');
    });
  });

  describe('_parseAnalysisJSON（3 层 JSON 解析）', () => {
    it('直接 JSON.parse', () => {
      mockCfg({ apiKey: '' });
      const svc = new LlmService();
      expect(svc._parseAnalysisJSON('{"phase":"teaching"}')).toEqual({ phase: 'teaching' });
    });

    it('正则提取包围文本中的 JSON', () => {
      mockCfg({ apiKey: '' });
      const svc = new LlmService();
      const raw = '好的，分析如下：\n```json\n{"intent":"answer","answerCorrect":true}\n```\n完毕';
      expect(svc._parseAnalysisJSON(raw)).toEqual({ intent: 'answer', answerCorrect: true });
    });

    it('非 JSON → null', () => {
      mockCfg({ apiKey: '' });
      const svc = new LlmService();
      expect(svc._parseAnalysisJSON(null)).toBeNull();
      expect(svc._parseAnalysisJSON('完全不是 JSON')).toBeNull();
    });
  });

  describe('validateAnswer', () => {
    it('选择题：匹配选项字母', () => {
      mockCfg({ apiKey: '' });
      const svc = new LlmService();
      const q = { type: 'choice', answer: 'A', explanation: '直角边' };
      expect(svc.validateAnswer(q, 'A').correct).toBe(true);
      expect(svc.validateAnswer(q, 'B').correct).toBe(false);
    });

    it('数值题：1% 容差', () => {
      mockCfg({ apiKey: '' });
      const svc = new LlmService();
      expect(svc.validateAnswer({ type: 'fill', answer: '3' }, '3').correct).toBe(true);
      expect(svc.validateAnswer({ type: 'fill', answer: '3' }, '3.01').correct).toBe(true);
      expect(svc.validateAnswer({ type: 'fill', answer: '3' }, '5').correct).toBe(false);
    });

    it('text：文本标准化匹配', () => {
      mockCfg({ apiKey: '' });
      const svc = new LlmService();
      expect(svc.validateAnswer({ type: 'text', answer: 'a的平方', explanation: 'ok' }, 'a的平方').correct).toBe(true);
      expect(svc.validateAnswer({ type: 'text', answer: 'x=2', explanation: '' }, '其他答案').correct).toBe(false);
    });

    it('空题目 → 不合规', () => {
      mockCfg({ apiKey: '' });
      const svc = new LlmService();
      expect(svc.validateAnswer(null, 'A')).toMatchObject({ valid: false });
    });
  });

  describe('chatCompletionMultimodal（无 key 抛错）', () => {
    it('无 key → 抛 NO_LLM_KEY', async () => {
      mockCfg({ apiKey: '' });
      const svc = new LlmService();
      await expect(svc.chatCompletionMultimodal('data:image/png;base64,abc', '识别')).rejects.toThrow('NO_LLM_KEY');
    });
  });
});