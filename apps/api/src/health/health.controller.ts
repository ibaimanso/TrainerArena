import { Controller, Get, Inject, Res } from '@nestjs/common';
import type { Response } from 'express';
import type Redis from 'ioredis';
import { PrismaService } from '../prisma/prisma.service';
import { REDIS } from '../redis/redis.module';

type CheckStatus = 'ok' | 'failed';

@Controller()
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS) private readonly redis: Redis
  ) {}

  /** Liveness probe. */
  @Get('health')
  health(): { status: 'ok'; time: string } {
    return { status: 'ok', time: new Date().toISOString() };
  }

  /** Readiness probe: database + cache; 503 if any check fails. */
  @Get('ready')
  async ready(@Res() res: Response): Promise<void> {
    const checks: { database: CheckStatus; cache: CheckStatus } = {
      database: 'ok',
      cache: 'ok',
    };

    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      checks.database = 'failed';
    }

    try {
      if (this.redis.status !== 'ready') {
        await this.redis.connect().catch(() => undefined);
      }
      const pong = await this.redis.ping();
      if (pong !== 'PONG') {
        checks.cache = 'failed';
      }
    } catch {
      checks.cache = 'failed';
    }

    const healthy = checks.database === 'ok' && checks.cache === 'ok';
    res.status(healthy ? 200 : 503).json({
      status: healthy ? 'ok' : 'unavailable',
      checks,
    });
  }
}
