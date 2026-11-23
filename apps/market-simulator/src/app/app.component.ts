import { Component } from '@angular/core';
import { RouterModule } from '@angular/router';
import { MARKET_DASHBOARD, PRODUCER_SETTINGS } from './destinations';

/**
 * The shell: a persistent movement band above the routed content field. The
 * band carries one anchor per destination; the anchor of the destination
 * currently open hides itself, so exactly one offer — naming the other
 * destination — is visible and focusable on every surface.
 */
@Component({
  imports: [RouterModule],
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrl: './app.component.css',
})
export class AppComponent {
  protected readonly dashboard = MARKET_DASHBOARD;
  protected readonly settings = PRODUCER_SETTINGS;

  /**
   * An offer counts as the open destination only on an exact address match —
   * the root address must not shadow the settings destination.
   */
  protected readonly exactMatch = { exact: true };
}
