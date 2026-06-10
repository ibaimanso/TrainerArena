/** State machines and enums (SPEC §4). Values mirror the Prisma enums 1:1. */

export const TOURNAMENT_STATUSES = [
  'draft',
  'registration_open',
  'registration_closed',
  'in_progress',
  'finished',
  'cancelled',
] as const;
export type TournamentStatus = (typeof TOURNAMENT_STATUSES)[number];

export const REGISTRATION_STATUSES = ['pending_payment', 'active', 'dropped'] as const;
export type RegistrationStatus = (typeof REGISTRATION_STATUSES)[number];

export const JUDGE_APPLICATION_STATUSES = ['pending', 'approved', 'rejected'] as const;
export type JudgeApplicationStatus = (typeof JUDGE_APPLICATION_STATUSES)[number];

export const ROUND_PHASES = ['swiss', 'top_cut'] as const;
export type RoundPhase = (typeof ROUND_PHASES)[number];

export const ROUND_STATUSES = ['pending', 'active', 'finished'] as const;
export type RoundStatus = (typeof ROUND_STATUSES)[number];

export const MATCH_STATUSES = [
  'pending',
  'active',
  'awaiting_confirmation',
  'disputed',
  'finished',
  'bye',
  'forfeit_a',
  'forfeit_b',
  'forfeit_both',
] as const;
export type MatchStatus = (typeof MATCH_STATUSES)[number];

/** Terminal match states (SPEC §4). */
export const TERMINAL_MATCH_STATUSES: readonly MatchStatus[] = [
  'finished',
  'bye',
  'forfeit_a',
  'forfeit_b',
  'forfeit_both',
];

export const REPORT_RESULTS = ['win', 'loss', 'draw'] as const;
export type ReportResult = (typeof REPORT_RESULTS)[number];

export const MATCH_OUTCOMES = [
  'a_wins',
  'b_wins',
  'draw',
  'bye',
  'forfeit_a',
  'forfeit_b',
  'forfeit_both',
] as const;
export type MatchOutcome = (typeof MATCH_OUTCOMES)[number];

export const JUDGE_CALL_STATUSES = ['open', 'in_progress', 'resolved'] as const;
export type JudgeCallStatus = (typeof JUDGE_CALL_STATUSES)[number];

export const PAYMENT_STATUSES = [
  'created',
  'completed',
  'failed',
  'cancelled',
  'pending',
  'refunded',
] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const TOP_CUT_SIZES = [0, 4, 8, 16, 32, 64] as const;
export type TopCutSize = (typeof TOP_CUT_SIZES)[number];

export const BEST_OF_VALUES = [1, 3] as const;
export type BestOf = (typeof BEST_OF_VALUES)[number];
