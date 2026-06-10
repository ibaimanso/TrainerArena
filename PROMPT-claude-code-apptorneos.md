# PROMPT PARA CLAUDE CODE — Reconstrucción de "AppTorneos" en Angular + NestJS

> **Instrucción para el operador humano (no para Claude Code):** antes de lanzar este prompt, guarda la especificación funcional completa de la aplicación como `SPEC.md` en la raíz del repositorio vacío. Este prompt depende de ese archivo.

---

## 0. Contexto y misión

Vas a reconstruir **desde cero** una plataforma web en español para organizar torneos online de Pokémon TCG. El comportamiento exacto de la aplicación está descrito en `SPEC.md`, en la raíz de este repositorio: es la especificación de una implementación anterior ya verificada con 359 tests automatizados. Tu trabajo es conseguir **paridad funcional completa** con esa spec, en un stack nuevo.

**Reglas de oro (en orden de prioridad):**

1. `SPEC.md` es la fuente de verdad del comportamiento. No rediseñes reglas de negocio, no "mejores" el pareo suizo, no cambies los desempates, no añadas features. Lo que la spec dice, se implementa tal cual.
2. Este prompt manda sobre la spec **solo** en dos cosas: el stack tecnológico (sección 1) y las correcciones deliberadas de la v1 (sección 4).
3. Si encuentras una ambigüedad real que bloquea el avance, pregunta. Si es un detalle menor, decide tú, documenta la decisión en `DECISIONS.md` y sigue.
4. Todo texto visible para el usuario final (UI, validaciones, emails, errores) en **español**. Código, identificadores, comentarios y mensajes de commit en **inglés**.
5. Nunca avances de fase con tests en rojo.

Antes de escribir una sola línea de código: **lee `SPEC.md` entero**, de principio a fin.

---

## 1. Stack obligatorio

| Capa | Tecnología |
|---|---|
| Monorepo | **Nx** (workspace integrado Angular + NestJS) con pnpm |
| Frontend | **Angular 20+**: componentes standalone, **signals**, control flow nativo (`@if`/`@for`), `@angular/ssr` para las páginas públicas (SEO), Tailwind CSS |
| Backend | **NestJS 11+** sobre Express |
| Base de datos | **PostgreSQL 16 + Prisma** (el modelo de §3 de la spec se traduce 1:1; usa `@@unique` compuestos y enums de Prisma) |
| Colas y jobs con retardo | **BullMQ** sobre Redis (`delay` en ms exactos — los timers de check-in y de ronda son retardos de minutos exactos, un cron no sirve) |
| Caché / sesiones / rate limit | **Redis 7** |
| Tiempo real | **Soketi** (autohospedado, protocolo Pusher) + `pusher-js` en el cliente; endpoint propio de autorización de canales privados en NestJS |
| Auth | Sesiones en Redis con cookie `httpOnly` + `SameSite=Lax` + protección CSRF (doble token). Passwords con bcrypt. Verificación de email obligatoria con URL firmada y caducidad |
| Emails | Nodemailer; en desarrollo **Mailpit** como destino; envío siempre encolado en BullMQ |
| Pagos | PayPal Checkout v2 servidor-a-servidor + webhooks con verificación de firma (necesitas el **body crudo**: configura NestJS con `rawBody: true` y úsalo en ese endpoint) |
| Tests | Jest (unit + integración con supertest contra la API), Testcontainers o docker-compose para Postgres/Redis de test |
| Dev local | `docker-compose.yml` con postgres, redis, soketi y mailpit |
| CI | GitHub Actions: lint + typecheck + suite completa en cada push |

TypeScript en modo `strict` en todo el workspace. ESLint + Prettier configurados desde la fase 0.

---

## 2. Estructura del monorepo

