import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { RedisStore } from 'connect-redis';
import cookieParser from 'cookie-parser';
import type { NextFunction, Request, Response } from 'express';
import session from 'express-session';
import type Redis from 'ioredis';
import { AppModule } from './app/app.module';
import { csrfMiddleware, serverNowMiddleware } from './common/csrf.middleware';
import { REDIS } from './redis/redis.module';
import { createSessionStoreClient } from './redis/session-store.client';

async function bootstrap(): Promise<void> {
  // rawBody is required to verify the PayPal webhook signature (SPEC §8.5).
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    rawBody: true,
  });
  const isProduction = process.env.NODE_ENV === 'production';

  // Fail fast in production rather than silently falling back to the insecure
  // dev defaults — a missing secret here would break session/URL signing security.
  const sessionSecret = process.env.SESSION_SECRET;
  if (isProduction && (!sessionSecret || !process.env.APP_KEY)) {
    throw new Error(
      'SESSION_SECRET and APP_KEY are required in production (set them in .env).'
    );
  }

  app.setGlobalPrefix('api', { exclude: ['health', 'ready'] });
  app.set('trust proxy', 1);
  // Free graceful shutdown: on SIGTERM (docker stop) NestJS runs onApplicationShutdown
  // hooks so the BullMQ workers (mail/payments/rounds) drain instead of being killed.
  app.enableShutdownHooks();
  app.use(cookieParser());

  // Baseline security headers (Caddy already adds HSTS for the .app domain).
  app.use((_req: Request, res: Response, next: NextFunction) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('X-DNS-Prefetch-Control', 'off');
    next();
  });

  const redis = app.get<Redis>(REDIS);
  // The client is lazy (lazyConnect + enableOfflineQueue: false): connect now
  // so the first session/rate-limit command cannot fail while connecting.
  if (redis.status === 'wait') await redis.connect();
  app.use(
    session({
      store: new RedisStore({ client: createSessionStoreClient(redis), prefix: 'session:' }),
      name: process.env.SESSION_COOKIE_NAME || 'apptorneos_session',
      secret: sessionSecret || 'insecure-session-secret',
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        sameSite: 'lax',
        secure: isProduction,
        maxAge: 7 * 24 * 60 * 60 * 1000,
      },
    })
  );
  app.use(csrfMiddleware);
  app.use(serverNowMiddleware);

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
