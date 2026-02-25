import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { NestExpressApplication } from '@nestjs/platform-express';
import type { NextFunction, Request, Response } from 'express';
import { join } from 'node:path';

const HTTP_REQUEST_TIMEOUT_MS = 2 * 60 * 60 * 1000;
const HTTP_HEADERS_TIMEOUT_MS = HTTP_REQUEST_TIMEOUT_MS + 5000;
const HTTP_KEEP_ALIVE_TIMEOUT_MS = 75 * 1000;

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const frontendOrigin = process.env.FRONTEND_ORIGIN ?? process.env.FRONTEND_URL;

  if (!frontendOrigin) {
    throw new Error(
      'Missing FRONTEND_ORIGIN environment variable for CORS configuration',
    );
  }

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
    origin: frontendOrigin,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Cookie'],
  });
  app.use(cookieParser());
  app.use((req: Request, res: Response, next: NextFunction) => {
    req.setTimeout(HTTP_REQUEST_TIMEOUT_MS);
    res.setTimeout(HTTP_REQUEST_TIMEOUT_MS);
    req.socket.setTimeout(HTTP_REQUEST_TIMEOUT_MS);
    next();
  });
  app.useStaticAssets(join(process.cwd(), 'uploads'), {
    prefix: '/uploads/',
  });

  await app.listen(process.env.PORT ?? 3000);

  const httpServer = app.getHttpServer();
  httpServer.setTimeout(HTTP_REQUEST_TIMEOUT_MS);
  httpServer.timeout = HTTP_REQUEST_TIMEOUT_MS;
  httpServer.requestTimeout = HTTP_REQUEST_TIMEOUT_MS;
  httpServer.headersTimeout = HTTP_HEADERS_TIMEOUT_MS;
  httpServer.keepAliveTimeout = HTTP_KEEP_ALIVE_TIMEOUT_MS;
}
void bootstrap();
