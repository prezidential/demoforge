# Step actions

Every scene has `id`, `narration`, and `steps`. A scene with a `card` block
renders a full-bleed card instead of the app.

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

## Rules that matter

**Every `click` needs the element to exist first.** Add a `waitFor` after any
navigation. `goto` resolves on network idle, which is often *before* a table or
panel has painted.

**`type` is slower than it looks.** 55ms per character: a 50-character line is
2.75 seconds of scene budget. Long strings plus a short narration line is the
usual cause of a scene overrunning.

**Use `callout` sparingly — two or three per video.** More than that and it
stops reading as emphasis. Always `clearCallout` before the scene ends.

**Add a `pause` of 600–1200ms after anything that changes the screen**, so the
viewer's eye can land before the next thing moves.

## Cards

```json
"card": { "title": "Governing AI Agents", "subtitle": "Inventory and access" }
```

Renders a branded title card: logo, brand rule, headline, subtitle, staggered in.

Add `"mode": "end"` for the closing card:

```json
"card": { "title": "Know every agent.", "subtitle": "Govern every tool call.", "mode": "end" }
```

The statement holds, dissolves, then the logo assembles from its own pieces,
blooms, and dissolves to black. The timing is derived from that scene's
narration length, so rewriting the closing line re-times it automatically.

The sting must *finish* inside the scene budget — `compose` muxes with
`-shortest`, so anything still animating at the end is cut. If the closing line
is too short, `record` warns by name rather than clipping silently.

## Scene shape that works

A demo that holds attention usually goes:

1. **Title card** — the problem, not the product name
2. **Establish** — the screen where the problem lives
3. **Narrow** — search, filter, or click into one concrete example
4. **Reveal** — the thing that makes the product worth it
5. **Consequence** — what changes because of it
6. **End card** — the payoff in one line

Empty states are often the strongest transition. "This agent has no gateway
attached" earns the next section far better than a segue would.
