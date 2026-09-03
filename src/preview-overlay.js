// npm run preview:overlay
//
// Renders the overlay against the real product and writes stills to
// build/preview/. Free, takes seconds, and spends no ElevenLabs credit — use it
// to check the graphics before committing to a full record + compose.
//
// Every card scene in demo.config.json is captured, plus each callout in the
// state its scene actually reaches, so tip placement is checked where it really
// lands rather than in the abstract.

import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import {
  installOverlay, showCard, showEndCard, hideCard, callout, clearCallout,
} from './overlay.js';

const config = JSON.parse(fs.readFileSync('demo.config.json', 'utf8'));
const outDir = path.join('build', 'preview');
fs.mkdirSync(outDir, { recursive: true });

// Use the real narration budget when it exists, so the end-card sting previews
// at the timing it will actually record at.
const manifestPath = path.join('build', 'narration', 'manifest.json');
const timing = fs.existsSync(manifestPath)
  ? Object.fromEntries(JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
      .map(m => [m.id, (m.duration + m.tail) * 1000]))
  : {};

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  storageState: '.auth/state.json',
  viewport: config.viewport,
  deviceScaleFactor: 2,
});
const page = await context.newPage();
page.on('load', () => installOverlay(page).catch(() => {}));

const shot = async (name) => {
  const file = path.join(outDir, `${name}.png`);
  await page.screenshot({ path: file });
  console.log(`  ${file}`);
};

await page.goto(config.baseUrl, { waitUntil: 'networkidle' });
await installOverlay(page);

for (const scene of config.scenes) {
  // The end card is a timed sting, so a single still says nothing useful about
  // it. Walk the shot and capture a filmstrip instead.
  if (scene.card?.mode === 'end') {
    const budget = timing[scene.id] ?? 6000;
    const marks = [0.10, 0.32, 0.50, 0.62, 0.74, 0.88, 0.97].map(f => Math.round(budget * f));
    await showEndCard(page, scene.card.title, scene.card.subtitle, budget);

    // Screenshots at deviceScaleFactor 2 are not free. Schedule against an
    // absolute clock and label each frame with the time it was actually taken,
    // otherwise capture latency silently accumulates and the strip claims
    // timings the animation never had.
    const t0 = Date.now();
    for (const [i, at] of marks.entries()) {
      const wait = at - (Date.now() - t0);
      if (wait > 0) await page.waitForTimeout(wait);
      const actual = Date.now() - t0;
      await shot(`end-${String(i + 1).padStart(2, '0')}-${actual}ms`);
      if (actual > at + 120) {
        console.log(`     (frame ${i + 1} wanted ${at}ms, capture ran ${actual - at}ms late)`);
      }
    }
    await hideCard(page);
    await page.waitForTimeout(500);
    continue;
  }

  if (scene.card) {
    await showCard(page, scene.card.title, scene.card.subtitle);
    await page.waitForTimeout(1100);         // let the staggered entrance settle
    await shot(`card-${scene.id}`);
    await hideCard(page);
    await page.waitForTimeout(500);
    continue;
  }

  // Replay the scene's steps so callouts are measured against the real layout.
  for (const step of scene.steps) {
    switch (step.action) {
      case 'goto':
        await page.goto(config.baseUrl + step.path, { waitUntil: 'networkidle' });
        await installOverlay(page);
        break;
      case 'waitFor':
        await page.waitForSelector(step.selector, { timeout: 15000 });
        break;
      case 'click':
        await page.locator(step.selector).first().click();
        break;
      case 'type':
        await page.locator(step.selector).first().fill(step.text);
        break;
      case 'scrollTo':
        await page.locator(step.selector).first().scrollIntoViewIfNeeded();
        break;
      case 'callout':
        await callout(page, step.selector, step.text);
        await page.waitForTimeout(800);
        await shot(`callout-${scene.id}`);
        break;
      case 'clearCallout':
        await clearCallout(page);
        await page.waitForTimeout(300);
        break;
      case 'pause':
        await page.waitForTimeout(Math.min(step.ms, 400));   // previews don't need the full beat
        break;
    }
  }
}

await browser.close();
console.log(`\nPreview stills in ${outDir}`);
