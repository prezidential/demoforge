// Run once: npm run auth
// Opens a real browser. You log in by hand (SSO, MFA, whatever your product uses).
// Press Enter in the terminal when you're sitting on a logged-in page.
// The session is saved to .auth/state.json and reused by every later recording run.

import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline/promises';

const config = JSON.parse(fs.readFileSync('demo.config.json', 'utf8'));

const browser = await chromium.launch({ headless: false });
const context = await browser.newContext({ viewport: config.viewport });
const page = await context.newPage();

await page.goto(config.auth.loginUrl);

console.log('\n  Log in in the browser window, land on a page inside the app,');
console.log('  then come back here and press Enter.\n');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
await rl.question('');
rl.close();

fs.mkdirSync('.auth', { recursive: true });
await context.storageState({ path: path.join('.auth', 'state.json') });

console.log('Saved .auth/state.json');
await browser.close();
