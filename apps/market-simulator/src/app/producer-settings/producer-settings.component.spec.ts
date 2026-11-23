import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { MARKET_PRODUCER_WORKER_CLIENT } from '../worker/worker-client';
import { ProducerSettingsComponent } from './producer-settings.component';

/**
 * The one producer command this page can issue: the applied settings, as
 * they crossed the worker seam.
 */
interface AppliedSettings {
  instrumentCount: number;
  updatesPerBatch: number;
  batchIntervalMs: number;
}

/**
 * Test double for the worker client: it records every apply command the
 * page issues and answers with a settled round trip. Specs assert on the
 * recorded commands — what the page sent across the producer seam — so no
 * real worker is ever constructed.
 */
function createRecordingClient() {
  const appliedSettings: AppliedSettings[] = [];
  return {
    appliedSettings,
    apply(settings: AppliedSettings): Promise<void> {
      appliedSettings.push(settings);
      return Promise.resolve();
    },
  };
}

describe('the producer-settings destination form', () => {
  let fixture: ComponentFixture<ProducerSettingsComponent>;
  let client: ReturnType<typeof createRecordingClient>;

  beforeEach(async () => {
    client = createRecordingClient();
    await TestBed.configureTestingModule({
      imports: [ProducerSettingsComponent],
      providers: [
        provideNoopAnimations(),
        { provide: MARKET_PRODUCER_WORKER_CLIENT, useValue: client },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(ProducerSettingsComponent);
    fixture.detectChanges();
  });

  function entries(): HTMLInputElement[] {
    return Array.from(
      fixture.nativeElement.querySelectorAll('input')
    ) as HTMLInputElement[];
  }

  function entry(index: number): HTMLInputElement {
    return entries()[index];
  }

  async function typeInto(input: HTMLInputElement, value: string) {
    input.value = value;
    input.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    fixture.detectChanges();
  }

  function leaveEntry(input: HTMLInputElement) {
    input.dispatchEvent(new Event('blur'));
    fixture.detectChanges();
  }

  function applyButton(): HTMLButtonElement {
    return fixture.nativeElement.querySelector('button');
  }

  function rateReading(): string {
    const reading = fixture.nativeElement.querySelector('.nominal-rate');
    return (reading?.textContent ?? '').replace(/\s+/g, ' ').trim();
  }

  function explanationBeside(input: HTMLInputElement): string {
    const field = input.closest('mat-form-field');
    return (field?.querySelector('mat-error')?.textContent ?? '').trim();
  }

  /**
   * Enters a value the entry must reject, then asserts the two outcomes the
   * rejection carries: an explanation standing beside that entry, and the
   * apply command standing disabled.
   */
  async function rejectsWithExplanation(index: number, value: string) {
    await typeInto(entry(index), value);
    leaveEntry(entry(index));
    expect(explanationBeside(entry(index))).not.toBe('');
    expect(applyButton().disabled).toBe(true);
  }

  it('arrives with the three working values 5, 100, and 500 entered', () => {
    expect(entries().map((input) => input.value)).toEqual([
      '5',
      '100',
      '500',
    ]);
  });

  it('rejects each out-of-range integer with an explanation beside its entry', async () => {
    await rejectsWithExplanation(0, '0');
    await rejectsWithExplanation(0, '51');
    await rejectsWithExplanation(1, '0');
    await rejectsWithExplanation(1, '1001');
    await rejectsWithExplanation(2, '49');
    await rejectsWithExplanation(2, '2001');
  });

  it('rejects fractional, negative, non-numeric, and emptied entries the same way', async () => {
    for (const value of ['2.5', '-1', 'abc', '']) {
      await rejectsWithExplanation(1, value);
    }
  });

  it('issues exactly one apply command carrying the parsed integers once every entry stands accepted', async () => {
    await typeInto(entry(0), '12');
    await typeInto(entry(1), '250');
    await typeInto(entry(2), '100');

    expect(applyButton().disabled).toBe(false);
    applyButton().click();
    await fixture.whenStable();

    expect(client.appliedSettings).toEqual([
      { instrumentCount: 12, updatesPerBatch: 250, batchIntervalMs: 100 },
    ]);
  });

  it('issues no producer command while values are only edited', async () => {
    await typeInto(entry(0), '9');
    await typeInto(entry(1), '300');
    await typeInto(entry(2), '60');

    expect(client.appliedSettings).toEqual([]);
  });

  it('derives the nominal rate from the updates and interval entries as they change', async () => {
    expect(rateReading()).toBe('Nominal rate: 200 updates/s');

    await typeInto(entry(1), '200');
    expect(rateReading()).toBe('Nominal rate: 400 updates/s');

    await typeInto(entry(2), '1000');
    expect(rateReading()).toBe('Nominal rate: 200 updates/s');

    await typeInto(entry(0), '50');
    expect(rateReading()).toBe('Nominal rate: 200 updates/s');
  });

  it('presents the unavailable member while a derivation-relevant entry stands rejected', async () => {
    await typeInto(entry(1), '1001');
    expect(rateReading()).toBe('Nominal rate: unavailable');

    await typeInto(entry(2), '49');
    expect(rateReading()).toBe('Nominal rate: unavailable');

    await typeInto(entry(1), '10');
    await typeInto(entry(2), '500');
    expect(rateReading()).toBe('Nominal rate: 20 updates/s');
  });
});
