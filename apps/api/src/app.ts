import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';

/**
 * Builds the API with every setting it needs, for both ways it runs: a long-lived server
 * (main.ts) and a Vercel function (serverless.ts).
 */
export async function createApp(): Promise<INestApplication> {
  if ((process.env.JWT_SECRET ?? '').length < 16)
    throw new Error('Set JWT_SECRET (at least 16 characters): it signs the PIN login sessions.');
  if (process.env.AUTH_MODE === 'dev' && process.env.NODE_ENV === 'production')
    throw new Error('AUTH_MODE=dev is for development only.');
  // rawBody: webhook signatures are checked over the exact bytes received.
  const app = await NestFactory.create(AppModule, { rawBody: true });
  app.setGlobalPrefix('api', { exclude: ['hooks/{*path}'] });
  return app;
}
