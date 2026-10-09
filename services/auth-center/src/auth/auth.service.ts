import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { UsersService } from '../users/users.service';
import { Identity } from '../users/identity.entity';
import { JwtIssuerService } from './jwt-issuer.service';
import { RefreshTokensService } from './refresh-tokens.service';

const BCRYPT_ROUNDS = 12;

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersService,
    private readonly jwtIssuer: JwtIssuerService,
    private readonly refreshTokens: RefreshTokensService,
  ) {}

  async login(identifier: string, password: string, device?: string): Promise<TokenPair & { user: Omit<Identity, 'passwordHash'> }> {
    // email 优先，其次 username
    let identity =
      (await this.users.findByEmail(identifier)) ??
      (await this.users.findByUsername(identifier));

    if (!identity) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // 已停用/注销身份不得登录（注销 = 先停凭证，安全优先）
    if (identity.status !== 'active') {
      throw new UnauthorizedException('账户不可用');
    }

    // 无密码身份（AI 学生）不能走密码登录
    if (!identity.passwordHash) {
      throw new UnauthorizedException('该账户无密码，请走对应登录方式');
    }

    // 惰性升级：若存的是明文（区别于 bcrypt $2b$ 前缀），登录成功后迁移为 bcrypt
    if (!identity.passwordHash.startsWith('$2')) {
      if (password !== identity.passwordHash) {
        throw new UnauthorizedException('Invalid credentials');
      }
      const hash = await bcrypt.hash(password, BCRYPT_ROUNDS);
      await this.users.updatePasswordHash(identity.id, hash);
    } else {
      const ok = await bcrypt.compare(password, identity.passwordHash);
      if (!ok) {
        throw new UnauthorizedException('Invalid credentials');
      }
    }

    return this.issueTokens(identity, device);
  }

  async register(dto: {
    username: string;
    email: string;
    password: string;
    name?: string;
  }): Promise<Omit<Identity, 'passwordHash'>> {
    const existing =
      (await this.users.findByEmail(dto.email)) ??
      (await this.users.findByUsername(dto.username));
    if (existing) {
      throw new ConflictException('账户已存在');
    }

    const hash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
    const identity = await this.users.create({
      domain: 'food',
      username: dto.username,
      email: dto.email,
      passwordHash: hash,
      name: dto.name ?? null,
    });
    const { passwordHash: _ph, ...user } = identity;
    return user;
  }

  async refresh(refreshToken: string, device?: string): Promise<TokenPair> {
    const identityId = await this.refreshTokens.validate(refreshToken);
    if (!identityId) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }
    const identity = await this.users.findById(identityId);
    if (!identity) {
      throw new UnauthorizedException('Identity not found');
    }
    if (identity.status !== 'active') {
      throw new UnauthorizedException('账户不可用');
    }

    const newRefresh = await this.refreshTokens.rotate(
      refreshToken,
      identityId,
      device,
    );
    const accessToken = this.jwtIssuer.signAccess(this.buildPayload(identity));

    return {
      accessToken,
      refreshToken: newRefresh,
      expiresIn: this.jwtAccessTtl(),
    };
  }

  async logout(refreshToken: string): Promise<void> {
    await this.refreshTokens.revoke(refreshToken);
  }

  async me(identityId: string): Promise<Identity | null> {
    return this.users.findById(identityId);
  }

  /** 从 Bearer token 校验并返回身份（供 /auth/me、业务后端校验复用） */
  async meFromBearer(bearer: string): Promise<Identity | null> {
    if (!bearer) return null;
    try {
      const payload = this.jwtIssuer.verifyAccess(bearer) as { sub: string };
      return await this.users.findById(payload.sub);
    } catch {
      return null;
    }
  }

  /**
   * 改密（需登录）。身份**从 token 解析**（meFromBearer），不接受外部传 identityId —— 防越权。
   * 校验旧密 → bcrypt 重哈希 → 更新 → 吊销全部 refresh token（改密即全端下线）。
   */
  async changePassword(
    bearer: string,
    oldPassword: string,
    newPassword: string,
  ): Promise<{ message: string }> {
    const identity = await this.meFromBearer(bearer);
    if (!identity) {
      throw new UnauthorizedException('Unauthorized');
    }
    if (identity.status !== 'active') {
      throw new UnauthorizedException('账户不可用');
    }
    if (!identity.passwordHash) {
      throw new BadRequestException('该账户无密码');
    }
    if (newPassword === oldPassword) {
      throw new BadRequestException('新密码不能与旧密码相同');
    }

    // 与 login 一致：兼容明文惰性升级
    const ok = identity.passwordHash.startsWith('$2')
      ? await bcrypt.compare(oldPassword, identity.passwordHash)
      : oldPassword === identity.passwordHash;
    if (!ok) {
      throw new BadRequestException('旧密码错误');
    }

    const hash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    await this.users.updatePasswordHash(identity.id, hash);
    await this.refreshTokens.revokeAllForIdentity(identity.id);
    return { message: 'Password updated' };
  }

  private async issueTokens(
    identity: Identity,
    device?: string,
  ): Promise<TokenPair & { user: Omit<Identity, 'passwordHash'> }> {
    const accessToken = this.jwtIssuer.signAccess(this.buildPayload(identity));
    const refreshToken = await this.refreshTokens.issue(identity.id, device);
    const { passwordHash: _ph, ...user } = identity;

    return {
      accessToken,
      refreshToken,
      expiresIn: this.jwtAccessTtl(),
      user,
    };
  }

  private buildPayload(identity: Identity) {
    return {
      sub: identity.id,
      domain: identity.domain,
      username: identity.username,
      name: identity.name,
      // 业务主键（原 users.id / students.id），后端校验后据此定位业务实体，保持无状态
      external_id: identity.externalId,
      roles: [],
    };
  }

  private jwtAccessTtl(): number {
    // 从 issuer 读取不便；直接返回环境或默认
    return parseInt(process.env.ACCESS_TOKEN_TTL ?? '900', 10);
  }
}