import type { IncomingMessage, ServerResponse } from 'node:http';
import { createApp } from './app.js';

type Handler = (req: IncomingMessage, res: ServerResponse) => void;

let handler: Promise<Handler> | undefined;

/**
 * Entry point for a Vercel function (api/index.js at the repository root). The Nest app is
 * built once per function instance and reused across requests, so only a cold start pays for
 * it. A failed start is not cached: the next request tries again.
 */
export default async function serverless(req: IncomingMessage, res: ServerResponse): Promise<void> {
  handler ??= createApp().then(async (app) => {
    await app.init();
    return app.getHttpAdapter().getInstance() as Handler;
  });
  try {
    (await handler)(req, res);
  } catch (err) {
    handler = undefined;
    throw err;
  }
}
