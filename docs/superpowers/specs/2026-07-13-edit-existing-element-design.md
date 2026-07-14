# Edit-existing-element links (`#/edit/node/1234`)

**Date:** 2026-07-13
**Status:** Approved

## Purpose

Let a mapper (or anyone) send a business owner a link like
`https://onosm.org/#/edit/node/1234` that loads the existing OSM element,
prefills the onosm.org form with its tags and location, and — on submit —
creates an OSM note describing *only what changed*, referencing the element.
This makes it easy for business owners to suggest corrections to existing
places instead of only adding new ones.

## URL scheme

- Pattern: `#/edit/(node|way)/(\d+)`, also accepted without the leading
  slash (`#edit/node/1234`).
- Parsed at page load alongside the existing `#zoom/lat/lon` location-link
  pattern in `js/site.js`; like that pattern, the hash is consumed and
  cleared immediately so it doesn't interfere with the step-navigation
  hashes (`#details`, `#done`).
- Relations are out of scope (rare for POIs; centroid resolution is
  disproportionately complex).

## Fetching the element

- Node: `GET https://api.openstreetmap.org/api/0.6/node/{id}.json`
  (CORS-enabled; verified).
- Way: `GET https://api.openstreetmap.org/api/0.6/way/{id}/full.json`;
  marker position is the centroid (arithmetic mean) of the way's node
  coordinates.
- Error handling: HTTP 404, 410 (deleted), network/timeout failures, or an
  element with no tags all show a dismissible warning ("Couldn't load that
  OSM object") and fall back to the normal blank flow at step 1.

## Edit context and prefill

A module-level `editContext = { type, id, tags }` (null when not in edit
mode) records the loaded element. Cleared when the form is reset after a
successful submission (`#done` / `clearFields()`).

Form fields prefill directly from tags:

| Form field       | OSM tag(s), first match wins        |
|------------------|-------------------------------------|
| `#name`          | `name`                              |
| `#phone`         | `phone`, `contact:phone`            |
| `#website`       | `website`, `contact:website`        |
| `#opening_hours` | `opening_hours`                     |
| `#wheel`         | `wheelchair`                        |
| `#hnumberalt`    | `addr:housenumber`                  |
| `#addressalt`    | `addr:street`                       |
| `#placenamealt`  | `addr:place`                        |
| `#city`          | `addr:city`                         |
| `#postcode`      | `addr:postcode`                     |

- Address fields absent from the tags are filled from a Nominatim reverse
  geocode of the element position (same flow as existing location links);
  tag values always win over geocoder values.
- Category picker stays blank. Instead, a read-only line near the form
  shows the element's current main tags (`amenity`, `shop`, `tourism`,
  `leisure`, `craft`, `office`, `cuisine`), e.g. "Currently tagged:
  amenity=cafe". No tag→category-string mapping is attempted.
- Payment/delivery/takeaway inputs are left untouched; if the user sets
  one, it is included in the note as a suggested change.

## Map step behavior

Reuses `showFoundAddress()`: marker placed at the element position,
geofence circle around it, step 1 auto-completed, and the user lands
directly on `#details`. The marker remains draggable within the usual
fence so "this place moved slightly" can be part of the suggestion.

## Note body (diff format)

In edit mode, `getNoteBody()` compares each field's submitted value
against its prefilled tag value and emits only differences:

```
onosm.org suggested update to https://osm.org/node/1234 from the business:
phone=+1 555 0100 (was +1 555 0199)
opening_hours=Mo-Fr 09:00-17:00 (was Mo-Sa 08:00-18:00)
website=https://example.com (new)

#OnOSM.org-2026-07-13
```

- Changed field: `key=newvalue (was oldvalue)`.
- Newly added field: `key=value (new)`.
- Field cleared by the user: **ignored** (not reported as a removal) —
  keeps accidental deletions out of notes; explicit removal suggestions
  are a possible future extension.
- If the marker moved more than ~10 m from the element position, a
  `location moved to <lat>, <lon>` line is added.
- If nothing changed (no field diffs and no marker move), submission is
  blocked using the existing required-info alert styling with a
  "you haven't changed anything yet" message.
- The note is anchored at the marker position, as today.
- The `#OnOSM.org-<date>` hashtag is kept.

## i18n

New strings in `locales/en/`, `locales/en-US/`, `locales/en-GB/`
`translation.json` (other locales fall back to English):

- edit-mode banner ("Suggesting changes to <link>")
- current-tags label ("Currently tagged:")
- fetch-error warning
- nothing-changed validation message

## Testing

Manual verification via a local static server, consistent with the repo's
no-test-harness setup:

- `#/edit/node/<id>` for a tagged POI node → form prefilled, lands on
  details, diff-only note body.
- `#/edit/way/<id>` for a building POI → marker at centroid.
- Deleted element (410), bogus ID (404), and untagged element → warning +
  normal blank flow.
- No-change submission blocked; changed submission produces correct diff.
- Existing flows (`#zoom/lat/lon` links, plain search) unaffected.
