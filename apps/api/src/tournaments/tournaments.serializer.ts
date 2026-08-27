import type { LeagueMatchday, Tournament } from '@prisma/client';
import type { TournamentWithCounts } from './tournaments.service';

/** Public card/listing shape (no internal fields like pairingSeed). */
export interface PublicTournamentSummary {
  slug: string;
  publicId: string;
  name: string;
  startAt: string;
  status: string;
  format: string;
  showOpponentDecklists: boolean;
  maxPlayers: number;
  activeCount: number;
  feeAmount: number;
  feeCurrency: string;
  swissRounds: number;
  swissBo: number;
  topCutBo: number;
  topCutSize: number;
  roundTimeMinutes: number;
  checkinMinutes: number;
}

export function toPublicSummary(t: TournamentWithCounts): PublicTournamentSummary {
  return {
    slug: t.slug,
    publicId: t.publicId,
    name: t.name,
    startAt: t.startAt.toISOString(),
    status: t.status,
    format: t.format,
    showOpponentDecklists: t.showOpponentDecklists,
    maxPlayers: t.maxPlayers,
    activeCount: t.activeCount,
    feeAmount: t.feeAmount,
    feeCurrency: t.feeCurrency,
    swissRounds: t.swissRounds,
    swissBo: t.swissBo,
    topCutBo: t.topCutBo,
    topCutSize: t.topCutSize,
    roundTimeMinutes: t.roundTimeMinutes,
    checkinMinutes: t.checkinMinutes,
  };
}

export interface PublicMatchday {
  matchdayNumber: number;
  scheduledAt: string;
}

export interface PublicTournamentDetail extends PublicTournamentSummary {
  description: string | null;
  paymentInstructions: string | null;
  /** League only: scheduled matchday dates (empty for standard tournaments). */
  matchdays: PublicMatchday[];
}

export function toPublicDetail(
  t: Tournament,
  activeCount: number,
  matchdays: LeagueMatchday[] = []
): PublicTournamentDetail {
  return {
    ...toPublicSummary({ ...t, activeCount }),
    description: t.description,
    paymentInstructions: t.paymentInstructions,
    matchdays: matchdays.map((m) => ({
      matchdayNumber: m.matchdayNumber,
      scheduledAt: m.scheduledAt.toISOString(),
    })),
  };
}
