import { Module } from '@nestjs/common';
import { DatabaseModule } from './database/database.module';
import { HealthModule } from './health/health.module';
import { IdentityModule } from './modules/identity/identity.module';
import { FoodModule } from './modules/food/food.module';
import { TuitionModule } from './modules/tuition/tuition.module';
import { OrganizationModule } from './modules/organization/organization.module';
import { OntologyModule } from './modules/ontology/ontology.module';
import { CurriculumModule } from './modules/curriculum/curriculum.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { AgentModule } from './modules/agent/agent.module';

/**
 * GRI API 根模块（M0 骨架 → M1 身份 → M2 订餐 → M3 学情 → M4 organization/ontology
 * → M5 dashboard/agent → K12 curriculum）。
 * master-data 门面已退役（前端零调用）：ontology.master_data 表降级为 k12 管线的
 * import 同源缓存（scripts/k12-curriculum/import.mjs 读写），不再有 API 面。
 */
@Module({
  imports: [DatabaseModule, HealthModule, IdentityModule, FoodModule, TuitionModule, OrganizationModule, OntologyModule, CurriculumModule, DashboardModule, AgentModule],
})
export class AppModule {}
