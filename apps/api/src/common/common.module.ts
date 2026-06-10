import { Global, Module } from '@nestjs/common';
import { RateLimitService } from './rate-limit.service';
import { SignedUrlService } from './signed-url.service';

@Global()
@Module({
  providers: [RateLimitService, SignedUrlService],
  exports: [RateLimitService, SignedUrlService],
})
export class CommonModule {}
