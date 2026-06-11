import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

/** /pago/cancelar — payment cancelled page (SPEC §8.4). */
@Component({
  imports: [RouterLink],
  template: `
    <div class="mx-auto max-w-md">
      <div class="card space-y-4 p-8 text-center" role="status">
        <div class="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-red-100" aria-hidden="true">
          <svg class="h-7 w-7 text-red-600 dark:text-red-400" viewBox="0 0 24 24" fill="none" stroke="currentColor"
               stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </div>
        <h1 class="text-xl font-bold tracking-tight text-stone-900 dark:text-stone-100">Pago cancelado</h1>
        <p class="text-sm leading-relaxed text-stone-600 dark:text-stone-400">
          Has cancelado el pago en PayPal. Tu plaza quedará reservada unos minutos por si
          quieres volver a intentarlo; pasado ese tiempo se liberará automáticamente.
        </p>
        <a routerLink="/" class="btn-primary">Volver a los torneos</a>
      </div>
    </div>
  `,
})
export default class PaymentCancelledPage {}
