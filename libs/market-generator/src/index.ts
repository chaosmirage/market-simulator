let instrumentCountState: i32 = 0;
let recordCountState: i32 = 0;
let randomGeneratorState: u32 = 0;

const MIN_INSTRUMENT_COUNT = 1;
const MAX_INSTRUMENT_COUNT = 50;

let priceStatePointer: usize = 0;
const BYTES_PER_PRICE: usize = 4;
const PRICE_STATE_BYTES: usize = BYTES_PER_PRICE * MAX_INSTRUMENT_COUNT;
const INITIAL_PRICE_CENTS: u32 = 10000;
const MIN_PRICE_CENTS: i32 = 10;
const MAX_PRICE_CENTS: i32 = 900000;

let recordBufferPointer: usize = 0;
const MIN_BATCH_SIZE: usize = 1;
const MAX_BATCH_SIZE: usize = 1000;
const RECORD_FIELD_COUNT: usize = 7;
const BYTES_PER_RECORD_FIELD: usize = 4;
const BYTES_PER_RECORD = BYTES_PER_RECORD_FIELD * RECORD_FIELD_COUNT;
const RECORD_BUFFER_BYTES: usize = BYTES_PER_RECORD * MAX_BATCH_SIZE;
const recordValues: u32[] = new Array<u32>(<i32>RECORD_FIELD_COUNT);

const PRNG_MULTIPLIER: u32 = 1664525;
const PRNG_INCREMENT: u32 = 1013904223;

function nextRandomU32(): u32 {
  randomGeneratorState =
    randomGeneratorState * PRNG_MULTIPLIER + PRNG_INCREMENT;

  return randomGeneratorState;
}

function nextRange(bound: u32): u32 {
  return (nextRandomU32() >> 16) % bound;
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

  if (priceStatePointer === 0) {
    priceStatePointer = heap.alloc(PRICE_STATE_BYTES);
    recordBufferPointer = heap.alloc(RECORD_BUFFER_BYTES);
  }

  instrumentCountState = instrumentCount;
  recordCountState = 0;
  randomGeneratorState = seed;

  for (let i = 0; i < instrumentCount; i++) {
    store<u32>(
      priceStatePointer + <usize>i * BYTES_PER_PRICE,
      INITIAL_PRICE_CENTS
    );
  }
}

function writeRecord(recordPointer: usize, values: u32[]): void {
  for (let i = 0; i < <i32>RECORD_FIELD_COUNT; i++) {
    store<u32>(recordPointer + <usize>i * BYTES_PER_RECORD_FIELD, values[i]);
  }
}

export function generateBatch(updatesPerBatch: i32): i32 {
  recordCountState = 0;

  if (
    instrumentCountState === 0 ||
    updatesPerBatch < <i32>MIN_BATCH_SIZE ||
    updatesPerBatch > <i32>MAX_BATCH_SIZE
  ) {
    return -1;
  }

  for (let i = 0; i < updatesPerBatch; i++) {
    const instrumentId = nextRange(<u32>instrumentCountState);
    const pricePointer =
      priceStatePointer + <usize>instrumentId * BYTES_PER_PRICE;
    const previousPrice = load<u32>(pricePointer);

    const priceChange = <i32>nextRange(21) - 10;
    let candidatePrice = <i32>previousPrice + priceChange;

    if (candidatePrice < MIN_PRICE_CENTS) {
      candidatePrice = MIN_PRICE_CENTS;
    } else if (candidatePrice > MAX_PRICE_CENTS) {
      candidatePrice = MAX_PRICE_CENTS;
    }

    const newPrice = <u32>candidatePrice;

    store<u32>(pricePointer, newPrice);

    const ask = newPrice + <i32>nextRange(5);
    const bid = ask - <i32>nextRange(5) - 5;
    const preparedBid = bid > 0 ? bid : ask - 1;

    recordValues[0] = instrumentId;
    recordValues[1] = nextRange(2) === 0 ? ask : preparedBid;
    recordValues[2] = 1 + nextRange(100);
    recordValues[3] = preparedBid;
    recordValues[4] = ask;
    recordValues[5] = 1 + nextRange(1000);
    recordValues[6] = 1 + nextRange(1000);

    writeRecord(
      recordBufferPointer + <usize>i * BYTES_PER_RECORD,
      recordValues
    );
  }

  recordCountState = updatesPerBatch;

  return <i32>recordBufferPointer;
}

export function recordCount(): i32 {
  return recordCountState;
}
