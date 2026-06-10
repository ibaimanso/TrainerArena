# Especificación completa — Plataforma de Torneos Pokémon TCG ("AppTorneos")

> **Cómo usar este documento:** es la especificación funcional y técnica completa de una aplicación ya construida y verificada (implementación de referencia: Laravel 11 + Inertia/React, 359 tests automatizados en verde). Está escrita para pegarla como prompt y reconstruir la aplicación desde cero en cualquier stack (p. ej. Next.js + Prisma + PostgreSQL). Todo lo que sigue es comportamiento **real y probado**, no ideas: implementa exactamente lo descrito y tendrás paridad funcional. La sección 18 sugiere el mapeo de conceptos a un stack JavaScript.

---

## 1. Producto y alcance

Aplicación web **en español** para organizar torneos de Pokémon TCG **online**:

- Rondas suizas (pareo Monrad/Dutch) con timer autoritativo en servidor.
- Top cut (eliminación directa) opcional, sin límite de tiempo.
- Inscripción de jugadores gratuita o de pago (PayPal Checkout v2 + webhooks).
- Decklists pegadas desde el export de Pokémon TCG Live, con parser y validación.
- Auto-reporte de resultados por los jugadores con confirmación del rival y disputas resueltas por jueces.
- Llamadas a juez con chat en vivo persistido.
- Páginas públicas (clasificación, pareos, ronda actual) con actualizaciones en tiempo real vía WebSockets.
- Emails transaccionales mínimos (4) en español.

**No-objetivos v1:** vídeo/voz, detección automática de resultados, apps nativas, multi-idioma, otros métodos de pago, validación de legalidad/baneos de cartas (solo cantidades).

---

## 2. Roles y permisos

**Roles globales** (un usuario puede tener varios): `superadmin`, `admin`, `judge`, `player`. Todo usuario nuevo registrado recibe `player` automáticamente. El primer `superadmin` se crea por seeder con email/contraseña de variables de entorno; él promociona al resto.

**Roles por torneo (derivados, no son tablas de rol):**
- **Admin del torneo** = `tournaments.admin_id` (su creador). El `superadmin` puede actuar como admin de cualquier torneo en todos los checks.
- **Juez aprobado** = usuario con `judge_applications.status = approved` en ese torneo.

**Matriz resumida de autorización** (toda regla verifica el scope del torneo concreto):

| Acción | Quién |
|---|---|
| Crear torneo | rol `admin` (o `superadmin`) |
| Configurar / abrir inscripciones / gestionar rondas / ver registros | admin del torneo, superadmin |
| Inscribirse | usuario autenticado con email verificado, torneo en `registration_open`, no lleno, no inscrito ya |
| Darse de baja (drop) | el propio jugador |
| Crear/editar decklist | el propio jugador con registro `active`, torneo en `registration_open`/`registration_closed`, antes del lock |
| Ver decklist | su dueño (siempre), admin del torneo, juez aprobado, superadmin. **Nunca otros jugadores** |
| Solicitar ser juez | rol global `judge`, torneo no `finished`/`cancelled`, una solicitud por (torneo, usuario) |
| Aprobar/rechazar solicitud de juez | admin del torneo, superadmin (solo si está `pending`) |
| Check-in / reportar resultado | jugador del match |
| Llamar juez | jugador del match |
| Ver llamada y chatear | creador de la llamada, juez asignado, cualquier juez aprobado del torneo, admin, superadmin (chatear solo si no está `resolved`) |
| Atender llamada | juez aprobado o admin/superadmin, solo si está `open` |
| Resolver llamada | juez asignado, otro juez aprobado, admin, superadmin (si no está `resolved`) |
| Resolver disputa | juez aprobado del torneo, admin, superadmin. **Nunca los jugadores del match** |
| Asignar/revocar roles globales | superadmin (no puede modificar sus propios roles; revocar solo `admin`/`judge`) |

---

## 3. Modelo de datos

Convenciones: PK `id` autoincremental; `created_at`/`updated_at` salvo indicación; FKs con borrado en cascada salvo indicación; importes monetarios **en céntimos** (entero).

### users
`id, name, email UNIQUE, email_verified_at NULL, password (hash), remember_token, timestamps`. Roles globales en tablas del sistema de permisos (p. ej. spatie: roles / model_has_roles). La verificación de email es **obligatoria** para operar.

### tournaments (soft deletes)
| Columna | Tipo / regla |
|---|---|
| public_id | ULID, para canal público realtime (evita enumerar IDs) |
| slug | string UNIQUE — clave usada en todas las URLs |
| admin_id | FK users |
| name, description | string / text NULL |
| start_at | datetime |
| status | enum (ver §4) |
| max_players | int |
| swiss_rounds | int |
| round_time_minutes | int |
| checkin_minutes | int |
| swiss_bo, top_cut_bo | 1 ó 3 |
| top_cut_size | 0 (sin cut), 4, 8, 16, 32, 64 |
| fee_amount | int céntimos; 0 = gratuito |
| fee_currency | char(3), por defecto `EUR` |
| paypal_account | email NULL (obligatorio si fee>0) |
| current_round_id | FK rounds NULL (se fija al iniciar cada ronda) |
| pairing_seed | string aleatorio (32 chars) fijado al crear — hace reproducible el pareo |

### tournament_registrations
`tournament_id FK, user_id FK, status enum, full_name, tcg_live_username, email, phone NULL, registered_at, dropped_at NULL, dropped_after_round_id FK rounds NULL`. **UNIQUE (tournament_id, user_id)** — un registro existente (aunque esté `dropped`) bloquea reinscripción. Índice (tournament_id, status).

