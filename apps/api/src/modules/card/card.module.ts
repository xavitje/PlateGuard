import { Module } from '@nestjs/common';
import { CardController, PublicCardController } from './card.controller.js';
import { CardRepository } from './card.repository.js';
import { CardService } from './card.service.js';

@Module({
  controllers: [CardController, PublicCardController],
  providers: [CardService, CardRepository],
})
export class CardModule {}
