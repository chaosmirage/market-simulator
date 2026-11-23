import { InjectionToken } from '@angular/core';
import { isMarketProducerResponse } from './worker-contract';
import type {
  MarketProducerRequest,
  MarketProducerResponse,
  MarketProducerCommandAck,
  RunId,
  RunStatus,
  SimulationSettings,
} from './worker-contract';

/** One round trip in flight: settled exactly once, when its response lands. */
interface PendingExchange {
  resolve: (response: MarketProducerResponse) => void;
  reject: (error: Error) => void;
}

/** The result of a settled producer command: its run and resulting status. */
export interface CommandResult {
  readonly runId: RunId | null;
  readonly status: RunStatus;
}

/** A listener registered for the worker's snapshot pushes. */
export type SnapshotListener = (
  snapshot: Extract<
    MarketProducerResponse,
    { readonly kind: 'snapshot' }
  >
) => void;

/** A listener registered for the worker's status pushes. */
export type StatusListener = (
  status: Extract<MarketProducerResponse, { readonly kind: 'status' }>
) => void;

/** A listener registered for the worker's error pushes. */
export type ErrorListener = (
  error: Extract<MarketProducerResponse, { readonly kind: 'error' }>
) => void;

/**
 * The application's typed accessor to the market-producer worker: wraps the
 * postMessage seam in promise-based round trips, correlating each response
 * to its request by id, and delivers the worker's own pushes to registered
 * listeners. Results belonging to a replaced run are withheld by identity,
 * so a late push from a previous run can never overwrite the active one. A
 * worker crash or termination rejects every round trip still in flight
 * instead of leaving it hanging.
 */
export class MarketProducerWorkerClient {
  private readonly worker: Worker;
  private readonly pending = new Map<number, PendingExchange>();
  private readonly snapshotListeners = new Set<SnapshotListener>();
  private readonly statusListeners = new Set<StatusListener>();
  private readonly errorListeners = new Set<ErrorListener>();
  private nextId = 1;
  /** The run identity this client has settled on; pushes before it stale out. */
  private activeRunId: RunId | null = null;

  /**
   * Created through getMarketProducerWorkerClient() — the app-wide single
   * construction path, so exactly one worker exists per application.
   */
  constructor() {
    this.worker = new Worker(
      new URL('./market-producer.worker', import.meta.url),
      { type: 'module' }
    );
    this.worker.onmessage = (event) => this.settle(event.data);
    this.worker.onerror = (event) =>
      this.failAll(new Error(event.message || 'market-producer worker failed'));
  }

  /** Round trip: the worker answers a typed ping with the typed echo. */
  async ping(): Promise<void> {
    const response = await this.exchange('ping');
    if (response.kind !== 'echo') {
      throw new Error(`the worker answered a ping with ${response.kind}`);
    }
  }

  /** Establishes the first run under the given settings. */
  async start(settings: SimulationSettings): Promise<CommandResult> {
    return this.command('start', settings);
  }

  /** Replaces the active run under the given settings, clearing its totals. */
  async apply(settings: SimulationSettings): Promise<CommandResult> {
    return this.command('apply', settings);
  }

  /** Stops generation; totals survive until resume or apply. */
  async pause(): Promise<CommandResult> {
    return this.command('pause');
  }

  /** Continues the paused run without catch-up generation. */
  async resume(): Promise<CommandResult> {
    return this.command('resume');
  }

  /** Registers a listener for the worker's snapshot pushes. */
  onSnapshot(listener: SnapshotListener): () => void {
    this.snapshotListeners.add(listener);
    return () => this.snapshotListeners.delete(listener);
  }

  /** Registers a listener for the worker's status pushes. */
  onStatus(listener: StatusListener): () => void {
    this.statusListeners.add(listener);
    return () => this.statusListeners.delete(listener);
  }

  /** Registers a listener for the worker's error pushes. */
  onError(listener: ErrorListener): () => void {
    this.errorListeners.add(listener);
    return () => this.errorListeners.delete(listener);
  }

  /** Ends the worker; every round trip still in flight rejects. */
  terminate(): void {
    this.failAll(new Error('market-producer worker terminated'));
    this.worker.terminate();
  }

