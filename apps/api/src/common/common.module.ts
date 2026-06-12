import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuthModule } from '../auth/auth.module';
import { PublicConfigController } from './public-config.controller';
import { RateLimitService } from './rate-limit.service';
import { RecaptchaGuard } from './recaptcha.guard';
import { SignedUrlService } from './signed-url.service';

@Global()
@Module({
  imports: [AuthModule],
  controllers: [PublicConfigController],
  providers: [
    RateLimitService,
    SignedUrlService,
    { provide: APP_GUARD, useClass: RecaptchaGuard },
  ],
  exports: [RateLimitService, SignedUrlService],
})
export class CommonModule {}
