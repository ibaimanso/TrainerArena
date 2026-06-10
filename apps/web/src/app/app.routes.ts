import { Route } from '@angular/router';
import { authGuard, guestGuard } from './core/guards';

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
  { path: '**', redirectTo: '' },
];
