import { Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { officialStructure } from '@apptorneos/engine';
import { apiErrorMessage } from '../../core/api-error';
import { TournamentsService } from '../../core/tournaments.service';

/**
 * 4-step creation wizard (SPEC §12): basics → capacity/format (official table
 * autofill, admin can override) → times → optional payment.
 */
@Component({
  imports: [ReactiveFormsModule, RouterLink],
  template: `
    <div class="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 class="page-title">Crear torneo</h1>
        <p class="mt-1 text-sm text-stone-500 dark:text-stone-400">Completa los 4 pasos para publicar tu torneo.</p>
      </div>

      <nav aria-label="Pasos del formulario">
        <ol class="flex gap-2 text-xs">
          @for (label of stepLabels; track $index) {
            <li class="flex-1 rounded-lg px-2 py-2 text-center font-medium"
                [class]="$index === step() ? 'bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900' : $index < step() ? 'bg-green-50 dark:bg-green-950/40 text-green-800 dark:text-green-300' : 'bg-stone-100 dark:bg-stone-800 text-stone-500 dark:text-stone-400'"
                [attr.aria-current]="$index === step() ? 'step' : null">
              <span class="inline-flex items-center justify-center gap-1">
                @if ($index < step()) {
                  <svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                       stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <path d="M20 6 9 17l-5-5" />
                  </svg>
                  <span class="sr-only">Completado:</span>
                } @else {
                  <span aria-hidden="true">{{ $index + 1 }}.</span>
                }
                {{ label }}
              </span>
            </li>
          }
        </ol>
      </nav>

      @if (error()) {
        <p class="alert-error" role="alert">{{ error() }}</p>
      }

      <form [formGroup]="form" (ngSubmit)="submit()" class="card space-y-5">
        @switch (step()) {
          @case (0) {
            <div class="space-y-5">
              <h2 class="section-title">Datos básicos</h2>
              <div>
                <label for="name" class="label">Nombre del torneo</label>
                <input id="name" type="text" formControlName="name" maxlength="255" required class="input" />
                <p class="hint">Es el nombre público que verán los jugadores.</p>
              </div>
              <div>
                <label for="description" class="label">Descripción (opcional)</label>
                <textarea id="description" formControlName="description" rows="4" class="input"></textarea>
                <p class="hint">Reglas, premios, enlaces… cualquier información útil para los participantes.</p>
              </div>
              <div>
                <label for="startAt" class="label">Fecha y hora de inicio</label>
                <input id="startAt" type="datetime-local" formControlName="startAt" required class="input" />
                <p class="hint">Se interpreta en tu zona horaria local.</p>
              </div>
            </div>
          }
          @case (1) {
            <div class="space-y-5">
              <h2 class="section-title">Capacidad y formato</h2>
              <div>
                <label for="format" class="label">Tipo de torneo</label>
                <select id="format" formControlName="format" class="input">
                  <option value="standard">Torneo estándar (suizo + top cut)</option>
                  <option value="league">Liga (jornadas con fecha programada)</option>
                </select>
                <p class="hint">
                  En una liga cada ronda es una jornada con fecha propia, y además de la
                  clasificación general hay una clasificación por jornada.
                </p>
              </div>
              <div>
                <label for="maxPlayers" class="label">Máximo de jugadores (4–9999)</label>
                <input id="maxPlayers" type="number" formControlName="maxPlayers" min="4" max="9999"
                       (change)="autofill()" required class="input" />
                <p class="hint">
                  Las rondas y el top cut se rellenan según la tabla oficial; puedes modificarlos.
                </p>
              </div>
              <div class="grid gap-4 sm:grid-cols-2">
                <div>
                  <label for="swissRounds" class="label">
                    {{ isLeague() ? 'Jornadas (1–15)' : 'Rondas suizas (1–15)' }}
                  </label>
                  <input id="swissRounds" type="number" formControlName="swissRounds" min="1" max="15"
                         required class="input" />
                  <p class="hint">
                    {{ isLeague() ? 'Número de jornadas de la liga.' : 'Número de rondas de la fase suiza.' }}
                  </p>
                </div>
                <div>
                  <label for="topCutSize" class="label">Top cut</label>
                  <select id="topCutSize" formControlName="topCutSize" class="input">
                    <option [value]="0">Sin top cut</option>
                    <option [value]="4">Top 4</option>
                    <option [value]="8">Top 8</option>
                    <option [value]="16">Top 16</option>
                    <option [value]="32">Top 32</option>
                    <option [value]="64">Top 64</option>
                  </select>
                  <p class="hint">Eliminatoria final entre los mejores clasificados.</p>
                </div>
                <div>
                  <label for="swissBo" class="label">Suizas al mejor de</label>
                  <select id="swissBo" formControlName="swissBo" class="input">
                    <option [value]="1">BO1</option>
                    <option [value]="3">BO3</option>
                  </select>
                  <p class="hint">BO1: una partida por ronda. BO3: al mejor de tres.</p>
                </div>
                <div>
                  <label for="topCutBo" class="label">Top cut al mejor de</label>
                  <select id="topCutBo" formControlName="topCutBo" class="input">
                    <option [value]="1">BO1</option>
                    <option [value]="3">BO3</option>
                  </select>
                  <p class="hint">Formato de las rondas eliminatorias.</p>
                </div>
              </div>

              @if (isLeague()) {
                <fieldset class="space-y-3 rounded-lg border border-stone-200 dark:border-stone-800 p-4">
                  <legend class="px-1 text-sm font-semibold text-stone-900 dark:text-stone-100">
                    Fechas de las jornadas
                  </legend>
                  <p class="hint">Indica qué día (y hora) se jugará cada jornada, en orden cronológico.</p>
                  @for (date of matchdayDates(); track $index) {
                    <div class="flex items-center gap-3">
                      <span class="w-24 shrink-0 text-sm font-medium text-stone-700 dark:text-stone-300">
                        Jornada {{ $index + 1 }}
                      </span>
                      <input type="datetime-local" [value]="date" required class="input"
                             [attr.aria-label]="'Fecha de la jornada ' + ($index + 1)"
                             (change)="setMatchdayDate($index, $event)" />
                    </div>
                  }
                </fieldset>
              }

              <label class="flex items-start gap-2.5 rounded-lg border border-stone-200 dark:border-stone-800 p-4">
                <input type="checkbox" formControlName="showOpponentDecklists" class="mt-0.5" />
                <span class="text-sm text-stone-700 dark:text-stone-300">
                  <span class="font-semibold text-stone-900 dark:text-stone-100">Listas visibles entre rivales.</span>
                  Los jugadores podrán ver las decklists de sus rivales desde la tabla de
                  clasificación una vez bloqueadas (al empezar la primera ronda).
                </span>
              </label>
            </div>
          }
          @case (2) {
            <div class="space-y-5">
              <h2 class="section-title">Tiempos</h2>
              <div class="grid gap-4 sm:grid-cols-2">
                <div>
                  <label for="roundTimeMinutes" class="label">Tiempo por ronda (10–240 min)</label>
                  <input id="roundTimeMinutes" type="number" formControlName="roundTimeMinutes" min="10" max="240"
                         required class="input" />
                  <p class="hint">Solo aplica a las rondas suizas; el top cut no tiene límite.</p>
                </div>
                <div>
                  <label for="checkinMinutes" class="label">Ventana de check-in (1–60 min)</label>
                  <input id="checkinMinutes" type="number" formControlName="checkinMinutes" min="1" max="60"
                         required class="input" />
                  <p class="hint">Minutos para confirmar asistencia antes del inicio.</p>
                </div>
              </div>
            </div>
          }
          @case (3) {
            <div class="space-y-5">
              <h2 class="section-title">Pago e inscripción</h2>
              <div>
                <label for="feeEuros" class="label">Cuota de inscripción (EUR)</label>
                <input id="feeEuros" type="number" formControlName="feeEuros" min="0" max="10000" step="0.01"
                       required class="input" />
                <p class="hint">Introduce 0 para un torneo gratuito.</p>
              </div>
              @if (isPaid()) {
                <div>
                  <label for="paymentInstructions" class="label">Instrucciones de pago</label>
                  <textarea id="paymentInstructions" formControlName="paymentInstructions" rows="3"
                            maxlength="1000" required class="input"
                            placeholder="p. ej. Bizum al 6XX XXX XXX indicando tu nombre de TCG Live"></textarea>
                  <p class="hint">
                    Los pagos se hacen fuera de la plataforma (Bizum, transferencia…). El jugador
                    verá estas instrucciones al inscribirse y su plaza quedará reservada hasta que
                    tú confirmes el pago desde «Registros».
                  </p>
                </div>
              }

              <section class="rounded-lg border border-stone-200 dark:border-stone-800 bg-stone-50 dark:bg-stone-800/40 p-4" aria-labelledby="resumen-torneo">
                <h3 id="resumen-torneo" class="text-sm font-semibold text-stone-900 dark:text-stone-100">Resumen del torneo</h3>
                <dl class="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-3">
                  <div class="col-span-2 sm:col-span-3">
                    <dt class="text-xs text-stone-500 dark:text-stone-400">Nombre</dt>
                    <dd class="font-medium text-stone-900 dark:text-stone-100">{{ form.controls.name.value || '—' }}</dd>
                  </div>
                  <div>
                    <dt class="text-xs text-stone-500 dark:text-stone-400">Tipo</dt>
                    <dd class="font-medium text-stone-900 dark:text-stone-100">
                      {{ isLeague() ? 'Liga' : 'Estándar' }}
                      @if (form.controls.showOpponentDecklists.value) { · listas visibles }
                    </dd>
                  </div>
                  <div>
                    <dt class="text-xs text-stone-500 dark:text-stone-400">Jugadores</dt>
                    <dd class="font-medium text-stone-900 dark:text-stone-100">Hasta {{ form.controls.maxPlayers.value }}</dd>
                  </div>
                  <div>
                    <dt class="text-xs text-stone-500 dark:text-stone-400">{{ isLeague() ? 'Jornadas' : 'Rondas suizas' }}</dt>
                    <dd class="font-medium text-stone-900 dark:text-stone-100">
                      {{ form.controls.swissRounds.value }} (BO{{ form.controls.swissBo.value }})
                    </dd>
                  </div>
                  <div>
                    <dt class="text-xs text-stone-500 dark:text-stone-400">Top cut</dt>
                    <dd class="font-medium text-stone-900 dark:text-stone-100">
                      @if (+form.controls.topCutSize.value > 0) {
                        Top {{ form.controls.topCutSize.value }} (BO{{ form.controls.topCutBo.value }})
                      } @else {
                        Sin top cut
                      }
                    </dd>
                  </div>
                  <div>
                    <dt class="text-xs text-stone-500 dark:text-stone-400">Tiempo por ronda</dt>
                    <dd class="font-medium text-stone-900 dark:text-stone-100">{{ form.controls.roundTimeMinutes.value }} min</dd>
                  </div>
                  <div>
                    <dt class="text-xs text-stone-500 dark:text-stone-400">Check-in</dt>
                    <dd class="font-medium text-stone-900 dark:text-stone-100">{{ form.controls.checkinMinutes.value }} min</dd>
                  </div>
                  <div>
                    <dt class="text-xs text-stone-500 dark:text-stone-400">Inscripción</dt>
                    <dd>
                      @if (isPaid()) {
                        <span class="badge-brand">{{ form.controls.feeEuros.value }} € por jugador</span>
                      } @else {
                        <span class="badge-success">Gratuita</span>
                      }
                    </dd>
                  </div>
                </dl>
              </section>
            </div>
          }
        }

        <div class="flex flex-wrap justify-between gap-3 border-t border-stone-100 dark:border-stone-800 pt-4">
          @if (step() > 0) {
            <button type="button" (click)="step.set(step() - 1)" class="btn-secondary">Anterior</button>
          } @else {
            <a routerLink="/admin/torneos" class="btn-secondary">Cancelar</a>
          }
          @if (step() < 3) {
            <button type="button" (click)="next()" [disabled]="!stepValid()" class="btn-primary">
              Siguiente
            </button>
          } @else {
            <button type="submit" [disabled]="form.invalid || saving()" class="btn-primary">
              {{ saving() ? 'Creando…' : 'Crear torneo' }}
            </button>
          }
        </div>
      </form>
    </div>
  `,
})
export default class CreateTournamentPage {
  private readonly fb = inject(FormBuilder);
  private readonly service = inject(TournamentsService);
  private readonly router = inject(Router);

  protected readonly stepLabels = ['Básicos', 'Formato', 'Tiempos', 'Pago'];
  protected readonly step = signal(0);
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(255)]],
    description: [''],
    startAt: ['', Validators.required],
    format: ['standard' as 'standard' | 'league', Validators.required],
    showOpponentDecklists: [false],
    maxPlayers: [16, [Validators.required, Validators.min(4), Validators.max(9999)]],
    swissRounds: [4, [Validators.required, Validators.min(1), Validators.max(15)]],
    topCutSize: [4, Validators.required],
    swissBo: [1, Validators.required],
    topCutBo: [3, Validators.required],
    roundTimeMinutes: [30, [Validators.required, Validators.min(10), Validators.max(240)]],
    checkinMinutes: [5, [Validators.required, Validators.min(1), Validators.max(60)]],
    feeEuros: [0, [Validators.required, Validators.min(0), Validators.max(10000)]],
    paymentInstructions: [''],
  });

  protected readonly isPaid = computed(() => this.feeEurosValue() > 0);
  private readonly feeEurosValue = signal(0);
  protected readonly isLeague = computed(() => this.formatValue() === 'league');
  private readonly formatValue = signal<'standard' | 'league'>('standard');
  /** One datetime-local string per jornada (league only), kept at swissRounds length. */
  protected readonly matchdayDates = signal<string[]>([]);

  constructor() {
    this.form.controls.feeEuros.valueChanges.subscribe((v) => this.feeEurosValue.set(Number(v) || 0));
    this.form.controls.format.valueChanges.subscribe((v) => {
      this.formatValue.set(v);
      this.resizeMatchdays();
    });
    this.form.controls.swissRounds.valueChanges.subscribe(() => this.resizeMatchdays());
    this.resizeMatchdays();
  }

  private resizeMatchdays(): void {
    const rounds = Math.min(15, Math.max(0, Number(this.form.controls.swissRounds.value) || 0));
    const current = this.matchdayDates();
    this.matchdayDates.set(
      Array.from({ length: rounds }, (_, i) => current[i] ?? '')
    );
  }

  protected setMatchdayDate(index: number, event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.matchdayDates.update((dates) => dates.map((d, i) => (i === index ? value : d)));
  }

  /** Autofill swiss rounds + top cut from the official table (SPEC §5.1). */
  protected autofill(): void {
    const players = Number(this.form.controls.maxPlayers.value) || 0;
    if (players >= 4) {
      const structure = officialStructure(players);
      this.form.patchValue({
        swissRounds: structure.swissRounds,
        topCutSize: structure.topCutSize,
      });
    }
  }

  protected stepValid(): boolean {
    const c = this.form.controls;
    switch (this.step()) {
      case 0:
        return c.name.valid && c.startAt.valid;
      case 1:
        return (
          c.maxPlayers.valid &&
          c.swissRounds.valid &&
          (!this.isLeague() || this.matchdayDates().every((d) => d.trim() !== ''))
        );
      case 2:
        return c.roundTimeMinutes.valid && c.checkinMinutes.valid;
      default:
        return true;
    }
  }

  protected next(): void {
    if (this.stepValid()) this.step.set(this.step() + 1);
  }

  protected async submit(): Promise<void> {
    if (this.form.invalid) return;
    this.saving.set(true);
    this.error.set(null);
    try {
      const v = this.form.getRawValue();
      const res = await this.service.create({
        name: v.name,
        description: v.description || undefined,
        startAt: new Date(v.startAt).toISOString(),
        format: v.format,
        matchdayDates:
          v.format === 'league'
            ? this.matchdayDates().map((d) => new Date(d).toISOString())
            : undefined,
        showOpponentDecklists: v.showOpponentDecklists,
        maxPlayers: Number(v.maxPlayers),
        swissRounds: Number(v.swissRounds),
        roundTimeMinutes: Number(v.roundTimeMinutes),
        checkinMinutes: Number(v.checkinMinutes),
        swissBo: Number(v.swissBo),
        topCutBo: Number(v.topCutBo),
        topCutSize: Number(v.topCutSize),
        feeAmount: Math.round(Number(v.feeEuros) * 100),
        paymentInstructions: Number(v.feeEuros) > 0 ? v.paymentInstructions : undefined,
      });
      await this.router.navigate(['/admin/torneos'], {
        queryParams: { creado: res.tournament.slug },
      });
    } catch (e) {
      this.error.set(apiErrorMessage(e));
    } finally {
      this.saving.set(false);
    }
  }
}
