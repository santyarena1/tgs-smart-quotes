import './load-env.js';
import 'reflect-metadata';
import {Logger} from '@nestjs/common';
import {NestFactory} from '@nestjs/core';
import {FastifyAdapter, NestFastifyApplication} from '@nestjs/platform-fastify';
import {DocumentBuilder, SwaggerModule} from '@nestjs/swagger';
import multipart from '@fastify/multipart';
import {AppModule} from './module.js';

async function bootstrap() {
  const adapter = new FastifyAdapter({logger: true});
  const app = await NestFactory.create<NestFastifyApplication>(AppModule, adapter, {
    bufferLogs: true,
  });
  await app.register(multipart, {
    limits: {fileSize: 2 * 1024 * 1024, files: 1},
  });
  const defaultOrigins = [
    'http://localhost:3000',
    'http://127.0.0.1:3000',
  ];
  const configured = (process.env.APP_ORIGIN ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const allowed = new Set([...defaultOrigins, ...configured]);
  app.enableCors({
    origin: (origin, cb) => {
      if (!origin || allowed.has(origin)) {
        cb(null, true);
        return;
      }
      // En desarrollo, permitir LAN local (ej. http://192.168.x.x:3000).
      if (
        process.env.NODE_ENV !== 'production' &&
        /^https?:\/\/(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+)(:\d+)?$/i.test(
          origin,
        )
      ) {
        cb(null, true);
        return;
      }
      cb(null, false);
    },
    credentials: true,
  });
  app.setGlobalPrefix('api');
  const cfg = new DocumentBuilder()
    .setTitle('The Gamer Shop API')
    .setVersion('1.0')
    .addCookieAuth('tgs_session')
    .build();
  SwaggerModule.setup('openapi', app, SwaggerModule.createDocument(app, cfg));
  await app.listen(Number(process.env.PORT ?? 3001), '::');
  Logger.log(
    JSON.stringify({event: 'api_started', port: Number(process.env.PORT ?? 3001)}),
    'Bootstrap',
  );
}

// Nunca silenciar un fallo de arranque: sin este log el proceso moría sin explicación.
bootstrap().catch((error: unknown) => {
  console.error(
    JSON.stringify({
      event: 'api_bootstrap_failed',
      error: error instanceof Error ? error.message : String(error),
    }),
  );
  if (error instanceof Error && error.stack) console.error(error.stack);
  process.exitCode = 1;
});
