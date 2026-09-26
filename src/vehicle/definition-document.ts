import { readSpriteAssets, type SpriteAssets, type VehicleSpriteSet } from '../image/sprite-assets.js';
import type { ContentDelivery } from '../core/content-manifest.js';
import { compileVehicle, type VehicleDefinition, type CompiledVehicle } from './physics/vehicle-definitions.js';
import { createDrivingSettings } from './physics/driving-settings.js';
import {
  AdmissionError,
  admit,
  admitDomain,
  admitSingleDocument,
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
  type DocumentSource,
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
  readonly version: 6;
  readonly id: string;
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

export function compileVehicleDocument(
  value: unknown,
  document: string,
  sprites: SpriteAssets,
): AdmissionResult<CompiledVehicleDefinition> {
  return admit(document, () => {
    const v = readDocument(
      value,
      ['format', 'version', 'id', 'form', 'selectionOrder', 'mechanics', 'sound', 'metadata', 'visuals'],
      'superoutride.vehicle-definition',
      6,
    );
    const id = readString(v.id, '/id', { pattern: /^[A-Za-z0-9_-]+$/, patternMessage: 'Expected a filename-safe ID' });
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
      version: 6,
      id,
      form: v.form,
      selectionOrder,
      visuals,
      mechanics: { ...mechanics, powertrain },
      sound: soundId,
      metadata,
    } as unknown as VehicleDocument);
    const compiledVehicle = admitDomain(
      () => compileVehicle({ id, ...source.mechanics }),
      (path) => (path === 'id' ? '/id' : relativePointer(path, '/mechanics')),
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
      ['format', 'version', 'id', 'automaticSteering', ...numbers, 'throttle', 'brake', 'wheelSlip', 'tire'],
      'superoutride.driving-definition',
      8,
    );
    const id = readString(v.id, '/id');
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
      version: 8,
      id,
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

/** Image syntax and set-wide invariants are admitted once, before vehicle references. */
export async function loadVehicleSpriteLibrary(content: ContentDelivery): Promise<SpriteAssets> {
  const file = content.manifest.files.find((file) => file.kind === 'image' && file.id === 'vehicles');
  if (!file) throw new RangeError('Manifest requires the vehicle sprite library');
  const value = await content.json('image', 'vehicles');
  const result = admit(file.path, () => readSpriteAssets(value));
  if (!result.ok) throw new Error(JSON.stringify(result.diagnostics));
  return result.value;
}

const requireFileName = (id: string, file: DocumentSource) =>
  requireAdmission(id === file.id, 'invalid_value', '/id', `Expected the file name ${file.id} as the document ID`);

/**
 * Admit the catalog from its sources, from the build's files or delivery's manifest alike: exactly one
 * driving definition, named `default`, and at least one vehicle document against an admitted sprite
 * library. Each document ID is its file name and selection orders are unique.
 */
export function compileVehicleDefinitions(
  sprites: SpriteAssets,
  drivingSources: readonly DocumentSource[],
  vehicleSources: readonly DocumentSource[],
): AdmissionResult<VehicleDefinitions> {
  const single = admitSingleDocument(drivingSources, 'default', 'driving definition');
  if (!single.ok) return single;
  const driving = compileDrivingDocument(single.value.value, single.value.path);
  if (!driving.ok) return driving;
  const drivingIdentity = admit(single.value.path, () => requireFileName(driving.value.source.id, single.value));
  if (!drivingIdentity.ok) return drivingIdentity;
  const orders = new Set<number>();
  const vehicles: CompiledVehicleDefinition[] = [];
  for (const file of vehicleSources) {
    const entry = compileVehicleDocument(file.value, file.path, sprites);
    if (!entry.ok) return entry;
    const catalogRules = admit(file.path, () => {
      requireFileName(entry.value.source.id, file);
      requireAdmission(
        !orders.has(entry.value.source.selectionOrder),
        'duplicate_id',
        '/selectionOrder',
        'Duplicate selection order',
      );
    });
    if (!catalogRules.ok) return catalogRules;
    orders.add(entry.value.source.selectionOrder);
    vehicles.push(entry.value);
  }
  const nonempty = admit('', () =>
    requireAdmission(vehicles.length > 0, 'invalid_value', '', 'Expected at least one vehicle definition'),
  );
  if (!nonempty.ok) return nonempty;
  vehicles.sort((a, b) => a.source.selectionOrder - b.source.selectionOrder);
  return Object.freeze({
    ok: true as const,
    value: Object.freeze({ vehicles: Object.freeze(vehicles), driving: driving.value }),
  });
}

/** Transport verifies every payload SHA before either admission boundary sees decoded content. */
export async function loadVehicleDefinitions(content: ContentDelivery): Promise<VehicleDefinitions> {
  const sprites = await loadVehicleSpriteLibrary(content);
  const read = async (kind: 'driving' | 'vehicle') => {
    const sources: DocumentSource[] = [];
    for (const file of content.manifest.files.filter((file) => file.kind === kind))
      sources.push({ id: file.id, path: file.path, value: await content.json(kind, file.id) });
    return sources;
  };
  const result = compileVehicleDefinitions(sprites, await read('driving'), await read('vehicle'));
  if (!result.ok) throw new Error(JSON.stringify(result.diagnostics));
  return result.value;
}
export interface VehicleDefinitions {
  readonly vehicles: readonly CompiledVehicleDefinition[];
  readonly driving: CompiledDrivingDefinition;
}

export function vehicleDefinitionForId(
  vehicles: readonly CompiledVehicleDefinition[],
  id: string,
): CompiledVehicleDefinition {
  const value = vehicles.find((entry) => entry.compiledVehicle.id === id);
  if (!value) throw new RangeError(`Unknown vehicle ID: ${id}`);
  return value;
}
