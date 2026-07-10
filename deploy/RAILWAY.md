# Desplegar Trainer Arena en Railway

Guía para usar [Railway](https://railway.com) como host de producción.
Alternativa al despliegue con VPS + Docker Compose descrito en `DEPLOY.md`.

**Por qué no se pierden datos al actualizar:** Postgres y Redis son servicios
independientes con volumen persistente propio. Un `git push` solo reconstruye
y redespliega `api` y `web`; los volúmenes de datos no se tocan. La API aplica
las migraciones pendientes al arrancar (`prisma migrate deploy`), que modifica
el esquema **sin borrar datos**.

**Coste estimado:** plan Hobby ($5/mes con $5 de uso incluidos). Este stack
(api + web + Postgres + Redis 24/7) suele quedar en $10–20/mes según tráfico.

---

## 1. Crear el proyecto y las bases de datos

1. Crea cuenta en railway.com (plan Hobby) y conecta tu cuenta de GitHub.
2. Sube este repo a GitHub (privado vale).
3. **New Project** → **Deploy PostgreSQL**. Añade también **Redis**
   (botón `+ Create` → Database → Redis).
4. Redis para BullMQ necesita `noeviction`. Con el CLI de Railway
   (`npm i -g @railway/cli`, `railway login`, `railway link`):

   ```bash
   railway connect Redis
   CONFIG SET maxmemory-policy noeviction
   ```

## 2. Servicio `api`

1. `+ Create` → **GitHub Repo** → selecciona el repo. Renombra el servicio a
   `api` (Settings → Service name) — el nombre importa: define su dominio
   privado `api.railway.internal`.
2. Settings → **Config-as-code** → Railway config file:
   `deploy/railway/api.json` (usa `Dockerfile.api` y healthcheck `/health`).
3. Variables (pestaña **Variables**, botón *Raw Editor*). Las `${{...}}` son
   referencias de Railway y se resuelven solas:

   ```env
   NODE_ENV=production
   APP_LOCALE=es
   APP_URL=https://trainerapp.app
   API_PORT=3000

   DATABASE_URL=${{Postgres.DATABASE_URL}}
   REDIS_URL=${{Redis.REDIS_URL}}

   # Genera con: openssl rand -hex 32  (NUNCA los de desarrollo)
   SESSION_SECRET=
   SESSION_COOKIE_NAME=trainerarena_session
   APP_KEY=

   # SMTP transaccional (Brevo: smtp-relay.brevo.com:587, secure=false)
   MAIL_HOST=
   MAIL_PORT=587
   MAIL_SECURE=false
   MAIL_USER=
   MAIL_PASSWORD=
   MAIL_FROM_ADDRESS=torneos@trainerapp.app
   MAIL_FROM_NAME=Trainer Arena

   # Primer arranque (seed)
   SUPERADMIN_EMAIL=
   SUPERADMIN_PASSWORD=
   SUPERADMIN_NAME=
   SEED_DEMO=false

   # reCAPTCHA v3 (claves para tu dominio en google.com/recaptcha/admin)
   RECAPTCHA_SITE_KEY=
   RECAPTCHA_SECRET_KEY=
   RECAPTCHA_MIN_SCORE=0.5
   ```

   > Sin variables `PUSHER_*` el realtime degrada a polling y todo funciona.
   > Para WebSockets reales, ver §7 (Soketi, opcional).

4. Deploy. El primer build tarda varios minutos (instala el monorepo entero).
   Al arrancar aplica las migraciones automáticamente.

## 3. Servicio `web`

1. `+ Create` → **GitHub Repo** → el mismo repo. Renómbralo a `web`.
2. Settings → Config-as-code: `deploy/railway/web.json`
   (usa `Dockerfile.web` y healthcheck `/healthz`).
3. Variables:

   ```env
   NODE_ENV=production
   PORT=4000
   API_URL=http://${{api.RAILWAY_PRIVATE_DOMAIN}}:3000
   ```

   `API_URL` alimenta dos cosas: las peticiones del SSR y el proxy `/api`
   del servidor Express (`apps/web/src/server.ts`), que reenvía el tráfico
   del navegador a la API por la red privada. Así todo es same-origin y la
   cookie de sesión funciona sin CORS.

4. Settings → **Networking** → Generate Domain (puerto **4000**). Comprueba
   que `https://<web>.up.railway.app` carga y que login funciona
   (si reCAPTCHA aún no tiene claves, deja `RECAPTCHA_SECRET_KEY` vacío
   temporalmente — el guard se desactiva solo).

> La API no necesita dominio público: solo se le llega a través del proxy
> del servicio web. No generes dominio para `api`.

## 4. Seed inicial (una sola vez)

Con el CLI enlazado al proyecto:

```bash
railway ssh --service api
node seed/seed.js
exit
```

Crea el superadmin a partir de `SUPERADMIN_*`. (`SEED_DEMO=false` evita los
datos de demostración.)

## 5. Dominio propio (trainerapp.app)

1. Servicio `web` → Settings → Networking → **Custom Domain** →
   `trainerapp.app`.
2. Railway te da un registro CNAME. Ojo: un apex (`trainerapp.app` sin `www`)
   necesita un DNS con *CNAME flattening* (Cloudflare gratis lo hace; en
   Cloudflare usa modo DNS-only o Full (strict) para el proxy). Alternativa:
   usa `www.trainerapp.app`.
3. Cuando el dominio esté activo, actualiza `APP_URL` en `api` y las claves
   reCAPTCHA para ese dominio. El TLS lo emite Railway automáticamente
   (recuerda: `.app` es HTTPS-only por HSTS-preload).

## 6. Actualizaciones y backups

- **Actualizar la app:** `git push` a `main`. Railway reconstruye `api` y
  `web`, la API aplica las migraciones nuevas al arrancar y Postgres/Redis
  ni se enteran. Cero pérdida de datos.
- **Backups:** servicio Postgres → pestaña **Backups** → activa los backups
  diarios del volumen. Para un dump manual:

  ```bash
  railway connect Postgres   # abre psql
  # o bien, con el TCP proxy del servicio, pg_dump desde tu máquina
  ```

- **Rollback:** cada deploy queda en el historial del servicio; *Redeploy*
  sobre uno anterior restaura el código (los datos no se ven afectados).

## 7. Opcional: WebSockets con Soketi

Sin esto la app funciona con polling. Para tiempo real:

1. `+ Create` → **Docker Image** → `quay.io/soketi/soketi:1.6-16-alpine`,
   nombre `soketi`. Variables: `SOKETI_DEFAULT_APP_ID`,
   `SOKETI_DEFAULT_APP_KEY`, `SOKETI_DEFAULT_APP_SECRET`
   (genera key/secret con `openssl rand -hex 16`).
2. Genera dominio público para `soketi` (puerto **6001**).
3. En `api` añade:

   ```env
   PUSHER_APP_ID=trainerarena
   PUSHER_APP_KEY=<la key>
   PUSHER_APP_SECRET=<el secret>
   PUSHER_HOST=${{soketi.RAILWAY_PRIVATE_DOMAIN}}
   PUSHER_PORT=6001
   PUSHER_USE_TLS=false
   PUBLIC_PUSHER_HOST=<dominio-publico-de-soketi>
   PUBLIC_PUSHER_PORT=443
   PUBLIC_PUSHER_USE_TLS=true
   ```

## Solución de problemas

| Síntoma | Causa probable |
|---|---|
| 502 en `/api/*` | `API_URL` mal puesto en `web`, o la API caída (mira sus logs) |
| Login devuelve 200 pero luego 401 | Redis no accesible desde la API (`REDIS_URL`) |
| El healthcheck de `api` no pasa | Migraciones fallando al arrancar — logs del deploy |
| Emails no llegan | `MAIL_*` sin rellenar o dominio sin SPF/DKIM en Brevo |
| reCAPTCHA rechaza todo | Claves creadas para otro dominio |
