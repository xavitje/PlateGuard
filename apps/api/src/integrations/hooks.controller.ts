import { Controller, HttpCode, Param, Post, Req, type RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { HooksService } from './hooks.service.js';

/** One endpoint for every provider: no brand-specific routes in the presentation layer. */
@Controller('hooks')
export class HooksController {
  constructor(private readonly hooks: HooksService) {}

  @Post(':provider/:connectionId')
  @HttpCode(200)
  receive(
    @Param('provider') provider: string,
    @Param('connectionId') connectionId: string,
    @Req() req: RawBodyRequest<Request>,
  ) {
    return this.hooks.receive(provider, connectionId, {
      headers: req.headers,
      body: req.rawBody ?? Buffer.alloc(0),
      ...(req.ip ? { ip: req.ip } : {}),
    });
  }
}