### judge_applications
`tournament_id FK, user_id FK, status enum, applied_at, decided_at NULL, decided_by FK users NULL`. UNIQUE (tournament_id, user_id).

### decklists
`tournament_id FK, user_id FK, raw_text TEXT, parsed_cards JSON, submitted_at, locked_at NULL`. UNIQUE (tournament_id, user_id).

### rounds
`tournament_id FK, round_number tinyint, phase enum(swiss|top_cut), started_at NULL, ends_at NULL (siempre NULL en top cut), closed_at NULL, status enum`. UNIQUE (tournament_id, round_number). Índice (tournament_id, status). La numeración del top cut **continúa** la suiza (con 4 suizas, el cut empieza en R5).

### matches
`round_id FK, table_number smallint, player_a_id FK users, player_b_id FK users NULL (NULL = bye), status enum, is_bye bool, check_in_a_at NULL, check_in_b_at NULL, finished_at NULL, bracket_position smallint NULL (solo top cut)`. UNIQUE (round_id, table_number). Índice (round_id, status).

### match_reports (append-only)
`match_id FK, reporter_id FK users, result enum(win|loss|draw) — relativo al reportero, score string NULL (texto libre "2-1"), reported_at`. UNIQUE (match_id, reporter_id).

### match_results (uno por match)
`match_id FK UNIQUE, result string (a_wins|b_wins|draw|bye|forfeit_a|forfeit_b|forfeit_both), winner_id FK users NULL, score NULL, resolved_by FK users NULL (NULL = automático/sistema), resolved_at`.

### pairing_history
`tournament_id FK, player_low_id, player_high_id, round_id FK`. Siempre se inserta normalizado `low < high`; UNIQUE (tournament_id, player_low_id, player_high_id). Detecta rematches con una sola consulta. Solo se registra en suizas y byes no (los matches de top cut tampoco bloquean nada).

### judge_calls
`tournament_id FK, match_id FK, created_by FK users, assigned_judge_id FK users NULL, status enum(open|in_progress|resolved), resolved_at NULL`. Índice (tournament_id, status).

### judge_messages
`judge_call_id FK, sender_id FK users, message TEXT (máx. 2000), sent_at`. Índice judge_call_id.

### payments
`tournament_id FK, user_id FK, registration_id FK, paypal_order_id UNIQUE, paypal_capture_id NULL, amount céntimos, currency, status enum, idempotency_key UUID, completed_at NULL`.

### paypal_webhook_events
`paypal_event_id UNIQUE, event_type, payload JSON, received_at, processed_at NULL, processed_status NULL (completed|failed|cancelled|ignored|no_payment)`.

### audit_logs (sin updated_at)
`actor_id FK users NULL (NULL = sistema), action string, target_type NULL, target_id NULL, payload JSON NULL, created_at`. Índices (target_type, target_id) y action.

---

## 4. Enums y máquinas de estado

- `tournaments.status`: `draft → registration_open` (acción explícita del admin "Abrir inscripciones") `→ registration_closed → in_progress → finished`; `cancelled` terminal. El paso a `finished` es automático (ver §7). *Hueco conocido v1:* no existe acción que ponga `registration_closed`/`in_progress`; el ciclo de rondas funciona independientemente del status. Recomendado al reconstruir: fijar `in_progress` automáticamente al iniciar la R1.
- `tournament_registrations.status`: `pending_payment → active` (webhook de pago) ó `active` directo (gratis); `active → dropped` (baja). `pending_payment` se **borra** (no transiciona) si el pago falla/expira.
- `judge_applications.status`: `pending → approved | rejected`.
- `rounds.status`: `pending → active → finished`.
- `matches.status`:
```
                    ┌── disputed ──(juez resuelve)──┐
                    │                               ▼
pending → active → awaiting_confirmation ───→ finished
   │         │                                      ▲
   │         └(reportes coinciden directamente)─────┘
   ▼
forfeit_a / forfeit_b / forfeit_both   (check-in fallido, tiempo agotado, o resolución de juez)
bye  (asignado al generar pareos; nace terminal con su match_result)
```
  Estados terminales: `finished`, `bye`, `forfeit_a`, `forfeit_b`, `forfeit_both`.
- `judge_calls.status`: `open → in_progress → resolved` (resolved = chat solo lectura).
- `payments.status`: `created → completed | failed | cancelled` (`pending`, `refunded` reservados).

---

## 5. Motor suizo (lógica pura, 100 % testeable sin BD)

Implementar como módulos puros que reciben un **snapshot inmutable** del torneo: `{ pairingSeed, currentRoundNumber, players: [{id, dropped, droppedAfterRoundNumber}], matches: [{roundNumber, tableNumber, playerAId, playerBId, outcome, finishedAt}] }` donde `outcome ∈ {a_wins, b_wins, draw, bye, forfeit_a, forfeit_b, forfeit_both}` (solo matches terminales).

**Jugador activo para la ronda N** = no dropeado, o dropeado con `droppedAfterRoundNumber >= N` (juega su ronda actual; queda fuera a partir de la siguiente).

### 5.1 Tabla oficial (autorrelleno del wizard; el admin puede sobreescribir)

