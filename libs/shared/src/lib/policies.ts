/**
 * Authorization matrix (SPEC §2) as pure functions, shared between NestJS
 * guards, the private-channel auth endpoint and the Angular UI.
 *
 * Every rule checks the scope of the concrete tournament. The superadmin can
 * act as admin of any tournament in every check.
 */
import type {
  JudgeApplicationStatus,
  JudgeCallStatus,
  RegistrationStatus,
  TournamentStatus,
} from './enums';
import type { RoleName } from './roles';

// ---------- Context snapshots (plain data, no ORM types) ----------

export interface PolicyUser {
  id: number;
  roles: readonly RoleName[];
  emailVerified: boolean;
}

export interface PolicyTournament {
  id: number;
  adminId: number;
  status: TournamentStatus;
}

export interface PolicyRegistration {
  userId: number;
  status: RegistrationStatus;
}

export interface PolicyDecklist {
  userId: number;
  lockedAt: string | null;
}

export interface PolicyMatch {
  playerAId: number;
  playerBId: number | null;
}

export interface PolicyJudgeCall {
  createdById: number;
  assignedJudgeId: number | null;
  status: JudgeCallStatus;
}

export interface PolicyJudgeApplication {
  status: JudgeApplicationStatus;
}

// ---------- Role helpers ----------

export function hasRole(user: PolicyUser, role: RoleName): boolean {
  return user.roles.includes(role);
}

export function isSuperadmin(user: PolicyUser): boolean {
  return hasRole(user, 'superadmin');
}

/** Tournament admin = its creator; superadmin acts as admin of any tournament. */
export function isTournamentAdmin(user: PolicyUser, tournament: PolicyTournament): boolean {
  return isSuperadmin(user) || tournament.adminId === user.id;
}

// ---------- Tournament management ----------

/** Create tournament: global `admin` role (or superadmin). */
export function canCreateTournament(user: PolicyUser): boolean {
  return hasRole(user, 'admin') || isSuperadmin(user);
}

/** Configure / open registration / manage rounds / view registrations. */
export function canManageTournament(user: PolicyUser, tournament: PolicyTournament): boolean {
  return isTournamentAdmin(user, tournament);
}

// ---------- Registration ----------

export interface RegisterContext {
  tournament: PolicyTournament;
  /** active + pending_payment count vs max_players */
  isFull: boolean;
  /** any existing registration row (even dropped) blocks re-registration */
  existingRegistration: PolicyRegistration | null;
}

export function canRegister(user: PolicyUser, ctx: RegisterContext): boolean {
  return (
    user.emailVerified &&
    ctx.tournament.status === 'registration_open' &&
    !ctx.isFull &&
    ctx.existingRegistration === null
  );
}

/** Drop: only the player themself, on an active registration. */
export function canDrop(user: PolicyUser, registration: PolicyRegistration): boolean {
  return registration.userId === user.id && registration.status === 'active';
}

// ---------- Decklists ----------

export interface DecklistEditContext {
  tournament: PolicyTournament;
  registration: PolicyRegistration | null;
  decklist: PolicyDecklist | null; // null = not created yet
}

/** Create/edit own decklist before the lock (SPEC §9). */
export function canEditDecklist(user: PolicyUser, ctx: DecklistEditContext): boolean {
  if (ctx.decklist && ctx.decklist.userId !== user.id) return false;
  if (ctx.decklist && ctx.decklist.lockedAt !== null) return false;
  if (
    ctx.registration === null ||
    ctx.registration.userId !== user.id ||
    ctx.registration.status !== 'active'
  ) {
    return false;
  }
  if (
    ctx.tournament.status === 'registration_open' ||
    ctx.tournament.status === 'registration_closed'
  ) {
    return true;
  }
  // Late FIRST submission while in progress: allowed (the player keeps taking
  // round game losses until it lands, and it locks immediately on save).
  return ctx.tournament.status === 'in_progress' && ctx.decklist === null;
}

export interface DecklistViewContext {
  tournament: PolicyTournament;
  decklist: PolicyDecklist;
  isApprovedJudge: boolean;
  /** Tournament option: rivals may view locked decklists from the standings. */
  rivalsMayView?: boolean;
}

/**
 * Owner (always), tournament admin, approved judge, superadmin. Other players
 * only when the tournament enables it and the decklist is already locked
 * (never before round 1, so nobody scouts an editable list).
 */
