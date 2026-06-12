import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
  SetMetadata,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';

export const RECAPTCHA_ACTION = 'recaptcha_action';

/** Marks an endpoint as protected by reCAPTCHA v3 with the given action name. */
export const Recaptcha = (action: string) => SetMetadata(RECAPTCHA_ACTION, action);

interface SiteVerifyResponse {
  success: boolean;
  score?: number;
  action?: string;
  'error-codes'?: string[];
}

/**
 * Global reCAPTCHA v3 guard. Endpoints opt in with @Recaptcha('action'); the
 * client sends the token in the X-Recaptcha-Token header. When
 * RECAPTCHA_SECRET_KEY is not configured (local dev), the guard is a no-op so
 * the app keeps working without Google keys.
 */
@Injectable()
export class RecaptchaGuard implements CanActivate {
  private readonly logger = new Logger(RecaptchaGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly config: ConfigService
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const action = this.reflector.getAllAndOverride<string | undefined>(RECAPTCHA_ACTION, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!action) return true;

    const secret = this.config.get<string>('RECAPTCHA_SECRET_KEY', '');
    if (!secret) return true; // not configured: disabled (dev)

    const request = context.switchToHttp().getRequest<Request>();
    const token = request.get('X-Recaptcha-Token');
    if (!token) {
      throw new ForbiddenException('No hemos podido verificar que no eres un robot. Recarga la página e inténtalo de nuevo.');
    }

    let result: SiteVerifyResponse;
    try {
      const res = await fetch('https://www.google.com/recaptcha/api/siteverify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ secret, response: token }).toString(),
      });
      result = (await res.json()) as SiteVerifyResponse;
    } catch (error) {
      // Google unreachable: fail open (availability over strictness) but log it.
      this.logger.warn(`reCAPTCHA verification unavailable: ${(error as Error).message}`);
      return true;
    }

    const minScore = Number(this.config.get<string>('RECAPTCHA_MIN_SCORE', '0.5'));
    const ok = result.success && result.action === action && (result.score ?? 0) >= minScore;
    if (!ok) {
      this.logger.warn(
        `reCAPTCHA rejected (action=${result.action ?? '?'} score=${result.score ?? '?'} errors=${result['error-codes']?.join(',') ?? '-'})`
      );
      throw new ForbiddenException('No hemos podido verificar que no eres un robot. Recarga la página e inténtalo de nuevo.');
    }
    return true;
  }
}