| Jugadores | Suizas | Top cut |
|---|---|---|
| 4–8 | 3 | 0 |
| 9–16 | 4 | 4 |
| 17–32 | 6 | 8 |
| 33–64 | 7 | 8 |
| 65–128 | 6 | 16 |
| 129–256 | 7 | 16 |
| 257–512 | 8 | 16 |
| 513–1024 | 9 | 32 |
| 1025–2048 | 10 | 32 |
| 2049+ | 10 | 64 |

### 5.2 Pareo Ronda 1
1. Barajado **reproducible** de los activos con RNG sembrado por la cadena `"{pairing_seed}:round:1"`.
2. Si el total es impar, el **último tras el barajado** recibe el bye.
3. Mesas 1..n en orden del barajado: (1º vs 2º), (3º vs 4º)…

### 5.3 Pareo Rondas 2+ (Monrad/Dutch)
1. Ranking de los activos con los desempates de §5.5 (orden completo).
2. **Bye** si el total es impar: el peor clasificado **que nunca haya recibido bye**; si todos lo recibieron, el peor absoluto. Se aparta antes de agrupar.
3. Agrupar por puntos de match (descendente), preservando el orden de ranking dentro del grupo.
4. De arriba abajo: si un grupo queda impar y no es el último, su **peor** jugador baja flotando y se antepone como **primer** (mejor) miembro del grupo siguiente.
5. Dentro de cada grupo: dividir en mitad alta (UH) y mitad baja (LH); intentar UH[i] vs LH[i]. Si algún cruce es **rematch** (consulta a pairing_history), backtracking determinista probando **permutaciones de LH en orden de generación** con un límite de **40320 intentos (8!)**.
6. Si un grupo no admite pareo sin rematches (o el flotado no tiene grupo que lo absorba) → excepción `ManualPairingRequired` **conservando los pareos parciales ya válidos**; la UI de admin abre el pareo manual con ese estado parcial.
7. Las mesas se numeran consecutivamente desde 1 en orden de grupos.

Al aplicar los pareos: los byes se crean con `status=bye, is_bye=true, finished_at=now` y su `match_result {result: bye, winner_id: jugador}` inmediato; cada cruce real inserta su fila en pairing_history.

### 5.4 Puntuación
- Victoria 3 · Empate 1 (solo tiene sentido en BO3) · Derrota 0.
- **Bye** = victoria (3 puntos), cuenta en partidas jugadas y en `byesReceived`, pero **no** añade oponente real.
- `forfeit_a`: gana B; `forfeit_b`: gana A; `forfeit_both`: **derrota para ambos**. Todos los forfeits cuentan como partida jugada para ambos y como oponentes reales mutuos.

### 5.5 Desempates (orden estricto)
1. **Puntos de match.**
2. **OWP**: media del MWP de los **oponentes reales** (los byes no son oponentes), donde `MWP(j) = (victorias + 0.5·empates) / partidasJugadas` (0.0 si no jugó). *Nota fiel a la implementación: sin suelo del 25 %.*
3. **OOWP**: `(Σ OWP de oponentes reales + 1.0 por cada bye recibido) / (nº oponentes reales + nº byes)`.
4. **finished_at más temprano del último match del jugador** (el timestamp máximo de sus matches; gana quien tenga ese máximo más antiguo). Sin timestamp = peor.
5. Empate residual: comparación lexicográfica de `sha256("{pairing_seed}:{playerId}")` — coin flip reproducible.

---

## 6. Ciclo de ronda

### 6.1 Generar pareos (admin)
Precondición: no hay ninguna ronda `pending` o `active` del torneo. Crea la ronda `round_number = max+1, phase=swiss, status=pending`, ejecuta el motor y aplica pareos. Si el motor lanza ManualPairingRequired, aplica los parciales y redirige a la pantalla de pareo manual con error visible.

### 6.2 Pareo manual (admin)
Muestra mesas ya creadas + jugadores activos sin parear. El admin añade parejas (o byes). Cada pareja nueva: mesa siguiente, pairing_history; bye: match terminal + resultado. *(Hueco v1: el servidor no re-valida rematches en el envío manual — añadirlo al reconstruir.)*

### 6.3 Iniciar ronda (admin)
Solo desde `pending`. En transacción: `status=active, started_at=now`, `ends_at = now + round_time_minutes` (**NULL si top cut**); todos los matches `pending → active` (los byes no se tocan); `tournaments.current_round_id = ronda`. Si es la **R1**: bloquear todas las decklists del torneo (`locked_at=now` donde sea NULL). Después: broadcast `round.started`; **programar job CheckInWindowExpired** con retardo `checkin_minutes`; **programar job RoundTimeExpired** con retardo hasta `ends_at` (solo si hay ends_at).

### 6.4 Check-in
Cada jugador pulsa "Listo" → sella `check_in_a_at`/`check_in_b_at` (idempotente). **Job CheckInWindowExpired** (si la ronda sigue `active`): por cada match `active` al que le falte algún check-in → `forfeit_b` (solo A presente), `forfeit_a` (solo B), `forfeit_both` (ninguno); crea match_result (winner = presente o NULL) con `finished_at=now`; broadcast `match.forfeited` con motivo `check_in`.

