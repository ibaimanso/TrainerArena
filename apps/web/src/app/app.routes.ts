import { Route } from '@angular/router';
import { adminGuard, authGuard, guestGuard, verifiedGuard } from './core/guards';

export const appRoutes: Route[] = [
  {
    path: '',
    pathMatch: 'full',
    loadComponent: () => import('./features/home/home.page'),
    title: 'AppTorneos — Torneos Pokémon TCG',
  },
  {
    path: 'login',
    canActivate: [guestGuard],
    loadComponent: () => import('./features/auth/login.page'),
    title: 'Iniciar sesión — AppTorneos',
  },
  {
    path: 'registro',
    canActivate: [guestGuard],
    loadComponent: () => import('./features/auth/register.page'),
    title: 'Crear cuenta — AppTorneos',
  },
  {
    path: 'verificar-email',
    loadComponent: () => import('./features/auth/verify-email.page'),
    title: 'Verificación de email — AppTorneos',
  },
  {
    path: 'recuperar-contrasena',
    canActivate: [guestGuard],
    loadComponent: () => import('./features/auth/forgot-password.page'),
    title: 'Recuperar contraseña — AppTorneos',
  },
  {
    path: 'restablecer-contrasena',
    canActivate: [guestGuard],
    loadComponent: () => import('./features/auth/reset-password.page'),
    title: 'Restablecer contraseña — AppTorneos',
  },
  {
    path: 'perfil',
    canActivate: [authGuard],
    loadComponent: () => import('./features/auth/profile.page'),
    title: 'Mi perfil — AppTorneos',
  },
  {
    path: 'torneo/:slug',
    loadComponent: () => import('./features/tournaments/tournament.page'),
    title: 'Torneo — AppTorneos',
  },
  {
    path: 'torneo/:slug/inscripcion',
    canActivate: [verifiedGuard],
    loadComponent: () => import('./features/tournaments/register.page'),
    title: 'Inscripción — AppTorneos',
  },
  {
    path: 'torneo/:slug/solicitar-juez',
    canActivate: [verifiedGuard],
    loadComponent: () => import('./features/tournaments/apply-judge.page'),
    title: 'Solicitar ser juez — AppTorneos',
  },
  {
    path: 'torneo/:slug/mi-decklist',
    canActivate: [verifiedGuard],
    loadComponent: () => import('./features/player/my-decklist.page'),
    title: 'Mi decklist — AppTorneos',
  },
  {
    path: 'mi/torneos',
    canActivate: [verifiedGuard],
    loadComponent: () => import('./features/player/my-tournaments.page'),
    title: 'Mis torneos — AppTorneos',
  },
  {
    path: 'juez/torneo/:slug/decklists',
    canActivate: [verifiedGuard],
    loadComponent: () => import('./features/judge/judge-decklists.page'),
    title: 'Decklists — AppTorneos',
  },
  {
    path: 'juez/torneo/:slug/decklists/:userId',
    canActivate: [verifiedGuard],
    loadComponent: () => import('./features/judge/judge-decklist-detail.page'),
    title: 'Decklist — AppTorneos',
  },
  {
    path: 'admin/torneos/:slug/registros',
    canActivate: [adminGuard],
    loadComponent: () => import('./features/admin/admin-registrations.page'),
    title: 'Registros — AppTorneos',
  },
  {
    path: 'admin/torneos',
    canActivate: [adminGuard],
    loadComponent: () => import('./features/admin/admin-tournaments.page'),
    title: 'Mis torneos — AppTorneos',
  },
  {
    path: 'admin/torneos/crear',
    canActivate: [adminGuard],
    loadComponent: () => import('./features/admin/create-tournament.page'),
    title: 'Crear torneo — AppTorneos',
  },
  { path: '**', redirectTo: '' },
];