  private async command(
    kind: 'start' | 'apply' | 'pause' | 'resume',
    settings?: SimulationSettings
  ): Promise<CommandResult> {
    const response = await this.exchange(kind, settings);
    if (response.kind !== 'started' && response.kind !== 'applied' && response.kind !== 'paused' && response.kind !== 'resumed') {
      throw new Error(`the worker answered ${kind} with ${response.kind}`);
    }
    const ack: MarketProducerCommandAck = response;
    if (ack.runId !== null) {
      this.activeRunId = ack.runId;
      // The condition change the command caused is delivered through the
      // same status channel the worker's own pushes use, so every reader of
      // the condition sees one consistent source.
      this.deliverStatus({
        kind: 'status',
        runId: ack.runId,
        status: ack.status,
      });
    }
    return { runId: ack.runId, status: ack.status };
  }

  private async exchange(
    kind: MarketProducerRequest['kind'],
    settings?: SimulationSettings
  ): Promise<MarketProducerResponse> {
    const request: MarketProducerRequest =
      kind === 'start' || kind === 'apply'
        ? {
            kind,
            id: this.nextId++,
            settings: settings as SimulationSettings,
          }
        : { kind, id: this.nextId++ };
    return new Promise<MarketProducerResponse>((resolve, reject) => {
      this.pending.set(request.id, { resolve, reject });
      this.worker.postMessage(request);
    });
  }

  private settle(message: unknown): void {
    if (!isMarketProducerResponse(message)) {
      return;
    }
    switch (message.kind) {
      case 'snapshot':
      case 'status':
        // A push stamped with a run this client has already moved past is
        // withheld: a late result of a previous run never reaches state.
        if (this.activeRunId !== null && message.runId < this.activeRunId) {
          return;
        }
        break;
      case 'error':
        // An error stamped with a replaced run identity is stale too; an
        // error before any run existed (null runId) is always delivered.
        if (
          message.runId !== null &&
          this.activeRunId !== null &&
          message.runId < this.activeRunId
        ) {
          return;
        }
        break;
      default:
        break;
    }
    switch (message.kind) {
      case 'snapshot':
        for (const listener of this.snapshotListeners) {
          listener(message);
        }
        return;
      case 'status':
        for (const listener of this.statusListeners) {
          listener(message);
        }
        return;
      case 'error':
        for (const listener of this.errorListeners) {
          listener(message);
        }
        return;
      default:
        break;
    }
    const exchange = this.pending.get((message as { id?: number }).id ?? -1);
    if (!exchange) {
      console.error(
        'market-producer worker posted a response for unknown request',
        message
      );
      return;
    }
    this.pending.delete((message as { id: number }).id);
    exchange.resolve(message);
  }

  private deliverStatus(push: Extract<
    MarketProducerResponse,
    { readonly kind: 'status' }
  >): void {
    for (const listener of this.statusListeners) {
      listener(push);
    }
  }

  private failAll(error: Error): void {
    for (const exchange of this.pending.values()) {
      exchange.reject(error);
    }
    this.pending.clear();
  }
}

let marketProducerWorkerClient: MarketProducerWorkerClient | undefined;

/**
 * The app-wide worker seam: exactly one client — and one worker — for the
 * whole application lifetime. Importing this module spawns nothing; the
 * first call creates the worker.
 */
export function getMarketProducerWorkerClient(): MarketProducerWorkerClient {
  if (!marketProducerWorkerClient) {
    marketProducerWorkerClient = new MarketProducerWorkerClient();
  }
  return marketProducerWorkerClient;
}

/**
 * The DI seam for the application's producer client: the app config and the
 * destinations reach the shared client through this token, whose factory
 * keeps the single-construction path; specs override the token with a
 * stand-in client instead of constructing a real worker.
 */
export const MARKET_PRODUCER_WORKER_CLIENT =
  new InjectionToken<MarketProducerWorkerClient>(
    'MARKET_PRODUCER_WORKER_CLIENT',
    {
      providedIn: 'root',
      factory: () => getMarketProducerWorkerClient(),
    }
  );
