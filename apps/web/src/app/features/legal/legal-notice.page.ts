import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

/** Legal notice (LSSI-CE). [COMPLETAR] marks data the owner must fill in. */
@Component({
  imports: [RouterLink],
  template: `
    <article class="mx-auto max-w-2xl space-y-6 text-sm leading-relaxed text-stone-600 dark:text-stone-400">
      <header>
        <h1 class="page-title">Aviso legal</h1>
        <p class="mt-1 text-xs text-stone-400 dark:text-stone-500">Última actualización: junio de 2026</p>
      </header>

      <section class="space-y-2">
        <h2 class="section-title">Titular del sitio</h2>
        <p>
          En cumplimiento de la Ley 34/2002 (LSSI-CE), se informa de que este sitio web es
          titularidad de [COMPLETAR: nombre y apellidos o razón social], NIF [COMPLETAR],
          con domicilio en [COMPLETAR].
        </p>
        <p>
          Contacto:
          <a href="mailto:trainerarenacontact@gmail.com" class="link">trainerarenacontact&#64;gmail.com</a>.
        </p>
      </section>

      <section class="space-y-2">
        <h2 class="section-title">Condiciones de uso</h2>
        <p>
          El acceso a este sitio implica la aceptación de los
          <a routerLink="/terminos" class="link">Términos de servicio</a> y de la
          <a routerLink="/privacidad" class="link">Política de privacidad</a>.
        </p>
      </section>

      <section class="space-y-2">
        <h2 class="section-title">Marcas de terceros</h2>
        <p>
          Pokémon y Pokémon TCG son marcas registradas de Nintendo, Creatures Inc. y GAME FREAK
          Inc. Trainer Arena es una plataforma comunitaria independiente y no está afiliada,
          patrocinada ni avalada por dichas compañías.
        </p>
      </section>

      <footer class="border-t border-stone-200 pt-4 text-xs text-stone-400 dark:border-stone-800 dark:text-stone-500">
        <a routerLink="/" class="link">Volver a Trainer Arena</a>
      </footer>
    </article>
  `,
})
export default class LegalNoticePage {}
