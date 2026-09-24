import type { ContentDelivery } from '../core/content-manifest.js';
import { compileVehicle, type VehicleDefinition, type CompiledVehicle } from './physics/vehicle-definitions.js';
import { createDrivingSettings } from './physics/driving-settings.js';
import { DefinitionDomainError } from './physics/definition-domain-error.js';
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
  readonly version: 1;
  readonly id: string;
  readonly form: VehicleForm;
  readonly selectionOrder: number;
  readonly mechanics: Omit<VehicleDefinition, 'id'>;
  readonly sound: string;
  readonly metadata: VehicleMetadata;
}
export interface CompiledVehicleDefinition extends VehicleMetadata {
  readonly source: VehicleDocument;
  readonly form: VehicleForm;
  readonly compiledVehicle: CompiledVehicle;
  readonly sound: VehicleAudioProfile;
}
interface DefinitionDiagnostic {
  readonly kind: 'input';
  readonly code: 'invalid_shape' | 'invalid_value' | 'unsupported_version' | 'unresolved_reference';
  readonly document: string;
  readonly path: string;
  readonly message: string;
}
type Result<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly diagnostics: readonly DefinitionDiagnostic[] };
class InputError extends Error {
  constructor(
    readonly code: DefinitionDiagnostic['code'],
    readonly path: string,
    message: string,
  ) {
    super(message);
  }
}
function requireValue(condition: boolean, path: string, message: string): asserts condition {
  if (!condition) throw new InputError('invalid_value', path, message);
}
function object(value: unknown, path: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value))
    throw new InputError('invalid_shape', path, 'Expected an object');
  return value as Record<string, unknown>;
}
function string(value: unknown, path: string): string {
  if (typeof value !== 'string') throw new InputError('invalid_shape', path, 'Expected a string');
  requireValue(value.length > 0 && value.trim() === value, path, 'Expected a nonempty trimmed string');
  return value;
}
function number(value: unknown, path: string): number {
  if (typeof value !== 'number') throw new InputError('invalid_shape', path, 'Expected a number');
  return value;
}
function array(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) throw new InputError('invalid_shape', path, 'Expected an array');
  return value;
}
function fields(value: Record<string, unknown>, keys: readonly string[], path: string) {
  for (const key of Object.keys(value))
    if (!keys.includes(key)) throw new InputError('invalid_shape', `${path}/${key}`, 'Unknown field');
}
function header(value: unknown, format: string) {
  const record = object(value, '');
  if (record.format !== format || record.version !== 1)
    throw new InputError(
      'unsupported_version',
      record.format !== format ? '/format' : '/version',
      `Expected ${format} version 1`,
    );
  return record;
}
/** All admitted documents are detached plain JSON records, including every nested collection. */
function freeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}
function admit<T>(document: string, compile: () => T): Result<T> {
  try {
    return { ok: true, value: compile() };
  } catch (error) {
    if (!(error instanceof InputError) && !(error instanceof DefinitionDomainError)) throw error;
    return {
      ok: false,
      diagnostics: [
        {
          kind: 'input',
          code: error instanceof InputError ? error.code : 'invalid_value',
          document,
          path: error.path,
          message: error.message,
        },
      ],
    };
  }
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
  'frontQBump',
  'rearQBump',
  'frontQTravel',
  'rearQTravel',
  'frontBumpForceMax',
  'rearBumpForceMax',
  'frontWheelRadius',
  'rearWheelRadius',
  'frontWheelInertia',
  'rearWheelInertia',
  'frontDriveTorqueFraction',
  'steeringRatio',
  'frontBrakeTorqueMax',
  'rearBrakeTorqueMax',
  'quadraticDrag',
] as const;
const powertrainNumbers = [
  'idleRpm',
  'redlineRpm',
  'upshiftRpm',
  'downshiftRpm',
  'finalDriveRatio',
  'efficiency',
] as const;

