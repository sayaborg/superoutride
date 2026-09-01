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
import {
  M5_CAMERA_YAW_MODES,
  type M5CameraYawMode,
} from '../camera/m5-camera.js';
import {
  BROWSER_STEERING_RESPONSES,
  BROWSER_YAW_TRANSIENT_GAINS,
  BROWSER_YAW_WASHOUT_TIMES,
  type BrowserYawTransientGain,
  type BrowserYawWashoutTime,
  formatTraversalSeconds,
} from './steering-calibration-selection.js';
import {
  BROWSER_TIRE_CHARACTERISTIC_PRESETS,
  type BrowserTirePresetId,
} from './tire-friction-selection.js';

export interface MobileSelectorButtonModel<Value extends string | number> {
  readonly value: Value;
  readonly label: string;
  readonly ariaLabel: string;
  readonly active: boolean;
}

export interface MobileSelectorController<Value extends string | number> {
  setActive(value: Value): void;
}

export function createMobileCourseSelectorModel(
  activeQuery: BrowserCourseModeQuery,
): readonly MobileSelectorButtonModel<BrowserCourseModeQuery>[] {
  return BROWSER_COURSE_MODES.map((mode) => ({
    value: mode.query,
    label: mode.digitCode.slice(-1),
    ariaLabel: `Select ${mode.label} course`,
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

export function createMobileCameraYawSelectorModel(
  activeMode: M5CameraYawMode,
): readonly MobileSelectorButtonModel<M5CameraYawMode>[] {
  return M5_CAMERA_YAW_MODES.map((mode) => ({
    value: mode,
    label: mode === 'BODY_FIXED' ? 'BODY' : 'MOVE',
    ariaLabel: mode === 'BODY_FIXED'
      ? 'Lock camera yaw to vehicle body'
      : 'Follow vehicle movement direction with camera yaw',
    active: mode === activeMode,
  }));
}

export function createMobileYawTransientSelectorModel(
  activeGain: number,
): readonly MobileSelectorButtonModel<BrowserYawTransientGain>[] {
  return BROWSER_YAW_TRANSIENT_GAINS.map((yawTransientGain) => ({
    value: yawTransientGain,
    label: yawTransientGain.toFixed(2),
    ariaLabel: `Set steering yaw transient gain to ${yawTransientGain.toFixed(2)} seconds`,
    active: yawTransientGain === activeGain,
  }));
}

export function createMobileYawWashoutSelectorModel(
  activeTime: number,
): readonly MobileSelectorButtonModel<BrowserYawWashoutTime>[] {
  return BROWSER_YAW_WASHOUT_TIMES.map((yawWashoutTime) => ({
    value: yawWashoutTime,
    label: yawWashoutTime.toFixed(2),
    ariaLabel: `Set steering yaw washout time to ${yawWashoutTime.toFixed(2)} seconds`,
    active: yawWashoutTime === activeTime,
  }));
}

export function createMobileSteeringResponseSelectorModel(
  activeRate: number,
): readonly MobileSelectorButtonModel<number>[] {
  return BROWSER_STEERING_RESPONSES.map(({ traversalSeconds, rate }) => ({
    value: rate,
    label: formatTraversalSeconds(traversalSeconds),
    ariaLabel: `Set symmetric steering traversal to ${formatTraversalSeconds(traversalSeconds)} seconds`,
    active: approximatelyEqual(rate, activeRate),
  }));
}

export function createMobileTireFrictionSelectorModel(
  activeId: BrowserTirePresetId,
): readonly MobileSelectorButtonModel<BrowserTirePresetId>[] {
  return BROWSER_TIRE_CHARACTERISTIC_PRESETS.map(({ id, label }) => ({
    value: id,
    label,
    ariaLabel: `Select debug tire preset ${label}`,
    active: id === activeId,
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

export function mountMobileCameraYawSelector(
  container: HTMLElement,
  activeMode: M5CameraYawMode,
  onSelect: (mode: M5CameraYawMode) => void,
  documentRef: Document = document,
): MobileSelectorController<M5CameraYawMode> {
  return mountMobileSelector(
    container,
    createMobileCameraYawSelectorModel(activeMode),
    onSelect,
    documentRef,
  );
}

export function mountMobileYawTransientSelector(
  container: HTMLElement,
  activeGain: number,
  onSelect: (gain: BrowserYawTransientGain) => void,
  documentRef: Document = document,
): MobileSelectorController<BrowserYawTransientGain> {
  return mountMobileSelector(
    container,
    createMobileYawTransientSelectorModel(activeGain),
    onSelect,
    documentRef,
  );
}

export function mountMobileYawWashoutSelector(
  container: HTMLElement,
  activeTime: number,
  onSelect: (yawWashoutTime: BrowserYawWashoutTime) => void,
  documentRef: Document = document,
): MobileSelectorController<BrowserYawWashoutTime> {
  return mountMobileSelector(
    container,
    createMobileYawWashoutSelectorModel(activeTime),
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
  return mountMobileSelector(
    container,
    createMobileSteeringResponseSelectorModel(activeRate),
    onSelect,
    documentRef,
  );
}

export function mountMobileTireFrictionSelector(
  container: HTMLElement,
  activeId: BrowserTirePresetId,
  onSelect: (id: BrowserTirePresetId) => void,
  documentRef: Document = document,
): MobileSelectorController<BrowserTirePresetId> {
  return mountMobileSelector(
    container,
    createMobileTireFrictionSelectorModel(activeId),
    onSelect,
    documentRef,
  );
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

function approximatelyEqual(a: number, b: number): boolean {
  return Math.abs(a - b) < 1e-12;
}
