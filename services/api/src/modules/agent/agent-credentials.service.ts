import { Injectable, Logger } from '@nestjs/common';
import { CredentialStore, makeCipher } from '@gri/agent-core';
import { loadConfig } from '../../config/config';
import { DatabaseService } from '../../database/database.service';

/** 主密钥字节数（AES-256）。 */
const KEY_BYTES = 32;

/**
 * 每用户大模型 api key 的凭据面装配（B-1 凭据缝的宿主侧）。
 *
 * 分层铁律（docs/AGENT_CREDENTIAL_SEAM.md C3/C4）：底座不读 env —— 本服务（宿主）从
 * `AGENT_CRED_MASTER_KEY` 读入主密钥 → `makeCipher` → 注入底座 `CredentialStore`。
 * 主密钥**不落库、不入 git、不入日志**。
 *
 * 配置语义：
 *   - 未配置（空）→ `store = null`：凭据面关闭，`api_key` 一律拒收；路由行为与今日完全一致（C9 零回归）。
 *   - 已配置但长度非法 → 构造期抛错 → **启动 fail-fast**（防"配错了却静默降级"）。
 */
@Injectable()
export class AgentCredentialsService {
  private readonly logger = new Logger(AgentCredentialsService.name);

  /** null = 未配置主密钥（凭据面关闭）。 */
  readonly store: CredentialStore | null;

  constructor(private readonly db: DatabaseService) {
    const raw = loadConfig().agentCred.masterKey;
    if (!raw) {
      this.store = null;
      this.logger.warn('AGENT_CRED_MASTER_KEY 未配置 → 每用户凭据面关闭（api_key 拒收；路由仍走 env 缺省）');
      return;
    }
    const key = parseMasterKey(raw); // 长度非法 → 抛（启动 fail-fast）
    this.store = new CredentialStore({
      cipher: makeCipher(key),
      query: (text: string, params?: unknown[]) => this.db.query(text, params),
    });
    this.logger.log('每用户凭据面已启用（agent.llm_credentials，AES-256-GCM）');
  }

  /** 是否已启用凭据面。 */
  get enabled(): boolean {
    return !!this.store;
  }
}

/**
 * 解析 env 主密钥为 32 字节 Buffer。接受三种写法（避免部署侧编码歧义）：
 *   - hex（64 字符）：`openssl rand -hex 32`
 *   - base64（44 字符，`openssl rand -base64 32`）
 *   - 32 字符原文（UTF-8 恰 32 字节）
 * 其它一律抛错（fail-fast）。错误信息**不含**密钥值本身。
 * @param {string} raw
 * @returns {Buffer}
 */
export function parseMasterKey(raw: string): Buffer {
  const s = String(raw ?? '').trim();
  let key: Buffer | null = null;
  if (/^[0-9a-fA-F]{64}$/.test(s)) {
    key = Buffer.from(s, 'hex');
  } else if (/^[A-Za-z0-9+/]{43}=$/.test(s) || /^[A-Za-z0-9+/]{42}[AEIMQUYcgkosw048]$/.test(s)) {
    key = Buffer.from(s, 'base64');
  } else {
    const utf8 = Buffer.from(s, 'utf8');
    if (utf8.length === KEY_BYTES) key = utf8;
  }
  if (!key || key.length !== KEY_BYTES) {
    throw new Error(
      `AGENT_CRED_MASTER_KEY 非法（需 ${KEY_BYTES} 字节：hex64 / base64 / 32 字符原文）——拒绝启动`,
    );
  }
  return key;
}
