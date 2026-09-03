# Working in this repo

This project produces narrated product demo videos. Playwright drives the real
product, ElevenLabs narrates, ffmpeg assembles.

## Where the knowledge lives

The rules for *authoring a demo* — reading the inventory, choosing selectors,
writing narration, scene budgets, card modes, troubleshooting a bad build — are
in the bundled skills, not here:

- `skills/demo-video/` — writing and fixing `demo.config.json` (start here)
- `skills/demo-setup/` — first-run setup, keys, login, discovery
- `skills/demo-build/` — which stage to run and what each one costs

They live as skills so they travel with the plugin instead of being stranded in
this folder. **If you are here to make a demo, read `skills/demo-video/SKILL.md`.**

This file covers working *on* the pipeline itself.

## Ground rules

- **`demo.config.json` is the only file a human should edit** to make a demo.
  Treat changes to `src/` as pipeline work, and only do them when asked.
- **Never commit `.auth/state.json`** — it is a live authenticated session.
  Anyone holding it is logged in as that user. It is gitignored; keep it that way.
- **Never commit `.env`.** Keys go there, never into `demo.config.json`.
- **Do not run `npm run build` to test a change.** `npm run validate` is free and
  takes seconds; `npm run preview:overlay` renders the graphics for free.

## Layout

```
src/
  config.js          .env loading, actionable failures
  doctor.js          health checks (exported; setup reuses them)
  setup.js           interactive first-run wizard
  auth.js            headed login, saves .auth/state.json
  discover.js        route inventory → build/inventory.json
  validate.js        selector + narration length check
  narrate.js         ElevenLabs → build/narration/*.mp3 + manifest
  record.js          drives the product, one continuous recording
  overlay.js         title cards, end card, callouts (injected CSS/DOM)
  preview-overlay.js renders overlays to stills without a full build
  compose.js         audio levelling, head trim, mux to mp4
brand/               design-system assets consumed by overlay.js
skills/              the plugin's bundled skills
```

## Things that will bite you

- **Timing is a contract.** `narrate` measures each clip; `record` treats those
  durations as scene budgets; `compose` muxes with `-shortest`. Change a duration
  anywhere and the downstream stages must be re-run.
- **`headTrim` is measured, never assumed.** Under-trimming the head silently
  truncates the *end* of the video.
- **The overlay is injected into someone else's page.** No external stylesheets,
  fonts, or images — a strict CSP will drop them mid-recording. Everything is
  inlined as a data URI from `brand/`.
- **`validate` never clicks.** Selectors that only exist after an interaction
  will report as missing. That is a limitation, not a bug.

Full failure catalogue: `skills/demo-video/references/troubleshooting.md`.
