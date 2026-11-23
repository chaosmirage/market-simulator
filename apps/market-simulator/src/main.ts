import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { AppComponent } from './app/app.component';
import { getMarketProducerWorkerClient } from './app/worker/worker-client';

// The worker seam's startup proof, observable on the running app: the empty
// producer worker is created once, answers the typed ping with the typed
// echo, then loads the wasm artifact through the same loader the artifact
// spec pins. Failures surface as errors, never as silent hangs.
const workerSeam = getMarketProducerWorkerClient();
workerSeam
  .ping()
  .then(() => console.log('[market-producer] echo received'))
  .then(() => workerSeam.initWasm())
  .then((probe) =>
    console.log(
      `[market-producer] wasm artifact loaded (stub add(2, 3) = ${probe})`
    )
  )
  .catch((error: unknown) =>
    console.error('[market-producer] worker seam failed', error)
  );

bootstrapApplication(AppComponent, appConfig).catch((err) =>
  console.error(err)
);
