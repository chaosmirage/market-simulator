import { loadWasmStub } from '../wasm/wasm-loader';
import { isMarketProducerRequest } from './worker-contract';
import type { WorkerScope } from './worker-contract';

// The DOM lib types `self` as the window; inside the worker it is the
// dedicated worker scope, so the seam goes through the contract's port view.
const scope = self as unknown as WorkerScope;

scope.onmessage = (event) => {
  const message = event.data;
  if (!isMarketProducerRequest(message)) {
    console.error(
      'market-producer worker received an unrecognized message',
      message
    );
    return;
  }
  switch (message.kind) {
    case 'ping':
      scope.postMessage({ kind: 'echo', id: message.id });
      break;
    case 'wasm-init':
      loadWasmStub()
        .then((wasm) =>
          scope.postMessage({
            kind: 'wasm-ready',
            id: message.id,
            probe: wasm.add(2, 3),
          })
        )
        .catch((error: unknown) =>
          scope.postMessage({
            kind: 'wasm-error',
            id: message.id,
            message: error instanceof Error ? error.message : String(error),
          })
        );
      break;
  }
};
