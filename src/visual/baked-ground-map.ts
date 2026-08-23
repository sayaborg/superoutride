import { selectGroundMapLevel } from '../compiler/ground-map-lod.js';
import { wrapPositive } from '../core/math.js';
import { rgb555ToRgba } from '../render/rgb555.js';

export type BakedGroundMapStorageFormat = 'palette8' | 'rgb555le';

export interface BakedGroundMapChunkMetadata {
  readonly rowStart: number;
  readonly rowCount: number;
  readonly payloadId: number;
}

export interface BakedGroundMapLevelMetadata {
  readonly level: number;
  readonly lateralTexels: number;
  readonly chainageTexels: number;
  readonly qLActual: number;
  readonly qSActual: number;
  readonly format: BakedGroundMapStorageFormat;
  readonly chunks: readonly BakedGroundMapChunkMetadata[];
}

export interface BakedGroundMapPayloadMetadata {
  readonly format: BakedGroundMapStorageFormat;
  readonly lateralTexels: number;
  readonly rowCount: number;
  readonly offsetBytes: number;
  readonly byteLength: number;
  readonly sha256: string;
}

export interface BakedGroundMapMetadata {
  readonly version: 1;
  readonly courseLength: number;
  readonly groundLeft: number;
  readonly groundRight: number;
  readonly qLAuthority: number;
  readonly qSAuthority: number;
  readonly actualBaseQL: number;
  readonly actualBaseQS: number;
  readonly kMax: number;
  readonly chunkTargetMeters: number;
  readonly paletteRgba: readonly number[];
  readonly levels: readonly BakedGroundMapLevelMetadata[];
  readonly payloads: readonly BakedGroundMapPayloadMetadata[];
  readonly binaryBytes: number;
  readonly uncompressedRgbaBytes: number;
}

export interface BakedGroundMapSample {
  readonly color: number;
  readonly level: number;
}

/** One resolved chainage row. Safe to reuse for every lateral pixel in one TerrainLine. */
export interface PreparedBakedGroundMapRow {
  readonly level: number;
  readonly lateralTexels: number;
  readonly format: BakedGroundMapStorageFormat;
  readonly payloadOffsetBytes: number;
  readonly localRow: number;
}

const RGB555_TO_RGBA = new Uint32Array(0x8000);
for (let i = 0; i < RGB555_TO_RGBA.length; i += 1) RGB555_TO_RGBA[i] = rgb555ToRgba(i);

/**
 * Runtime view of compiler-baked GroundMap chunks.
 * No filtering is performed here: runtime only selects one prefiltered level
 * from Delta_s_eff and performs nearest texel reads from the resolved row.
 */
export class BakedGroundMapAsset {
  readonly bytes: Uint8Array;

  constructor(
    readonly metadata: BakedGroundMapMetadata,
    bytes: Uint8Array,
  ) {
    this.bytes = bytes;
    validateMetadata(metadata, bytes.byteLength);
  }

  get kMax(): number {
    return this.metadata.kMax;
  }

  /** Shared-pyramid authority remains chainage footprint only. */
  selectLevel(deltaSEffective: number): number {
    return selectGroundMapLevel(
      deltaSEffective,
      this.metadata.qSAuthority,
      this.metadata.kMax,
    );
  }

  sample(s: number, l: number, deltaSEffective: number): BakedGroundMapSample {
    const level = this.selectLevel(deltaSEffective);
    return { color: this.sampleAtLevel(s, l, level), level };
  }

  /** Resolve cyclic chainage and chunk payload once per TerrainLine. */
  prepareRow(s: number, levelIndex: number): PreparedBakedGroundMapRow {
    const level = this.metadata.levels[levelIndex];
    if (!level || level.level !== levelIndex) throw new RangeError('GroundMap level outside baked pyramid');
    const sLocal = wrapPositive(s, this.metadata.courseLength);
    const row = Math.min(
      level.chainageTexels - 1,
      Math.floor((sLocal / this.metadata.courseLength) * level.chainageTexels),
    );
    const chunk = findChunk(level.chunks, row);
    const payload = this.metadata.payloads[chunk.payloadId];
    if (!payload) throw new Error('GroundMap chunk references missing payload');
    return {
      level: levelIndex,
      lateralTexels: level.lateralTexels,
      format: payload.format,
      payloadOffsetBytes: payload.offsetBytes,
      localRow: row - chunk.rowStart,
    };
  }

  /** Convert a physical lateral coordinate to the continuous source-column coordinate used by the line scaler. */
  lateralToSourceColumn(levelIndex: number, l: number): number {
    const level = this.metadata.levels[levelIndex];
    if (!level) throw new RangeError('GroundMap level outside baked pyramid');
    const lateralWidth = this.metadata.groundLeft + this.metadata.groundRight;
    return ((l + this.metadata.groundLeft) / lateralWidth) * level.lateralTexels;
  }

  /** Read one column from a row already resolved for the TerrainLine. */
  samplePreparedColumn(row: PreparedBakedGroundMapRow, sourceColumn: number): number {
    const column = Math.max(0, Math.min(row.lateralTexels - 1, Math.floor(sourceColumn)));
    const texelIndex = row.localRow * row.lateralTexels + column;
    if (row.format === 'palette8') {
      const paletteIndex = this.bytes[row.payloadOffsetBytes + texelIndex];
      if (paletteIndex === undefined) throw new Error('GroundMap palette texel outside payload');
      const color = this.metadata.paletteRgba[paletteIndex];
      if (color === undefined) throw new Error('GroundMap palette index outside palette');
      return color >>> 0;
    }

    const byteOffset = row.payloadOffsetBytes + texelIndex * 2;
    const low = this.bytes[byteOffset];
    const high = this.bytes[byteOffset + 1];
    if (low === undefined || high === undefined) throw new Error('GroundMap RGB555 texel outside payload');
    return RGB555_TO_RGBA[(low | (high << 8)) & 0x7fff]!;
  }

