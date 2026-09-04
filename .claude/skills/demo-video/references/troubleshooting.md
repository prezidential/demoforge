# Troubleshooting

Failure modes that are invisible in the source. Each of these has already cost
someone an afternoon.

## The video ends early / the last scene is missing

**Symptom:** the closing scene plays fine while recording, but is absent or cut
mid-animation in the finished mp4.

**Cause:** `headTrim`. Playwright starts recording the moment the page is
created, so browser warm-up, the logged-in navigation, and first paint are all
in the file — commonly 8–10 seconds. `compose` trims `headTrim` off the head and
muxes with `-shortest` against a voice track exactly as long as the sum of the
scene budgets. So under-trimming the head does **not** leave slack at the front:
it shifts everything late and cuts an equal amount off the **end**.

`record` now measures the real pre-roll and writes it to `build/cues.json`. If
you ever see this again, check `headTrim` against the raw recording before
suspecting the last scene. It is never a fixed constant.

Diagnosis: compare `ffprobe` duration of `build/raw/*.webm` against
`build/voice.wav`. The difference should be roughly `headTrim` plus a second.

## Narration volume wanders between scenes

**Cause:** every scene is a separate ElevenLabs generation, and separate
generations do not agree on loudness. Measured spread on one real build was
7.3 LU — about a doubling in perceived volume between quietest and loudest line.

`compose` levels each scene to −16 LUFS and limits the joined track to −1.5 dBFS.

**Do not "protect" peaks by capping the per-scene gain.** Whichever line has the
sharpest transient then ends up quieter than everything else, which is the
problem you were trying to fix. Normalize fully, limit afterwards.

If it still wanders, the voice itself may be the cause — voice clones vary far
more between generations than premade voices.

## `validate` reports failures that are not real

`validate` only executes `goto`. It never clicks or types. So any selector that
exists only *after* an interaction — a side panel's tabs, a modal's fields —
correctly reports `no match`.

These are expected, not regressions. Verify that half by replaying the real step
sequence, or by running `npm run preview:overlay`, which walks each scene's steps
and captures the state each callout actually lands in.

## The narration did not change after switching voices

The cache key covers voice, model, and settings — not just the line. If you
changed the voice and every scene still says `cached`, something is wrong with
the key, not the API. Delete `build/narration/*.key.json` to force a rebuild.

## `eleven_v3` rejects the request

`eleven_v3` does not accept `previous_text`/`next_text`, and `narrate` skips them
for that model with a note. It also reads noticeably slower than
`eleven_multilingual_v2` — expect a meaningfully longer video from identical
copy, and re-record afterwards, because scene budgets change with the durations.

## Overlays look pasted on rather than part of the product

The overlay is styled from `brand/tokens.json`. If the card background or accent
does not match the product's own surface, the tokens are stale — re-sync them
from the design system.

Beware fully saturated brand colours in video. Pure `#00FF00` is outside
broadcast-safe range and fringes on hairline strokes and small glyphs under
H.264 4:2:0 chroma subsampling. Use full strength for large shapes and the
callout pill; use a slightly tempered value for thin rings. Black text on a
bright pill survives the re-encode better than white.

## A callout label runs off screen

Fixed: the tip measures itself, flips above the target when it would overflow the
bottom, and clamps horizontally. If you see it again, the element's bounding box
is probably being measured while the page is still animating — add a `pause`
before the `callout`.

## Discovery returned the same page for every route

Check `baseUrl`. Routes are appended to it, so a `baseUrl` ending in `/login`
turns `/agents` into `/login/agents`, which most apps quietly redirect to a
dashboard. You get a complete inventory of entirely the wrong page and no error
anywhere. `npm run doctor` now catches this.

Tell-tale sign: identical element counts and byte-identical screenshots across
routes that should look nothing alike.
