import { Module } from '@nestjs/common';
import { OrganizationModule } from '../organization/organization.module';
import { CommandService } from './command.service';
import { GeoController } from './geo.controller';
import { GeoService } from './geo.service';
import { TaxonomyController } from './taxonomy.controller';
import { TaxonomyService } from './taxonomy.service';

@Module({
  imports: [OrganizationModule],
  controllers: [TaxonomyController, GeoController],
  providers: [TaxonomyService, GeoService, CommandService],
  exports: [TaxonomyService, GeoService],
})
export class TaxonomyModule {}
