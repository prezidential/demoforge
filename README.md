# demoforge

Scripted product demo videos. Playwright drives the real product, ElevenLabs
narrates, ffmpeg assembles. No repo access required — it works against a
deployed URL with a saved login.

```
demo.config.json  →  narrate  →  record  →  compose  →  build/<name>.mp4
```

## Quick start

```bash
npm install
npx playwright install chromium
npm run setup        # guided: API key, voice, login, discovery
```

`npm run setup` walks through everything interactively and is safe to re-run —
each step detects what is already configured and offers to keep it. It never
overwrites scenes you have written.

Then describe the demo you want to Claude Code, or write `demo.config.json` by
hand starting from `demo.config.example.json`:

```bash
npm run validate     # check every selector, free, seconds
npm run build        # narrate + record + compose
```

Stuck? `npm run doctor` checks the toolchain, validates your API key, and
confirms your saved login still works by actually navigating.

## The loop

```
npm run discover -- /agents /settings   # inventory routes and selectors
                                        # edit demo.config.json (or let Claude Code do it)
npm run validate                        # check selectors, free and fast
npm run preview:overlay                 # see the cards and callouts, free
npm run build                           # narrate + record + compose
```

`discover` and `validate` exist so you never hand-write a selector or find out
about a typo five minutes into a render.

## Commands

| command | cost | what it does |
|---|---|---|
| `setup` | — | interactive first run |
| `doctor` | — | health check, exits non-zero, CI-safe |
| `auth` | — | headed login, saves the session |
| `discover` | — | inventory routes → `build/inventory.json` |
| `validate` | free | resolve selectors, estimate runtime |
| `preview:overlay` | free | render cards and callouts to stills |
| `narrate` | characters | one mp3 per scene, cached |
| `record` | minutes | drive the product, one continuous take |
| `compose` | seconds | level audio, trim, mux |
| `build` | all three | narrate → record → compose |

`narrate` caches per scene, so re-running only re-bills the lines you actually
changed. The cache key covers the voice and model too — changing either
correctly regenerates everything.

## Secrets

Two files must never be committed. Both are gitignored from the first commit:

- **`.env`** — your ElevenLabs API key. `setup` writes it with mode 0600
- **`.auth/state.json`** — a live authenticated session. Anyone holding it is
  logged in as you

`npm run auth` opens a headed browser. Log in however your product requires
(SSO, MFA, anything) and press Enter. Every later run starts authenticated.

## Use with Claude Code

The knowledge that makes a demo good — selector stability, writing narration for
the ear, scene budgets, the failure modes worth knowing — ships as skills in
`.claude/skills/`:

- `demo-video` — writing and fixing `demo.config.json`
- `demo-setup` — first run, keys, login, discovery
- `demo-build` — which stage to run and what each costs

Nothing to install. Open this folder in Claude Code and they load automatically,
so "write me a ninety second demo of the approval flow" produces a config that
follows the house rules instead of inventing selectors.

These are deliberately project skills rather than an installable plugin.
demoforge is project-shaped — each demo needs its own `demo.config.json`,
`.auth/` session, and `build/` directory, plus `node_modules` and ffmpeg — so
the skills are only useful where the project is, and that is exactly where they
live. A globally installed plugin would load the same advice into directories
where none of its commands could run.

## Why narration comes first

The usual failure mode in scripted demos is timing drift: a four-second
voiceover line playing over a half-second UI action. Generating audio first
inverts the dependency. `narrate` measures every clip with ffprobe and writes
`build/narration/manifest.json`; `record` then treats each scene's duration as a
budget and holds the frame until the voiceover would have finished. Audio and
picture land in sync with no editing pass.

If a scene's steps run *past* their narration, the recorder warns you by name.
That's a script problem — either the line is too short or the scene is doing too
much. Split it.

## demo.config.json

One file describes the whole video. Each scene pairs a line of narration with
the steps to perform while it plays.

