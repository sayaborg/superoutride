import {
  UNIFIED_SETTING_RANGES,
  resolveUnifiedSettings,
  type UnifiedSettings,
} from '../audio/tire-unified-acoustics.js';
import { createSoundSettingsPanel, mountSoundSettingsPanel } from './sound-settings-panel.js';

// Labels only: audio owns defaults, bounds and validation. These are not physical tire settings.
const UNIFIED_LABELS = {
  feedbackMaximumPerSecond: ['自己励振の強さ', '/s'],
  powerReferenceWatts: ['摩擦仕事の基準', 'W'],
  noiseForcePerSecond: ['入力ノイズの強さ', '/s'],
  lowFrequencyHz: ['低域モードの固有周波数', 'Hz'],
  highFrequencyHz: ['高域モードの固有周波数', 'Hz'],
  outputGainPerSecond: ['摩擦音Qの出力ゲイン', '/s'],
} as const satisfies Record<keyof UnifiedSettings, readonly [string, string]>;

export function mountTireSoundSettings(container: HTMLElement, onChange: () => void) {
  return mountSoundSettingsPanel(
    container,
    createSoundSettingsPanel(
      'UNIFIED · 摩擦音Q',
      UNIFIED_SETTING_RANGES,
      resolveUnifiedSettings,
      UNIFIED_LABELS,
      onChange,
      'UNIFIEDを初期値に戻す',
    ),
  );
}
