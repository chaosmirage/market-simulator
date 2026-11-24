let instrumentCountState: i32 = 0;
let recordCountState: i32 = 0;
let randomGeneratorState: u32 = 0;

const MIN_INSTRUMENT_COUNT = 1;
const MAX_INSTRUMENT_COUNT = 50;

const PRNG_MULTIPLIER: u32 = 1664525;
const PRNG_INCREMENT: u32 = 1013904223;

function nextRandomU32(): u32 {
  randomGeneratorState =
    randomGeneratorState * PRNG_MULTIPLIER + PRNG_INCREMENT;

  return randomGeneratorState;
}

function nextRange(bound: u32): u32 {
  return nextRandomU32() % bound;
}

export function init(instrumentCount: i32, seed: u32): void {
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
  randomGeneratorState = seed;
}

export function generateBatch(updatesPerBatch: i32): i32 {
  return -1;
}

export function recordCount(): i32 {
  return recordCountState;
}
