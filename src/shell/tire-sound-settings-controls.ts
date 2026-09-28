import {
  UNIFIED_SETTING_RANGES,
  resolveUnifiedSettings,
  type UnifiedSettings,
} from '../audio/tire-unified-acoustics.js';
import { createRangeControl } from './range-control.js';

// Labels only: audio owns defaults, bounds and validation. These are not physical tire settings.
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
} as const satisfies Record<keyof UnifiedSettings, readonly [string, string]>;

function createPanel<T extends Readonly<Record<string, number>>>(
  name: string,
  ranges: Readonly<Record<keyof T, { min: number; max: number; step: number }>>,
  resolve: (value?: Partial<T>) => T,
  labels: Readonly<Record<keyof T, readonly [string, string]>>,
  onChange: () => void,
) {
  let settings = resolve();
  const fieldset = document.createElement('fieldset');
  const legend = document.createElement('legend');
  legend.textContent = `${name} · 摩擦音Q`;
  const note = document.createElement('p');
  note.textContent = '実測値ではない音響調整です。設定は再読み込みで戻ります。';
  const controls = (Object.keys(labels) as (keyof T)[]).map((key) => {
    const [label, unit] = labels[key];
    const control = createRangeControl(
      label,
      ranges[key],
      settings[key]!,
      (value) => {
        settings = resolve({ ...settings, [key]: value });
        onChange();
      },
      unit,
    );
    control.group.setAttribute('data-tire-settings-key', String(key));
    return { key, ...control };
  });
  const reset = document.createElement('button');
  reset.type = 'button';
  reset.className = 'selector-button';
  reset.textContent = `${name}を初期値に戻す`;
  const restore = (): void => {
    settings = resolve();
    for (const control of controls) control.setValue(settings[control.key]!);
    onChange();
  };
  reset.addEventListener('click', restore);
  fieldset.replaceChildren(legend, note, ...controls.map((c) => c.group), reset);
  return {
    fieldset,
    read: () => settings,
    dispose(): void {
      reset.removeEventListener('click', restore);
      for (const control of controls) control.dispose();
    },
  };
}

export function mountTireSoundSettings(container: HTMLElement, onChange: () => void) {
  const panel = createPanel('UNIFIED', UNIFIED_SETTING_RANGES, resolveUnifiedSettings, UNIFIED_LABELS, onChange);
  container.replaceChildren(panel.fieldset);
  return {
    read: panel.read,
    setEnabled(value: boolean): void {
      panel.fieldset.disabled = !value;
    },
    dispose(): void {
      panel.dispose();
      container.replaceChildren();
    },
  };
}
