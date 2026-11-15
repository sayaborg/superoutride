import { PLANNED_DRIVER } from '../race/planned-driver.js';
import { createNumberStepper } from './controls/number-stepper.js';

/**
 * DEV adjustment of the safety net's progress count, the seconds a driven vehicle goes without passing the farthest
 * point it has reached before its driver asks for recovery (K decides it in DEV, 2026-11-15). It applies from the next
 * run, is not persisted, and a reload restores `PLANNED_DRIVER.progressSeconds`.
 */
export function mountSafetyNetControls(change: (progressSeconds: number) => void) {
  const parent = document.querySelector('#dev-panel nav');
  if (!parent) throw new Error('DEV settings container is missing');
  const group = document.createElement('fieldset');
  group.className = 'selector-group';
  const legend = document.createElement('legend');
  legend.textContent = 'SAFETY NET';
  const row = document.createElement('div');
  row.className = 'selector-buttons';
  const name = document.createElement('span');
  name.textContent = 'No progress';
  const stepper = createNumberStepper({
    label: 'Seconds without progress',
    min: 1,
    max: 60,
    step: 1,
    value: PLANNED_DRIVER.progressSeconds,
    format: (seconds) => `${seconds} s`,
    onChange: change,
  });
  row.append(name, stepper.group);
  const help = document.createElement('p');
  help.textContent =
    'Seconds a driven vehicle may go without passing the farthest point it has reached before its driver asks for ' +
    `recovery; it applies from the next run. Reload restores ${PLANNED_DRIVER.progressSeconds} s.`;
  group.append(legend, row, help);
  parent.prepend(group);
}
