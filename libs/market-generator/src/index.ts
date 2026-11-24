let instrumentCountState: i32 = 0;
let recordCountState: i32 = 0;

export function init(instrumentCount: i32, seed: i32): void {
  instrumentCountState = instrumentCount;
  recordCountState = 0;
}

export function generateBatch(updatesPerBatch: i32): i32 {
  return -1;
}

export function recordCount(): i32 {
  return recordCountState;
}
