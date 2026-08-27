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
import {
  registrationConfirmedEmail,
  registrationPendingEmail,
  registrationRejectedEmail,
} from '../mail/mail.templates';
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
   * Registration (SPEC §8.2). Free → active right away. Paid → the seat is
   * reserved as pending_payment until the organizer confirms the personal
   * payment (Bizum, transfer…) from the admin waiting list. Runs in a
   * transaction holding a row lock on the tournament so concurrent
   * registrations cannot exceed max_players.
   */
  async register(
    tournament: Tournament,
    userId: number,
    dto: RegisterForTournamentDto
  ): Promise<TournamentRegistration> {
    if (tournament.status !== 'registration_open') {
      throw new UnprocessableEntityException('Las inscripciones no están abiertas.');
    }
    const isPaid = tournament.feeAmount > 0;

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
          status: isPaid ? 'pending_payment' : 'active',
          fullName: dto.fullName,
          tcgLiveUsername: dto.tcgLiveUsername,
          email: dto.email,
          phone: dto.phone ?? null,
        },
      });
    });

    // After commit: admin broadcast + queued email.
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
    const tournamentUrl = `${appUrl}/torneo/${tournament.slug}`;
    await this.mail.enqueue(
      isPaid
        ? registrationPendingEmail(
            registration.email,
            registration.fullName,
            tournament.name,
            tournament.feeAmount,
            tournament.feeCurrency,
            tournament.paymentInstructions,
            tournamentUrl
          )
        : registrationConfirmedEmail(
            registration.email,
            registration.fullName,
            tournament.name,
            tournament.startAt,
            tournamentUrl
          )
    );
    return registration;
  }

  /** Organizer confirms a personal payment: pending_payment → active. */
  async confirm(tournament: Tournament, registrationId: number): Promise<TournamentRegistration> {
    const registration = await this.pendingByIdOrFail(tournament, registrationId);
    const updated = await this.prisma.tournamentRegistration.update({
      where: { id: registration.id },
      data: { status: 'active' },
    });
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
    await this.realtime.trigger(
      channels.tournamentAdmin(tournament.id),
      events.registrationCreated,
      {
        registration_id: registration.id,
        tournament_id: tournament.id,
        full_name: registration.fullName,
        status: 'active',
      }
    );
    return updated;
  }

  /** Organizer rejects a pending request: the seat is freed. */
  async reject(tournament: Tournament, registrationId: number): Promise<void> {
    const registration = await this.pendingByIdOrFail(tournament, registrationId);
    await this.prisma.tournamentRegistration.delete({ where: { id: registration.id } });
    const appUrl = this.config.get<string>('APP_URL', 'http://localhost:4200');
    await this.mail.enqueue(
      registrationRejectedEmail(
        registration.email,
        registration.fullName,
        tournament.name,
        `${appUrl}/torneo/${tournament.slug}`
      )
    );
  }

  private async pendingByIdOrFail(
    tournament: Tournament,
    registrationId: number
  ): Promise<TournamentRegistration> {
    const registration = await this.prisma.tournamentRegistration.findUnique({
      where: { id: registrationId },
    });
    if (!registration || registration.tournamentId !== tournament.id) {
      throw new NotFoundException('Inscripción no encontrada.');
    }
    if (registration.status !== 'pending_payment') {
      throw new UnprocessableEntityException('La inscripción no está pendiente de confirmación.');
    }
    return registration;
  }

  /**
   * Second post-registration step: after submitting their decklist the player
   * confirms they will actually play. Both steps are required to be paired in
   * round 1 (players missing either are auto-dropped when R1 is generated).
   */
  async confirmParticipation(
    tournament: Tournament,
    userId: number
  ): Promise<TournamentRegistration> {
    const registration = await this.prisma.tournamentRegistration.findUnique({
      where: { tournamentId_userId: { tournamentId: tournament.id, userId } },
    });
    if (!registration) {
      throw new NotFoundException('No estás inscrito en este torneo.');
    }
    if (registration.status !== 'active') {
      throw new UnprocessableEntityException(
        registration.status === 'pending_payment'
          ? 'Tu inscripción sigue pendiente de pago: el organizador debe confirmarla antes.'
          : 'Tu inscripción no está activa.'
      );
    }
    if (registration.participationConfirmedAt !== null) {
      return registration; // idempotent: already confirmed
    }
    const rounds = await this.prisma.round.count({ where: { tournamentId: tournament.id } });
    if (rounds > 0) {
      throw new UnprocessableEntityException(
        'La primera ronda ya se ha generado: ya no es posible confirmar la participación.'
      );
    }
    const decklist = await this.prisma.decklist.findUnique({
      where: { tournamentId_userId: { tournamentId: tournament.id, userId } },
      select: { id: true },
    });
    if (!decklist) {
      throw new UnprocessableEntityException(
        'Antes de confirmar tu participación debes enviar tu decklist.'
      );
    }
    return this.prisma.tournamentRegistration.update({
      where: { id: registration.id },
      data: { participationConfirmedAt: new Date() },
    });
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
    // A pending (unconfirmed) request is simply withdrawn: the seat is freed.
    if (registration.status === 'pending_payment') {
      await this.prisma.tournamentRegistration.delete({ where: { id: registration.id } });
      return { ...registration, status: 'dropped' };
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
