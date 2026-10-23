import { Module } from '@nestjs/common';
import { AgentService, AGENT_CLI_BACKENDS } from './agent.service';
import { AgentController } from './agent.controller';
import { AgentCredentialsService } from './agent-credentials.service';
import { AgentAdminRoutesController, AgentAdminToolRunsController, AgentAdminCapabilityController, AgentAdminOverviewController, AgentAdminClassDiagnosisController } from './agent-admin.controller';
import { AgentAdminMcpServersController } from './agent-admin-mcp.controller';
import { OrganizationModule } from '../organization/organization.module';
import { cliBackends } from '@gri/agent-core';

/**
 * Agent 域 —— 「每个学生一个独立 AI 教师」（@gri/agent-core 薄 Nest 绑定）。
 * 个人面：/api/agent/*     (鉴权强制，externalId 真源)
 * 管理面：/api/agent/admin/routes + /tool-runs + /mcp-servers + /capability  (大模型切换/MCP server/可观测/运营探询；仅站点运营 = 根组织 owner|admin)
 *
 * AgentCredentialsService：每用户 api key 的凭据面（B-1）。宿主在此读入 AGENT_CRED_MASTER_KEY
 * 并注入底座 CredentialStore（底座不读 env）；未配置 → 该面关闭，路由行为不变。
 *
 * AGENT_CLI_BACKENDS（B-3b「换脑子」）：注入进程级共享 cliBackends（B-3a 四内置外部 agent 后端）。
 * 注册表本身是**零成本**的声明式描述（不 spawn）；只有某 routeKey 存在 enabled 的 provider='cli'
 * 路由行时，LlmClient 才会真正 run 它。无 cli 行 → 从不被调用 → 行为与今日逐字节一致（零回归）。
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
  providers: [
    AgentService,
    AgentCredentialsService,
    // 外部 agent CLI 后端注册表（B-3b）：共享进程级 cliBackends；仅 cli 路由行存在时才被调用。
    { provide: AGENT_CLI_BACKENDS, useValue: cliBackends },
  ],
  exports: [AgentService, AgentCredentialsService],
})
export class AgentModule {}