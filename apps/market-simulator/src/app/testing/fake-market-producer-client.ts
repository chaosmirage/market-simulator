import type { SimulationSettings } from '../worker/worker-contract';

/** One producer command the application issued, as observed by a stand-in client. */
export interface RecordedCommand {
  readonly kind: 'start' | 'apply' | 'pause' | 'resume';
  readonly settings?: SimulationSettings;
}

/** The outcome a command acknowledgement carries. */
export interface CommandAck {
  readonly runId: number;
  readonly status: string;
}

/**
 * A stand-in for the application's market-producer client: records every
 * command the surface under test issues and answers each with a settled
 * acknowledgement, so components can be driven without a real worker.
 */
export interface FakeMarketProducerClient {
  start(settings: SimulationSettings): Promise<CommandAck>;
  apply(settings: SimulationSettings): Promise<CommandAck>;
  pause(): Promise<CommandAck>;
  resume(): Promise<CommandAck>;
  ping(): Promise<void>;
  onSnapshot(listener: (snapshot: unknown) => void): void;
  onStatus(listener: (status: unknown) => void): void;
  onError(listener: (error: unknown) => void): void;
  terminate(): void;
  /** Every command issued through this stand-in, in order. */
  readonly commands: readonly RecordedCommand[];
}

/**
 * Builds the stand-in client. Commands resolve immediately with the
 * acknowledged run identity and condition; push listeners are registered
 * and kept so wiring mistakes surface as unused registrations rather than
 * as crashes.
 */
export function createFakeMarketProducerClient(): FakeMarketProducerClient {
  const commands: RecordedCommand[] = [];
  const snapshotListeners: Array<(snapshot: unknown) => void> = [];
  const statusListeners: Array<(status: unknown) => void> = [];
  const errorListeners: Array<(error: unknown) => void> = [];

  function acknowledge(kind: RecordedCommand['kind'], settings?: SimulationSettings): Promise<CommandAck> {
    commands.push({ kind, settings });
    return Promise.resolve({ runId: 1, status: 'running' });
  }

  return {
    start: (settings) => acknowledge('start', settings),
    apply: (settings) => acknowledge('apply', settings),
    pause: () => acknowledge('pause'),
    resume: () => acknowledge('resume'),
    ping: () => Promise.resolve(),
    onSnapshot: (listener) => snapshotListeners.push(listener),
    onStatus: (listener) => statusListeners.push(listener),
    onError: (listener) => errorListeners.push(listener),
    terminate: () => undefined,
    commands,
  };
}
