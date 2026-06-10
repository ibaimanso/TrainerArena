# DECISIONS — decisiones de implementación no cubiertas por SPEC.md

Las reglas de negocio no se tocan; aquí solo van decisiones técnicas menores
tomadas durante la reconstrucción (regla de oro 3 del prompt).

1. **Prisma 6 en lugar de 7.** Prisma 7 exige driver adapters y el generador
   nuevo; v6 mantiene el flujo clásico `prisma-client-js` (más estable y
   mejor documentado). Sin impacto funcional.
2. **`payments.registration_id` es nullable con `onDelete: SetNull`.** La spec
   borra el registro cuando el pago es DENIED/VOIDED/expirado pero conserva el
   payment como registro financiero (`failed`/`cancelled`). Un FK con cascade
   borraría el payment; SetNull preserva el histórico.
3. **Sin columna `remember_token`.** Es un artefacto de Laravel; las sesiones
   viven en Redis con cookie httpOnly, no hay "remember me" en la spec.
4. **Verificación de email por URL firmada (HMAC, sin tabla).** La spec pide
   "URL firmada y caducidad" — se firma `userId:email:expires` con `APP_KEY`.
   La recuperación de contraseña sí usa tabla (`password_reset_tokens`) para
   garantizar un solo uso.
5. **Angular 21** (la versión estable que instala Nx 22.7); cumple el
   requisito "Angular 20+" del prompt.
6. **Tailwind CSS 3.4** (lo que configura el generador de Nx); el diseño no
   depende de features de v4.
7. **Enums de Prisma para `match_results.result`** (la spec lo define como
   string con 7 valores cerrados — un enum es más estricto sin cambiar el
   comportamiento).
8. **Entorno de desarrollo sin Docker en esta máquina.** docker-compose.yml
   está completo y CI levanta postgres/redis como services; los tests de
   integración corren en CI y en cualquier máquina con Docker.
9. **Captura de la orden PayPal en la página de retorno.** La spec dice que la
   promoción a `active` llega por webhook (`PAYMENT.CAPTURE.COMPLETED`), pero
   con intent CAPTURE alguien tiene que capturar la orden aprobada. El handler
   de `/pago/volver` dispara la captura servidor-a-servidor (idempotente,
   errores tolerados) y el webhook sigue siendo la única fuente de verdad para
   activar la inscripción.
10. **Campeón en torneos sin top cut.** §6.8 termina el torneo sin definir
    campeón; el payload de `tournament.finished` lo admite. Se emite el líder
    de la clasificación final (excluyendo retirados) como campeón derivado;
    nunca se persiste.
11. **Rate limiting propio sobre Redis** (INCR + EXPIRE, ventana fija) en vez
    de `@nestjs/throttler`: las claves compuestas de la spec (email+IP,
    usuario) y los mensajes 429 en español son más directos así. Límites
    exactos de §14. Si Redis cae, se falla en abierto (disponibilidad).
12. **Config del cliente WebSocket por endpoint público** (`/api/realtime/config`)
    en lugar de variables de build de Angular: una sola imagen de frontend
    sirve para cualquier entorno.
13. **`registration_open` no exige fecha futura** y el ciclo de rondas no
    valida `tournaments.status` (fiel a la v1: "el ciclo de rondas funciona
    independientemente del status"), salvo el paso automático a `in_progress`
    al iniciar la R1 (corrección 4.1).
14. **Migración inicial generada con `prisma migrate diff`** (sin BD viva) y
    aplicada con `migrate deploy` en CI/producción.
