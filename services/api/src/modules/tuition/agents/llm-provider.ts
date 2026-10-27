import { loadConfig } from '../../../config/config';
import { DatabaseService } from '../../../database/database.service';
import { LlmClient, ModelRouter, storeFrom } from '@gri/agent-core';

/**
 * tuition 的 LLM 客户端装配（W2.4）。
 *
 * 归一结论：tuition 不再自持 LLM 客户端（原 555 行、与底座 `@gri/agent-core` 的 `LlmClient` 近乎重复）；
 * 一律注入底座 `LlmClient`，配置经 `ModelRouter` 逐轮实时解析（路由表 `agent.llm_routes` 优先、`loadConfig` 兜底）。
 * 本模块只负责「把底座客户端拧成 Nest provider」这一件事，**不再复制任何 LLM 调用实现** ——
 * 装配点见 `tuition.module`：以 `LlmClient` 本体为 DI token（`{ provide: LlmClient, useFactory: buildTuitionLlm }`）。
 */

/**
 * 宿主 LLM 单次调用超时（ms，env `LLM_TIMEOUT_MS`，默认 150000）。
 *
 * 为什么要显式传：底座 `LlmClient.chat` 缺省 **60s**，而 tuition 既有契约是宿主 `LLM_TIMEOUT_MS`
 * （默认 150s —— deepseek 等推理模型大 prompt 下 60s 会误杀）。故各 `chat` 调用点显式带上本值，
 * 保持逐字节等价；多模态沿用底座缺省 60s（原 tuition 多模态缺省亦为 60s，无需覆盖）。
 */
export function llmTimeoutMs(): number {
  return loadConfig().llm.timeoutMs;
}

/** 逐轮实时解析生效配置：路由优先、loadConfig 兜底；失败亦回退（与原 tuition LLM 客户端同口径）。 */
type TuitionLlmCfg = { apiKey: string; model: string; baseUrl: string; multimodalModel: string; provider: string };

/**
 * 造一个 tuition 用的底座 `LlmClient`。
 * @param db 有 db 才装 `ModelRouter`（读 `agent.llm_routes`）；无 db 时纯 env/loadConfig（纯客户端，可独立单测）。
 */
export function buildTuitionLlm(db?: DatabaseService): LlmClient {
  const llm = loadConfig().llm;
  const fallback: TuitionLlmCfg = {
    apiKey: llm.apiKey,
    model: llm.model,
    baseUrl: llm.apiUrl,
    multimodalModel: llm.multimodalModel,
    provider: llm.provider,
  };

  if (!db) return new LlmClient(async () => fallback);

  const router = new ModelRouter(storeFrom((text: string, params?: unknown[]) => db.query(text, params)));
  const resolve = async (): Promise<TuitionLlmCfg> => {
    try {
      const r = await router.resolve('default');
      return {
        apiKey: r.apiKey || fallback.apiKey,
        model: r.model || fallback.model,
        baseUrl: r.baseUrl || fallback.baseUrl,
        multimodalModel: r.multimodalModel || fallback.multimodalModel,
        provider: r.provider || fallback.provider,
      };
    } catch {
      return fallback;
    }
  };
  return new LlmClient(resolve);
}