```
apps/
  api/          # NestJS: toda la lógica de servidor
  web/          # Angular: SPA con SSR en rutas públicas
libs/
  engine/       # ★ Lógica pura SIN IO: pareo suizo, scoring,
                #   desempates, top cut, parser de decklists,
                #   tabla oficial de rondas (§5, §7, §9 de la spec)
  shared/       # Tipos, DTOs, enums, constantes de eventos/canales
                #   realtime, y las policies como funciones puras
                #   can(user, action, resource) (§2 de la spec)
```

`libs/engine` es la joya del proyecto: módulos TypeScript puros que reciben el snapshot inmutable definido en §5 de la spec y devuelven resultados deterministas. **Cero imports de Prisma, Nest o Angular.** Tanto `api` como `web` importan de `engine` y `shared`.

---

## 3. Mapeo de conceptos de la spec a este stack

| Concepto en SPEC.md | Implementación aquí |
|---|---|
| Policies / matriz de autorización (§2) | Funciones puras en `libs/shared` + Guards de NestJS que las invocan; las mismas funciones autorizan los canales privados de Soketi y condicionan la UI en Angular |
| Jobs con retardo (check-in, tiempo de ronda, expiración de pago) | Colas BullMQ: `round-jobs`, `payment-jobs`, `mail`, `webhooks`. Al iniciar ronda se encolan `CheckInWindowExpired` (delay = checkin_minutes) y `RoundTimeExpired` (delay hasta `ends_at`, solo si existe). Guarda el `jobId` para poder cancelarlos si la ronda se cierra antes |
| Broadcasts (§11) | Servicio `RealtimeService` en Nest que publica a Soketi **después del commit** de cada transacción; nombres de canales y payloads exactamente los de la tabla de §11, como constantes tipadas en `libs/shared` |
| Timers autoritativos | Toda respuesta de página/API incluye `server_now`; Angular calcula el offset una vez y pinta el restante con un signal + interval de 1 s. El servidor nunca confía en el reloj del cliente |
| Inertia partial reload | Los eventos realtime de listas (standings, pairings) solo notifican; el componente Angular re-fetchea sus datos. Degradación sin WebSocket: polling (cola de jueces 10 s, chat 5 s) |
| Transacción + lock de cupo (§8.1) | `prisma.$transaction` con `SELECT ... FOR UPDATE` (raw) sobre la fila del torneo |
| Caché de clasificación | Redis, clave por torneo, TTL 6 h, invalidada al cerrar ronda / terminar torneo |
| Mailables encolados | Job en cola `mail` con plantilla + datos; los 4 emails de §13 |
| Rate limits (§14) | `@nestjs/throttler` con storage Redis, límites exactos de §14 |
| Auditoría (§14) | `AuditService` con las acciones listadas; **nunca lanza** (try/catch interno con log) |
| Soft deletes de tournaments | Columna `deleted_at` + filtrado en un middleware/extensión de Prisma |

---

## 4. Correcciones obligatorias sobre la v1 (huecos conocidos de §17 que SÍ debes cerrar)

1. **Estados del torneo:** añade acción explícita de admin "Cerrar inscripciones" (`registration_open → registration_closed`) y fija `in_progress` automáticamente al iniciar la Ronda 1.
2. **Pareo manual:** el servidor re-valida rematches al enviar parejas manuales. Si una pareja ya jugó entre sí, rechaza con 422 y mensaje en español, salvo que el admin envíe explícitamente `allow_rematch: true` (la UI muestra un aviso y exige confirmación).
3. **BO1 sin empates:** si `swiss_bo = 1`, la UI de reporte no ofrece "Empate" **y el backend rechaza** `draw` en los reportes de esos matches. (El comportamiento del top cut respecto a draws se mantiene exactamente como dicta la spec: el cierre los bloquea y los resuelve un juez.)

Todo lo demás listado como "no reabrir" en §17 se respeta tal cual (bye = 3 puntos, OWP sin suelo del 25 %, forfeit doble = derrota para ambos, etc.).

---

## 5. Reglas para el frontend Angular

