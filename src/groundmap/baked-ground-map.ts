import { openProfileChainage } from '../core/open-profile.js';
import { TEXEL_SPACING_TOLERANCE } from '../core/tolerances.js';
import { finite } from '../core/validation.js';
import { rgb555ToRgba } from '../graphics/rgb555.js';
import { selectGroundMapLevel } from './ground-map-lod.js';

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

interface BakedGroundMapSample {
  readonly color: number;
  readonly level: number;
}

export interface BakedGroundMapReader {
  readonly kind: 'baked';
  readonly metadata: BakedGroundMapMetadata;
  readonly kMax: number;
  selectLevel(deltaSEffective: number): number;
  sample(s: number, l: number, deltaSEffective: number): BakedGroundMapSample;
  sampleAtLevel(s: number, l: number, levelIndex: number): number;
  texelCenter(levelIndex: number, row: number, column: number): { s: number; l: number };
}

const RGB555_TO_RGBA = new Uint32Array(0x8000);
for (let i = 0; i < RGB555_TO_RGBA.length; i += 1) RGB555_TO_RGBA[i] = rgb555ToRgba(i);

/** Validated immutable directory shared by resident frame readers without copying it per frame. */
export class BakedGroundMapLayout {
  readonly metadata: BakedGroundMapMetadata;

  constructor(metadata: BakedGroundMapMetadata) {
    validateMetadata(metadata, metadata.binaryBytes);
    this.metadata = Object.freeze({
      ...metadata,
      paletteRgba: Object.freeze([...metadata.paletteRgba]),
      payloads: Object.freeze(metadata.payloads.map((payload) => Object.freeze({ ...payload }))),
      levels: Object.freeze(
        metadata.levels.map((level) =>
          Object.freeze({
            ...level,
            chunks: Object.freeze(level.chunks.map((chunk) => Object.freeze({ ...chunk }))),
          }),
        ),
      ),
    });
    Object.freeze(this);
  }
}

/** Synchronous access to an already resident payload; this boundary must never start I/O. */
interface GroundMapPayloadBytes {
  readByte(payloadId: number, offset: number): number;
}

/**
 * Runtime view of compiler-baked GroundMap chunks over one open chainage domain.
 * No filtering is performed here: runtime only selects one prefiltered level
 * from Delta_s_eff and performs a nearest texel lookup in that level.
 */
export class BakedGroundMapAsset implements BakedGroundMapReader {
  readonly kind = 'baked' as const;
  readonly metadata: BakedGroundMapMetadata;
  readonly #payloadBytes: GroundMapPayloadBytes;

  constructor(metadata: BakedGroundMapMetadata | BakedGroundMapLayout, bytes: Uint8Array | GroundMapPayloadBytes) {
    this.metadata = (metadata instanceof BakedGroundMapLayout ? metadata : new BakedGroundMapLayout(metadata)).metadata;
    if (bytes instanceof Uint8Array && bytes.byteLength !== this.metadata.binaryBytes)
      throw new Error('GroundMap binary byte length mismatch');
    if (bytes instanceof Uint8Array) {
      const owned = Uint8Array.from(bytes);
      this.#payloadBytes = {
        readByte: (id, offset) => owned[this.metadata.payloads[id]!.offsetBytes + offset]!,
      };
    } else {
      this.#payloadBytes = bytes;
    }
  }

  get kMax(): number {
    return this.metadata.kMax;
  }

  /** Shared-pyramid authority remains chainage footprint only. */
  selectLevel(deltaSEffective: number): number {
    return selectGroundMapLevel(deltaSEffective, this.metadata.qSAuthority, this.metadata.kMax);
  }

  sample(s: number, l: number, deltaSEffective: number): BakedGroundMapSample {
    const level = this.selectLevel(deltaSEffective);
    return { color: this.sampleAtLevel(s, l, level), level };
  }

  sampleAtLevel(s: number, l: number, levelIndex: number): number {
    const level = this.metadata.levels[levelIndex];
    if (!level || level.level !== levelIndex) throw new RangeError('GroundMap level outside baked pyramid');

    finite(l, 'baked GroundMap lateral coordinate');
    const row = bakedGroundMapRowIndex(this.metadata, levelIndex, s);
    const lateralWidth = this.metadata.groundLeft + this.metadata.groundRight;
    const normalizedL = (l + this.metadata.groundLeft) / lateralWidth;
    const column = Math.max(0, Math.min(level.lateralTexels - 1, Math.floor(normalizedL * level.lateralTexels)));
    const chunk = findChunk(level.chunks, row);
    const payload = this.metadata.payloads[chunk.payloadId];
    if (!payload) throw new Error('GroundMap chunk references missing payload');
    const localRow = row - chunk.rowStart;
    const texelIndex = localRow * level.lateralTexels + column;

    if (payload.format === 'palette8') {
      const paletteIndex = this.#payloadBytes.readByte(chunk.payloadId, texelIndex);
      if (paletteIndex === undefined) throw new Error('GroundMap palette texel outside payload');
      const color = this.metadata.paletteRgba[paletteIndex];
      if (color === undefined) throw new Error('GroundMap palette index outside palette');
      return color >>> 0;
    }

    const byteOffset = texelIndex * 2;
    const low = this.#payloadBytes.readByte(chunk.payloadId, byteOffset);
    const high = this.#payloadBytes.readByte(chunk.payloadId, byteOffset + 1);
    if (low === undefined || high === undefined) throw new Error('GroundMap RGB555 texel outside payload');
    return RGB555_TO_RGBA[(low | (high << 8)) & 0x7fff]!;
  }

  /** Physical texel center useful for compiler/runtime equivalence tests. */
  texelCenter(levelIndex: number, row: number, column: number): { s: number; l: number } {
    return bakedGroundMapTexelCenter(this.metadata, levelIndex, row, column);
  }
}

