// npm run setup
//
// Guided first run. Takes someone from a fresh clone to a config they can build
// from, without reading any source. Safe to re-run: every step detects what is
// already done and offers to keep it.
//
// Deliberately dependency-free — node:readline/promises only. Adding a prompt
// library to a tool whose whole job is running other people's browsers is not a
// trade worth making.

import fs from 'node:fs';
import readline from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { spawnSync } from 'node:child_process';
import { loadEnv, writeEnvValue } from './config.js';
import { checkNode, checkBinary, checkBrowser } from './doctor.js';

// Created lazily: at module scope the open interface keeps the event loop
// alive, so merely importing this file for its helpers would hang the process.
let rl = null;
let cancelled = false;

function ui() {
  if (!rl) {
    rl = readline.createInterface({ input: stdin, output: stdout });
    // Ctrl-D, or a closed pipe, ends the interface. Every later prompt would
    // then throw ERR_USE_AFTER_CLOSE and dump a stack trace over a half-finished
    // setup. Treat it as what the user meant: cancel, and write nothing.
    rl.on('close', () => { cancelled = true; });
  }
  return rl;
}

function bailIfCancelled() {
  if (!cancelled) return;
  console.log('\n\nSetup cancelled — nothing was written.\n');
  process.exit(130);
}

const B = (s) => `\x1b[1m${s}\x1b[0m`;
const dim = (s) => `\x1b[2m${s}\x1b[0m`;

const hr = () => console.log(dim('─'.repeat(64)));
function heading(n, total, title) {
  console.log(`\n${B(`Step ${n}/${total}`)}  ${B(title)}`);
  hr();
}

async function ask(question, fallback = '') {
  bailIfCancelled();
  const suffix = fallback ? dim(` [${fallback}]`) : '';
  const answer = (await ui().question(`${question}${suffix}: `)).trim();
  bailIfCancelled();
  return answer || fallback;
}

async function confirm(question, defaultYes = true) {
  bailIfCancelled();
  const hint = defaultYes ? 'Y/n' : 'y/N';
  const a = (await ui().question(`${question} ${dim(`(${hint})`)} `)).trim().toLowerCase();
  bailIfCancelled();
  if (!a) return defaultYes;
  return a.startsWith('y');
}

/** Read a line without echoing it, so a pasted key never lands in scrollback. */
function askSecret(question) {
  if (!stdin.isTTY) return ui().question(`${question}: `);
  return new Promise((resolve) => {
    stdout.write(`${question}: `);
    stdin.setRawMode(true);
    stdin.resume();
    let buf = '';
    const onData = (chunk) => {
      const s = chunk.toString('utf8');
      for (const ch of s) {
        if (ch === '\r' || ch === '\n') {
          stdin.setRawMode(false);
          stdin.removeListener('data', onData);
          stdout.write('\n');
          return resolve(buf);
        }
        if (ch === '\u0003') { stdout.write('\n'); process.exit(130); }        // ctrl-c
        if (ch === '\u007f' || ch === '\b') { buf = buf.slice(0, -1); continue; }
        buf += ch;
      }
    };
    stdin.on('data', onData);
  });
}

const run = (cmd, args) => spawnSync(cmd, args, { stdio: 'inherit' }).status === 0;

// ---------------------------------------------------------------------------

async function stepPreflight(n, total) {
  heading(n, total, 'Checking your machine');
  const results = [
    checkNode(),
    checkBinary('ffmpeg'),
    checkBinary('ffprobe'),
    await checkBrowser(),
  ];
  let blocked = false;
  for (const r of results) {
    console.log(`  ${r.status}  ${r.label}`);
    if (r.status === 'FAIL') {
      blocked = true;
      if (r.fix) console.log(`        → ${r.fix}`);
    }
  }
  if (blocked) {
    if (results[3].status === 'FAIL' && await confirm('\nInstall the Playwright browser now?')) {
      run('npx', ['playwright', 'install', 'chromium']);
    } else {
      console.log('\nFix the above, then run `npm run setup` again.\n');
      process.exit(1);
    }
  }
}

async function stepApiKey(n, total) {
  heading(n, total, 'ElevenLabs API key');
  loadEnv();

  if (process.env.ELEVENLABS_API_KEY) {
    const ok = await validateKey(process.env.ELEVENLABS_API_KEY);
    if (ok) {
      console.log(`  ok    existing key works (${ok} voices available)`);
      if (!await confirm('  Replace it?', false)) return;
    } else {
      console.log('  The key currently set is being rejected.');
    }
  }

  console.log(dim('  Create one at https://elevenlabs.io/app/settings/api-keys'));
  console.log(dim('  Input is hidden. It is written to .env, which is gitignored.\n'));

  for (let attempt = 0; attempt < 3; attempt++) {
    const key = (await askSecret('  Paste your API key')).trim();
    if (!key) { console.log('  Nothing entered.'); continue; }
    const voices = await validateKey(key);
    if (voices) {
      writeEnvValue('ELEVENLABS_API_KEY', key);
      console.log(`  ok    key accepted, ${voices} voices available. Saved to .env (0600).`);
      return;
    }
    console.log('  That key was rejected by ElevenLabs. Try again.');
  }
  console.log('\n  Giving up on the key. Re-run `npm run setup` when you have one.\n');
  process.exit(1);
}

