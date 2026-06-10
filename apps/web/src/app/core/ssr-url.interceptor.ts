import { isPlatformServer } from '@angular/common';
import { HttpEvent, HttpHandlerFn, HttpRequest } from '@angular/common/http';
import { inject, PLATFORM_ID } from '@angular/core';
import { Observable } from 'rxjs';

/**
 * During SSR, relative /api URLs are rewritten to the API origin so public
 * pages can be server-rendered (guest view; cookies are not forwarded).
 */
export function ssrUrlInterceptor(
  req: HttpRequest<unknown>,
  next: HttpHandlerFn
): Observable<HttpEvent<unknown>> {
  const platformId = inject(PLATFORM_ID);
  if (isPlatformServer(platformId) && req.url.startsWith('/')) {
    const origin =
      (typeof process !== 'undefined' && process.env?.['API_URL']) || 'http://localhost:3000';
    return next(req.clone({ url: `${origin}${req.url}` }));
  }
  return next(req);
}
