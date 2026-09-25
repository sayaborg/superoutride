import type { DrivingDocument } from '../vehicle/driving-definition.js';
import { createCalibrationStepper } from './mobile-selector-controls.js';
import {
  DRIVING_TUNING_GROUPS,
  drivingTuningItems,
  formatDrivingTuningValue,
  stepDrivingTuning,
  toggleDrivingWheelSlip,
  type DrivingTuningGroup,
} from './driving-tuning.js';

/** The player's tuned driving definition; `set` admits a candidate and rebuilds the model. */
export interface DrivingTuningTarget {
  get(): DrivingDocument;
  /** False when admission rejects the candidate; the current definition then stays. */
  set(definition: DrivingDocument): boolean;
}

type DrivingTuningContainers = Readonly<Record<DrivingTuningGroup | 'ASSIST', HTMLElement>>;

/** DEV buttons edit the driving definition in its saved units, one grid step at a time. */
export function mountDrivingTuningControls(
  containers: DrivingTuningContainers,
  target: DrivingTuningTarget,
  documentRef: Document = document,
): void {
  const outputs: { readonly id: string; readonly value: HTMLElement; readonly description: string }[] = [];
  const refresh = () => {
    const definition = target.get();
    for (const output of outputs) {
      const text = `${output.id} ${formatDrivingTuningValue(output.id, definition)}`;
      output.value.textContent = text;
      output.value.setAttribute('title', `${text}: ${output.description}`);
      output.value.setAttribute('aria-label', `${text}: ${output.description}`);
    }
    assist.textContent = `WHEEL SLIP ${definition.wheelSlip ? 'ON' : 'OFF'}`;
    assist.setAttribute('aria-pressed', String(definition.wheelSlip));
  };
  for (const group of DRIVING_TUNING_GROUPS) {
    const steppers = drivingTuningItems(group).map((entry) => {
      const { group: element, value } = createCalibrationStepper(
        entry.label,
        (direction) => {
          target.set(stepDrivingTuning(target.get(), entry.id, direction));
          refresh();
        },
        documentRef,
      );
      outputs.push({ id: entry.id, value, description: entry.description });
      return element;
    });
    containers[group].replaceChildren(...steppers);
  }
  const assist = documentRef.createElement('button');
  assist.type = 'button';
  assist.className = 'selector-button';
  assist.title = 'Wheel slip protection: TCS, MSR and ABS';
  assist.addEventListener('click', () => {
    target.set(toggleDrivingWheelSlip(target.get()));
    refresh();
  });
  containers.ASSIST.replaceChildren(assist);
  refresh();
}
