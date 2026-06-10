import { RenderMode, ServerRoute } from '@angular/ssr';

/**
 * SSR is applied to the public pages (SEO): landing and tournament pages are
 * server-rendered per request; auth/admin/judge/player areas are CSR.
 */
export const serverRoutes: ServerRoute[] = [
  { path: '', renderMode: RenderMode.Server },
  { path: 'torneo/:slug', renderMode: RenderMode.Server },
  { path: 'torneo/:slug/clasificacion', renderMode: RenderMode.Server },
  { path: 'torneo/:slug/pareos/ronda/:n', renderMode: RenderMode.Server },
  { path: 'torneo/:slug/ronda-actual', renderMode: RenderMode.Server },
  { path: '**', renderMode: RenderMode.Client },
];
