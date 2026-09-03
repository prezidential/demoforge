// npm run compose
// Stitches the per-scene narration into one track, trims Playwright's white
// lead-in, and muxes to an mp4.

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';

const config = JSON.parse(fs.readFileSync('demo.config.json', 'utf8'));
const manifest = JSON.parse(fs.readFileSync('build/narration/manifest.json', 'utf8'));
const { video, headTrim } = JSON.parse(fs.readFileSync('build/cues.json', 'utf8'));

const out = path.join('build', `${config.name}.mp4`);
const voiceTrack = path.join('build', 'voice.wav');

// 1. Concatenate narration with each scene's trailing silence baked in.
//    Same order and same tail values the recorder paced against.
//
//    Each scene is a separate ElevenLabs generation, and separate generations
//    do not agree on loudness — measured across one build the spread was 7 LU,
//    about a doubling in perceived volume between the quietest and loudest
//    line. So match them here before concatenating.
//
//    This is a fixed gain per scene, not a compressor: it moves each line to
//    the same integrated loudness and leaves the performance inside the line
//    untouched. Peaks are handled afterwards by a limiter on the joined track,
//    NOT by capping the gain — capping punishes whichever line happens to have
//    the sharpest transient by leaving it quieter than everything else.
const TARGET_LUFS = -16;   // conventional for web video
const TARGET_TP = -1.5;    // dBFS ceiling

function measure(file) {
  // loudnorm reports on stderr, not stdout.
  const res = spawnSync('ffmpeg', [
    '-hide_banner', '-i', file,
    '-af', `loudnorm=I=${TARGET_LUFS}:TP=${TARGET_TP}:LRA=11:print_format=json`,
    '-f', 'null', '-',
  ], { encoding: 'utf8' });

  const err = res.stderr || '';
  const start = err.lastIndexOf('{');
  const end = err.lastIndexOf('}');
  if (start === -1 || end === -1) {
    throw new Error(`could not measure loudness of ${file}`);
  }
  const m = JSON.parse(err.slice(start, end + 1));
  return { i: parseFloat(m.input_i), tp: parseFloat(m.input_tp) };
}

const inputs = [];
const filters = [];

console.log('Levelling narration:');
manifest.forEach((scene, i) => {
  const { i: lufs, tp } = measure(scene.file);
  const gain = TARGET_LUFS - lufs;

  console.log(
    `  ${scene.id.padEnd(20)} ${lufs.toFixed(1)} LUFS  ${gain >= 0 ? '+' : ''}${gain.toFixed(1)} dB` +
    (tp + gain > TARGET_TP ? '  (peaks limited)' : '')
  );

  inputs.push('-i', scene.file);
  filters.push(`[${i}:a]volume=${gain.toFixed(2)}dB,apad=pad_dur=${scene.tail}[a${i}]`);
});

const concat = manifest.map((_, i) => `[a${i}]`).join('');
const ceiling = Math.pow(10, TARGET_TP / 20);   // dBFS -> linear
filters.push(
  `${concat}concat=n=${manifest.length}:v=0:a=1,` +
  `alimiter=limit=${ceiling.toFixed(4)}:level=false[out]`
);

execFileSync('ffmpeg', [
  '-y',
  ...inputs,
  '-filter_complex', filters.join(';'),
  '-map', '[out]',
  '-ar', '48000',
  voiceTrack,
], { stdio: 'inherit' });

// 2. Trim the lead-in, encode, mux. Video is the shorter of the two in
//    practice, so -shortest keeps them locked.
execFileSync('ffmpeg', [
  '-y',
  '-ss', String(headTrim),
  '-i', video,
  '-i', voiceTrack,
  '-c:v', 'libx264',
  '-preset', 'slow',
  '-crf', '18',
  '-pix_fmt', 'yuv420p',
  '-c:a', 'aac',
  '-b:a', '192k',
  '-shortest',
  '-movflags', '+faststart',
  out,
], { stdio: 'inherit' });

console.log(`\n${out}`);
