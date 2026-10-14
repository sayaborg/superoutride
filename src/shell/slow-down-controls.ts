import { SLOW_DOWN, type SlowDownUtilizations } from '../race/slow-down.js';
import { createNumberStepper } from './controls/number-stepper.js';

const STAGE_LABELS = ['Yellow', 'Orange', 'Red'] as const;
/** Each utilization in hundredths within the utilization's domain (0, 1]. */
const UTILIZATION_STEP = 0.01;

/**
 * DEV adjustment of the SLOW DOWN stages' utilizations, ascending: a change that would break their order is refused and
 * leaves the previous value. They apply from the next run, are not persisted, and a reload restores `SLOW_DOWN`'s.
 */
export function mountSlowDownControls(change: (utilizations: SlowDownUtilizations) => void) {
  const parent = document.querySelector('#dev-panel nav');
  if (!parent) throw new Error('DEV settings container is missing');
  let utilizations: SlowDownUtilizations = SLOW_DOWN.utilizations;
  const group = document.createElement('fieldset');
  group.className = 'selector-group';
  const legend = document.createElement('legend');
  legend.textContent = 'SLOW DOWN';
  group.append(legend);
  const percent = (value: number) => `${Math.round(value * 100)}%`;
  STAGE_LABELS.forEach((label, k) => {
    const row = document.createElement('div');
    row.className = 'selector-buttons';
    const name = document.createElement('span');
    name.textContent = label;
    const stepper = createNumberStepper({
      label: `${label} utilization`,
      min: UTILIZATION_STEP,
      max: 1,
      step: UTILIZATION_STEP,
      value: utilizations[k]!,
      format: percent,
      onChange: (value) => {
        const next = utilizations.map((u, j) => (j === k ? value : u)) as unknown as SlowDownUtilizations;
        if (!(next[0] < next[1] && next[1] < next[2])) {
          stepper.setValue(utilizations[k]!);
          return;
        }
        utilizations = Object.freeze(next);
        change(utilizations);
      },
    });
    row.append(name, stepper.group);
    group.append(row);
  });
  const help = document.createElement('p');
  help.textContent = `The stages' utilizations, ascending; they apply from the next run. Reload restores ${SLOW_DOWN.utilizations.map(percent).join(', ')}.`;
  group.append(help);
  parent.prepend(group);
}
