import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { CommonModule } from '../common/common.module';
import { HealthModule } from '../health/health.module';
import { MailModule } from '../mail/mail.module';
import { PrismaModule } from '../prisma/prisma.module';
import { QueuesModule } from '../queues/queues.module';
import { RedisModule } from '../redis/redis.module';
import { RolesModule } from '../roles/roles.module';
import { JudgesModule } from '../judges/judges.module';
import { RoundsModule } from '../rounds/rounds.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { RegistrationsModule } from '../registrations/registrations.module';
import { TournamentsModule } from '../tournaments/tournaments.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ['.env', '.env.local'] }),
    PrismaModule,
    RedisModule,
    QueuesModule,
    CommonModule,
    AuditModule,
    MailModule,
    HealthModule,
    RealtimeModule,
    AuthModule,
    RolesModule,
    TournamentsModule,
    // PaymentsModule (PayPal checkout) intentionally detached: paid tournaments
    // are confirmed manually by the organizer. Re-attach from tag v1.0-paypal.
    RegistrationsModule,
    RoundsModule,
    JudgesModule,
  ],
})
export class AppModule {}
