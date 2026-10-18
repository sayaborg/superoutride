import {
  DRIVING_TUNING_GROUPS,
  drivingTuningItems,
  formatDrivingTuningValue,
  stepDrivingTuning,
  toggleDrivingWheelSlip,
  tunedWheelSlip,
  type DrivingTuningGroup,
  type TuningDocuments,
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

/** The player's tuned driving definition and vehicle mechanics; `set` admits a candidate and rebuilds the model. */
export interface DrivingTuningTarget {
  get(): TuningDocuments;
  /** False when admission rejects the candidate; the current documents then stay. */
  set(documents: TuningDocuments): boolean;
}

type DrivingTuningContainers = Readonly<Record<DrivingTuningGroup | 'ASSIST', HTMLElement>>;

/** DEV buttons edit the tuned documents in their saved units, one grid step at a time. */
export function mountDrivingTuningControls(
  containers: DrivingTuningContainers,
  target: DrivingTuningTarget,
  documentRef: Document = document,
): void {
  const outputs: { readonly id: string; readonly value: HTMLElement; readonly description: string }[] = [];
  const refresh = () => {
    const documents = target.get();
    for (const output of outputs) {
      const text = `${output.id} ${formatDrivingTuningValue(output.id, documents)}`;
      output.value.textContent = text;
      output.value.setAttribute('title', `${text}: ${output.description}`);
      output.value.setAttribute('aria-label', `${text}: ${output.description}`);
    }
    const wheelSlip = tunedWheelSlip(documents);
    for (const { side, label, button } of assists) {
      button.textContent = `${label} ${wheelSlip[side] ? 'ON' : 'OFF'}`;
      button.setAttribute('aria-pressed', String(wheelSlip[side]));
    }
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
  // Wheel slip protection's two sides, each its own switch.
  const assists = (
    [
      { side: 'drive', label: 'TCS/MSR', title: 'Wheel slip protection, drive side: TCS and MSR' },
      { side: 'brake', label: 'ABS', title: 'Wheel slip protection, brake side: ABS' },
    ] as const
  ).map(({ side, label, title }) => {
    const button = documentRef.createElement('button');
    button.type = 'button';
    button.className = 'selector-button';
    button.title = title;
    button.addEventListener('click', () => {
      target.set(toggleDrivingWheelSlip(target.get(), side));
      refresh();
    });
    return { side, label, button };
  });
  containers.ASSIST.replaceChildren(...assists.map(({ button }) => button));
  refresh();
}
