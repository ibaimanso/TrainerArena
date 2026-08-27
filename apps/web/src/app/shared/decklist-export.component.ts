import { Component, input, signal } from '@angular/core';
import type { ParsedDecklist } from '../core/player.service';
import { renderDecklistPng } from './decklist-image';

/**
 * Export actions for a decklist: copy the raw text to the clipboard and
 * download the parsed list as a PNG image.
 */
@Component({
  selector: 'app-decklist-export',
  template: `
    <div class="flex flex-wrap items-center gap-2">
      <button type="button" (click)="copy()" class="btn-secondary btn-sm inline-flex items-center gap-1.5">
        <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor"
             stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <rect x="9" y="9" width="13" height="13" rx="2" />
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
        </svg>
        {{ copied() ? '¡Copiada!' : 'Copiar lista' }}
      </button>
      <button type="button" (click)="download()" class="btn-secondary btn-sm inline-flex items-center gap-1.5">
        <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor"
             stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <path d="M7 10l5 5 5-5M12 15V3" />
        </svg>
        Descargar imagen
      </button>
      @if (error()) {
        <span class="text-xs text-red-600 dark:text-red-400" role="alert">{{ error() }}</span>
      }
    </div>
  `,
})
export class DecklistExportComponent {
  readonly playerName = input.required<string>();
  readonly rawText = input.required<string>();
  readonly parsed = input.required<ParsedDecklist>();
  readonly subtitle = input('');

  protected readonly copied = signal(false);
  protected readonly error = signal<string | null>(null);

  protected async copy(): Promise<void> {
    this.error.set(null);
    try {
      await navigator.clipboard.writeText(this.rawText());
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 2000);
    } catch {
      this.error.set('No se pudo copiar al portapapeles.');
    }
  }

  protected download(): void {
    this.error.set(null);
    try {
      const subtitle =
        this.subtitle() || `${this.parsed().total} cartas · exportada de Trainer Arena`;
      const url = renderDecklistPng(this.playerName(), subtitle, this.parsed());
      const link = document.createElement('a');
      link.href = url;
      link.download = `decklist-${slugify(this.playerName())}.png`;
      link.click();
    } catch {
      this.error.set('No se pudo generar la imagen.');
    }
  }
}

function slugify(name: string): string {
  return (
    name
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'jugador'
  );
}
