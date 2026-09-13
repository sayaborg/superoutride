import { type CameraYawMode } from '../camera/camera.js';
import type { ArcadeTireFrictionCalibrationState } from '../physics/tire-friction-calibration.js';
import {
  createMobileCameraYawSelectorModel,
  createMobileCourseSelectorModel,
  createMobileMaxRoadWheelSteerSelectorModel,
  createMobileSteeringOffsetSelectorModel,
  createMobileSteeringResponseSelectorModel,
  createMobileTireCalibrationSelectorModel,
  createMobileVehicleSelectorModel,
  type MobileSelectorButtonModel,
} from './mobile-selector-model.js';
import { cycleSelectorChoice, sameSelectorValue } from './selector-values.js';

import type { CompiledArcadeVehicleProfile, VehicleProfileId } from '../physics/vehicle-profiles.js';
import {
  BROWSER_COURSE_MODES,
  type BrowserCourseModeQuery,
  type BrowserCourseModeSelection,
} from './course-mode-selection.js';

import { type BrowserTireCalibrationAxis } from './tire-friction-selection.js';
import { BROWSER_VEHICLE_PROFILES, type BrowserVehicleProfileSelection } from './vehicle-profile-selection.js';

interface MobileSelectorController<Value extends string | number> {
  setActive(value: Value): void;
}

interface MobileTireCalibrationController {
  setCalibration(calibration: Readonly<ArcadeTireFrictionCalibrationState>): void;
}

export function mountMobileCourseSelector(
  container: HTMLElement,
  activeQuery: BrowserCourseModeQuery,
  onSelect: (selection: BrowserCourseModeSelection) => void,
  documentRef: Document = document,
  choices = BROWSER_COURSE_MODES,
): MobileSelectorController<BrowserCourseModeQuery> {
  const selections = new Map(choices.map((selection) => [selection.query, selection]));
  return mountMobileSelector(
    container,
    createMobileCourseSelectorModel(activeQuery, choices),
    (query) => onSelect(mustSelect(selections, query, 'course')),
    documentRef,
  );
}

export function mountMobileVehicleSelector(
  container: HTMLElement,
  activeId: VehicleProfileId,
  onSelect: (profile: Readonly<CompiledArcadeVehicleProfile>) => void,
  documentRef: Document = document,
  choices = BROWSER_VEHICLE_PROFILES,
): MobileSelectorController<VehicleProfileId> {
  const selections = new Map<VehicleProfileId, BrowserVehicleProfileSelection>(
    choices.map((selection) => [selection.profile.id, selection]),
  );
  return mountMobileSelector(
    container,
    createMobileVehicleSelectorModel(activeId, choices),
    (id) => onSelect(mustSelect(selections, id, 'vehicle').profile),
    documentRef,
  );
}

export function mountMobileCameraYawSelector(
  container: HTMLElement,
  activeMode: CameraYawMode,
  onSelect: (mode: CameraYawMode) => void,
  documentRef: Document = document,
): MobileSelectorController<CameraYawMode> {
  return mountMobileSelector(container, createMobileCameraYawSelectorModel(activeMode), onSelect, documentRef);
}

export function mountMobileSteeringOffsetSelector(
  container: HTMLElement,
  activeRadians: number,
  onSelect: (radians: number) => void,
  documentRef: Document = document,
): MobileSelectorController<number> {
  return mountNumericStepper(
    container,
    createMobileSteeringOffsetSelectorModel(activeRadians),
    'D',
    '°',
    onSelect,
    documentRef,
  );
}

export function mountMobileMaxRoadWheelSteerSelector(
  container: HTMLElement,
  activeRadians: number,
  onSelect: (radians: number) => void,
  documentRef: Document = document,
): MobileSelectorController<number> {
  return mountNumericStepper(
    container,
    createMobileMaxRoadWheelSteerSelectorModel(activeRadians),
    'M',
    '°',
    onSelect,
    documentRef,
  );
}

