import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

/** Privacy policy (GDPR baseline). */
@Component({
  imports: [RouterLink],
  template: `
    <article class="mx-auto max-w-2xl space-y-6 text-sm leading-relaxed text-stone-600 dark:text-stone-400">
      <header>
        <h1 class="page-title">Política de privacidad</h1>
        <p class="mt-1 text-xs text-stone-400 dark:text-stone-500">Última actualización: junio de 2026</p>
      </header>

      <section class="space-y-2">
        <h2 class="section-title">1. Responsable del tratamiento</h2>
        <p>
          El responsable del tratamiento de tus datos es la persona física que opera Trainer Arena
          (en adelante, «Trainer Arena»). Para cualquier cuestión relativa a tus datos personales,
          puedes contactar en
          <a href="mailto:trainerarenacontact@gmail.com" class="link">trainerarenacontact&#64;gmail.com</a>.
        </p>
      </section>

      <section class="space-y-2">
        <h2 class="section-title">2. Datos que tratamos y para qué</h2>
        <ul class="list-disc space-y-1.5 pl-5">
          <li>
            <strong class="text-stone-800 dark:text-stone-200">Cuenta:</strong> nombre, email y contraseña
            (almacenada cifrada con bcrypt). Finalidad: autenticación y gestión de tu cuenta.
          </li>
          <li>
            <strong class="text-stone-800 dark:text-stone-200">Inscripciones a torneos:</strong> nombre completo,
            usuario de TCG Live, email de contacto y teléfono (opcional). Finalidad: organización del
            torneo y comunicación contigo durante el mismo.
          </li>
          <li>
            <strong class="text-stone-800 dark:text-stone-200">Inscripciones de pago:</strong> cuando un torneo
            tiene cuota, el pago se realiza de forma personal al organizador según las instrucciones de cada
            torneo. Trainer Arena no procesa pagos ni almacena tarjetas; solo guarda el estado de la
            inscripción (pendiente, confirmada o rechazada) a efectos de organización.
          </li>
          <li>
            <strong class="text-stone-800 dark:text-stone-200">Contenido de la plataforma:</strong> decklists,
            resultados y mensajes en los chats de partida y de juez. Finalidad: el funcionamiento
            del propio torneo y la resolución de incidencias.
          </li>
        </ul>
      </section>

      <section class="space-y-2">
        <h2 class="section-title">3. Base jurídica</h2>
        <p>
          La ejecución del contrato (arts. 6.1.b RGPD) para la cuenta y las inscripciones, y el
          interés legítimo en mantener la integridad competitiva de los torneos (resolución de
          disputas y auditoría de acciones de administración).
        </p>
      </section>

      <section class="space-y-2">
        <h2 class="section-title">4. Cookies</h2>
        <p>
          Solo usamos cookies técnicas esenciales: la cookie de sesión (autenticación) y la de
          protección CSRF. No usamos cookies de analítica ni de publicidad, por lo que no se
          requiere consentimiento adicional.
        </p>
      </section>

      <section class="space-y-2">
        <h2 class="section-title">5. Destinatarios</h2>
        <p>
          Nuestro proveedor de correo electrónico (envío de emails transaccionales) y nuestro proveedor
          de alojamiento. No vendemos ni cedemos tus datos a terceros con fines comerciales.
        </p>
      </section>

      <section class="space-y-2">
        <h2 class="section-title">6. Conservación</h2>
        <p>
          Mantenemos tus datos mientras tu cuenta esté activa. Si la eliminas, se borran tus datos
          personales, salvo los que debamos conservar por obligación legal.
        </p>
      </section>

      <section class="space-y-2">
        <h2 class="section-title">7. Tus derechos</h2>
        <p>
          Puedes ejercer tus derechos de acceso, rectificación, supresión, oposición, limitación y
          portabilidad escribiendo a
          <a href="mailto:trainerarenacontact@gmail.com" class="link">trainerarenacontact&#64;gmail.com</a>.
          También puedes eliminar tu cuenta directamente desde tu perfil. Si consideras que no
          hemos atendido correctamente tus derechos, puedes reclamar ante la AEPD (aepd.es).
        </p>
      </section>

      <footer class="border-t border-stone-200 pt-4 text-xs text-stone-400 dark:border-stone-800 dark:text-stone-500">
        <a routerLink="/" class="link">Volver a Trainer Arena</a>
      </footer>
    </article>
  `,
})
export default class PrivacyPage {}
