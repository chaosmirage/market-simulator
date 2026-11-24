// @vitest-environment node
// Node environment on purpose: the client is exercised against a stand-in
// Worker global, so the typed round trips, the push listeners, and the
// single-construction guarantee are pinned without a real worker.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SimulationSettings } from './worker-contract';

/**
 * A stand-in dedicated worker: captures everything posted into it and lets
 * the test deliver messages back through the same channel the real worker
 * uses.
 */
class StandInWorker {
  static instances: StandInWorker[] = [];
  readonly posted: unknown[] = [];
  onmessage: ((event: { readonly data: unknown }) => void) | null = null;
  onerror: ((event: { readonly message: string }) => void) | null = null;
  terminated = false;

  constructor() {
    StandInWorker.instances.push(this);
  }

  postMessage(message: unknown) {
    this.posted.push(message);
  }

  terminate() {
    this.terminated = true;
  }

  /** Delivers a message from the worker side of the channel. */
  emit(message: unknown) {
    this.onmessage?.({ data: message });
  }

  fail(message: string) {
    this.onerror?.({ message });
  }
}

const SETTINGS: SimulationSettings = {
  instrumentCount: 5,
  updatesPerBatch: 100,
  batchIntervalMs: 500,
};

const WORKED_EXAMPLE_SNAPSHOT = {
  kind: 'snapshot',
  runId: 1,
  rows: [
    {
      instrumentId: 0,
      symbol: 'ALFA',
      lastTradedPriceCents: 10200,
      spreadCents: 4,
      volume: 40,
      vwapCents: 10150,
      imbalance: 0.2,
    },
  ],
};

describe('the market-producer worker client', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
    StandInWorker.instances = [];
    vi.stubGlobal('Worker', StandInWorker);
  });

  async function installClient() {
    const module = await import('./worker-client');
    return new module.MarketProducerWorkerClient();
  }

  it('answers the typed ping round trip with the typed echo', async () => {
    const client = await installClient();
    const worker = StandInWorker.instances[0];

    const roundTrip = client.ping();
    expect(worker.posted).toEqual([{ kind: 'ping', id: 1 }]);
    worker.emit({ kind: 'echo', id: 1 });
    await expect(roundTrip).resolves.toBeUndefined();
  });

  it('settles each producer command on its correlated acknowledgement', async () => {
    const client = await installClient();
    const worker = StandInWorker.instances[0];

    const started = client.start(SETTINGS);
    expect(worker.posted).toEqual([{ kind: 'start', id: 1, settings: SETTINGS }]);
    worker.emit({ kind: 'started', id: 1, runId: 4, status: 'running' });
    await expect(started).resolves.toMatchObject({
      runId: 4,
      status: 'running',
    });

    const paused = client.pause();
    expect(worker.posted[1]).toEqual({ kind: 'pause', id: 2 });
    worker.emit({ kind: 'paused', id: 2, runId: 4, status: 'paused' });
    await expect(paused).resolves.toMatchObject({
      runId: 4,
      status: 'paused',
    });

    const resumed = client.resume();
    worker.emit({ kind: 'resumed', id: 3, runId: 4, status: 'running' });
    await expect(resumed).resolves.toMatchObject({
      runId: 4,
      status: 'running',
    });

    const applied = client.apply(SETTINGS);
    expect(worker.posted[3]).toEqual({
      kind: 'apply',
      id: 4,
      settings: SETTINGS,
    });
    worker.emit({ kind: 'applied', id: 4, runId: 5, status: 'running' });
    await expect(applied).resolves.toMatchObject({
      runId: 5,
      status: 'running',
    });
  });

  it('delivers worker-initiated pushes to their registered listeners', async () => {
    const client = await installClient();
    const worker = StandInWorker.instances[0];
    const snapshots: unknown[] = [];
    const statuses: unknown[] = [];
    const errors: unknown[] = [];

    client.onSnapshot((snapshot) => snapshots.push(snapshot));
    client.onStatus((status) => statuses.push(status));
    client.onError((error) => errors.push(error));

    worker.emit({ kind: 'status', runId: 1, status: 'running' });
    worker.emit(WORKED_EXAMPLE_SNAPSHOT);
    worker.emit({ kind: 'error', runId: null, message: 'no producer yet' });

    expect(statuses).toEqual([{ kind: 'status', runId: 1, status: 'running' }]);
    expect(snapshots).toEqual([WORKED_EXAMPLE_SNAPSHOT]);
    expect(errors).toEqual([
      { kind: 'error', runId: null, message: 'no producer yet' },
    ]);
  });

  it('withholds pushes that belong to a previous run', async () => {
    const client = await installClient();
    const worker = StandInWorker.instances[0];
    const snapshots: unknown[] = [];

    client.onSnapshot((snapshot) => snapshots.push(snapshot));

    const started = client.start(SETTINGS);
    worker.emit({ kind: 'started', id: 1, runId: 2, status: 'running' });
    await started;

    worker.emit({
      kind: 'snapshot',
      runId: 1,
      rows: [{ instrumentId: 0, symbol: 'STALE', lastTradedPriceCents: 9990, spreadCents: 2, volume: 999, vwapCents: 9990, imbalance: 0.1 }],
    });
    worker.emit({
      kind: 'snapshot',
      runId: 2,
      rows: [{ instrumentId: 0, symbol: 'CURRENT', lastTradedPriceCents: 10, spreadCents: null, volume: 1, vwapCents: 10, imbalance: null }],
    });

    expect(snapshots).toEqual([
      {
        kind: 'snapshot',
        runId: 2,
        rows: [{ instrumentId: 0, symbol: 'CURRENT', lastTradedPriceCents: 10, spreadCents: null, volume: 1, vwapCents: 10, imbalance: null }],
      },
    ]);
  });

  it('rejects every round trip still in flight when the worker fails or is ended', async () => {
    const client = await installClient();
    const worker = StandInWorker.instances[0];

    const started = client.start(SETTINGS);
    worker.fail('the producer thread crashed');

    await expect(started).rejects.toThrow('the producer thread crashed');

    const paused = client.pause();
    client.terminate();
    expect(worker.terminated).toBe(true);
    await expect(paused).rejects.toThrow();
  });

  it('constructs exactly one worker for the whole application through the shared accessor', async () => {
    const module = await import('./worker-client');

    const first = module.getMarketProducerWorkerClient();
    const second = module.getMarketProducerWorkerClient();

    expect(second).toBe(first);
    expect(StandInWorker.instances).toHaveLength(1);
  });
});
