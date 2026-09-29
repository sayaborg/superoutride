import { CONTROL_SETTING_RANGES, resolveControlSettings, type ControlSettings } from '../audio/audio-control-policy.js';
import { RIVAL_SETTING_RANGES, resolveRivalSettings, type RivalSettings } from '../audio/audio-scene.js';
import { MIX_SETTING_RANGES, resolveMixSettings, type MixSettings } from '../audio/sound-graph.js';
import { createSoundSettingsPanel, mountSoundSettingsPanel } from './sound-settings-panel.js';

// Labels only: audio owns defaults, bounds and validation.
const MIX_LABELS = {
  thresholdDb: ['コンプレッサーのしきい値', 'dB'],
  kneeDb: ['コンプレッサーのニー', 'dB'],
  ratio: ['コンプレッサーの比', ':1'],
  attackSeconds: ['コンプレッサーのアタック', 's'],
  releaseSeconds: ['コンプレッサーのリリース', 's'],
} as const satisfies Record<keyof MixSettings, readonly [string, string]>;

const TIMING_LABELS = {
  observationSeconds: ['観測値の追従', 's'],
  gainSeconds: ['出力ゲインの追従', 's'],
  mixSeconds: ['バス・MASTER音量の追従', 's'],
  panSeconds: ['ライバルのパンの追従', 's'],
  fadeSeconds: ['差し替え前のフェード', 's'],
  componentSeconds: ['R/Q切り替えの追従', 's'],
  transitionSeconds: ['不連続の前に待つ時間', 's'],
} as const satisfies Record<keyof ControlSettings, readonly [string, string]>;

const RIVAL_LABELS = {
  audibleMeters: ['聞こえる距離の上限', 'm'],
  referenceMeters: ['音量1の基準距離', 'm'],
  panMinimumMeters: ['パンの距離の下限', 'm'],
  reassignmentSeconds: ['ライバル切り替えの待ち', 's'],
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
      'MIXを初期値に戻す',
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
      'TIMINGを初期値に戻す',
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
      'RIVALを初期値に戻す',
    ),
  );
}
