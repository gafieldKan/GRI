import { Module } from '@nestjs/common';
import { IdentityService } from './identity.service';

/** 纯身份能力：供 world/organization/twin 等模块依赖，避免与 OrganizationModule 成环。 */
@Module({
  providers: [IdentityService],
  exports: [IdentityService],
})
export class IdentityCoreModule {}
