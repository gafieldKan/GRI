import { Module } from '@nestjs/common';
import { DatabaseModule } from './database/database.module';
import { HealthModule } from './health/health.module';
import { IdentityModule } from './modules/identity/identity.module';
import { FoodModule } from './modules/food/food.module';
import { TuitionModule } from './modules/tuition/tuition.module';
import { OrganizationModule } from './modules/organization/organization.module';
import { OntologyModule } from './modules/ontology/ontology.module';
import { MasterDataModule } from './modules/master-data/master-data.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { AgentModule } from './modules/agent/agent.module';
import { CurriculumModule } from './modules/curriculum/curriculum.module';

/**
 * GRI API 根模块（M0 骨架 → M1 身份 → M2 订餐 → M3 学情 → M4 organization/ontology/master-data
 * → M5 dashboard/agent → K12 curriculum）。
 */
@Module({
  imports: [DatabaseModule, HealthModule, IdentityModule, FoodModule, TuitionModule, OrganizationModule, OntologyModule, MasterDataModule, CurriculumModule, DashboardModule, AgentModule],
})
export class AppModule {}
