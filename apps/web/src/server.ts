import {
  AngularNodeAppEngine,
  createNodeRequestHandler,
  isMainModule,
  writeResponseToNodeResponse,
} from '@angular/ssr/node';
import express from 'express';
import { request as httpRequest } from 'node:http';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const serverDistFolder = dirname(fileURLToPath(import.meta.url));
const browserDistFolder = resolve(serverDistFolder, '../browser');

const app = express();
const angularApp = new AngularNodeAppEngine();

/**
 * Same-origin `/api` proxy for platforms without an external reverse proxy
 * (e.g. Railway, where Caddy doesn't exist and only this server is public).
 * Keeps the session cookie first-party. API_URL must point to the API over
 * the platform's private network, e.g. http://api.railway.internal:3000.
 * Behind Caddy this stays inactive for browser traffic (Caddy routes /api
 * before reaching this server), so it is safe in both deployments.
 */
const apiUrl = process.env['API_URL'];
if (apiUrl) {
  const target = new URL(apiUrl);
  app.use('/api', (req, res) => {
    const proxyReq = httpRequest(
      {
        hostname: target.hostname,
        port: target.port || 80,
        method: req.method,
        // Express strips the mount path; X-Forwarded-* headers pass through
        // untouched so the API keeps seeing the real client IP/protocol.
        path: `/api${req.url}`,
        headers: { ...req.headers, host: target.host },
      },
      (proxyRes) => {
        res.writeHead(proxyRes.statusCode ?? 502, proxyRes.headers);
        proxyRes.pipe(res);
      },
    );
    proxyReq.on('error', () => {
      if (!res.headersSent) {
        res.writeHead(502, { 'content-type': 'application/json' });
      }
      res.end('{"statusCode":502,"message":"API no disponible"}');
    });
    req.pipe(proxyReq);
  });
}

/**
 * Liveness endpoint for platform healthchecks (independent of the API).
 */
app.get('/healthz', (_req, res) => {
  res.json({ status: 'ok' });
});

/**
 * Serve static files from /browser
 */
app.use(
  express.static(browserDistFolder, {
    maxAge: '1y',
    index: false,
    redirect: false,
  }),
);

/**
 * Handle all other requests by rendering the Angular application.
 */
app.use('/**', (req, res, next) => {
  angularApp
    .handle(req)
    .then((response) => (response ? writeResponseToNodeResponse(response, res) : next()))
    .catch(next);
});

/**
 * Start the server if this module is the main entry point, or it is ran via PM2.
 * The server listens on the port defined by the `PORT` environment variable, or defaults to 4000.
 */
if (isMainModule(import.meta.url) || process.env['pm_id']) {
  const port = process.env['PORT'] || 4000;
  app.listen(port, () => {
    console.log(`Node Express server listening on http://localhost:${port}`);
  });
}

/**
 * Request handler used by the Angular CLI (for dev-server and during build) or Firebase Cloud Functions.
 */
export const reqHandler = createNodeRequestHandler(app);
