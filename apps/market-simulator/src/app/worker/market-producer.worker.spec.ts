// @vitest-environment node
// Node environment on purpose: neither node nor jsdom provides the Worker
// global, so this spec pins the message contract by driving the handler the
// worker entry installs on its scope. The live Worker round trip is the
// running app's proof.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MarketProducerRequest, WorkerScope } from './worker-contract';

/**
 * A stand-in for the dedicated-worker global scope: captures the handler the
 * worker entry installs and every message it posts back.
 */
function installWorkerScopeStub() {
  const posted: unknown[] = [];
  let handler: ((event: { readonly data: unknown }) => void) | null = null;
  const scope: WorkerScope = {
    get onmessage() {
      return handler;
    },
    set onmessage(next) {
      handler = next;
    },
    postMessage(message: unknown) {
      posted.push(message);
    },
  };
  vi.stubGlobal('self', scope);
  return {
    posted,
    send(request: MarketProducerRequest) {
      handler?.({ data: request });
    },
  };
}

describe('market-producer worker message contract', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
  });

  it('answers a typed ping with the typed echo carrying the same id', async () => {
    const scope = installWorkerScopeStub();

    await import('./market-producer.worker');
    scope.send({ kind: 'ping', id: 7 });

    expect(scope.posted).toEqual([{ kind: 'echo', id: 7 }]);
  });

  it('answers a second ping without disturbing the first round trip', async () => {
    const scope = installWorkerScopeStub();

    await import('./market-producer.worker');
    scope.send({ kind: 'ping', id: 1 });
    scope.send({ kind: 'ping', id: 2 });

    expect(scope.posted).toEqual([
      { kind: 'echo', id: 1 },
      { kind: 'echo', id: 2 },
    ]);
  });
});
