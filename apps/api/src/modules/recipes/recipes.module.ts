import { Module } from '@nestjs/common';
import { RecipesController } from './recipes.controller.js';
import { RecipesRepository } from './recipes.repository.js';
import { RecipesService } from './recipes.service.js';

@Module({
  controllers: [RecipesController],
  providers: [RecipesService, RecipesRepository],
})
export class RecipesModule {}
