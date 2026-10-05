import { DEFAULT_AUDIO_SETTINGS } from './audio-defaults.js';
/**
 * Audio control time constants: listening settings with no derivation, chosen by ear on the DEV TIMING panel.
 * They never describe mechanical or pipe properties.
 */
export interface ControlSettings {
  /** Kernels follow acoustic observations (engine RPM/opening, tire inputs) per sample. */
  readonly observationSeconds: number;
  /** Voice output gain following (rival distance gain, tire output recovery). */
  readonly gainSeconds: number;
  /** Bus and master gains. */
  readonly mixSeconds: number;
  /** Rival pan. */
  readonly panSeconds: number;
  /** Fade-out before replacement and on silence. */
  readonly fadeSeconds: number;
  /** R/Q output switching inside the tire kernel. */
  readonly componentSeconds: number;
  /** Time given to a fade before a discontinuity (kernel replacement, context suspension). */
  readonly transitionSeconds: number;
  /** The run's track fades out over this time at GOAL and GAME OVER. */
  readonly musicFadeSeconds: number;
}

interface SettingRange {
  readonly min: number;
  readonly max: number;
  readonly step: number;
}
// About a quarter to four times each default.
export const CONTROL_SETTING_RANGES: Readonly<Record<keyof ControlSettings, SettingRange>> = Object.freeze({
  observationSeconds: Object.freeze({ min: 0.006, max: 0.1, step: 0.001 }),
  gainSeconds: Object.freeze({ min: 0.006, max: 0.1, step: 0.001 }),
  mixSeconds: Object.freeze({ min: 0.004, max: 0.06, step: 0.001 }),
  panSeconds: Object.freeze({ min: 0.015, max: 0.24, step: 0.001 }),
  fadeSeconds: Object.freeze({ min: 0.003, max: 0.04, step: 0.001 }),
  componentSeconds: Object.freeze({ min: 0.001, max: 0.02, step: 0.001 }),
  transitionSeconds: Object.freeze({ min: 0.023, max: 0.36, step: 0.001 }),
  musicFadeSeconds: Object.freeze({ min: 0.5, max: 8, step: 0.1 }),
});

export function resolveControlSettings(overrides: Partial<ControlSettings> = {}): ControlSettings {
  const settings = { ...DEFAULT_AUDIO_SETTINGS.control };
  for (const key of Object.keys(CONTROL_SETTING_RANGES) as (keyof ControlSettings)[]) {
    const value = overrides[key] === undefined ? settings[key] : overrides[key];
    const range = CONTROL_SETTING_RANGES[key];
    if (!Number.isFinite(value) || value < range.min || value > range.max)
      throw new RangeError(`invalid audio control settings: ${key}`);
    settings[key] = value;
  }
  return Object.freeze(settings);
}

export function sameControlSettings(left: ControlSettings | undefined, right: ControlSettings): boolean {
  if (!left) return false;
  for (const key of Object.keys(CONTROL_SETTING_RANGES) as (keyof ControlSettings)[])
    if (left[key] !== right[key]) return false;
  return true;
}
