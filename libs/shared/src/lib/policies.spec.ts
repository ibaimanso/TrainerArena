import {
  canActOnMatch,
  canApplyAsJudge,
  canAssignRole,
  canChatInJudgeCall,
  canCreateJudgeCall,
  canCreateTournament,
  canDecideJudgeApplication,
  canDrop,
  canEditDecklist,
  canManageTournament,
  canRegister,
  canResolveDispute,
  canResolveJudgeCall,
  canRevokeRole,
  canTakeJudgeCall,
  canViewDecklist,
  canViewJudgeCall,
  isTournamentAdmin,
  type PolicyJudgeCall,
  type PolicyMatch,
  type PolicyTournament,
  type PolicyUser,
} from './policies';

const user = (id: number, roles: PolicyUser['roles'] = ['player'], emailVerified = true): PolicyUser => ({
  id,
  roles,
  emailVerified,
});

const tournament = (over: Partial<PolicyTournament> = {}): PolicyTournament => ({
  id: 1,
  adminId: 10,
  status: 'registration_open',
  ...over,
});

const player = user(1);
const otherPlayer = user(2);
const tAdmin = user(10, ['admin', 'player']);
const otherAdmin = user(11, ['admin', 'player']);
const judgeUser = user(20, ['judge', 'player']);
const superadmin = user(99, ['superadmin']);

describe('tournament admin scope', () => {
  it('creator is tournament admin', () => {
    expect(isTournamentAdmin(tAdmin, tournament())).toBe(true);
  });
  it('another global admin is NOT tournament admin', () => {
    expect(isTournamentAdmin(otherAdmin, tournament())).toBe(false);
  });
  it('superadmin acts as admin of any tournament', () => {
    expect(isTournamentAdmin(superadmin, tournament())).toBe(true);
  });
});

describe('canCreateTournament', () => {
  it('allows admin role and superadmin, denies others', () => {
    expect(canCreateTournament(tAdmin)).toBe(true);
    expect(canCreateTournament(superadmin)).toBe(true);
    expect(canCreateTournament(player)).toBe(false);
    expect(canCreateTournament(judgeUser)).toBe(false);
  });
});

describe('canManageTournament', () => {
  it('only tournament admin and superadmin', () => {
    expect(canManageTournament(tAdmin, tournament())).toBe(true);
    expect(canManageTournament(superadmin, tournament())).toBe(true);
    expect(canManageTournament(otherAdmin, tournament())).toBe(false);
    expect(canManageTournament(player, tournament())).toBe(false);
  });
});

describe('canRegister', () => {
  const base = { tournament: tournament(), isFull: false, existingRegistration: null };

  it('verified user, open tournament, not full, not registered', () => {
    expect(canRegister(player, base)).toBe(true);
  });
  it('requires verified email', () => {
    expect(canRegister(user(1, ['player'], false), base)).toBe(false);
  });
  it('requires registration_open status', () => {
    for (const status of ['draft', 'registration_closed', 'in_progress', 'finished', 'cancelled'] as const) {
      expect(canRegister(player, { ...base, tournament: tournament({ status }) })).toBe(false);
    }
  });
  it('denies when full', () => {
    expect(canRegister(player, { ...base, isFull: true })).toBe(false);
  });
  it('an existing registration (even dropped) blocks re-registration', () => {
    expect(
      canRegister(player, {
        ...base,
        existingRegistration: { userId: 1, status: 'dropped' },
      })
    ).toBe(false);
  });
});

describe('canDrop', () => {
  it('only the player themself with an active registration', () => {
    expect(canDrop(player, { userId: 1, status: 'active' })).toBe(true);
    expect(canDrop(otherPlayer, { userId: 1, status: 'active' })).toBe(false);
    expect(canDrop(player, { userId: 1, status: 'dropped' })).toBe(false);
    expect(canDrop(player, { userId: 1, status: 'pending_payment' })).toBe(false);
  });
});

