import {
  applyMarketUpdate,
  createInstrumentAnalyticsState,
  readInstrumentMetrics,
  type InstrumentAnalyticsState,
  type MarketUpdateRecord,
} from './market-metrics';
import {
  isMarketProducerRequest,
  type InstrumentMetricsSnapshotRow,
  type MarketProducerRequest,
  type RunId,
  type RunStatus,
  type SimulationSettings,
  type WorkerScope,
} from './worker-contract';

type GenerationModule = Awaited<ReturnType<typeof loadGenerationModule>>;

/**
 * Loads the generation module through the shared loader. Kept as a
 * dynamically imported call so the worker entry stays the only importer of
 * the loader surface (and so tests can substitute the module seam).
 */
function loadGenerationModule() {
  return import('../wasm/wasm-loader').then((loader) =>
    loader.loadMarketGenerator()
  );
}

// The DOM lib types `self` as the window; inside the worker it is the
// dedicated worker scope, so the seam goes through the contract's port view.
const scope = self as unknown as WorkerScope;

/** The worker's own publication cadence, independent of batch generation. */
const PUBLICATION_INTERVAL_MS = 250;

/** Display symbols derived from instrument identities, one per identity. */
const INSTRUMENT_SYMBOLS = [
  'ALFA', 'BETA', 'GAMMA', 'DELTA', 'EPSILON', 'ZETA', 'ETA', 'THETA',
  'IOTA', 'KAPPA', 'LAMBDA', 'MU', 'NU', 'XI', 'OMICRON', 'PI', 'RHO',
  'SIGMA', 'TAU', 'UPSILON', 'PHI', 'CHI', 'PSI', 'OMEGA', 'ALPHA2',
  'BRAVO', 'CHARLIE', 'DELTA2', 'ECHO', 'FOXTROT', 'GOLF', 'HOTEL',
  'INDIA', 'JULIET', 'KILO', 'LIMA', 'MIKE', 'NOVEMBER', 'OSCAR',
  'PAPA', 'QUEBEC', 'ROMEO', 'SIERRA', 'TANGO', 'UNIFORM', 'VICTOR',
  'WHISKEY', 'XRAY', 'YANKEE', 'ZULU',
] as const;

function instrumentSymbol(instrumentId: number): string {
  const named = INSTRUMENT_SYMBOLS[instrumentId];
  return named ?? `INSTRUMENT-${instrumentId}`;
}

/** A decoded record is refused before it can touch cumulative totals. */
type RecordCheck = { readonly ok: true } | { readonly ok: false; readonly reason: string };

function checkRecord(record: MarketUpdateRecord): RecordCheck {
  if (record.priceCents <= 0) {
    return { ok: false, reason: 'nonpositive trade price' };
  }
  if (record.tradeQuantity <= 0) {
    return { ok: false, reason: 'nonpositive trade quantity' };
  }
  if (record.bidCents <= 0) {
    return { ok: false, reason: 'nonpositive bid' };
  }
  if (record.bidCents >= record.askCents) {
    return { ok: false, reason: 'bid not below ask' };
  }
  if (record.bidQuantity < 0 || record.askQuantity < 0) {
    return { ok: false, reason: 'negative book quantity' };
  }
  return { ok: true };
}

/**
 * The run engine inside the worker: it owns the run identity, the settings
 * of the active run, the cumulative analytics state, the generation module,
 * and both timers (batch acquisition at the configured interval, snapshot
 * publication on its own slower cadence). One engine serves the whole
 * worker; a replacement run re-initializes the module and clears the
 * analytics before the first result of the new run can be posted.
 */
