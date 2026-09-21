import { Module } from '@nestjs/common';
import { AgentService } from './agent.service';
import { AgentController } from './agent.controller';
import { AgentAdminRoutesController, AgentAdminToolRunsController, AgentAdminCapabilityController, AgentAdminOverviewController, AgentAdminClassDiagnosisController } from './agent-admin.controller';
import { AgentAdminMcpServersController } from './agent-admin-mcp.controller';
import { OrganizationModule } from '../organization/organization.module';

/**
 * Agent 域 —— 「每个学生一个独立 AI 教师」（@gri/agent-core 薄 Nest 绑定）。
 * 个人面：/api/agent/*     (鉴权强制，externalId 真源)
 * 管理面：/api/agent/admin/routes + /tool-runs + /mcp-servers + /capability  (大模型切换/MCP server/可观测/运营探询；仅站点运营 = 根组织 owner|admin)
 */
@Module({
  imports: [OrganizationModule],
  controllers: [
    AgentController,
    AgentAdminRoutesController,
    AgentAdminToolRunsController,
    AgentAdminCapabilityController,
    AgentAdminOverviewController,
    AgentAdminClassDiagnosisController,
    AgentAdminMcpServersController,
  ],
  providers: [AgentService],
  exports: [AgentService],
})
export class AgentModule {}