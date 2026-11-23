# app

## Purpose

The application shell and route level: the destination inventory every
navigation fact derives from, the route table, the persistent status band,
the app-level run-state store both pages read, and the two routed
destination pages — the live market dashboard and the producer settings
form.

## Key pieces

- `destinations.ts` - the destination inventory. Each record names one
  navigable destination: its route path, its announced band-offer name, and
  its display title. Every route path, band label, and page heading in the
  application derives from these records; no destination literal lives
  anywhere else.
- `app.routes.ts` - exactly one route per destination record; the market
  dashboard is the default route at the empty path.
- `app.component` - the persistent status band above the routed content
  field. It carries the movement offer (the anchor of the destination
  currently open hides itself by exact address match, so exactly one offer
  naming the other destination is visible and focusable on every surface)
  and the single condition chip reading the run state — one of
  initializing, running, paused, error — which tracks the run, never the
  destination it is read from.
- `run-state/` - `run-state.store.ts`, the root-provided signal store. It
  is fed through the root-injector wiring in `app.config.ts` (the worker
  client's snapshot, status, and error channels) and holds the display
  state the band and both pages read; nothing else writes it.
- `market-dashboard/` - the live table page: a Material table whose rows
  are replaced wholesale per snapshot, one stable row per instrument, the
  five metric columns in the fixed contract order (last traded price,
  bid-ask spread, volume, VWAP, imbalance), currency and decimal formatting,
  the unavailable member for not-yet-computable metrics, and the
  pause/resume icon button at the table head offered exactly in the running
  and paused conditions.
- `producer-settings/` - the settings form page: a reactive form of three
  integer controls (instrument count, updates per batch, batch interval)
  each validated for presence, integrality, and its allowed range, rendered
  in Material form fields with hint and error text; a derived nominal-rate
  reading that re-derives as entries change; and the Apply button, disabled
  unless the whole form is valid, which starts a new run through the worker
  client. Editing never reaches the running producer.
- `destination-identification/` - the one-row identification block each
  page presents on arrival: the destination's display title.
- `shell-navigation.spec.ts` - pins the page identification, the single
  visible band offer, and the round trip on both addresses.

## How to extend safely

- Add a destination as one movement: a record in `destinations.ts`, a
  route in `app.routes.ts`, an anchor in `app.component.html`, and a page
  directory presenting the identification block. Read destination strings
  from the records; keep them out of templates.
- Preserve the band rules: the open destination's anchor hides, exactly one
  offer stays visible on every surface, and the condition chip reads the
  shared run-state store rather than any page-local state.
- Keep page state flowing through the run-state store and the worker
  client; pages never talk to the producer seam directly, and the
  client-to-store wiring stays in the root injector, not in the shell.
- Extend `shell-navigation.spec.ts` in the same change whenever shell
  navigation behavior changes, and each page's colocated spec whenever that
  page's behavior changes.
