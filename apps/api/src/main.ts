import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';

async function bootstrap() {
  if ((process.env.JWT_SECRET ?? '').length < 16)
    throw new Error('Set JWT_SECRET (at least 16 characters): it signs the PIN login sessions.');
  if (process.env.AUTH_MODE === 'dev' && process.env.NODE_ENV === 'production')
    throw new Error('AUTH_MODE=dev is for development only.');
  // rawBody: webhook signatures are checked over the exact bytes received.
  const app = await NestFactory.create(AppModule, { rawBody: true });
  app.setGlobalPrefix('api', { exclude: ['hooks/{*path}'] });
  app.enableShutdownHooks();
  const port = Number(process.env.API_PORT ?? 3000);
  await app.listen(port);
  console.log(`PlateGuard API on http://localhost:${port}/api`);
}

void bootstrap();
