import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Tournament, TournamentRegistration } from '@prisma/client';
import { channels, events } from '@apptorneos/shared';
import { MailService } from '../mail/mail.service';
import { registrationConfirmedEmail } from '../mail/mail.templates';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeService } from '../realtime/realtime.service';
import type { RegisterForTournamentDto } from './registrations.dto';

@Injectable()
export class RegistrationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly realtime: RealtimeService,
    private readonly config: ConfigService
  ) {}

  /**
   * Free registration (SPEC §8.2). Runs in a transaction holding a row lock on
   * the tournament so concurrent registrations cannot exceed max_players.
   */
  async registerFree(
    tournament: Tournament,
    userId: number,
    dto: RegisterForTournamentDto
  ): Promise<TournamentRegistration> {
    if (tournament.status !== 'registration_open') {
      throw new UnprocessableEntityException('Las inscripciones no están abiertas.');
    }

    const registration = await this.prisma.$transaction(async (tx) => {
      // Row lock (SELECT ... FOR UPDATE) serializes capacity checks (SPEC §8.1).
      await tx.$queryRaw`SELECT id FROM tournaments WHERE id = ${tournament.id} FOR UPDATE`;

      const existing = await tx.tournamentRegistration.findUnique({
        where: { tournamentId_userId: { tournamentId: tournament.id, userId } },
      });
      if (existing) {
        throw new UnprocessableEntityException('Ya estás inscrito en este torneo.');
      }

      const occupied = await tx.tournamentRegistration.count({
        where: {
          tournamentId: tournament.id,
          status: { in: ['active', 'pending_payment'] },
        },
      });
      if (occupied >= tournament.maxPlayers) {
        throw new UnprocessableEntityException('Torneo lleno.');
      }

      return tx.tournamentRegistration.create({
        data: {
          tournamentId: tournament.id,
          userId,
          status: 'active',
          fullName: dto.fullName,
          tcgLiveUsername: dto.tcgLiveUsername,
          email: dto.email,
          phone: dto.phone ?? null,
        },
      });
    });

    // After commit: admin broadcast + queued confirmation email.
    await this.realtime.trigger(
      channels.tournamentAdmin(tournament.id),
      events.registrationCreated,
      {
        registration_id: registration.id,
        tournament_id: tournament.id,
        full_name: registration.fullName,
        status: registration.status,
      }
    );
    const appUrl = this.config.get<string>('APP_URL', 'http://localhost:4200');
    await this.mail.enqueue(
      registrationConfirmedEmail(
        registration.email,
        registration.fullName,
        tournament.name,
        tournament.startAt,
        `${appUrl}/torneo/${tournament.slug}`
      )
    );
    return registration;
  }

  /** Drop (SPEC §6.9): plays the current round, excluded from the next; seat NOT freed. */
  async drop(tournament: Tournament, userId: number): Promise<TournamentRegistration> {
    const registration = await this.prisma.tournamentRegistration.findUnique({
      where: { tournamentId_userId: { tournamentId: tournament.id, userId } },
    });
    if (!registration) {
      throw new NotFoundException('No estás inscrito en este torneo.');
    }
    if (registration.userId !== userId) {
      throw new ForbiddenException('Solo puedes darte de baja a ti mismo.');
    }
    if (registration.status !== 'active') {
      throw new UnprocessableEntityException('Tu inscripción no está activa.');
    }
    return this.prisma.tournamentRegistration.update({
      where: { id: registration.id },
      data: {
        status: 'dropped',
        droppedAt: new Date(),
        droppedAfterRoundId: tournament.currentRoundId,
      },
    });
  }

  async myRegistrations(userId: number) {
    return this.prisma.tournamentRegistration.findMany({
      where: { userId },
      orderBy: { registeredAt: 'desc' },
      include: { tournament: true },
    });
  }
}
