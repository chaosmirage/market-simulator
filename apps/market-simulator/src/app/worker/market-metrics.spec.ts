// @vitest-environment node
// Node environment on purpose: the aggregation math is a pure module with no
// worker-scope or DOM dependencies, and importing it here proves that purity
// while driving it with fixed records.
import { describe, expect, it } from 'vitest';
import {
  applyMarketUpdate,
  createInstrumentAnalyticsState,
  readInstrumentMetrics,
} from './market-metrics';
import type { MarketUpdateRecord } from './market-metrics';

// The reference scenario: two trades of 10 at $100.00 then 30 at $102.00,
// against a quoted book of bid $101.96 / ask $102.00 with quantities 600
// and 400. Expected readings: last $102.00, spread $0.04, volume 40,
// VWAP $101.50, imbalance 0.20.
const FIRST_TRADE: MarketUpdateRecord = {
  instrumentId: 0,
  priceCents: 10000,
  tradeQuantity: 10,
  bidCents: 10190,
  askCents: 10195,
  bidQuantity: 500,
  askQuantity: 300,
};

const SECOND_TRADE: MarketUpdateRecord = {
  instrumentId: 0,
  priceCents: 10200,
  tradeQuantity: 30,
  bidCents: 10196,
  askCents: 10200,
  bidQuantity: 600,
  askQuantity: 400,
};

const OTHER_INSTRUMENT_TRADE: MarketUpdateRecord = {
  instrumentId: 1,
  priceCents: 5100,
  tradeQuantity: 7,
  bidCents: 5098,
  askCents: 5100,
  bidQuantity: 90,
  askQuantity: 110,
};

describe('cumulative trading metrics for one instrument', () => {
  it('reproduces the reference two-trade scenario exactly', () => {
    const state = createInstrumentAnalyticsState();

    applyMarketUpdate(state, FIRST_TRADE);
    applyMarketUpdate(state, SECOND_TRADE);

    expect(readInstrumentMetrics(state)).toEqual({
      lastTradedPriceCents: 10200,
      spreadCents: 4,
      volume: 40,
      vwapCents: 10150,
      imbalance: 0.2,
    });
  });

  it('reads the unavailable marker with zero volume before any data arrives', () => {
    const state = createInstrumentAnalyticsState();

    const metrics = readInstrumentMetrics(state);

    expect(metrics).toEqual({
      lastTradedPriceCents: null,
      spreadCents: null,
      volume: 0,
      vwapCents: null,
      imbalance: null,
    });
  });

  it('resolves a zero denominator to the unavailable marker, never a number or an error', () => {
    const state = createInstrumentAnalyticsState();

    applyMarketUpdate(state, {
      instrumentId: 0,
      priceCents: 9800,
      tradeQuantity: 5,
      bidCents: 9798,
      askCents: 9800,
      bidQuantity: 0,
      askQuantity: 0,
    });

    const metrics = readInstrumentMetrics(state);
    expect(metrics.volume).toBe(5);
    expect(metrics.lastTradedPriceCents).toBe(9800);
    expect(metrics.spreadCents).toBe(2);
    expect(metrics.imbalance).toBeNull();
    expect(Number.isNaN(metrics.imbalance as number)).toBe(false);
  });

  it('counts every trade exactly once regardless of how the records are grouped for reading', () => {
    const records = [FIRST_TRADE, SECOND_TRADE, FIRST_TRADE, SECOND_TRADE];
    const readBetweenGroups = createInstrumentAnalyticsState();
    const readOnceAtTheEnd = createInstrumentAnalyticsState();

    for (const [index, record] of records.entries()) {
      applyMarketUpdate(readBetweenGroups, record);
      applyMarketUpdate(readOnceAtTheEnd, record);
      if (index < records.length - 1) {
        // Reading between groups must not perturb the accumulation.
        readInstrumentMetrics(readBetweenGroups);
      }
    }

    const expectedVolume = 2 * (FIRST_TRADE.tradeQuantity + SECOND_TRADE.tradeQuantity);
    expect(readInstrumentMetrics(readBetweenGroups).volume).toBe(expectedVolume);
    expect(readInstrumentMetrics(readOnceAtTheEnd).volume).toBe(expectedVolume);
    expect(readInstrumentMetrics(readBetweenGroups).vwapCents).toBe(
      readInstrumentMetrics(readOnceAtTheEnd).vwapCents
    );
  });

  it('never lets quoted book quantities contribute to trading volume', () => {
    const state = createInstrumentAnalyticsState();

    applyMarketUpdate(state, SECOND_TRADE);

    expect(readInstrumentMetrics(state).volume).toBe(
      SECOND_TRADE.tradeQuantity
    );
  });

  it('keeps instruments isolated when their records arrive interleaved', () => {
    const first = createInstrumentAnalyticsState();
    const second = createInstrumentAnalyticsState();

    applyMarketUpdate(first, FIRST_TRADE);
    applyMarketUpdate(second, OTHER_INSTRUMENT_TRADE);
    applyMarketUpdate(first, SECOND_TRADE);
    applyMarketUpdate(second, OTHER_INSTRUMENT_TRADE);

    const firstMetrics = readInstrumentMetrics(first);
    const secondMetrics = readInstrumentMetrics(second);

    expect(firstMetrics).toEqual({
      lastTradedPriceCents: 10200,
      spreadCents: 4,
      volume: 40,
      vwapCents: 10150,
      imbalance: 0.2,
    });
    // Only its own trades and its own latest snapshot: the other
    // instrument's prices and quantities never leak into these readings.
    expect(secondMetrics).toEqual({
      lastTradedPriceCents: 5100,
      spreadCents: 2,
      volume: 14,
      vwapCents: 5100,
      imbalance: (90 - 110) / (90 + 110),
    });
  });

  it('weights the average price by trade quantity, not by trade count', () => {
    const state = createInstrumentAnalyticsState();

    applyMarketUpdate(state, { ...FIRST_TRADE, tradeQuantity: 10 });
    applyMarketUpdate(state, { ...SECOND_TRADE, tradeQuantity: 30 });

    expect(readInstrumentMetrics(state).vwapCents).toBe(10150);
  });
});
