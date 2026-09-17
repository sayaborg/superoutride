import { MODAL_TUNING_RANGES, resolveModalTuning, type ModalTuning } from '../audio/tire-modal-acoustics.js';
import { UNIFIED_TUNING_RANGES, resolveUnifiedTuning, type UnifiedTuning } from '../audio/tire-unified-acoustics.js';
import type { TireTuning } from '../audio/tire-tuning.js';
import type { TireSoundModel } from '../audio/tire-sound-controls.js';
import { createRangeControl } from './range-control.js';

// Labels only: audio owns defaults, bounds and validation. These are not physical tire settings.
const MODAL_LABELS = {
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

const UNIFIED_LABELS = {
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

function createPanel<T extends Readonly<Record<string, number>>>(
  name: string,
  ranges: Readonly<Record<keyof T, { min: number; max: number; step: number }>>,
  resolve: (value?: Partial<T>) => T,
  labels: Readonly<Record<keyof T, readonly [string, string]>>,
  onChange: () => void,
) {
  let tuning = resolve();
  const fieldset = document.createElement('fieldset');
  const legend = document.createElement('legend');
  legend.textContent = `${name} · 摩擦音Q`;
  const note = document.createElement('p');
  note.textContent = '実測値ではない音響調整です。設定は方式ごとに保持され、再読み込みで戻ります。';
  const controls = (Object.keys(labels) as (keyof T)[]).map((key) => {
    const [label, unit] = labels[key];
    const control = createRangeControl(
      label,
      ranges[key],
      tuning[key]!,
      (value) => {
        tuning = resolve({ ...tuning, [key]: value });
        onChange();
      },
      unit,
    );
    control.group.setAttribute('data-tire-tuning-key', String(key));
    return { key, ...control };
  });
  const reset = document.createElement('button');
  reset.type = 'button';
  reset.className = 'selector-button';
  reset.textContent = `${name}を初期値に戻す`;
  const restore = (): void => {
    tuning = resolve();
    for (const control of controls) control.setValue(tuning[control.key]!);
    onChange();
  };
  reset.addEventListener('click', restore);
  fieldset.replaceChildren(legend, note, ...controls.map((c) => c.group), reset);
  return {
    fieldset,
    read: () => tuning,
    dispose(): void {
      reset.removeEventListener('click', restore);
      for (const control of controls) control.dispose();
    },
  };
}

export function mountTireTuningControls(container: HTMLElement, onChange: () => void) {
  const modal = createPanel('MODAL', MODAL_TUNING_RANGES, resolveModalTuning, MODAL_LABELS, onChange);
  const unified = createPanel('UNIFIED', UNIFIED_TUNING_RANGES, resolveUnifiedTuning, UNIFIED_LABELS, onChange);
  const panels = { modal, unified };
  let model: TireSoundModel = 'modal',
    enabled = true;
  function show(): void {
    for (const [key, panel] of Object.entries(panels)) {
      panel.fieldset.hidden = key !== model;
      panel.fieldset.disabled = !enabled || key !== model;
    }
  }
  container.replaceChildren(modal.fieldset, unified.fieldset);
  show();
  return {
    read(): TireTuning | null {
      if (model === 'modal') return { model, tuning: modal.read() };
      if (model === 'unified') return { model, tuning: unified.read() };
      return null;
    },
    setModel(value: TireSoundModel): void {
      model = value;
      show();
    },
    setEnabled(value: boolean): void {
      enabled = value;
      show();
    },
    dispose(): void {
      for (const panel of Object.values(panels)) panel.dispose();
      container.replaceChildren();
    },
  };
}
