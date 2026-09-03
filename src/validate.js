// npm run validate
//
// Walks demo.config.json without recording and without calling ElevenLabs.
// Confirms every route loads and every selector resolves to exactly one visible
// element. Run this after any config change — it turns a five-minute failed
// build into a five-second answer.

import { chromium } from 'playwright';
import fs from 'node:fs';

const config = JSON.parse(fs.readFileSync('demo.config.json', 'utf8'));

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  storageState: '.auth/state.json',
  viewport: config.viewport,
});
const page = await context.newPage();

let failures = 0;
let warnings = 0;

// Rough narration pacing check. ~2.6 words/sec is a normal presenter cadence;
// this catches lines that are far too long for the steps beside them before
// you've spent a single ElevenLabs character.
const WORDS_PER_SEC = 2.6;

for (const scene of config.scenes) {
  console.log(`\n${scene.id}`);

  const words = scene.narration.trim().split(/\s+/).length;
  const estSec = words / WORDS_PER_SEC;
  console.log(`  narration    ~${estSec.toFixed(1)}s (${words} words)`);

  if (estSec > 14) {
    console.log(`  ! long line — consider splitting this scene`);
    warnings++;
  }

  for (const step of scene.steps) {
    if (step.action === 'goto') {
      const url = config.baseUrl + step.path;
      try {
        const res = await page.goto(url, { waitUntil: 'networkidle', timeout: 20000 });
        if (/login|signin/i.test(page.url()) && !/login|signin/i.test(step.path)) {
          console.log(`  FAIL goto ${step.path} — redirected to login, session expired`);
          failures++;
        } else {
          console.log(`  ok   goto ${step.path} (${res?.status() ?? '—'})`);
        }
      } catch {
        console.log(`  FAIL goto ${step.path} — did not load`);
        failures++;
      }
      continue;
    }

    if (!step.selector) continue;

    const locator = page.locator(step.selector);
    let count = 0;
    try {
      count = await locator.count();
    } catch {
      console.log(`  FAIL ${step.action} ${step.selector} — invalid selector syntax`);
      failures++;
      continue;
    }

    if (count === 0) {
      console.log(`  FAIL ${step.action} ${step.selector} — no match`);
      failures++;
    } else if (count > 1) {
      console.log(`  warn ${step.action} ${step.selector} — ${count} matches, will use the first`);
      warnings++;
    } else {
      const visible = await locator.first().isVisible();
      if (visible) {
        console.log(`  ok   ${step.action} ${step.selector}`);
      } else {
        console.log(`  warn ${step.action} ${step.selector} — matched but not visible yet`);
        warnings++;
      }
    }
  }
}

await browser.close();

const totalEst = config.scenes.reduce(
  (a, s) => a + s.narration.trim().split(/\s+/).length / WORDS_PER_SEC + 0.5, 0
);

console.log(`\n${'-'.repeat(50)}`);
console.log(`Estimated runtime: ${totalEst.toFixed(0)}s`);
console.log(`${failures} failures, ${warnings} warnings`);

process.exit(failures > 0 ? 1 : 0);
