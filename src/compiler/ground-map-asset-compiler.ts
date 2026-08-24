import { rgbaToRgb555 } from '../render/rgb555.js';
import type {
  BakedGroundMapChunkMetadata,
  BakedGroundMapLevelMetadata,
  BakedGroundMapMetadata,
  BakedGroundMapPayloadMetadata,
  BakedGroundMapStorageFormat,
} from '../visual/baked-ground-map.js';
import { sampleGroundMap, type GroundMapProfile } from '../visual/ground-map.js';
import type { GroundMapDensityProfile } from './ground-map-lod.js';
import { buildGroundMapAnisotropicPyramid, type GroundMapTexelLevel } from './ground-map-prefilter.js';

export interface CompiledBakedGroundMapAsset {
  readonly metadata: BakedGroundMapMetadata;
  readonly bytes: Uint8Array;
}

interface PendingPayload {
  readonly format: BakedGroundMapStorageFormat;
  readonly lateralTexels: number;
  readonly rowCount: number;
  readonly bytes: Uint8Array;
  readonly sha256: string;
}

/**
 * M5.7 offline compiler. Runtime never performs anisotropic filtering.
 * The exact open chainage domain is rasterized once at level 0, prefiltered through kMax,
 * then split into bounded row chunks. Identical encoded chunks share one payload.
 */
