import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { HttpExceptionFilter } from './common/http-exception.filter.js';
import { ResponseInterceptor } from './common/response.interceptor.js';
import { validationExceptionFactory } from './common/validation.js';
import { uploadDir } from './files/files.module.js';

/**
 * Konfigurasi HTTP global. Dipisah dari main.ts agar tes e2e memakai
 * konfigurasi yang persis sama dengan aplikasi sebenarnya.
 */
export const configureApp = (app: NestExpressApplication) => {
  const config = app.get(ConfigService);

  app.setGlobalPrefix('api/v1');
  app.use(
    helmet({
      // API mengembalikan JSON; CSP dimatikan agar Swagger UI tetap bisa tampil
      contentSecurityPolicy: false,
      crossOriginResourcePolicy: { policy: 'same-site' },
    }),
  );
  app.use(cookieParser());

  const origins = config
    .get<string>('CORS_ORIGINS', '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  app.enableCors({ origin: origins, credentials: true });

  app.useBodyParser('json', { limit: '2mb' });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      exceptionFactory: validationExceptionFactory,
    }),
  );
  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(new ResponseInterceptor(app.get(Reflector)));

  // Berkas unggahan disajikan statis (nama acak UUID) sesuai kontrak: /uploads/*
  app.useStaticAssets(uploadDir(config), {
    prefix: '/uploads/',
    index: false,
    dotfiles: 'deny',
    fallthrough: false,
  });

  const document = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle('Armada Monitoring System API')
      .setDescription(
        'Backend REST API GDS / Armada Monitoring System (Standar Artenu v2.3)',
      )
      .setVersion('1.0')
      .addBearerAuth()
      .build(),
  );
  SwaggerModule.setup('api/docs', app, document);
};
