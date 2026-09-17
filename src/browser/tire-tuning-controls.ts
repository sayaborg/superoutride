import { MODAL_TUNING_RANGES, resolveModalTuning, type ModalTuning } from '../audio/tire-modal-acoustics.js';
import { createRangeControl } from './range-control.js';

// Labels only: audio owns defaults, bounds and validation. These are not physical tire settings.
const LABELS = {
  feedbackMaximum: ['自己励振の強さ', ''],
  saturation: ['振幅の飽和', ''],
  powerReferenceWatts: ['摩擦仕事の基準', 'W'],
  slipHalfMps: ['滑り応答の半飽和', 'm/s'],
  slipRolloffMps: ['大きな滑りの抑制尺度', 'm/s'],
  noiseRms: ['不規則な励振の強さ', ''],
  pitchBaseHz: ['基本ピッチ', 'Hz'],
  bandwidthHz: ['帯域幅・減衰', 'Hz'],
  wanderDepth: ['ピッチの揺らぎ', ''],
  outputGain: ['摩擦音Qの出力ゲイン', ''],
} as const satisfies Record<keyof ModalTuning, readonly [string, string]>;

export function mountTireTuningControls(container: HTMLElement, onChange: () => void) {
  let tuning = resolveModalTuning();
  const fieldset = document.createElement('fieldset');
  const legend = document.createElement('legend');
  legend.textContent = 'MODAL · 摩擦音Q';
  const note = document.createElement('p');
  note.textContent = 'MODAL選択時のみ有効。実測値ではない音響調整です。設定は再読み込みで戻ります。';
  const controls = (Object.keys(LABELS) as (keyof ModalTuning)[]).map((key) => {
    const [label, unit] = LABELS[key];
    const control = createRangeControl(
      label,
      MODAL_TUNING_RANGES[key],
      tuning[key],
      (value) => {
        tuning = resolveModalTuning({ ...tuning, [key]: value });
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
  reset.textContent = 'MODALを初期値に戻す';
  const restore = (): void => {
    tuning = resolveModalTuning();
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
