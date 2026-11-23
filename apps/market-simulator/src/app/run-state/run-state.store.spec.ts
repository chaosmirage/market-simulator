import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { RunStateStore } from './run-state.store';

// The store is the application-level home of the displayed run condition
// and the latest metric snapshot. These specs pin what a surface observes:
// pushes arriving through the store's ingest become signal readings, and a
// push belonging to a previous run never overwrites the current one.

const WORKED_EXAMPLE_ROWS = [
  {
    symbol: 'ALFA',
    lastTradedPriceCents: 10200,
    spreadCents: 4,
    volume: 40,
    vwapCents: 10150,
    imbalance: 0.2,
  },
];

const EMPTY_ROWS = [
  {
    symbol: 'ALFA',
    lastTradedPriceCents: null,
    spreadCents: null,
    volume: 0,
    vwapCents: null,
    imbalance: null,
  },
];

describe('the application run-state store', () => {
  function openStore() {
    TestBed.configureTestingModule({});
    return TestBed.inject(RunStateStore);
  }

  it('opens in the initializing condition with no snapshot and no error', () => {
    const store = openStore();

    expect(store.status()).toBe('initializing');
    expect(store.snapshot()).toBeNull();
    expect(store.error()).toBeNull();
  });

  it('turns arriving condition and snapshot pushes into the displayed readings', () => {
    const store = openStore();

    store.acceptPush({ kind: 'status', runId: 1, status: 'running' });
    expect(store.status()).toBe('running');

    store.acceptPush({
      kind: 'snapshot',
      runId: 1,
      rows: WORKED_EXAMPLE_ROWS,
    });
    expect(store.snapshot()).toEqual({
      runId: 1,
      rows: WORKED_EXAMPLE_ROWS,
    });

    store.acceptPush({ kind: 'status', runId: 1, status: 'paused' });
    expect(store.status()).toBe('paused');
    // A condition change never discards the displayed snapshot.
    expect(store.snapshot()?.rows).toEqual(WORKED_EXAMPLE_ROWS);
  });

  it('rejects snapshots that belong to a previous run', () => {
    const store = openStore();

    store.acceptPush({ kind: 'status', runId: 2, status: 'running' });
    store.acceptPush({
      kind: 'snapshot',
      runId: 2,
      rows: WORKED_EXAMPLE_ROWS,
    });
    store.acceptPush({
      kind: 'snapshot',
      runId: 1,
      rows: EMPTY_ROWS,
    });

    expect(store.snapshot()).toEqual({
      runId: 2,
      rows: WORKED_EXAMPLE_ROWS,
    });
  });

  it('accepts a later run and replaces the readings wholesale', () => {
    const store = openStore();

    store.acceptPush({ kind: 'status', runId: 2, status: 'running' });
    store.acceptPush({
      kind: 'snapshot',
      runId: 2,
      rows: WORKED_EXAMPLE_ROWS,
    });
    store.acceptPush({ kind: 'status', runId: 3, status: 'running' });
    store.acceptPush({ kind: 'snapshot', runId: 3, rows: EMPTY_ROWS });

    expect(store.snapshot()).toEqual({ runId: 3, rows: EMPTY_ROWS });
  });

  it('presents the failure condition with its reason, including before any run exists', () => {
    const store = openStore();

    store.acceptPush({
      kind: 'error',
      runId: null,
      message: 'the producer artifact could not be loaded',
    });
    expect(store.status()).toBe('error');
    expect(store.error()).toContain('could not be loaded');

    store.acceptPush({ kind: 'status', runId: 1, status: 'running' });
    store.acceptPush({
      kind: 'error',
      runId: 1,
      message: 'generation failed mid-run',
    });
    expect(store.status()).toBe('error');
    expect(store.error()).toContain('generation failed');
  });
});
