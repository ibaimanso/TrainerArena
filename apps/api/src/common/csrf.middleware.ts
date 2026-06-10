import type { NextFunction, Request, Response } from 'express';
import { randomBytes } from 'node:crypto';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
/** PayPal webhook is CSRF-exempt (SPEC §14). */
const EXEMPT_PATHS = ['/api/webhooks/paypal'];

/**
 * Double-submit cookie CSRF protection. The XSRF-TOKEN cookie is readable by
 * the SPA (not httpOnly); mutating requests must echo it in X-XSRF-TOKEN.
 * Mismatch → 419 (page expired), as the spec's error catalogue defines.
 */
export function csrfMiddleware(req: Request, res: Response, next: NextFunction): void {
  let token = req.cookies?.['XSRF-TOKEN'] as string | undefined;
  if (!token) {
    token = randomBytes(24).toString('hex');
    res.cookie('XSRF-TOKEN', token, {
      httpOnly: false,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
    });
  }

  if (SAFE_METHODS.has(req.method) || EXEMPT_PATHS.some((p) => req.path.startsWith(p))) {
    next();
    return;
  }

  const header = req.get('X-XSRF-TOKEN');
  if (!header || header !== token) {
    res.status(419).json({ statusCode: 419, message: 'La página expiró, vuelve a intentarlo.' });
    return;
  }
  next();
}

/** Authoritative timer support (SPEC §11): every response carries the server clock. */
export function serverNowMiddleware(_req: Request, res: Response, next: NextFunction): void {
  res.setHeader('X-Server-Now', new Date().toISOString());
  next();
}