/** Returns voice count on success, or null. Uses /v1/voices — see doctor.js. */
async function validateKey(key) {
  try {
    const res = await fetch('https://api.elevenlabs.io/v1/voices', { headers: { 'xi-api-key': key } });
    if (!res.ok) return null;
    const { voices = [] } = await res.json();
    return voices.length;
  } catch {
    return null;
  }
}

const SAMPLE_LINE =
  'Every company is deploying AI agents right now. ' +
  'Very few can say how many they have, or what those agents are allowed to touch.';

async function stepVoice(n, total, existing) {
  heading(n, total, 'Narration voice');

  if (existing?.voiceId && !await confirm(`  Keep the current voice (${existing.voiceId})?`)) {
    // fall through to the picker
  } else if (existing?.voiceId) {
    return existing;
  }

  const res = await fetch('https://api.elevenlabs.io/v1/voices', {
    headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY },
  });
  const { voices = [] } = await res.json();

  // Narration-shaped voices first; everything else is still reachable by ID.
  const good = (v) => ['informative_educational', 'narrative_story', 'conversational']
    .includes(v.labels?.use_case);
  const shortlist = [...voices.filter(good), ...voices.filter(v => !good(v))].slice(0, 12);

  console.log('  Voices suited to narration:\n');
  shortlist.forEach((v, i) => {
    const l = v.labels ?? {};
    const desc = [l.gender, l.age, l.accent, l.use_case].filter(Boolean).join(', ');
    console.log(`   ${String(i + 1).padStart(2)}. ${v.name.slice(0, 34).padEnd(36)} ${dim(desc)}`);
  });

  console.log(dim('\n  Pick a number, or paste any voice ID.'));
  const pick = await ask('  Voice', '1');
  const chosen = /^\d+$/.test(pick) && shortlist[+pick - 1]
    ? shortlist[+pick - 1]
    : { voice_id: pick, name: pick };

  // eleven_v3 is more expressive but rejects the cross-scene context fields and
  // reads slower; multilingual_v2 is the steadier default for stitched narration.
  const useV3 = await confirm('  Use the newer, more expressive eleven_v3 model?', false);
  const modelId = useV3 ? 'eleven_v3' : 'eleven_multilingual_v2';

  const voice = {
    voiceId: chosen.voice_id,
    modelId,
    settings: { stability: 0.5, similarity_boost: 0.75, use_speaker_boost: true },
  };

  if (await confirm(`\n  Generate a sample of ${chosen.name}? ${dim('(~130 characters)')}`, true)) {
    await sampleVoice(voice, chosen.name);
  }
  return voice;
}

