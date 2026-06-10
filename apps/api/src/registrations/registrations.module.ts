import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DecklistsController } from '../decklists/decklists.controller';
import { JudgeApplicationsAdminController, JudgeApplicationsController } from '../judges/judge-applications.controller';
import { TournamentsModule } from '../tournaments/tournaments.module';
import { RegistrationsAdminController, RegistrationsController } from './registrations.controller';
import { RegistrationsService } from './registrations.service';

@Module({
  imports: [AuthModule, TournamentsModule],
  controllers: [
    RegistrationsController,
    RegistrationsAdminController,
    DecklistsController,
    JudgeApplicationsController,
    JudgeApplicationsAdminController,
  ],
  providers: [RegistrationsService],
  exports: [RegistrationsService],
})
export class RegistrationsModule {}
