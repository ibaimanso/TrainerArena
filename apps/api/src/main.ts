import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import { AppModule } from './app/app.module';

async function bootstrap(): Promise<void> {
  // rawBody is required to verify the PayPal webhook signature (SPEC §8.5).
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    rawBody: true,
  });
  app.setGlobalPrefix('api', { exclude: ['health', 'ready'] });
  app.use(cookieParser());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
    })
  );
  const port = process.env.API_PORT || 3000;
  await app.listen(port);
  Logger.log(`🚀 API running on: http://localhost:${port}`);
}

bootstrap();
