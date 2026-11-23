import { Component, input } from '@angular/core';
import { Destination, SHELL_IDENTIFICATION_STATEMENT } from '../destinations';

/**
 * The three-row identification block every destination presents on arrival:
 * the shell statement, the open destination's name, and the product page it
 * anticipates. One structure, identical arrangement on both destinations —
 * only the destination-derived rows differ.
 */
@Component({
  selector: 'app-destination-identification',
  templateUrl: './destination-identification.component.html',
  styleUrl: './destination-identification.component.css',
})
export class DestinationIdentificationComponent {
  readonly destination = input.required<Destination>();

  protected readonly shellStatement = SHELL_IDENTIFICATION_STATEMENT;
}
