# PLAN — Reconstrucción AppTorneos (Angular + NestJS)

Spec de referencia: `SPEC.md`. Prompt operativo: `PROMPT-claude-code-apptorneos.md`.
Regla: ninguna fase se cierra con tests en rojo. Commit al cerrar cada fase.

## Fase 0 — Bootstrap

- [x] Workspace Nx 22 (pnpm), TypeScript strict
- [x] `apps/api` NestJS 11 (Express, webpack)
- [x] `apps/web` Angular 21 standalone + SSR + Tailwind
- [x] `libs/engine` y `libs/shared` (jest)
- [x] docker-compose: postgres 16, redis 7, soketi, mailpit
- [x] Prisma 6 + schema completo (§3) + cliente generado
- [x] `/health` y `/ready` (db + cache, 503 si fallan)
- [x] ESLint + Prettier
- [x] CI GitHub Actions (lint + test + build con postgres/redis de servicio)
- [x] `.env.example` completo (§15)

## Fase 1 — Auth y roles

- [x] Sesiones Redis (cookie httpOnly SameSite=Lax) + CSRF doble token
- [x] Registro (asigna rol `player`, email de verificación con URL firmada)
- [x] Login con throttle 5/min (email+IP), logout
- [x] Verificación de email obligatoria (middleware/guard)
- [x] Recuperación de contraseña (token 60 min, email)
- [x] Perfil: editar datos, cambiar contraseña, borrar cuenta
- [x] Seeds: roles (4) + superadmin desde env (falla sin contraseña)
- [x] `can(user, action, resource)` puro en `libs/shared` + tests (matriz §2)
- [x] Páginas Angular: registro, login, verificar email, recuperar, perfil

## Fase 2 — Motores puros (TDD estricto, libs/engine)

- [x] Tabla oficial de rondas (§5.1)
- [x] RNG sembrado + barajado reproducible; pareo R1 con bye al impar (§5.2)
- [x] Scoring: 3/1/0, byes, forfeits (§5.4)
- [x] Desempates: puntos → OWP → OOWP → finished_at → sha256 coin flip (§5.5)
- [x] Pareo Monrad 2+: grupos, float-down, backtracking 8!, ManualPairingRequired con parciales (§5.3)
- [x] Selección de bye (peor sin bye previo; si todos, peor absoluto)
- [x] Top cut: siembra 1v(S+1−i), clamp potencia de 2, avance fold, byes por forfeit_both, propagación de huecos (§7)
- [x] Parser TCG Live (secciones con/sin tilde, comentarios, regex) + validador 60/≥1 Pokémon (§9)
- [x] Cobertura ≈100 % de la lib

## Fase 3 — Torneos

- [x] CRUD + wizard 4 pasos con autorrelleno tabla oficial + validaciones §12
- [x] Acciones: Abrir inscripciones, Cerrar inscripciones (corrección 4.1)
- [x] Landing pública (abiertos / en curso / últimos 10 terminados)
- [x] Ficha pública `/torneo/{slug}` (drafts → 404), sub-navegación

## Fase 4 — Inscripciones gratis + decklists + jueces (solicitudes)

- [x] Inscripción con lock de fila + test de concurrencia; cupo = active + pending_payment
- [x] Baja (drop) con dropped_after_round_id
- [x] Email "Inscripción confirmada" encolado
- [x] Decklist CRUD + parser + visibilidad §9; lock en R1
- [x] Solicitudes de juez + aprobación/rechazo con auditoría

## Fase 5 — Pagos PayPal

- [x] Registro pending_payment + payment en transacción; orden PayPal S2S
- [x] Rollback si PayPal falla; redirect a approval URL
- [x] Webhook: firma (body crudo), idempotencia, COMPLETED/DENIED/VOIDED, job asíncrono
- [x] Job ExpirePendingRegistration (30 min)
- [x] Email "Pago confirmado"; páginas volver/cancelar

## Fase 6 — Ciclo de ronda

- [x] Generar pareos (precondiciones, ManualPairingRequired → parciales + pareo manual)
- [x] Pareo manual con re-validación de rematches + allow_rematch (corrección 4.2)
- [x] Iniciar ronda (lock decklists R1, current_round_id, in_progress auto, jobs BullMQ)
- [x] Check-in + job CheckInWindowExpired (3 variantes forfeit)
- [x] Job RoundTimeExpired (solo matches sin reportes → forfeit_both)
- [x] Reporte idempotente/conflictivo + conciliación; BO1 rechaza draw (corrección 4.3)
- [x] Disputas + resolución con validación de winner + auditoría
- [x] Cerrar ronda (validaciones, efectos por fase)

## Fase 7 — Tiempo real

- [x] RealtimeService → Soketi, eventos post-commit, payloads §11
- [x] Endpoint de autorización de canales privados (6 tipos, tests 200/403)
- [x] Angular RealtimeService (pusher-js) + degradación a polling
- [x] Timers autoritativos con server_now

## Fase 8 — Llamadas a juez

- [x] Crear llamada idempotente, rate limit 3/min
- [x] Cola del juez (scoping correcto) + disputas
- [x] Atender bajo lock (carrera de 2 jueces)
- [x] Chat ≤2000 chars, solo lectura tras resolver
- [x] Decklists para jueces

## Fase 9 — Top cut

- [x] Siembra al cerrar última suiza (excluye dropeados, clamp)
- [x] Rondas sin ends_at ni job de tiempo (check-in sí)
- [x] Avance fold + byes forfeit_both + propagación de huecos
- [x] Bloqueo de draws al cerrar; final → campeón + tournament.finished

## Fase 10 — Pulido y hardening

- [x] Clasificación pública completa + sección top cut + banner campeón
- [x] Pareos públicos + ronda actual con timer gigante
- [x] Páginas de error en español (401/403/404/429/500/503)
- [x] Rate limits restantes (§14) + auditoría completa
- [x] Caché standings (TTL 6 h) + invalidación
- [x] 4 emails verificados en Mailpit
- [x] README (arranque en 5 comandos, despliegue 4 procesos)
