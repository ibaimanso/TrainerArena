# AppTorneos — Plataforma de Torneos Pokémon TCG

Aplicación web en español para organizar torneos online de Pokémon TCG: rondas
suizas con timer autoritativo, top cut, inscripciones gratuitas o de pago
(PayPal), decklists de TCG Live, auto-reporte con confirmación, llamadas a juez
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
| Pagos      | PayPal Checkout v2 + webhooks firmados              |

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

## Procesos en producción (4)

1. **api** — servidor NestJS (`nx build api` → `node dist/apps/api/main.js`)
2. **worker** — worker BullMQ (timers de ronda, expiración de pagos, webhooks, emails)
3. **soketi** — servidor WebSocket (protocolo Pusher)
4. **web** — SSR de Angular (`nx build web` → `node dist/apps/web/server/server.mjs`)

Todos contra la misma base de datos PostgreSQL y el mismo Redis
(cola/caché/sesiones). Variables de entorno: ver [`.env.example`](./.env.example).
