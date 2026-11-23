import { Component } from '@angular/core';
import { DestinationIdentificationComponent } from '../destination-identification/destination-identification.component';
import { MARKET_DASHBOARD } from '../destinations';

/**
 * The market-dashboard destination — the default route and the seed of the
 * future market dashboard page. Its whole payload is the arrival
 * identification; nothing is operable here yet.
 */
@Component({
  imports: [DestinationIdentificationComponent],
  selector: 'app-market-dashboard',
  templateUrl: './market-dashboard.component.html',
})
export class MarketDashboardComponent {
  protected readonly destination = MARKET_DASHBOARD;
}
