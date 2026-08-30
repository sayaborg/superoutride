import {
  BROWSER_COURSE_MODES,
  type BrowserCourseModeQuery,
  type BrowserCourseModeSelection,
} from './course-mode-selection.js';
import {
  BROWSER_VEHICLE_PROFILES,
  type BrowserVehicleProfileSelection,
} from './vehicle-profile-selection.js';
import type { CompiledArcadeVehicleProfile, VehicleProfileId } from '../physics/vehicle-profiles.js';

export interface MobileSelectorButtonModel<Value extends string> {
  readonly value: Value;
  readonly label: string;
  readonly ariaLabel: string;
  readonly active: boolean;
}

export interface MobileSelectorController<Value extends string> {
  setActive(value: Value): void;
}

export function createMobileCourseSelectorModel(
  activeQuery: BrowserCourseModeQuery,
): readonly MobileSelectorButtonModel<BrowserCourseModeQuery>[] {
  return BROWSER_COURSE_MODES.map((mode) => ({
    value: mode.query,
    label: `${mode.digitCode.slice(-1)} ${mode.routeKind}`,
    ariaLabel: `Select ${mode.routeKind} course`,
    active: mode.query === activeQuery,
  }));
}

export function createMobileVehicleSelectorModel(
  activeId: VehicleProfileId,
): readonly MobileSelectorButtonModel<VehicleProfileId>[] {
  return BROWSER_VEHICLE_PROFILES.map(({ profile }) => ({
    value: profile.id,
    label: profile.id,
    ariaLabel: `Select ${profile.id} vehicle`,
    active: profile.id === activeId,
  }));
}

export function mountMobileCourseSelector(
  container: HTMLElement,
  activeQuery: BrowserCourseModeQuery,
  onSelect: (selection: BrowserCourseModeSelection) => void,
  documentRef: Document = document,
): MobileSelectorController<BrowserCourseModeQuery> {
  const selections = new Map(BROWSER_COURSE_MODES.map((selection) => [selection.query, selection]));
  return mountMobileSelector(
    container,
    createMobileCourseSelectorModel(activeQuery),
    (query) => onSelect(mustSelect(selections, query, 'course')),
    documentRef,
  );
}

export function mountMobileVehicleSelector(
  container: HTMLElement,
  activeId: VehicleProfileId,
  onSelect: (profile: Readonly<CompiledArcadeVehicleProfile>) => void,
  documentRef: Document = document,
): MobileSelectorController<VehicleProfileId> {
  const selections = new Map<VehicleProfileId, BrowserVehicleProfileSelection>(
    BROWSER_VEHICLE_PROFILES.map((selection) => [selection.profile.id, selection]),
  );
  return mountMobileSelector(
    container,
    createMobileVehicleSelectorModel(activeId),
    (id) => onSelect(mustSelect(selections, id, 'vehicle').profile),
    documentRef,
  );
}

function mountMobileSelector<Value extends string>(
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
        const active = buttonValue === value;
        button.classList.toggle('active', active);
        button.setAttribute('aria-pressed', String(active));
      }
    },
  };
  const active = model.find((item) => item.active);
  if (active !== undefined) controller.setActive(active.value);
  return controller;
}

function mustSelect<Key, Value>(
  selections: ReadonlyMap<Key, Value>,
  key: Key,
  kind: string,
): Value {
  const selection = selections.get(key);
  if (selection === undefined) throw new Error(`Unknown mobile ${kind} selection`);
  return selection;
}
