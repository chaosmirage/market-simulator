import { isMarketProducerResponse } from './worker-contract';
import type {
  MarketProducerRequest,
  MarketProducerResponse,
} from './worker-contract';

/** One round trip in flight: settled exactly once, when its response lands. */
interface PendingExchange {
  resolve: (response: MarketProducerResponse) => void;
  reject: (error: Error) => void;
}

/**
 * The application's typed accessor to the market-producer worker: wraps the
 * postMessage seam in promise-based round trips, correlating each response
 * to its request by id. A worker crash or termination rejects every round
 * trip still in flight instead of leaving it hanging.
 */
export class MarketProducerWorkerClient {
  private readonly worker: Worker;
  private readonly pending = new Map<number, PendingExchange>();
  private nextId = 1;

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

  /**
   * Round trip: the worker loads the wasm artifact and reports readiness.
   * Resolves with the stub export's probe result, which proves the load.
   */
  async initWasm(): Promise<number> {
    const response = await this.exchange('wasm-init');
    if (response.kind === 'wasm-ready') {
      return response.probe;
    }
    throw new Error(
      response.kind === 'wasm-error'
        ? response.message
        : `the worker answered wasm-init with ${response.kind}`
    );
  }

  /** Ends the worker; every round trip still in flight rejects. */
  terminate(): void {
    this.failAll(new Error('market-producer worker terminated'));
    this.worker.terminate();
  }

  private async exchange(
    kind: MarketProducerRequest['kind']
  ): Promise<MarketProducerResponse> {
    const request: MarketProducerRequest = { kind, id: this.nextId++ };
    return new Promise<MarketProducerResponse>((resolve, reject) => {
      this.pending.set(request.id, { resolve, reject });
      this.worker.postMessage(request);
    });
  }

  private settle(message: unknown): void {
    if (!isMarketProducerResponse(message)) {
      // Messages the client does not correlate (future worker-initiated
      // traffic) are not errors; they simply answer no pending request.
      return;
    }
    const exchange = this.pending.get(message.id);
    if (!exchange) {
      console.error(
        `market-producer worker posted a response for unknown request id ${message.id}`
      );
      return;
    }
    this.pending.delete(message.id);
    exchange.resolve(message);
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