### 6.5 Reporte y confirmación
- Reportar requiere ser jugador del match y estado `active` o `awaiting_confirmation`. Valores: `win|loss|draw` + score libre opcional.
- **Primer reporte** → match a `awaiting_confirmation`, broadcast `match.awaiting_confirmation` (con id del oponente).
- **Reporte repetido del mismo jugador**: si coincide con el suyo anterior → no-op idempotente; si difiere → error 4xx "Ya reportaste un resultado distinto".
- **Segundo reporte (rival):** conciliación A/B → `win+loss` ⇒ `a_wins`/`b_wins` (winner correspondiente); `draw+draw` ⇒ `draw` (winner NULL); **cualquier otra combinación** ⇒ match `disputed` + broadcast `match.disputed` (sin match_result aún). Si concilia: match `finished`, `finished_at=now`, match_result con `resolved_by=NULL`, broadcast `match.finished`.
- En BO1 la UI no ofrece "Empate" *(matiz v1: la implementación actual muestra el selector completo; el backend acepta draw — al reconstruir, ocultar draw si `swiss_bo=1`)*.

### 6.6 Tiempo agotado (job RoundTimeExpired, solo suizas)
Si la ronda sigue `active`: cada match `active` con **cero reportes** → `forfeit_both` + match_result (winner NULL) + broadcast `match.forfeited` motivo `round_time`. Matches con algún reporte o en `awaiting_confirmation` se quedan como están (los resuelve la confirmación, un juez o el admin antes de cerrar).

### 6.7 Disputas
Aparecen en la cola de jueces. El resolutor ve ambos reportes (quién, qué, score, hora) y elige `a_wins|b_wins|draw|forfeit_a|forfeit_b|forfeit_both` + score opcional. Validación: el winner_id debe corresponder al resultado (a_wins/forfeit_b ⇒ jugador A; b_wins/forfeit_a ⇒ B; draw/forfeit_both ⇒ NULL). Efecto: match a estado terminal correspondiente (`finished` o `forfeit_*`), match_result con `resolved_by = juez`, broadcast `match.finished`, entrada de auditoría.

### 6.8 Cerrar ronda (admin, manual)
Validación: **todos** los matches en estado terminal; si la ronda es de top cut, además **ningún resultado `draw`** (error explícito). Efecto: ronda `finished, closed_at=now`; broadcasts `round.finished` y `standings.updated`; invalidar la caché de clasificación. Después, según fase:
- **Suiza no última** → nada más (admin generará la siguiente).
- **Última suiza** y `top_cut_size = 0` → torneo `finished` + broadcast `tournament.finished`.
- **Última suiza** y `top_cut_size > 0` → sembrar top cut (§7).
- **Top cut** → avanzar bracket (§7).

### 6.9 Bajas (drop)
El jugador se da de baja en cualquier momento: `status=dropped, dropped_at=now, dropped_after_round_id = current_round_id` (NULL si el torneo no empezó). Sigue disputando su ronda en curso; el pareo siguiente lo excluye. En la clasificación aparece marcado "(retirado)". La plaza **no** se libera para nuevas inscripciones (el UNIQUE persiste).

---

## 7. Top cut (eliminación directa)

- **Siembra** al cerrar la última suiza: ranking final (§5.5) **excluyendo dropeados**; tamaño efectivo = **mayor potencia de 2 ≤ min(top_cut_size configurado, activos)**; si < 2, el torneo termina directamente. Cruces de la primera ronda del cut: seed i vs seed (S+1−i) en mesa/`bracket_position` i, para i = 1..S/2 → T4: (1v4),(2v3); T8: (1v8),(2v7),(3v6),(4v5); etc. Matches `pending`, sin byes de siembra. Broadcast `pairings.published`.
- **Rondas de cut**: `ends_at = NULL` (sin timer; "se juega a finalizar"); el job de tiempo **no** se programa; la ventana de **check-in sí** aplica (no-show ⇒ forfeit como en suizas). Sin empates: la conciliación draw+draw produciría `draw` — por eso el cierre lo bloquea y debe resolverse vía disputa/juez. BO según `top_cut_bo`.
- **Avance** al cerrar cada ronda de cut con K posiciones: ganador de la posición j se cruza con el ganador de la posición **K+1−j** (orden "fold": reproduce el bracket estándar sin re-sembrado; con la siembra anterior, las semifinales de un T8 quedan 1v4 y 2v3 si no hay sorpresas). K se calcula como la menor potencia de 2 ≥ max(nº matches, posición máxima), para tolerar huecos.
  - Si una posición no tiene ganador (`forfeit_both`): su rival en el cruce recibe un **bye** (match terminal con resultado bye).
  - Si **ambas** posiciones de un cruce están vacías: no se crea match y el hueco se propaga a la siguiente ronda.
  - Si ninguna posición tiene ganador en absoluto: el torneo termina sin campeón.
- **Final** (K=1) cerrada → torneo `finished` + broadcast `tournament.finished` con el campeón (winner de la final; NULL si doble forfeit). El campeón se **deriva** del match de la final (no se persiste en columna).

---

## 8. Inscripciones y pagos

### 8.1 Cupo y concurrencia
El cupo cuenta `active + pending_payment` (un pago en curso **reserva plaza**). La inscripción corre en una transacción con **lock de la fila del torneo** (SELECT … FOR UPDATE) para que dos inscripciones simultáneas no rebasen `max_players`. Sin lista de espera: lleno ⇒ error 422 "Torneo lleno". Duplicado ⇒ 422 "Ya estás inscrito en este torneo".

### 8.2 Flujo gratuito
Form: `full_name` (≤120), `tcg_live_username` (≤60), `email` (precargado), `phone` opcional. Validaciones de §8.1 + torneo `registration_open` + email verificado. Crea el registro `active`, dispara broadcast `registration.created` (canal del admin) y **encola el email "Inscripción confirmada"**. Devuelve redirección a la página pública del torneo.