/** Row selection shared by frame demand and the synchronous nearest reader, including the open endpoint. */
export function bakedGroundMapRowIndex(metadata: BakedGroundMapMetadata, levelIndex: number, s: number): number {
  const level = metadata.levels[levelIndex];
  if (!Number.isInteger(levelIndex) || !level) throw new RangeError('GroundMap level outside baked pyramid');
  const local = openProfileChainage(s, metadata.courseLength, 'baked GroundMap');
  return local === metadata.courseLength
    ? level.chainageTexels - 1
    : Math.floor((local / metadata.courseLength) * level.chainageTexels);
}

/** One texel metric for source assets and upper-layer virtual windows. */
function bakedGroundMapTexelCenter(
  metadata: BakedGroundMapMetadata,
  levelIndex: number,
  row: number,
  column: number,
): { s: number; l: number } {
  const level = metadata.levels[levelIndex];
  if (!level) throw new RangeError('GroundMap level outside baked pyramid');
  if (
    !Number.isInteger(row) ||
    !Number.isInteger(column) ||
    row < 0 ||
    row >= level.chainageTexels ||
    column < 0 ||
    column >= level.lateralTexels
  ) {
    throw new RangeError('GroundMap texel outside level');
  }
  return {
    s: ((row + 0.5) * metadata.courseLength) / level.chainageTexels,
    l: -metadata.groundLeft + ((column + 0.5) * (metadata.groundLeft + metadata.groundRight)) / level.lateralTexels,
  };
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
  if (
    metadata.actualBaseQL > metadata.qLAuthority + TEXEL_SPACING_TOLERANCE ||
    metadata.actualBaseQS > metadata.qSAuthority + TEXEL_SPACING_TOLERANCE
  ) {
    throw new Error('baked GroundMap base density is coarser than compiler authority');
  }
  if (metadata.binaryBytes !== binaryLength) throw new Error('GroundMap binary byte length mismatch');

  if (!Number.isSafeInteger(binaryLength) || binaryLength <= 0) throw new Error('GroundMap binary length invalid');
  if (
    metadata.paletteRgba.length > 256 ||
    metadata.paletteRgba.some((color) => !Number.isSafeInteger(color) || color < 0 || color > 0xffffffff)
  )
    throw new Error('GroundMap palette invalid');

  for (let k = 0; k < metadata.levels.length; k += 1) {
    const level = metadata.levels[k]!;
    if (level.level !== k) throw new Error('GroundMap levels must be ordered by level index');
    if (
      !Number.isInteger(level.lateralTexels) ||
      level.lateralTexels <= 0 ||
      !Number.isInteger(level.chainageTexels) ||
      level.chainageTexels <= 0
    ) {
      throw new Error('GroundMap level dimensions invalid');
    }
    const width = metadata.groundLeft + metadata.groundRight;
    const expectedQL = width / level.lateralTexels;
    const expectedQS = metadata.courseLength / level.chainageTexels;
    if (
      !Number.isFinite(level.qLActual) ||
      !Number.isFinite(level.qSActual) ||
      Math.abs(level.qLActual - expectedQL) > TEXEL_SPACING_TOLERANCE ||
      Math.abs(level.qSActual - expectedQS) > TEXEL_SPACING_TOLERANCE ||
      (k === 0 &&
        (Math.abs(metadata.actualBaseQL - expectedQL) > TEXEL_SPACING_TOLERANCE ||
          Math.abs(metadata.actualBaseQS - expectedQS) > TEXEL_SPACING_TOLERANCE))
    )
      throw new Error('GroundMap lattice spacing mismatch');
    if (
      k > 0 &&
      (metadata.levels[k - 1]!.lateralTexels !== level.lateralTexels * 2 ||
        metadata.levels[k - 1]!.chainageTexels !== level.chainageTexels * 4)
    )
      throw new Error('GroundMap pyramid dimensions mismatch');
    if (level.format !== 'palette8' && level.format !== 'rgb555le')
      throw new Error('unsupported GroundMap level format');
    if (level.format === 'palette8' && metadata.paletteRgba.length === 0) throw new Error('GroundMap palette is empty');
    let nextRow = 0;
    for (const chunk of level.chunks) {
      if (chunk.rowStart !== nextRow || !Number.isInteger(chunk.rowCount) || chunk.rowCount <= 0) {
        throw new Error('GroundMap chunks must cover rows contiguously');
      }
      if (!Number.isSafeInteger(chunk.payloadId)) throw new Error('GroundMap payload index invalid');
      const payload = metadata.payloads[chunk.payloadId];
      if (
        !payload ||
        payload.format !== level.format ||
        payload.lateralTexels !== level.lateralTexels ||
        payload.rowCount !== chunk.rowCount
      ) {
        throw new Error('GroundMap chunk payload metadata mismatch');
      }
      nextRow += chunk.rowCount;
    }
    if (nextRow !== level.chainageTexels) throw new Error('GroundMap chunks do not cover the complete level');
  }

  for (const payload of metadata.payloads) {
    if (payload.format !== 'palette8' && payload.format !== 'rgb555le') {
      throw new Error('unsupported GroundMap payload format');
    }
    const bytesPerTexel = payload.format === 'palette8' ? 1 : 2;
    if (payload.byteLength !== payload.lateralTexels * payload.rowCount * bytesPerTexel) {
      throw new Error('GroundMap payload byte length mismatch');
    }
    if (
      !Number.isSafeInteger(payload.offsetBytes) ||
      payload.offsetBytes < 0 ||
      payload.offsetBytes + payload.byteLength > binaryLength
    ) {
      throw new Error('GroundMap payload outside binary asset');
    }
  }
}
