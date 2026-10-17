import type { SpriteAssets } from './vehicle-sprite-library.js';
import { HUD_PICTURES, TEXT_CHARACTERS, type HudPicture } from '../image/text-tiles.js';
import { spriteSetColors, spriteSetHasColor, type VehicleSpriteSet } from './vehicle-sprite-set.js';
import { compileVehicle, type VehicleDefinition, type CompiledVehicle } from './physics/vehicle-definitions.js';
import { compileDriving } from './physics/compiled-driving.js';
import type { TireCharacteristics } from './physics/tire-friction-calibration.js';
import {
  AdmissionError,
  admit,
  admitDomain,
  deepFreeze,
  readArray,
  readBoolean,
  readDictionary,
  readDocument,
  readNumber,
  readRecord,
  readString,
  relativePointer,
  requireAdmission,
  type AdmissionResult,
} from '../core/admission.js';
import { DRIVING_DOCUMENT_FORMAT, DRIVING_DOCUMENT_VERSION, type DrivingDocument } from './driving-definition.js';
import type { SteeringReference } from './steering-rule.js';
import type { CompiledDrivingDefinition } from './compiled-driving-definition.js';
import type { CompiledEngineSound } from '../audio/engine-sound.js';
import type { EngineSoundCatalog } from '../audio/engine-sound-document.js';
import { compileVehicleEngineSound, type VehicleEngineSound } from '../audio/vehicle-engine-sound.js';

export type VehicleForm = 'car' | 'bike';
/** The longest engine label, which SELECT VEHICLE shows before the displacement. */
const ENGINE_LABEL_LENGTH = 5;
/** The longest color display name: SELECT VEHICLE's color line, `^ NAME n/N v`, fits columns 1–21. */
const COLOR_NAME_LENGTH = 13;
const COLOR_NAME = new RegExp(`^[A-Z0-9 .'&/-]{1,${COLOR_NAME_LENGTH}}$`);
/** The longest word of a listed period, market or specification: SELECT VEHICLE wraps them by words to this width. */
export const LISTING_LINE_LENGTH = 14;
/** SELECT VEHICLE's name line, manufacturer and model, fits columns 1–39. */
const NAME_LINE_LENGTH = 39;
/**
 * SELECT VEHICLE's model year line, the year, two spaces and the official label, fits columns 1–20, left of the
 * page's headings.
 */
const YEAR_LINE_LENGTH = 20;
/** A listed period's, market's or specification's words: the text broken at spaces and after each slash. */
export function listingWords(value: string): string[] {
  return value.split(/ +|(?<=\/)/).filter((word) => word.length > 0);
}
export interface VehicleMetadata {
  readonly manufacturer: string;
  readonly model: string;
  readonly identifier: Readonly<{ officialLabel: string; shortLabel: string }> | null;
  readonly selectedSpecification: readonly string[];
  readonly period: string;
  readonly physicsAnchor: Readonly<{ modelYear: string; market: string }>;
  readonly mobileLabel: string;
  /** The engine's layout and cylinders in at most five characters, such as F12 or V8. */
  readonly engine: string;
}
export const VEHICLE_MECHANICS_FORMAT = 'superoutride.vehicle-mechanics';
export const VEHICLE_MECHANICS_VERSION = 5;
export const VEHICLE_LISTING_FORMAT = 'superoutride.vehicle-listing';
export const VEHICLE_LISTING_VERSION = 5;
/** The mechanics document: the vehicle's physical description, the values physics reads and its dimensions. */
export interface VehicleMechanicsDocument extends Omit<VehicleDefinition, 'id'> {
  readonly format: typeof VEHICLE_MECHANICS_FORMAT;
  readonly version: typeof VEHICLE_MECHANICS_VERSION;
}
/** The listing document: how a vehicle is named, ordered, drawn, heard and shown on the HUD. */
export interface VehicleListingDocument {
  readonly format: typeof VEHICLE_LISTING_FORMAT;
  readonly version: typeof VEHICLE_LISTING_VERSION;
  readonly form: VehicleForm;
  readonly selectionOrder: number;
  readonly visuals: Readonly<{
    spriteSet: string;
    palette: string;
    steeringPicture: string;
    /** Each color's display name, its period paint name, by color ID: presentation only. */
    colorNames: Readonly<Record<string, string>>;
  }>;
  readonly sound: string;
  readonly metadata: VehicleMetadata;
}
export interface CompiledVehicleMechanics {
  readonly source: VehicleMechanicsDocument;
  /** SHA-256 of the delivered document, supplied by its catalog; null for a document outside delivery. */
  readonly sha256: string | null;
  readonly compiledVehicle: CompiledVehicle;
}
/**
 * An admitted listing: its document, which holds every listed fact, and what its sprite set, steering picture and
 * sound IDs name.
 */
