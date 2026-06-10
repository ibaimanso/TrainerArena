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
    <div class="mx-auto max-w-2xl space-y-4">
      <h1 class="text-2xl font-bold">Crear torneo</h1>

      <ol class="flex gap-2 text-xs">
        @for (label of stepLabels; track $index) {
          <li class="flex-1 rounded px-2 py-1.5 text-center font-medium"
              [class]="$index === step() ? 'bg-indigo-600 text-white' : $index < step() ? 'bg-indigo-100 text-indigo-700' : 'bg-zinc-100 text-zinc-500'">
            {{ $index + 1 }}. {{ label }}
          </li>
        }
      </ol>

      @if (error()) {
        <p class="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{{ error() }}</p>
      }

      <form [formGroup]="form" (ngSubmit)="submit()" class="space-y-4 rounded-lg bg-white p-6 shadow">
        @switch (step()) {
          @case (0) {
            <div class="space-y-4">
              <div>
                <label for="name" class="mb-1 block text-sm font-medium">Nombre del torneo</label>
                <input id="name" type="text" formControlName="name" maxlength="255"
                       class="w-full rounded border border-zinc-300 px-3 py-2 focus:border-indigo-500 focus:outline-none" />
              </div>
              <div>
                <label for="description" class="mb-1 block text-sm font-medium">Descripción (opcional)</label>
                <textarea id="description" formControlName="description" rows="4"
                          class="w-full rounded border border-zinc-300 px-3 py-2 focus:border-indigo-500 focus:outline-none"></textarea>
              </div>
              <div>
                <label for="startAt" class="mb-1 block text-sm font-medium">Fecha y hora de inicio</label>
                <input id="startAt" type="datetime-local" formControlName="startAt"
                       class="w-full rounded border border-zinc-300 px-3 py-2 focus:border-indigo-500 focus:outline-none" />
              </div>
            </div>
          }
          @case (1) {
            <div class="space-y-4">
              <div>
                <label for="maxPlayers" class="mb-1 block text-sm font-medium">Máximo de jugadores (4–9999)</label>
                <input id="maxPlayers" type="number" formControlName="maxPlayers" min="4" max="9999"
                       (change)="autofill()"
                       class="w-full rounded border border-zinc-300 px-3 py-2 focus:border-indigo-500 focus:outline-none" />
                <p class="mt-1 text-xs text-zinc-500">
                  Las rondas y el top cut se rellenan según la tabla oficial; puedes modificarlos.
                </p>
              </div>
              <div class="grid grid-cols-2 gap-4">
                <div>
                  <label for="swissRounds" class="mb-1 block text-sm font-medium">Rondas suizas (1–15)</label>
                  <input id="swissRounds" type="number" formControlName="swissRounds" min="1" max="15"
                         class="w-full rounded border border-zinc-300 px-3 py-2 focus:border-indigo-500 focus:outline-none" />
                </div>
                <div>
                  <label for="topCutSize" class="mb-1 block text-sm font-medium">Top cut</label>
                  <select id="topCutSize" formControlName="topCutSize"
                          class="w-full rounded border border-zinc-300 px-3 py-2 focus:border-indigo-500 focus:outline-none">
                    <option [value]="0">Sin top cut</option>
                    <option [value]="4">Top 4</option>
                    <option [value]="8">Top 8</option>
                    <option [value]="16">Top 16</option>
                    <option [value]="32">Top 32</option>
                    <option [value]="64">Top 64</option>
                  </select>
                </div>
                <div>
                  <label for="swissBo" class="mb-1 block text-sm font-medium">Suizas al mejor de</label>
                  <select id="swissBo" formControlName="swissBo"
                          class="w-full rounded border border-zinc-300 px-3 py-2 focus:border-indigo-500 focus:outline-none">
                    <option [value]="1">BO1</option>
                    <option [value]="3">BO3</option>
                  </select>
                </div>
                <div>
                  <label for="topCutBo" class="mb-1 block text-sm font-medium">Top cut al mejor de</label>
                  <select id="topCutBo" formControlName="topCutBo"
                          class="w-full rounded border border-zinc-300 px-3 py-2 focus:border-indigo-500 focus:outline-none">
                    <option [value]="1">BO1</option>
                    <option [value]="3">BO3</option>
                  </select>
                </div>
              </div>
            </div>
          }
          @case (2) {
            <div class="grid grid-cols-2 gap-4">
              <div>
                <label for="roundTimeMinutes" class="mb-1 block text-sm font-medium">Tiempo por ronda (10–240 min)</label>
                <input id="roundTimeMinutes" type="number" formControlName="roundTimeMinutes" min="10" max="240"
                       class="w-full rounded border border-zinc-300 px-3 py-2 focus:border-indigo-500 focus:outline-none" />
                <p class="mt-1 text-xs text-zinc-500">Solo aplica a las rondas suizas; el top cut no tiene límite.</p>
              </div>
              <div>
                <label for="checkinMinutes" class="mb-1 block text-sm font-medium">Ventana de check-in (1–60 min)</label>
                <input id="checkinMinutes" type="number" formControlName="checkinMinutes" min="1" max="60"
                       class="w-full rounded border border-zinc-300 px-3 py-2 focus:border-indigo-500 focus:outline-none" />
              </div>
            </div>
          }
          @case (3) {
            <div class="space-y-4">
              <div>
                <label for="feeEuros" class="mb-1 block text-sm font-medium">Cuota de inscripción (EUR)</label>
                <input id="feeEuros" type="number" formControlName="feeEuros" min="0" max="10000" step="0.01"
                       class="w-full rounded border border-zinc-300 px-3 py-2 focus:border-indigo-500 focus:outline-none" />
                <p class="mt-1 text-xs text-zinc-500">0 = torneo gratuito.</p>
              </div>
              @if (isPaid()) {
                <div>
                  <label for="paypalAccount" class="mb-1 block text-sm font-medium">Cuenta PayPal (email)</label>
                  <input id="paypalAccount" type="email" formControlName="paypalAccount"
                         class="w-full rounded border border-zinc-300 px-3 py-2 focus:border-indigo-500 focus:outline-none" />
                  <p class="mt-1 text-xs text-zinc-500">Obligatoria en torneos de pago.</p>
                </div>
              }
            </div>
          }
        }

        <div class="flex justify-between border-t border-zinc-100 pt-4">
          @if (step() > 0) {
            <button type="button" (click)="step.set(step() - 1)"
                    class="rounded border border-zinc-300 px-4 py-2 text-sm hover:bg-zinc-50">Anterior</button>
          } @else {
            <a routerLink="/admin/torneos"
               class="rounded border border-zinc-300 px-4 py-2 text-sm hover:bg-zinc-50">Cancelar</a>
          }
          @if (step() < 3) {
            <button type="button" (click)="next()" [disabled]="!stepValid()"
                    class="rounded bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-50">
              Siguiente
            </button>
          } @else {
            <button type="submit" [disabled]="form.invalid || saving()"
                    class="rounded bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-50">
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
    maxPlayers: [16, [Validators.required, Validators.min(4), Validators.max(9999)]],
    swissRounds: [4, [Validators.required, Validators.min(1), Validators.max(15)]],
    topCutSize: [4, Validators.required],
    swissBo: [1, Validators.required],
    topCutBo: [3, Validators.required],
    roundTimeMinutes: [30, [Validators.required, Validators.min(10), Validators.max(240)]],
    checkinMinutes: [5, [Validators.required, Validators.min(1), Validators.max(60)]],
    feeEuros: [0, [Validators.required, Validators.min(0), Validators.max(10000)]],
    paypalAccount: [''],
  });

  protected readonly isPaid = computed(() => this.feeEurosValue() > 0);
  private readonly feeEurosValue = signal(0);

  constructor() {
    this.form.controls.feeEuros.valueChanges.subscribe((v) => this.feeEurosValue.set(Number(v) || 0));
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
        return c.maxPlayers.valid && c.swissRounds.valid;
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
        maxPlayers: Number(v.maxPlayers),
        swissRounds: Number(v.swissRounds),
        roundTimeMinutes: Number(v.roundTimeMinutes),
        checkinMinutes: Number(v.checkinMinutes),
        swissBo: Number(v.swissBo),
        topCutBo: Number(v.topCutBo),
        topCutSize: Number(v.topCutSize),
        feeAmount: Math.round(Number(v.feeEuros) * 100),
        paypalAccount: Number(v.feeEuros) > 0 ? v.paypalAccount : undefined,
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
