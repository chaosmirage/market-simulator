# worker

## Purpose

The market-producer Web Worker boundary: the typed message contract, the
application-side client, and the worker entry. The worker is wired but
empty; the message round trips and the wasm load prove the boundary works.

## Key pieces

- `worker-contract.ts` - the complete message vocabulary crossing the
  worker boundary, nothing else. Requests: `ping` and `wasm-init`.
  Responses: `echo`, `wasm-ready`, and `wasm-error`, each repeating the
  numeric id of the request it answers. Runtime validators
  (`isMarketProducerRequest`, `isMarketProducerResponse`) guard both
  sides, because structured clone is untyped at run time. `WorkerScope` is
  the minimal dedicated-worker global view; the DOM library's `self`
  typing does not describe it.
- `worker-client.ts` - `MarketProducerWorkerClient` wraps `postMessage` in
  promise round trips correlated by id. A worker crash or termination
  rejects every round trip still in flight instead of leaving it hanging.
  `getMarketProducerWorkerClient()` is the only construction path, so one
  worker serves the whole application.
- `market-producer.worker.ts` - the worker entry, compiled as its own
  bundle. It answers `ping` with `echo`, and on `wasm-init` loads the wasm
  artifact through the shared loader, reporting readiness or a typed
  error.
- `market-producer.worker.spec.ts` - pins the contract by driving the
  installed handler against a stubbed scope (node environment; no Worker
  global exists there).

## How to extend safely

- Add a message kind everywhere at once: the request type, the response
  type, both validators, the worker's switch, and a client method. Both
  sides validate what they receive instead of trusting the sender.
- Construct the worker only through `getMarketProducerWorkerClient()`;
  keep `new Worker` out of the rest of the application.
- Report failures as typed error responses or rejections, never as silent
  hangs; messages the client cannot correlate are logged, not guessed at.
