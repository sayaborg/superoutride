import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { compileSurfaceRegions } from '../dist/compiler/surface-region-compiler.js';
import { deriveGroundMapDensity } from '../dist/compiler/ground-map-lod.js';
import { buildGroundMapAnisotropicPyramid } from '../dist/compiler/ground-map-prefilter.js';
import { createM2StadiumGuide } from '../dist/core/debug-course.js';
import { createM5DebugSurfaceRegionAuthoring } from '../dist/dev/m5-surface-authoring.js';
import { rgbaToRgb555 } from '../dist/render/rgb555.js';
import { GROUND_COLORS, sampleGroundMap } from '../dist/visual/ground-map.js';

const K_MAX = 6;
const FOCAL_LENGTH = 200;
const D0 = 5;
const CAMERA_HEIGHT = 2.469902425419539;
const PITCH = 8 * Math.PI / 180;
const GROUND_LEFT = 12;
const GROUND_RIGHT = 12;
const ROAD_LEFT = 4.5;
const ROAD_RIGHT = 4.5;
const SHOULDER_WIDTH = 1;
const CHUNK_TARGET_METERS = 64;

const PALETTE = [
  GROUND_COLORS.grassA,
  GROUND_COLORS.grassB,
  GROUND_COLORS.rockA,
  GROUND_COLORS.rockB,
  GROUND_COLORS.shoulder,
  GROUND_COLORS.asphaltA,
  GROUND_COLORS.asphaltB,
  GROUND_COLORS.marking,
].map((value) => value >>> 0);
const paletteIndex = new Map(PALETTE.map((value, index) => [value, index]));

const guide = createM2StadiumGuide();
const courseLength = guide.length;
const compiledSurfaces = compileSurfaceRegions(
  courseLength,
  createM5DebugSurfaceRegionAuthoring(courseLength),
);
const groundProfile = {
  groundLeft: GROUND_LEFT,
  groundRight: GROUND_RIGHT,
  roadLeft: ROAD_LEFT,
  roadRight: ROAD_RIGHT,
  shoulderWidth: SHOULDER_WIDTH,
  logical: compiledSurfaces.groundMap,
};
const density = deriveGroundMapDensity({
  d0: D0,
  focalLength: FOCAL_LENGTH,
  cameraHeight: CAMERA_HEIGHT,
  pitchRadians: PITCH,
});

const lateralDivisor = 2 ** K_MAX;
const chainageDivisor = 4 ** K_MAX;
const lateralWidth = GROUND_LEFT + GROUND_RIGHT;
const minimumLateralTexels = Math.ceil(lateralWidth / density.qL - 1e-9);
const minimumChainageTexels = Math.ceil(courseLength / density.qS - 1e-9);
const lateralTexels = ceilToMultiple(minimumLateralTexels, lateralDivisor);
const chainageTexels = ceilToMultiple(minimumChainageTexels, chainageDivisor);
const actualBaseQL = lateralWidth / lateralTexels;
const actualBaseQS = courseLength / chainageTexels;

if (actualBaseQL > density.qL + 1e-12 || actualBaseQS > density.qS + 1e-12) {
  throw new Error('baked GroundMap grid became coarser than M5.4 density authority');
}

const basePixels = new Uint32Array(lateralTexels * chainageTexels);
for (let row = 0; row < chainageTexels; row += 1) {
  const s = (row + 0.5) * actualBaseQS;
  const rowOffset = row * lateralTexels;
  for (let column = 0; column < lateralTexels; column += 1) {
    const l = -GROUND_LEFT + (column + 0.5) * actualBaseQL;
    basePixels[rowOffset + column] = sampleGroundMap(s, l, groundProfile);
  }
}

const pyramid = buildGroundMapAnisotropicPyramid({
  lateralTexels,
  chainageTexels,
  pixels: basePixels,
}, K_MAX);

const payloads = [];
const payloadBuffers = [];
const payloadByKey = new Map();
const levels = [];
let binaryBytes = 0;
let logicalChunkCount = 0;

