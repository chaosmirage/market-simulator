/**
 * The destination inventory of the shell: each record names one navigable
 * destination and its route path. Every route path, identification row, and
 * band-offer label in the app derives from these two records — no
 * destination literal lives anywhere else.
 */
export interface Destination {
  /** Route path of the destination; kebab-case, unique within the pair. */
  readonly path: string;
  /** The announced destination name, shown in the band offer. */
  readonly name: string;
  /** The destination's display title, heading its page. */
  readonly title: string;
}

export const MARKET_DASHBOARD: Destination = {
  path: '',
  name: 'market-dashboard',
  title: 'Market dashboard',
};

export const PRODUCER_SETTINGS: Destination = {
  path: 'producer-settings',
  name: 'producer-settings',
  title: 'Producer settings',
};
