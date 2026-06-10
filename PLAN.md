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

- [ ] Sesiones Redis (cookie httpOnly SameSite=Lax) + CSRF doble token
- [ ] Registro (asigna rol `player`, email de verificación con URL firmada)
- [ ] Login con throttle 5/min (email+IP), logout
- [ ] Verificación de email obligatoria (middleware/guard)
- [ ] Recuperación de contraseña (token 60 min, email)
- [ ] Perfil: editar datos, cambiar contraseña, borrar cuenta
- [ ] Seeds: roles (4) + superadmin desde env (falla sin contraseña)
- [ ] `can(user, action, resource)` puro en `libs/shared` + tests (matriz §2)
- [ ] Páginas Angular: registro, login, verificar email, recuperar, perfil

## Fase 2 — Motores puros (TDD estricto, libs/engine)

- [ ] Tabla oficial de rondas (§5.1)
- [ ] RNG sembrado + barajado reproducible; pareo R1 con bye al impar (§5.2)
- [ ] Scoring: 3/1/0, byes, forfeits (§5.4)
- [ ] Desempates: puntos → OWP → OOWP → finished_at → sha256 coin flip (§5.5)
- [ ] Pareo Monrad 2+: grupos, float-down, backtracking 8!, ManualPairingRequired con parciales (§5.3)
- [ ] Selección de bye (peor sin bye previo; si todos, peor absoluto)
- [ ] Top cut: siembra 1v(S+1−i), clamp potencia de 2, avance fold, byes por forfeit_both, propagación de huecos (§7)
- [ ] Parser TCG Live (secciones con/sin tilde, comentarios, regex) + validador 60/≥1 Pokémon (§9)
- [ ] Cobertura ≈100 % de la lib

## Fase 3 — Torneos

- [ ] CRUD + wizard 4 pasos con autorrelleno tabla oficial + validaciones §12
- [ ] Acciones: Abrir inscripciones, Cerrar inscripciones (corrección 4.1)
- [ ] Landing pública (abiertos / en curso / últimos 10 terminados)
- [ ] Ficha pública `/torneo/{slug}` (drafts → 404), sub-navegación

## Fase 4 — Inscripciones gratis + decklists + jueces (solicitudes)

- [ ] Inscripción con lock de fila + test de concurrencia; cupo = active + pending_payment
- [ ] Baja (drop) con dropped_after_round_id
- [ ] Email "Inscripción confirmada" encolado
- [ ] Decklist CRUD + parser + visibilidad §9; lock en R1
- [ ] Solicitudes de juez + aprobación/rechazo con auditoría

## Fase 5 — Pagos PayPal

- [ ] Registro pending_payment + payment en transacción; orden PayPal S2S
- [ ] Rollback si PayPal falla; redirect a approval URL
- [ ] Webhook: firma (body crudo), idempotencia, COMPLETED/DENIED/VOIDED, job asíncrono
- [ ] Job ExpirePendingRegistration (30 min)
- [ ] Email "Pago confirmado"; páginas volver/cancelar

## Fase 6 — Ciclo de ronda

- [ ] Generar pareos (precondiciones, ManualPairingRequired → parciales + pareo manual)
- [ ] Pareo manual con re-validación de rematches + allow_rematch (corrección 4.2)
- [ ] Iniciar ronda (lock decklists R1, current_round_id, in_progress auto, jobs BullMQ)
- [ ] Check-in + job CheckInWindowExpired (3 variantes forfeit)
- [ ] Job RoundTimeExpired (solo matches sin reportes → forfeit_both)
- [ ] Reporte idempotente/conflictivo + conciliación; BO1 rechaza draw (corrección 4.3)
- [ ] Disputas + resolución con validación de winner + auditoría
- [ ] Cerrar ronda (validaciones, efectos por fase)

## Fase 7 — Tiempo real

- [ ] RealtimeService → Soketi, eventos post-commit, payloads §11
- [ ] Endpoint de autorización de canales privados (6 tipos, tests 200/403)
- [ ] Angular RealtimeService (pusher-js) + degradación a polling
- [ ] Timers autoritativos con server_now

## Fase 8 — Llamadas a juez

- [ ] Crear llamada idempotente, rate limit 3/min
- [ ] Cola del juez (scoping correcto) + disputas
- [ ] Atender bajo lock (carrera de 2 jueces)
- [ ] Chat ≤2000 chars, solo lectura tras resolver
- [ ] Decklists para jueces

## Fase 9 — Top cut

- [ ] Siembra al cerrar última suiza (excluye dropeados, clamp)
- [ ] Rondas sin ends_at ni job de tiempo (check-in sí)
- [ ] Avance fold + byes forfeit_both + propagación de huecos
- [ ] Bloqueo de draws al cerrar; final → campeón + tournament.finished

## Fase 10 — Pulido y hardening

- [ ] Clasificación pública completa + sección top cut + banner campeón
- [ ] Pareos públicos + ronda actual con timer gigante
- [ ] Páginas de error en español (401/403/404/429/500/503)
- [ ] Rate limits restantes (§14) + auditoría completa
- [ ] Caché standings (TTL 6 h) + invalidación
- [ ] 4 emails verificados en Mailpit
- [ ] README (arranque en 5 comandos, despliegue 4 procesos)
