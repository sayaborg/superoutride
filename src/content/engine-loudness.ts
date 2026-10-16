import {
  AdmissionError,
  admit,
  readArray,
  readDocument,
  readNumber,
  readRecord,
  readString,
  type AdmissionResult,
} from '../core/admission.js';
import { SHA256_TEXT } from '../core/content-digest.js';
import type { CompiledVehicleDefinition } from '../vehicle/definition-document.js';

/**
 * The engine loudness: each vehicle's measured integrated loudness (LUFS) of its exhaust before the soft clip, with
 * the identities it was measured from. Saved under `content/` by the measurement tool and delivered as saved.
 */
export const ENGINE_LOUDNESS_FORMAT = Object.freeze({ format: 'superoutride.engine-loudness', version: 1 } as const);
/** The one engine loudness document's identifier: its file name and manifest ID. */
export const ENGINE_LOUDNESS_ID = 'default';

export interface EngineLoudnessEntry {
  readonly vehicleId: string;
  /** The vehicle's mechanics document's SHA-256. */
  readonly vehicleSha256: string;
  /** Its engine sound document's SHA-256. */
  readonly soundSha256: string;
  readonly lufs: number;
}

export interface EngineLoudnessDocument {
  readonly format: typeof ENGINE_LOUDNESS_FORMAT.format;
  readonly version: typeof ENGINE_LOUDNESS_FORMAT.version;
  /** The measurement procedure's identity. */
  readonly procedureSha256: string;
  /** The audio document's SHA-256. */
  readonly audioSha256: string;
  /** Every catalog vehicle once, in catalog order. */
  readonly vehicles: readonly EngineLoudnessEntry[];
}

/** What a measurement is current for: the audio document and each catalog vehicle's documents, in catalog order. */
export interface EngineLoudnessSources {
  readonly audioSha256: string;
  readonly vehicles: readonly Omit<EngineLoudnessEntry, 'lufs'>[];
}

export function engineLoudnessSources(
  vehicles: readonly CompiledVehicleDefinition[],
  audioSha256: string,
): EngineLoudnessSources {
  return {
    audioSha256,
    vehicles: vehicles.map((vehicle) => ({
      vehicleId: vehicle.compiledVehicle.id,
      vehicleSha256: vehicle.mechanicsSha256,
      soundSha256: vehicle.sound.sha256,
    })),
  };
}

/** Refuse a document measured from other sources: delivery's `invalid_value`; the build passes its stale diagnostic. */
type Mismatch = (path: string, reason: string) => never;
const invalid: Mismatch = (path, reason) => {
  throw new AdmissionError('invalid_value', path, reason);
};

/**
 * Admit an engine loudness document for `sources`: the audio document's identity, and every catalog vehicle once in
 * catalog order with its own identities; `procedureSha256`, when given, is the measurement's. Each mismatch is refused
 * through `mismatch`. Returns each vehicle's loudness by vehicle ID.
 */
export function readEngineLoudness(
  input: unknown,
  sources: EngineLoudnessSources,
  document = '',
  { procedureSha256 = null, mismatch = invalid }: { procedureSha256?: string | null; mismatch?: Mismatch } = {},
): AdmissionResult<ReadonlyMap<string, number>> {
  return admit(document, () => {
    const data = readDocument(
      input,
      ['format', 'version', 'procedureSha256', 'audioSha256', 'vehicles'],
      ENGINE_LOUDNESS_FORMAT.format,
      ENGINE_LOUDNESS_FORMAT.version,
    );
    const procedure = readString(data.procedureSha256, '/procedureSha256', SHA256_TEXT);
    if (procedureSha256 !== null && procedure !== procedureSha256)
      mismatch('/procedureSha256', 'The engine loudness procedure changed since it was measured');
    if (readString(data.audioSha256, '/audioSha256', SHA256_TEXT) !== sources.audioSha256)
      mismatch('/audioSha256', 'The audio document changed since the engine loudness was measured');
    const entries = readArray(data.vehicles, '/vehicles', (item, at) => {
      const entry = readRecord(item, at, ['vehicleId', 'vehicleSha256', 'soundSha256', 'lufs']);
      return { at, entry, vehicleId: readString(entry.vehicleId, `${at}/vehicleId`) };
    });
    if (
      entries.length !== sources.vehicles.length ||
      entries.some(({ vehicleId }, index) => vehicleId !== sources.vehicles[index]!.vehicleId)
    )
      mismatch('/vehicles', `Expected the catalog's vehicles, ${sources.vehicles.map((v) => v.vehicleId).join(', ')}`);
    const loudness = new Map<string, number>();
    entries.forEach(({ at, entry, vehicleId }, index) => {
      const { vehicleSha256, soundSha256 } = sources.vehicles[index]!;
      if (readString(entry.vehicleSha256, `${at}/vehicleSha256`, SHA256_TEXT) !== vehicleSha256)
        mismatch(`${at}/vehicleSha256`, "The vehicle's mechanics changed since its engine loudness was measured");
      if (readString(entry.soundSha256, `${at}/soundSha256`, SHA256_TEXT) !== soundSha256)
        mismatch(`${at}/soundSha256`, "The vehicle's engine sound changed since its engine loudness was measured");
      loudness.set(vehicleId, readNumber(entry.lufs, `${at}/lufs`));
    });
    return loudness;
  });
}
