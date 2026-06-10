import { HttpException, Inject, Injectable } from '@nestjs/common';
import type Redis from 'ioredis';
import { REDIS } from '../redis/redis.module';

/**
 * Redis-backed fixed-window rate limiter (SPEC §14):
 * login 5/min (email+IP) · password reset 3/h (IP) · report 10/min (user) ·
 * judge call 3/min (user) · create tournament 10/h (user). Responds 429.
 */
@Injectable()
export class RateLimitService {
  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  /** Throws 429 with a Spanish message when `max` hits are exceeded within `windowSeconds`. */
  async consume(key: string, max: number, windowSeconds: number): Promise<void> {
    let count: number;
    try {
      if (this.redis.status !== 'ready') await this.redis.connect().catch(() => undefined);
      const redisKey = `rate:${key}`;
      count = await this.redis.incr(redisKey);
      if (count === 1) {
        await this.redis.expire(redisKey, windowSeconds);
      }
    } catch {
      // Redis down: fail open (availability over throttling).
      return;
    }
    if (count > max) {
      throw new HttpException(
        { statusCode: 429, message: 'Demasiados intentos. Inténtalo de nuevo más tarde.' },
        429
      );
    }
  }
}
