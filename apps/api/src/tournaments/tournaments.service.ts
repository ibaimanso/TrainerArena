import {
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { Prisma, Tournament } from '@prisma/client';
import { randomBytes } from 'node:crypto';
import { ulid } from 'ulid';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateTournamentDto } from './tournaments.dto';

export type TournamentWithCounts = Tournament & { activeCount: number };

function slugify(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'torneo';
}

@Injectable()
export class TournamentsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Unique slug from the name (suffixes -2, -3… on collision). */
  private async uniqueSlug(name: string): Promise<string> {
    const base = slugify(name);
    let slug = base;
    for (let i = 2; ; i++) {
      const exists = await this.prisma.tournament.findUnique({ where: { slug } });
      if (!exists) return slug;
      slug = `${base}-${i}`;
    }
  }

  async create(adminId: number, dto: CreateTournamentDto): Promise<Tournament> {
    const startAt = new Date(dto.startAt);
    if (Number.isNaN(startAt.getTime()) || startAt <= new Date()) {
      throw new UnprocessableEntityException('La fecha de inicio debe ser futura.');
    }
    if (dto.feeAmount > 0 && !dto.paypalAccount) {
      throw new UnprocessableEntityException(
        'La cuenta de PayPal es obligatoria en torneos de pago.'
      );
    }
    return this.prisma.tournament.create({
      data: {
        publicId: ulid(),
        slug: await this.uniqueSlug(dto.name),
        adminId,
        name: dto.name,
        description: dto.description ?? null,
        startAt,
        status: 'draft',
        maxPlayers: dto.maxPlayers,
        swissRounds: dto.swissRounds,
        roundTimeMinutes: dto.roundTimeMinutes,
        checkinMinutes: dto.checkinMinutes,
        swissBo: dto.swissBo,
        topCutBo: dto.topCutBo,
        topCutSize: dto.topCutSize,
        feeAmount: dto.feeAmount,
        feeCurrency: 'EUR',
        paypalAccount: dto.feeAmount > 0 ? dto.paypalAccount : null,
        pairingSeed: randomBytes(16).toString('hex'), // 32 chars, fixed at creation
      },
    });
  }

  /** Tournament by slug, excluding soft-deleted. */
  async bySlug(slug: string): Promise<Tournament | null> {
    return this.prisma.tournament.findFirst({ where: { slug, deletedAt: null } });
  }

  async bySlugOrFail(slug: string): Promise<Tournament> {
    const tournament = await this.bySlug(slug);
    if (!tournament) throw new NotFoundException('Torneo no encontrado.');
    return tournament;
  }

  /** Public detail: drafts are a 404 (SPEC §12). */
  async publicBySlugOrFail(slug: string): Promise<Tournament> {
    const tournament = await this.bySlugOrFail(slug);
    if (tournament.status === 'draft') throw new NotFoundException('Torneo no encontrado.');
    return tournament;
  }

  /** Seats counted as active + pending_payment (a pending payment reserves the seat, SPEC §8.1). */
  async occupiedSeats(tournamentId: number): Promise<number> {
    return this.prisma.tournamentRegistration.count({
      where: { tournamentId, status: { in: ['active', 'pending_payment'] } },
    });
  }

  async activeSeats(tournamentId: number): Promise<number> {
    return this.prisma.tournamentRegistration.count({
      where: { tournamentId, status: 'active' },
    });
  }

  /** draft → registration_open (explicit admin action). */
  async openRegistration(tournament: Tournament): Promise<Tournament> {
    if (tournament.status !== 'draft') {
      throw new UnprocessableEntityException(
        'Solo se pueden abrir inscripciones de un torneo en borrador.'
      );
    }
    return this.prisma.tournament.update({
      where: { id: tournament.id },
      data: { status: 'registration_open' },
    });
  }

  /** registration_open → registration_closed (deliberate v1 fix 4.1). */
  async closeRegistration(tournament: Tournament): Promise<Tournament> {
    if (tournament.status !== 'registration_open') {
      throw new UnprocessableEntityException(
        'Solo se pueden cerrar inscripciones de un torneo con inscripciones abiertas.'
      );
    }
    return this.prisma.tournament.update({
      where: { id: tournament.id },
      data: { status: 'registration_closed' },
    });
  }

  /** registration_closed → registration_open (undo an accidental close). */
  async reopenRegistration(tournament: Tournament): Promise<Tournament> {
    if (tournament.status !== 'registration_closed') {
      throw new UnprocessableEntityException(
        'Solo se pueden reabrir inscripciones de un torneo con inscripciones cerradas.'
      );
    }
    const rounds = await this.prisma.round.count({ where: { tournamentId: tournament.id } });
    if (rounds > 0) {
      throw new UnprocessableEntityException(
        'No se pueden reabrir las inscripciones: ya se han generado rondas.'
      );
    }
    return this.prisma.tournament.update({
      where: { id: tournament.id },
      data: { status: 'registration_open' },
    });
  }

  /** Soft delete (deletedAt): the tournament disappears from every listing. */
  async softDelete(tournament: Tournament): Promise<void> {
    if (tournament.status === 'in_progress') {
      throw new UnprocessableEntityException(
        'No se puede eliminar un torneo en curso. Termínalo o cancélalo primero.'
      );
    }
    await this.prisma.tournament.update({
      where: { id: tournament.id },
      data: { deletedAt: new Date() },
    });
  }

  /** Landing data (SPEC §12): open, ongoing, last 10 finished. */
  async landing(): Promise<{
    open: TournamentWithCounts[];
    ongoing: TournamentWithCounts[];
    finished: TournamentWithCounts[];
  }> {
    const [open, ongoing, finished] = await Promise.all([
      this.prisma.tournament.findMany({
        where: { status: 'registration_open', deletedAt: null },
        orderBy: { startAt: 'asc' },
      }),
      this.prisma.tournament.findMany({
        where: { status: { in: ['registration_closed', 'in_progress'] }, deletedAt: null },
        orderBy: { startAt: 'asc' },
      }),
      this.prisma.tournament.findMany({
        where: { status: 'finished', deletedAt: null },
        orderBy: { startAt: 'desc' },
        take: 10,
      }),
    ]);
    const withCounts = async (list: Tournament[]): Promise<TournamentWithCounts[]> =>
      Promise.all(
        list.map(async (t) => ({ ...t, activeCount: await this.activeSeats(t.id) }))
      );
    return {
      open: await withCounts(open),
      ongoing: await withCounts(ongoing),
      finished: await withCounts(finished),
    };
  }

  async listByAdmin(adminId: number, isSuperadmin: boolean): Promise<TournamentWithCounts[]> {
    const where: Prisma.TournamentWhereInput = { deletedAt: null };
    if (!isSuperadmin) where.adminId = adminId;
    const list = await this.prisma.tournament.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });
    return Promise.all(list.map(async (t) => ({ ...t, activeCount: await this.activeSeats(t.id) })));
  }
}
