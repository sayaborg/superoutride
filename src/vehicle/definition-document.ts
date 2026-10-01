import type { SpriteAssets } from './vehicle-sprite-library.js';
import { spriteSetHasColor, type VehicleSpriteSet } from './vehicle-sprite-set.js';
import { compileVehicle, type VehicleDefinition, type CompiledVehicle } from './physics/vehicle-definitions.js';
import { compileDriving } from './physics/compiled-driving.js';
import {
  AdmissionError,
  admit,
  admitDomain,
  deepFreeze,
  readArray,
  readBoolean,
  readDocument,
  readNumber,
  readRecord,
  readString,
  relativePointer,
  requireAdmission,
  type AdmissionResult,
} from '../core/admission.js';
import type { DrivingDocument } from './driving-definition.js';
import type { CompiledDrivingDefinition } from './compiled-driving-definition.js';
import type { CompiledEngineSound } from '../audio/engine-sound.js';
import type { EngineSoundCatalog } from '../audio/engine-sound-document.js';

export type VehicleForm = 'car' | 'bike';
export interface VehicleMetadata {
  readonly manufacturer: string;
  readonly model: string;
  readonly identifier: Readonly<{ officialLabel: string; shortLabel: string }> | null;
  readonly selectedSpecification: readonly string[];
  readonly period: string;
  readonly physicsAnchor: Readonly<{ modelYear: string; market: string }>;
  readonly mobileLabel: string;
}
/** The mechanics document: exactly the values vehicle physics reads. */
export interface VehicleMechanicsDocument extends Omit<VehicleDefinition, 'id'> {
  readonly format: 'superoutride.vehicle-mechanics';
  readonly version: 1;
}
/** The listing document: how a vehicle is named, ordered, drawn, heard and shown on the HUD. */
export interface VehicleListingDocument {
  readonly format: 'superoutride.vehicle-listing';
  readonly version: 1;
  readonly form: VehicleForm;
  readonly selectionOrder: number;
  readonly visuals: Readonly<{ spriteSet: string; palette: string; steeringRatio: number }>;
  readonly sound: string;
  readonly metadata: VehicleMetadata;
}
export interface CompiledVehicleMechanics {
  readonly source: VehicleMechanicsDocument;
  /** SHA-256 of the delivered document, supplied by its catalog. */
  readonly sha256: string;
  readonly compiledVehicle: CompiledVehicle;
}
export interface CompiledVehicleListing extends VehicleMetadata {
  readonly source: VehicleListingDocument;
  readonly spriteSet: VehicleSpriteSet;
  readonly form: VehicleForm;
  readonly sound: CompiledEngineSound;
}
/** One vehicle: its mechanics and listing documents, paired by identifier in the catalog. */
export interface CompiledVehicleDefinition extends VehicleMetadata {
  readonly mechanics: VehicleMechanicsDocument;
  readonly mechanicsSha256: string;
  readonly listing: VehicleListingDocument;
  readonly spriteSet: VehicleSpriteSet;
  readonly form: VehicleForm;
  readonly compiledVehicle: CompiledVehicle;
  readonly sound: CompiledEngineSound;
}
const mechanicalNumbers = [
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
const powertrainNumbers = ['displacementCc', 'cycle', 'idleRpm', 'redlineRpm', 'finalDriveRatio'] as const;

/** The catalog supplies the vehicle's identifier (its file name and manifest ID) and delivered SHA-256. */
export function compileVehicleMechanicsDocument(
  value: unknown,
  id: string,
  document: string,
  sha256: string,
): AdmissionResult<CompiledVehicleMechanics> {
  return admit(document, () => {
    const v = readDocument(
      value,
      ['format', 'version', ...mechanicalNumbers, 'powertrain'],
      'superoutride.vehicle-mechanics',
      1,
    );
    const mechanics = Object.fromEntries(mechanicalNumbers.map((key) => [key, readNumber(v[key], `/${key}`)]));
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
    const definition = { ...mechanics, powertrain } as unknown as Omit<VehicleDefinition, 'id'>;
    const source: VehicleMechanicsDocument = deepFreeze({
      format: 'superoutride.vehicle-mechanics',
      version: 1,
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
      'superoutride.vehicle-listing',
      1,
    );
    requireAdmission(v.form === 'car' || v.form === 'bike', 'invalid_value', '/form', 'Expected car or bike');
    const selectionOrder = readNumber(v.selectionOrder, '/selectionOrder');
    requireAdmission(
      Number.isSafeInteger(selectionOrder) && selectionOrder > 0,
      'invalid_value',
      '/selectionOrder',
      'Expected a positive safe integer',
    );
    const strings = ['manufacturer', 'model', 'period', 'mobileLabel'] as const;
    const meta = readRecord(v.metadata, '/metadata', [
      ...strings,
      'identifier',
      'selectedSpecification',
      'physicsAnchor',
    ]);
    const named = (value: unknown, path: string, keys: readonly string[]) => {
      const record = readRecord(value, path, keys);
      return Object.fromEntries(keys.map((key) => [key, readString(record[key], `${path}/${key}`)]));
    };
    const metadata = {
      ...Object.fromEntries(strings.map((key) => [key, readString(meta[key], `/metadata/${key}`)])),
      identifier:
        meta.identifier === null
          ? null
          : named(meta.identifier, '/metadata/identifier', ['officialLabel', 'shortLabel']),
      selectedSpecification: readArray(meta.selectedSpecification, '/metadata/selectedSpecification', (x, at) =>
        readString(x, at),
      ),
      physicsAnchor: named(meta.physicsAnchor, '/metadata/physicsAnchor', ['modelYear', 'market']),
    } as unknown as VehicleMetadata;
    const visual = readRecord(v.visuals, '/visuals', ['spriteSet', 'palette', 'steeringRatio']);
    const visuals = {
      spriteSet: readString(visual.spriteSet, '/visuals/spriteSet'),
      palette: readString(visual.palette, '/visuals/palette'),
      steeringRatio: readNumber(visual.steeringRatio, '/visuals/steeringRatio', { min: 0 }),
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
    const soundId = readString(v.sound, '/sound');
    if (!Object.hasOwn(sounds, soundId))
      throw new AdmissionError('unresolved_reference', '/sound', `Unknown sound ID: ${soundId}`);
    const source = deepFreeze({
      format: 'superoutride.vehicle-listing',
      version: 1,
      form: v.form,
      selectionOrder,
      visuals,
      sound: soundId,
      metadata,
    } as unknown as VehicleListingDocument);
    return Object.freeze({
      ...metadata,
      source,
      spriteSet,
      form: source.form,
      sound: sounds[soundId]!,
    });
  });
}

/** Pair one vehicle's compiled mechanics and listing. */
export function createVehicleDefinition(
  mechanics: CompiledVehicleMechanics,
  listing: CompiledVehicleListing,
): CompiledVehicleDefinition {
  const { source, ...shown } = listing;
  return Object.freeze({
    ...shown,
    mechanics: mechanics.source,
    mechanicsSha256: mechanics.sha256,
    listing: source,
    compiledVehicle: mechanics.compiledVehicle,
  });
}

export function compileDrivingDocument(
  value: unknown,
  document: string,
  sha256: string | null,
): AdmissionResult<CompiledDrivingDefinition> {
  return admit(document, () => {
    const numbers = [
      'maxRoadWheelSteerDegrees',
      'steeringOffsetDegrees',
      'steeringTraversalSeconds',
      'fuelCutRedlineMargin',
      'idleFrictionMeanEffectivePressureBar',
      'redlineFrictionMeanEffectivePressureBar',
      'drivelineEfficiency',
      'engineInertiaKilogramSquareMetersPerLitre',
      'clutchLockIdleMargin',
      'clutchCapacityFactor',
      'suspensionProgression',
      'pitchLimitDegrees',
    ] as const;
    const v = readDocument(
      value,
      ['format', 'version', ...numbers, 'throttle', 'brake', 'wheelSlip', 'tire', 'rivalPace'],
      'superoutride.driving-definition',
      11,
    );
    const wheelSlip = readBoolean(v.wheelSlip, '/wheelSlip');
    const pedal = (key: string) => {
      const p = readRecord(v[key], `/${key}`, ['applySeconds', 'releaseSeconds']);
      return {
        applySeconds: readNumber(p.applySeconds, `/${key}/applySeconds`),
        releaseSeconds: readNumber(p.releaseSeconds, `/${key}/releaseSeconds`),
      };
    };
    const keys = ['gripX', 'peakSlipX', 'gripY', 'peakSlipY', 'knee'] as const;
    const t = readRecord(v.tire, '/tire', keys);
    const paceKeys = ['minimumUtilization', 'maximumUtilization', 'responseSeconds'] as const;
    const pace = readRecord(v.rivalPace, '/rivalPace', paceKeys);
    const source = deepFreeze({
      format: 'superoutride.driving-definition',
      version: 11,
      ...Object.fromEntries(numbers.map((key) => [key, readNumber(v[key], `/${key}`)])),
      throttle: pedal('throttle'),
      brake: pedal('brake'),
      wheelSlip,
      tire: Object.fromEntries(keys.map((key) => [key, readNumber(t[key], `/tire/${key}`)])),
      rivalPace: Object.fromEntries(paceKeys.map((key) => [key, readNumber(pace[key], `/rivalPace/${key}`)])),
    } as DrivingDocument);
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
