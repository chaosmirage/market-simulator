import { Route } from '@angular/router';
import { MarketDashboardComponent } from './market-dashboard/market-dashboard.component';
import { ProducerSettingsComponent } from './producer-settings/producer-settings.component';
import { MARKET_DASHBOARD, PRODUCER_SETTINGS } from './destinations';

/**
 * The complete route table — exactly one route per destination, derived from
 * the destination records. The market dashboard is the default route; the
 * settings destination lives at its kebab path.
 */
export const appRoutes: Route[] = [
  { path: MARKET_DASHBOARD.path, component: MarketDashboardComponent },
  { path: PRODUCER_SETTINGS.path, component: ProducerSettingsComponent },
];