- **Rutas**: replica el mapa de §12 con los mismos paths en español (`/torneo/:slug`, `/torneo/:slug/clasificacion`, `/mi/torneos`, `/juez/cola`, `/admin/torneos`, …). Guards de ruta: `authGuard`, `verifiedGuard`, `adminGuard`, `superadminGuard`; el contenido de juez se limita por datos, no solo por guard.
- **SSR solo en lo público** (landing, ficha del torneo, clasificación, pareos, ronda actual); el resto puede ser CSR.
- **Arquitectura**: componentes standalone organizados por feature (`features/tournaments`, `features/match`, `features/judge`, `features/admin`…), servicios con signals para estado, `HttpClient` con un interceptor que adjunta CSRF y captura el `server_now` de cada respuesta.
- **Realtime**: un `RealtimeService` único que envuelve `pusher-js`, expone `subscribe(channel)` tipado con las constantes de `libs/shared`, y degrada a polling si la conexión cae.
- **Páginas clave** (cuida especialmente estas): "Mi match" (check-in, timer, reporte, estados awaiting/disputed/finished, llamar juez + chat embebido), la clasificación pública con auto-refresh, y la cola del juez.
- **Mobile-first**: los jugadores usan el móvil mientras juegan en el PC. "Mi match" debe ser impecable a 380 px de ancho.
- **Formularios**: Reactive Forms con validación cliente como UX; la validación que cuenta es siempre la del servidor (mensajes en español que la UI muestra tal cual).

---

## 6. Reglas para el backend NestJS

- **Módulos por dominio**: `auth`, `users`, `roles`, `tournaments`, `registrations`, `payments`, `decklists`, `rounds`, `matches`, `judges` (solicitudes + llamadas + chat + disputas), `realtime`, `mail`, `audit`, `health`.
- **Validación** de entrada con DTOs + `class-validator` (o zod), mensajes en español. Los enums y máquinas de estado de §4 se implementan con validaciones de transición explícitas: una transición ilegal es siempre un error 4xx, nunca un estado corrupto.
- **Endpoints de salud**: `/health` (liveness) y `/ready` (checks de database y cache, 503 si fallan), como define §12.
- **Webhook PayPal** (§8.5): público, exento de CSRF, verifica firma con el body crudo, responde 200 inmediato, procesa en job; firma inválida → 200 inerte; idempotencia por `paypal_event_id` UNIQUE.
- **Seeds**: roles, superadmin desde variables de entorno (falla si falta la contraseña), y datos demo opcionales como describe §15.
- **`.env.example`** completo con todas las variables de §15 adaptadas a este stack.

---

## 7. Metodología: fases de construcción

Trabaja **fase a fase**. Al terminar cada fase: `pnpm nx run-many -t lint test` en verde, la app arranca con `docker compose up` + `pnpm dev`, y haces commit (conventional commits). Genera un `PLAN.md` al empezar y ve marcando el progreso.

