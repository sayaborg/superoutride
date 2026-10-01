/** The browser's one versioned player record; see [Browser operation](../../docs/browser.md#player-record). */
const PLAYER_RECORD_KEY = 'super-outride-player';
const PLAYER_RECORD_VERSION = 1;

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

export interface PlayerRecord {
  readonly settings: PlayerSettings;
  /** Replaces the given settings and saves the record; without storage the change lives for the page. */
  updateSettings(change: Partial<PlayerSettings>): void;
}

const DEFAULT_SETTINGS = freezeSettings({
  vehicleColors: {},
  volumes: { master: 35, music: 100, effects: 100 },
  latestSelections: {},
});

/**
 * Opens the player record in `storage`. An absent, unreadable, corrupt or other-version record starts from the
 * defaults, and storage failures leave the record in memory; neither stops the game.
 */
export function openPlayerRecord(storage: Storage | null): PlayerRecord {
  let settings = readSettings(storage) ?? DEFAULT_SETTINGS;
  return {
    get settings() {
      return settings;
    },
    updateSettings(change) {
      settings = freezeSettings({ ...settings, ...change });
      try {
        storage?.setItem(PLAYER_RECORD_KEY, JSON.stringify({ version: PLAYER_RECORD_VERSION, settings }));
      } catch {
        // Quota, privacy mode or a revoked origin keeps the change for this page only.
      }
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

function readSettings(storage: Storage | null): PlayerSettings | null {
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

/** The settings of a current-version record with exactly the declared shape, or null. */
function admitPlayerRecord(value: unknown): PlayerSettings | null {
  if (!hasExactKeys(value, ['version', 'settings']) || value.version !== PLAYER_RECORD_VERSION) return null;
  const settings = value.settings;
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

function freezeSettings(settings: PlayerSettings): PlayerSettings {
  return Object.freeze({
    vehicleColors: Object.freeze({ ...settings.vehicleColors }),
    volumes: Object.freeze({ ...settings.volumes }),
    latestSelections: Object.freeze({ ...settings.latestSelections }),
  });
}

function hasExactKeys<K extends string>(value: unknown, keys: readonly K[]): value is Record<K, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const own = Object.keys(value);
  return own.length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}

function isStringMap(value: unknown): value is Record<string, string> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Object.values(value).every((entry) => typeof entry === 'string')
  );
}

function isPercent(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= 0 && (value as number) <= 100;
}
