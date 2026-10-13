import { Controller, Get, Param } from '@nestjs/common';
import { GeoService } from './geo.service';

@Controller('geo')
export class GeoController {
  constructor(private readonly geoService: GeoService) {}

  @Get('regions/:countryId')
  regionSlice(@Param('countryId') countryId: string) {
    return this.geoService.getRegionSlice(countryId);
  }
}