export function canViewDecklist(user: PolicyUser, ctx: DecklistViewContext): boolean {
  if (ctx.decklist.userId === user.id) return true;
  if (isTournamentAdmin(user, ctx.tournament)) return true;
  if (ctx.isApprovedJudge) return true;
  return (
    ctx.rivalsMayView === true &&
    ctx.decklist.lockedAt !== null &&
    (ctx.tournament.status === 'in_progress' || ctx.tournament.status === 'finished')
  );
}

// ---------- Judge applications ----------

export interface JudgeApplyContext {
  tournament: PolicyTournament;
  existingApplication: PolicyJudgeApplication | null;
}

/** Apply as judge: global `judge` role, tournament not finished/cancelled, one per (tournament, user). */
export function canApplyAsJudge(user: PolicyUser, ctx: JudgeApplyContext): boolean {
  return (
    hasRole(user, 'judge') &&
    ctx.tournament.status !== 'finished' &&
    ctx.tournament.status !== 'cancelled' &&
    ctx.existingApplication === null
  );
}

/** Approve/reject: tournament admin or superadmin, only while pending. */
export function canDecideJudgeApplication(
  user: PolicyUser,
  tournament: PolicyTournament,
  application: PolicyJudgeApplication
): boolean {
  return isTournamentAdmin(user, tournament) && application.status === 'pending';
}

// ---------- Matches ----------

export function isMatchPlayer(user: PolicyUser, match: PolicyMatch): boolean {
  return match.playerAId === user.id || match.playerBId === user.id;
}

/** Check-in / report result: a player of the match. */
export function canActOnMatch(user: PolicyUser, match: PolicyMatch): boolean {
  return isMatchPlayer(user, match);
}

// ---------- Judge calls ----------

/** Call a judge: a player of the match. */
export function canCreateJudgeCall(user: PolicyUser, match: PolicyMatch): boolean {
  return isMatchPlayer(user, match);
}

export interface JudgeCallContext {
  tournament: PolicyTournament;
  call: PolicyJudgeCall;
  isApprovedJudge: boolean;
}

/** View call + read chat: creator, assigned judge, any approved judge, admin, superadmin. */
export function canViewJudgeCall(user: PolicyUser, ctx: JudgeCallContext): boolean {
  return (
    ctx.call.createdById === user.id ||
    ctx.call.assignedJudgeId === user.id ||
    ctx.isApprovedJudge ||
    isTournamentAdmin(user, ctx.tournament)
  );
}

/** Chat: same audience as view, but only while not resolved. */
export function canChatInJudgeCall(user: PolicyUser, ctx: JudgeCallContext): boolean {
  return ctx.call.status !== 'resolved' && canViewJudgeCall(user, ctx);
}

/** Take a call: approved judge or admin/superadmin, only while open. */
export function canTakeJudgeCall(user: PolicyUser, ctx: JudgeCallContext): boolean {
  return (
    ctx.call.status === 'open' &&
    (ctx.isApprovedJudge || isTournamentAdmin(user, ctx.tournament))
  );
}

/** Resolve: assigned judge, another approved judge, admin, superadmin — if not resolved. */
export function canResolveJudgeCall(user: PolicyUser, ctx: JudgeCallContext): boolean {
  return (
    ctx.call.status !== 'resolved' &&
    (ctx.call.assignedJudgeId === user.id ||
      ctx.isApprovedJudge ||
      isTournamentAdmin(user, ctx.tournament))
  );
}

// ---------- Disputes ----------

export interface DisputeContext {
  tournament: PolicyTournament;
  match: PolicyMatch;
  isApprovedJudge: boolean;
}

/** Resolve dispute: approved judge, admin, superadmin. Never the match players. */
export function canResolveDispute(user: PolicyUser, ctx: DisputeContext): boolean {
  if (isMatchPlayer(user, ctx.match)) return false;
  return ctx.isApprovedJudge || isTournamentAdmin(user, ctx.tournament);
}

// ---------- Global roles (superadmin) ----------

/** Assign roles: superadmin, never on their own account. */
export function canAssignRole(user: PolicyUser, targetUserId: number): boolean {
  return isSuperadmin(user) && targetUserId !== user.id;
}

/** Revoke roles: superadmin, never self; only `admin` and `judge` are revocable. */
export function canRevokeRole(user: PolicyUser, targetUserId: number, role: RoleName): boolean {
  return (
    isSuperadmin(user) && targetUserId !== user.id && (role === 'admin' || role === 'judge')
  );
}
