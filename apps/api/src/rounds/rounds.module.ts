import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { TournamentsModule } from '../tournaments/tournaments.module';
import { DisputesController } from './disputes.controller';
import { MatchesController } from './matches.controller';
import { MatchesService } from './matches.service';
import { RoundsAdminController } from './rounds-admin.controller';
import { RoundsService } from './rounds.service';
import { RoundsWorker } from './rounds.worker';
import { SnapshotService } from './snapshot.service';

@Module({
  imports: [AuthModule, TournamentsModule],
  controllers: [RoundsAdminController, MatchesController, DisputesController],
  providers: [SnapshotService, RoundsService, MatchesService, RoundsWorker],
  exports: [SnapshotService, RoundsService, MatchesService],
})
export class RoundsModule {}
