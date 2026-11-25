import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import type { AssessInput } from '@plateguard/domain';
import { ZodPipe } from '../../common/zod.pipe.js';
import { AssessRequestZ } from './assess.schema.js';
import { SafetyService } from './safety.service.js';

/** Presentation layer: validate, then hand over. No business rules, no database here. */
@Controller('safety')
export class SafetyController {
  constructor(private readonly safety: SafetyService) {}

  /** Runs the engine without storing anything; the stored decision comes with plate orders in phase 2. */
  @Post('assess/preview')
  @HttpCode(200)
  preview(@Body(new ZodPipe(AssessRequestZ)) input: AssessInput) {
    return this.safety.preview(input);
  }
}
