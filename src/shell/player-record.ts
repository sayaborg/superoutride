import type { CameraYawSource } from '../view/camera.js';
import type { VehicleForm } from '../vehicle/definition-document.js';
import { createSteeringRule, STEERING_REFERENCES, type SteeringRule } from '../vehicle/steering-rule.js';

/** The browser's one versioned player record; see [Browser operation](../../docs/browser.md#player-record). */
const PLAYER_RECORD_KEY = 'super-outride-player';
const PLAYER_RECORD_VERSION = 6;
/** The version before, whose settings are kept; its TIME TRIAL and ARCADE records, which name no class, are dropped. */
const MODE_RECORDS_VERSION = 5;
/** The version before that, which had no steering settings either. */
const STEERINGLESS_VERSION = 4;
/** The first version, whose settings are kept; it had no records. */
const SETTINGS_ONLY_VERSION = 1;

export const VOLUME_NAMES = ['master', 'music', 'effects'] as const;
export type VolumeName = (typeof VOLUME_NAMES)[number];
const CAMERA_YAW_SOURCES: readonly CameraYawSource[] = ['FACING', 'MOVING'];
const VEHICLE_FORMS: readonly VehicleForm[] = ['car', 'bike'];

/** What the camera follows by vehicle form until the player chooses: a car's heading, a bike's direction of travel. */
export const DEFAULT_CAMERAS: Readonly<Record<VehicleForm, CameraYawSource>> = Object.freeze({
  car: 'FACING',
  bike: 'MOVING',
});

/** The front tire utilizations the player chooses among for full steering input. */
export const STEERING_UTILIZATIONS: readonly number[] = Object.freeze([1, 0.95, 0.9]);

/** The player's steering rule by vehicle form until the player chooses: the centre of mass at 95%. */
export const DEFAULT_STEERING: Readonly<Record<VehicleForm, SteeringRule>> = Object.freeze({
  car: createSteeringRule('center', 0.95),
  bike: createSteeringRule('center', 0.95),
});

export interface PlayerSettings {
  /** Selected color ID by vehicle ID. */
  readonly vehicleColors: Readonly<Record<string, string>>;
  /** Integer percentages, 0–100. */
  readonly volumes: Readonly<Record<VolumeName, number>>;
  /** Latest selection by selection-screen key. */
  readonly latestSelections: Readonly<Record<string, string>>;
  /** What the camera yaw follows, by the player vehicle's form. */
  readonly cameras: Readonly<Record<VehicleForm, CameraYawSource>>;
  /** The steering rule the player drives by, by the player vehicle's form. */
  readonly steering: Readonly<Record<VehicleForm, SteeringRule>>;
}

/**
 * A TIME ATTACK record of a class at one goal, in milliseconds: on a CIRCUIT the fastest lap with its gate crossings
 * within that lap, else the fastest completion time with its race times at every gate. It keeps the vehicle it was set
 * with and the identities it was set against: the course build and that vehicle's delivered definitions.
 */
export interface TimeAttackRecord {
  readonly timeMs: number;
  /** The record run's times at its gates in crossing order, from GO, or on a CIRCUIT from the lap's start. */
  readonly splitsMs: readonly number[];
  readonly vehicleId: string;
  readonly courseSha256: string;
  readonly vehicleSha256: string;
}
/** Records by key; keys come only from {@link timeAttackRecordKey}. */
export interface PlayerRecords {
  readonly timeAttack: Readonly<Record<string, TimeAttackRecord>>;
}

/** A TIME ATTACK record's key: the series, the class and the goal reached (its FINISH gate ID; a circuit has one). */
export function timeAttackRecordKey(seriesId: string, classId: string, goal: string): string {
  return JSON.stringify([seriesId, classId, goal]);
}

export interface PlayerRecord {
  readonly settings: PlayerSettings;
  readonly records: PlayerRecords;
  /** Replaces the given settings and saves the record; without storage the change lives for the page. */
  updateSettings(change: Partial<PlayerSettings>): void;
  /** Replaces the records and saves the record, as settings are saved. */
  updateRecords(records: PlayerRecords): void;
}