| action | fields | notes |
|---|---|---|
| `goto` | `path` | appended to `baseUrl`, waits for network idle |
| `waitFor` | `selector` | 15s timeout |
| `click` | `selector` | hovers first, then clicks — instant jumps read as glitches |
| `type` | `selector`, `text` | types at 55ms/char so it looks human |
| `scrollTo` | `selector` | scrolls into view |
| `callout` | `selector`, `text` | rings the element, dims everything else, labels it |
| `clearCallout` | — | fades the ring out |
| `pause` | `ms` | explicit beat |

A scene with a `card` block renders a full-bleed title card instead of the app.

Adding `"mode": "end"` to that block makes it the closing card instead:

```json
"card": {
  "title": "Know every agent.",
  "subtitle": "Govern every tool call.",
  "mode": "end"
}
```

The statement holds, dissolves, and the Saviynt mark assembles from its four
pieces, blooms once, and dissolves to black. The whole sting is laid out against
that scene's own narration length, so rewriting the closing line re-times it
automatically — no offsets to maintain.

It has to *finish* inside that length. `compose` muxes with `-shortest` against a
voice track exactly as long as the sum of the scene budgets, so the recorder's
trailing hold never reaches the file; anything still animating at the end is cut
mid-fade. If the closing line is too short to fit the sting, `record` says so by
name rather than quietly clipping it.

## Overlays

Title cards and callouts are injected into the page as a fixed-position layer
with `pointer-events: none`, so they render on top without ever intercepting a
click. Transitions are real CSS transitions captured by the recorder rather than
effects added in post. The layer is reinstalled on every navigation, since the
DOM is replaced each time.

It all lives in `src/overlay.js`, separate from the recorder so you can look at
it without spending a build:

```bash
npm run preview:overlay     # stills to build/preview/, free, a few seconds
```

That renders every title card, and every callout in the state its scene actually
reaches, so tip placement is checked where it really lands.

## Brand

The overlay is styled from the Saviynt design system on Claude Design. The
synced pieces live in `brand/` — `tokens.json` records which files they came
from and when, alongside the logo, the bug mark, and a subsetted Hanken Grotesk.

Everything is inlined as a data URI at record time. The overlay is injected into
the *product's* page, so an external stylesheet or font URL is subject to that
page's CSP and would fail silently mid-recording.

Two things worth knowing before you change colors:

- Brand green is `#00FF00`. It is outside broadcast-safe range, and H.264 4:2:0
  chroma subsampling makes it fringe on hairline strokes and small glyphs. Large
  shapes, the logo, and the callout pill take it at full strength; the callout
  ring uses `video.ringGreen`, nudged just far enough to hold an edge.
- The callout pill is black-on-green rather than white-on-green. The wider luma
  gap is what keeps 15px type crisp after the re-encode.

To re-sync after the design system changes, re-pull the four files listed in
`brand/tokens.json`.

## Known rough edges

- Playwright starts recording the moment the page is created, so the browser
  warming up, the logged-in navigation, and the app's first paint are all in the
  file — commonly 8–10s, not the ~1s of white you might expect. `record` holds a
  black cover through it, measures the offset, and writes it to `headTrim` in
  `build/cues.json`; `compose` trims exactly that much.

  This used to be hardcoded to 1.5s, and the failure mode was nasty: `compose`
  muxes with `-shortest` against a voice track exactly as long as the scenes, so
  under-trimming the head does not leave slack at the front — it shifts
  everything late and silently cuts an equal amount off the **end**. A demo whose
  closing card recorded fine would simply not have one. If you ever see the video
  ending early, check `headTrim` against the raw recording before suspecting the
  last scene.
- Output is WebM (VP8) before the compose step. The mp4 re-encode at CRF 18 is
  where the quality is set.
- `deviceScaleFactor: 2` gives you a crisp 2880×1800 capture at a 1440×900
  viewport. Drop it to 1 if recording is slow on your machine.
