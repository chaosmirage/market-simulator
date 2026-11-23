# worker

## Purpose

The market-producer Web Worker boundary: the typed message contract, the
application-side client, the run engine, and the pure metric math. The
worker is the authoritative owner of run state — active settings,
per-instrument analytics, and the monotonic run id — so the UI thread only
renders what the worker pushes.

## Key pieces

- `worker-contract.ts` - the complete message vocabulary crossing the
  worker boundary, nothing else. Requests: `ping`, plus the run commands
  `start` and `apply` (each carrying settings), `pause`, and `resume`, all
  correlated by id. The worker answers each request with a response
  repeating the id — `echo` for the ping, and a per-command ack carrying
  the run id (nullable when the command names no run) and the resulting
  status — and pushes three uncorrelated messages: `status`, `snapshot`,
  and `error`, each stamped with the run id (`error` may carry a null run
  id for an init-time failure). Runtime validators
  (`isMarketProducerRequest`, `isMarketProducerResponse`) guard both sides,
  because structured clone is untyped at run time; settings payloads are
  validated for integrality and range at the boundary. `WorkerScope` is the
  minimal dedicated-worker global view; the DOM library's `self` typing
  does not describe it.
- `market-metrics.ts` - the cumulative metric math as a pure module (no
  worker-scope imports): last traded price, bid-ask spread, cumulative
  volume, VWAP, and order-book imbalance over the decoded update records,
  with the unavailable marker for no-data and zero-denominator cases. Its
  colocated spec pins the hand-computed worked example, zero denominators,
  batch-size independence (every trade counted exactly once), and
  isolation between instruments by importing the module directly.
- `market-producer.worker.ts` - the worker entry, compiled as its own
  bundle. It validates every request, owns the monotonic run id (allocated
  on start and apply, stamped on every push), and runs two timers: the
  acquisition interval that calls the generator with the configured batch
  size and folds the decoded records into the analytics, and a 250 ms
  publication loop that posts the current metric snapshot. Pause clears
  both timers and flushes one final snapshot accounting for every
  pre-pause event; resume re-arms after one full interval with no catch-up
  generation; apply re-initializes the wasm module, clears the analytics,
  allocates the next run id, and leaves generation running even when the
  previous run stood paused. Messages stamped with a stale run id are
  dropped worker-side; a wasm load failure surfaces as a typed error push,
  never a silent hang.
- `worker-client.ts` - `MarketProducerWorkerClient` wraps the boundary for
  the application: promise-returning command methods that settle on their
  correlated acks, and typed push listeners for snapshots, status, and
  errors. A worker crash or termination rejects every round trip still in
  flight. `getMarketProducerWorkerClient()` is the only construction path,
  so one worker serves the whole application; the app binds it through an
  injection token whose factory calls that factory, letting component
  specs override the token with a fake.
- `market-producer.worker.spec.ts` - pins the contract and the lifecycle by
  driving the installed handler against a stubbed scope with the wasm
  loader mocked and timers faked: batch cadence, the final snapshot on
  pause, totals preserved across pause/resume, the clean reset on apply,
  stale-run rejection, typed init failure, and no surviving timer from a
  replaced run. No real Worker global, no real wasm, no real-time waits.

## How to extend safely

- Add a message kind everywhere at once: the request type, the response
  type, both validators, the worker's switch, and a client method. Both
  sides validate what they receive instead of trusting the sender.
- Construct the worker only through `getMarketProducerWorkerClient()`;
  keep `new Worker` out of the rest of the application.
- Keep the metric math pure and worker-side: it takes decoded records and
  returns metric state, with no timer, DOM, or worker-scope dependency, so
  its spec imports it directly.
- Report failures as typed error responses or pushes, never as silent
  hangs; messages the client cannot correlate are logged, not guessed at.
