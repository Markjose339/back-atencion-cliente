import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'node:path';
import type { Server } from 'node:http';

const HTTP_REQUEST_TIMEOUT_MS = 2 * 60 * 60 * 1000; // 2h
const HTTP_HEADERS_TIMEOUT_MS = HTTP_REQUEST_TIMEOUT_MS + 5000;
const HTTP_KEEP_ALIVE_TIMEOUT_MS = 75 * 1000;

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.useWebSocketAdapter(new IoAdapter(app));
  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  );
  app.enableCors({
    origin: process.env.FRONTEND_URL,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Cookie'],
  });
  app.use(cookieParser());
  app.useStaticAssets(join(process.cwd(), 'uploads'), {
    prefix: '/uploads/',
  });

  await app.listen(process.env.PORT ?? 3000);

  const httpServer = app.getHttpServer() as Server;
  httpServer.requestTimeout = HTTP_REQUEST_TIMEOUT_MS;
  httpServer.headersTimeout = HTTP_HEADERS_TIMEOUT_MS;
  httpServer.keepAliveTimeout = HTTP_KEEP_ALIVE_TIMEOUT_MS;
}
bootstrap();
