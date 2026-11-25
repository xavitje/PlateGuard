import { Module } from '@nestjs/common';
import { RecipesController } from './recipes.controller.js';
import { MenuImportService } from './menu-import.service.js';
import { RecipesRepository } from './recipes.repository.js';
import { RecipesService } from './recipes.service.js';

@Module({
  controllers: [RecipesController],
  providers: [RecipesService, MenuImportService, RecipesRepository],
})
export class RecipesModule {}
