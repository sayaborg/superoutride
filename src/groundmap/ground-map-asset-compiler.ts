import { contentDigest } from '../core/content-digest.js';
import { TEXEL_SPACING_TOLERANCE } from '../core/tolerances.js';
import { positiveFinite } from '../core/validation.js';
import { createGroundMapLevelEncoder } from './ground-map-encoding.js';
import type {
  BakedGroundMapChunkMetadata,
  BakedGroundMapLevelMetadata,
  BakedGroundMapMetadata,
  BakedGroundMapPayloadMetadata,
} from './baked-ground-map.js';
import type { GroundMapDensityProfile } from './ground-map-lod.js';
import { downsampleGroundMap2x4 } from './ground-map-prefilter.js';
import type { GroundMapCompileSource } from './ground-map-compile-source.js';

const TEXEL_COUNT_ROUNDING_TOLERANCE = 1e-12;

interface GroundMapCompileStorage {
  /** Append must consume the view before resolving; storage must not retain caller buffers. */
  append(key: string, bytes: Uint8Array): Promise<void>;
  /** Fill exactly the requested view or reject. */
  read(key: string, offsetBytes: number, target: Uint8Array): Promise<void>;
  remove(key: string): Promise<void>;
}

interface GroundMapCompileOptions {
  readonly rowsPerBatch?: number;
  /** Compiler-owned live pixel/encoded buffers; excludes metadata, I/O internals and GC latency. */
  readonly maxWorkingBytes?: number;
}

/**
 * GroundMap offline compiler. Runtime never performs anisotropic filtering.
 * Rasterize once to scratch storage, then filter bounded row batches with unchanged rounding.
 * Payloads are appended in canonical level/row order to storage key 'asset'. Only metadata stays
 * in memory with course length. The caller owns a fresh workspace and cleanup on success/failure.
 */
