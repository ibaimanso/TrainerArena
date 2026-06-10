import { Global, Module } from '@nestjs/common';
import { BroadcastingController } from './broadcasting.controller';
import { RealtimeService } from './realtime.service';

@Global()
@Module({
  controllers: [BroadcastingController],
  providers: [RealtimeService],
  exports: [RealtimeService],
})
export class RealtimeModule {}