for (let k = 0; k <= K_MAX; k += 1) {
  const source = pyramid[k];
  if (!source) throw new Error(`missing GroundMap level ${k}`);
  const qLActual = lateralWidth / source.lateralTexels;
  const qSActual = courseLength / source.chainageTexels;
  const rowsPerChunk = Math.max(1, Math.floor(CHUNK_TARGET_METERS / qSActual));
  const format = k === 0 ? 'palette8' : 'rgb555le';
  const chunks = [];

  for (let rowStart = 0; rowStart < source.chainageTexels; rowStart += rowsPerChunk) {
    const rowCount = Math.min(rowsPerChunk, source.chainageTexels - rowStart);
    const bytes = encodeRows(source, rowStart, rowCount, format);
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    const key = `${format}:${source.lateralTexels}:${rowCount}:${sha256}`;
    let payloadId = payloadByKey.get(key);
    if (payloadId === undefined) {
      payloadId = payloads.length;
      payloadByKey.set(key, payloadId);
      payloads.push({
        format,
        lateralTexels: source.lateralTexels,
        rowCount,
        offsetBytes: binaryBytes,
        byteLength: bytes.byteLength,
        sha256,
      });
      payloadBuffers.push(Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength));
      binaryBytes += bytes.byteLength;
    }
    chunks.push({ rowStart, rowCount, payloadId });
    logicalChunkCount += 1;
  }

  levels.push({
    level: k,
    lateralTexels: source.lateralTexels,
    chainageTexels: source.chainageTexels,
    qLActual,
    qSActual,
    format,
    chunks,
  });
}

const uncompressedRgbaBytes = pyramid.reduce((sum, level) => sum + level.pixels.length * 4, 0);
const metadata = {
  version: 1,
  courseLength,
  groundLeft: GROUND_LEFT,
  groundRight: GROUND_RIGHT,
  qLAuthority: density.qL,
  qSAuthority: density.qS,
  actualBaseQL,
  actualBaseQS,
  kMax: K_MAX,
  chunkTargetMeters: CHUNK_TARGET_METERS,
  paletteRgba: PALETTE,
  levels,
  payloads,
  binaryBytes,
  uncompressedRgbaBytes,
};

const scriptDir = dirname(fileURLToPath(import.meta.url));
const outputDir = resolve(scriptDir, '../dist/assets');
await mkdir(outputDir, { recursive: true });
await writeFile(resolve(outputDir, 'm5-ground-map.bin'), Buffer.concat(payloadBuffers));
await writeFile(resolve(outputDir, 'm5-ground-map.json'), `${JSON.stringify(metadata)}\n`, 'utf8');

console.log('M5.7 BAKED GROUNDMAP', JSON.stringify({
  courseLength,
  lateralTexels,
  chainageTexels,
  actualBaseQL,
  actualBaseQS,
  kMax: K_MAX,
  logicalChunkCount,
  uniquePayloadCount: payloads.length,
  binaryBytes,
  uncompressedRgbaBytes,
  storageRatio: binaryBytes / uncompressedRgbaBytes,
}));

function encodeRows(source, rowStart, rowCount, format) {
  const texelCount = source.lateralTexels * rowCount;
  if (format === 'palette8') {
    const bytes = new Uint8Array(texelCount);
    let out = 0;
    for (let row = 0; row < rowCount; row += 1) {
      const sourceOffset = (rowStart + row) * source.lateralTexels;
      for (let column = 0; column < source.lateralTexels; column += 1) {
        const color = source.pixels[sourceOffset + column] >>> 0;
        const index = paletteIndex.get(color);
        if (index === undefined) throw new Error(`level-0 GroundMap color ${color} is outside baked palette`);
        bytes[out] = index;
        out += 1;
      }
    }
    return bytes;
  }

  const bytes = new Uint8Array(texelCount * 2);
  let out = 0;
  for (let row = 0; row < rowCount; row += 1) {
    const sourceOffset = (rowStart + row) * source.lateralTexels;
    for (let column = 0; column < source.lateralTexels; column += 1) {
      const rgb555 = rgbaToRgb555(source.pixels[sourceOffset + column]);
      bytes[out] = rgb555 & 0xff;
      bytes[out + 1] = (rgb555 >>> 8) & 0xff;
      out += 2;
    }
  }
  return bytes;
}

function ceilToMultiple(value, divisor) {
  return Math.ceil(value / divisor) * divisor;
}
