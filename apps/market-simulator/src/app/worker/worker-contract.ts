/**
 * The message vocabulary between the application and the market-producer
 * worker: every value crossing the worker boundary is one of these shapes,
 * nothing else. Each request carries a correlation id; each response repeats
 * the id of the request it answers.
 */

/** Correlation id: a response answers exactly the request whose id it repeats. */
export type RequestId = number;

/** A request the application sends into the worker. */
export type MarketProducerRequest =
  | { readonly kind: 'ping'; readonly id: RequestId }
  | { readonly kind: 'wasm-init'; readonly id: RequestId };

/** The response the worker posts back for a request. */
export type MarketProducerResponse =
  | { readonly kind: 'echo'; readonly id: RequestId }
  | {
      readonly kind: 'wasm-ready';
      readonly id: RequestId;
      readonly probe: number;
    }
  | {
      readonly kind: 'wasm-error';
      readonly id: RequestId;
      readonly message: string;
    };

/**
 * The dedicated-worker global surface the worker entry installs itself on.
 * Kept minimal (and declared here rather than taken from a lib) because the
 * app is compiled against the DOM lib, whose `self` typing does not describe
 * the worker scope's single-argument postMessage.
 */
export interface WorkerScope {
  onmessage: ((event: { readonly data: unknown }) => void) | null;
  postMessage(message: unknown): void;
}

/**
 * Whether a structured-clone value is a valid request. The boundary is
 * untyped at runtime, so both sides validate what they receive instead of
 * trusting the sender.
 */
export function isMarketProducerRequest(
  value: unknown
): value is MarketProducerRequest {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const { kind, id } = value as { kind?: unknown; id?: unknown };
  return typeof id === 'number' && (kind === 'ping' || kind === 'wasm-init');
}

/** Whether a structured-clone value is a valid response, member shape included. */
export function isMarketProducerResponse(
  value: unknown
): value is MarketProducerResponse {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const { kind, id, probe, message } = value as {
    kind?: unknown;
    id?: unknown;
    probe?: unknown;
    message?: unknown;
  };
  if (typeof id !== 'number') {
    return false;
  }
  switch (kind) {
    case 'echo':
      return true;
    case 'wasm-ready':
      return typeof probe === 'number';
    case 'wasm-error':
      return typeof message === 'string';
    default:
      return false;
  }
}
