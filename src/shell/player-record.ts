/** The browser's one versioned player record; see [Browser operation](../../docs/browser.md#player-record). */
const PLAYER_RECORD_KEY = 'super-outride-player';
const PLAYER_RECORD_VERSION = 2;
/** The previous version, whose settings a version 2 record keeps. */
const SETTINGS_ONLY_VERSION = 1;

export const VOLUME_NAMES = ['master', 'music', 'effects'] as const;
export type VolumeName = (typeof VOLUME_NAMES)[number];

export interface PlayerSettings {
  /** Selected color ID by vehicle ID. */
  readonly vehicleColors: Readonly<Record<string, string>>;
  /** Integer percentages, 0–100. */
  readonly volumes: Readonly<Record<VolumeName, number>>;
  /** Latest selection by selection-screen key. */
  readonly latestSelections: Readonly<Record<string, string>>;
}

/** The identities a record was set against: the course build and the Session vehicle's delivered definitions. */
interface RecordIdentity {
  readonly courseSha256: string;
  readonly vehicleSha256: string;
}
/** A TIME TRIAL record: the fastest run's time and its gate and lap crossings, and the fastest lap, in milliseconds. */
export interface TimeTrialRecord extends RecordIdentity {
  readonly timeMs: number;
  /** The record run's race times at its gates and laps, in crossing order. */
  readonly splitsMs: readonly number[];
  /** The fastest lap on a CIRCUIT; null elsewhere. */
  readonly bestLapMs: number | null;
}
/** An ARCADE record: the fastest time to the goal reached, in milliseconds. */
export interface ArcadeRecord extends RecordIdentity {
  readonly timeMs: number;
}
/** Records by key; keys come only from {@link timeTrialRecordKey} and {@link arcadeRecordKey}. */
export interface PlayerRecords {
  readonly timeTrial: Readonly<Record<string, TimeTrialRecord>>;
  readonly arcade: Readonly<Record<string, ArcadeRecord>>;
}

/** A TIME TRIAL record's key: the course, the route (its Link IDs, empty on a circuit), the laps and the vehicle. */
export function timeTrialRecordKey(
  courseId: string,
  route: readonly string[],
  laps: number,
  vehicleId: string,
): string {
  return JSON.stringify([courseId, route, laps, vehicleId]);
}
/** An ARCADE record's key: the series, the course, the goal reached (its FINISH gate ID) and the vehicle. */
export function arcadeRecordKey(seriesId: string, courseId: string, goal: string, vehicleId: string): string {
  return JSON.stringify([seriesId, courseId, goal, vehicleId]);
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
});
const NO_RECORDS = freezeRecords({ timeTrial: {}, arcade: {} });

/**
 * Opens the player record in `storage`. A version 1 record keeps its settings and starts with no records. An absent,
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
 * The settings and records of a record with exactly the declared shape, or null: version 2, or version 1, whose
 * settings carry over with no records.
 */
function admitPlayerRecord(value: unknown): { settings: PlayerSettings; records: PlayerRecords } | null {
  if (!isObject(value)) return null;
  if (value.version === SETTINGS_ONLY_VERSION && hasExactKeys(value, ['version', 'settings'])) {
    const settings = admitSettings(value.settings);
    return settings && { settings, records: NO_RECORDS };
  }
  if (value.version !== PLAYER_RECORD_VERSION || !hasExactKeys(value, ['version', 'settings', 'records'])) return null;
  const settings = admitSettings(value.settings);
  if (!settings || !hasExactKeys(value.records, ['timeTrial', 'arcade'])) return null;
  return {
    settings,
    records: freezeRecords({
      timeTrial: admitEntries(value.records.timeTrial, isTimeTrialKey, admitTimeTrialRecord),
      arcade: admitEntries(value.records.arcade, isArcadeKey, admitArcadeRecord),
    }),
  };
}

function admitSettings(settings: unknown): PlayerSettings | null {
  if (!hasExactKeys(settings, ['vehicleColors', 'volumes', 'latestSelections'])) return null;
  const { vehicleColors, volumes, latestSelections } = settings;
  if (!isStringMap(vehicleColors) || !isStringMap(latestSelections) || !hasExactKeys(volumes, VOLUME_NAMES))
    return null;
  if (!VOLUME_NAMES.every((name) => isPercent(volumes[name]))) return null;
  return freezeSettings({
    vehicleColors,
    volumes: volumes as Record<VolumeName, number>,
    latestSelections,
  });
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
function isTimeTrialKey(key: string): boolean {
  const parts = parseKey(key);
  if (!parts || parts.length !== 4) return false;
  const [courseId, route, laps, vehicleId] = parts;
  return (
    typeof courseId === 'string' &&
    Array.isArray(route) &&
    route.every((link) => typeof link === 'string') &&
    Number.isInteger(laps) &&
    (laps as number) >= 1 &&
    typeof vehicleId === 'string' &&
    timeTrialRecordKey(courseId, route as string[], laps as number, vehicleId) === key
  );
}
function isArcadeKey(key: string): boolean {
  const parts = parseKey(key);
  return (
    parts !== null &&
    parts.length === 4 &&
    parts.every((part) => typeof part === 'string') &&
    arcadeRecordKey(...(parts as [string, string, string, string])) === key
  );
}

function admitIdentity(value: Record<string, unknown>): RecordIdentity | null {
  const { courseSha256, vehicleSha256 } = value;
  return isSha256(courseSha256) && isSha256(vehicleSha256) ? { courseSha256, vehicleSha256 } : null;
}
function admitTimeTrialRecord(value: unknown): TimeTrialRecord | null {
  if (!hasExactKeys(value, ['timeMs', 'splitsMs', 'bestLapMs', 'courseSha256', 'vehicleSha256'])) return null;
  const identity = admitIdentity(value);
  const { timeMs, splitsMs, bestLapMs } = value;
  if (!identity || !isMilliseconds(timeMs) || !Array.isArray(splitsMs) || !splitsMs.every(isMilliseconds)) return null;
  if (bestLapMs !== null && !isMilliseconds(bestLapMs)) return null;
  return { ...identity, timeMs, splitsMs, bestLapMs };
}
function admitArcadeRecord(value: unknown): ArcadeRecord | null {
  if (!hasExactKeys(value, ['timeMs', 'courseSha256', 'vehicleSha256'])) return null;
  const identity = admitIdentity(value);
  return identity && isMilliseconds(value.timeMs) ? { ...identity, timeMs: value.timeMs } : null;
}

function freezeSettings(settings: PlayerSettings): PlayerSettings {
  return Object.freeze({
    vehicleColors: Object.freeze({ ...settings.vehicleColors }),
    volumes: Object.freeze({ ...settings.volumes }),
    latestSelections: Object.freeze({ ...settings.latestSelections }),
  });
}
// The records the player record publishes, read-only down to every record and its splits, wherever they came from.
function freezeRecords(records: PlayerRecords): PlayerRecords {
  const freezeEach = <T>(table: Readonly<Record<string, T>>, freeze: (record: T) => T) =>
    Object.freeze(Object.fromEntries(Object.entries(table).map(([key, record]) => [key, freeze(record)])));
  return Object.freeze({
    timeTrial: freezeEach(records.timeTrial, (record) =>
      Object.freeze({ ...record, splitsMs: Object.freeze([...record.splitsMs]) }),
    ),
    arcade: freezeEach(records.arcade, (record) => Object.freeze({ ...record })),
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