export async function compileBakedGroundMapAsset(
  courseLength: number,
  profile: GroundMapProfile,
  density: Pick<GroundMapDensityProfile, 'qL' | 'qS'>,
  kMax: number,
  chunkTargetMeters = 32,
): Promise<CompiledBakedGroundMapAsset> {
  validatePositiveFinite(courseLength, 'courseLength');
  validatePositiveFinite(density.qL, 'qL');
  validatePositiveFinite(density.qS, 'qS');
  validatePositiveFinite(chunkTargetMeters, 'chunkTargetMeters');
  if (!Number.isInteger(kMax) || kMax < 0) throw new RangeError('kMax must be a non-negative integer');
  if (!profile.logical) throw new Error('baked GroundMap requires compiler logical profile');

  const lateralWidth = profile.groundLeft + profile.groundRight;
  validatePositiveFinite(lateralWidth, 'ground width');

  const baseLateralTexels = alignUp(Math.ceil(lateralWidth / density.qL - 1e-12), 2 ** kMax);
  const baseChainageTexels = alignUp(Math.ceil(courseLength / density.qS - 1e-12), 4 ** kMax);
  const actualBaseQL = lateralWidth / baseLateralTexels;
  const actualBaseQS = courseLength / baseChainageTexels;
  if (actualBaseQL > density.qL + 1e-12 || actualBaseQS > density.qS + 1e-12) {
    throw new Error('aligned GroundMap density became coarser than authority');
  }

  const basePixels = new Uint32Array(baseLateralTexels * baseChainageTexels);
  for (let row = 0; row < baseChainageTexels; row += 1) {
    const s = (row + 0.5) * actualBaseQS;
    const offset = row * baseLateralTexels;
    for (let column = 0; column < baseLateralTexels; column += 1) {
      const l = -profile.groundLeft + (column + 0.5) * actualBaseQL;
      basePixels[offset + column] = sampleGroundMap(s, l, profile, false);
    }
  }

  const pyramid = buildGroundMapAnisotropicPyramid({
    lateralTexels: baseLateralTexels,
    chainageTexels: baseChainageTexels,
    pixels: basePixels,
  }, kMax);

  const paletteRgba = collectPalette(pyramid[0]!);
  const levelFormats: BakedGroundMapStorageFormat[] = pyramid.map((_, level) => (
    level === 0 && paletteRgba.length <= 256 ? 'palette8' : 'rgb555le'
  ));
  const paletteIndex = new Map<number, number>();
  paletteRgba.forEach((color, index) => paletteIndex.set(color >>> 0, index));

  const pendingPayloads: PendingPayload[] = [];
  const payloadBuckets = new Map<string, number[]>();
  const levels: BakedGroundMapLevelMetadata[] = [];

  for (let k = 0; k < pyramid.length; k += 1) {
    const source = pyramid[k]!;
    const format = levelFormats[k]!;
    const qLActual = lateralWidth / source.lateralTexels;
    const qSActual = courseLength / source.chainageTexels;
    const targetRows = Math.max(1, Math.round(chunkTargetMeters / qSActual));
    const chunks: BakedGroundMapChunkMetadata[] = [];

    for (let rowStart = 0; rowStart < source.chainageTexels; rowStart += targetRows) {
      const rowCount = Math.min(targetRows, source.chainageTexels - rowStart);
      const encoded = encodeRows(source, rowStart, rowCount, format, paletteIndex);
      const sha256 = await sha256Hex(encoded);
      const key = `${format}:${source.lateralTexels}:${rowCount}:${sha256}`;
      const candidates = payloadBuckets.get(key) ?? [];
      let payloadId = -1;
      for (const candidate of candidates) {
        if (bytesEqual(pendingPayloads[candidate]!.bytes, encoded)) {
          payloadId = candidate;
          break;
        }
      }
      if (payloadId < 0) {
        payloadId = pendingPayloads.length;
        pendingPayloads.push({
          format,
          lateralTexels: source.lateralTexels,
          rowCount,
          bytes: encoded,
          sha256,
        });
        candidates.push(payloadId);
        payloadBuckets.set(key, candidates);
      }
      chunks.push({ rowStart, rowCount, payloadId });
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

  let binaryBytes = 0;
  for (const payload of pendingPayloads) binaryBytes += payload.bytes.byteLength;
  const bytes = new Uint8Array(binaryBytes);
  const payloads: BakedGroundMapPayloadMetadata[] = [];
  let offsetBytes = 0;
  for (const payload of pendingPayloads) {
    bytes.set(payload.bytes, offsetBytes);
    payloads.push({
      format: payload.format,
      lateralTexels: payload.lateralTexels,
      rowCount: payload.rowCount,
      offsetBytes,
      byteLength: payload.bytes.byteLength,
      sha256: payload.sha256,
    });
    offsetBytes += payload.bytes.byteLength;
  }

  const uncompressedRgbaBytes = pyramid.reduce((sum, level) => sum + level.pixels.length * 4, 0);
  const metadata: BakedGroundMapMetadata = {
    version: 1,
    courseLength,
    groundLeft: profile.groundLeft,
    groundRight: profile.groundRight,
    qLAuthority: density.qL,
    qSAuthority: density.qS,
    actualBaseQL,
    actualBaseQS,
    kMax,
    chunkTargetMeters,
    paletteRgba,
    levels,
    payloads,
    binaryBytes,
    uncompressedRgbaBytes,
  };
  return { metadata, bytes };
}

function collectPalette(base: GroundMapTexelLevel): number[] {
  const colors = new Set<number>();
  for (const color of base.pixels) {
    colors.add(color >>> 0);
    if (colors.size > 256) return [];
  }
  return [...colors].sort((a, b) => a - b);
}

function encodeRows(
  source: GroundMapTexelLevel,
  rowStart: number,
  rowCount: number,
  format: BakedGroundMapStorageFormat,
  paletteIndex: ReadonlyMap<number, number>,
): Uint8Array {
  const texelCount = source.lateralTexels * rowCount;
  const bytes = new Uint8Array(texelCount * (format === 'palette8' ? 1 : 2));
  let out = 0;
  for (let row = 0; row < rowCount; row += 1) {
    const sourceOffset = (rowStart + row) * source.lateralTexels;
    for (let column = 0; column < source.lateralTexels; column += 1) {
      const color = source.pixels[sourceOffset + column]! >>> 0;
      if (format === 'palette8') {
        const index = paletteIndex.get(color);
        if (index === undefined) throw new Error('level-0 GroundMap color missing from palette');
        bytes[out] = index;
        out += 1;
      } else {
        const packed = rgbaToRgb555(color);
        bytes[out] = packed & 0xff;
        bytes[out + 1] = (packed >>> 8) & 0x7f;
        out += 2;
      }
    }
  }
  return bytes;
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const copy = new Uint8Array(bytes);
  const digest = await crypto.subtle.digest('SHA-256', copy.buffer);
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, '0')).join('');
}

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.byteLength !== b.byteLength) return false;
  for (let i = 0; i < a.byteLength; i += 1) if (a[i] !== b[i]) return false;
  return true;
}

function alignUp(value: number, alignment: number): number {
  if (!Number.isInteger(value) || value <= 0 || !Number.isInteger(alignment) || alignment <= 0) {
    throw new RangeError('alignUp requires positive integers');
  }
  return Math.ceil(value / alignment) * alignment;
}

function validatePositiveFinite(value: number, name: string): void {
  if (!(value > 0) || !Number.isFinite(value)) throw new RangeError(`${name} must be finite and > 0`);
}
