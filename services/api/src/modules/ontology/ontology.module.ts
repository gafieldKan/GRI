import { Module } from '@nestjs/common';
import { OntologyRegistry } from './ontology.registry';
import { OntologyService } from './ontology.service';
import { OntologyController } from './ontology.controller';

@Module({
  controllers: [OntologyController],
  providers: [OntologyRegistry, OntologyService],
  exports: [OntologyService, OntologyRegistry],
})
export class OntologyModule {}