export interface CompiledVehicleListing {
  readonly source: VehicleListingDocument;
  readonly spriteSet: VehicleSpriteSet;
  readonly steeringPicture: HudPicture;
  readonly sound: CompiledEngineSound;
}
/**
 * One vehicle: its mechanics and listing documents, paired by identifier in the catalog, each fact published once. The
 * documents hold the authored facts (form and metadata are read from `listing`); `compiledVehicle`, `spriteSet` and
 * `steeringPicture` are what the mechanics compile to and what the listing's IDs name, and `sound` is the listing's
 * engine sound as this vehicle's engine sounds it.
 */
export interface CompiledVehicleDefinition {
  readonly mechanics: VehicleMechanicsDocument;
  /** The delivered mechanics document's SHA-256; null for a DEV-tuned one. */
  readonly mechanicsSha256: string | null;
  readonly listing: VehicleListingDocument;
  readonly spriteSet: VehicleSpriteSet;
  readonly steeringPicture: HudPicture;
  readonly compiledVehicle: CompiledVehicle;
  readonly sound: VehicleEngineSound;
}
const mechanicalNumbers = [
  'overallLength',
  'overallWidth',
  'overallHeight',
  'frontTrack',
  'rearTrack',
  'mass',
  'yawInertia',
  'pitchInertia',
  'frontAxle',
  'rearAxle',
  'desiredCgHeight',
  'frontRideFrequency',
  'rearRideFrequency',
  'frontDampingRatio',
  'rearDampingRatio',
  'frontQTravel',
  'rearQTravel',
  'frontWheelRadius',
  'rearWheelRadius',
  'frontWheelInertia',
  'rearWheelInertia',
  'frontDriveTorqueFraction',
  'frontBrakeTorqueMax',
  'rearBrakeTorqueMax',
  'quadraticDrag',
] as const;
const powertrainNumbers = [
  'displacementCc',
  'cycle',
  'compressionRatio',
  'idleRpm',
  'redlineRpm',
  'finalDriveRatio',
] as const;

/** The catalog supplies the vehicle's identifier (its file name and manifest ID) and delivered SHA-256. */
export function compileVehicleMechanicsDocument(
  value: unknown,
  id: string,
  document: string,
  sha256: string | null,
): AdmissionResult<CompiledVehicleMechanics> {
  return admit(document, () => {
    // A vehicle's own wheel-slip choice and tire are optional; the driving definition's serve a vehicle without them.
    const own = (['wheelSlip', 'tire'] as const).filter(
      (key) => typeof value === 'object' && value !== null && Object.hasOwn(value, key),
    );
    const v = readDocument(
      value,
      ['format', 'version', ...mechanicalNumbers, ...own, 'powertrain'],
      VEHICLE_MECHANICS_FORMAT,
      VEHICLE_MECHANICS_VERSION,
    );
    const mechanics = Object.fromEntries(mechanicalNumbers.map((key) => [key, readNumber(v[key], `/${key}`)]));
    const owned = {
      ...(own.includes('wheelSlip') ? { wheelSlip: readBoolean(v.wheelSlip, '/wheelSlip') } : {}),
      ...(own.includes('tire') ? { tire: readTire(v.tire, '/tire') } : {}),
    };
    const p = readRecord(v.powertrain, '/powertrain', [...powertrainNumbers, 'gearRatios', 'torqueCurve']);
    const powertrain = {
      ...Object.fromEntries(powertrainNumbers.map((key) => [key, readNumber(p[key], `/powertrain/${key}`)])),
      gearRatios: readArray(p.gearRatios, '/powertrain/gearRatios', (x, at) => readNumber(x, at)),
      torqueCurve: readArray(p.torqueCurve, '/powertrain/torqueCurve', (x, path) => {
        const point = readRecord(x, path, ['rpm', 'torqueNewtonMeters']);
        return {
          rpm: readNumber(point.rpm, path + '/rpm'),
          torqueNewtonMeters: readNumber(point.torqueNewtonMeters, path + '/torqueNewtonMeters'),
        };
      }),
    };
    const definition = { ...mechanics, ...owned, powertrain } as unknown as Omit<VehicleDefinition, 'id'>;
    const source: VehicleMechanicsDocument = deepFreeze({
      format: VEHICLE_MECHANICS_FORMAT,
      version: VEHICLE_MECHANICS_VERSION,
      ...definition,
    });
    const compiledVehicle = admitDomain(
      () => compileVehicle({ id, ...definition }),
      // The catalog supplies an admitted identifier; its failure would locate the document root.
      (path) => (path === 'id' ? '' : relativePointer(path)),
    );
    return Object.freeze({ source, sha256, compiledVehicle });
  });
}

