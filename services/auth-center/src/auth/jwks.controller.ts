import { Controller, Get } from '@nestjs/common';
import { JwtIssuerService } from './jwt-issuer.service';

/**
 * JWKS 端点：公开 RSA 公钥，业务后端（backend / ai-tutor-backend）据此离线校验 JWT。
 */
@Controller('auth')
export class JwksController {
  constructor(private readonly jwtIssuer: JwtIssuerService) {}

  @Get('jwks')
  jwks() {
    const jwk = this.jwtIssuer.getJwk();
    return { keys: [jwk] };
  }

  @Get('.well-known/jwks.json')
  wellKnown() {
    return this.jwks();
  }
}