// @vitest-environment node
// Node environment on purpose: neither node nor jsdom provides the Worker
// global, so this spec pins the message contract by driving the handler the
// worker entry installs on its scope. The live Worker round trip is the
// running app's proof.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MarketProducerRequest, WorkerScope } from './worker-contract';

/**
 * A stand-in for the dedicated-worker global scope: captures the handler the
 * worker entry installs and every message it posts back.
 */
function installWorkerScopeStub() {
  const posted: unknown[] = [];
  let handler: ((event: { readonly data: unknown }) => void) | null = null;
  const scope: WorkerScope = {
    get onmessage() {
      return handler;
    },
    set onmessage(next) {
      handler = next;
    },
    postMessage(message: unknown) {
      posted.push(message);
    },
  };
  vi.stubGlobal('self', scope);
  return {
    posted,
    send(request: MarketProducerRequest) {
      handler?.({ data: request });
    },
  };
}

// The generation module is replaced by a scripted stand-in whose linear
// memory plays deterministic batches, so acquisition and publication
// behavior is observed without the real artifact.
const loaderState = vi.hoisted(() => ({
  runs: 0,
  wasm: null as unknown,
  failure: null as unknown,
}));

vi.mock('../wasm/wasm-loader', () => ({
  loadWasmStub: (() => {
    loaderState.runs += 1;
    if (loaderState.failure !== null) {
      return Promise.reject(loaderState.failure);
    }
    return Promise.resolve(loaderState.wasm);
  }) as unknown as typeof import('../wasm/wasm-loader')['loadWasmStub'],
}));

const RECORD_FIELDS = 7;
const RECORD_BUFFER_OFFSET = 64;

/** One scripted batch: records of seven u32 fields in the contract order. */
type ScriptedRecord = readonly [
  instrumentId: number,
  priceCents: number,
  tradeQuantity: number,
  bidCents: number,
  askCents: number,
  bidQuantity: number,
  askQuantity: number,
];

/**
 * A generation-module stand-in over real WebAssembly memory: each batch
 * request writes the next scripted batch (repeating the last one when the
 * script runs out) and reports the shared buffer offset, mirroring the
 * pointer-plus-count record contract.
 */
function createScriptedGenerationModule(batches: readonly ScriptedRecord[][]) {
  const memory = new WebAssembly.Memory({ initial: 1 });
  let recordsWritten = 0;
  let scriptedBatch = 0;
  const inits: Array<{ instrumentCount: number; seed: number }> = [];
  return {
    memory,
    inits,
    batchesGenerated: 0,
    init(instrumentCount: number, seed: number) {
      inits.push({ instrumentCount, seed });
      scriptedBatch = 0;
    },
    generateBatch(requested: number): number {
      this.batchesGenerated += 1;
      const batch = batches[Math.min(scriptedBatch, batches.length - 1)];
      scriptedBatch += 1;
      const view = new Uint32Array(
        memory.buffer,
        RECORD_BUFFER_OFFSET,
        requested * RECORD_FIELDS
      );
      for (let record = 0; record < requested; record += 1) {
        const scripted = batch[record % batch.length];
        for (let field = 0; field < RECORD_FIELDS; field += 1) {
          view[record * RECORD_FIELDS + field] = scripted[field];
        }
      }
      recordsWritten = requested;
      return RECORD_BUFFER_OFFSET;
    },
    recordCount(): number {
      return recordsWritten;
    },
  };
}

const TWO_INSTRUMENT_TRADE_A: ScriptedRecord = [
  0, 10200, 30, 10196, 10200, 600, 400,
];
const TWO_INSTRUMENT_TRADE_B: ScriptedRecord = [
  1, 5100, 10, 5098, 5100, 300, 200,
];

const START_SETTINGS = {
  instrumentCount: 2,
  updatesPerBatch: 2,
  batchIntervalMs: 700,
};

const REPLACEMENT_SETTINGS = {
  instrumentCount: 3,
  updatesPerBatch: 4,
  batchIntervalMs: 300,
};

function snapshotsOf(posted: readonly unknown[]) {
  return posted.filter(
    (message) =>
      typeof message === 'object' &&
      message !== null &&
      (message as { kind?: unknown }).kind === 'snapshot'
  ) as Array<{ runId: number; rows: Array<Record<string, unknown>> }>;
}

