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
      <div class="card space-y-4 p-8 text-center" role="status" aria-live="polite">
        @switch (state()) {
          @case ('processing') {
            <div class="mx-auto h-14 w-14 animate-spin rounded-full border-4 border-stone-200 dark:border-stone-800 border-t-stone-600"
                 aria-hidden="true"></div>
            <h1 class="text-xl font-bold tracking-tight text-stone-900 dark:text-stone-100">Procesando tu pago…</h1>
            <p class="text-sm leading-relaxed text-stone-600 dark:text-stone-400">
              Estamos confirmando el pago con PayPal. Esto puede tardar unos segundos;
              no cierres esta página.
            </p>
          }
          @case ('confirmed') {
            <div class="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-green-100"
                 aria-hidden="true">
              <svg class="h-7 w-7 text-green-600" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                   stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <path d="M20 6 9 17l-5-5" />
              </svg>
            </div>
            <h1 class="text-xl font-bold tracking-tight text-green-700 dark:text-green-400">¡Pago confirmado!</h1>
            <p class="text-sm leading-relaxed text-stone-600 dark:text-stone-400">
              Tu inscripción está activa. Te hemos enviado un email de confirmación.
            </p>
            <a [routerLink]="['/torneo', slug()]" class="btn-primary">Volver al torneo</a>
          }
          @case ('pending') {
            <div class="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-amber-100"
                 aria-hidden="true">
              <svg class="h-7 w-7 text-amber-600" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                   stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="10" />
                <path d="M12 6v6l4 2" />
              </svg>
            </div>
            <h1 class="text-xl font-bold tracking-tight text-stone-900 dark:text-stone-100">Pago en proceso</h1>
            <p class="text-sm leading-relaxed text-stone-600 dark:text-stone-400">
              Tu pago se está procesando. Cuando PayPal lo confirme, tu inscripción se
              activará automáticamente y recibirás un email. Puedes cerrar esta página.
            </p>
            <a [routerLink]="['/torneo', slug()]" class="btn-primary">Volver al torneo</a>
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