  sampleAtLevel(s: number, l: number, levelIndex: number): number {
    const row = this.prepareRow(s, levelIndex);
    return this.samplePreparedColumn(row, this.lateralToSourceColumn(levelIndex, l));
  }

  /** Physical texel center useful for compiler/runtime equivalence tests. */
  texelCenter(levelIndex: number, row: number, column: number): { s: number; l: number } {
    const level = this.metadata.levels[levelIndex];
    if (!level) throw new RangeError('GroundMap level outside baked pyramid');
    if (row < 0 || row >= level.chainageTexels || column < 0 || column >= level.lateralTexels) {
      throw new RangeError('GroundMap texel outside level');
    }
    return {
      s: (row + 0.5) * this.metadata.courseLength / level.chainageTexels,
      l: -this.metadata.groundLeft
        + (column + 0.5) * (this.metadata.groundLeft + this.metadata.groundRight) / level.lateralTexels,
    };
  }
}

export async function loadM5BakedGroundMap(): Promise<BakedGroundMapAsset> {
  const metadataUrl = new URL('../assets/m5-ground-map.json', import.meta.url);
  const binaryUrl = new URL('../assets/m5-ground-map.bin', import.meta.url);
  const [metadataResponse, binaryResponse] = await Promise.all([
    fetch(metadataUrl),
    fetch(binaryUrl),
  ]);
  if (!metadataResponse.ok) throw new Error(`failed to load GroundMap metadata: ${metadataResponse.status}`);
  if (!binaryResponse.ok) throw new Error(`failed to load GroundMap binary: ${binaryResponse.status}`);
  const metadata = await metadataResponse.json() as BakedGroundMapMetadata;
  const bytes = new Uint8Array(await binaryResponse.arrayBuffer());
  return new BakedGroundMapAsset(metadata, bytes);
}

function findChunk(chunks: readonly BakedGroundMapChunkMetadata[], row: number): BakedGroundMapChunkMetadata {
  let low = 0;
  let high = chunks.length - 1;
  while (low <= high) {
    const mid = (low + high) >> 1;
    const chunk = chunks[mid]!;
    if (row < chunk.rowStart) high = mid - 1;
    else if (row >= chunk.rowStart + chunk.rowCount) low = mid + 1;
    else return chunk;
  }
  throw new Error('GroundMap row is not covered by a baked chunk');
}

function validateMetadata(metadata: BakedGroundMapMetadata, binaryLength: number): void {
  if (metadata.version !== 1) throw new Error('unsupported GroundMap asset version');
  for (const [name, value] of [
    ['courseLength', metadata.courseLength],
    ['groundLeft', metadata.groundLeft],
    ['groundRight', metadata.groundRight],
    ['qLAuthority', metadata.qLAuthority],
    ['qSAuthority', metadata.qSAuthority],
    ['actualBaseQL', metadata.actualBaseQL],
    ['actualBaseQS', metadata.actualBaseQS],
    ['chunkTargetMeters', metadata.chunkTargetMeters],
  ] as const) {
    if (!(value > 0) || !Number.isFinite(value)) throw new RangeError(`${name} must be finite and > 0`);
  }
  if (!Number.isInteger(metadata.kMax) || metadata.kMax < 0) throw new RangeError('GroundMap kMax invalid');
  if (metadata.levels.length !== metadata.kMax + 1) throw new Error('GroundMap level count must equal kMax+1');
  if (metadata.actualBaseQL > metadata.qLAuthority + 1e-12 || metadata.actualBaseQS > metadata.qSAuthority + 1e-12) {
    throw new Error('baked GroundMap base density is coarser than compiler authority');
  }
  if (metadata.binaryBytes !== binaryLength) throw new Error('GroundMap binary byte length mismatch');

  for (let k = 0; k < metadata.levels.length; k += 1) {
    const level = metadata.levels[k]!;
    if (level.level !== k) throw new Error('GroundMap levels must be ordered by level index');
    if (!Number.isInteger(level.lateralTexels) || level.lateralTexels <= 0
      || !Number.isInteger(level.chainageTexels) || level.chainageTexels <= 0) {
      throw new Error('GroundMap level dimensions invalid');
    }
    let nextRow = 0;
    for (const chunk of level.chunks) {
      if (chunk.rowStart !== nextRow || !Number.isInteger(chunk.rowCount) || chunk.rowCount <= 0) {
        throw new Error('GroundMap chunks must cover rows contiguously');
      }
      const payload = metadata.payloads[chunk.payloadId];
      if (!payload
        || payload.format !== level.format
        || payload.lateralTexels !== level.lateralTexels
        || payload.rowCount !== chunk.rowCount) {
        throw new Error('GroundMap chunk payload metadata mismatch');
      }
      nextRow += chunk.rowCount;
    }
    if (nextRow !== level.chainageTexels) throw new Error('GroundMap chunks do not cover the complete level');
  }

  for (const payload of metadata.payloads) {
    const bytesPerTexel = payload.format === 'palette8' ? 1 : 2;
    if (payload.byteLength !== payload.lateralTexels * payload.rowCount * bytesPerTexel) {
      throw new Error('GroundMap payload byte length mismatch');
    }
    if (payload.offsetBytes < 0 || payload.offsetBytes + payload.byteLength > binaryLength) {
      throw new Error('GroundMap payload outside binary asset');
    }
  }
}