describe('market-producer worker message contract', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
  });

  it('answers a typed ping with the typed echo carrying the same id', async () => {
    const scope = installWorkerScopeStub();

    await import('./market-producer.worker');
    scope.send({ kind: 'ping', id: 7 });

    expect(scope.posted).toEqual([{ kind: 'echo', id: 7 }]);
  });

  it('answers a second ping without disturbing the first round trip', async () => {
    const scope = installWorkerScopeStub();

    await import('./market-producer.worker');
    scope.send({ kind: 'ping', id: 1 });
    scope.send({ kind: 'ping', id: 2 });

    expect(scope.posted).toEqual([
      { kind: 'echo', id: 1 },
      { kind: 'echo', id: 2 },
    ]);
  });
});

describe('market-producer worker run lifecycle', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
    vi.useFakeTimers();
    loaderState.runs = 0;
    loaderState.wasm = null;
    loaderState.failure = null;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  async function installWorker() {
    const scope = installWorkerScopeStub();
    await import('./market-producer.worker');
    return scope;
  }

  async function startRun(
    scope: ReturnType<typeof installWorkerScopeStub>,
    settings = START_SETTINGS,
    id = 1
  ) {
    scope.send({ kind: 'start', id, settings });
    await vi.advanceTimersByTimeAsync(0);
  }

  it('generates at the configured cadence, publishes on its own slower cadence, and stamps every push with the run id', async () => {
    const generation = createScriptedGenerationModule([
      [TWO_INSTRUMENT_TRADE_A, TWO_INSTRUMENT_TRADE_B],
    ]);
    loaderState.wasm = generation;
    const scope = await installWorker();

    await startRun(scope);

    expect(generation.inits).toHaveLength(1);
    expect(generation.inits[0].instrumentCount).toBe(
      START_SETTINGS.instrumentCount
    );
    expect(scope.posted).toEqual([
      { kind: 'started', id: 1, runId: 1, status: 'running' },
    ]);

    await vi.advanceTimersByTimeAsync(1400);
    // Batches land at each configured interval (700, 1400); snapshots on
    // their own slower cadence (250, 500, 750, 1000, 1250).
    expect(generation.batchesGenerated).toBe(2);
    const snapshots = snapshotsOf(scope.posted);
    expect(snapshots).toHaveLength(5);
    for (const snapshot of snapshots) {
      expect(snapshot.runId).toBe(1);
      expect(snapshot.rows).toHaveLength(START_SETTINGS.instrumentCount);
      const symbols = snapshot.rows.map((row) => row.symbol);
      expect(new Set(symbols).size).toBe(symbols.length);
      for (const symbol of symbols) {
        expect(typeof symbol).toBe('string');
        expect(symbol).not.toBe('');
      }
    }
  });

  it('stops generating at pause with one final snapshot covering every processed event, then resumes without a catch-up burst', async () => {
    const generation = createScriptedGenerationModule([
      [TWO_INSTRUMENT_TRADE_A, TWO_INSTRUMENT_TRADE_B],
    ]);
    loaderState.wasm = generation;
    const scope = await installWorker();
    await startRun(scope);
    await vi.advanceTimersByTimeAsync(1400);

    scope.send({ kind: 'pause', id: 2 });
    await vi.advanceTimersByTimeAsync(0);

    expect(scope.posted).toContainEqual({
      kind: 'paused',
      id: 2,
      runId: 1,
      status: 'paused',
    });
    const snapshotsAtPause = snapshotsOf(scope.posted);
    const finalSnapshot = snapshotsAtPause[snapshotsAtPause.length - 1];
    // The closing snapshot reflects every event processed before the stop.
    expect(finalSnapshot.rows[0]).toMatchObject({ volume: 60 });
    expect(finalSnapshot.rows[1]).toMatchObject({ volume: 20 });

    await vi.advanceTimersByTimeAsync(2100);
    // Generation and publication both stopped; nothing further was posted.
    expect(generation.batchesGenerated).toBe(2);
    expect(snapshotsOf(scope.posted)).toHaveLength(snapshotsAtPause.length);
    expect(vi.getTimerCount()).toBe(0);

    scope.send({ kind: 'resume', id: 3 });
    await vi.advanceTimersByTimeAsync(0);
    expect(scope.posted).toContainEqual({
      kind: 'resumed',
      id: 3,
      runId: 1,
      status: 'running',
    });

    // A full interval passes before the next batch, and exactly one arrives.
    await vi.advanceTimersByTimeAsync(699);
    expect(generation.batchesGenerated).toBe(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(generation.batchesGenerated).toBe(3);

    // Totals continue from their preserved values.
    await vi.advanceTimersByTimeAsync(50);
    const resumed = snapshotsOf(scope.posted);
    const last = resumed[resumed.length - 1];
    expect(last.rows[0]).toMatchObject({ volume: 90 });
    expect(last.rows[1]).toMatchObject({ volume: 30 });
  });

  it('starts a clean replacement run on apply, clearing totals and running even from pause', async () => {
    const generation = createScriptedGenerationModule([
      [TWO_INSTRUMENT_TRADE_A, TWO_INSTRUMENT_TRADE_B],
      [
        TWO_INSTRUMENT_TRADE_B,
        TWO_INSTRUMENT_TRADE_A,
        TWO_INSTRUMENT_TRADE_B,
        TWO_INSTRUMENT_TRADE_A,
      ],
    ]);
    loaderState.wasm = generation;
    const scope = await installWorker();
    await startRun(scope);
    await vi.advanceTimersByTimeAsync(1400);

    scope.send({ kind: 'pause', id: 2 });
    await vi.advanceTimersByTimeAsync(0);
    scope.send({ kind: 'apply', id: 3, settings: REPLACEMENT_SETTINGS });
    await vi.advanceTimersByTimeAsync(0);

    expect(scope.posted).toContainEqual({
      kind: 'applied',
      id: 3,
      runId: 2,
      status: 'running',
    });
    // The replacement run re-initializes the generation module.
    expect(generation.inits).toHaveLength(2);
    expect(generation.inits[1].instrumentCount).toBe(
      REPLACEMENT_SETTINGS.instrumentCount
    );

    await vi.advanceTimersByTimeAsync(300);
    const replacementSnapshots = snapshotsOf(scope.posted).filter(
      (snapshot) => snapshot.runId === 2
    );
    expect(replacementSnapshots).toHaveLength(1);
    // Totals were cleared: the fresh run opens at zero volume with
    // unavailable price readings.
    for (const row of replacementSnapshots[0].rows) {
      expect(row.volume).toBe(0);
      expect(row.lastTradedPriceCents).toBeNull();
      expect(row.vwapCents).toBeNull();
    }

    // Generation is running under the replacement settings, and no timer
    // from the replaced run survived alongside it.
    expect(generation.batchesGenerated).toBeGreaterThan(2);
    expect(vi.getTimerCount()).toBe(2);
  });

  it('never posts a result of a previous run once a replacement has been established', async () => {
    const generation = createScriptedGenerationModule([
      [TWO_INSTRUMENT_TRADE_A, TWO_INSTRUMENT_TRADE_B],
    ]);
    loaderState.wasm = generation;
    const scope = await installWorker();
    await startRun(scope);
    await vi.advanceTimersByTimeAsync(1400);

    scope.send({ kind: 'apply', id: 2, settings: REPLACEMENT_SETTINGS });
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(2000);

    const appliedAt = scope.posted.findIndex(
      (message) =>
        typeof message === 'object' &&
        message !== null &&
        (message as { kind?: unknown }).kind === 'applied'
    );
    expect(appliedAt).toBeGreaterThan(-1);
    for (const message of scope.posted.slice(appliedAt)) {
      const stamped = message as { runId?: unknown };
      if ('runId' in stamped) {
        expect(stamped.runId).toBe(2);
      }
    }
  });

  it('surfaces a failed generation-module load as a typed error push rather than silence', async () => {
    loaderState.failure = new Error('the producer artifact is missing');
    const scope = await installWorker();

    await startRun(scope);
    await vi.advanceTimersByTimeAsync(0);

    const errorPushes = scope.posted.filter(
      (message) =>
        typeof message === 'object' &&
        message !== null &&
        (message as { kind?: unknown }).kind === 'error'
    );
    expect(errorPushes).toHaveLength(1);
    const failure = errorPushes[0] as { runId: unknown; message: unknown };
    expect(typeof failure.message).toBe('string');
    expect(failure.message).toContain('missing');
    expect(
      failure.runId === null || typeof failure.runId === 'number'
    ).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });
});