/** A listing resolves its sprite set, default color and sound against their admitted catalogs. */
export function compileVehicleListingDocument(
  value: unknown,
  document: string,
  sprites: SpriteAssets,
  sounds: EngineSoundCatalog,
): AdmissionResult<CompiledVehicleListing> {
  return admit(document, () => {
    const v = readDocument(
      value,
      ['format', 'version', 'form', 'selectionOrder', 'visuals', 'sound', 'metadata'],
      VEHICLE_LISTING_FORMAT,
      VEHICLE_LISTING_VERSION,
    );
    requireAdmission(v.form === 'car' || v.form === 'bike', 'invalid_value', '/form', 'Expected car or bike');
    const selectionOrder = readNumber(v.selectionOrder, '/selectionOrder');
    requireAdmission(
      Number.isSafeInteger(selectionOrder) && selectionOrder > 0,
      'invalid_value',
      '/selectionOrder',
      'Expected a positive safe integer',
    );
    const strings = ['manufacturer', 'model', 'mobileLabel', 'engine'] as const;
    const meta = readRecord(v.metadata, '/metadata', [
      ...strings,
      'period',
      'identifier',
      'selectedSpecification',
      'physicsAnchor',
    ]);
    // Every metadata string is text the text tiles draw.
    const drawable = (value: unknown, path: string) =>
      readString(value, path, {
        pattern: TEXT_CHARACTERS,
        patternMessage: 'Expected characters the text tiles draw',
      });
    // A listed text SELECT VEHICLE wraps by words: none longer than the line.
    const listed = (value: unknown, path: string) => {
      const text = drawable(value, path);
      requireAdmission(
        listingWords(text).every((word) => word.length <= LISTING_LINE_LENGTH),
        'invalid_value',
        path,
        `Expected words of at most ${LISTING_LINE_LENGTH} characters`,
      );
      return text;
    };
    const named = (value: unknown, path: string, keys: readonly string[]) => {
      const record = readRecord(value, path, keys);
      return Object.fromEntries(keys.map((key) => [key, drawable(record[key], `${path}/${key}`)]));
    };
    const anchor = named(meta.physicsAnchor, '/metadata/physicsAnchor', ['modelYear', 'market']);
    listed(anchor.market, '/metadata/physicsAnchor/market');
    const metadata = {
      ...Object.fromEntries(strings.map((key) => [key, drawable(meta[key], `/metadata/${key}`)])),
      period: listed(meta.period, '/metadata/period'),
      identifier:
        meta.identifier === null
          ? null
          : named(meta.identifier, '/metadata/identifier', ['officialLabel', 'shortLabel']),
      selectedSpecification: readArray(meta.selectedSpecification, '/metadata/selectedSpecification', listed),
      physicsAnchor: anchor,
    } as unknown as VehicleMetadata;
    requireAdmission(
      metadata.engine.length > 0 && metadata.engine.length <= ENGINE_LABEL_LENGTH,
      'invalid_value',
      '/metadata/engine',
      `Expected 1 to ${ENGINE_LABEL_LENGTH} characters`,
    );
    requireAdmission(
      `${metadata.manufacturer} ${metadata.model}`.length <= NAME_LINE_LENGTH,
      'invalid_value',
      '/metadata/model',
      `Expected manufacturer and model of at most ${NAME_LINE_LENGTH} characters with the space between`,
    );
    requireAdmission(
      `${metadata.physicsAnchor.modelYear}  ${metadata.identifier?.officialLabel ?? ''}`.trimEnd().length <=
        YEAR_LINE_LENGTH,
      'invalid_value',
      metadata.identifier ? '/metadata/identifier/officialLabel' : '/metadata/physicsAnchor/modelYear',
      `Expected the model year, two spaces and the official label in at most ${YEAR_LINE_LENGTH} characters`,
    );
    const visual = readRecord(v.visuals, '/visuals', ['spriteSet', 'palette', 'steeringPicture', 'colorNames']);
    const visuals = {
      spriteSet: readString(visual.spriteSet, '/visuals/spriteSet'),
      palette: readString(visual.palette, '/visuals/palette'),
      steeringPicture: readString(visual.steeringPicture, '/visuals/steeringPicture'),
      colorNames: readDictionary(visual.colorNames, '/visuals/colorNames', (name, path) =>
        readString(name, path, {
          pattern: COLOR_NAME,
          patternMessage: `Expected 1 to ${COLOR_NAME_LENGTH} uppercase characters the text tiles draw`,
        }),
      ),
    };
    if (!Object.hasOwn(sprites.sets, visuals.spriteSet))
      throw new AdmissionError(
        'unresolved_reference',
        '/visuals/spriteSet',
        `Unknown sprite set: ${visuals.spriteSet}`,
      );
    const spriteSet = sprites.sets[visuals.spriteSet]!;
    requireAdmission(
      v.form === 'car' ? spriteSet.bankVariants === 1 : spriteSet.bankVariants >= 3 && spriteSet.bankVariants % 2 === 1,
      'invalid_value',
      '/visuals/spriteSet',
      'Sprite bank dimensions do not support this vehicle form',
    );
    if (!spriteSetHasColor(spriteSet, visuals.palette))
      throw new AdmissionError('unresolved_reference', '/visuals/palette', `Unknown sprite color: ${visuals.palette}`);
    const colors = spriteSetColors(spriteSet);
    requireAdmission(
      Object.keys(visuals.colorNames).length === colors.length &&
        colors.every((color) => Object.hasOwn(visuals.colorNames, color)),
      'invalid_value',
      '/visuals/colorNames',
      `Expected a display name for each color of ${visuals.spriteSet}: ${colors.join(', ')}`,
    );
    if (!Object.hasOwn(HUD_PICTURES, visuals.steeringPicture))
      throw new AdmissionError(
        'unresolved_reference',
        '/visuals/steeringPicture',
        `Unknown steering picture: ${visuals.steeringPicture}`,
      );
    const steeringPicture = HUD_PICTURES[visuals.steeringPicture]!;
    const soundId = readString(v.sound, '/sound');
    if (!Object.hasOwn(sounds, soundId))
      throw new AdmissionError('unresolved_reference', '/sound', `Unknown sound ID: ${soundId}`);
    const source = deepFreeze({
      format: VEHICLE_LISTING_FORMAT,
      version: VEHICLE_LISTING_VERSION,
      form: v.form,
      selectionOrder,
      visuals,
      sound: soundId,
      metadata,
    } as unknown as VehicleListingDocument);
    return Object.freeze({ source, spriteSet, steeringPicture, sound: sounds[soundId]! });
  });
}

