import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { AppComponent } from './app/app.component';
import {
  MARKET_PRODUCER_WORKER_CLIENT,
} from './app/worker/worker-client';
import { RunStateStore } from './app/run-state/run-state.store';
import {
  DEFAULT_SIMULATION_SETTINGS,
} from './app/worker/worker-contract';

// The application starts with the default producer settings: one long-lived
// producer run is established as the shell comes up, and any initialization
// failure surfaces through the displayed condition instead of silence.
bootstrapApplication(AppComponent, appConfig)
  .then((application) => {
    const client = application.injector.get(MARKET_PRODUCER_WORKER_CLIENT);
    const store = application.injector.get(RunStateStore);
    return client
      .start(DEFAULT_SIMULATION_SETTINGS)
      .catch((error: unknown) => {
        store.acceptPush({
          kind: 'error',
          runId: null,
          message:
            error instanceof Error
              ? error.message
              : `the market producer could not start: ${String(error)}`,
        });
      });
  })
  .catch((err) => console.error(err));
