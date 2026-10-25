/**
 * GRI API 配置装配（单库 gri 多 schema）。
 * 业务后端只连一个库：gri。身份域（auth schema）由 auth-center 独占读写，
 * 业务端仅读 identities（通过 @gri/jwt-verifier 的 external_id 定位 public.users.id）。
 */
export interface DbConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
}

export interface JwtVerifierConfig {
  issuer: string;
  publicKey: string;
  jwksUrl: string;
}

export interface LlmConfig {
  apiKey: string;
  apiUrl: string;
  model: string;
  provider: string;
  multimodalModel: string;
  /** LLM 单次调用超时（ms；env LLM_TIMEOUT_MS，默认 150000）。 */
  timeoutMs: number;
}

export interface IdentityBrokerConfig {
  /** auth-center 基址（容器内以服务名解析） */
  authCenterUrl: string;
  /** 服务间共享令牌：api 在 assertSiteOperator 后携带，直连 auth-center 身份目录 */
  serviceToken: string;
}

/**
 * 每用户大模型 api key 的凭据缝（B-1）主密钥配置。
 * masterKey 唯来源 env `AGENT_CRED_MASTER_KEY`（32 字节；base64/hex/32 字符原文均可）——
 * 宿主在这里读入后注入底座 makeCipher（底座自身不读 env，见 docs/AGENT_CREDENTIAL_SEAM.md C4）。
 */
export interface AgentCredConfig {
  /** 空串 = 未配置 → 凭据面关闭（行为与旧版一致）；非空但长度非法 → 启动 fail-fast。 */
  masterKey: string;
}

export interface RedisConfig {
  host: string;
  port: number;
  password: string;
  db: number;
}

export interface AppConfig {
  db: DbConfig;
  jwt: JwtVerifierConfig;
  llm: LlmConfig;
  identity: IdentityBrokerConfig;
  redis: RedisConfig;
  agentCred: AgentCredConfig;
}

export function loadConfig(): AppConfig {
  return {
    db: {
      host: process.env.DB_HOST ?? 'localhost',
      port: parseInt(process.env.DB_PORT ?? '5432', 10),
      database: process.env.DB_NAME ?? 'gri',
      user: process.env.DB_USER ?? 'postgres',
      password: process.env.DB_PASSWORD ?? 'postgres',
    },
    jwt: {
      issuer: process.env.JWT_ISSUER ?? 'gri-auth-center',
      // 生产注入 PEM（k8s secret）最健壮；否则走 JWKS 端点拉取
      publicKey: process.env.AUTH_PUBLIC_KEY ?? '',
      jwksUrl: process.env.AUTH_JWKS_URL ?? 'http://localhost:3004/auth/jwks',
    },
    llm: {
      apiKey: process.env.LLM_API_KEY ?? '',
      apiUrl: process.env.LLM_API_URL ?? 'https://integrate.api.nvidia.com/v1/chat/completions',
      // v4-flash-0731 于 2026-09-21 EOL，默认改后继 v4.1-flash（reasoning 模型，content 需 max_tokens 足量）
      model: process.env.LLM_MODEL ?? 'deepseek-ai/deepseek-v4.1-flash',
      provider: process.env.LLM_PROVIDER ?? 'nvidia',
      multimodalModel: process.env.LLM_MULTIMODAL_MODEL ?? 'nvidia/neva-22b',
      // LLM 单次调用超时：deepseek 等推理模型大 prompt 下 60s 默认会误杀（教师路曾 500/用户 499）；
      // 宿主 env 可配（底座不读 env 红线：config 是宿主侧）。150s < nginx /api 的 180s。
      timeoutMs: Number.parseInt(process.env.LLM_TIMEOUT_MS ?? '', 10) || 150000,
    },
    identity: {
      authCenterUrl: process.env.AUTH_CENTER_URL ?? 'http://auth-center:3004',
      serviceToken: process.env.AUTH_SERVICE_TOKEN ?? 'gri-service-token',
    },
    redis: {
      host: process.env.REDIS_HOST ?? 'localhost',
      port: parseInt(process.env.REDIS_PORT ?? '6379', 10),
      password: process.env.REDIS_PASSWORD ?? '',
      db: parseInt(process.env.REDIS_DB ?? '0', 10),
    },
    agentCred: {
      // 每用户 api key 的加密主密钥（B-1 凭据缝）。占位空 → 凭据面关闭（不回归旧行为）。
      masterKey: process.env.AGENT_CRED_MASTER_KEY ?? '',
    },
  };
}
