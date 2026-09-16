import { UNIFIED_TUNING_RANGES, resolveUnifiedTuning, type UnifiedTuning } from '../audio/tire-unified-acoustics.js';
import { createRangeControl } from './range-control.js';

// Labels only: audio owns defaults, bounds and validation. These are not physical tire settings.
const LABELS = {
  feedbackMaximumPerSecond: ['自己励振の強さ', '/s'],
  saturationPerSecond: ['振幅の飽和', '/s'],
  powerReferenceWatts: ['摩擦仕事の基準', 'W'],
  slipHalfMps: ['滑り応答の半飽和', 'm/s'],
  slipRolloffMps: ['大きな滑りの抑制尺度', 'm/s'],
  noiseBandwidthHz: ['入力ノイズの帯域', 'Hz'],
  noiseForcePerSecond: ['入力ノイズの強さ', '/s'],
  lowFrequencyHz: ['低域モードの固有周波数', 'Hz'],
  highFrequencyHz: ['高域モードの固有周波数', 'Hz'],
  outputGainPerSecond: ['摩擦音Qの出力ゲイン', '/s'],
  outputCutoffHz: ['摩擦音Qの高域上限', 'Hz'],
} as const satisfies Record<keyof UnifiedTuning, readonly [string, string]>;

export function mountTireTuningControls(container: HTMLElement, onChange: () => void) {
  let tuning = resolveUnifiedTuning();
  const fieldset = document.createElement('fieldset');
  const legend = document.createElement('legend');
  legend.textContent = 'UNIFIED · 摩擦音Q';
  const note = document.createElement('p');
  note.textContent =
    '実測値ではない音響調整です。UNIFIED選択時のみ有効。変更時はタイヤ音を短くフェードして再生成します。設定は再読み込みで戻ります。';
  const controls = (Object.keys(LABELS) as (keyof UnifiedTuning)[]).map((key) => {
    const [label, unit] = LABELS[key];
    const control = createRangeControl(
      label,
      UNIFIED_TUNING_RANGES[key],
      tuning[key],
      (value) => {
        tuning = resolveUnifiedTuning({ ...tuning, [key]: value });
        onChange();
      },
      unit,
    );
    control.group.setAttribute('data-tire-tuning-key', key);
    return { key, ...control };
  });
  const reset = document.createElement('button');
  reset.type = 'button';
  reset.className = 'selector-button';
  reset.textContent = 'UNIFIEDを初期値に戻す';
  const restore = (): void => {
    tuning = resolveUnifiedTuning();
    for (const control of controls) control.setValue(tuning[control.key]);
    onChange();
  };
  reset.addEventListener('click', restore);
  fieldset.replaceChildren(legend, note, ...controls.map((c) => c.group), reset);
  container.replaceChildren(fieldset);
  return {
    read: () => tuning,
    setEnabled(value: boolean): void {
      fieldset.disabled = !value;
    },
    dispose(): void {
      reset.removeEventListener('click', restore);
      for (const control of controls) control.dispose();
      container.replaceChildren();
    },
  };
}
