import { CurrencyPipe, DecimalPipe } from '@angular/common';
import {
  Component,
  DestroyRef,
  effect,
  inject,
  signal,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTableModule } from '@angular/material/table';
import { DestinationIdentificationComponent } from '../destination-identification/destination-identification.component';
import { MARKET_DASHBOARD } from '../destinations';
import { RunStateStore } from '../run-state/run-state.store';
import { MARKET_PRODUCER_WORKER_CLIENT } from '../worker/worker-client';
import type { InstrumentMetricsSnapshotRow } from '../worker/worker-contract';

/** The five metric columns, in the reading's fixed order. */
const METRIC_COLUMNS = [
  'symbol',
  'last',
  'spread',
  'volume',
  'vwap',
  'imbalance',
] as const;

/**
 * The market-dashboard destination: one row per instrument carrying its
 * five current readings, replaced wholesale as each ready snapshot lands,
 * with the run command at the reading's head. The rows and the run
 * condition are read through the shared run-state store; the page holds no
 * producer state of its own.
 */
@Component({
  imports: [
    DestinationIdentificationComponent,
    MatTableModule,
    MatButtonModule,
    MatIconModule,
    CurrencyPipe,
    DecimalPipe,
  ],
  selector: 'app-market-dashboard',
  templateUrl: './market-dashboard.component.html',
  styleUrl: './market-dashboard.component.css',
})
export class MarketDashboardComponent {
  protected readonly displayedColumns = [...METRIC_COLUMNS];
  protected readonly rows = signal<readonly InstrumentMetricsSnapshotRow[]>([]);

  protected readonly destination = MARKET_DASHBOARD;

  private readonly store = inject(RunStateStore);
  private readonly client = inject(MARKET_PRODUCER_WORKER_CLIENT);

  /** True while the run generates: the command offers the stop direction. */
  protected readonly isRunning = signal(false);
  /** True while the run stands paused: the command offers the continue direction. */
  protected readonly isPaused = signal(false);

  constructor() {
    // The store is fed by whichever destination is open; this one registers
    // the snapshot and condition pushes and releases them with itself.
    const offSnapshot = this.client.onSnapshot((push) =>
      this.store.acceptPush(push)
    );
    const offStatus = this.client.onStatus((push) =>
      this.store.acceptPush(push)
    );
    const offError = this.client.onError((push) =>
      this.store.acceptPush(push)
    );
    inject(DestroyRef).onDestroy(() => {
      offSnapshot();
      offStatus();
      offError();
    });

    // Every ready snapshot replaces the whole reading; the run condition
    // drives the single command offer at the reading's head.
    effect(() => {
      const snapshot = this.store.snapshot();
      this.rows.set(snapshot?.rows ?? []);
      const status = this.store.status();
      this.isRunning.set(status === 'running');
      this.isPaused.set(status === 'paused');
    });
  }

  /** Stops generation while the run generates. */
  protected stopRun(): void {
    void this.client.pause();
  }

  /** Continues generation while the run stands paused. */
  protected continueRun(): void {
    void this.client.resume();
  }

  /** A currency reading in dollars, or the unavailable marker. */
  protected asCurrency(cents: number | null): string {
    return cents === null ? 'unavailable' : `$${(cents / 100).toFixed(2)}`;
  }

  /** The cumulative traded quantity, or zero before any trade has landed. */
  protected asCount(volume: number | null): string {
    return volume === null ? 'unavailable' : `${volume}`;
  }

  /**
   * The order-book imbalance between -1 and +1 with its explicit sign, or
   * the unavailable marker when the book quantities sum to zero.
   */
  protected asImbalance(imbalance: number | null): string {
    if (imbalance === null) {
      return 'unavailable';
    }
    const magnitude = Math.abs(imbalance).toFixed(2);
    if (imbalance > 0) {
      return `+${magnitude}`;
    }
    return imbalance < 0 ? `-${magnitude}` : magnitude;
  }
}