async function sampleVoice(voice, name) {
  const dir = 'build/voice-samples';
  fs.mkdirSync(dir, { recursive: true });
  const file = `${dir}/${name.replace(/[^\w-]+/g, '_')}.mp3`;
  try {
    const res = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voice.voiceId}?output_format=mp3_44100_128`,
      {
        method: 'POST',
        headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: SAMPLE_LINE, model_id: voice.modelId, voice_settings: voice.settings }),
      }
    );
    if (!res.ok) {
      console.log(`  Could not generate a sample: ${res.status} ${(await res.text()).slice(0, 120)}`);
      return;
    }
    fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
    console.log(`  Saved ${file}`);
    if (process.platform === 'darwin' && spawnSync('which', ['afplay']).status === 0) {
      if (await confirm('  Play it?')) spawnSync('afplay', [file], { stdio: 'inherit' });
    }
  } catch (e) {
    console.log(`  Could not generate a sample: ${e.message}`);
  }
}

async function stepProduct(n, total, existing) {
  heading(n, total, 'The product you are demoing');

  const name = await ask('  Short name for the video file', existing?.name || 'product-demo');

  let baseUrl = existing?.baseUrl || '';
  for (;;) {
    baseUrl = await ask('  Base URL (scheme and host only)', baseUrl || 'https://app.example.com');
    let url;
    try {
      url = new URL(baseUrl);
    } catch {
      console.log('  That is not a valid URL.');
      continue;
    }
    // Routes get appended to baseUrl. A path here silently turns /agents into
    // /login/agents, which most apps redirect somewhere harmless — so discovery
    // "succeeds" against entirely the wrong page.
    if (url.pathname !== '/' && url.pathname !== '') {
      console.log(`  Drop the path — routes are appended to this. Use ${B(url.origin)}.`);
      baseUrl = url.origin;
      continue;
    }
    baseUrl = url.origin;
    break;
  }
  return { name, baseUrl };
}

async function stepAuth(n, total, baseUrl) {
  heading(n, total, 'Log in to the product');

  if (fs.existsSync('.auth/state.json')) {
    console.log(`  A saved session already exists (for ${baseUrl}).`);
    if (!await confirm('  Log in again?', false)) return;
  }
  console.log(dim('  A browser will open. Log in however the product requires — SSO, MFA,'));
  console.log(dim('  anything — then return here. The session is saved to .auth/, gitignored.\n'));
  if (await confirm('  Open the browser now?')) run('node', ['src/auth.js']);
}

async function stepDiscover(n, total) {
  heading(n, total, 'Inventory the product');
  console.log(dim('  Loads each route logged in as you and records every interactive element'));
  console.log(dim('  with a stability rating, plus a screenshot. This is what Claude reads to'));
  console.log(dim('  write your scenes — without it, selectors are guesswork.\n'));

  const routes = await ask('  Routes to inventory, space separated', '/');
  if (!await confirm(`  Run discovery on: ${routes}?`)) return;
  run('npm', ['run', 'discover', '--', ...routes.split(/\s+/).filter(Boolean)]);
}

export function writeConfig({ name, baseUrl, voice, resetScenes = false }) {
  const file = 'demo.config.json';
  const existing = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null;

  // Never destroy authored scenes. Setup owns identity and voice; the scenes
  // belong to whoever wrote them. The exception is an explicit reset, for when
  // the scenes were written against a different product entirely.
  const scenes = existing?.scenes?.length && !resetScenes
    ? existing.scenes
    : JSON.parse(fs.readFileSync('demo.config.example.json', 'utf8')).scenes;

  const config = {
    name,
    baseUrl,
    viewport: existing?.viewport ?? { width: 1440, height: 900 },
    voice,
    auth: {
      loginUrl: `${baseUrl}/login`,
      note: 'Run `npm run auth` once. It opens a headed browser, you log in by hand, and it saves .auth/state.json. Never commit that file.',
    },
    scenes,
  };

  fs.writeFileSync(file, JSON.stringify(config, null, 2) + '\n');
  return { file, keptScenes: Boolean(existing?.scenes?.length), count: scenes.length };
}

async function main() {
  console.log(`\n${B('demoforge setup')}`);
  console.log(dim('Narrated product demo videos. Ctrl-C to stop; re-run any time.\n'));

  if (!stdin.isTTY) {
    console.log(
      'This is an interactive wizard and needs a terminal.\n\n' +
      '  Run it directly:  npm run setup\n' +
      '  To automate instead, write .env and demo.config.json yourself\n' +
      '  (see .env.example and demo.config.example.json), then: npm run doctor\n'
    );
    process.exit(1);
  }

  const TOTAL = 6;
  const existing = fs.existsSync('demo.config.json')
    ? JSON.parse(fs.readFileSync('demo.config.json', 'utf8'))
    : null;

  await stepPreflight(1, TOTAL);
  await stepApiKey(2, TOTAL);
  const voice = await stepVoice(3, TOTAL, existing?.voice);
  const { name, baseUrl } = await stepProduct(4, TOTAL, existing);

  // Scenes are written against one product's selectors. Pointing setup at a
  // different host means the existing scenes cannot resolve — offer a clean
  // slate rather than leaving someone to discover it at validate time.
  let resetScenes = false;
  const switchedProduct = existing?.baseUrl && existing.baseUrl !== baseUrl && existing.scenes?.length;
  if (switchedProduct) {
    console.log(
      `\n  This config has ${existing.scenes.length} scenes written for ${existing.baseUrl},\n` +
      `  whose selectors will not exist on ${baseUrl}.`
    );
    resetScenes = await confirm('  Replace them with the starter example?', true);
  }

  // Write the config BEFORE auth and discovery. Both read demo.config.json —
  // auth opens config.auth.loginUrl and discover appends routes to baseUrl — so
  // writing afterwards would point them at whatever product the file described
  // previously, and quietly log in to and crawl the wrong app.
  const { file, keptScenes, count } = writeConfig({ name, baseUrl, voice, resetScenes });

  await stepAuth(5, TOTAL, baseUrl);
  await stepDiscover(6, TOTAL);

  console.log(`\n${B('Done.')}`);
  hr();
  console.log(`  Wrote ${file}` + (keptScenes
    ? ` — kept your ${count} existing scenes.`
    : ` with ${count} starter scenes.`));
  console.log(`
  Next:
    ${B('npm run doctor')}      confirm everything is wired up
    Ask Claude for scenes  ${dim('"write me a 90 second demo of X" — it reads build/inventory.json")')}
    ${B('npm run validate')}    check every selector, free and fast
    ${B('npm run build')}       narrate, record, compose
`);
  rl?.close();
}

// Run only when invoked directly, so writeConfig stays importable for tests.
if (import.meta.url === `file://${process.argv[1]}`) await main();
