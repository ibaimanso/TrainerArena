# Puesta en producción — Trainer Arena (dominio trainerapp.app)

Esta guía te lleva de cero a la web online en **https://trainerapp.app**, con
servidor gratis (Oracle Cloud Always Free) y HTTPS automático. Único coste: el
dominio `.app` (~14 €/año).

Claude ya dejó hecho: secretos generados (`.env.production.local`, ya apuntando a
trainerapp.app), scripts de arranque y backup, y el build de producción validado.
Aquí solo queda lo que **solo puedes hacer tú** (crear cuentas y pegar unos datos).

---

## Resumen de lo que falta (tu parte)

| # | Tarea | Dónde | Tiempo |
|---|-------|-------|--------|
| 1 | Comprar el dominio `trainerapp.app` | Porkbun / Cloudflare | 5 min |
| 2 | Crear servidor gratis | Oracle Cloud | 20 min |
| 3 | Apuntar el dominio a la IP del servidor | tu registrador | 5 min |
| 4 | Cuenta de email transaccional | Brevo | 10 min |
| 5 | Claves anti-bot | Google reCAPTCHA v3 | 5 min |
| 6 | Rellenar email/recaptcha en `.env` + datos legales | — | 5 min |
| 7 | Lanzar `deploy/go-live.sh` | servidor | 1 comando |

---

## 1. Comprar el dominio (trainerapp.app)

1. Entra en [Porkbun](https://porkbun.com) (incluye privacidad WHOIS y SSL gratis,
   y te deja gestionar el DNS con comodidad) o [Cloudflare](https://www.cloudflare.com/products/registrar/).
2. Busca `trainerapp.app` y complétalo (~14 €/año).
3. Deja la pestaña del **DNS** a mano: la usarás en el paso 3.

> `.app` está en la lista HSTS-preload: **solo funciona por HTTPS**. No es problema —
> Caddy emite el certificado solo. Solo significa que `http://` siempre redirige a `https://`.

---

## 2. Servidor gratis (Oracle Cloud Always Free)

Es el único "siempre gratis" que aguanta todo el stack (Postgres + Redis + Soketi
+ API + SSR).

1. Regístrate en https://www.oracle.com/cloud/free/ (pide tarjeta para verificar,
   **no cobra** en el tier Always Free).
2. Crea una **instancia de cómputo**:
   - Imagen: **Ubuntu 22.04**
   - Forma (shape): **VM.Standard.A1.Flex** (ARM Ampere) — elige 2 OCPU / 12 GB
     (entra de sobra en lo gratis).
   - Guarda la **clave SSH** que te da (la necesitas para entrar).
3. Anota la **IP pública** de la instancia.
4. Abre los puertos 80 y 443:
   - En el panel: *Virtual Cloud Network → Security List → Add Ingress Rules*
     para TCP **80** y **443** desde `0.0.0.0/0`.
   - Ubuntu en Oracle trae el firewall cerrado; entra por SSH y ejecuta:
     ```bash
     sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT
     sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT
     sudo netfilter-persistent save
     ```

> ⚠️ **Nota ARM**: esta VM es ARM64 y el `Dockerfile` se validó en amd64.
> bcrypt y Prisma traen binarios ARM, así que al reconstruir en el servidor
> *debería* funcionar. Si algo falla en el build, la alternativa sin fricción es
> un VPS amd64 de pago barato (Hetzner CX22, ~4 €/mes); el resto de la guía es idéntico.

### Instalar Docker en el servidor
```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER && newgrp docker
```

---

## 3. Apuntar el dominio a tu servidor (DNS)

En el panel DNS de tu registrador (Porkbun/Cloudflare), crea **dos registros A**
hacia la IP pública del servidor Oracle:

| Tipo | Nombre | Valor |
|------|--------|-------|
| A | `@`   | IP-de-tu-servidor |
| A | `www` | IP-de-tu-servidor |

> Si usas Cloudflare como DNS, pon la nube en **gris (DNS only)**, no naranja
> (proxy), para que Caddy pueda emitir su propio certificado sin conflictos.

