// npm run doctor
//
// Non-interactive health check. Answers "why won't this run?" without spending
// an ElevenLabs character or opening a browser. Exits non-zero if anything is
// broken, so it also works as a CI gate.
//
// The individual checks are exported because `setup` reuses them for preflight.

import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { loadEnv, authStatePath, hasAuthState } from './config.js';

const PASS = 'ok  ';
const WARN = 'warn';
const FAIL = 'FAIL';

export function checkNode() {
  const major = Number(process.versions.node.split('.')[0]);
  return major >= 18
    ? { status: PASS, label: `node ${process.versions.node}` }
    : { status: FAIL, label: `node ${process.versions.node}`, fix: 'Node 18 or newer is required.' };
}

export function checkBinary(bin) {
  const r = spawnSync(bin, ['-version'], { encoding: 'utf8' });
  if (r.error) {
    return {
      status: FAIL,
      label: `${bin} not found`,
      fix: `Install ffmpeg (it provides ffmpeg and ffprobe): brew install ffmpeg`,
    };
  }
  const version = (r.stdout || r.stderr || '').split('\n')[0].split(' ').slice(0, 3).join(' ');
  return { status: PASS, label: version };
}

export async function checkBrowser() {
  try {
    const { chromium } = await import('playwright');
    const exe = chromium.executablePath();
    return fs.existsSync(exe)
      ? { status: PASS, label: 'Playwright Chromium installed' }
      : {
          status: FAIL,
          label: 'Playwright Chromium missing',
          fix: 'npx playwright install chromium',
        };
  } catch {
    return { status: FAIL, label: 'playwright not installed', fix: 'npm install' };
  }
}

export async function checkApiKey() {
  loadEnv();
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) {
    return {
      status: FAIL,
      label: 'ELEVENLABS_API_KEY not set',
      fix: 'npm run setup, or add it to .env',
    };
  }
  // Validate against /v1/voices, not /v1/user. API keys can be permission
  // scoped, and a key that is perfectly good for narration will still 401 on
  // /v1/user — which would report a working setup as broken.
  try {
    const res = await fetch('https://api.elevenlabs.io/v1/voices', {
      headers: { 'xi-api-key': key },
    });
    if (res.status === 401) {
      return { status: FAIL, label: 'API key rejected (401)', fix: 'Check the key in .env' };
    }
    if (!res.ok) {
      return { status: WARN, label: `ElevenLabs returned ${res.status}`, fix: 'Service may be down.' };
    }
    const { voices = [] } = await res.json();

    // Quota is a bonus: only some keys may read it.
    let quota = '';
    try {
      const u = await fetch('https://api.elevenlabs.io/v1/user', { headers: { 'xi-api-key': key } });
      if (u.ok) {
        const { subscription: s = {} } = await u.json();
        if (Number.isFinite(s.character_count) && Number.isFinite(s.character_limit)) {
          quota = ` — ${(s.character_limit - s.character_count).toLocaleString()} characters left`;
        }
      }
    } catch { /* quota is optional */ }

    return { status: PASS, label: `API key valid, ${voices.length} voices${quota}` };
  } catch (e) {
    return { status: WARN, label: `could not reach ElevenLabs: ${e.message}`, fix: 'Check network or proxy.' };
  }
}

export function checkAuth() {
  if (!hasAuthState()) {
    return {
      status: FAIL,
      label: 'no saved login session',
      fix: 'npm run auth  (opens a browser, log in by hand)',
    };
  }
  // Report what is stored, but do not try to infer validity from it. Cookie
  // expiry is a bad proxy: this app keeps its session in localStorage, and the
  // only cookie present is a short-lived Cloudflare one that is always "expired"
  // by the time you look. Guessing from it reports a working login as dead.
  // checkSession() below is the check that actually knows.
  try {
    const state = JSON.parse(fs.readFileSync(authStatePath, 'utf8'));
    const cookies = state.cookies?.length ?? 0;
    const stored = (state.origins ?? []).reduce((n, o) => n + (o.localStorage?.length ?? 0), 0);
    if (!cookies && !stored) {
      return { status: FAIL, label: 'session file is empty', fix: 'npm run auth' };
    }
    return { status: PASS, label: `session file present (${cookies} cookies, ${stored} storage entries)` };
  } catch (e) {
    return { status: FAIL, label: `session file unreadable: ${e.message}`, fix: 'npm run auth' };
  }
}