export function compileVehicleDocument(value: unknown, document: string): Result<CompiledVehicleDefinition> {
  return admit(document, () => {
    const v = header(value, 'superoutride.vehicle-definition');
    fields(v, ['format', 'version', 'id', 'form', 'selectionOrder', 'mechanics', 'sound', 'metadata'], '');
    const id = string(v.id, '/id');
    requireValue(/^[A-Za-z0-9_-]+$/.test(id), '/id', 'Expected a filename-safe ID');
    requireValue(v.form === 'car' || v.form === 'bike', '/form', 'Expected car or bike');
    const selectionOrder = number(v.selectionOrder, '/selectionOrder');
    requireValue(
      Number.isSafeInteger(selectionOrder) && selectionOrder > 0,
      '/selectionOrder',
      'Expected a positive safe integer',
    );
    const m = object(v.mechanics, '/mechanics');
    fields(m, [...mechanicalNumbers, 'powertrain'], '/mechanics');
    const mechanics = Object.fromEntries(mechanicalNumbers.map((key) => [key, number(m[key], `/mechanics/${key}`)]));
    const p = object(m.powertrain, '/mechanics/powertrain');
    fields(p, [...powertrainNumbers, 'gearRatios', 'torqueCurve'], '/mechanics/powertrain');
    const powertrain = {
      ...Object.fromEntries(powertrainNumbers.map((key) => [key, number(p[key], `/mechanics/powertrain/${key}`)])),
      gearRatios: array(p.gearRatios, '/mechanics/powertrain/gearRatios').map((x, i) =>
        number(x, `/mechanics/powertrain/gearRatios/${i}`),
      ),
      torqueCurve: array(p.torqueCurve, '/mechanics/powertrain/torqueCurve').map((x, i) => {
        const path = `/mechanics/powertrain/torqueCurve/${i}`,
          point = object(x, path);
        fields(point, ['rpm', 'torqueNewtonMeters'], path);
        return {
          rpm: number(point.rpm, path + '/rpm'),
          torqueNewtonMeters: number(point.torqueNewtonMeters, path + '/torqueNewtonMeters'),
        };
      }),
    };
    const meta = object(v.metadata, '/metadata');
    const strings = ['manufacturer', 'model', 'period', 'mobileLabel'] as const;
    fields(meta, [...strings, 'identifier', 'selectedSpecification', 'physicsAnchor'], '/metadata');
    const named = (value: unknown, path: string, keys: readonly string[]) => {
      const record = object(value, path);
      fields(record, keys, path);
      return Object.fromEntries(keys.map((key) => [key, string(record[key], `${path}/${key}`)]));
    };
    const metadata = {
      ...Object.fromEntries(strings.map((key) => [key, string(meta[key], `/metadata/${key}`)])),
      identifier:
        meta.identifier === null
          ? null
          : named(meta.identifier, '/metadata/identifier', ['officialLabel', 'shortLabel']),
      selectedSpecification: array(meta.selectedSpecification, '/metadata/selectedSpecification').map((x, i) =>
        string(x, `/metadata/selectedSpecification/${i}`),
      ),
      physicsAnchor: named(meta.physicsAnchor, '/metadata/physicsAnchor', ['modelYear', 'market']),
    } as unknown as VehicleMetadata;
    const soundId = string(v.sound, '/sound');
    if (!Object.hasOwn(VEHICLE_SOUND_PROFILES, soundId))
      throw new InputError('unresolved_reference', '/sound', `Unknown sound ID: ${soundId}`);
    const source = freeze({
      format: 'superoutride.vehicle-definition',
      version: 1,
      id,
      form: v.form,
      selectionOrder,
      mechanics: { ...mechanics, powertrain },
      sound: soundId,
      metadata,
    } as unknown as VehicleDocument);
    const compiledVehicle = compileVehicle({ id, ...source.mechanics });
    return Object.freeze({
      ...metadata,
      source,
      form: source.form,
      compiledVehicle,
      sound: VEHICLE_SOUND_PROFILES[soundId as keyof typeof VEHICLE_SOUND_PROFILES],
    });
  });
}

