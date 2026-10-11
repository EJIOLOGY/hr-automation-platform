import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    rawBody: true,
  });
  app.setGlobalPrefix('api/v1');

  // Amazon SNS delivers notifications with Content-Type: text/plain (the body is JSON text).
  // Without a text parser, req.body is empty and the SES events webhook can never verify a message.
  app.useBodyParser('text', { type: ['text/plain'], limit: '256kb' });

  app.use(helmet());
  app.use(cookieParser());

  app.enableCors({
    origin: process.env.DASHBOARD_ORIGIN ?? 'http://localhost:3001',
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  await app.listen(process.env.PORT ?? 3000);
}

bootstrap();
