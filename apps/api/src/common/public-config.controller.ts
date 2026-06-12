import { Controller, Get, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthGuard, Public } from '../auth/auth.guard';

/** Non-secret runtime config the SPA needs before logging in. */
@Controller('config')
@UseGuards(AuthGuard)
export class PublicConfigController {
  constructor(private readonly config: ConfigService) {}

  @Public()
  @Get()
  publicConfig(): { recaptchaSiteKey: string | null } {
    return {
      recaptchaSiteKey: this.config.get<string>('RECAPTCHA_SITE_KEY', '') || null,
    };
  }
}
