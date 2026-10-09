import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import { Identity } from '../users/identity.entity';
import { JwtIssuerService } from './jwt-issuer.service';
import { RefreshTokensService } from './refresh-tokens.service';

function makeIdentity(overrides: Partial<Identity> = {}): Identity {
  return {
    id: 'identity-1',
    domain: 'core',
    username: 'alice',
    email: 'alice@example.com',
    phone: null,
    passwordHash: null,
    name: 'Alice',
    externalId: '11111111-1111-1111-1111-111111111111',
    status: 'active',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

describe('AuthService.changePassword', () => {
  let svc: AuthService;
  let users: {
    findById: jest.Mock;
    updatePasswordHash: jest.Mock;
  };
  let jwtIssuer: {
    verifyAccess: jest.Mock;
  };
  let refreshTokens: {
    revokeAllForIdentity: jest.Mock;
  };

  beforeEach(() => {
    users = {
      findById: jest.fn(),
      updatePasswordHash: jest.fn().mockResolvedValue(undefined),
    };
    jwtIssuer = {
      verifyAccess: jest.fn().mockReturnValue({ sub: 'identity-1' }),
    };
    refreshTokens = {
      revokeAllForIdentity: jest.fn().mockResolvedValue(undefined),
    };
    svc = new AuthService(
      users as unknown as UsersService,
      jwtIssuer as unknown as JwtIssuerService,
      refreshTokens as unknown as RefreshTokensService,
    );
  });

  it('无/坏 Bearer token → 401，且不写密码/不吊销 refresh token', async () => {
    jwtIssuer.verifyAccess.mockImplementation(() => {
      throw new Error('bad token');
    });

    await expect(svc.changePassword('bad-token', 'old-password', 'new-password')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(users.updatePasswordHash).not.toHaveBeenCalled();
    expect(refreshTokens.revokeAllForIdentity).not.toHaveBeenCalled();
  });

  it('身份已停用 → 401，且不写密码/不吊销 refresh token', async () => {
    users.findById.mockResolvedValue(
      makeIdentity({ status: 'disabled', passwordHash: await bcrypt.hash('old-password', 4) }),
    );

    await expect(svc.changePassword('valid-token', 'old-password', 'new-password')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(users.updatePasswordHash).not.toHaveBeenCalled();
    expect(refreshTokens.revokeAllForIdentity).not.toHaveBeenCalled();
  });

  it('无密码身份 → 400，且不写密码/不吊销 refresh token', async () => {
    users.findById.mockResolvedValue(makeIdentity({ passwordHash: null }));

    await expect(svc.changePassword('valid-token', 'old-password', 'new-password')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(users.updatePasswordHash).not.toHaveBeenCalled();
    expect(refreshTokens.revokeAllForIdentity).not.toHaveBeenCalled();
  });

  it('新旧密码相同 → 400，且不写密码/不吊销 refresh token', async () => {
    users.findById.mockResolvedValue(
      makeIdentity({ passwordHash: await bcrypt.hash('same-password', 4) }),
    );

    await expect(svc.changePassword('valid-token', 'same-password', 'same-password')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(users.updatePasswordHash).not.toHaveBeenCalled();
    expect(refreshTokens.revokeAllForIdentity).not.toHaveBeenCalled();
  });

  it('旧密码错误 → 400，且不写密码/不吊销 refresh token', async () => {
    users.findById.mockResolvedValue(
      makeIdentity({ passwordHash: await bcrypt.hash('correct-password', 4) }),
    );

    await expect(svc.changePassword('valid-token', 'wrong-password', 'new-password')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(users.updatePasswordHash).not.toHaveBeenCalled();
    expect(refreshTokens.revokeAllForIdentity).not.toHaveBeenCalled();
  });

  it('旧密正确 → 更新 bcrypt hash，并吊销该身份全部 refresh token', async () => {
    const oldHash = await bcrypt.hash('old-password', 4);
    users.findById.mockResolvedValue(makeIdentity({ passwordHash: oldHash }));

    await expect(svc.changePassword('valid-token', 'old-password', 'new-password')).resolves.toEqual({
      message: 'Password updated',
    });

    expect(users.updatePasswordHash).toHaveBeenCalledTimes(1);
    const [identityId, newHash] = users.updatePasswordHash.mock.calls[0] as [string, string];
    expect(identityId).toBe('identity-1');
    expect(newHash).not.toBe('new-password');
    await expect(bcrypt.compare('new-password', newHash)).resolves.toBe(true);
    expect(refreshTokens.revokeAllForIdentity).toHaveBeenCalledWith('identity-1');
  });
});
