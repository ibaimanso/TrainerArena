import { HttpClient } from '@angular/common/http';
import { Component, inject, input, OnDestroy, OnInit, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { TournamentsService } from '../../core/tournaments.service';

/**
 * /torneo/{slug}/pago/volver — "Procesando tu pago…": triggers the capture and
 * polls until the webhook promotes the registration to active (SPEC §8.4).
 */
@Component({
  imports: [RouterLink],
  template: `
    <div class="mx-auto max-w-md">
      <div class="space-y-4 rounded-lg bg-white p-8 text-center shadow">
        @switch (state()) {
          @case ('processing') {
            <div class="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-indigo-200 border-t-indigo-600"></div>
            <h1 class="text-xl font-bold">Procesando tu pago…</h1>
            <p class="text-sm text-zinc-600">
              Estamos confirmando el pago con PayPal. Esto puede tardar unos segundos;
              no cierres esta página.
            </p>
          }
          @case ('confirmed') {
            <h1 class="text-xl font-bold text-green-700">¡Pago confirmado!</h1>
            <p class="text-sm text-zinc-600">Tu inscripción está activa. Te hemos enviado un email.</p>
            <a [routerLink]="['/torneo', slug()]"
               class="inline-block rounded bg-indigo-600 px-4 py-2 font-semibold text-white hover:bg-indigo-500">
              Volver al torneo
            </a>
          }
          @case ('pending') {
            <h1 class="text-xl font-bold">Pago en proceso</h1>
            <p class="text-sm text-zinc-600">
              Tu pago se está procesando. Cuando PayPal lo confirme, tu inscripción se
              activará automáticamente y recibirás un email. Puedes cerrar esta página.
            </p>
            <a [routerLink]="['/torneo', slug()]" class="text-indigo-600 hover:underline">Volver al torneo</a>
          }
        }
      </div>
    </div>
  `,
})
export default class PaymentReturnPage implements OnInit, OnDestroy {
  readonly slug = input.required<string>();
  private readonly http = inject(HttpClient);
  private readonly route = inject(ActivatedRoute);
  private readonly tournaments = inject(TournamentsService);

  protected readonly state = signal<'processing' | 'confirmed' | 'pending'>('processing');
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private attempts = 0;

  async ngOnInit(): Promise<void> {
    const token = this.route.snapshot.queryParamMap.get('token');
    if (token) {
      await firstValueFrom(this.http.post('/api/payments/paypal/return', { token })).catch(
        () => undefined
      );
    }
    this.pollTimer = setInterval(() => void this.poll(), 3000);
    void this.poll();
  }

  ngOnDestroy(): void {
    if (this.pollTimer) clearInterval(this.pollTimer);
  }

  private async poll(): Promise<void> {
    this.attempts++;
    try {
      const { viewer } = await this.tournaments.detail(this.slug());
      if (viewer.registrationStatus === 'active') {
        this.state.set('confirmed');
        if (this.pollTimer) clearInterval(this.pollTimer);
        return;
      }
    } catch {
      // keep polling
    }
    if (this.attempts >= 10) {
      this.state.set('pending');
      if (this.pollTimer) clearInterval(this.pollTimer);
    }
  }
}
