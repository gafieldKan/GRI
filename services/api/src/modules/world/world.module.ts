import { Module } from '@nestjs/common';
import { IdentityCoreModule } from '../identity/identity-core.module';
import { ActivationContextService } from './activation-context.service';
import { RedisModule } from './redis.module';
import { WorldController } from './world.controller';
import { WorldService } from './world.service';

@Module({
  imports: [IdentityCoreModule, RedisModule],
  controllers: [WorldController],
  providers: [WorldService, ActivationContextService],
  exports: [WorldService, ActivationContextService],
})
export class WorldModule {}
