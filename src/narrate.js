// npm run narrate
// Generates one mp3 per scene from ElevenLabs, measures each with ffprobe,
// and writes build/narration/manifest.json — the timing contract the recorder obeys.
//
// This runs BEFORE recording on purpose. Audio length is fixed once generated;
// browser pacing is elastic. So we let the voice set the clock.
//
// API ref: https://elevenlabs.io/docs/api-reference/text-to-speech/convert

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { requireApiKey, loadConfig } from './config.js';

const API_KEY = requireApiKey();
const config = loadConfig();
const outDir = path.join('build', 'narration');
fs.mkdirSync(outDir, { recursive: true });

const { voiceId, modelId, settings } = config.voice;

function probeDuration(file) {
  const out = execFileSync('ffprobe', [
    '-v', 'error',
    '-show_entries', 'format=duration',
    '-of', 'default=noprint_wrappers=1:nokey=1',
    file,
  ]).toString().trim();
  return parseFloat(out);
}

const manifest = [];
const scenes = config.scenes;

// The cache key covers the voice, not just the line. Keying on text alone means
// changing voiceId leaves every scene "cached" and the old voice silently stays
// in the build — you swap the voice, hear no difference, and blame the voice.
const voiceKey = crypto.createHash('sha1')
  .update(JSON.stringify({ voiceId, modelId, settings }))
  .digest('hex')
  .slice(0, 12);

// Neighbouring lines can be sent as context: not spoken, but they let the model
// carry intonation across the cut instead of resetting its cadence at every
// scene boundary. eleven_v3 rejects the request outright if they are present, so
// it trades that continuity for its own expressiveness.
const supportsContext = !modelId.startsWith('eleven_v3');
if (!supportsContext) {
  console.log(
    `note: ${modelId} does not accept previous_text/next_text, so each line is ` +
    `generated without cross-scene context.\n`
  );
}

for (const [i, scene] of scenes.entries()) {
  const file = path.join(outDir, `${scene.id}.mp3`);

  const previousText = supportsContext && i > 0 ? scenes[i - 1].narration : undefined;
  const nextText = supportsContext && i < scenes.length - 1 ? scenes[i + 1].narration : undefined;

  const keyFile = `${file}.key.json`;
  const key = JSON.stringify({ text: scene.narration, voiceKey, previousText, nextText });
  const cached = fs.existsSync(keyFile) && fs.readFileSync(keyFile, 'utf8') === key;

  if (!cached) {
    const res = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`,
      {
        method: 'POST',
        headers: {
          'xi-api-key': API_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text: scene.narration,
          model_id: modelId,
          voice_settings: settings,
          previous_text: previousText,
          next_text: nextText,
        }),
      }
    );

    if (!res.ok) {
      throw new Error(`ElevenLabs ${res.status} on scene "${scene.id}": ${await res.text()}`);
    }

    fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
    fs.writeFileSync(keyFile, key);
    console.log(`generated  ${scene.id}`);
  } else {
    console.log(`cached     ${scene.id}`);
  }

  const duration = probeDuration(file);

  // Small breath after each line so scenes don't collide.
  manifest.push({ id: scene.id, file, duration, tail: 0.5 });
}

fs.writeFileSync(
  path.join(outDir, 'manifest.json'),
  JSON.stringify(manifest, null, 2)
);

const total = manifest.reduce((a, s) => a + s.duration + s.tail, 0);
console.log(`\nTotal runtime: ${total.toFixed(1)}s across ${manifest.length} scenes`);
