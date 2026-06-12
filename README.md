# AppTorneos — Plataforma de Torneos Pokémon TCG

Aplicación web en español para organizar torneos online de Pokémon TCG: rondas
suizas con timer autoritativo, top cut, inscripciones gratuitas o de pago
(confirmadas por el organizador), decklists de TCG Live, auto-reporte con confirmación, llamadas a juez
con chat en vivo y páginas públicas en tiempo real.

Especificación funcional completa: [`SPEC.md`](./SPEC.md) · Plan de
construcción: [`PLAN.md`](./PLAN.md) · Decisiones técnicas:
[`DECISIONS.md`](./DECISIONS.md).

## Stack

| Capa       | Tecnología                                          |
| ---------- | --------------------------------------------------- |
| Monorepo   | Nx 22 + pnpm                                        |
| Frontend   | Angular 21 (standalone, signals, SSR) + Tailwind    |
| Backend    | NestJS 11 (Express)                                 |
| BD         | PostgreSQL 16 + Prisma 6                            |
| Jobs       | BullMQ (Redis), retardos exactos en ms              |
| Tiempo real| Soketi (protocolo Pusher) + pusher-js               |
| Emails     | Nodemailer (Mailpit en desarrollo), encolados       |
| Pagos      | Cuota pagada al organizador; confirmación manual    |

## Requisitos

- Node.js ≥ 22, pnpm ≥ 10
- Docker (postgres, redis, soketi, mailpit)

## Arranque local (5 comandos)

```bash
pnpm install
cp .env.example .env          # rellena SUPERADMIN_PASSWORD como mínimo
docker compose up -d
pnpm prisma migrate dev       # crea el esquema y genera el cliente
pnpm dev                      # api en :3000, web en :4200
```

Seeds (roles + superadmin + datos demo opcionales):

```bash
pnpm prisma db seed
```

## Tests

```bash
pnpm nx run-many -t lint test build   # suite completa
pnpm nx test engine                   # motores puros (sin BD)
pnpm nx test api                      # integración (necesita postgres+redis)
```

## Despliegue a producción

Stack completo con Docker Compose: PostgreSQL, Redis, Soketi (WebSockets),
API NestJS (con los workers BullMQ en el mismo proceso), SSR de Angular y
Caddy como reverse proxy con HTTPS automático (Let's Encrypt).

En un VPS con Docker y un dominio apuntando a su IP:

```bash
git clone <repo> && cd appTorneos
cp .env.production.example .env   # rellenar TODO (secretos con: openssl rand -hex 32)
docker compose -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.prod.yml exec api pnpm prisma db seed   # roles + superadmin
```

Las migraciones se aplican solas al arrancar el contenedor `api`
(`prisma migrate deploy`). Enrutado en [`deploy/Caddyfile`](./deploy/Caddyfile):
`/api/*` y `/health` → api; `/app/*` (WebSocket) → soketi; el resto → SSR.

Checklist antes de abrir al público:

- [ ] Secretos nuevos en `.env` (SESSION_SECRET, APP_KEY, contraseñas)
- [ ] SMTP transaccional con el dominio propio (SPF/DKIM) — sin esto los
      emails de verificación caen en spam
- [ ] Claves reCAPTCHA v3 del dominio en `.env` (google.com/recaptcha/admin)
- [ ] Backup diario de PostgreSQL (`pg_dump` + destino externo)
- [ ] Uptime monitor sobre `/health` y captura de errores (p. ej. Sentry)
- [ ] Rellenar los `[COMPLETAR]` de las páginas legales (titular, NIF, domicilio)
