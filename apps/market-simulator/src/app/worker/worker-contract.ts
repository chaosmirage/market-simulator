/**
 * The message vocabulary between the application and the market-producer
 * worker: every value crossing the worker boundary is one of these shapes,
 * nothing else. Commands carry a correlation id and are answered by an ack
 * repeating it; the worker also pushes status, snapshot, and error messages
 * on its own, each stamped with the run it belongs to.
 */
import type { InstrumentMetricsReading } from './market-metrics';

/** Correlation id: an ack answers exactly the command whose id it repeats. */
export type RequestId = number;

/**
 * Identity of one producer run. The worker allocates these monotonically and
 * never reuses one; every push carries the run it was produced under, so a
 * result from a replaced run is recognizable and droppable by identity.
 */
export type RunId = number;

/** The four mutually distinguishable conditions a producer run can be in. */
export type RunStatus = 'initializing' | 'running' | 'paused' | 'error';

/** The producer settings a run is established under. */
export interface SimulationSettings {
  /** How many fictional instruments generate data: 1 .. 50. */
  readonly instrumentCount: number;
  /** How many market updates each generated batch carries: 1 .. 1000. */
  readonly updatesPerBatch: number;
  /** The requested time between batches, in milliseconds: 50 .. 2000. */
  readonly batchIntervalMs: number;
}

/**
 * The single source of the settings ranges: the form's validators, the
 * boundary validation here, and any derived reading all read these numbers.
 */
export const SIMULATION_SETTINGS_LIMITS = {
  instrumentCount: { min: 1, max: 50 },
  updatesPerBatch: { min: 1, max: 1000 },
  batchIntervalMs: { min: 50, max: 2000 },
} as const;

/**
 * The single source of the settings the application starts with, before any
 * adjustment is applied.
 */
export const DEFAULT_SIMULATION_SETTINGS: SimulationSettings = {
  instrumentCount: 5,
  updatesPerBatch: 100,
  batchIntervalMs: 500,
};

/** A command the application sends into the worker. */
export type MarketProducerRequest =
  | { readonly kind: 'ping'; readonly id: RequestId }
  | {
      readonly kind: 'start';
      readonly id: RequestId;
      readonly settings: SimulationSettings;
    }
  | {
      readonly kind: 'apply';
      readonly id: RequestId;
      readonly settings: SimulationSettings;
    }
  | { readonly kind: 'pause'; readonly id: RequestId }
  | { readonly kind: 'resume'; readonly id: RequestId };

/**
 * The answer to a command: it repeats the command's id, names the run it
 * established or acted on, and reports the run's status after the command.
 * A null runId means the command found no run to act on; the reason then
 * rides a separate error push.
 */
export type MarketProducerCommandAck =
  | { readonly kind: 'started'; readonly id: RequestId; readonly runId: RunId | null; readonly status: RunStatus }
  | { readonly kind: 'applied'; readonly id: RequestId; readonly runId: RunId | null; readonly status: RunStatus }
  | { readonly kind: 'paused'; readonly id: RequestId; readonly runId: RunId | null; readonly status: RunStatus }
  | { readonly kind: 'resumed'; readonly id: RequestId; readonly runId: RunId | null; readonly status: RunStatus };

/**
 * One row of a metric snapshot: the instrument's identity and its display
 * symbol, plus the five current readings, unavailable members carried as
 * null. The producer derives the symbol from the instrument identity, so a
 * row carries everything a dashboard row renders.
 */
export interface InstrumentMetricsSnapshotRow
  extends InstrumentMetricsReading {
  readonly instrumentId: number;
  readonly symbol: string;
}

/** Everything the worker posts back: command acks and its own pushes. */
export type MarketProducerResponse =
  | { readonly kind: 'echo'; readonly id: RequestId }
  | MarketProducerCommandAck
  | { readonly kind: 'status'; readonly runId: RunId; readonly status: RunStatus }
  | {
      readonly kind: 'snapshot';
      readonly runId: RunId;
      readonly rows: readonly InstrumentMetricsSnapshotRow[];
    }
  | {
      readonly kind: 'error';
      /** Null when the failure happened before any run identity existed. */
      readonly runId: RunId | null;
      readonly message: string;
    };

/**
 * The dedicated-worker global surface the worker entry installs itself on.
 * Kept minimal (and declared here rather than taken from a lib) because the
 * app is compiled against the DOM lib, whose `self` typing does not describe
 * the worker scope's single-argument postMessage.
 */
