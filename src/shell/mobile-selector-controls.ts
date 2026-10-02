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