El DNS tarda entre minutos y un par de horas en propagarse. Comprueba con
`ping trainerapp.app` que ya resuelve a tu IP antes de seguir.

---

## 4. Email transaccional (Brevo — gratis 300/día)

Sin esto, los correos de verificación de cuenta no llegan y nadie podrá registrarse.

1. Crea cuenta en https://www.brevo.com
2. Ve a **SMTP & API → SMTP** y genera una clave.
3. Apunta: host `smtp-relay.brevo.com`, puerto `587`, tu usuario (email) y la clave.
4. **Verifica el dominio** `trainerapp.app` en Brevo: te dará unos registros
   **SPF/DKIM** que añades en el DNS del paso 3. Sin esto, los emails caen en spam.

---

## 5. Anti-bot (Google reCAPTCHA v3 — gratis)

1. Entra en https://www.google.com/recaptcha/admin
2. Crea un sitio tipo **reCAPTCHA v3**.
3. En dominios añade `trainerapp.app`.
4. Copia la **Site key** y la **Secret key**.

---

## 6. Rellenar los pocos datos que faltan

### a) En el `.env` (las líneas `>>> RELLENAR <<<` de `.env.production.local`)
El dominio ya está puesto. Solo faltan:
- `MAIL_HOST`, `MAIL_USER`, `MAIL_PASSWORD` → los de Brevo (paso 4)
- `RECAPTCHA_SITE_KEY`, `RECAPTCHA_SECRET_KEY` → los de Google (paso 5)

### b) Páginas legales
La web solo publica una **Política de privacidad** (en `/privacidad`), suficiente
mientras no haya ventas. No requiere datos adicionales: el responsable se identifica
por el email de contacto. Si en el futuro abres ventas, habrá que añadir aviso legal
y términos con tus datos fiscales (titular, NIF, domicilio).

---

## 7. Lanzar (1 comando)

En el servidor, dentro de la carpeta del proyecto:

```bash
git clone <tu-repo> trainerapp && cd trainerapp     # o sube los archivos por scp
cp .env.production.local .env                        # el que dejó Claude, ya con secretos y dominio
nano .env                                            # rellena solo Brevo + reCAPTCHA (paso 6a)
./deploy/go-live.sh
```

`go-live.sh` valida el `.env`, construye y levanta todo, crea el superadmin,
instala el backup diario y comprueba que el API responde. Caddy emite el
certificado HTTPS en ~1 minuto la primera vez.

Cuando termine: entra en `https://trainerapp.app` y haz login con el superadmin
(`admin@cardzone.es`, contraseña en tu `.env`).

---

## Después de abrir

- **Monitorización gratis**: crea un check en https://uptimerobot.com apuntando a
  `https://trainerapp.app/health` (te avisa por email si se cae).
- **Backups externos**: el backup diario ya corre, pero está en el mismo servidor.
  Activa una copia fuera (rclone a Google Drive, o scp a otra máquina) — ver el
  final de `deploy/backup.sh`.
- **Errores**: opcional, integrar Sentry (plan gratis) para ver fallos en producción.

## Comandos útiles (en el servidor)

```bash
docker compose -f docker-compose.prod.yml logs -f        # ver logs en vivo
docker compose -f docker-compose.prod.yml ps             # estado de los servicios
docker compose -f docker-compose.prod.yml restart api    # reiniciar el API
./deploy/backup.sh                                       # backup manual
./deploy/restore.sh deploy/backups/<archivo>.sql.gz      # restaurar
```

## ¿Dónde está la base de datos?

Todo (usuarios, torneos, rondas, inscripciones, decklists) vive en **PostgreSQL**,
dentro del volumen Docker `postgres_data` (sobrevive a reinicios). Para verla:

```bash
docker compose -f docker-compose.prod.yml exec postgres psql -U apptorneos
# o, con interfaz gráfica, abre un túnel SSH y usa Prisma Studio / DBeaver / TablePlus
```
