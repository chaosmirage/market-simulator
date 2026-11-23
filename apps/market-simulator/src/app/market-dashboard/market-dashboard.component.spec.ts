import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { RunStateStore } from '../run-state/run-state.store';
import { MARKET_PRODUCER_WORKER_CLIENT } from '../worker/worker-client';
import { RunStatus } from '../worker/worker-contract';
import { MarketDashboardComponent } from './market-dashboard.component';

/** One pushed row, shaped exactly as the producer seam publishes it. */
interface PushedRow {
  instrumentId: number;
  symbol: string;
  lastTradedPriceCents: number | null;
  spreadCents: number | null;
  volume: number;
  vwapCents: number | null;
  imbalance: number | null;
}

/** A full snapshot push, shaped exactly as the worker contract publishes it. */
interface SnapshotPush {
  kind: 'snapshot';
  runId: number;
  rows: readonly PushedRow[];
}

/** A status push, shaped exactly as the worker contract publishes it. */
interface StatusPush {
  kind: 'status';
  runId: number;
  status: RunStatus;
}

/** The producer commands the page can issue, as the stand-in client saw them. */
type RecordedCommand = 'pause' | 'resume';

/**
 * Test double for the worker client: it captures the push listeners the
 * run-state store registers, records every run command the page issues, and
 * lets each spec feed snapshots and conditions through the same channel the
 * running app receives them — so no real worker is ever constructed.
 */
function createPushingClient() {
  const commands: RecordedCommand[] = [];
  const snapshotListeners: Array<(push: SnapshotPush) => void> = [];
  const statusListeners: Array<(push: StatusPush) => void> = [];
  return {
    commands,
    pause(): Promise<void> {
      commands.push('pause');
      return Promise.resolve();
    },
    resume(): Promise<void> {
      commands.push('resume');
      return Promise.resolve();
    },
    onSnapshot(listener: (push: SnapshotPush) => void): () => void {
      snapshotListeners.push(listener);
      return () => {
        const index = snapshotListeners.indexOf(listener);
        if (index >= 0) {
          snapshotListeners.splice(index, 1);
        }
      };
    },
    onStatus(listener: (push: StatusPush) => void): () => void {
      statusListeners.push(listener);
      return () => {
        const index = statusListeners.indexOf(listener);
        if (index >= 0) {
          statusListeners.splice(index, 1);
        }
      };
    },
    onError(listener: unknown): () => void {
      // The dashboard reads the failure condition through the shared
      // condition signal, so the error channel stays unused here.
      return () => undefined;
    },
    pushSnapshot(rows: readonly PushedRow[]): void {
      const push: SnapshotPush = { kind: 'snapshot', runId: 1, rows };
      for (const listener of snapshotListeners) {
        listener(push);
      }
    },
    pushStatus(status: RunStatus): void {
      const push: StatusPush = { kind: 'status', runId: 1, status };
      for (const listener of statusListeners) {
        listener(push);
      }
    },
  };
}

/** The two trades and the quoted book of the reference instrument. */
const WORKED_EXAMPLE_ROW: PushedRow = {
  instrumentId: 0,
  symbol: 'ALFA',
  lastTradedPriceCents: 10200,
  spreadCents: 4,
  volume: 40,
  vwapCents: 10150,
  imbalance: 0.2,
};

const COLUMN_HEADINGS = [
  'Instrument',
  'Last traded price',
  'Bid–ask spread',
  'Cumulative trading volume',
  'Cumulative VWAP',
  'Order-book imbalance',
];

