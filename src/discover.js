// npm run discover -- /requests /requests/1 /settings
//
// Walks the routes you name, logged in as you, and writes build/inventory.json:
// every interactive element with the most stable selector available, plus a
// screenshot per route. This is the raw material Claude Code turns into scenes.
//
// You are not meant to read this file. It exists so you never have to open
// devtools and copy selectors by hand.

import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const config = JSON.parse(fs.readFileSync('demo.config.json', 'utf8'));
const routes = process.argv.slice(2);

if (!routes.length) {
  console.error('Usage: npm run discover -- /route /another-route');
  process.exit(1);
}

const outDir = path.join('build', 'discovery');
fs.mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  storageState: '.auth/state.json',
  viewport: config.viewport,
});
const page = await context.newPage();

// Selector preference order. data-testid is stable across redesigns; a deep
// CSS path is not. If a route only yields nth-child selectors, that's a signal
// the demo will break on the next UI change — worth knowing before you build on it.
const SELECTOR_STRATEGY = `
(el) => {
  const attrs = ['data-testid', 'data-test', 'data-cy', 'data-qa'];
  for (const a of attrs) {
    const v = el.getAttribute(a);
    if (v) return { selector: \`[\${a}='\${v}']\`, stability: 'high' };
  }
  if (el.id && !/^[0-9]/.test(el.id) && !/\\d{4,}/.test(el.id)) {
    return { selector: '#' + CSS.escape(el.id), stability: 'high' };
  }
  const label = el.getAttribute('aria-label');
  if (label) return { selector: \`[aria-label='\${label}']\`, stability: 'medium' };
  const role = el.getAttribute('role') || el.tagName.toLowerCase();
  const text = (el.innerText || el.value || '').trim().slice(0, 40);
  if (text && text.length > 2) {
    return { selector: \`\${role}:has-text("\${text}")\`, stability: 'medium' };
  }
  return { selector: null, stability: 'low' };
}
`;

const inventory = [];

for (const route of routes) {
  const url = config.baseUrl + route;
  process.stdout.write(`  ${route} ... `);

  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 20000 });
  } catch {
    console.log('unreachable');
    inventory.push({ route, error: 'navigation timed out' });
    continue;
  }

  // Bounced to login? The saved session has expired.
  if (/login|signin|auth/i.test(page.url()) && !/login|signin|auth/i.test(route)) {
    console.log('redirected to login — run `npm run auth` again');
    break;
  }

  const shot = path.join(outDir, `${route.replace(/\//g, '_') || 'root'}.png`);
  await page.screenshot({ path: shot, fullPage: false });

  const elements = await page.evaluate((strategy) => {
    const pick = eval(strategy);
    const interactive = document.querySelectorAll(
      'button, a[href], input, select, textarea, [role="button"], [role="tab"], [role="menuitem"], th, [data-testid]'
    );
    const seen = new Set();
    const out = [];

    for (const el of interactive) {
      const rect = el.getBoundingClientRect();
      if (rect.width < 4 || rect.height < 4) continue;      // invisible
      if (rect.top > window.innerHeight * 3) continue;       // far below fold

      const { selector, stability } = pick(el);
      if (!selector || seen.has(selector)) continue;
      seen.add(selector);

      out.push({
        selector,
        stability,
        tag: el.tagName.toLowerCase(),
        text: (el.innerText || el.value || el.placeholder || '').trim().slice(0, 60),
        aboveFold: rect.top < window.innerHeight,
      });
    }
    return out;
  }, SELECTOR_STRATEGY);

  const headings = await page.evaluate(() =>
    Array.from(document.querySelectorAll('h1, h2'))
      .map(h => h.innerText.trim())
      .filter(Boolean)
      .slice(0, 12)
  );

  inventory.push({
    route,
    title: await page.title(),
    headings,
    screenshot: shot,
    elements,
  });

  const weak = elements.filter(e => e.stability === 'low' || e.stability === 'medium').length;
  console.log(`${elements.length} elements (${weak} fragile)`);
}

await browser.close();

fs.writeFileSync(
  path.join('build', 'inventory.json'),
  JSON.stringify(inventory, null, 2)
);

console.log(`\nWrote build/inventory.json and ${inventory.length} screenshots to ${outDir}`);
console.log('Next: open this folder in Claude Code and describe the demo you want.');