### 8.3 Flujo de pago
1. Igual que el gratuito pero registro `pending_payment` + fila `payments` (`status=created`, `paypal_order_id` provisional único, `idempotency_key` UUID) **dentro de la misma transacción**.
2. Fuera del lock: crear la orden PayPal servidor-a-servidor (Checkout v2, intent CAPTURE, importe `fee_amount/100` con divisa, URLs de retorno/cancelación). Si PayPal falla: borrar payment+registro (libera plaza) y error 422.
3. Guardar el `order_id` real, **programar job ExpirePendingRegistration con retardo de 30 min**, y redirigir el navegador a la URL de aprobación de PayPal.
4. Páginas de retorno: `/torneo/{slug}/pago/volver` → "Procesando tu pago…" (la promoción real llega por webhook); `/pago/cancelar` → página de pago cancelado.
5. **Webhook PayPal** (POST público, exento de CSRF):
   - Verificar la firma con la API de PayPal usando las cabeceras `paypal-transmission-id/-time/-sig, paypal-cert-url, paypal-auth-algo` y el body crudo. **Firma inválida ⇒ 200 OK sin procesar** (no dar pistas).
   - Idempotencia: insertar `paypal_event_id` UNIQUE; si ya existe ⇒ 200 OK y fin.
   - Responder 200 inmediatamente y procesar en **job asíncrono**: localizar el payment por `order_id` (en `resource.supplementary_data.related_ids.order_id` o `resource.id`); tipos manejados:
     - `PAYMENT.CAPTURE.COMPLETED` → payment `completed` (+capture_id, completed_at), registro → `active`, **email "Pago confirmado"**, broadcast.
     - `PAYMENT.CAPTURE.DENIED` → payment `failed`, **borrar el registro** (libera plaza).
     - `CHECKOUT.ORDER.VOIDED` → payment `cancelled`, borrar el registro.
     - Cualquier otro tipo → marcar `ignored`. Sin payment asociado → `no_payment`.
   - Cada evento procesado se marca con `processed_at`/`processed_status` y deja entrada de auditoría.
6. **Job ExpirePendingRegistration** (a los 30 min): si el registro sigue `pending_payment` → cancelar la orden en PayPal, borrar el registro, payment `cancelled`. Libera la plaza.

---

## 9. Decklists

**Formato de entrada** (textarea, export de TCG Live):
```
Pokémon: 12
4 Charizard ex OBF 125
3 Charmander MEW 4

Trainer: 36
4 Arven OBF 186

Energy: 12
12 Basic Fire Energy SVE 230
```

**Parser:** ignora líneas vacías y comentarios (`#`, `//`). Cabeceras de sección `Pokémon:|Trainer:|Energy:` (con o sin tilde, case-insensitive) cambian la sección actual; líneas antes de la primera cabecera se ignoran. Línea de carta: regex `^(\d+)\s+(.+?)\s+([A-Z]{2,6})\s+(\S+)$` → cantidad / nombre / set (2–6 mayúsculas) / número (último token). Cantidad ≤ 0 se ignora. Salida JSON: `{pokemon:[{quantity,name,set,number}], trainer:[], energy:[], total}`.

**Validación al guardar** (server-side, mensajes en español): total **exactamente 60** y **al menos 1 carta en la sección Pokémon**. Sin lista de baneos ni legalidad (v2).

**Ciclo de vida:** crear/editar libremente mientras el torneo esté en `registration_open`/`registration_closed` y el jugador tenga registro `active`; **al iniciar la R1 se sella `locked_at`** y la UI pasa a solo lectura. Visibilidad: dueño, admin del torneo, jueces aprobados, superadmin (listado con jugador/total/fechas + detalle con secciones parseadas y texto crudo).

---

## 10. Jueces: solicitudes, llamadas, chat y disputas

### 10.1 Solicitud de juez
Botón en la página pública (solo útil para usuarios con rol `judge`; el backend lo exige). Crea `pending`; el admin aprueba/rechaza desde su panel (sella decided_at/decided_by, audita). Aprobado ⇒ acceso a las herramientas de juez de **ese** torneo.

### 10.2 Llamadas a juez
- El jugador, desde "Mi match", pulsa **"Llamar juez"** → crea `judge_calls(open)`. **Idempotente**: si ya tiene una llamada viva (open/in_progress) en ese match, se reutiliza. Broadcast `judge_call.created` al canal de jueces del torneo. Rate limit 3/min.
- UI del jugador: "Esperando juez…" + chat embebido en su página de match.
- **Cola del juez** (`/juez/cola`): llamadas `open`+`in_progress` y **matches `disputed`** de todos los torneos donde el usuario es juez aprobado o admin (superadmin: todos). Las disputas se listan como tipo distinto con enlace a su pantalla de resolución. La página se auto-refresca (realtime y/o poll de 10 s).
- **Atender**: transición `open → in_progress` + `assigned_judge_id` bajo lock (dos jueces simultáneos: solo uno gana; el otro recibe error). Broadcast `judge_call.taken`.
- **Chat**: mensajes persistidos (≤2000 chars) con broadcast `judge_call.message` (payload completo del mensaje). Pueden escribir los autorizados de §2 mientras no esté `resolved`.
- **Resolver**: estado `resolved` + `resolved_at` (si nadie la había atendido, queda asignada al resolutor). Chat pasa a **solo lectura** y se conserva como auditoría. Broadcast `judge_call.resolved`.

---

## 11. Tiempo real (WebSockets)