export function compileDrivingDocument(value: unknown, document: string): Result<CompiledDrivingDefinition> {
  return admit(document, () => {
    const v = header(value, 'superoutride.driving-definition');
    const numbers = ['maxRoadWheelSteerDegrees', 'steeringOffsetDegrees', 'steeringTraversalSeconds'] as const;
    fields(
      v,
      ['format', 'version', 'id', 'automaticSteering', ...numbers, 'throttle', 'brake', 'wheelSlip', 'tire'],
      '',
    );
    requireValue(v.id === 'default', '/id', 'Expected the game-wide default ID');
    requireValue(v.automaticSteering === 'travel-direction', '/automaticSteering', 'Expected travel-direction');
    if (typeof v.wheelSlip !== 'boolean') throw new InputError('invalid_shape', '/wheelSlip', 'Expected a boolean');
    const pedal = (key: string) => {
      const p = object(v[key], `/${key}`);
      fields(p, ['applySeconds', 'releaseSeconds'], `/${key}`);
      return {
        applySeconds: number(p.applySeconds, `/${key}/applySeconds`),
        releaseSeconds: number(p.releaseSeconds, `/${key}/releaseSeconds`),
      };
    };
    const t = object(v.tire, '/tire'),
      keys = ['gripX', 'peakSlipX', 'gripY', 'peakSlipY', 'knee'] as const;
    fields(t, keys, '/tire');
    const source = freeze({
      format: 'superoutride.driving-definition',
      version: 1,
      id: 'default',
      automaticSteering: v.automaticSteering,
      ...Object.fromEntries(numbers.map((key) => [key, number(v[key], `/${key}`)])),
      throttle: pedal('throttle'),
      brake: pedal('brake'),
      wheelSlip: v.wheelSlip,
      tire: Object.fromEntries(keys.map((key) => [key, number(t[key], `/tire/${key}`)])),
    } as DrivingDocument);
    return Object.freeze({ source, settings: freeze(createDrivingSettings(source)) });
  });
}

/** Transport verifies every payload SHA before either admission boundary sees decoded content. */
export async function loadVehicleDefinitions(content: ContentDelivery) {
  const take = <T>(result: Result<T>): T => {
    if (!result.ok) throw new Error(JSON.stringify(result.diagnostics));
    return result.value;
  };
  const drivingFiles = content.manifest.files.filter((file) => file.kind === 'driving');
  if (drivingFiles.length !== 1 || drivingFiles[0]!.id !== 'default')
    throw new RangeError('Manifest requires one default driving definition');
  const drivingFile = drivingFiles[0]!;
  const driving = take(compileDrivingDocument(await content.json('driving', drivingFile.id), drivingFile.path));
  const orders = new Set<number>();
  const vehicles: CompiledVehicleDefinition[] = [];
  for (const file of content.manifest.files.filter((file) => file.kind === 'vehicle')) {
    const entry = take(compileVehicleDocument(await content.json('vehicle', file.id), file.path));
    take(
      admit(file.path, () => {
        requireValue(entry.source.id === file.id, '/id', 'Vehicle ID must match manifest identity');
        requireValue(!orders.has(entry.source.selectionOrder), '/selectionOrder', 'Duplicate selection order');
      }),
    );
    orders.add(entry.source.selectionOrder);
    vehicles.push(entry);
  }
  if (!vehicles.length) throw new RangeError('Manifest requires vehicle definitions');
  vehicles.sort((a, b) => a.source.selectionOrder - b.source.selectionOrder);
  return Object.freeze({ vehicles: Object.freeze(vehicles), driving });
}
export type VehicleDefinitions = Awaited<ReturnType<typeof loadVehicleDefinitions>>;

export function vehicleDefinitionForId(
  vehicles: readonly CompiledVehicleDefinition[],
  id: string,
): CompiledVehicleDefinition {
  const value = vehicles.find((entry) => entry.compiledVehicle.id === id);
  if (!value) throw new RangeError(`Unknown vehicle ID: ${id}`);
  return value;
}
