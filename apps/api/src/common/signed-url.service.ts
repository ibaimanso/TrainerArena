import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'node:crypto';

/** HMAC-signed URLs with expiry (email verification, SPEC §13.1). */
@Injectable()
export class SignedUrlService {
  constructor(private readonly config: ConfigService) {}

  private key(): string {
    return this.config.get<string>('APP_KEY', 'insecure-app-key');
  }

  sign(payload: string, expiresAtUnix: number): string {
    return createHmac('sha256', this.key()).update(`${payload}:${expiresAtUnix}`).digest('hex');
  }

  verify(payload: string, expiresAtUnix: number, signature: string): boolean {
    if (!Number.isFinite(expiresAtUnix) || expiresAtUnix < Math.floor(Date.now() / 1000)) {
      return false;
    }
    const expected = this.sign(payload, expiresAtUnix);
    if (expected.length !== signature.length) return false;
    return timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  }
}
