import { type CameraYawMode } from '../view/camera.js';
import { BROWSER_CAMERA_YAW_MODES } from './camera-yaw-selection.js';
import {
  BROWSER_COURSE_MODES,
  type BrowserCourseModeQuery,
  type BrowserCourseModeSelection,
} from './course-mode-selection.js';

interface MobileSelectorController<Value extends string> {
  setActive(value: Value): void;
}

interface MobileSelectorButton<Value extends string> {
  readonly value: Value;
  readonly label: string;
  readonly ariaLabel: string;
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
    choices.map((mode) => ({
      value: mode.query,
      label: mode.buttonLabel ?? mode.label,
      ariaLabel: `Select ${mode.label} course`,
    })),
    activeQuery,
    (query) => onSelect(mustSelect(selections, query, 'course')),
    documentRef,
  );
}

export function mountMobileCameraYawSelector(
  container: HTMLElement,
  activeMode: CameraYawMode,
  onSelect: (mode: CameraYawMode) => void,
  documentRef: Document = document,
): MobileSelectorController<CameraYawMode> {
  return mountMobileSelector(container, BROWSER_CAMERA_YAW_MODES, activeMode, onSelect, documentRef);
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

function mountMobileSelector<Value extends string>(
  container: HTMLElement,
  model: readonly MobileSelectorButton<Value>[],
  activeValue: Value,
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
        const active = buttonValue === value;
        button.classList.toggle('active', active);
        button.setAttribute('aria-pressed', String(active));
      }
    },
  };
  controller.setActive(activeValue);
  return controller;
}

function mustSelect<Key, Value>(selections: ReadonlyMap<Key, Value>, key: Key, kind: string): Value {
  const selection = selections.get(key);
  if (selection === undefined) throw new Error(`Unknown mobile ${kind} selection`);
  return selection;
}