describe('canEditDecklist', () => {
  const reg = { userId: 1, status: 'active' as const };

  it('owner with active registration while registration_open/closed and not locked', () => {
    expect(canEditDecklist(player, { tournament: tournament(), registration: reg, decklist: null })).toBe(true);
    expect(
      canEditDecklist(player, {
        tournament: tournament({ status: 'registration_closed' }),
        registration: reg,
        decklist: { userId: 1, lockedAt: null },
      })
    ).toBe(true);
  });
  it('denies after lock', () => {
    expect(
      canEditDecklist(player, {
        tournament: tournament({ status: 'registration_closed' }),
        registration: reg,
        decklist: { userId: 1, lockedAt: '2026-01-01T00:00:00Z' },
      })
    ).toBe(false);
  });
  it('denies in draft / finished / cancelled', () => {
    for (const status of ['draft', 'finished', 'cancelled'] as const) {
      expect(
        canEditDecklist(player, { tournament: tournament({ status }), registration: reg, decklist: null })
      ).toBe(false);
    }
  });
  it('in_progress: allows only a late FIRST submission (decklist game-loss rule)', () => {
    expect(
      canEditDecklist(player, {
        tournament: tournament({ status: 'in_progress' }),
        registration: reg,
        decklist: null,
      })
    ).toBe(true);
    expect(
      canEditDecklist(player, {
        tournament: tournament({ status: 'in_progress' }),
        registration: reg,
        decklist: { userId: 1, lockedAt: null },
      })
    ).toBe(false);
  });
  it('denies without active registration', () => {
    expect(canEditDecklist(player, { tournament: tournament(), registration: null, decklist: null })).toBe(false);
    expect(
      canEditDecklist(player, {
        tournament: tournament(),
        registration: { userId: 1, status: 'dropped' },
        decklist: null,
      })
    ).toBe(false);
  });
  it("denies on someone else's decklist", () => {
    expect(
      canEditDecklist(otherPlayer, {
        tournament: tournament(),
        registration: { userId: 2, status: 'active' },
        decklist: { userId: 1, lockedAt: null },
      })
    ).toBe(false);
  });
});

describe('canViewDecklist', () => {
  const ctx = (viewerIsApprovedJudge = false) => ({
    tournament: tournament(),
    decklist: { userId: 1, lockedAt: null },
    isApprovedJudge: viewerIsApprovedJudge,
  });

  it('owner always; tournament admin; approved judge; superadmin', () => {
    expect(canViewDecklist(player, ctx())).toBe(true);
    expect(canViewDecklist(tAdmin, ctx())).toBe(true);
    expect(canViewDecklist(judgeUser, ctx(true))).toBe(true);
    expect(canViewDecklist(superadmin, ctx())).toBe(true);
  });
  it('never other players nor non-approved judges', () => {
    expect(canViewDecklist(otherPlayer, ctx())).toBe(false);
    expect(canViewDecklist(judgeUser, ctx(false))).toBe(false);
    expect(canViewDecklist(otherAdmin, ctx())).toBe(false);
  });
});

describe('canApplyAsJudge', () => {
  it('judge role, tournament alive, no previous application', () => {
    expect(canApplyAsJudge(judgeUser, { tournament: tournament(), existingApplication: null })).toBe(true);
    expect(canApplyAsJudge(player, { tournament: tournament(), existingApplication: null })).toBe(false);
    expect(
      canApplyAsJudge(judgeUser, { tournament: tournament({ status: 'finished' }), existingApplication: null })
    ).toBe(false);
    expect(
      canApplyAsJudge(judgeUser, { tournament: tournament({ status: 'cancelled' }), existingApplication: null })
    ).toBe(false);
    expect(
      canApplyAsJudge(judgeUser, { tournament: tournament(), existingApplication: { status: 'rejected' } })
    ).toBe(false);
  });
});

describe('canDecideJudgeApplication', () => {
  it('tournament admin/superadmin, only while pending', () => {
    expect(canDecideJudgeApplication(tAdmin, tournament(), { status: 'pending' })).toBe(true);
    expect(canDecideJudgeApplication(superadmin, tournament(), { status: 'pending' })).toBe(true);
    expect(canDecideJudgeApplication(otherAdmin, tournament(), { status: 'pending' })).toBe(false);
    expect(canDecideJudgeApplication(tAdmin, tournament(), { status: 'approved' })).toBe(false);
    expect(canDecideJudgeApplication(tAdmin, tournament(), { status: 'rejected' })).toBe(false);
  });
});

