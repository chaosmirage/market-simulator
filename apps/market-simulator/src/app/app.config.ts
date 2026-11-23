import {
  ApplicationConfig,
  ENVIRONMENT_INITIALIZER,
  EnvironmentProviders,
  inject,
  makeEnvironmentProviders,
  provideZoneChangeDetection,
} from '@angular/core';
import { MatIconRegistry } from '@angular/material/icon';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { provideRouter } from '@angular/router';
import { appRoutes } from './app.routes';
import { RunStateStore } from './run-state/run-state.store';
import {
  MARKET_PRODUCER_WORKER_CLIENT,
} from './worker/worker-client';

/**
 * Feeds the displayed run state from the producer's three channels for the
 * whole application lifetime. The wiring lives in the root injector rather
 * than in any component: the shell stays routing and navigation only, and
 * the displayed condition keeps updating no matter which destination is
 * open. A destination subscribing as well is harmless; the store accepts
 * the same push twice without effect.
 */
function provideRunStateWiring(): EnvironmentProviders {
  return makeEnvironmentProviders([
    {
      provide: ENVIRONMENT_INITIALIZER,
      multi: true,
      useValue: () => {
        const client = inject(MARKET_PRODUCER_WORKER_CLIENT);
        const store = inject(RunStateStore);
        client.onSnapshot((push) => store.acceptPush(push));
        client.onStatus((push) => store.acceptPush(push));
        client.onError((push) => store.acceptPush(push));
      },
    },
  ]);
}

/**
 * Binds icons without an explicit font set to the bundled Material icon
 * font. The stylesheet registration in `src/styles.css` supplies the
 * @font-face and the `material-icons` class as same-origin assets, so the
 * registry never reaches for a remote glyph source. `mat-ligature-font`
 * stays in the class list so icons addressed through the `fontIcon`
 * attribute keep rendering.
 */
function provideMaterialIconFont(): EnvironmentProviders {
  return makeEnvironmentProviders([
    {
      provide: ENVIRONMENT_INITIALIZER,
      multi: true,
      useValue: () => {
        inject(MatIconRegistry).setDefaultFontSetClass(
          'material-icons',
          'mat-ligature-font'
        );
      },
    },
  ]);
}

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(appRoutes),
    provideAnimationsAsync(),
    provideMaterialIconFont(),
    provideRunStateWiring(),
  ],
};
