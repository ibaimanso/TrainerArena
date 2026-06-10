import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RoundsModule } from '../rounds/rounds.module';
import { JudgeCallsController } from './judge-calls.controller';
import { JudgeCallsService } from './judge-calls.service';

@Module({
  imports: [AuthModule, RoundsModule],
  controllers: [JudgeCallsController],
  providers: [JudgeCallsService],
  exports: [JudgeCallsService],
})
export class JudgesModule {}