Protocolo tipo Pusher (implementación de referencia: Laravel Reverb autohospedado; equivalentes: Pusher, Ably, Soketi). **La app debe funcionar sin WebSocket**: los hooks degradan a recarga manual o polling suave (cola de jueces 10 s, chat 5 s).

### Canales y autorización

| Canal | Tipo | Acceso |
|---|---|---|
| `public.tournament.{public_id}` | público | cualquiera |
| `private-tournament.{id}.player.{userId}` | privado | solo ese usuario con registro `active` o `dropped` en el torneo |
| `private-tournament.{id}.judges` | privado | jueces aprobados, admin del torneo, superadmin |
| `private-tournament.{id}.admin` | privado | admin del torneo, superadmin |
| `private-match.{matchId}` | privado | los 2 jugadores, jueces aprobados, admin, superadmin |
| `private-judge_call.{callId}` | privado | creador, juez asignado, jueces aprobados, admin, superadmin |

### Eventos

| Evento | Canales | Payload |
|---|---|---|
| `round.started` | público | round_id, round_number, phase, ends_at, **server_now** |
| `round.finished` | público | round_id, round_number, phase |
| `pairings.published` | público | round_id, round_number, phase |
| `standings.updated` | público | tournament_id |
| `tournament.finished` | público | tournament_id, champion {id,name} \| null |
| `match.awaiting_confirmation` | match | match_id, opponent_user_id |
| `match.finished` | match + público | match_id, round_id, table_number, status |
| `match.disputed` | match + judges | match_id, round_id, table_number, tournament_slug |
| `match.forfeited` | match + público | match_id, round_id, table_number, status, reason (`check_in`\|`round_time`) |
| `registration.created` | admin | registration_id, tournament_id, full_name, status |
| `judge_call.created` | judges | call_id, tournament_id, match_id, table_number |
| `judge_call.taken` | judge_call + judges | call_id, assigned_judge {id,name} |
| `judge_call.message` | judge_call | message_id, call_id, sender {id,name}, message, sent_at |
| `judge_call.resolved` | judge_call + match + judges | call_id, match_id, resolved_at |

Los eventos de listas (standings/pairings) son **ligeros**: notifican y el cliente hace recarga parcial de datos. Importante: emitir los eventos **después del commit** de la transacción que los origina.

### Timers autoritativos
El servidor comparte `server_now` (ISO) en cada respuesta de página. El cliente calcula una sola vez `offset = server_now − Date.now()` y pinta `remaining = ends_at − (Date.now()+offset)` con tick de 1 s. Color de aviso con < 2 min. El servidor **nunca** confía en relojes de cliente; las expiraciones reales son los jobs programados.

---

## 12. Rutas y páginas

### Público (sin auth; los torneos `draft` devuelven 404)
| Ruta | Contenido |
|---|---|
| `/` | Landing: torneos con inscripción abierta, en curso (`registration_closed`+`in_progress`), y últimos 10 terminados; nombre, fecha, plazas, cuota (céntimos→“X,XX EUR” o “Gratis”) |
| `/torneo/{slug}` | Ficha: descripción, formato (rondas/BO/cut), cuota, barra de inscritos `active`/max, y según contexto: login requerido, verificar email, formulario de inscripción (modal con full_name/tcg_live/email/phone), "Torneo lleno", "Ya estás inscrito" + botón de baja, botón "Solicitar ser juez". Sub-navegación: Torneo · Clasificación · Ronda actual |
| `/torneo/{slug}/clasificacion` | Tabla: #, jugador (full_name; "(retirado)" si dropped), usuario TCG Live, puntos, récord W-L-D, OWP %, OOWP % (4 decimales internos, pintados al 2 %). Sección **Top cut** con columnas por ronda (matches con ganador en negrita, BYE). Banner 🏆 campeón si `finished`. Auto-refresh por `standings.updated`/`round.finished`/`match.finished` |
| `/torneo/{slug}/pareos/ronda/{n}` | Selector de rondas existentes + tabla mesa/jugadorA/jugadorB(o BYE)/resultado (etiquetas: Victoria A/B, Empate, BYE, Forfeit A/B, Doble forfeit, Pendiente). 404 si la ronda no existe. Auto-refresh |
| `/torneo/{slug}/ronda-actual` | Fase + número + estado + **timer gigante mm:ss** (si activa con ends_at) o "Sin límite de tiempo" (top cut). Vacío: "no hay ronda en marcha" / "torneo terminado". Enlace a los pareos |
| `/health` | 200 `{status:ok,time}` (liveness) |
| `/ready` | `{status, checks:{database,cache}}`; 503 si algo falla (readiness) |

### Autenticación (estándar)
Registro (asigna rol `player`, dispara email de verificación), login (throttle 5 intentos), verificación obligatoria, recuperación de contraseña, perfil (editar datos, cambiar contraseña, borrar cuenta). Sesiones cookie httpOnly + CSRF.

### Jugador (auth + verificado)
| Ruta | Contenido |
|---|---|
| `/mi/torneos` | Sus inscripciones con estado y accesos directos (decklist, match actual) |
| `/torneo/{slug}/mi-decklist` | Textarea + resultado del parser con errores de validación; solo lectura tras lock |
| `/torneo/{slug}/match-actual` | Cabecera (ronda, mesa, rival), timer, check-in propio y del rival, formulario de reporte (resultado+score), estados awaiting/disputed/finished, sección **Juez** (botón llamar / "Esperando juez…" / "Te atiende: X" + chat). 404 si no hay match en la ronda actual (los byes no tienen página). Suscrito a su canal de match + público |
| POST inscribirse / baja / decklist / checkin / reportar / llamar-juez | Acciones anteriores |

