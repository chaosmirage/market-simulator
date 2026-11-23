# app

## Purpose

The application shell and route level: the destination inventory every
navigation fact derives from, the route table, the movement band, and the
routed destination pages.

## Key pieces

- `destinations.ts` - the destination inventory. Each record names one
  navigable destination: its route path, its announced name, and the
  product page it anticipates. Every route path, identification row, and
  band label in the application derives from these records; no destination
  literal lives anywhere else.
- `app.routes.ts` - exactly one route per destination record; the market
  dashboard is the default route at the empty path.
- `app.component` - the persistent movement band above the routed content
  field. The anchor of the destination currently open hides itself (exact
  address match), so exactly one offer, naming the other destination, is
  visible and focusable on every surface.
- `destination-identification/` - the three-row identification block both
  destinations present on arrival: the shell statement, the open
  destination's name, and the anticipated product page.
- `market-dashboard/` and `producer-settings/` - the two routed destination
  pages; their whole payload is the arrival identification block.
- `shell-navigation.spec.ts` - pins the identification rows, the single
  visible band offer, and the round trip on both addresses.

## How to extend safely

- Add a destination as one movement: a record in `destinations.ts`, a
  route in `app.routes.ts`, an anchor in `app.component.html`, and a page
  directory presenting the identification block. Read destination strings
  from the records; keep them out of templates.
- Preserve the band rule: the open destination's anchor hides, and exactly
  one offer stays visible on every surface.
- Extend `shell-navigation.spec.ts` in the same change whenever shell
  navigation behavior changes.