describe('match actions and judge calls', () => {
  const match: PolicyMatch = { playerAId: 1, playerBId: 2 };
  const byeMatch: PolicyMatch = { playerAId: 1, playerBId: null };

  it('check-in/report: only match players', () => {
    expect(canActOnMatch(player, match)).toBe(true);
    expect(canActOnMatch(otherPlayer, match)).toBe(true);
    expect(canActOnMatch(user(3), match)).toBe(false);
    expect(canActOnMatch(player, byeMatch)).toBe(true);
  });

  it('create judge call: only match players', () => {
    expect(canCreateJudgeCall(player, match)).toBe(true);
    expect(canCreateJudgeCall(user(3), match)).toBe(false);
  });

  const call = (over: Partial<PolicyJudgeCall> = {}): PolicyJudgeCall => ({
    createdById: 1,
    assignedJudgeId: null,
    status: 'open',
    ...over,
  });

  it('view call: creator, assigned judge, approved judge, admin, superadmin', () => {
    const base = { tournament: tournament(), isApprovedJudge: false };
    expect(canViewJudgeCall(player, { ...base, call: call() })).toBe(true);
    expect(canViewJudgeCall(judgeUser, { ...base, call: call({ assignedJudgeId: 20 }) })).toBe(true);
    expect(canViewJudgeCall(judgeUser, { tournament: tournament(), isApprovedJudge: true, call: call() })).toBe(true);
    expect(canViewJudgeCall(tAdmin, { ...base, call: call() })).toBe(true);
    expect(canViewJudgeCall(superadmin, { ...base, call: call() })).toBe(true);
    expect(canViewJudgeCall(otherPlayer, { ...base, call: call() })).toBe(false);
  });

  it('chat: only while not resolved', () => {
    const ctx = { tournament: tournament(), isApprovedJudge: false, call: call({ status: 'resolved' as const }) };
    expect(canChatInJudgeCall(player, ctx)).toBe(false);
    expect(canChatInJudgeCall(player, { ...ctx, call: call({ status: 'in_progress' }) })).toBe(true);
  });

  it('take: approved judge or admin, only while open; players never', () => {
    const base = { tournament: tournament(), isApprovedJudge: true };
    expect(canTakeJudgeCall(judgeUser, { ...base, call: call() })).toBe(true);
    expect(canTakeJudgeCall(judgeUser, { ...base, call: call({ status: 'in_progress' }) })).toBe(false);
    expect(canTakeJudgeCall(tAdmin, { tournament: tournament(), isApprovedJudge: false, call: call() })).toBe(true);
    expect(canTakeJudgeCall(player, { tournament: tournament(), isApprovedJudge: false, call: call() })).toBe(false);
  });

  it('resolve: assigned judge, approved judge, admin, superadmin — if not resolved', () => {
    const base = { tournament: tournament(), isApprovedJudge: false };
    expect(canResolveJudgeCall(judgeUser, { ...base, call: call({ assignedJudgeId: 20, status: 'in_progress' }) })).toBe(true);
    expect(canResolveJudgeCall(judgeUser, { tournament: tournament(), isApprovedJudge: true, call: call() })).toBe(true);
    expect(canResolveJudgeCall(tAdmin, { ...base, call: call() })).toBe(true);
    expect(canResolveJudgeCall(tAdmin, { ...base, call: call({ status: 'resolved' }) })).toBe(false);
    expect(canResolveJudgeCall(player, { ...base, call: call() })).toBe(false);
  });
});

describe('canResolveDispute', () => {
  const match: PolicyMatch = { playerAId: 1, playerBId: 2 };

  it('approved judge, admin, superadmin', () => {
    expect(canResolveDispute(judgeUser, { tournament: tournament(), match, isApprovedJudge: true })).toBe(true);
    expect(canResolveDispute(tAdmin, { tournament: tournament(), match, isApprovedJudge: false })).toBe(true);
    expect(canResolveDispute(superadmin, { tournament: tournament(), match, isApprovedJudge: false })).toBe(true);
  });
  it('never the match players, even if they are judges/admins', () => {
    const judgePlayingMatch = user(1, ['judge', 'player']);
    expect(canResolveDispute(judgePlayingMatch, { tournament: tournament(), match, isApprovedJudge: true })).toBe(false);
    const adminPlayingMatch = user(2, ['admin', 'player']);
    expect(
      canResolveDispute(adminPlayingMatch, { tournament: tournament({ adminId: 2 }), match, isApprovedJudge: false })
    ).toBe(false);
  });
  it('denies plain judges not approved for this tournament', () => {
    expect(canResolveDispute(judgeUser, { tournament: tournament(), match, isApprovedJudge: false })).toBe(false);
  });
});

describe('global role management', () => {
  it('assign: superadmin only, never self', () => {
    expect(canAssignRole(superadmin, 1)).toBe(true);
    expect(canAssignRole(superadmin, 99)).toBe(false);
    expect(canAssignRole(tAdmin, 1)).toBe(false);
  });
  it('revoke: superadmin, never self, only admin/judge', () => {
    expect(canRevokeRole(superadmin, 1, 'admin')).toBe(true);
    expect(canRevokeRole(superadmin, 1, 'judge')).toBe(true);
    expect(canRevokeRole(superadmin, 1, 'player')).toBe(false);
    expect(canRevokeRole(superadmin, 1, 'superadmin')).toBe(false);
    expect(canRevokeRole(superadmin, 99, 'admin')).toBe(false);
    expect(canRevokeRole(tAdmin, 1, 'admin')).toBe(false);
  });
});