export function mountMobileSteeringResponseSelector(
  container: HTMLElement,
  activeRate: number,
  onSelect: (rate: number) => void,
  documentRef: Document = document,
): MobileSelectorController<number> {
  return mountNumericStepper(
    container,
    createMobileSteeringResponseSelectorModel(activeRate),
    'ACT',
    ' s',
    onSelect,
    documentRef,
  );
}

export function mountMobileTireCalibrationSelector(
  container: HTMLElement,
  calibration: Readonly<ArcadeTireFrictionCalibrationState>,
  onStep: (axis: BrowserTireCalibrationAxis, direction: -1 | 1) => void,
  documentRef: Document = document,
): MobileTireCalibrationController {
  const outputs = new Map<BrowserTireCalibrationAxis, HTMLElement>();
  const groups = createMobileTireCalibrationSelectorModel(calibration).map((item) => {
    const { group, value } = createStepper(item.axis, (direction) => onStep(item.axis, direction), documentRef);
    outputs.set(item.axis, value);
    return group;
  });
  container.replaceChildren(...groups);
  const controller: MobileTireCalibrationController = {
    setCalibration(next) {
      for (const item of createMobileTireCalibrationSelectorModel(next)) {
        const value = outputs.get(item.axis)!;
        value.textContent = item.label;
        value.setAttribute('title', item.ariaLabel);
        value.setAttribute('aria-label', item.ariaLabel);
      }
    },
  };
  controller.setCalibration(calibration);
  return controller;
}

/** A numeric choice list and tire axes share the same compact two-button presentation. */
function createStepper(label: string, onStep: (direction: -1 | 1) => void, documentRef: Document) {
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

function mountNumericStepper(
  container: HTMLElement,
  choices: readonly MobileSelectorButtonModel<number>[],
  label: string,
  unit: string,
  onSelect: (value: number) => void,
  documentRef: Document,
): MobileSelectorController<number> {
  let active = choices.find((item) => item.active)!.value;
  const { group, value } = createStepper(
    label,
    (direction) => {
      onSelect(cycleSelectorChoice(choices, active, (item) => item.value, direction).value);
    },
    documentRef,
  );
  container.replaceChildren(group);
  const controller = {
    setActive(next: number) {
      active = next;
      const item = choices.find((item) => sameSelectorValue(item.value, next));
      value.textContent = `${item?.label ?? next}${unit}`;
      value.setAttribute('aria-label', item?.ariaLabel ?? label);
      value.setAttribute('title', item?.ariaLabel ?? label);
    },
  };
  controller.setActive(active);
  return controller;
}

function mountMobileSelector<Value extends string | number>(
  container: HTMLElement,
  model: readonly MobileSelectorButtonModel<Value>[],
  onSelect: (value: Value) => void,
  documentRef: Document,
): MobileSelectorController<Value> {
  const buttons = new Map<Value, HTMLButtonElement>();
  for (const item of model) {
    const button = documentRef.createElement('button');
    button.type = 'button';
    button.className = 'selector-button';
    button.textContent = item.label;
    button.setAttribute('aria-label', item.ariaLabel);
    button.addEventListener('click', () => onSelect(item.value));
    buttons.set(item.value, button);
  }
  container.replaceChildren(...buttons.values());

  const controller: MobileSelectorController<Value> = {
    setActive(value) {
      for (const [buttonValue, button] of buttons) {
        const active =
          typeof value === 'number' && typeof buttonValue === 'number'
            ? sameSelectorValue(buttonValue, value)
            : buttonValue === value;
        button.classList.toggle('active', active);
        button.setAttribute('aria-pressed', String(active));
      }
    },
  };
  const active = model.find((item) => item.active);
  if (active !== undefined) controller.setActive(active.value);
  return controller;
}

function mustSelect<Key, Value>(selections: ReadonlyMap<Key, Value>, key: Key, kind: string): Value {
  const selection = selections.get(key);
  if (selection === undefined) throw new Error(`Unknown mobile ${kind} selection`);
  return selection;
}
