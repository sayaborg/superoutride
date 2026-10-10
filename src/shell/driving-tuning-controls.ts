import type { DrivingDocument } from '../vehicle/driving-definition.js';
import {
  DRIVING_TUNING_GROUPS,
  drivingTuningItems,
  formatDrivingTuningValue,
  stepDrivingTuning,
  cycleDrivingSteeringReference,
  toggleDrivingWheelSlip,
  type DrivingTuningGroup,
} from './driving-tuning.js';

/** Compact minus/value/plus presentation shared by DEV tuning items. */
export function createCalibrationStepper(label: string, onStep: (direction: -1 | 1) => void, documentRef: Document) {
  const group = documentRef.createElement('div');
  group.className = 'calibration-control';
  group.setAttribute('role', 'group');
  group.setAttribute('aria-label', `${label} calibration`);
  const value = documentRef.createElement('span');
  value.className = 'calibration-value';
  const button = (direction: -1 | 1) => {
    const element = documentRef.createElement('button');
    element.type = 'button';
    element.className = 'selector-button calibration-step';
    element.textContent = direction < 0 ? '−' : '+';
    element.setAttribute('aria-label', `${direction < 0 ? 'Decrease' : 'Increase'} ${label} (wrap at limit)`);
    element.addEventListener('click', () => onStep(direction));
    return element;
  };
  group.replaceChildren(button(-1), value, button(1));
  return { group, value };
}

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
    reference.textContent = `REF ${definition.steeringReference.toUpperCase()}`;
    reference.setAttribute('aria-pressed', String(definition.steeringReference !== 'center'));
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
  const reference = documentRef.createElement('button');
  reference.type = 'button';
  reference.className = 'selector-button';
  reference.title =
    'Steering reference: the travel direction of the centre of mass, of the front contact, or of the centre of mass with the turn geometry';
  reference.addEventListener('click', () => {
    target.set(cycleDrivingSteeringReference(target.get()));
    refresh();
  });
  containers.STEERING.append(reference);
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
