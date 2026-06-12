import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { TournamentsModule } from '../tournaments/tournaments.module';
import { DisputesController } from './disputes.controller';
import { MatchesController } from './matches.controller';
import { MatchesService } from './matches.service';
import { PublicRoundsController } from './public-rounds.controller';
import { RoundsAdminController } from './rounds-admin.controller';
import { RoundsService } from './rounds.service';
import { RoundsWorker } from './rounds.worker';
import { SnapshotService } from './snapshot.service';
import { TablesController } from './tables.controller';

@Module({
  imports: [AuthModule, TournamentsModule],
  controllers: [
    RoundsAdminController,
    MatchesController,
    DisputesController,
    PublicRoundsController,
    TablesController,
  ],
  providers: [SnapshotService, RoundsService, MatchesService, RoundsWorker],
  exports: [SnapshotService, RoundsService, MatchesService],
})
export class RoundsModule {}
