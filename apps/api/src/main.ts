import { createApp } from './app.js';

async function bootstrap() {
  const app = await createApp();
  app.enableShutdownHooks();
  const port = Number(process.env.API_PORT ?? 3000);
  await app.listen(port);
  console.log(`PlateGuard API on http://localhost:${port}/api`);
}

void bootstrap();
