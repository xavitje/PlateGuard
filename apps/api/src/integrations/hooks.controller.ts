import { Controller, HttpCode, Param, Post, Req, type RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { HooksService } from './hooks.service.js';

/** One endpoint for every provider: no brand-specific routes in the presentation layer. */
@Controller('hooks')
export class HooksController {
  constructor(private readonly hooks: HooksService) {}

  /** Some tills (Mplus) put the event's name after the URL they were given. */
  @Post([':provider/:connectionId', ':provider/:connectionId/:event'])
  @HttpCode(200)
  receive(
    @Param('provider') provider: string,
    @Param('connectionId') connectionId: string,
    @Req() req: RawBodyRequest<Request>,
    @Param('event') event?: string,
  ) {
    return this.hooks.receive(provider, connectionId, {
      // Set from the URL only, never from what the sender put in its headers.
      headers: { ...req.headers, 'x-plateguard-event': event },
      body: req.rawBody ?? Buffer.alloc(0),
      ...(req.ip ? { ip: req.ip } : {}),
    });
  }
}
