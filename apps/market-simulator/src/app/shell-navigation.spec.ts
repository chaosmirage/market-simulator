import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { afterEach, beforeEach, vi } from 'vitest';
import { AppComponent } from './app.component';
import { appRoutes } from './app.routes';

/**
 * The shell holds the application's producer subscription, so the test
 * environment carries a stand-in Worker global: the subscription constructs
 * the single client, whose worker never runs in a test.
 */
beforeEach(() => {
  vi.stubGlobal(
    'Worker',
    class {
      onmessage: unknown = null;
      onerror: unknown = null;
      postMessage(_message: unknown): void {
        return;
      }
      terminate(): void {
        return;
      }
    }
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const DASHBOARD_IDENTIFICATION_ROWS = ['Market dashboard'];

const SETTINGS_IDENTIFICATION_ROWS = ['Producer settings'];

describe('shell navigation between the two destinations', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AppComponent],
      providers: [provideRouter(appRoutes)],
    }).compileComponents();
  });

  /**
   * Lets asynchronous rendering settle: the first detection renders the
   * routed content, and one more turn picks up state that routers and
   * link-directives update after the first pass.
   */
  async function settle(fixture: ComponentFixture<AppComponent>) {
    await fixture.whenStable();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  async function openShellAt(
    url: string
  ): Promise<ComponentFixture<AppComponent>> {
    const fixture = TestBed.createComponent(AppComponent);
    await TestBed.inject(Router)
      .navigateByUrl(url)
      .catch(() => undefined);
    await settle(fixture);
    return fixture;
  }

  function identificationRows(fixture: ComponentFixture<AppComponent>) {
    const rows = fixture.nativeElement.querySelectorAll('.identification-row');
    return Array.from(rows, (row: Element) => row.textContent?.trim() ?? '');
  }

  function visibleBandOffer(fixture: ComponentFixture<AppComponent>) {
    const anchors =
      fixture.nativeElement.querySelectorAll<HTMLElement>('.movement-band a');
    const visible = Array.from(anchors).filter((anchor) => !anchor.hidden);
    // The band carries exactly one offered movement: the other destination.
    expect(visible.length).toBe(1);
    return visible[0];
  }

  async function activateOffer(
    offer: HTMLElement,
    fixture: ComponentFixture<AppComponent>
  ) {
    offer.click();
    await settle(fixture);
  }

  it('names the open destination in an identification block on the default address', async () => {
    const fixture = await openShellAt('/');

    expect(identificationRows(fixture)).toEqual(DASHBOARD_IDENTIFICATION_ROWS);
  });

  it('offers exactly the other destination from the movement band on the default address', async () => {
    const fixture = await openShellAt('/');

    expect(visibleBandOffer(fixture).textContent?.trim()).toBe(
      'producer-settings'
    );
  });

  it('names the second destination and mirrors the band on a direct entry of its address', async () => {
    const fixture = await openShellAt('/producer-settings');

    expect(identificationRows(fixture)).toEqual(SETTINGS_IDENTIFICATION_ROWS);
    expect(visibleBandOffer(fixture).textContent?.trim()).toBe(
      'market-dashboard'
    );
  });

  it('completes the round trip through single activations of the band offer', async () => {
    const fixture = await openShellAt('/');
    const band = fixture.nativeElement.querySelector('.movement-band');

    await activateOffer(visibleBandOffer(fixture), fixture);
    expect(identificationRows(fixture)).toEqual(SETTINGS_IDENTIFICATION_ROWS);
    expect(fixture.nativeElement.querySelector('.movement-band')).toBe(band);

    await activateOffer(visibleBandOffer(fixture), fixture);
    expect(identificationRows(fixture)).toEqual(DASHBOARD_IDENTIFICATION_ROWS);
    expect(fixture.nativeElement.querySelector('.movement-band')).toBe(band);
  });
});
