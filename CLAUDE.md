# Working in this repo

This project produces narrated product demo videos. Playwright drives the real
product, ElevenLabs narrates, ffmpeg assembles.

**The only file a human should be editing is `demo.config.json`.** Your main job
is writing that file well.

## The loop

```
npm run discover -- /route /route   # inventory the product
                                     # → you write demo.config.json
npm run validate                     # check it without spending anything
npm run build                        # narrate + record + compose
```

## Writing scenes

Read `build/inventory.json` first. It lists every interactive element per route
with a `stability` rating. **Always prefer `stability: "high"` selectors.**
A `medium` selector (text-based, aria-label) breaks when copy changes. If the
only option for a key element is `medium` or `low`, say so in your response
rather than silently using it — that's a real maintenance cost the user should
know about.

The screenshots in `build/discovery/` show what each route looks like. Use them
to decide what's actually worth pointing a camera at.

### Narration

Each scene pairs one line of narration with the steps performed while it plays.
The recorder holds the frame until the voiceover finishes, so the narration
length sets the scene length.

- Aim for 6–12 seconds per scene, roughly 15–30 words.
- Write for the ear, not the page. Short sentences. No semicolons.
- Do not narrate what is visibly happening ("now I'm clicking approve"). Narrate
  why it matters ("approve, and provisioning starts immediately").
- Lead with the problem the feature solves, not the feature name.

### Steps

Available actions are documented in README.md. Notes that matter:

- Every `click` should be preceded by the element existing — add a `waitFor` if
  the page navigated.
- Use `callout` sparingly. Two or three per video. More than that and it stops
  reading as emphasis.
- After a `callout`, always `clearCallout` before the scene ends.
- Add a `pause` of 600–1200ms after anything that changes the screen, so the
  viewer's eye can land before the next thing moves.

### Scene budget

If `validate` warns that a line is long, split the scene rather than trimming
the narration to fit. Two 8-second scenes read better than one 16-second one.

## Do not

- Do not edit files in `src/` unless the user asks for a pipeline change.
- Do not commit `.auth/state.json` — it is a live session.
- Do not run `npm run build` to test a config change. Run `npm run validate`
  first; it is free and takes seconds.
- Do not invent selectors. If it is not in `build/inventory.json`, run
  `npm run discover` on that route instead of guessing.
