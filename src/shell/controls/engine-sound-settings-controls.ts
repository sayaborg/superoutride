import { EXHAUST_SETTING_RANGES, resolveExhaustSettings } from '../../audio/exhaust-acoustics.js';
import type { ExhaustSettings } from '../../audio/exhaust-acoustics.js';
import { createNumberStepper } from './number-stepper.js';

// Presentation owns labels/order only. Acoustic settings own all numeric domains and steps.
const CONTROLS = [
  [
    'closedExcitation',
    'Closed-throttle excitation',
    '',
    'The share of excitation kept at closed throttle. A sound-design setting that changes pulse strength and rise; not measured combustion pressure.',
  ],
  [
    'outputCutoffHz',
    'Final LPF (muffler)',
    'Hz',
    'First-order LPF after the soft clip, about −6 dB/oct. A tone adjustment independent of the reflected waves; not a measured muffler response.',
  ],
  [
    'pulseVariation',
    'Pulse variation',
    '',
    'Adds ± this share of the full-throttle strength to each firing. Standard is ±20%. The width stays the same off throttle and strength never goes below 0. Firing times and RPM are unchanged.',
  ],
  [
    'pumpingExcitation',
    'Fuel-cut excitation',
    '',
    'The weak blow-down from the exhaust valves alone while no fuel is injected. It is not combustion, so no variation is added.',
  ],
  [
    'pulseRiseMs',
    'Pulse rise',
    'ms',
    'The rise at full excitation, shared by every vehicle. An absolute time independent of engine speed, smoothed in two stages to prevent clicks. Smaller is sharper; it softens at low load.',
  ],
  [
    'pulseDecayDegrees',
    'Pulse decay (crank angle)',
    '°',
    'The decay shared by every vehicle. Defined in crank angle, so the tail is longer at low speed and shorter at high speed. At 3000 rpm, 18° = 1 ms.',
  ],
  [
    'blipOpening',
    'Blip opening',
    '',
    'A short throttle peak added to match revs on a downshift. The physical shift is instant; this is sound only.',
  ],
  [
    'blipDecaySeconds',
    'Blip decay',
    's',
    'The time constant over which the throttle peak decays exponentially. Larger blips longer.',
  ],
  [
    'popProbability',
    'Afterfire probability',
    '',
    'The chance of a pop at each firing while off throttle (not in fuel cut). Drawn per firing, so the rate is proportional to engine speed.',
  ],
  [
    'popStrength',
    'Afterfire strength',
    '',
    'The strength of the pop pulse injected at the collector. No unburnt-fuel or temperature state is kept.',
  ],
  [
    'cylinderWindowCycles',
    'Cylinder opening width',
    'cycles',
    'The width of the window after the exhaust opens in which the cylinder-side reflection changes, as a share of the firing period. Not the valve-open duration. An implementer default, not chosen by the owner by ear.',
  ],
  [
    'cylinderClosedReflection',
    'Cylinder reflection (closed)',
    '',
    'The cylinder-side pressure reflection while closed. Below 1 absorbs energy. An implementer default, not chosen by the owner by ear.',
  ],
  [
    'cylinderOpenReflection',
    'Cylinder reflection (open)',
    '',
    'The cylinder-side pressure reflection while open. Not valve-flow physics. An implementer default, not chosen by the owner by ear.',
  ],
  [
    'dcHz',
    'Output DC removal',
    'Hz',
    'The cutoff frequency of the output DC removal. An implementer default, not chosen by the owner by ear.',
  ],
  [
    'clipCeiling',
    'Soft-clip ceiling',
    '',
    "The soft clip's asymptotic ceiling, which is also its small-signal gain. An implementer default, not chosen by the owner by ear.",
  ],
] as const;

/** Starts from, and resets to, `initial`: the delivered audio document's exhaust record. */
export function mountEngineSoundSettings(
  container: HTMLElement,
  initial: ExhaustSettings,
  onChange: (settings: ExhaustSettings) => void,
  documentRef: Document = document,
) {
  const settings = { ...initial };
  const steppers = new Map<keyof typeof settings, ReturnType<typeof createNumberStepper>>();
  const listeners: (() => void)[] = [];
  const listen = (element: HTMLElement, type: string, handler: (event: Event) => void) => {
    element.addEventListener(type, handler);
    listeners.push(() => element.removeEventListener(type, handler));
  };
  const rows = CONTROLS.map(([key, title, unit, explanation]) => {
    const range = EXHAUST_SETTING_RANGES[key];
    const row = documentRef.createElement('div');
    row.className = 'sound-setting-row';
    row.setAttribute('title', explanation);
    row.setAttribute('data-engine-sound-setting', key);
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
            ? `±${Math.round(value * 100)}%${value === 0 ? ' (none)' : ''}`
            : `${value} ${unit}`.trim(),
        onChange(value) {
          // The panel admits each change; a rejected value keeps the previous setting.
          try {
            resolveExhaustSettings({ ...settings, [key]: value });
          } catch {
            control.setValue(settings[key]);
            return;
          }
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
  reset.className = 'selector-button sound-settings-reset';
  reset.textContent = 'Reset to defaults';
  listen(reset, 'click', () => {
    Object.assign(settings, initial);
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
