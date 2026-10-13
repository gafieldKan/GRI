import { Module } from '@nestjs/common';
import { OrganizationModule } from '../organization/organization.module';
import { ResourceController } from './resource.controller';
import { ResourceService } from './resource.service';

@Module({
  imports: [OrganizationModule],
  controllers: [ResourceController],
  providers: [ResourceService],
  exports: [ResourceService],
})
export class ResourceModule {}
