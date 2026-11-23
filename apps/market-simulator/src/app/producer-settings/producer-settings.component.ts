import { Component } from '@angular/core';
import { DestinationIdentificationComponent } from '../destination-identification/destination-identification.component';
import { PRODUCER_SETTINGS } from '../destinations';

/**
 * The producer-settings destination — the second route and the seed of the
 * future producer configuration page. Its whole payload is the arrival
 * identification; nothing is operable here yet.
 */
@Component({
  imports: [DestinationIdentificationComponent],
  selector: 'app-producer-settings',
  templateUrl: './producer-settings.component.html',
})
export class ProducerSettingsComponent {
  protected readonly destination = PRODUCER_SETTINGS;
}