describe('the market-dashboard reading surface', () => {
  let fixture: ComponentFixture<MarketDashboardComponent>;
  let client: ReturnType<typeof createPushingClient>;

  beforeEach(async () => {
    client = createPushingClient();
    await TestBed.configureTestingModule({
      imports: [MarketDashboardComponent],
      providers: [
        provideNoopAnimations(),
        { provide: MARKET_PRODUCER_WORKER_CLIENT, useValue: client },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(MarketDashboardComponent);
    fixture.detectChanges();
  });

  /** Lets signal-driven rendering settle before the DOM is read. */
  async function settle() {
    await fixture.whenStable();
    fixture.detectChanges();
  }

  async function presentRows(rows: readonly PushedRow[]) {
    client.pushSnapshot(rows);
    await settle();
  }

  async function presentCondition(status: RunStatus) {
    client.pushStatus(status);
    await settle();
  }

  function headerLabels(): string[] {
    const headers = fixture.nativeElement.querySelectorAll(
      '.metric-table th'
    ) as NodeListOf<HTMLElement>;
    return Array.from(headers, (header) =>
      (header.textContent ?? '').replace(/\s+/g, ' ').trim()
    );
  }

  function bodyRows(): HTMLElement[] {
    return Array.from(
      fixture.nativeElement.querySelectorAll(
        '.metric-table tr.mat-mdc-row, .metric-table tbody tr'
      )
    ) as HTMLElement[];
  }

  function cellText(row: HTMLElement, cellClass: string): string {
    const cell = row.querySelector(`.${cellClass}`);
    return (cell?.textContent ?? '').replace(/\s+/g, ' ').trim();
  }

  function rowTexts(): string[][] {
    return bodyRows().map((row) =>
      [
        'metric-symbol',
        'metric-last',
        'metric-spread',
        'metric-volume',
        'metric-vwap',
        'metric-imbalance',
      ].map((cellClass) => cellText(row, cellClass))
    );
  }

  function runCommand(): HTMLButtonElement | null {
    return fixture.nativeElement.querySelector('button.run-command');
  }

  it('renders one row per instrument under the five metric columns in their fixed order', async () => {
    await presentRows([
      WORKED_EXAMPLE_ROW,
      { ...WORKED_EXAMPLE_ROW, instrumentId: 1, symbol: 'BETA' },
    ]);

    expect(headerLabels()).toEqual(COLUMN_HEADINGS);
    expect(bodyRows().length).toBe(2);
  });

  it('formats the reference instrument as currency, count, and signed imbalance readings', async () => {
    await presentRows([WORKED_EXAMPLE_ROW]);

    expect(rowTexts()).toEqual([
      ['ALFA', '$102.00', '$0.04', '40', '$101.50', '+0.20'],
    ]);
  });

  it('marks not-yet-computable readings unavailable with zero volume before data lands', async () => {
    await presentRows([
      {
        instrumentId: 0,
        symbol: 'ALFA',
        lastTradedPriceCents: null,
        spreadCents: null,
        volume: 0,
        vwapCents: null,
        imbalance: null,
      },
    ]);

    expect(rowTexts()).toEqual([
      ['ALFA', 'unavailable', 'unavailable', '0', 'unavailable', 'unavailable'],
    ]);
  });

  it('keeps each instrument to its own row with its own readings', async () => {
    await presentRows([
      WORKED_EXAMPLE_ROW,
      {
        instrumentId: 1,
        symbol: 'BETA',
        lastTradedPriceCents: 4321,
        spreadCents: 2,
        volume: 7,
        vwapCents: 4300,
        imbalance: -0.25,
      },
    ]);

    expect(rowTexts()).toEqual([
      ['ALFA', '$102.00', '$0.04', '40', '$101.50', '+0.20'],
      ['BETA', '$43.21', '$0.02', '7', '$43.00', '-0.25'],
    ]);
  });

  it('replaces the whole reading when a later snapshot arrives', async () => {
    await presentRows([
      WORKED_EXAMPLE_ROW,
      { ...WORKED_EXAMPLE_ROW, instrumentId: 1, symbol: 'BETA' },
      { ...WORKED_EXAMPLE_ROW, instrumentId: 2, symbol: 'GAMMA' },
    ]);
    await presentRows([
      {
        instrumentId: 4,
        symbol: 'EPSILON',
        lastTradedPriceCents: 9900,
        spreadCents: 1,
        volume: 3,
        vwapCents: 9875,
        imbalance: 0,
      },
    ]);

    expect(rowTexts()).toEqual([
      ['EPSILON', '$99.00', '$0.01', '3', '$98.75', '0.00'],
    ]);
  });

  it('offers the run command exactly while the run generates or stands paused', async () => {
    await presentCondition('initializing');
    expect(runCommand()).toBeNull();

    await presentCondition('error');
    expect(runCommand()).toBeNull();

    await presentCondition('running');
    expect(runCommand()?.getAttribute('aria-label')).toBe('Stop the run');

    await presentCondition('paused');
    expect(runCommand()?.getAttribute('aria-label')).toBe('Continue the run');
  });

  it('commands a stop from a generating run and a continue from a paused one', async () => {
    await presentCondition('running');
    runCommand()?.click();
    await settle();

    await presentCondition('paused');
    runCommand()?.click();
    await settle();

    expect(client.commands).toEqual(['pause', 'resume']);
  });

  it('reads the run condition and rows through the shared run-state store', () => {
    expect(TestBed.inject(RunStateStore)).toBeTruthy();
  });
});
