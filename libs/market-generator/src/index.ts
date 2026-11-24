let instrumentCountState: i32 = 0;
let recordCountState: i32 = 0;

const MIN_INSTRUMENT_COUNT = 1;
const MAX_INSTRUMENT_COUNT = 50;

export function init(instrumentCount: i32, seed: i32): void {
  if (
    instrumentCount < MIN_INSTRUMENT_COUNT ||
    instrumentCount > MAX_INSTRUMENT_COUNT
  ) {
    instrumentCountState = 0;
    recordCountState = 0;

    return;
  }

  instrumentCountState = instrumentCount;
  recordCountState = 0;
}

export function generateBatch(updatesPerBatch: i32): i32 {
  return -1;
}

export function recordCount(): i32 {
  return recordCountState;
}
