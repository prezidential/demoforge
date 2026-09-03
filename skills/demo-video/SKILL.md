---
name: demo-video
description: This skill should be used when the user wants to create, edit, or troubleshoot a narrated product demo video with demoforge — writing or changing demo.config.json, choosing scenes and selectors from build/inventory.json, writing narration, adding title or end cards, or diagnosing a build whose audio, timing, or overlays came out wrong.
version: 0.3.0
---

# Writing a product demo with demoforge

demoforge turns one config file into a narrated video: Playwright drives the real
product, ElevenLabs narrates, ffmpeg assembles.

**`demo.config.json` is the only file a human should edit.** Writing it well is
the job. Everything in `src/` is engine — do not change it unless the user asks
for a pipeline change.

## The loop

```
npm run setup                       # first run only: keys, voice, login
npm run discover -- /route /route   # inventory the product → build/inventory.json
                                    #   ↓ you write demo.config.json
npm run validate                    # check selectors, free, seconds
npm run preview:overlay             # see the cards and callouts, free, seconds
npm run build                       # narrate + record + compose
```

Never run `npm run build` to test a config change. `validate` is free;
`build` spends ElevenLabs characters and several minutes.

## Before writing a single scene

Read `build/inventory.json`. It lists every interactive element per route with a
`stability` rating, and `build/discovery/*.png` shows what each route looks like.

**Never invent a selector.** If it is not in the inventory, run
`npm run discover` on that route instead of guessing. A plausible-looking
selector that does not exist fails minutes into a build, not at validate time.

**Always prefer `stability: "high"`.** Those are `data-testid` and clean `id`
attributes, and they survive redesigns. `medium` means text or `aria-label`,
which breaks the moment someone rewrites the copy. If the only option for a key
element is `medium` or `low`, use it — but say so in your response. That is a
real maintenance cost the user should learn about from you, not from a broken
build in three months.

If a table's rows have no test IDs, a good pattern is to type into the page's
own search box (usually a stable input) to narrow to one row, then click the row
by exact text. Exact text — `text="Name"` — matters: a substring match will also
hit the description cell and become ambiguous.

## Scenes

Each scene pairs one line of narration with the steps performed while it plays.
The recorder holds the frame until the voiceover finishes, so **narration length
sets scene length**.

- 6–12 seconds per scene, roughly 15–30 words
- If `validate` warns a line is long, split the scene. Two 8-second scenes read
  better than one 16-second one
- Steps that outrun their narration produce a warning naming the scene. That
  means the line is too short or the scene is doing too much

See `references/actions.md` for the full step reference and the rules about
`callout`, `pause`, and card modes.

## Narration

Write for the ear, not the page. Short sentences. No semicolons.

- **Do not narrate what is visibly happening.** "Now I'm clicking approve" is
  wasted breath — the viewer can see it
- **Narrate why it matters.** "Approve, and provisioning starts immediately"
- **Lead with the problem the feature solves**, not the feature name
- Prefer concrete nouns over product vocabulary

See `references/narration.md` for worked before/after examples.

## When something comes out wrong

`references/troubleshooting.md` documents failure modes that are invisible in
the source and have each cost real debugging time: video ending early, narration
volume wandering between scenes, `validate` reporting failures that are not
real, and overlays that look pasted on. Read it before diagnosing from scratch.

## Reporting back

When you finish writing a config, tell the user:

- any selector you used that was not `stability: "high"`, and what would break it
- the estimated runtime from `validate`
- anything you could not do because the inventory did not cover it
