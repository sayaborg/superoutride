import { DEFAULT_EXHAUST_SETTINGS, EXHAUST_SETTING_RANGES } from '../audio/exhaust-acoustics.js';
import type { ExhaustSettings } from '../audio/exhaust-acoustics.js';
import { createNumberStepper } from './number-stepper.js';

// Presentation owns labels/order only. Acoustic settings own all numeric domains and steps.
const CONTROLS = [
  [
    'outletReflection',
    '出口の反射係数',
    '',
    '低周波の圧力反射係数。開放端の極限は−1（反転して反射）、0は出口反射なしです。',
  ],
  [
    'returnCutoffHz',
    '反射波の高域上限',
    'Hz',
    '一次ローパス、約−6 dB/oct。開放端の低周波特性に合わせた近似です。気筒側の反射フィルターにも共用します。',
  ],
  [
    'attenuationPerMeter',
    '距離あたりの減衰',
    'Np/m',
    '振幅は距離Lに対し exp(−αL) で減衰します。実際の周波数依存損失を定数で近似しています。',
  ],
  [
    'closedExcitation',
    '全閉時の励振',
    '',
    '全閉時に残す励振の割合。パルスの強さと立ち上がりを変える音作りの設定で、実測の燃焼圧力ではありません。',
  ],
  [
    'outputCutoffHz',
    '最終LPF（マフラー相当）',
    'Hz',
    'ソフトクリップ後の一次LPF、約−6 dB/oct。反射波用とは独立した音色調整です。実車マフラーの測定特性ではありません。',
  ],
  [
    'pulseVariation',
    'パルスの揺らぎ',
    '',
    '全開時の強度を基準に、各点火へ±この割合の揺らぎを加えます。標準は±20%。アクセルオフでも同じ幅を保ち、強度の下限は0です。点火時刻とRPMは変えません。',
  ],
  [
    'pulseRiseMs',
    'パルスの立ち上がり',
    'ms',
    '全車種共通の全励振時の時定数。小さいほど鋭くなります。低負荷では立ち上がりが緩やかになります。',
  ],
  ['pulseDecayMs', 'パルスの減衰', 'ms', '全車種共通の減衰時定数。大きいほどパルスの尾が長くなります。'],
] as const;

export function mountEngineSoundSettings(
  container: HTMLElement,
  onChange: (settings: ExhaustSettings) => void,
  documentRef: Document = document,
) {
  const settings = { ...DEFAULT_EXHAUST_SETTINGS };
  const steppers = new Map<keyof typeof settings, ReturnType<typeof createNumberStepper>>();
  const listeners: (() => void)[] = [];
  const listen = (element: HTMLElement, type: string, handler: (event: Event) => void) => {
    element.addEventListener(type, handler);
    listeners.push(() => element.removeEventListener(type, handler));
  };
  const rows = CONTROLS.map(([key, title, unit, explanation]) => {
    const range = EXHAUST_SETTING_RANGES[key];
    const row = documentRef.createElement('div');
    row.className = 'audio-tuning-row';
    row.setAttribute('title', explanation);
    row.setAttribute('data-tuning-key', key);
    const caption = documentRef.createElement('span');
    caption.textContent = title;
    const control = createNumberStepper(
      {
        label: title,
        min: range.uiMin ?? range.min,
        max: range.uiMax ?? range.max,
        step: range.step,
        value: settings[key],
        format: (value) =>
          key === 'pulseVariation'
            ? `±${Math.round(value * 100)}%${value === 0 ? '（揺らぎなし）' : ''}`
            : `${value} ${unit}${key === 'outletReflection' && value === 0 ? '（反射なし）' : ''}`.trim(),
        onChange(value) {
          settings[key] = value;
          onChange({ ...settings });
        },
      },
      documentRef,
    );
    steppers.set(key, control);
    row.replaceChildren(caption, control.group);
    return row;
  });
  const reset = documentRef.createElement('button');
  reset.type = 'button';
  reset.className = 'selector-button audio-tuning-reset';
  reset.textContent = 'デフォルトに戻す';
  listen(reset, 'click', () => {
    Object.assign(settings, DEFAULT_EXHAUST_SETTINGS);
    for (const [key, control] of steppers) control.setValue(settings[key]);
    onChange({ ...settings });
  });
  listen(reset, 'keydown', (event) => event.stopPropagation());
  container.replaceChildren(...rows, reset);
  return {
    read: () => ({ ...settings }),
    dispose() {
      for (const remove of listeners) remove();
      for (const control of steppers.values()) control.dispose();
      container.replaceChildren();
    },
  };
}
