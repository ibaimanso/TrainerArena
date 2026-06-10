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
