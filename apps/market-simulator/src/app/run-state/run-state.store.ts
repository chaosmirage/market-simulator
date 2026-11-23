import { Injectable, signal } from '@angular/core';
import type {
  InstrumentMetricsSnapshotRow,
  MarketProducerResponse,
  RunId,
  RunStatus,
} from '../worker/worker-contract';

/**
 * The displayed form of one metric snapshot: the run it belongs to and one
 * row per instrument. The shell band and both destinations read this; only
 * the store writes it.
 */
export interface RunSnapshot {
  readonly runId: RunId;
  readonly rows: readonly InstrumentMetricsSnapshotRow[];
}

/**
 * The application-level home of the displayed run condition and the latest
 * metric snapshot. The producer lives at the application level, so this
 * store does too: navigation between destinations neither creates it nor
 * disturbs the state it holds. Pushes arriving through acceptPush become
 * signal readings; a push belonging to a replaced run never overwrites the
 * current one.
 */
@Injectable({ providedIn: 'root' })
export class RunStateStore {
  private readonly statusSignal = signal<RunStatus>('initializing');
  private readonly snapshotSignal = signal<RunSnapshot | null>(null);
  private readonly errorSignal = signal<string | null>(null);
  /** The newest run identity any accepted push has carried. */
  private newestRunId: RunId | null = null;

  /** The producer's current condition, as the shell band reads it. */
  readonly status = this.statusSignal.asReadonly();

  /** The latest accepted metric snapshot, or null before the first one. */
  readonly snapshot = this.snapshotSignal.asReadonly();

  /** The failure reason in the error condition, or null otherwise. */
  readonly error = this.errorSignal.asReadonly();

  /** Feeds one worker push into the displayed readings. */
  acceptPush(push: MarketProducerResponse): void {
    switch (push.kind) {
      case 'status':
        this.newestRunId =
          this.newestRunId === null ? push.runId : Math.max(this.newestRunId, push.runId);
        this.statusSignal.set(push.status);
        break;
      case 'snapshot':
        if (this.newestRunId !== null && push.runId < this.newestRunId) {
          return;
        }
        this.newestRunId = push.runId;
        this.snapshotSignal.set({ runId: push.runId, rows: push.rows });
        break;
      case 'error':
        this.statusSignal.set('error');
        this.errorSignal.set(push.message);
        break;
      default:
        break;
    }
  }
}