class MarketProducerEngine {
  private runId: RunId = 0;
  private status: RunStatus = 'initializing';
  private settings: SimulationSettings | null = null;
  private states: InstrumentAnalyticsState[] = [];
  private generationModule: GenerationModule | null = null;
  private moduleLoad: Promise<GenerationModule> | null = null;
  private acquisitionTimer: ReturnType<typeof setInterval> | null = null;
  private publicationTimer: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly out: WorkerScope) {}

  /** Handles one validated request; commands are processed in order. */
  handle(request: MarketProducerRequest): void {
    if (request.kind === 'ping') {
      this.out.postMessage({ kind: 'echo', id: request.id });
      return;
    }
    if (request.kind === 'pause') {
      this.pause(request.id);
      return;
    }
    if (request.kind === 'resume') {
      this.resume(request.id);
      return;
    }
    // start and apply share the replacement semantics: both establish a
    // clean run under the carried settings, running even from pause.
    void this.establishRun(request.kind, request.id, request.settings);
  }

  // -- run establishment --------------------------------------------------

  private async establishRun(
    commandKind: 'start' | 'apply',
    requestId: number,
    settings: SimulationSettings
  ): Promise<void> {
    this.stopTimers();
    const runId = this.runId + 1;
    try {
      const generation = await this.ensureGenerationModule();
      generation.init(settings.instrumentCount, this.generationSeed(runId));
      this.runId = runId;
      this.settings = settings;
      this.states = Array.from(
        { length: settings.instrumentCount },
        () => createInstrumentAnalyticsState()
      );
      this.status = 'running';
      this.startTimers();
      this.out.postMessage({
        kind: commandKind === 'start' ? 'started' : 'applied',
        id: requestId,
        runId,
        status: this.status,
      });
    } catch (error) {
      this.runId = runId;
      this.status = 'error';
      this.out.postMessage({
        kind: 'error',
        runId: null,
        message:
          error instanceof Error
            ? error.message
            : `the market producer could not start: ${String(error)}`,
      });
    }
  }

  /** One generation module serves every run; it is loaded once. */
  private ensureGenerationModule(): Promise<GenerationModule> {
    if (this.generationModule !== null) {
      return Promise.resolve(this.generationModule);
    }
    if (this.moduleLoad === null) {
      this.moduleLoad = loadGenerationModule().then((module) => {
        this.generationModule = module;
        return module;
      });
    }
    return this.moduleLoad;
  }

  private generationSeed(runId: RunId): number {
    // Deterministic per run, unique across runs, inside i32 range.
    return (runId * 2654435761) % 2147483647 + 1;
  }

  // -- lifecycle commands --------------------------------------------------

  private pause(requestId: number): void {
    if (this.status !== 'running') {
      this.out.postMessage({
        kind: 'paused',
        id: requestId,
        runId: this.runId > 0 ? this.runId : null,
        status: this.status,
      });
      return;
    }
    this.stopTimers();
    this.status = 'paused';
    // The closing snapshot reflects every event processed before the stop.
    this.publishSnapshot();
    this.out.postMessage({
      kind: 'paused',
      id: requestId,
      runId: this.runId,
      status: this.status,
    });
  }

  private resume(requestId: number): void {
    if (this.status !== 'paused') {
      this.out.postMessage({
        kind: 'resumed',
        id: requestId,
        runId: this.runId > 0 ? this.runId : null,
        status: this.status,
      });
      return;
    }
    this.status = 'running';
    this.startTimers();
    this.out.postMessage({
      kind: 'resumed',
      id: requestId,
      runId: this.runId,
      status: this.status,
    });
  }

  // -- timers and cadence --------------------------------------------------

  private startTimers(): void {
    if (this.acquisitionTimer === null && this.settings !== null) {
      this.acquisitionTimer = setInterval(
        () => this.generateOnce(),
        this.settings.batchIntervalMs
      );
    }
    if (this.publicationTimer === null) {
      this.publicationTimer = setInterval(
        () => this.publishSnapshot(),
        PUBLICATION_INTERVAL_MS
      );
    }
  }

  private stopTimers(): void {
    if (this.acquisitionTimer !== null) {
      clearInterval(this.acquisitionTimer);
      this.acquisitionTimer = null;
    }
    if (this.publicationTimer !== null) {
      clearInterval(this.publicationTimer);
      this.publicationTimer = null;
    }
  }

  // -- acquisition ---------------------------------------------------------

  private generateOnce(): void {
    if (this.generationModule === null || this.settings === null) {
      return;
    }
    const byteOffset = this.generationModule.generateBatch(
      this.settings.updatesPerBatch
    );
    if (byteOffset < 0 || this.generationModule.recordCount() <= 0) {
      this.out.postMessage({
        kind: 'error',
        runId: this.runId,
        message: 'the generation module refused the requested batch',
      });
      return;
    }
    const count = this.generationModule.recordCount();
    const words = new Uint32Array(
      this.generationModule.memory.buffer,
      byteOffset,
      count * 7
    );
    for (let record = 0; record < count; record += 1) {
      const base = record * 7;
      const update: MarketUpdateRecord = {
        instrumentId: words[base],
        priceCents: words[base + 1],
        tradeQuantity: words[base + 2],
        bidCents: words[base + 3],
        askCents: words[base + 4],
        bidQuantity: words[base + 5],
        askQuantity: words[base + 6],
      };
      // The generator's output is untrusted bytes at this boundary: every
      // record is checked before it can touch cumulative totals, and a
      // violation surfaces as a typed error instead of corrupting state.
      if (update.instrumentId >= this.states.length) {
        this.out.postMessage({
          kind: 'error',
          runId: this.runId,
          message: 'generated update names an unknown instrument',
        });
        return;
      }
      const check = checkRecord(update);
      if (!check.ok) {
        this.out.postMessage({
          kind: 'error',
          runId: this.runId,
          message: `generated update rejected: ${check.reason}`,
        });
        return;
      }
      applyMarketUpdate(this.states[update.instrumentId], update);
    }
  }

  // -- publication ---------------------------------------------------------

  private publishSnapshot(): void {
    const rows: InstrumentMetricsSnapshotRow[] = this.states.map(
      (state, instrumentId) => ({
        instrumentId,
        symbol: instrumentSymbol(instrumentId),
        ...readInstrumentMetrics(state),
      })
    );
    this.out.postMessage({ kind: 'snapshot', runId: this.runId, rows });
  }
}

const engine = new MarketProducerEngine(scope);

scope.onmessage = (event) => {
  const message = event.data;
  if (!isMarketProducerRequest(message)) {
    console.error(
      'market-producer worker received an unrecognized message',
      message
    );
    return;
  }
  engine.handle(message);
};