### Juez (auth + verificado; el contenido se limita a sus torneos)
`/juez/cola` (disputas + llamadas, con Atender/Abrir), `/juez/call/{id}` (detalle + chat + Atender/Resolver según permisos), `/juez/disputa/{matchId}` (reportes enfrentados + formulario de resolución), `/juez/torneo/{slug}/decklists` y detalle.

### Admin (auth + verificado + rol admin/superadmin)
`/admin/torneos` (suyos), `/admin/torneos/crear` (wizard 4 pasos: básicos → capacidad/formato con autorrelleno de la tabla oficial → tiempos → pago opcional; validaciones: name ≤255, start_at futura, max_players 4–9999, swiss_rounds 1–15, round_time 10–240, checkin 1–60, BO ∈{1,3}, top_cut_size ∈{0,4,8,16,32,64}, fee 0–1.000.000 céntimos, paypal_account email obligatorio si fee>0; crea en `draft`), botón **"Abrir inscripciones"** (`draft→registration_open`), `/admin/torneos/{slug}/registros`, `/jueces` (aprobar/rechazar), `/decklists` (+detalle), `/admin/torneo/{slug}/rondas` (lista con fase/estado/recuento de matches por estado + botones Generar pareos (solo hasta swiss_rounds; el cut es automático) / Iniciar / Cerrar) y `/rondas/{id}/pareo-manual`.

### Superadmin
`/superadmin/usuarios`: paginado 25, asignar/revocar roles (no a sí mismo; revocar solo admin/judge), todo auditado.

---

## 13. Emails (4, en español, layout transaccional simple)

1. **Verificación de cuenta** — asunto "Verifica tu dirección de email", botón con URL firmada y caducidad.
2. **Recuperación de contraseña** — "Recuperación de contraseña", enlace con caducidad (60 min).
3. **Inscripción confirmada** (flujo gratuito) — asunto `Inscripción confirmada — {torneo}`; saluda por full_name, fecha de inicio, recordatorio de decklist, enlace al torneo. **Encolado**, destinatario = email del formulario de inscripción.
4. **Pago confirmado** (webhook completed) — asunto `Pago confirmado — {torneo}`, importe formateado `1.234,56 EUR`. Encolado.

En desarrollo el mailer escribe a log y existe un **visor `/debug/mail`** (solo entorno local) que parsea los últimos 20 emails del log y los muestra renderizados. Producción: SMTP del proveedor.

---

## 14. Hardening y operación

- **Rate limits**: login 5/min (por email+IP), reset de contraseña 3/h (IP), reportar resultado 10/min (usuario), llamar juez 3/min (usuario), crear torneo 10/h (usuario). Respuesta 429.
- **Auditoría** (`audit_logs`): `role.assigned`, `role.revoked` (payload: role), `dispute.resolved` (result, score), `round.closed` (tournament_id, round_number), `round.manual_pairing` (nº parejas), `judge_application.approved/rejected`, `paypal.webhook_processed` (actor NULL; event_type, payment_id, status). El logger **nunca lanza** (un fallo de auditoría no rompe la operación).
- **Clasificación cacheada** por torneo (TTL 6 h) e **invalidada** al cerrar ronda / terminar torneo (listener del evento). Pareo de ≤256 jugadores se calcula en milisegundos: no necesita job.
- **Errores**: páginas de error propias (es) para 401/403/404/429/500/503 en producción; 419 (CSRF caducado) → volver atrás con flash "La página expiró". Validaciones server-side con mensajes en español; el cliente solo añade UX.
- **Seguridad**: CSRF en todo salvo el webhook PayPal; verificación de firma del webhook; passwords bcrypt; cookies httpOnly/SameSite=Lax; HTTPS-only en prod; sin SQL crudo; salida escapada por el framework de UI; IDs públicos no enumerables (slug + ULID).
- **Identificadores**: URLs públicas siempre por `slug`; el canal realtime público usa `public_id` (ULID).

---

## 15. Configuración, procesos y seeds

**Procesos en producción (4):** servidor web · servidor WebSocket · worker de cola (jobs: timers de ronda, expiración de pagos, webhooks, broadcasts, emails) · cron/scheduler. Todos contra la misma BD y el mismo Redis (cola/caché/sesiones). Desarrollo: SQLite + cola database + caché file funcionan.

**Variables de entorno clave:** `APP_LOCALE=es`, `DB_*`, `QUEUE_CONNECTION`, `CACHE_STORE`, `SESSION_DRIVER`, `MAIL_*`, `SUPERADMIN_EMAIL/PASSWORD/NAME` (seeder), `PAYPAL_MODE/CLIENT_ID/CLIENT_SECRET/WEBHOOK_ID`, credenciales WebSocket (app id/key/secret/host/port) duplicadas para el cliente.

**Seeders:** roles (4) · superadmin desde env (falla si no hay contraseña) · datos demo opcionales (2 torneos: uno con inscripciones abiertas y otro en curso con R1 jugada y R2 activa con timer; jugadores `jugador1..6@demo.test` / `password`).

---

## 16. Criterios de aceptación (resumen de la suite real: 359 tests)

