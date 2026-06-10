import { DatePipe } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, inject, input, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { apiErrorMessage } from '../../core/api-error';

interface DecklistRow {
  userId: number;
  playerName: string;
  total: number;
  submittedAt: string;
  lockedAt: string | null;
}

/** Judge decklist listing (SPEC §12 /juez/torneo/{slug}/decklists). */
@Component({
  imports: [RouterLink, DatePipe],
  template: `
    <div class="space-y-4">
      <h1 class="text-2xl font-bold">Decklists del torneo</h1>
      @if (error()) {
        <p class="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{{ error() }}</p>
      }
      <div class="overflow-x-auto rounded-lg bg-white shadow">
        <table class="w-full text-left text-sm">
          <thead class="border-b border-zinc-200 text-xs uppercase text-zinc-500">
            <tr>
              <th class="px-4 py-3">Jugador</th>
              <th class="px-4 py-3">Cartas</th>
              <th class="px-4 py-3">Enviada</th>
              <th class="px-4 py-3">Bloqueada</th>
              <th class="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            @for (d of decklists(); track d.userId) {
              <tr class="border-b border-zinc-100">
                <td class="px-4 py-3 font-medium">{{ d.playerName }}</td>
                <td class="px-4 py-3">{{ d.total }}</td>
                <td class="px-4 py-3 text-zinc-500">{{ d.submittedAt | date: 'd MMM, HH:mm' }}</td>
                <td class="px-4 py-3 text-zinc-500">
                  @if (d.lockedAt) { {{ d.lockedAt | date: 'd MMM, HH:mm' }} } @else { — }
                </td>
                <td class="px-4 py-3">
                  <a [routerLink]="['/juez/torneo', slug(), 'decklists', d.userId]"
                     class="text-indigo-600 hover:underline">Ver</a>
                </td>
              </tr>
            } @empty {
              <tr><td colspan="5" class="px-4 py-6 text-center text-zinc-500">Sin decklists todavía.</td></tr>
            }
          </tbody>
        </table>
      </div>
    </div>
  `,
})
export default class JudgeDecklistsPage implements OnInit {
  readonly slug = input.required<string>();
  private readonly http = inject(HttpClient);
  protected readonly decklists = signal<DecklistRow[]>([]);
  protected readonly error = signal<string | null>(null);

  async ngOnInit(): Promise<void> {
    try {
      const res = await firstValueFrom(
        this.http.get<{ decklists: DecklistRow[] }>(`/api/judge/tournaments/${this.slug()}/decklists`)
      );
      this.decklists.set(res.decklists);
    } catch (e) {
      this.error.set(apiErrorMessage(e));
    }
  }
}
