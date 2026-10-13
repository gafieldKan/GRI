import { Controller, Get, Param, Query } from '@nestjs/common';
import { TaxonomyService } from './taxonomy.service';

@Controller('taxonomy')
export class TaxonomyController {
  constructor(private readonly taxonomyService: TaxonomyService) {}

  @Get(':name/children')
  children(@Param('name') name: string, @Query('parent') parent?: string) {
    return this.taxonomyService.children(name, parent);
  }

  @Get(':name/node/:id')
  node(@Param('name') name: string, @Param('id') id: string) {
    return this.taxonomyService.getNode(name, id);
  }

  @Get(':name/search')
  search(
    @Param('name') name: string,
    @Query('q') q?: string,
    @Query('limit') limit?: string,
  ) {
    return this.taxonomyService.search(name, q, limit);
  }

  @Get(':name/path/:id')
  path(@Param('name') name: string, @Param('id') id: string) {
    return this.taxonomyService.path(name, id);
  }
}
