import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { TournamentsAdminController } from './tournaments-admin.controller';
import { TournamentsPublicController } from './tournaments-public.controller';
import { TournamentsService } from './tournaments.service';

@Module({
  imports: [AuthModule],
  controllers: [TournamentsPublicController, TournamentsAdminController],
  providers: [TournamentsService],
  exports: [TournamentsService],
})
export class TournamentsModule {}
