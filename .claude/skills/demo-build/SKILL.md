---
name: demo-build
description: This skill should be used when the user wants to build, render, preview, or validate a demoforge video — running validate, preview, narrate, record, or compose, understanding what each stage costs, or deciding which stage to re-run after a change.
version: 0.3.0
---

# Building a demo

## Stages, cheapest first

| command | cost | what it does |
|---|---|---|
| `npm run validate` | free, seconds | loads each route, resolves every selector, estimates runtime |
| `npm run preview:overlay` | free, seconds | renders every card and callout to `build/preview/` |
| `npm run narrate` | ElevenLabs characters | one mp3 per scene, cached per scene |
| `npm run record` | minutes, opens a browser | drives the product, one continuous video |
| `npm run compose` | seconds | levels audio, trims, muxes to mp4 |
| `npm run build` | all three | narrate → record → compose |

**Always `validate` before `build`.** It turns a five-minute failed build into a
five-second answer.

## Which stage to re-run

- **Changed narration text** → `build` (that scene re-narrates; others stay cached)
- **Changed voice, model, or voice settings** → `build`. Durations change, so
  scene budgets change, so the recording must be redone too
- **Changed steps or selectors only** → `record` then `compose`; narration is untouched
- **Changed overlay styling or brand tokens** → `record` then `compose`
- **Changed only audio levelling** → `compose` alone

## Reading the output

`validate` reporting `no match` for selectors that only exist after a click is
expected — it never clicks. See `demo-video`'s troubleshooting reference.

`record` prints the measured pre-roll and each scene's budget, and warns by name
if a scene's steps outran its narration.

`compose` prints the per-scene loudness correction. Gains should land within a
couple of dB of each other; a wildly different one usually means that scene's
narration was generated with different settings.

## Before sharing a video

Watch the last five seconds. The end card is the thing most likely to be cut,
because `compose` muxes with `-shortest`.

Check for on-screen personal data. Real names, email addresses, and customer
identifiers in the product's own data will be legible at 2880×1800.
