import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

/** Spanish 404 page (SPEC §14). */
@Component({
  imports: [RouterLink],
  template: `
    <div class="mx-auto max-w-md rounded-lg bg-white p-10 text-center shadow">
      <p class="text-5xl font-bold text-indigo-600">404</p>
      <h1 class="mt-3 text-xl font-bold">Página no encontrada</h1>
      <p class="mt-2 text-sm text-zinc-500">
        La página que buscas no existe o ya no está disponible.
      </p>
      <a routerLink="/" class="mt-5 inline-block rounded bg-indigo-600 px-4 py-2 font-semibold text-white hover:bg-indigo-500">
        Volver a los torneos
      </a>
    </div>
  `,
})
export default class NotFoundPage {}
