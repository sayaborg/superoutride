import {
  AdmissionError,
  admit,
  readDocument,
  readNumber,
  readRecord,
  type AdmissionResult,
} from '../core/admission.js';
import { resolveControlSettings, type ControlSettings } from './audio-control-policy.js';
import { resolveRivalSettings, type RivalSettings } from './audio-scene.js';
import { resolveExhaustSettings, type ExhaustSettings } from './exhaust-acoustics.js';
import { resolveMixSettings, type MixSettings } from './sound-graph.js';
import { resolveRollingSettings, type RollingSettings } from './tire-rolling-acoustics.js';
import { resolveUnifiedSettings, type UnifiedSettings } from './tire-unified-acoustics.js';
import { resolveScrapeSettings, type ScrapeSettings } from './wall-scrape-acoustics.js';
import { DEFAULT_AUDIO_SETTINGS } from './audio-defaults.js';

/** The game-wide sound settings: every DEV sound panel's record. */
export interface AudioSettings {
  readonly exhaust: ExhaustSettings;
  readonly unified: UnifiedSettings;
  readonly scrape: ScrapeSettings;
  readonly rolling: RollingSettings;
  readonly mix: MixSettings;
  readonly control: ControlSettings;
  readonly rival: RivalSettings;
}

export interface CompiledAudioSettings extends AudioSettings {
  readonly sha256: string;
}

export const AUDIO_DOCUMENT_FORMAT = 'superoutride.audio';
export const AUDIO_DOCUMENT_VERSION = 2;

/**
 * Each record's resolver: the one value check, applied where settings are admitted (this document and the DEV
 * panels). Voices, worklets and kernels use admitted records as given.
 */
const RESOLVERS = {
  exhaust: resolveExhaustSettings,
  unified: resolveUnifiedSettings,
  scrape: resolveScrapeSettings,
  rolling: resolveRollingSettings,
  mix: resolveMixSettings,
  control: resolveControlSettings,
  rival: resolveRivalSettings,
} as const satisfies { [K in keyof AudioSettings]: (value: Partial<AudioSettings[K]>) => AudioSettings[K] };
type Section = keyof typeof RESOLVERS;
const SECTIONS = Object.keys(RESOLVERS) as Section[];

// The defaults are admitted here, once, like a document: assemblies that use them use admitted records.
for (const section of SECTIONS) {
  try {
    (RESOLVERS[section] as (value: object) => unknown)(DEFAULT_AUDIO_SETTINGS[section]);
  } catch (error) {
    throw new Error(`Default audio settings are invalid: ${section}`, { cause: error });
  }
}

/** The saved document for a settings snapshot, as the DEV export writes it. */
export function audioSettingsDocument(settings: AudioSettings) {
  return {
    format: AUDIO_DOCUMENT_FORMAT,
    version: AUDIO_DOCUMENT_VERSION,
    ...Object.fromEntries(SECTIONS.map((section) => [section, settings[section]])),
  };
}

/**
 * Admit the `superoutride.audio` version 1 document. The reader checks format, version and each record's exact
 * numeric fields; each record's resolver alone validates its values. A resolver's `RangeError` becomes an
 * `invalid_value` diagnostic at the named field (`/exhaust/pulseRiseMs`), or at the record for a cross-field rule.
 */
export function compileAudioDocument(
  value: unknown,
  path: string,
  sha256: string,
): AdmissionResult<CompiledAudioSettings> {
  return admit(path, () => {
    const v = readDocument(value, ['format', 'version', ...SECTIONS], AUDIO_DOCUMENT_FORMAT, AUDIO_DOCUMENT_VERSION);
    const read = <K extends Section>(section: K): AudioSettings[K] => {
      const keys = Object.keys(DEFAULT_AUDIO_SETTINGS[section]);
      const record = readRecord(v[section], `/${section}`, keys);
      const numbers = Object.fromEntries(keys.map((key) => [key, readNumber(record[key], `/${section}/${key}`)]));
      try {
        return (RESOLVERS[section] as (value: object) => AudioSettings[K])(numbers);
      } catch (error) {
        if (!(error instanceof RangeError)) throw error;
        const key = error.message.slice(error.message.lastIndexOf(': ') + 2);
        throw new AdmissionError(
          'invalid_value',
          keys.includes(key) ? `/${section}/${key}` : `/${section}`,
          error.message,
        );
      }
    };
    return Object.freeze({
      exhaust: read('exhaust'),
      unified: read('unified'),
      scrape: read('scrape'),
      rolling: read('rolling'),
      mix: read('mix'),
      control: read('control'),
      rival: read('rival'),
      sha256,
    });
  });
}
