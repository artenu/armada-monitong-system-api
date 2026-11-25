import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module.js';
import { configureApp } from './setup-app.js';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  configureApp(app);
  app.enableShutdownHooks();

  const port = app.get(ConfigService).getOrThrow<number>('PORT');
  await app.listen(port);
  Logger.log(`Server berjalan di http://localhost:${port}/api/v1`, 'Bootstrap');
  Logger.log(
    `Dokumentasi API (Swagger): http://localhost:${port}/api/docs`,
    'Bootstrap',
  );
}
await bootstrap();
