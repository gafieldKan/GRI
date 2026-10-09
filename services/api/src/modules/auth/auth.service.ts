import {
  Injectable,
  Logger,
  BadRequestException,
  BadGatewayException,
  ConflictException,
  HttpException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DatabaseService } from '../../database/database.service';
import { loadConfig } from '../../config/config';
import { RegisterDto } from './dto/register.dto';

/**
 * AuthService：auth-center 交互 + **注册编排**。
 * 签发/校验/密码逻辑仍在 auth-center；本服务负责「业务库先建人 → 以 uuid 作 external_id 建身份」。
 */
@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly identityCfg = loadConfig().identity;

  constructor(
    private readonly config: ConfigService,
    private readonly db: DatabaseService,
  ) {}

  /**
   * 获取 auth-center 基础 URL（支持 k8s service name / localhost / 环境变量）
   */
  getAuthCenterBase(): string {
    return this.config.get<string>('AUTH_CENTER_URL') ?? 'http://localhost:3004';
  }

  /**
   * 构建完整的 auth-center 端点 URL
   */
  buildAuthCenterUrl(path: string): string {
    return `${this.getAuthCenterBase()}${path}`;
  }

  /**
   * 注册编排（Saga）：
   *   1. 手工 fail-fast 校验入参；
   *   2. 业务库先建 `public.users`（拿到唯一业务主键 uuid）；
   *   3. 以 `external_id = 该 uuid` 调 auth-center 服务间写面 `/auth/admin/identities`（唯一映射点）；
   *   4. identity 建失败 → 补偿删除刚建的 `public.users` 行（保持无孤儿），再抛 409/502。
   *
   * 顺序不可颠倒：external_id 只能由业务库产生，故业务库先行。
   * 公开面永不接受外部传入的 externalId（防越权）。
   */
  async register(dto: RegisterDto): Promise<Record<string, unknown>> {
    this.validateRegister(dto);

    const username = dto.username.trim();
    const email = dto.email ? dto.email.trim().toLowerCase() : null;
    const phone = dto.phone ? dto.phone.trim() : null;
    const name = dto.name ? dto.name.trim() : null;

    // 2) 业务库建「人」
    let user: Record<string, unknown>;
    try {
      const ins = await this.db.query(
        `INSERT INTO public.users (username, email, phone, name, role, status)
         VALUES ($1, $2, $3, $4, 'consumer', 'active')
         RETURNING id, username, email, phone, name, role, status, created_at`,
        [username, email, phone, name],
      );
      user = ins.rows[0] as Record<string, unknown>;
    } catch (e) {
      // 23505 = unique_violation（public.users UNIQUE(username/email/phone)）
      if ((e as { code?: string })?.code === '23505') {
        throw new ConflictException('账户已存在');
      }
      throw e;
    }

    const userId = user.id as string;

    // 3) 以 users.id 作 external_id 建 auth-center 身份
    const created = await this.createAuthIdentity({
      domain: 'core',
      username,
      email,
      phone,
      password: dto.password,
      name,
      externalId: userId,
    });

    // 4) 失败补偿：删掉刚建的业务人档（新行无 FK 子行，硬删安全；best-effort 记日志）
    if (!created.ok) {
      await this.compensate(userId);
      throw created.error;
    }

    return user;
  }

  /**
   * 健康检查 auth-center 连通性（供 /health 聚合用）
   */
  async checkAuthCenterHealth(): Promise<{ reachable: boolean; latencyMs?: number }> {
    const base = this.getAuthCenterBase();
    const start = Date.now();
    try {
      const res = await fetch(`${base}/health`, { method: 'GET', signal: AbortSignal.timeout(2000) });
      return { reachable: res.ok, latencyMs: Date.now() - start };
    } catch {
      return { reachable: false };
    }
  }

  // ---------------------------------------------------------------------------
  // 私有：校验 / 服务间调用 / 补偿
  // ---------------------------------------------------------------------------

  /** 手工 fail-fast（api 侧未引入 class-validator）。 */
  private validateRegister(dto: RegisterDto): void {
    if (!dto || typeof dto.username !== 'string' || dto.username.trim().length < 3) {
      throw new BadRequestException('username 至少 3 个字符');
    }
    if (typeof dto.password !== 'string' || dto.password.length < 8) {
      throw new BadRequestException('password 至少 8 个字符');
    }
    if (dto.email !== undefined && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(dto.email))) {
      throw new BadRequestException('email 格式不正确');
    }
  }

  /** 调 auth-center 服务间写面建 identity（带 X-Service-Token）。 */
  private async createAuthIdentity(
    payload: Record<string, unknown>,
  ): Promise<{ ok: true } | { ok: false; error: HttpException }> {
    try {
      const res = await fetch(`${this.identityCfg.authCenterUrl}/auth/admin/identities`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-service-token': this.identityCfg.serviceToken,
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(5000),
      });
      if (res.status === 409) {
        return { ok: false, error: new ConflictException('账户已存在') };
      }
      if (!res.ok) {
        return { ok: false, error: new BadGatewayException('身份服务创建失败') };
      }
      return { ok: true };
    } catch {
      return { ok: false, error: new BadGatewayException('身份服务不可达') };
    }
  }

  /** 补偿：删除刚建的 public.users 行。 */
  private async compensate(userId: string): Promise<void> {
    try {
      await this.db.query('DELETE FROM public.users WHERE id = $1', [userId]);
    } catch (e) {
      this.logger.error(`注册补偿删除 public.users 失败 id=${userId}: ${(e as Error).message}`);
    }
  }
}
