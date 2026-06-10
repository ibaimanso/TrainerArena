/** Realtime channels and events (SPEC §11) as typed constants. */

export const channels = {
  publicTournament: (publicId: string) => `public.tournament.${publicId}`,
  tournamentPlayer: (tournamentId: number, userId: number) =>
    `private-tournament.${tournamentId}.player.${userId}`,
  tournamentJudges: (tournamentId: number) => `private-tournament.${tournamentId}.judges`,
  tournamentAdmin: (tournamentId: number) => `private-tournament.${tournamentId}.admin`,
  match: (matchId: number) => `private-match.${matchId}`,
  judgeCall: (callId: number) => `private-judge_call.${callId}`,
} as const;

export const events = {
  roundStarted: 'round.started',
  roundFinished: 'round.finished',
  pairingsPublished: 'pairings.published',
  standingsUpdated: 'standings.updated',
  tournamentFinished: 'tournament.finished',
  matchAwaitingConfirmation: 'match.awaiting_confirmation',
  matchFinished: 'match.finished',
  matchDisputed: 'match.disputed',
  matchForfeited: 'match.forfeited',
  registrationCreated: 'registration.created',
  judgeCallCreated: 'judge_call.created',
  judgeCallTaken: 'judge_call.taken',
  judgeCallMessage: 'judge_call.message',
  judgeCallResolved: 'judge_call.resolved',
} as const;
