import { inject } from '@angular/core';
import { CanActivateFn, Router, UrlTree } from '@angular/router';
import { AuthService } from './auth.service';

/** Requires a session. */
export const authGuard: CanActivateFn = async (_route, state): Promise<boolean | UrlTree> => {
  const auth = inject(AuthService);
  const router = inject(Router);
  await auth.loadOnce();
  if (auth.isLoggedIn()) return true;
  return router.createUrlTree(['/login'], { queryParams: { volver: state.url } });
};

/** Requires a session with verified email (mandatory to operate, SPEC §12). */
export const verifiedGuard: CanActivateFn = async (_route, state): Promise<boolean | UrlTree> => {
  const auth = inject(AuthService);
  const router = inject(Router);
  await auth.loadOnce();
  if (!auth.isLoggedIn()) {
    return router.createUrlTree(['/login'], { queryParams: { volver: state.url } });
  }
  if (!auth.isVerified()) return router.createUrlTree(['/verificar-email']);
  return true;
};

/** Requires global admin (or superadmin) role. */
export const adminGuard: CanActivateFn = async (_route, state): Promise<boolean | UrlTree> => {
  const auth = inject(AuthService);
  const router = inject(Router);
  await auth.loadOnce();
  if (!auth.isLoggedIn()) {
    return router.createUrlTree(['/login'], { queryParams: { volver: state.url } });
  }
  if (!auth.isVerified()) return router.createUrlTree(['/verificar-email']);
  if (auth.isAdmin()) return true;
  return router.createUrlTree(['/']);
};

/** Requires superadmin role. */
export const superadminGuard: CanActivateFn = async (_route, state): Promise<boolean | UrlTree> => {
  const auth = inject(AuthService);
  const router = inject(Router);
  await auth.loadOnce();
  if (!auth.isLoggedIn()) {
    return router.createUrlTree(['/login'], { queryParams: { volver: state.url } });
  }
  if (auth.isSuperadmin()) return true;
  return router.createUrlTree(['/']);
};

/** Only for logged-out visitors (login/register pages). */
export const guestGuard: CanActivateFn = async (): Promise<boolean | UrlTree> => {
  const auth = inject(AuthService);
  const router = inject(Router);
  await auth.loadOnce();
  if (auth.isLoggedIn()) return router.createUrlTree(['/']);
  return true;
};
