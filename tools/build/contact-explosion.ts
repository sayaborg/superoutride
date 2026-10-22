import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { PNG } from 'pngjs';
import { CONTACT_EXPLOSION_PICTURES } from '../../src/content/contact-explosion-pictures.js';
import { createRaster, fillEllipse, sequence } from '../graphics/drawn/raster.js';
import { createNodeContentStore } from './node-content-store.js';
import { writeDrawnSprite } from './drawn-sprite.js';

/** Reproducible provisional game effect: eight 5 m boards and a seeded 1.2 s synthesized AAC recording. */
const content = new URL('../../content/', import.meta.url),
  store = createNodeContentStore();
for (const [frame, name] of CONTACT_EXPLOSION_PICTURES.entries()) {
  const raster = createRaster(200, 200),
    next = sequence(0x79);
  const scale = [0.35, 0.65, 0.9, 1, 0.95, 0.9, 0.75, 0.55][frame]!;
  const colors =
    frame < 5 ? [0x582018, 0xbc3820, 0xf87818, 0xffd040, 0xfff0b0] : [0x282830, 0x484850, 0x707078, 0x909098, 0xb0b0b8];
  for (let lump = 0; lump < 17; lump++) {
    const a = next() * Math.PI * 2,
      reach = 55 * Math.sqrt(next()) * scale;
    const cx = 100 + Math.cos(a) * reach,
      cy = 199 - 82 * scale + Math.sin(a) * reach * 0.7;
    const radius = (24 + next() * 22) * scale;
    for (let layer = 0; layer < colors.length; layer++) {
      const r = radius * (1 - layer * 0.17);
      fillEllipse(raster, cx - layer, cy - layer, r, r, colors[layer]!);
    }
  }
  if (frame === 0) fillEllipse(raster, 100, 178, 28, 21, 0xffffff);
  await writeDrawnSprite(content, store, PNG, name, raster, null);
}

const rate = 48000,
  count = Math.round(rate * 1.2);
const wav = Buffer.alloc(44 + count * 2);
wav.write('RIFF', 0);
wav.writeUInt32LE(wav.length - 8, 4);
wav.write('WAVEfmt ', 8);
wav.writeUInt32LE(16, 16);
wav.writeUInt16LE(1, 20);
wav.writeUInt16LE(1, 22);
wav.writeUInt32LE(rate, 24);
wav.writeUInt32LE(rate * 2, 28);
wav.writeUInt16LE(2, 32);
wav.writeUInt16LE(16, 34);
wav.write('data', 36);
wav.writeUInt32LE(count * 2, 40);
const noise = sequence(0x1978);
let low = 0;
for (let sample = 0; sample < count; sample++) {
  const t = sample / rate,
    envelope = Math.min(1, t / 0.003) * Math.exp(-t * 5) * Math.min(1, (1.2 - t) / 0.08);
  low += 0.12 * (noise() * 2 - 1 - low);
  const tone = Math.sin(2 * Math.PI * (105 * t - 30 * t * t));
  const value = Math.tanh((low * 3 + tone * 0.4) * 1.7) * envelope * 0.85;
  wav.writeInt16LE(Math.round(value * 32767), 44 + sample * 2);
}
const temporary = await mkdtemp(join(tmpdir(), 'superoutride-explosion-'));
try {
  const source = join(temporary, 'explosion.wav');
  await writeFile(source, wav);
  const result = spawnSync(
    'ffmpeg',
    [
      '-y',
      '-loglevel',
      'error',
      '-i',
      source,
      '-map_metadata',
      '-1',
      '-c:a',
      'aac',
      '-b:a',
      '128k',
      '-fflags',
      '+bitexact',
      '-flags:a',
      '+bitexact',
      '-movflags',
      '+faststart',
      new URL('effects/explosion.m4a', content).pathname,
    ],
    { encoding: 'utf8' },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`ffmpeg failed: ${result.stderr}`);
} finally {
  await rm(temporary, { recursive: true, force: true });
}
console.log(JSON.stringify({ pictures: CONTACT_EXPLOSION_PICTURES, audio: 'effects/explosion.m4a' }));
