import type { SpriteAssets } from './vehicle-sprite-library.js';
import type { VehicleSpriteSet } from './vehicle-sprite-set.js';
import { compileVehicle, type VehicleDefinition, type CompiledVehicle } from './physics/vehicle-definitions.js';
import { createDrivingSettings } from './physics/driving-settings.js';
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
import { VEHICLE_SOUND_PROFILES } from './sound-profiles.js';
import type { VehicleAudioProfile } from '../audio/vehicle-audio-profile.js';

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
export interface VehicleDocument {
  readonly format: 'superoutride.vehicle-definition';
  readonly version: 7;
  readonly form: VehicleForm;
  readonly selectionOrder: number;
  readonly mechanics: Omit<VehicleDefinition, 'id'>;
  readonly visuals: Readonly<{ spriteSet: string; palette: string; steeringRatio: number }>;
  readonly sound: string;
  readonly metadata: VehicleMetadata;
}
export interface CompiledVehicleDefinition extends VehicleMetadata {
  readonly source: VehicleDocument;
  readonly spriteSet: VehicleSpriteSet;
  readonly form: VehicleForm;
  readonly compiledVehicle: CompiledVehicle;
  readonly sound: VehicleAudioProfile;
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

/** `id` is the document's identifier, supplied by its catalog: the file name and manifest ID. */
export function compileVehicleDocument(
  value: unknown,
  id: string,
  document: string,
  sprites: SpriteAssets,
): AdmissionResult<CompiledVehicleDefinition> {
  return admit(document, () => {
    const v = readDocument(
      value,
      ['format', 'version', 'form', 'selectionOrder', 'mechanics', 'sound', 'metadata', 'visuals'],
      'superoutride.vehicle-definition',
      7,
    );
    requireAdmission(v.form === 'car' || v.form === 'bike', 'invalid_value', '/form', 'Expected car or bike');
    const selectionOrder = readNumber(v.selectionOrder, '/selectionOrder');
    requireAdmission(
      Number.isSafeInteger(selectionOrder) && selectionOrder > 0,
      'invalid_value',
      '/selectionOrder',
      'Expected a positive safe integer',
    );
    const m = readRecord(v.mechanics, '/mechanics', [...mechanicalNumbers, 'powertrain']);
    const mechanics = Object.fromEntries(
      mechanicalNumbers.map((key) => [key, readNumber(m[key], `/mechanics/${key}`)]),
    );
    const p = readRecord(m.powertrain, '/mechanics/powertrain', [...powertrainNumbers, 'gearRatios', 'torqueCurve']);
    const powertrain = {
      ...Object.fromEntries(powertrainNumbers.map((key) => [key, readNumber(p[key], `/mechanics/powertrain/${key}`)])),
      gearRatios: readArray(p.gearRatios, '/mechanics/powertrain/gearRatios', (x, at) => readNumber(x, at)),
      torqueCurve: readArray(p.torqueCurve, '/mechanics/powertrain/torqueCurve', (x, path) => {
        const point = readRecord(x, path, ['rpm', 'torqueNewtonMeters']);
        return {
          rpm: readNumber(point.rpm, path + '/rpm'),
          torqueNewtonMeters: readNumber(point.torqueNewtonMeters, path + '/torqueNewtonMeters'),
        };
      }),
    };
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
    if (!spriteSet.assets.every((row) => row.every((image) => Object.hasOwn(image.palettes, visuals.palette))))
      throw new AdmissionError('unresolved_reference', '/visuals/palette', `Unknown sprite color: ${visuals.palette}`);
    const soundId = readString(v.sound, '/sound');
    if (!Object.hasOwn(VEHICLE_SOUND_PROFILES, soundId))
      throw new AdmissionError('unresolved_reference', '/sound', `Unknown sound ID: ${soundId}`);
    const source = deepFreeze({
      format: 'superoutride.vehicle-definition',
      version: 7,
      form: v.form,
      selectionOrder,
      visuals,
      mechanics: { ...mechanics, powertrain },
      sound: soundId,
      metadata,
    } as unknown as VehicleDocument);
    const compiledVehicle = admitDomain(
      () => compileVehicle({ id, ...source.mechanics }),
      // The catalog supplies an admitted identifier; its failure would locate the document root.
      (path) => (path === 'id' ? '' : relativePointer(path, '/mechanics')),
    );
    return Object.freeze({
      ...metadata,
      source,
      spriteSet,
      form: source.form,
      compiledVehicle,
      sound: VEHICLE_SOUND_PROFILES[soundId as keyof typeof VEHICLE_SOUND_PROFILES],
    });
  });
}

export function compileDrivingDocument(value: unknown, document: string): AdmissionResult<CompiledDrivingDefinition> {
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
      ['format', 'version', 'automaticSteering', ...numbers, 'throttle', 'brake', 'wheelSlip', 'tire'],
      'superoutride.driving-definition',
      9,
    );
    requireAdmission(
      v.automaticSteering === 'travel-direction',
      'invalid_value',
      '/automaticSteering',
      'Expected travel-direction',
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
    const source = deepFreeze({
      format: 'superoutride.driving-definition',
      version: 9,
      automaticSteering: v.automaticSteering,
      ...Object.fromEntries(numbers.map((key) => [key, readNumber(v[key], `/${key}`)])),
      throttle: pedal('throttle'),
      brake: pedal('brake'),
      wheelSlip,
      tire: Object.fromEntries(keys.map((key) => [key, readNumber(t[key], `/tire/${key}`)])),
    } as DrivingDocument);
    return Object.freeze({ source, settings: deepFreeze(admitDomain(() => createDrivingSettings(source))) });
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
