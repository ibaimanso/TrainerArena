import { Route } from '@angular/router';
import { adminGuard, authGuard, guestGuard, superadminGuard, verifiedGuard } from './core/guards';

export const appRoutes: Route[] = [
  {
    path: '',
    pathMatch: 'full',
    loadComponent: () => import('./features/home/home.page'),
    title: 'Trainer Arena — Torneos online de Pokémon TCG',
  },
  {
    path: 'login',
    canActivate: [guestGuard],
    loadComponent: () => import('./features/auth/login.page'),
    title: 'Iniciar sesión — Trainer Arena',
  },
  {
    path: 'registro',
    canActivate: [guestGuard],
    loadComponent: () => import('./features/auth/register.page'),
    title: 'Crear cuenta — Trainer Arena',
  },
  {
    path: 'verificar-email',
    loadComponent: () => import('./features/auth/verify-email.page'),
    title: 'Verificación de email — Trainer Arena',
  },
  {
    path: 'recuperar-contrasena',
    canActivate: [guestGuard],
    loadComponent: () => import('./features/auth/forgot-password.page'),
    title: 'Recuperar contraseña — Trainer Arena',
  },
  {
    path: 'restablecer-contrasena',
    canActivate: [guestGuard],
    loadComponent: () => import('./features/auth/reset-password.page'),
    title: 'Restablecer contraseña — Trainer Arena',
  },
  {
    path: 'perfil',
    canActivate: [authGuard],
    loadComponent: () => import('./features/auth/profile.page'),
    title: 'Mi perfil — Trainer Arena',
  },
  {
    path: 'torneo/:slug',
    loadComponent: () => import('./features/tournaments/tournament.page'),
    title: 'Torneo — Trainer Arena',
  },
  {
    path: 'torneo/:slug/clasificacion',
    loadComponent: () => import('./features/tournaments/standings.page'),
    title: 'Clasificación — Trainer Arena',
  },
  {
    path: 'torneo/:slug/pareos/ronda/:n',
    loadComponent: () => import('./features/tournaments/pairings.page'),
    title: 'Pareos — Trainer Arena',
  },
  {
    path: 'torneo/:slug/ronda-actual',
    loadComponent: () => import('./features/tournaments/current-round.page'),
    title: 'Ronda actual — Trainer Arena',
  },
  {
    path: 'torneo/:slug/inscripcion',
    canActivate: [verifiedGuard],
    loadComponent: () => import('./features/tournaments/register.page'),
    title: 'Inscripción — Trainer Arena',
  },
  {
    path: 'torneo/:slug/solicitar-juez',
    canActivate: [verifiedGuard],
    loadComponent: () => import('./features/tournaments/apply-judge.page'),
    title: 'Solicitar ser juez — Trainer Arena',
  },
  {
    path: 'torneo/:slug/mi-decklist',
    canActivate: [verifiedGuard],
    loadComponent: () => import('./features/player/my-decklist.page'),
    title: 'Mi decklist — Trainer Arena',
  },
  {
    path: 'mi/torneos',
    canActivate: [verifiedGuard],
    loadComponent: () => import('./features/player/my-tournaments.page'),
    title: 'Mis torneos — Trainer Arena',
  },
  {
    path: 'juez/cola',
    canActivate: [verifiedGuard],
    loadComponent: () => import('./features/judge/judge-queue.page'),
    title: 'Cola de juez — Trainer Arena',
  },
  {
    path: 'juez/call/:id',
    canActivate: [verifiedGuard],
    loadComponent: () => import('./features/judge/judge-call.page'),
    title: 'Llamada a juez — Trainer Arena',
  },
  {
    path: 'juez/disputa/:matchId',
    canActivate: [verifiedGuard],
    loadComponent: () => import('./features/judge/judge-dispute.page'),
    title: 'Resolver disputa — Trainer Arena',
  },
  {
    path: 'juez/torneo/:slug/decklists',
    canActivate: [verifiedGuard],
    loadComponent: () => import('./features/judge/judge-decklists.page'),
    title: 'Decklists — Trainer Arena',
  },
  {
    path: 'juez/torneo/:slug/decklists/:userId',
    canActivate: [verifiedGuard],
    loadComponent: () => import('./features/judge/judge-decklist-detail.page'),
    title: 'Decklist — Trainer Arena',
  },
  {
    path: 'torneo/:slug/match-actual',
    canActivate: [verifiedGuard],
    loadComponent: () => import('./features/player/my-match.page'),
    title: 'Mi match — Trainer Arena',
  },
  {
    path: 'admin/torneo/:slug/rondas',
    canActivate: [adminGuard],
    loadComponent: () => import('./features/admin/admin-rounds.page'),
    title: 'Rondas — Trainer Arena',
  },
  {
    path: 'admin/rondas/:id/pareo-manual',
    canActivate: [adminGuard],
    loadComponent: () => import('./features/admin/manual-pairing.page'),
    title: 'Pareo manual — Trainer Arena',
  },
  {
    path: 'admin/torneos/:slug/registros',
    canActivate: [adminGuard],
    loadComponent: () => import('./features/admin/admin-registrations.page'),
    title: 'Registros — Trainer Arena',
  },
  {
    path: 'admin/torneos',
    canActivate: [adminGuard],
    loadComponent: () => import('./features/admin/admin-tournaments.page'),
    title: 'Mis torneos — Trainer Arena',
  },
  {
    path: 'admin/torneos/crear',
    canActivate: [adminGuard],
    loadComponent: () => import('./features/admin/create-tournament.page'),
    title: 'Crear torneo — Trainer Arena',
  },
  {
    path: 'privacidad',
    loadComponent: () => import('./features/legal/privacy.page'),
    title: 'Política de privacidad — Trainer Arena',
  },
  {
    path: 'terminos',
    loadComponent: () => import('./features/legal/terms.page'),
    title: 'Términos de servicio — Trainer Arena',
  },
  {
    path: 'aviso-legal',
    loadComponent: () => import('./features/legal/legal-notice.page'),
    title: 'Aviso legal — Trainer Arena',
  },
  {
    path: 'superadmin/usuarios',
    canActivate: [superadminGuard],
    loadComponent: () => import('./features/superadmin/users.page'),
    title: 'Usuarios — Trainer Arena',
  },
  {
    path: '**',
    loadComponent: () => import('./features/errors/not-found.page'),
    title: 'Página no encontrada — Trainer Arena',
  },
];
