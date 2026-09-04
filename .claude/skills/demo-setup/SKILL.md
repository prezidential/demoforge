---
name: demo-setup
description: This skill should be used when the user wants to set up demoforge for the first time, configure their ElevenLabs API key or narration voice, log in to the product being demoed, run product discovery, or diagnose why a demo build will not run. Covers the setup wizard and the doctor health check.
version: 0.3.0
---

# Setting up demoforge

## What the user needs before starting

- **Node 18+**, and **ffmpeg** on PATH (it provides both `ffmpeg` and `ffprobe`).
  `npm install` does not supply ffmpeg — on macOS it is `brew install ffmpeg`
- **Their own ElevenLabs API key.** Quota and billing are per account, so keys
  are not shared between colleagues
- **A login for the product being demoed.** They log in by hand once

Claude Code itself is not required to run the pipeline — every stage is an npm
script. It is required only for authoring scenes from the inventory.

## First run

```
npm install
npx playwright install chromium
npm run setup
```

`npm run setup` is an interactive wizard and needs a real terminal — it cannot be
driven from a pipe. It walks through six steps and is safe to re-run; each step
detects what is already configured and offers to keep it.

1. **Machine check** — node, ffmpeg, ffprobe, Playwright Chromium
2. **API key** — hidden input, validated live, written to `.env` (mode 0600, gitignored)
3. **Voice** — lists the account's voices, offers a narration-suited shortlist,
   and can generate a sample before committing
4. **Product** — name and base URL
5. **Login** — opens a headed browser; the user logs in by hand, session saved to `.auth/`
6. **Discovery** — inventories the routes they name

It never destroys authored scenes. If `demo.config.json` already has scenes,
setup updates name, base URL, and voice and leaves the scenes untouched.

## Checking an existing install

```
npm run doctor
```

Non-interactive, exits non-zero, safe in CI. It checks the toolchain, validates
the API key, confirms the saved login still works by actually navigating, and
sanity-checks the config.

## Things worth knowing when helping

**The base URL must be scheme and host only.** Routes are appended to it, so a
trailing path silently turns `/agents` into `/login/agents` — which most apps
redirect somewhere harmless, producing a full inventory of the wrong page with no
error. Setup rejects this, and doctor catches it in an existing config.

**API keys can be permission-scoped.** Validate against `/v1/voices`, not
`/v1/user` — a key that is perfectly good for narration will still 401 on the
latter.

**Do not infer login validity from cookie expiry.** Apps commonly keep the
session in localStorage, and the only cookie present may be a short-lived
Cloudflare one that always looks expired. Navigating is the only honest test.

## Secrets

- `.env` holds the API key. Gitignored. Never commit it, never echo it
- `.auth/state.json` is a live authenticated session — anyone with it is logged
  in as that user. Gitignored
- Both are excluded from the repo from the first commit