Cobertura mínima a replicar, por área:
- **Motores (unit, sin BD):** pareo R1 reproducible por seed y bye al impar; pareo suizo por grupos con float-down; evitación de rematches con backtracking y excepción manual; selección de bye (sin repetir hasta agotar); scoring completo (byes, forfeits, draws); OWP/OOWP con los matices de byes; orden total de desempates; siembra del top cut (patrones 1vN) y exclusión de dropeados; parser TCG Live (secciones, comentarios, regex, tildes) y validador (60 cartas, ≥1 Pokémon); tabla oficial de rondas.
- **Ciclo de ronda (integración):** generar/iniciar/cerrar con todas las precondiciones y efectos (lock de decklists en R1, current_round_id, jobs con retardo correcto); check-in expirado (3 variantes de forfeit); tiempo agotado (solo matches sin reportes); reporte idempotente/conflictivo; disputa y resolución con validación de winner; cierre bloqueado con matches vivos.
- **Top cut:** siembra al cerrar última suiza (posiciones y jugadores exactos), clamp de tamaño, ronda sin ends_at ni job de tiempo, avance fold con sorpresas, bye por forfeit_both, bloqueo de draws, final → campeón y torneo finished, 0 activos → finished.
- **Inscripciones/pagos:** flujo gratis (validaciones, cupo con carrera, duplicado, email encolado), flujo pago (orden PayPal, redirect, rollback si falla), webhook (firma inválida→200 inerte, idempotencia por event id, completed/denied/voided, sin payment), expiración a 30 min.
- **Jueces:** crear llamada idempotente, atender/atender dos veces, chat (permisos, persistencia, solo-lectura tras resolver), cola scoping (aprobado/admin/ajeno/vacía), disputas (ver/resolver/forfeits/404 si no disputado/juez ajeno 403), decklists de juez (aprobado sí, pendiente no, extraño no).
- **Realtime:** autorización de los 6 canales con todos los perfiles (200/403); definición de eventos (canales y payloads).
- **Páginas públicas:** landing (filtra drafts), clasificación (orden, puntos, récord, dropped), pareos (datos y 404), ronda actual (con y sin ronda), campeón+bracket.
- **Hardening:** /health, /ready, rate limit de llamadas (4ª → 429), auditoría de roles/disputas/cierres.
- **Auth/roles:** registro asigna player, verificación obligatoria, policies de cada recurso, middleware superadmin/admin, locale es.

---

## 17. Decisiones cerradas y huecos conocidos

**Decisiones (no reabrir):** entrega v1 completa de una vez · español único · PayPal único método · timers solo en servidor · top cut sin tiempo y sin draws · decklists invisibles a otros jugadores · desempate final por timestamp del último match y luego hash con seed · el bye otorga 3 puntos y OWP=1.0 solo a efectos de OOWP · forfeit doble = derrota para ambos · emails mínimos (4).

**Huecos conocidos / deliberados v1 (candidatos a v2):** transición automática a `registration_closed`/`in_progress` · re-validación de rematches en pareo manual · ocultar "Empate" en la UI de reporte cuando BO1 · legalidad/baneos de decklists · más pasarelas de pago · i18n · PWA/push · bracket visual avanzado · import TOM/RK9 · estadísticas históricas · suelo del 25 % en OWP si se quiere paridad exacta con el reglamento oficial de Pokémon.

---

## 18. Guía de mapeo a un stack JavaScript (sugerencia)

| Concepto de esta spec | Equivalente sugerido |
|---|---|
| Backend + SSR | **Next.js (App Router)**: Server Components para páginas, Server Actions/Route Handlers para mutaciones |
| BD + ORM | PostgreSQL + **Prisma** (el modelo de §3 se traduce 1:1; usar `@@unique` compuestos) |
| Auth + roles + verificación email | **Auth.js**/Lucia + tabla de roles propia; middleware por segmento (`/admin`, `/juez`, `/superadmin`) |
| Policies | funciones `can(user, action, resource)` puras compartidas entre servidor y autorización de canales |
| Motores (pareo/scoring/tiebreakers/parser) | **módulos TypeScript puros sin IO** con los mismos tests unitarios — es la parte más valiosa de portar tal cual (§5, §7, §9) |
| Jobs con retardo (check-in, tiempo, expiración pago) | **BullMQ** (Redis) con `delay`; alternativa serverless: QStash/Inngest. ⚠️ Son retardos de minutos exactos, un cron de 1 min no basta para el check-in de 5 min |
| WebSockets (protocolo Pusher) | **Soketi** (autohospedado, compatible Pusher) o Pusher/Ably; mismo esquema de canales/eventos de §11; endpoint propio de autorización de canales privados |
| Inertia partial reload | `router.refresh()` selectivo / re-fetch de queries al recibir eventos |
| Mailables encolados | Resend/Nodemailer + plantillas react-email; encolar el envío |
| Webhook PayPal | Route Handler con **body crudo** para verificación de firma (cuidado con el parseo automático) |
| Transacción + lock del cupo | `prisma.$transaction` + `SELECT ... FOR UPDATE` (raw) sobre la fila del torneo |
| Caché de clasificación | Redis con clave por torneo + invalidación en el cierre de ronda |

**Orden de construcción recomendado** (replica el histórico que funcionó): 1) auth+roles+seeds → 2) CRUD torneo+wizard+página pública → 3) inscripciones gratis+decklists+solicitudes de juez → 4) PayPal+webhooks → 5) motores puros con TDD → 6) ciclo de ronda+jobs → 7) realtime → 8) llamadas a juez+disputas → 9) top cut → 10) páginas públicas+hardening. Tras cada fase: suite verde y app arrancable.
