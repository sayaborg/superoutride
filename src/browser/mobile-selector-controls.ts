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
import type { ArcadeTireFrictionCalibrationState } from '../physics/tire-friction-calibration.js';
import {
  M5_CAMERA_YAW_MODES,
  type M5CameraYawMode,
} from '../camera/m5-camera.js';
import {
  BROWSER_MAX_ROAD_WHEEL_STEERS,
  BROWSER_STEERING_OFFSETS,
  BROWSER_STEERING_RESPONSES,
  formatTraversalSeconds,
} from './steering-calibration-selection.js';
import {
  formatGripValue,
  formatPeakValue,
  formatSlideValue,
  type BrowserTireCalibrationAxis,
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

export interface MobileTireCalibrationButtonModel {
  readonly axis: BrowserTireCalibrationAxis;
  readonly label: string;
  readonly ariaLabel: string;
}

export interface MobileTireCalibrationController {
  setCalibration(calibration: Readonly<ArcadeTireFrictionCalibrationState>): void;
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
  return BROWSER_VEHICLE_PROFILES.map(({ profile, mobileLabel, accessibleName }) => ({
    value: profile.id,
    label: mobileLabel,
    ariaLabel: `Select ${accessibleName}`,
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

export function createMobileSteeringOffsetSelectorModel(
  activeRadians: number,
): readonly MobileSelectorButtonModel<number>[] {
  return BROWSER_STEERING_OFFSETS.map(({ degrees, radians }) => ({
    value: radians,
    label: String(degrees),
    ariaLabel: `Set driver steering offset D to ${degrees} degrees`,
    active: approximatelyEqual(radians, activeRadians),
  }));
}

export function createMobileMaxRoadWheelSteerSelectorModel(
  activeRadians: number,
): readonly MobileSelectorButtonModel<number>[] {
  return BROWSER_MAX_ROAD_WHEEL_STEERS.map(({ degrees, radians }) => ({
    value: radians,
    label: String(degrees),
    ariaLabel: `Set maximum road-wheel steer M to ${degrees} degrees`,
    active: approximatelyEqual(radians, activeRadians),
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

export function createMobileTireCalibrationSelectorModel(
  calibration: Readonly<ArcadeTireFrictionCalibrationState>,
): readonly MobileTireCalibrationButtonModel[] {
  return [
    {
      axis: 'GRIP',
      label: `G ${formatGripValue(calibration)}`,
      ariaLabel: `Cycle tire peak grip from current ${formatGripValue(calibration)}`,
    },
    {
      axis: 'PEAK',
      label: `P ${formatPeakValue(calibration)}`,
      ariaLabel: `Cycle tire peak slip from current ${formatPeakValue(calibration)} percent`,
    },
    {
      axis: 'SLIDE',
      label: `S ${formatSlideValue(calibration)}`,
      ariaLabel: `Cycle tire sliding plateau from current ${formatSlideValue(calibration)} percent`,
    },
  ];
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

export function mountMobileSteeringOffsetSelector(
  container: HTMLElement,
  activeRadians: number,
  onSelect: (radians: number) => void,
  documentRef: Document = document,
): MobileSelectorController<number> {
  return mountMobileSelector(
    container,
    createMobileSteeringOffsetSelectorModel(activeRadians),
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
  return mountMobileSelector(
    container,
    createMobileMaxRoadWheelSteerSelectorModel(activeRadians),
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

export function mountMobileTireCalibrationSelector(
  container: HTMLElement,
  calibration: Readonly<ArcadeTireFrictionCalibrationState>,
  onCycle: (axis: BrowserTireCalibrationAxis) => void,
  documentRef: Document = document,
): MobileTireCalibrationController {
  const buttons = new Map<BrowserTireCalibrationAxis, HTMLButtonElement>();
  for (const item of createMobileTireCalibrationSelectorModel(calibration)) {
    const button = documentRef.createElement('button');
    button.type = 'button';
    button.className = 'selector-button';
    button.textContent = item.label;
    button.setAttribute('aria-label', item.ariaLabel);
    button.addEventListener('click', () => onCycle(item.axis));
    buttons.set(item.axis, button);
  }
  container.replaceChildren(...buttons.values());

  const controller: MobileTireCalibrationController = {
    setCalibration(nextCalibration) {
      for (const item of createMobileTireCalibrationSelectorModel(nextCalibration)) {
        const button = buttons.get(item.axis);
        if (button === undefined) throw new Error(`Missing tire calibration button for ${item.axis}`);
        button.textContent = item.label;
        button.setAttribute('aria-label', item.ariaLabel);
      }
    },
  };
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
        const active = typeof value === 'number' && typeof buttonValue === 'number'
          ? approximatelyEqual(buttonValue, value)
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
