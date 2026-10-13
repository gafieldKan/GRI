import { Module } from '@nestjs/common';
import { GeoController } from './geo.controller';
import { GeoService } from './geo.service';
import { TaxonomyController } from './taxonomy.controller';
import { TaxonomyService } from './taxonomy.service';

@Module({
  controllers: [TaxonomyController, GeoController],
  providers: [TaxonomyService, GeoService],
  exports: [TaxonomyService, GeoService],
})
export class TaxonomyModule {}
