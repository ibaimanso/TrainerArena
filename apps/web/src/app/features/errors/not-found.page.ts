import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

/** Spanish 404 page (SPEC §14). */
@Component({
  imports: [RouterLink],
  template: `
    <div class="card mx-auto max-w-md py-12 text-center">
      <p class="text-6xl font-bold tracking-tight text-stone-900 dark:text-stone-100" aria-hidden="true">404</p>
      <h1 class="mt-4 text-xl font-bold">Página no encontrada</h1>
      <p class="mx-auto mt-2 max-w-xs text-sm leading-relaxed text-stone-500 dark:text-stone-400">
        La página que buscas no existe o ya no está disponible.
      </p>
      <a routerLink="/" class="btn-primary mt-6">Volver a los torneos</a>
    </div>
  `,
})
export default class NotFoundPage {}
