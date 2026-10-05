import {
  CONTROL_SETTING_RANGES,
  resolveControlSettings,
  type ControlSettings,
} from '../../audio/audio-control-policy.js';
import { RIVAL_SETTING_RANGES, resolveRivalSettings, type RivalSettings } from '../../audio/audio-scene.js';
import { MIX_SETTING_RANGES, resolveMixSettings, type MixSettings } from '../../audio/sound-graph.js';
import { createSoundSettingsPanel, mountSoundSettingsPanel } from './sound-settings-panel.js';

// Labels only: audio owns defaults, bounds and validation.
const MIX_LABELS = {
  thresholdDb: ['Compressor threshold', 'dB'],
  kneeDb: ['Compressor knee', 'dB'],
  ratio: ['Compressor ratio', ':1'],
  attackSeconds: ['Compressor attack', 's'],
  releaseSeconds: ['Compressor release', 's'],
} as const satisfies Record<keyof MixSettings, readonly [string, string]>;

const TIMING_LABELS = {
  observationSeconds: ['Observation smoothing', 's'],
  gainSeconds: ['Output gain smoothing', 's'],
  mixSeconds: ['Bus and MASTER volume smoothing', 's'],
  panSeconds: ['Rival pan smoothing', 's'],
  fadeSeconds: ['Fade before replacement', 's'],
  componentSeconds: ['R/Q switch smoothing', 's'],
  transitionSeconds: ['Wait before a discontinuity', 's'],
  musicFadeSeconds: ['Music fade at GOAL and GAME OVER', 's'],
} as const satisfies Record<keyof ControlSettings, readonly [string, string]>;

const RIVAL_LABELS = {
  audibleMeters: ['Maximum audible distance', 'm'],
  referenceMeters: ['Reference distance for level 1', 'm'],
  panMinimumMeters: ['Minimum pan distance', 'm'],
  reassignmentSeconds: ['Rival reassignment wait', 's'],
} as const satisfies Record<keyof RivalSettings, readonly [string, string]>;

export function mountMixSoundSettings(host: HTMLElement, initial: MixSettings, onChange: () => void) {
  return mountSoundSettingsPanel(
    host,
    createSoundSettingsPanel(
      'MIX',
      MIX_SETTING_RANGES,
      resolveMixSettings,
      initial,
      MIX_LABELS,
      onChange,
      'Reset MIX to defaults',
    ),
  );
}

export function mountTimingSoundSettings(host: HTMLElement, initial: ControlSettings, onChange: () => void) {
  return mountSoundSettingsPanel(
    host,
    createSoundSettingsPanel(
      'TIMING',
      CONTROL_SETTING_RANGES,
      resolveControlSettings,
      initial,
      TIMING_LABELS,
      onChange,
      'Reset TIMING to defaults',
    ),
  );
}

export function mountRivalSoundSettings(host: HTMLElement, initial: RivalSettings, onChange: () => void) {
  return mountSoundSettingsPanel(
    host,
    createSoundSettingsPanel(
      'RIVAL',
      RIVAL_SETTING_RANGES,
      resolveRivalSettings,
      initial,
      RIVAL_LABELS,
      onChange,
      'Reset RIVAL to defaults',
    ),
  );
}
