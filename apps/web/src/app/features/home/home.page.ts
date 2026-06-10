import { Component } from '@angular/core';

/** Public landing — filled in with the tournaments listing in phase 3. */
@Component({
  template: `
    <div class="space-y-6">
      <section class="rounded-lg bg-white p-8 text-center shadow">
        <h1 class="text-3xl font-bold">Torneos online de Pokémon TCG</h1>
        <p class="mx-auto mt-3 max-w-xl text-zinc-600">
          Rondas suizas con timer, top cut, decklists de TCG Live, jueces en vivo y
          clasificación en tiempo real.
        </p>
      </section>
      <p class="text-center text-sm text-zinc-500">
        Próximamente: listado de torneos con inscripción abierta.
      </p>
    </div>
  `,
})
export default class HomePage {}
