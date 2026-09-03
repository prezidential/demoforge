// Shared configuration and secrets loading.
//
// Reads .env if present, but never overrides a variable that is already set in
// the environment — so an existing `export ELEVENLABS_API_KEY=...` in a shell
// profile keeps working, and CI can inject secrets without a file on disk.

import fs from 'node:fs';
import path from 'node:path';

const ENV_FILE = '.env';

let loaded = false;

export function loadEnv(file = ENV_FILE) {
  if (loaded) return;
  loaded = true;
  if (!fs.existsSync(file)) return;

  for (const raw of fs.readFileSync(file, 'utf8').split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;

    const eq = line.indexOf('=');
    if (eq === -1) continue;

    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();

    // Strip one layer of matching quotes, so KEY="value with spaces" works.
    if (value.length > 1 && value[0] === value.at(-1) && (value[0] === '"' || value[0] === "'")) {
      value = value.slice(1, -1);
    }

    if (!(key in process.env)) process.env[key] = value;
  }
}

/** Fail with something the reader can act on, rather than a bare throw. */
export function requireApiKey() {
  loadEnv();
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) {
    console.error(
      '\nNo ELEVENLABS_API_KEY found.\n\n' +
      `  Run  npm run setup   to be walked through it, or add it to ${ENV_FILE}:\n` +
      '      ELEVENLABS_API_KEY=sk_...\n\n' +
      '  Get a key at https://elevenlabs.io/app/settings/api-keys\n'
    );
    process.exit(1);
  }
  return key;
}

export function writeEnvValue(key, value, file = ENV_FILE) {
  const line = `${key}=${value}`;
  let lines = fs.existsSync(file)
    ? fs.readFileSync(file, 'utf8').split('\n').filter(Boolean)
    : [];

  const i = lines.findIndex(l => l.startsWith(`${key}=`));
  if (i === -1) lines.push(line);
  else lines[i] = line;

  fs.writeFileSync(file, lines.join('\n') + '\n', { mode: 0o600 });
  fs.chmodSync(file, 0o600);   // in case the file already existed with looser bits
  process.env[key] = value;
}

export function loadConfig(file = 'demo.config.json') {
  if (!fs.existsSync(file)) {
    console.error(
      `\nNo ${file} found.\n\n  Run  npm run setup   to create one.\n`
    );
    process.exit(1);
  }
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    console.error(`\n${file} is not valid JSON: ${e.message}\n`);
    process.exit(1);
  }
}

/** True when the saved Playwright session file exists. */
export const authStatePath = path.join('.auth', 'state.json');
export const hasAuthState = () => fs.existsSync(authStatePath);