/** Pair one vehicle's compiled mechanics and listing: where the vehicle and its engine sound meet. */
export function createVehicleDefinition(
  mechanics: CompiledVehicleMechanics,
  listing: CompiledVehicleListing,
): CompiledVehicleDefinition {
  return Object.freeze({
    mechanics: mechanics.source,
    mechanicsSha256: mechanics.sha256,
    listing: listing.source,
    spriteSet: listing.spriteSet,
    steeringPicture: listing.steeringPicture,
    compiledVehicle: mechanics.compiledVehicle,
    sound: compileVehicleEngineSound(listing.sound, mechanics.compiledVehicle.powertrain),
  });
}

/**
 * `definition` with another mechanics document, admitted by the mechanics compiler under `document`: a DEV-tuned
 * document outside delivery, so without an identity. The listing's facts stay; the engine sound follows the new
 * mechanics.
 */
export function retuneVehicleMechanics(
  definition: CompiledVehicleDefinition,
  value: unknown,
  document: string,
): AdmissionResult<CompiledVehicleDefinition> {
  const mechanics = compileVehicleMechanicsDocument(value, definition.compiledVehicle.id, document, null);
  if (!mechanics.ok) return mechanics;
  return Object.freeze({
    ok: true as const,
    value: createVehicleDefinition(mechanics.value, {
      source: definition.listing,
      spriteSet: definition.spriteSet,
      steeringPicture: definition.steeringPicture,
      // The vehicle's sound is the listing's sound with facts derived from the mechanics, which this derives again.
      sound: definition.sound,
    }),
  });
}

