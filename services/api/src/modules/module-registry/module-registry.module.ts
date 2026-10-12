import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module';
import { ModuleRegistryController } from './module-registry.controller';
import { ModuleRegistryService } from './module-registry.service';

@Module({
  imports: [IdentityModule],
  controllers: [ModuleRegistryController],
  providers: [ModuleRegistryService],
  exports: [ModuleRegistryService],
})
export class ModuleRegistryModule {}