/**
 * The only honest test of a login: navigate and see whether the app bounces us.
 * Same redirect heuristic discover.js uses. Costs a few seconds and no credit.
 */
export async function checkSession(baseUrl) {
  if (!hasAuthState() || !baseUrl) return null;
  let browser;
  try {
    const { chromium } = await import('playwright');
    browser = await chromium.launch({ headless: true });
    const ctx = await browser.newContext({ storageState: authStatePath });
    const page = await ctx.newPage();
    await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
    const landed = page.url();
    return /login|signin|auth/i.test(landed)
      ? { status: FAIL, label: `login expired — redirected to ${landed}`, fix: 'npm run auth' }
      : { status: PASS, label: `logged in (landed on ${landed})` };
  } catch (e) {
    return { status: WARN, label: `could not reach the product: ${e.message.split('\n')[0]}` };
  } finally {
    await browser?.close();
  }
}

export function checkConfig() {
  if (!fs.existsSync('demo.config.json')) {
    return { status: FAIL, label: 'no demo.config.json', fix: 'npm run setup' };
  }
  let cfg;
  try {
    cfg = JSON.parse(fs.readFileSync('demo.config.json', 'utf8'));
  } catch (e) {
    return { status: FAIL, label: `demo.config.json invalid JSON: ${e.message}` };
  }

  const missing = ['name', 'baseUrl', 'voice', 'scenes'].filter(k => !cfg[k]);
  if (missing.length) {
    return { status: FAIL, label: `demo.config.json missing: ${missing.join(', ')}` };
  }

  // The baseUrl having a path is the quiet killer: discover appends routes to
  // it, so a trailing "/login" turns /agents into /login/agents, which most
  // apps silently redirect to a dashboard. You get a full inventory of the
  // wrong page and no error anywhere.
  let url;
  try {
    url = new URL(cfg.baseUrl);
  } catch {
    return { status: FAIL, label: `baseUrl is not a URL: ${cfg.baseUrl}` };
  }
  if (url.pathname !== '/' && url.pathname !== '') {
    return {
      status: FAIL,
      label: `baseUrl has a path: ${cfg.baseUrl}`,
      fix: `Routes are appended to it. Use ${url.origin} and put the path in a scene's goto step.`,
    };
  }

  return { status: PASS, label: `${cfg.scenes.length} scenes, ${url.origin}` };
}

export function checkBrand() {
  const needed = [
    'brand/tokens.json',
    'brand/logo-white-green.svg',
    'brand/bug-green.svg',
    'brand/fonts/HankenGrotesk-latin.woff2',
  ];
  const missing = needed.filter(f => !fs.existsSync(f));
  return missing.length
    ? { status: FAIL, label: `brand assets missing: ${missing.join(', ')}` }
    : { status: PASS, label: 'brand assets present' };
}

async function main() {
  const cfgResult = checkConfig();
  let baseUrl = null;
  try {
    baseUrl = JSON.parse(fs.readFileSync('demo.config.json', 'utf8')).baseUrl;
  } catch { /* checkConfig already reported it */ }

  const live = cfgResult.status === PASS ? await checkSession(baseUrl) : null;

  const groups = [
    ['Environment', [checkNode(), checkBinary('ffmpeg'), checkBinary('ffprobe'), await checkBrowser()]],
    ['Credentials', [await checkApiKey(), checkAuth(), ...(live ? [live] : [])]],
    ['Project', [cfgResult, checkBrand()]],
  ];

  let failed = 0;
  for (const [title, results] of groups) {
    console.log(`\n${title}`);
    for (const r of results) {
      if (r.status === FAIL) failed++;
      console.log(`  ${r.status}  ${r.label}`);
      if (r.fix && r.status !== PASS) console.log(`        → ${r.fix}`);
    }
  }

  console.log(
    failed
      ? `\n${failed} problem${failed > 1 ? 's' : ''} to fix before this will build.\n`
      : '\nAll good. `npm run validate` to check selectors, `npm run build` to render.\n'
  );
  process.exit(failed ? 1 : 0);
}

// Only run when invoked directly, so setup can import the checks.
if (import.meta.url === `file://${process.argv[1]}`) await main();
