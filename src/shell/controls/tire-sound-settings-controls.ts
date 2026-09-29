import {
  UNIFIED_SETTING_RANGES,
  resolveUnifiedSettings,
  type UnifiedSettings,
} from '../../audio/tire-unified-acoustics.js';
import {
  ROLLING_SETTING_RANGES,
  resolveRollingSettings,
  type RollingSettings,
} from '../../audio/tire-rolling-acoustics.js';
import { createSoundSettingsPanel, mountSoundSettingsPanel } from './sound-settings-panel.js';

// Labels only: audio owns defaults, bounds and validation. These are not physical tire settings.
const UNIFIED_LABELS = {
  feedbackMaximumPerSecond: ['自己励振の強さ', '/s'],
  powerReferenceWatts: ['摩擦仕事の基準', 'W'],
  noiseForcePerSecond: ['入力ノイズの強さ', '/s'],
  lowFrequencyHz: ['低域モードの固有周波数', 'Hz'],
  highFrequencyHz: ['高域モードの固有周波数', 'Hz'],
  outputGainPerSecond: ['摩擦音Qの出力ゲイン', '/s'],
  saturationPerSecond: ['自己励振の飽和（3乗の散逸）', '/s'],
  slipHalfMps: ['自己励振が半分になる滑り', 'm/s'],
  slipRolloffMps: ['高い滑りで励振が落ちる速さ', 'm/s'],
  noiseBandwidthHz: ['入力ノイズの帯域', 'Hz'],
  outputCutoffHz: ['摩擦音Qの出力LPF', 'Hz'],
  resonanceDampingPerSecond: ['2つのモードの減衰', '/s'],
  lowParticipation: ['低域モードの参加率（高域は√(1−値²)）', ''],
  dcHz: ['摩擦音QのDC除去', 'Hz'],
} as const satisfies Record<keyof UnifiedSettings, readonly [string, string]>;

const ROLLING_LABELS = {
  toneSeconds: ['路面・車輪周波数の追従', 's'],
  lowOrder: ['低い帯域の車輪次数', '次'],
  highOrder: ['高い帯域の車輪次数', '次'],
  minimumHz: ['帯域中心の下限', 'Hz'],
  bandwidthRatio: ['帯域幅の比', ''],
  loadHalfNewtons: ['音量が半分になる荷重', 'N'],
  speedHalfMps: ['音量が半分になる速度', 'm/s'],
  speedExponent: ['速度の指数', ''],
  attackSeconds: ['音量の立ち上がり', 's'],
  releaseSeconds: ['音量の立ち下がり', 's'],
  textureMinimumDepth: ['路面テクスチャの最小の深さ', ''],
  textureMaximumHz: ['テクスチャの最大の速さ', 'Hz'],
  gain: ['転がり音Rの出力ゲイン', ''],
  outputHz: ['転がり音Rの出力LPF', 'Hz'],
  dcHz: ['転がり音RのDC除去', 'Hz'],
} as const satisfies Record<keyof RollingSettings, readonly [string, string]>;

export function mountTireSoundSettings(container: HTMLElement, initial: UnifiedSettings, onChange: () => void) {
  return mountSoundSettingsPanel(
    container,
    createSoundSettingsPanel(
      'UNIFIED · 摩擦音Q',
      UNIFIED_SETTING_RANGES,
      resolveUnifiedSettings,
      initial,
      UNIFIED_LABELS,
      onChange,
      'UNIFIEDを初期値に戻す',
    ),
  );
}

export function mountRollingSoundSettings(container: HTMLElement, initial: RollingSettings, onChange: () => void) {
  return mountSoundSettingsPanel(
    container,
    createSoundSettingsPanel(
      'ROLLING · 転がり音R',
      ROLLING_SETTING_RANGES,
      resolveRollingSettings,
      initial,
      ROLLING_LABELS,
      onChange,
      'ROLLINGを初期値に戻す',
    ),
  );
}