export async function compileBakedGroundMapAsset(
  source: GroundMapCompileSource,
  density: Pick<GroundMapDensityProfile, 'qL' | 'qS'>,
  kMax: number,
  storage: GroundMapCompileStorage,
  chunkTargetMeters = 32,
  options: GroundMapCompileOptions = {},
): Promise<BakedGroundMapMetadata> {
  const { courseLength, groundLeft, groundRight } = source;
  positiveFinite(courseLength, 'courseLength');
  positiveFinite(groundLeft, 'groundLeft');
  positiveFinite(groundRight, 'groundRight');
  positiveFinite(density.qL, 'qL');
  positiveFinite(density.qS, 'qS');
  positiveFinite(chunkTargetMeters, 'chunkTargetMeters');
  if (!Number.isInteger(kMax) || kMax < 0) throw new RangeError('kMax must be a non-negative integer');
  const rowsPerBatch = options.rowsPerBatch ?? 256;
  const maxWorkingBytes = options.maxWorkingBytes ?? 64 * 1024 * 1024;
  if (!Number.isSafeInteger(rowsPerBatch) || rowsPerBatch < 4 || rowsPerBatch % 4 !== 0)
    throw new RangeError('rowsPerBatch must be a positive multiple of four');
  if (!Number.isSafeInteger(maxWorkingBytes) || maxWorkingBytes <= 0)
    throw new RangeError('maxWorkingBytes must be a positive safe integer');
  const checkWorkingBytes = (bytes: number) => {
    if (!Number.isSafeInteger(bytes) || bytes > maxWorkingBytes)
      throw new RangeError('GroundMap compiler working buffers exceed maxWorkingBytes');
  };

  const lateralWidth = groundLeft + groundRight;
  positiveFinite(lateralWidth, 'ground width');

  const baseLateralTexels = alignUp(Math.ceil(lateralWidth / density.qL - TEXEL_COUNT_ROUNDING_TOLERANCE), 2 ** kMax);
  const baseChainageTexels = alignUp(Math.ceil(courseLength / density.qS - TEXEL_COUNT_ROUNDING_TOLERANCE), 4 ** kMax);
  const actualBaseQL = lateralWidth / baseLateralTexels;
  const actualBaseQS = courseLength / baseChainageTexels;
  if (actualBaseQL > density.qL + TEXEL_SPACING_TOLERANCE || actualBaseQS > density.qS + TEXEL_SPACING_TOLERANCE) {
    throw new Error('aligned GroundMap density became coarser than authority');
  }

  const paletteRgba = await spoolSource();
  const payloads: BakedGroundMapPayloadMetadata[] = [];
  const payloadBuckets = new Map<string, number[]>();
  const levels: BakedGroundMapLevelMetadata[] = [];
  let binaryBytes = 0;
  let uncompressedRgbaBytes = 0;
  await storage.append('asset', new Uint8Array(0));

  for (let k = 0; k <= kMax; k += 1) {
    const lateralTexels = baseLateralTexels / 2 ** k;
    const chainageTexels = baseChainageTexels / 4 ** k;
    const qLActual = lateralWidth / lateralTexels;
    const qSActual = courseLength / chainageTexels;
    const targetRows = Math.max(1, Math.round(chunkTargetMeters / qSActual));
    const format = k === 0 && paletteRgba !== null ? 'palette8' : 'rgb555le';
    const chunks: BakedGroundMapChunkMetadata[] = [];
    uncompressedRgbaBytes += lateralTexels * chainageTexels * 4;

    for (let rowStart = 0; rowStart < chainageTexels; rowStart += targetRows) {
      const rowCount = Math.min(targetRows, chainageTexels - rowStart);
      const texels = lateralTexels * rowCount;
      // Input RGBA + encoded output + digest copy + exact dedup comparison.
      checkWorkingBytes(texels * (4 + 3 * (format === 'palette8' ? 1 : 2)));
      const pixels = new Uint32Array(texels);
      await storage.read(`level-${k}`, rowStart * lateralTexels * 4, byteView(pixels));
      const encoder = createGroundMapLevelEncoder(
        { lateralTexels, chainageTexels: rowCount, pixels },
        k === 0 ? paletteRgba : null,
      );
      const encoded = encoder.encodeRows(0, rowCount);
      const sha256 = await contentDigest(new Uint8Array(encoded));
      const key = `${format}:${lateralTexels}:${rowCount}:${sha256}`;
      const candidates = payloadBuckets.get(key) ?? [];
      let payloadId = -1;
      for (const candidate of candidates) {
        const previous = payloads[candidate]!;
        const comparison = new Uint8Array(encoded.byteLength);
        await storage.read('asset', previous.offsetBytes, comparison);
        if (bytesEqual(comparison, encoded)) {
          payloadId = candidate;
          break;
        }
      }
      if (payloadId < 0) {
        payloadId = payloads.length;
        await storage.append('asset', encoded);
        payloads.push({
          format,
          lateralTexels,
          rowCount,
          offsetBytes: binaryBytes,
          byteLength: encoded.byteLength,
          sha256,
        });
        binaryBytes += encoded.byteLength;
        candidates.push(payloadId);
        payloadBuckets.set(key, candidates);
      }
      chunks.push({ rowStart, rowCount, payloadId });
    }
    levels.push({ level: k, lateralTexels, chainageTexels, qLActual, qSActual, format, chunks });

    if (k < kMax) {
      for (let row = 0; row < chainageTexels; row += rowsPerBatch) {
        const rowCount = Math.min(rowsPerBatch, chainageTexels - row);
        checkWorkingBytes(lateralTexels * rowCount * 4 * (1 + 1 / 8));
        const pixels = new Uint32Array(lateralTexels * rowCount);
        await storage.read(`level-${k}`, row * lateralTexels * 4, byteView(pixels));
        const next = downsampleGroundMap2x4({ lateralTexels, chainageTexels: rowCount, pixels });
        await storage.append(`level-${k + 1}`, byteView(next.pixels));
      }
    }
    await storage.remove(`level-${k}`);
  }

  async function spoolSource(): Promise<number[] | null> {
    checkWorkingBytes(baseLateralTexels * Math.min(rowsPerBatch, baseChainageTexels) * 4);
    const pixels = new Uint32Array(baseLateralTexels * Math.min(rowsPerBatch, baseChainageTexels));
    let colors: Set<number> | null = new Set();
    for (let rowStart = 0; rowStart < baseChainageTexels; rowStart += rowsPerBatch) {
      const rowCount = Math.min(rowsPerBatch, baseChainageTexels - rowStart);
      for (let row = 0; row < rowCount; row += 1) {
        const s = (rowStart + row + 0.5) * actualBaseQS;
        for (let column = 0; column < baseLateralTexels; column += 1) {
          const l = -groundLeft + (column + 0.5) * actualBaseQL;
          const color = source.sample(s, l) >>> 0;
          pixels[row * baseLateralTexels + column] = color;
          if (colors) {
            colors.add(color);
            if (colors.size > 256) colors = null;
          }
        }
      }
      await storage.append('level-0', byteView(pixels.subarray(0, rowCount * baseLateralTexels)));
    }
    return colors ? [...colors].sort((a, b) => a - b) : null;
  }

  const metadata: BakedGroundMapMetadata = {
    version: 1,
    courseLength,
    groundLeft,
    groundRight,
    qLAuthority: density.qL,
    qSAuthority: density.qS,
    actualBaseQL,
    actualBaseQS,
    kMax,
    chunkTargetMeters,
    paletteRgba: paletteRgba ?? [],
    levels,
    payloads,
    binaryBytes,
    uncompressedRgbaBytes,
  };
  return metadata;
}

function byteView(pixels: Uint32Array): Uint8Array {
  return new Uint8Array(pixels.buffer, pixels.byteOffset, pixels.byteLength);
}

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.byteLength !== b.byteLength) return false;
  for (let i = 0; i < a.byteLength; i += 1) if (a[i] !== b[i]) return false;
  return true;
}

function alignUp(value: number, alignment: number): number {
  if (!Number.isSafeInteger(value) || value <= 0 || !Number.isSafeInteger(alignment) || alignment <= 0) {
    throw new RangeError('alignUp requires positive integers');
  }
  return Math.ceil(value / alignment) * alignment;
}
