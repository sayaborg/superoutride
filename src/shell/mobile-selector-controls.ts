import { type CameraYawMode } from '../view/camera.js';
import {
  createMobileCameraYawSelectorModel,
  createMobileCourseSelectorModel,
  createMobileVehicleSelectorModel,
  type MobileSelectorButtonModel,
} from './mobile-selector-model.js';
import { sameSelectorValue } from './selector-values.js';

import type { CompiledVehicle, VehicleId } from '../vehicle/physics/vehicle-definitions.js';
import {
  BROWSER_COURSE_MODES,
  type BrowserCourseModeQuery,
  type BrowserCourseModeSelection,
} from './course-mode-selection.js';

import { type BrowserVehicleSelection } from './vehicle-selection.js';

interface MobileSelectorController<Value extends string | number> {
  setActive(value: Value): void;
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
  activeId: VehicleId,
  onSelect: (compiledVehicle: Readonly<CompiledVehicle>) => void,
  choices: readonly BrowserVehicleSelection[],
  documentRef: Document = document,
): MobileSelectorController<VehicleId> {
  const selections = new Map<VehicleId, BrowserVehicleSelection>(
    choices.map((selection) => [selection.compiledVehicle.id, selection]),
  );
  return mountMobileSelector(
    container,
    createMobileVehicleSelectorModel(activeId, choices),
    (id) => onSelect(mustSelect(selections, id, 'vehicle').compiledVehicle),
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
