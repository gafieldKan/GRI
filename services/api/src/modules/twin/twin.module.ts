import { Module } from '@nestjs/common';
import { TwinService } from './twin.service';
import { TwinController } from './twin.controller';
import { IdentityModule } from '../identity/identity.module';
import { TuitionModule } from '../tuition/tuition.module';
import { CurriculumModule } from '../curriculum/curriculum.module';
import { AgentModule } from '../agent/agent.module';

/**
 * Twin 域 —— 学生数字孪生（人本论）。装配既成真源（identity/tuition/curriculum/agent）
 * 为孪生五件：身份/状态/世界/经历/记忆；只新增「经历」落 twin.event（015 迁移）。
 */
@Module({
  imports: [IdentityModule, TuitionModule, CurriculumModule, AgentModule],
  controllers: [TwinController],
  providers: [TwinService],
  exports: [TwinService],
})
export class TwinModule {}
