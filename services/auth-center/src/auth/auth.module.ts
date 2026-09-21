import { Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module';
import { AuthController } from './auth.controller';
import { JwksController } from './jwks.controller';
import { AuthService } from './auth.service';
import { JwtIssuerService } from './jwt-issuer.service';
import { RefreshTokensService } from './refresh-tokens.service';

@Module({
  imports: [UsersModule],
  controllers: [AuthController, JwksController],
  providers: [AuthService, JwtIssuerService, RefreshTokensService],
  exports: [AuthService, JwtIssuerService],
})
export class AuthModule {}