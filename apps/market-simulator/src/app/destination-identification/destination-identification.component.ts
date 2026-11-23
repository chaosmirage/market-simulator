import { Component, input } from '@angular/core';
import { Destination } from '../destinations';

/**
 * The identification block every destination presents on arrival: one
 * heading row carrying the destination's display title.
 */
@Component({
  selector: 'app-destination-identification',
  templateUrl: './destination-identification.component.html',
  styleUrl: './destination-identification.component.css',
})
export class DestinationIdentificationComponent {
  readonly destination = input.required<Destination>();
}
