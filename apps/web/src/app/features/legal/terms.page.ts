import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

/** Terms of service. [COMPLETAR] marks data the owner must fill in. */
@Component({
  imports: [RouterLink],
  template: `
    <article class="mx-auto max-w-2xl space-y-6 text-sm leading-relaxed text-stone-600 dark:text-stone-400">
      <header>
        <h1 class="page-title">Términos de servicio</h1>
        <p class="mt-1 text-xs text-stone-400 dark:text-stone-500">Última actualización: junio de 2026</p>
      </header>

      <section class="space-y-2">
        <h2 class="section-title">1. El servicio</h2>
        <p>
          Trainer Arena es una plataforma para organizar y jugar torneos online de Pokémon TCG
          (rondas suizas, top cut, decklists, jueces y clasificaciones). Las partidas se juegan en
          Pokémon TCG Live, una aplicación de terceros ajena a esta plataforma. Titular del
          servicio: [COMPLETAR: titular y NIF].
        </p>
      </section>

      <section class="space-y-2">
        <h2 class="section-title">2. Tu cuenta</h2>
        <p>
          Necesitas una cuenta con email verificado para inscribirte en torneos. Eres responsable
          de la veracidad de tus datos y de la custodia de tu contraseña. Puedes eliminar tu cuenta
          en cualquier momento desde tu perfil.
        </p>
      </section>

      <section class="space-y-2">
        <h2 class="section-title">3. Normas de conducta</h2>
        <ul class="list-disc space-y-1.5 pl-5">
          <li>Reporta los resultados de tus partidas con honestidad; los reportes falsos pueden suponer la expulsión del torneo.</li>
          <li>Mantén un trato respetuoso en los chats con rivales y jueces.</li>
          <li>La decisión de los jueces y del organizador sobre disputas es definitiva dentro del torneo.</li>
          <li>El incumplimiento reiterado puede conllevar la suspensión de la cuenta.</li>
        </ul>
      </section>

      <section class="space-y-2">
        <h2 class="section-title">4. Torneos de pago y reembolsos</h2>
        <p>
          Las cuotas de inscripción se pagan a través de PayPal al organizador del torneo. La plaza
          queda reservada al iniciar el pago y confirmada al completarse. Si una inscripción
          pendiente de pago no se completa en 30 minutos, se libera automáticamente. Si un torneo
          de pago se cancela antes de comenzar, el organizador debe reembolsar las cuotas; para
          incidencias con un pago, escribe a
          <a href="mailto:trainerarenacontact@gmail.com" class="link">trainerarenacontact&#64;gmail.com</a>.
        </p>
      </section>

      <section class="space-y-2">
        <h2 class="section-title">5. Propiedad intelectual</h2>
        <p>
          Pokémon y Pokémon TCG son marcas de Nintendo, Creatures Inc. y GAME FREAK Inc. Trainer
          Arena es una plataforma independiente, sin afiliación ni patrocinio de dichas compañías.
          El nombre, el logotipo y el software de Trainer Arena pertenecen a su titular.
        </p>
      </section>

      <section class="space-y-2">
        <h2 class="section-title">6. Disponibilidad y responsabilidad</h2>
        <p>
          Prestamos el servicio «tal cual», sin garantía de disponibilidad ininterrumpida. No
          somos responsables de fallos de Pokémon TCG Live, de PayPal ni de la conexión de los
          jugadores. La responsabilidad total de Trainer Arena frente a un usuario se limita, en
          todo caso, al importe de las cuotas pagadas a través de la plataforma en los 12 meses
          anteriores.
        </p>
      </section>

      <section class="space-y-2">
        <h2 class="section-title">7. Cambios</h2>
        <p>
          Podemos actualizar estos términos; si el cambio es relevante, lo anunciaremos en la
          plataforma con antelación razonable. El uso continuado tras la actualización implica su
          aceptación. Legislación aplicable: española; fuero: los juzgados de [COMPLETAR: ciudad].
        </p>
      </section>

      <footer class="border-t border-stone-200 pt-4 text-xs text-stone-400 dark:border-stone-800 dark:text-stone-500">
        <a routerLink="/" class="link">Volver a Trainer Arena</a>
      </footer>
    </article>
  `,
})
export default class TermsPage {}
