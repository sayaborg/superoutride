import { type CameraYawMode } from '../camera/camera.js';
import type { ArcadeTireFrictionCalibrationState } from '../physics/tire-friction-calibration.js';
import { readTireCharacteristics } from '../physics/tire-friction-calibration.js';
import type { VehicleProfileId } from '../physics/vehicle-profiles.js';
import { BROWSER_CAMERA_YAW_MODES } from './camera-yaw-selection.js';
import { BROWSER_COURSE_MODES, type BrowserCourseModeQuery } from './course-mode-selection.js';
import { sameSelectorValue } from './selector-values.js';
import {
  BROWSER_MAX_ROAD_WHEEL_STEERS,
  BROWSER_STEERING_OFFSETS,
  BROWSER_STEERING_RESPONSES,
  formatTraversalSeconds,
} from './steering-calibration-selection.js';
import { BROWSER_TIRE_AXES, formatTireAxisValue, type BrowserTireCalibrationAxis } from './tire-friction-selection.js';
import { BROWSER_VEHICLE_PROFILES } from './vehicle-profile-selection.js';

export interface MobileSelectorButtonModel<Value extends string | number> {
  readonly value: Value;
  readonly label: string;
  readonly ariaLabel: string;
  readonly active: boolean;
}

export interface MobileTireCalibrationButtonModel {
  readonly axis: BrowserTireCalibrationAxis;
  readonly label: string;
  readonly ariaLabel: string;
}

export function createMobileCourseSelectorModel(
  activeQuery: BrowserCourseModeQuery,
  selections = BROWSER_COURSE_MODES,
): readonly MobileSelectorButtonModel<BrowserCourseModeQuery>[] {
  return selectorModel(activeQuery, selections, (mode) => ({
    value: mode.query,
    label: mode.digitCode?.slice(-1) ?? mode.label,
    ariaLabel: `Select ${mode.label} course`,
  }));
}

export function createMobileVehicleSelectorModel(
  activeId: VehicleProfileId,
  selections = BROWSER_VEHICLE_PROFILES,
): readonly MobileSelectorButtonModel<VehicleProfileId>[] {
  return selectorModel(activeId, selections, ({ profile, mobileLabel, accessibleName }) => ({
    value: profile.id,
    label: mobileLabel,
    ariaLabel: `Select ${accessibleName}`,
  }));
}

export function createMobileCameraYawSelectorModel(
  activeMode: CameraYawMode,
): readonly MobileSelectorButtonModel<CameraYawMode>[] {
  return selectorModel(activeMode, BROWSER_CAMERA_YAW_MODES, (mode) => mode);
}

export function createMobileSteeringOffsetSelectorModel(
  activeRadians: number,
): readonly MobileSelectorButtonModel<number>[] {
  return selectorModel(activeRadians, BROWSER_STEERING_OFFSETS, ({ degrees, radians }) => ({
    value: radians,
    label: String(degrees),
    ariaLabel: `Set driver steering offset D to ${degrees} degrees`,
  }));
}

export function createMobileMaxRoadWheelSteerSelectorModel(
  activeRadians: number,
): readonly MobileSelectorButtonModel<number>[] {
  return selectorModel(activeRadians, BROWSER_MAX_ROAD_WHEEL_STEERS, ({ degrees, radians }) => ({
    value: radians,
    label: String(degrees),
    ariaLabel: `Set maximum road-wheel steer M to ${degrees} degrees`,
  }));
}

export function createMobileSteeringResponseSelectorModel(
  activeRate: number,
): readonly MobileSelectorButtonModel<number>[] {
  return selectorModel(activeRate, BROWSER_STEERING_RESPONSES, ({ traversalSeconds, rate }) => ({
    value: rate,
    label: formatTraversalSeconds(traversalSeconds),
    ariaLabel: `Set symmetric steering traversal to ${formatTraversalSeconds(traversalSeconds)} seconds`,
  }));
}

export function createMobileTireCalibrationSelectorModel(
  calibration: Readonly<ArcadeTireFrictionCalibrationState>,
): readonly MobileTireCalibrationButtonModel[] {
  return BROWSER_TIRE_AXES.map((axis) => ({
    axis: axis.id,
    label: `${axis.id === 'KNEE' ? 'KN' : axis.id} ${formatTireAxisValue(axis.id, calibration)}`,
    ariaLabel:
      `${axis.id} ${formatTireAxisValue(axis.id, calibration)}; ${axis.code.slice(3)} cycles forward; minus/plus buttons step either direction; front/rear linked` +
      (axis.id === 'PY'
        ? `; pure lateral equivalent ${((Math.atan(readTireCharacteristics(calibration.front).peakSlipY) * 180) / Math.PI).toFixed(2)} degrees`
        : ''),
  }));
}

function selectorModel<Value extends string | number, Selection>(
  active: Value,
  choices: readonly Selection[],
  describe: (choice: Selection) => Omit<MobileSelectorButtonModel<Value>, 'active'>,
): readonly MobileSelectorButtonModel<Value>[] {
  return choices.map((choice) => {
    const option = describe(choice);
    return {
      ...option,
      active:
        typeof option.value === 'number' && typeof active === 'number'
          ? sameSelectorValue(option.value, active)
          : option.value === active,
    };
  });
}