- **Fase 0 — Bootstrap**: workspace Nx, apps `api`/`web`, libs `engine`/`shared`, docker-compose (postgres, redis, soketi, mailpit), Prisma inicializado, ESLint/Prettier/strict, CI de GitHub Actions, `/health` y `/ready` funcionando.
- **Fase 1 — Auth y roles**: registro (asigna `player`), login con throttle, verificación de email obligatoria, recuperación de contraseña, perfil, seeds de roles y superadmin, función `can()` en `libs/shared` con tests.
- **Fase 2 — Motores puros con TDD ESTRICTO** (★ la fase más importante): en `libs/engine`, **escribe primero los tests** a partir de §5, §7, §9 y §16 de la spec, y después la implementación. Cubre: barajado reproducible por seed y pareo R1; pareo Monrad por grupos con float-down; detección de rematches con backtracking (límite 8!) y excepción `ManualPairingRequired` con parciales; selección de bye; scoring (byes, forfeits, draws); OWP/OOWP con los matices exactos de byes; orden total de desempates incluido el coin flip por sha256; siembra del top cut 1vN y avance "fold" con huecos y byes por forfeit; parser de TCG Live (secciones con/sin tilde, comentarios, regex de carta) y validador (60 cartas, ≥1 Pokémon); tabla oficial de rondas. Objetivo: cobertura ≈100 % de esta lib.
- **Fase 3 — Torneos**: modelo completo, wizard de creación en 4 pasos con autorrelleno de la tabla oficial y las validaciones de §12, "Abrir inscripciones", "Cerrar inscripciones" (corrección 4.1), landing y ficha pública (drafts → 404).
- **Fase 4 — Inscripciones gratis + decklists + solicitudes de juez**: cupo con lock y carrera probada con test de concurrencia, baja (drop), email "Inscripción confirmada" encolado, CRUD de decklist con parser/validador y visibilidad de §9, solicitudes de juez y aprobación.
- **Fase 5 — Pagos PayPal**: flujo completo de §8 (reserva de plaza con `pending_payment`, orden servidor-a-servidor, rollback si PayPal falla, webhook firmado e idempotente, job de expiración a 30 min, email "Pago confirmado", páginas de retorno/cancelación).
- **Fase 6 — Ciclo de ronda**: generar/iniciar/cerrar con todas las precondiciones y efectos de §6 (lock de decklists en R1, `current_round_id`, `in_progress` automático), jobs de check-in y tiempo agotado con sus 3 variantes de forfeit, reporte idempotente/conflictivo y conciliación, disputas y resolución con validación de winner, pareo manual con re-validación de rematches (corrección 4.2), BO1 sin draw (corrección 4.3).
- **Fase 7 — Tiempo real**: Soketi, endpoint de autorización de canales con los 6 tipos de §11 (tests 200/403 por perfil), todos los eventos con sus payloads exactos emitidos post-commit, timers con `server_now`, degradación a polling.
- **Fase 8 — Llamadas a juez**: creación idempotente con rate limit 3/min, cola del juez con scoping correcto, atender bajo lock (dos jueces simultáneos: solo uno gana), chat persistido ≤2000 chars con solo-lectura tras resolver, vistas de decklists para jueces.
- **Fase 9 — Top cut**: siembra al cerrar la última suiza, clamp de tamaño, rondas sin `ends_at` ni job de tiempo (check-in sí aplica), avance fold con byes por `forfeit_both` y propagación de huecos, bloqueo de draws al cerrar, final → campeón y `tournament.finished`.
- **Fase 10 — Pulido y hardening**: clasificación pública completa (orden, récord, "(retirado)", sección de top cut, banner de campeón), pareos públicos y ronda actual con timer gigante, páginas de error en español, rate limits restantes, auditoría completa, caché de standings con invalidación, los 4 emails verificados en Mailpit, README con instrucciones de desarrollo y despliegue.

---

## 8. Definición de hecho global

- Paridad funcional con `SPEC.md` verificada contra los criterios de aceptación de §16, adaptados a este stack como suite propia (unit en `libs/engine`, integración con supertest en `apps/api`, autorización de canales, páginas públicas).
- `pnpm nx run-many -t lint test build` en verde y CI pasando.
- `docker compose up` + seeds deja una app navegable con los datos demo de §15.
- `README.md` con: requisitos, arranque local en 5 comandos, variables de entorno, cómo correr tests, y notas de despliegue (4 procesos: api, worker BullMQ, soketi, web).

## 9. Qué NO hacer

- No microservicios, no GraphQL, no i18n multi-idioma, no otros métodos de pago, no apps nativas (no-objetivos de §1).
- No tocar las reglas de scoring/desempates/pareo "para mejorarlas".
- No guardar tokens de sesión en `localStorage`.
- No emitir eventos realtime dentro de transacciones abiertas.
- No dejar `any` ni desactivar reglas de lint para "ir más rápido".

## 10. Primer paso

1. Lee `SPEC.md` completo.
2. Genera `PLAN.md` con el desglose de las 10 fases en tareas concretas.
3. Empieza la Fase 0.