const DEFAULT_SETTINGS = freezeSettings({
  vehicleColors: {},
  volumes: { master: 35, music: 100, effects: 100 },
  latestSelections: {},
  cameras: DEFAULT_CAMERAS,
  steering: DEFAULT_STEERING,
});
/** No records: what an older record or CLEAR RECORDS leaves. */
export const NO_RECORDS = freezeRecords({ timeAttack: {} });

/**
 * Opens the player record in `storage`. A version 1 to 5 record keeps its settings and starts with no records: their
 * keys name no class. Records before version 5 take the default steering, and those before version 4 the default
 * cameras. An absent,
 * unreadable, corrupt or other-version record starts from the defaults; a malformed record entry alone is dropped.
 * Storage failures leave the record in memory; none of these stops the game.
 */
export function openPlayerRecord(storage: Storage | null): PlayerRecord {
  const read = readRecord(storage);
  let settings = read?.settings ?? DEFAULT_SETTINGS,
    records = read?.records ?? NO_RECORDS;
  const save = () => {
    try {
      storage?.setItem(PLAYER_RECORD_KEY, JSON.stringify({ version: PLAYER_RECORD_VERSION, settings, records }));
    } catch {
      // Quota, privacy mode or a revoked origin keeps the change for this page only.
    }
  };
  return {
    get settings() {
      return settings;
    },
    get records() {
      return records;
    },
    updateSettings(change) {
      settings = freezeSettings({ ...settings, ...change });
      save();
    },
    updateRecords(next) {
      records = freezeRecords(next);
      save();
    },
  };
}

/** The page's localStorage, or null where reading it throws or it does not exist. */
export function browserStorage(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

function readRecord(storage: Storage | null): { settings: PlayerSettings; records: PlayerRecords } | null {
  let text: string | null;
  try {
    text = storage?.getItem(PLAYER_RECORD_KEY) ?? null;
  } catch {
    return null;
  }
  if (text === null) return null;
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return null;
  }
  return admitPlayerRecord(value);
}

/**
 * The settings and records of a record with exactly the declared shape, or null: version 6; or version 1 to 5, whose
 * settings carry over with no records (version 1 had none; versions 2 to 5 kept TIME TRIAL and ARCADE records, which
 * name no class). Settings before version 5 take the default steering, and those before version 4 the default cameras.
 */
function admitPlayerRecord(value: unknown): { settings: PlayerSettings; records: PlayerRecords } | null {
  if (!isObject(value)) return null;
  const version = value.version;
  if (version === SETTINGS_ONLY_VERSION && hasExactKeys(value, ['version', 'settings'])) {
    const settings = admitSettings(value.settings, version);
    return settings && { settings, records: NO_RECORDS };
  }
  if (
    !Number.isInteger(version) ||
    (version as number) <= SETTINGS_ONLY_VERSION ||
    (version as number) > PLAYER_RECORD_VERSION ||
    !hasExactKeys(value, ['version', 'settings', 'records'])
  )
    return null;
  const settings = admitSettings(value.settings, version as number);
  if (!settings) return null;
  if (version !== PLAYER_RECORD_VERSION) return { settings, records: NO_RECORDS };
  if (!hasExactKeys(value.records, ['timeAttack'])) return null;
  return {
    settings,
    records: freezeRecords({
      timeAttack: admitEntries(value.records.timeAttack, isTimeAttackKey, admitTimeAttackRecord),
    }),
  };
}

/**
 * Settings of exactly the declared shape of record `version`: with their cameras from version 4, else the default
 * cameras, and with their steering from version 5, else the default steering.
 */
function admitSettings(settings: unknown, version: number): PlayerSettings | null {
  const withCameras = version >= STEERINGLESS_VERSION,
    withSteering = version >= MODE_RECORDS_VERSION;
  const keys = [
    'vehicleColors',
    'volumes',
    'latestSelections',
    ...(withCameras ? ['cameras'] : []),
    ...(withSteering ? ['steering'] : []),
  ];
  if (!hasExactKeys(settings, keys)) return null;
  const { vehicleColors, volumes, latestSelections } = settings;
  if (!isStringMap(vehicleColors) || !isStringMap(latestSelections) || !hasExactKeys(volumes, VOLUME_NAMES))
    return null;
  if (!VOLUME_NAMES.every((name) => isPercent(volumes[name]))) return null;
  const cameras = withCameras ? settings.cameras : DEFAULT_CAMERAS;
  if (!hasExactKeys(cameras, VEHICLE_FORMS)) return null;
  if (!VEHICLE_FORMS.every((form) => CAMERA_YAW_SOURCES.includes(cameras[form] as CameraYawSource))) return null;
  const steering = withSteering ? settings.steering : DEFAULT_STEERING;
  if (!hasExactKeys(steering, VEHICLE_FORMS) || !VEHICLE_FORMS.every((form) => isSteeringChoice(steering[form])))
    return null;
  return freezeSettings({
    vehicleColors,
    volumes: volumes as Record<VolumeName, number>,
    latestSelections,
    cameras: cameras as Record<VehicleForm, CameraYawSource>,
    steering: steering as Record<VehicleForm, SteeringRule>,
  });
}

