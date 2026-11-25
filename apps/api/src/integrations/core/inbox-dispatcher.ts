import { Injectable, Logger } from '@nestjs/common';

type Handler = (connectionId: string) => Promise<void>;

/**
 * Hands stored webhook messages to whoever handles them (the POS module), without the
 * integrations module knowing that module. On serverless there is no worker running between
 * requests, so the webhook request itself handles what it stored before it answers.
 */
@Injectable()
export class InboxDispatcher {
  private readonly log = new Logger(InboxDispatcher.name);
  private handler: Handler | null = null;

  handle(handler: Handler): void {
    this.handler = handler;
  }

  async dispatch(connectionId: string): Promise<void> {
    if (!this.handler) return;
    // A failure stays on the stored message; the POS still gets its 200.
    await this.handler(connectionId).catch((e: unknown) => this.log.warn(String(e)));
  }
}
