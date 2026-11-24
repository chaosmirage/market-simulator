import { animate, style, transition, trigger } from '@angular/animations';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MatIconRegistry } from '@angular/material/icon';
import { afterEach, beforeEach, vi } from 'vitest';
import { appConfig } from './app.config';

/**
 * The bootstrap configuration wires the producer's run-state channel, so
 * the test environment carries a stand-in Worker global: the wiring
 * constructs the single client, whose worker never runs in a test.
 */
beforeEach(() => {
  vi.stubGlobal(
    'Worker',
    class {
      onmessage: unknown = null;
      onerror: unknown = null;
      postMessage(): void {
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

/**
 * Renders one animation trigger through the application's bootstrap
 * providers. Angular Material's components animate through exactly this
 * channel, and the DOM renderer refuses `@` bindings outright when no
 * animation provider was wired into the configuration, so rendering this
 * host observes the configuration the same way the running app consumes it.
 */
@Component({
  selector: 'app-animated-host',
  standalone: true,
  template: '<div [@settle]="true">animated</div>',
  animations: [
    trigger('settle', [
      transition(':enter', [
        style({ opacity: 0 }),
        animate('1ms', style({ opacity: 1 })),
      ]),
    ]),
  ],
})
class AnimatedHostComponent {}

describe('the application bootstrap configuration', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AnimatedHostComponent],
      providers: appConfig.providers,
    }).compileComponents();
  });

  it('renders animation triggers, the channel the Material components animate through', async () => {
    const fixture = TestBed.createComponent(AnimatedHostComponent);

    await fixture.whenStable();

    expect(() => fixture.detectChanges()).not.toThrow();
  });

  it('binds icons without an explicit font set to the bundled icon font', () => {
    expect(TestBed.inject(MatIconRegistry).getDefaultFontSetClass()).toEqual([
      'material-icons',
      'mat-ligature-font',
    ]);
  });
});
