import { describe, expect, it } from 'vitest';
import {
  isMarketProducerRequest,
  isMarketProducerResponse,
} from './worker-contract';

// The boundary is untyped structured clone at run time, so these specs pin
// the vocabulary itself: exactly the agreed requests, acknowledgements, and
// worker-initiated pushes pass validation, and everything else is refused.

const VALID_SETTINGS = {
  instrumentCount: 5,
  updatesPerBatch: 100,
  batchIntervalMs: 500,
};

const MAXIMUM_SETTINGS = {
  instrumentCount: 50,
  updatesPerBatch: 1000,
  batchIntervalMs: 2000,
};

const MINIMUM_SETTINGS = {
  instrumentCount: 1,
  updatesPerBatch: 1,
  batchIntervalMs: 50,
};

const WORKED_EXAMPLE_ROW = {
  instrumentId: 0,
  symbol: 'ALFA',
  lastTradedPriceCents: 10200,
  spreadCents: 4,
  volume: 40,
  vwapCents: 10150,
  imbalance: 0.2,
};

const UNAVAILABLE_ROW = {
  instrumentId: 1,
  symbol: 'BETA',
  lastTradedPriceCents: null,
  spreadCents: null,
  volume: 0,
  vwapCents: null,
  imbalance: null,
};

describe('the market-producer request vocabulary', () => {
  it('accepts every command request with its complete member set', () => {
    expect(isMarketProducerRequest({ kind: 'ping', id: 1 })).toBe(true);
    expect(
      isMarketProducerRequest({ kind: 'start', id: 2, settings: VALID_SETTINGS })
    ).toBe(true);
    expect(
      isMarketProducerRequest({
        kind: 'apply',
        id: 3,
        settings: MAXIMUM_SETTINGS,
      })
    ).toBe(true);
    expect(
      isMarketProducerRequest({
        kind: 'start',
        id: 4,
        settings: MINIMUM_SETTINGS,
      })
    ).toBe(true);
    expect(isMarketProducerRequest({ kind: 'pause', id: 5 })).toBe(true);
    expect(isMarketProducerRequest({ kind: 'resume', id: 6 })).toBe(true);
  });

  it('refuses values that are not well-formed requests', () => {
    const refused: unknown[] = [
      null,
      7,
      'start',
      {},
      { kind: 'ping' },
      { id: 1 },
      { kind: 'start', settings: VALID_SETTINGS },
      { kind: 'start', id: 'one', settings: VALID_SETTINGS },
      { kind: 'stop', id: 7 },
      { kind: 'reset', id: 8 },
      { kind: 'wasm-init', id: 9 },
      { kind: 'snapshot', id: 10 },
    ];
    for (const value of refused) {
      expect(isMarketProducerRequest(value)).toBe(false);
    }
  });

  it('refuses settings that are not integers inside their ranges', () => {
    const invalid: unknown[] = [
      { instrumentCount: 0, updatesPerBatch: 100, batchIntervalMs: 500 },
      { instrumentCount: 51, updatesPerBatch: 100, batchIntervalMs: 500 },
      { instrumentCount: 5, updatesPerBatch: 0, batchIntervalMs: 500 },
      { instrumentCount: 5, updatesPerBatch: 1001, batchIntervalMs: 500 },
      { instrumentCount: 5, updatesPerBatch: 100, batchIntervalMs: 49 },
      { instrumentCount: 5, updatesPerBatch: 100, batchIntervalMs: 2001 },
      { instrumentCount: 5.5, updatesPerBatch: 100, batchIntervalMs: 500 },
      { instrumentCount: '5', updatesPerBatch: 100, batchIntervalMs: 500 },
      { instrumentCount: 5, updatesPerBatch: 100 },
      { updatesPerBatch: 100, batchIntervalMs: 500 },
    ];
    for (const settings of invalid) {
      expect(isMarketProducerRequest({ kind: 'start', id: 1, settings })).toBe(
        false
      );
    }
  });
});

describe('the market-producer response vocabulary', () => {
  it('accepts the correlated echo and every command acknowledgement', () => {
    expect(isMarketProducerResponse({ kind: 'echo', id: 1 })).toBe(true);
    expect(
      isMarketProducerResponse({
        kind: 'started',
        id: 2,
        runId: 1,
        status: 'running',
      })
    ).toBe(true);
    expect(
      isMarketProducerResponse({
        kind: 'applied',
        id: 3,
        runId: 7,
        status: 'running',
      })
    ).toBe(true);
    expect(
      isMarketProducerResponse({
        kind: 'paused',
        id: 4,
        runId: 7,
        status: 'paused',
      })
    ).toBe(true);
    expect(
      isMarketProducerResponse({
        kind: 'resumed',
        id: 5,
        runId: 7,
        status: 'running',
      })
    ).toBe(true);
  });

  it('accepts the worker-initiated status, snapshot, and error pushes', () => {
    expect(
      isMarketProducerResponse({ kind: 'status', runId: 1, status: 'paused' })
    ).toBe(true);
    expect(
      isMarketProducerResponse({
        kind: 'snapshot',
        runId: 1,
        rows: [WORKED_EXAMPLE_ROW, UNAVAILABLE_ROW],
      })
    ).toBe(true);
    expect(
      isMarketProducerResponse({
        kind: 'error',
        runId: 1,
        message: 'the producer artifact could not be loaded',
      })
    ).toBe(true);
    // A failure before any run exists carries no run identity.
    expect(
      isMarketProducerResponse({
        kind: 'error',
        runId: null,
        message: 'the producer artifact could not be loaded',
      })
    ).toBe(true);
  });

  it('refuses malformed responses and pushes', () => {
    const refused: unknown[] = [
      null,
      'snapshot',
      {},
      { kind: 'echo' },
      { kind: 'started', runId: 1, status: 'running' },
      { kind: 'status', runId: 1, status: 'stopped' },
      { kind: 'status', status: 'running' },
      { kind: 'snapshot', runId: 1 },
      { kind: 'snapshot', runId: 1, rows: 'none' },
      { kind: 'snapshot', runId: 1, rows: [{ volume: 40 }] },
      {
        kind: 'snapshot',
        runId: 1,
        rows: [{ ...WORKED_EXAMPLE_ROW, symbol: 7 }],
      },
      { kind: 'error', runId: 1 },
      { kind: 'error', runId: 1, message: 5 },
      { kind: 'progress', id: 1 },
    ];
    for (const value of refused) {
      expect(isMarketProducerResponse(value)).toBe(false);
    }
  });

  it('accepts each of the four run conditions as a status member', () => {
    for (const status of ['initializing', 'running', 'paused', 'error']) {
      expect(isMarketProducerResponse({ kind: 'status', runId: 1, status })).toBe(
        true
      );
    }
  });
});
