/**
 * The cumulative trading metrics for one run: a pure, worker-side reduction
 * of generated market updates into per-instrument totals and the five
 * dashboard readings. Nothing here touches worker scope, timers, or messages
 * -- the engine feeds it decoded records and reads state back.
 */

/**
 * One generated market update: a simulated trade at its own quoted price,
 * plus the current book snapshot beside it. This is the decoded form of one
 * fixed-layout record read out of the generator's linear memory.
 */
export interface MarketUpdateRecord {
  /** Which instrument the update belongs to. */
  readonly instrumentId: number;
  /** The trade price in integer cents; always the bid or the ask of this update. */
  readonly priceCents: number;
  /** The traded quantity; positive. */
  readonly tradeQuantity: number;
  /** The quoted buying price in integer cents; strictly below the ask. */
  readonly bidCents: number;
  /** The quoted selling price in integer cents; strictly above the bid. */
  readonly askCents: number;
  /** The available buying quantity; nonnegative. */
  readonly bidQuantity: number;
  /** The available selling quantity; nonnegative. */
  readonly askQuantity: number;
}

/**
 * The cumulative analytics state of one instrument since its run started.
 * Totals accumulate every trade exactly once; the quoted book holds the
 * latest snapshot. Reading this state never perturbs it.
 */
export interface InstrumentAnalyticsState {
  /** The price of the latest trade, or null before the first trade. */
  lastTradedPriceCents: number | null;
  /** The sum of every traded quantity since the run started. */
  volume: number;
  /** The sum of priceCents x tradeQuantity since the run started. */
  totalTradedValueCents: number;
  /** The latest quoted buying price, or null before the first update. */
  bidCents: number | null;
  /** The latest quoted selling price, or null before the first update. */
  askCents: number | null;
  /** The latest available buying quantity. */
  bidQuantity: number;
  /** The latest available selling quantity. */
  askQuantity: number;
}

/**
 * The five dashboard readings for one instrument. A null member is the
 * unavailable marker: the formula's denominator or input is not there yet,
 * and it must never surface as a number.
 */
export interface InstrumentMetricsReading {
  readonly lastTradedPriceCents: number | null;
  readonly spreadCents: number | null;
  readonly volume: number;
  readonly vwapCents: number | null;
  readonly imbalance: number | null;
}

/**
 * The fresh analytics state for one instrument: no trades seen, empty book,
 * zero totals.
 */
export function createInstrumentAnalyticsState(): InstrumentAnalyticsState {
  return {
    lastTradedPriceCents: null,
    volume: 0,
    totalTradedValueCents: 0,
    bidCents: null,
    askCents: null,
    bidQuantity: 0,
    askQuantity: 0,
  };
}

/**
 * Reduces one generated update into the instrument's cumulative state.
 * Every trade counts exactly once toward volume and VWAP; the quoted book
 * quantities never contribute to volume, they only replace the snapshot.
 */
export function applyMarketUpdate(
  state: InstrumentAnalyticsState,
  update: MarketUpdateRecord
): void {
  state.lastTradedPriceCents = update.priceCents;
  state.volume += update.tradeQuantity;
  state.totalTradedValueCents += update.priceCents * update.tradeQuantity;
  state.bidCents = update.bidCents;
  state.askCents = update.askCents;
  state.bidQuantity = update.bidQuantity;
  state.askQuantity = update.askQuantity;
}

/**
 * Reads the instrument's five dashboard readings from its cumulative state.
 * A formula whose denominator is zero, and an instrument that has seen no
 * data yet, read as the unavailable marker (null) instead of a number;
 * volume reads zero before any trade has arrived.
 */
export function readInstrumentMetrics(
  state: InstrumentAnalyticsState
): InstrumentMetricsReading {
  const bookQuantitySum = state.bidQuantity + state.askQuantity;
  return {
    lastTradedPriceCents: state.lastTradedPriceCents,
    spreadCents:
      state.bidCents === null || state.askCents === null
        ? null
        : state.askCents - state.bidCents,
    volume: state.volume,
    vwapCents:
      state.volume === 0 ? null : state.totalTradedValueCents / state.volume,
    imbalance:
      bookQuantitySum === 0
        ? null
        : (state.bidQuantity - state.askQuantity) / bookQuantitySum,
  };
}