- Selectors are the maintenance burden. Prefer `data-testid` if the product has
  them; if not, expect to re-check selectors when the UI ships changes.

## Voice

`voice.voiceId` accepts any voice in your ElevenLabs library, including your own
clone. `eleven_multilingual_v2` is the quality default; `eleven_flash_v2_5` is
faster and cheaper if you're iterating on script wording. Model IDs and the full
request shape: https://elevenlabs.io/docs/api-reference/text-to-speech/convert

The narration cache key covers the voice, the model, and the settings — not just
the line. Changing any of them regenerates every scene, which costs characters
but means a voice swap actually takes effect instead of silently serving the
previous voice from disk.

Two things to know when choosing:

- **Each scene is a separate generation, and separate generations do not agree
  on loudness.** `compose` levels them (see below), so do not judge a voice by
  volume consistency in the raw mp3s.
- **`eleven_v3` rejects `previous_text`/`next_text`.** Other models get the
  neighbouring lines as unspoken context so intonation carries across a cut;
  v3 trades that for its own expressiveness, and `narrate` says so when it
  applies. v3 also reads slower — expect a longer video from identical copy.

## Audio levelling

`compose` measures every scene and applies a fixed gain to land it at -16 LUFS,
then limits the joined track to -1.5 dBFS true peak. It is a per-scene gain, not
a compressor: performance inside a line is untouched, only the line-to-line
mismatch goes away.

Do not "protect" peaks by capping the gain. Whichever line has the sharpest
transient then ends up quieter than everything else, which is the problem you
were trying to fix. Normalize fully, limit afterwards.


## Generating scenes instead of writing them

Hand-authoring `demo.config.json` does not scale past the first video. The
intended workflow is:

**1. Inventory the product.**

```bash
npm run discover -- /requests /requests/1 /settings
```

Crawls those routes logged in as you and writes `build/inventory.json` — every
interactive element with the most stable selector available, rated `high`,
`medium`, or `low` — plus a screenshot per route in `build/discovery/`.

Selector stability is the number to watch. `data-testid` and clean `id`
attributes rate `high` and survive redesigns. Text and `aria-label` selectors
rate `medium` and break when copy changes. A route that yields mostly `medium`
is telling you the demo will need re-verification after UI churn.

**2. Let Claude Code write the config.**

Open the folder in Claude Code and describe the demo in a sentence — *"a
ninety-second walkthrough of the approval flow, aimed at a security buyer."*
`CLAUDE.md` tells it how to read the inventory, which selectors to prefer, how
long scenes should run, and how to write narration for the ear. It writes
`demo.config.json`.

**3. Validate before spending anything.**

```bash
npm run validate
```

Loads every route and resolves every selector without recording and without
calling ElevenLabs. Reports missing selectors, ambiguous ones that match more
than once, elements that exist but are not visible, and narration lines too long
for their scene. It also estimates total runtime at ~2.6 words/sec so you know
whether you have a 90-second video before you render one.

Exit code is non-zero on failure, so it drops straight into CI if you ever want
demos rebuilt on every release.

## Moving this to another machine

The repo carries no secrets, so it transfers cleanly. `git bundle` packs the
whole history into one file, and because it only packs committed objects, the
ignored files (`.env`, `.auth/`, `build/`) cannot travel by accident.

On the source machine:

```bash
git bundle create ../demoforge.bundle --all
```

Copy that single file across, then on the destination:

```bash
git clone demoforge.bundle demoforge
cd demoforge
git remote remove origin              # points at the bundle file
git remote add origin git@gitlab.example.com:team/demoforge.git
git push -u origin main

npm install
npx playwright install chromium
npm run setup                         # your own API key and login
```

`npm run setup` is required on the new machine — the API key and the login
session are deliberately not part of the repo. `npm run doctor` will tell you
exactly what is still missing.
