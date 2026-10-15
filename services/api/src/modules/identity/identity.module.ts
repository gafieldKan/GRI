import { Module } from '@nestjs/common';
import { IdentityController } from './identity.controller';
import { OrganizationModule } from '../organization/organization.module';
import { IdentityCoreModule } from './identity-core.module';

@Module({
  imports: [IdentityCoreModule, OrganizationModule],
  controllers: [IdentityController],
  exports: [IdentityCoreModule],
})
export class IdentityModule {}