/** A steering rule the player can choose: a steering reference and one of the offered utilizations. */
function isSteeringChoice(rule: unknown): rule is SteeringRule {
  return (
    hasExactKeys(rule, ['reference', 'utilization']) &&
    STEERING_REFERENCES.includes(rule.reference as SteeringRule['reference']) &&
    STEERING_UTILIZATIONS.includes(rule.utilization as number)
  );
}

/** The entries whose key and value have the declared shape; the others are dropped. */
function admitEntries<T>(
  entries: unknown,
  isKey: (key: string) => boolean,
  admit: (value: unknown) => T | null,
): Record<string, T> {
  const result: Record<string, T> = {};
  if (!isObject(entries)) return result;
  for (const [key, value] of Object.entries(entries)) {
    const entry = isKey(key) ? admit(value) : null;
    if (entry) result[key] = entry;
  }
  return result;
}

function parseKey(key: string): unknown[] | null {
  try {
    const parsed: unknown = JSON.parse(key);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}
function isTimeAttackKey(key: string): boolean {
  const parts = parseKey(key);
  return (
    parts !== null &&
    parts.length === 3 &&
    parts.every((part) => typeof part === 'string') &&
    timeAttackRecordKey(...(parts as [string, string, string])) === key
  );
}

function admitTimeAttackRecord(value: unknown): TimeAttackRecord | null {
  if (!hasExactKeys(value, ['timeMs', 'splitsMs', 'vehicleId', 'courseSha256', 'vehicleSha256'])) return null;
  const { timeMs, splitsMs, vehicleId, courseSha256, vehicleSha256 } = value;
  if (!isMilliseconds(timeMs) || !Array.isArray(splitsMs) || !splitsMs.every(isMilliseconds)) return null;
  if (typeof vehicleId !== 'string' || !isSha256(courseSha256) || !isSha256(vehicleSha256)) return null;
  return { timeMs, splitsMs, vehicleId, courseSha256, vehicleSha256 };
}

function freezeSettings(settings: PlayerSettings): PlayerSettings {
  return Object.freeze({
    vehicleColors: Object.freeze({ ...settings.vehicleColors }),
    volumes: Object.freeze({ ...settings.volumes }),
    latestSelections: Object.freeze({ ...settings.latestSelections }),
    cameras: Object.freeze({ ...settings.cameras }),
    steering: Object.freeze({
      car: createSteeringRule(settings.steering.car.reference, settings.steering.car.utilization),
      bike: createSteeringRule(settings.steering.bike.reference, settings.steering.bike.utilization),
    }),
  });
}
// The records the player record publishes, read-only down to every record and its splits, wherever they came from.
function freezeRecords(records: PlayerRecords): PlayerRecords {
  const freezeEach = <T>(table: Readonly<Record<string, T>>, freeze: (record: T) => T) =>
    Object.freeze(Object.fromEntries(Object.entries(table).map(([key, record]) => [key, freeze(record)])));
  return Object.freeze({
    timeAttack: freezeEach(records.timeAttack, (record) =>
      Object.freeze({ ...record, splitsMs: Object.freeze([...record.splitsMs]) }),
    ),
  });
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasExactKeys<K extends string>(value: unknown, keys: readonly K[]): value is Record<K, unknown> {
  if (!isObject(value)) return false;
  const own = Object.keys(value);
  return own.length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}

function isStringMap(value: unknown): value is Record<string, string> {
  return isObject(value) && Object.values(value).every((entry) => typeof entry === 'string');
}

function isPercent(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= 0 && (value as number) <= 100;
}

function isMilliseconds(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function isSha256(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);
}
