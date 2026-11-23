import { Component, computed, inject, DestroyRef } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ReactiveFormsModule, NonNullableFormBuilder, Validators } from '@angular/forms';
import { DestinationIdentificationComponent } from '../destination-identification/destination-identification.component';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { PRODUCER_SETTINGS } from '../destinations';
import { MARKET_PRODUCER_WORKER_CLIENT } from '../worker/worker-client';
import { SIMULATION_SETTINGS_LIMITS } from '../worker/worker-contract';

/** Entries accept only integer digits; the ranges ride the limits source. */
const INTEGER_PATTERN = /^\d+$/;

/**
 * The producer-settings destination: three validated integer entries with
 * the nominal-rate reading derived from them and the apply command at the
 * column's close. Editing never reaches the running producer — the command
 * goes through the shared client only on apply.
 */
@Component({
  imports: [
    DestinationIdentificationComponent,
    ReactiveFormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
  ],
  selector: 'app-producer-settings',
  templateUrl: './producer-settings.component.html',
  styleUrl: './producer-settings.component.css',
})
export class ProducerSettingsComponent {
  protected readonly destination = PRODUCER_SETTINGS;
  protected readonly limits = SIMULATION_SETTINGS_LIMITS;

  private readonly client = inject(MARKET_PRODUCER_WORKER_CLIENT);

  /**
   * The three producer settings as text entries, pre-filled with the
   * working values (the defaults at first arrival): adjustment always
   * starts from values, never from emptiness.
   */
  protected readonly form = inject(NonNullableFormBuilder).group({
    instrumentCount: this.entryControl('5', SIMULATION_SETTINGS_LIMITS.instrumentCount),
    updatesPerBatch: this.entryControl('100', SIMULATION_SETTINGS_LIMITS.updatesPerBatch),
    batchIntervalMs: this.entryControl('500', SIMULATION_SETTINGS_LIMITS.batchIntervalMs),
  });

  private readonly formValues = toSignal(this.form.valueChanges, {
    initialValue: this.form.value,
  });

  /**
   * The nominal rate the current entries imply: updates per second across
   * all instruments, derived from the updates-per-batch and batch-interval
   * entries; unavailable while a derivation-relevant entry stands rejected.
   */
  protected readonly nominalRate = computed<number | null>(() => {
    const values = this.formValues();
    const updates = Number(values.updatesPerBatch);
    const interval = Number(values.batchIntervalMs);
    if (
      !Number.isInteger(updates) ||
      !Number.isInteger(interval) ||
      interval <= 0 ||
      this.form.controls.updatesPerBatch.invalid ||
      this.form.controls.batchIntervalMs.invalid
    ) {
      return null;
    }
    return Math.round((updates / interval) * 1000);
  });

  constructor() {
    inject(DestroyRef).onDestroy(() => undefined);
  }

  /** Applies the parsed entries: one command starts the clean new run. */
  protected apply(): void {
    if (this.form.invalid) {
      return;
    }
    const values = this.form.getRawValue();
    void this.client.apply({
      instrumentCount: Number(values.instrumentCount),
      updatesPerBatch: Number(values.updatesPerBatch),
      batchIntervalMs: Number(values.batchIntervalMs),
    });
  }

  private entryControl(
    initial: string,
    range: { readonly min: number; readonly max: number }
  ) {
    return inject(NonNullableFormBuilder).control(initial, [
      Validators.required,
      Validators.min(range.min),
      Validators.max(range.max),
      Validators.pattern(INTEGER_PATTERN.source),
    ]);
  }
}
