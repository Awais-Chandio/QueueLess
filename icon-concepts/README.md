# MediQ icon concepts

Three candidate launcher marks. **Nothing here is wired into the app yet** — the
final platform asset sets get generated only after one concept is approved.

| File | Concept | 48px legibility | Safe zone |
|---|---|---|---|
| `concept-1-pulse-m.svg` | **Pulse M** — ECG trace forming the M | reads as a pulse, not clearly an M | 90% |
| `concept-2-queue-token.svg` | **Queue Token** — M reversed out of a disc | crisp, best of the three | 97% (tight) |
| `concept-3-check-m.svg` | **Check M** — M whose valley is a checkmark | clear M, check still legible | 93% |

`preview/` holds each concept rendered at 48/72/96/192/512px. Judge the 48px
files — that is the size the mark actually has to survive.

## Rules these follow

- Colours come verbatim from `src/theme/colors.ts` (see `_brand.json`). No new palette.
- No concept spells out "MediQ". A launcher icon is a mark, not a word.
- Two shapes maximum each.
- **Safe zone** is the share of Android's guaranteed-visible area (the inner 72dp
  of a 108dp adaptive layer) that the mark occupies, measured from the rendered
  alpha channel rather than estimated from path bounds. All three fit. Concept 2
  is tight, so its adaptive foreground must be scaled to ~88% before export.