export interface WorkerScope {
  onmessage: ((event: { readonly data: unknown }) => void) | null;
  postMessage(message: unknown): void;
}

/**
 * Whether a value is a settings object inside every range, integers
 * included. Structured clone is untyped at run time, so the boundary
 * validates instead of trusting the sender.
 */
function isSimulationSettings(value: unknown): value is SimulationSettings {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const { instrumentCount, updatesPerBatch, batchIntervalMs } =
    value as Partial<SimulationSettings>;
  return (
    isIntegerInRange(instrumentCount, SIMULATION_SETTINGS_LIMITS.instrumentCount) &&
    isIntegerInRange(updatesPerBatch, SIMULATION_SETTINGS_LIMITS.updatesPerBatch) &&
    isIntegerInRange(batchIntervalMs, SIMULATION_SETTINGS_LIMITS.batchIntervalMs)
  );
}

function isIntegerInRange(
  value: unknown,
  range: { readonly min: number; readonly max: number }
): boolean {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= range.min &&
    value <= range.max
  );
}

/**
 * Whether a structured-clone value is a valid request, settings member
 * included.
 */
export function isMarketProducerRequest(
  value: unknown
): value is MarketProducerRequest {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const { kind, id, settings } = value as {
    kind?: unknown;
    id?: unknown;
    settings?: unknown;
  };
  if (typeof id !== 'number' || !Number.isInteger(id)) {
    return false;
  }
  switch (kind) {
    case 'ping':
    case 'pause':
    case 'resume':
      return true;
    case 'start':
    case 'apply':
      return isSimulationSettings(settings);
    default:
      return false;
  }
}

/** Whether a value is an allocated run identity. */
function isRunId(value: unknown): value is RunId {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1;
}

function isRunStatus(value: unknown): value is RunStatus {
  return (
    value === 'initializing' ||
    value === 'running' ||
    value === 'paused' ||
    value === 'error'
  );
}

/** Whether a metric member is the unavailable marker or a finite reading. */
function isReadingOrNull(value: unknown): boolean {
  return value === null || (typeof value === 'number' && Number.isFinite(value));
}

function isSnapshotRow(value: unknown): value is InstrumentMetricsSnapshotRow {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  // The boundary refuses rows carrying members outside the contract: an
  // untyped structured-clone value must be exactly a snapshot row.
  const snapshotRowKeys: ReadonlySet<string> = new Set([
    'instrumentId',
    'symbol',
    'lastTradedPriceCents',
    'spreadCents',
    'volume',
    'vwapCents',
    'imbalance',
  ]);
  for (const key of Object.keys(value)) {
    if (!snapshotRowKeys.has(key)) {
      return false;
    }
  }
  const {
    instrumentId,
    symbol,
    lastTradedPriceCents,
    spreadCents,
    volume,
    vwapCents,
    imbalance,
  } = value as Record<string, unknown>;
  return (
    typeof instrumentId === 'number' &&
    Number.isInteger(instrumentId) &&
    instrumentId >= 0 &&
    typeof symbol === 'string' &&
    symbol !== '' &&
    isReadingOrNull(lastTradedPriceCents) &&
    isReadingOrNull(spreadCents) &&
    typeof volume === 'number' &&
    Number.isFinite(volume) &&
    volume >= 0 &&
    isReadingOrNull(vwapCents) &&
    (imbalance === null ||
      (typeof imbalance === 'number' &&
        Number.isFinite(imbalance) &&
        imbalance >= -1 &&
        imbalance <= 1))
  );
}

/** Whether a structured-clone value is a valid response, member shape included. */
export function isMarketProducerResponse(
  value: unknown
): value is MarketProducerResponse {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const { kind, id, runId, status, rows, message } = value as {
    kind?: unknown;
    id?: unknown;
    runId?: unknown;
    status?: unknown;
    rows?: unknown;
    message?: unknown;
  };
  switch (kind) {
    case 'echo':
      return typeof id === 'number' && Number.isInteger(id);
    case 'started':
    case 'applied':
    case 'paused':
    case 'resumed':
      return (
        typeof id === 'number' &&
        Number.isInteger(id) &&
        (runId === null || isRunId(runId)) &&
        isRunStatus(status)
      );
    case 'status':
      return isRunId(runId) && isRunStatus(status);
    case 'snapshot':
      return (
        isRunId(runId) &&
        Array.isArray(rows) &&
        rows.every(isSnapshotRow)
      );
    case 'error':
      return (runId === null || isRunId(runId)) && typeof message === 'string';
    default:
      return false;
  }
}
