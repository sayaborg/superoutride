import { DEFAULT_EXHAUST_TUNING } from '../audio/exhaust-acoustics.js';

// Shared audition/game presentation; the DSP remains the owner of coefficient defaults and validation.
const CONTROLS = [
  [
    'outletReflection',
    '出口の反射係数',
    -1,
    0,
    0.01,
    '',
    '低周波の圧力反射係数。開放端の極限は−1（反転して反射）、0は出口反射なしです。',
  ],
  [
    'returnCutoffHz',
    '反射波の高域上限',
    500,
    10000,
    100,
    'Hz',
    '一次ローパス、約−6 dB/oct。開放端の低周波特性に合わせた近似です。気筒側の反射フィルターにも共用します。',
  ],
  [
    'attenuationPerMeter',
    '距離あたりの減衰',
    0,
    0.3,
    0.01,
    'Np/m',
    '振幅は距離Lに対し exp(−αL) で減衰します。実際の周波数依存損失を定数で近似しています。',
  ],
  [
    'closedExcitation',
    '全閉時の励振',
    0.01,
    1,
    0.01,
    '',
    '全閉時に残す励振の割合。パルスの強さと立ち上がりを変える音作りの設定で、実測の燃焼圧力ではありません。',
  ],
  [
    'outputCutoffHz',
    '最終LPF（マフラー相当）',
    100,
    12000,
    100,
    'Hz',
    'ソフトクリップ後の一次LPF、約−6 dB/oct。反射波用とは独立した音色調整です。実車マフラーの測定特性ではありません。',
  ],
] as const;

export function mountAudioTuningControls(
  container: HTMLElement,
  onChange: (tuning: typeof DEFAULT_EXHAUST_TUNING) => void,
  documentRef: Document = document,
) {
  const tuning = { ...DEFAULT_EXHAUST_TUNING };
  const inputs = new Map<keyof typeof tuning, HTMLInputElement>();
  const listeners: (() => void)[] = [];
  const previews: (() => void)[] = [];
  const listen = (element: HTMLElement, type: string, handler: (event: Event) => void) => {
    element.addEventListener(type, handler);
    listeners.push(() => element.removeEventListener(type, handler));
  };
  const rows = CONTROLS.map(([key, title, min, max, step, unit, explanation]) => {
    const row = documentRef.createElement('label');
    row.className = 'audio-tuning-row';
    row.setAttribute('title', explanation);
    const caption = documentRef.createElement('span');
    caption.textContent = title;
    const input = documentRef.createElement('input');
    input.type = 'range';
    input.min = String(min);
    input.max = String(max);
    input.step = String(step);
    input.value = String(tuning[key]);
    input.setAttribute('aria-label', title);
    const output = documentRef.createElement('output');
    const preview = () => {
      output.textContent =
        `${input.value} ${unit}${key === 'outletReflection' && Number(input.value) === 0 ? '（反射なし）' : ''}`.trim();
    };
    listen(input, 'input', preview);
    listen(input, 'change', () => {
      tuning[key] = Number(input.value);
      preview();
      onChange({ ...tuning });
    });
    // Native range navigation must not also become a driving/calibration key.
    listen(input, 'keydown', (event) => event.stopPropagation());
    preview();
    previews.push(preview);
    inputs.set(key, input);
    row.replaceChildren(caption, input, output);
    return row;
  });
  const reset = documentRef.createElement('button');
  reset.type = 'button';
  reset.className = 'selector-button audio-tuning-reset';
  reset.textContent = 'デフォルトに戻す';
  listen(reset, 'click', () => {
    Object.assign(tuning, DEFAULT_EXHAUST_TUNING);
    for (const [key, input] of inputs) {
      input.value = String(tuning[key]);
    }
    for (const preview of previews) preview();
    onChange({ ...tuning });
  });
  container.replaceChildren(...rows, reset);
  return {
    read: () => ({ ...tuning }),
    dispose() {
      for (const remove of listeners) remove();
      container.replaceChildren();
    },
  };
}
