/**
 * The destination inventory of the shell: each record names one navigable
 * destination, its route path, and the product page it anticipates. Every
 * route path, identification row, and band-offer label in the app derives
 * from these two records — no destination literal lives anywhere else.
 */
export interface Destination {
  /** Route path of the destination; kebab-case, unique within the pair. */
  readonly path: string;
  /** The announced destination name, shown in the identification block. */
  readonly name: string;
  /** The product page this destination anticipates once it exists. */
  readonly anticipatedPageName: string;
}

/** Row 1 of every identification block — identical on both destinations. */
export const SHELL_IDENTIFICATION_STATEMENT = 'market-simulator scaffold shell';

export const MARKET_DASHBOARD: Destination = {
  path: '',
  name: 'market-dashboard',
  anticipatedPageName: 'market dashboard',
};

export const PRODUCER_SETTINGS: Destination = {
  path: 'producer-settings',
  name: 'producer-settings',
  anticipatedPageName: 'producer configuration',
};
