import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

/** /pago/cancelar — payment cancelled page (SPEC §8.4). */
@Component({
  imports: [RouterLink],
  template: `
    <div class="mx-auto max-w-md">
      <div class="space-y-4 rounded-lg bg-white p-8 text-center shadow">
        <h1 class="text-xl font-bold">Pago cancelado</h1>
        <p class="text-sm text-zinc-600">
          Has cancelado el pago en PayPal. Tu plaza quedará reservada unos minutos por si
          quieres volver a intentarlo; pasado ese tiempo se liberará automáticamente.
        </p>
        <a routerLink="/" class="inline-block rounded bg-indigo-600 px-4 py-2 font-semibold text-white hover:bg-indigo-500">
          Volver a los torneos
        </a>
      </div>
    </div>
  `,
})
export default class PaymentCancelledPage {}