/** Each named field of a record, read as a number at its own pointer. */
function readNumbers<K extends string>(record: Record<string, unknown>, keys: readonly K[], path: string) {
  return Object.fromEntries(keys.map((key) => [key, readNumber(record[key], `${path}/${key}`)])) as Record<K, number>;
}

const TIRE_KEYS = ['gripX', 'peakSlipX', 'gripY', 'peakSlipY', 'knee', 'loadSensitivity'] as const;

/** A tire's six values, all of them: the driving definition's and a vehicle's alike. */
function readTire(value: unknown, path: string): TireCharacteristics {
  return readNumbers(readRecord(value, path, TIRE_KEYS), TIRE_KEYS, path);
}

export function compileDrivingDocument(
  value: unknown,
  document: string,
  sha256: string | null,
): AdmissionResult<CompiledDrivingDefinition> {
  return admit(document, () => {
    const numbers = [
      'maxRoadWheelSteerDegrees',
      'steeringTraversalSeconds',
      'steeringUtilization',
      'fuelCutEnterRedlineRatio',
      'fuelCutClearRedlineRatio',
      'idleFrictionMeanEffectivePressureBar',
      'redlineFrictionMeanEffectivePressureBar',
      'drivelineEfficiency',
      'engineInertiaKilogramSquareMetersPerLitre',
      'clutchLockIdleMargin',
      'clutchCapacityFactor',
      'pitchLimitDegrees',
    ] as const;
    const v = readDocument(
      value,
      [
        'format',
        'version',
        ...numbers,
        'steeringReference',
        'throttle',
        'brake',
        'wheelSlip',
        'tire',
        'rivalPace',
        'bodyContact',
      ],
      DRIVING_DOCUMENT_FORMAT,
      DRIVING_DOCUMENT_VERSION,
    );
    const wheelSlip = readBoolean(v.wheelSlip, '/wheelSlip');
    const pedal = (key: string) => {
      const p = readRecord(v[key], `/${key}`, ['applySeconds', 'releaseSeconds']);
      return {
        applySeconds: readNumber(p.applySeconds, `/${key}/applySeconds`),
        releaseSeconds: readNumber(p.releaseSeconds, `/${key}/releaseSeconds`),
      };
    };
    const tire = readTire(v.tire, '/tire');
    const paceKeys = [
      'minimumUtilization',
      'maximumUtilization',
      'minimumSpeedFraction',
      'bandSeconds',
      'responseSeconds',
    ] as const;
    const rivalPace = readNumbers(readRecord(v.rivalPace, '/rivalPace', paceKeys), paceKeys, '/rivalPace');
    const contactKeys = ['frequencyHertz', 'dampingRatio', 'barrierFriction'] as const;
    const bodyContact = readNumbers(
      readRecord(v.bodyContact, '/bodyContact', contactKeys),
      contactKeys,
      '/bodyContact',
    );
    const { maxRoadWheelSteerDegrees, steeringTraversalSeconds, ...n } = readNumbers(v, numbers, '');
    // The source keeps the saved layout's field order, so an export of an unchanged definition is its file.
    const source: DrivingDocument = deepFreeze({
      format: DRIVING_DOCUMENT_FORMAT,
      version: DRIVING_DOCUMENT_VERSION,
      maxRoadWheelSteerDegrees,
      steeringTraversalSeconds,
      // The compiled steering rule admits the reference below.
      steeringReference: readString(v.steeringReference, '/steeringReference') as SteeringReference,
      ...n,
      throttle: pedal('throttle'),
      brake: pedal('brake'),
      wheelSlip,
      tire,
      rivalPace,
      bodyContact,
    });
    return Object.freeze({ source, sha256, compiledDriving: deepFreeze(admitDomain(() => compileDriving(source))) });
  });
}

export function vehicleDefinitionForId(
  vehicles: readonly CompiledVehicleDefinition[],
  id: string,
): CompiledVehicleDefinition {
  const value = vehicles.find((entry) => entry.compiledVehicle.id === id);
  if (!value) throw new RangeError(`Unknown vehicle ID: ${id}`);
  return value;
}
