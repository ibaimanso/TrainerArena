import { RenderMode, ServerRoute } from '@angular/ssr';

/**
 * SSR is applied to the public pages (SEO): landing and tournament pages are
 * server-rendered per request; auth/admin/judge/player areas are CSR.
 */
export const serverRoutes: ServerRoute[] = [
  { path: '', renderMode: RenderMode.Server },
  { path: 'torneo/:slug', renderMode: RenderMode.Server },
  { path: '**', renderMode: RenderMode.Client },
];
