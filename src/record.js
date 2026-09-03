// npm run record
// Drives the real product with the saved login and records one continuous video.
// Each scene is stretched or padded to match its narration length from the manifest,
// so audio and picture line up without any editing afterward.

import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import {
  installOverlay, showHold, showCard, showEndCard, hideCard, callout, clearCallout,
} from './overlay.js';

const config = JSON.parse(fs.readFileSync('demo.config.json', 'utf8'));
const manifest = JSON.parse(fs.readFileSync('build/narration/manifest.json', 'utf8'));
const timing = Object.fromEntries(manifest.map(m => [m.id, m]));

const videoDir = path.join('build', 'raw');
fs.mkdirSync(videoDir, { recursive: true });

const browser = await chromium.launch({ headless: false });
const context = await browser.newContext({
  storageState: '.auth/state.json',
  viewport: config.viewport,
  recordVideo: { dir: videoDir, size: config.viewport },
  deviceScaleFactor: 2,
});

const page = await context.newPage();

// Playwright starts recording the moment the page exists, so everything from
// here to the first scene lands in the file: browser warm-up, the login-state
// navigation, the app's first paint. That is seconds, not the ~1s of white the
// old fixed 1.5s trim assumed, and compose cuts the overshoot off the *end* —
// which silently ate the closing scene. Measure it instead.
const recordStart = Date.now();

// Re-install after every navigation — the DOM is replaced each time.
page.on('load', () => installOverlay(page).catch(() => {}));

// ---------------------------------------------------------------------------
// Step runner
// ---------------------------------------------------------------------------
async function runStep(step) {
  switch (step.action) {
    case 'goto':
      await page.goto(config.baseUrl + step.path, { waitUntil: 'networkidle' });
      await installOverlay(page);
      break;
    case 'waitFor':
      await page.waitForSelector(step.selector, { timeout: 15000 });
      break;
    case 'click':
      // Move visibly before clicking — an instant jump reads as a glitch.
      await page.locator(step.selector).first().hover();
      await page.waitForTimeout(320);
      await page.locator(step.selector).first().click();
      break;
    case 'type':
      await page.locator(step.selector).first().pressSequentially(step.text, { delay: 55 });
      break;
    case 'scrollTo':
      await page.locator(step.selector).first().scrollIntoViewIfNeeded();
      await page.waitForTimeout(450);
      break;
    case 'callout':
      await callout(page, step.selector, step.text);
      break;
    case 'clearCallout':
      await clearCallout(page);
      break;
    case 'pause':
      await page.waitForTimeout(step.ms);
      break;
    default:
      throw new Error(`Unknown action: ${step.action}`);
  }
}

// ---------------------------------------------------------------------------
// Main loop
// ---------------------------------------------------------------------------

// Hold on a plain black cover through the app's load and first paint. This is
// deliberately NOT the title card: showing the card here would run its entrance
// transitions against empty text, and the real title would then pop in fully
// formed at t0 instead of animating.
await page.goto(config.baseUrl, { waitUntil: 'networkidle' });
await installOverlay(page);
await showHold(page);
await page.waitForTimeout(1200);

const t0 = Date.now();
const headTrim = (t0 - recordStart) / 1000;
console.log(`  head    ${headTrim.toFixed(2)}s of pre-roll to trim`);
const cues = [];

for (const scene of config.scenes) {
  const sceneStart = Date.now();
  const budget = (timing[scene.id].duration + timing[scene.id].tail) * 1000;

  cues.push({ id: scene.id, at: (sceneStart - t0) / 1000 });

  if (scene.card?.mode === 'end') {
    await showEndCard(page, scene.card.title, scene.card.subtitle, budget);
  } else if (scene.card) {
    await showCard(page, scene.card.title, scene.card.subtitle);
  } else {
    await hideCard(page);
  }

  for (const step of scene.steps) {
    await runStep(step);
  }

  // Hold the frame until the voiceover for this scene would have finished.
  const spent = Date.now() - sceneStart;
  const remaining = budget - spent;

  if (remaining > 0) {
    await page.waitForTimeout(remaining);
  } else {
    console.warn(
      `  ! scene "${scene.id}" ran ${Math.round(-remaining)}ms past its narration. ` +
      `Trim the line or split the scene.`
    );
  }

  console.log(`  ${scene.id.padEnd(20)} ${(budget / 1000).toFixed(1)}s`);
}

await page.waitForTimeout(700);
await context.close();
await browser.close();

// Playwright names videos by internal id; find the one we just made.
const video = fs.readdirSync(videoDir)
  .filter(f => f.endsWith('.webm'))
  .map(f => ({ f, t: fs.statSync(path.join(videoDir, f)).mtimeMs }))
  .sort((a, b) => b.t - a.t)[0].f;

fs.writeFileSync('build/cues.json', JSON.stringify({
  video: path.join(videoDir, video),
  headTrim,
  cues,
}, null, 2));

console.log(`\nRecorded ${video}`);
