import { type CameraYawMode } from '../view/camera.js';
import type { VehicleId } from '../vehicle/physics/vehicle-definitions.js';
import { BROWSER_CAMERA_YAW_MODES } from './camera-yaw-selection.js';
import { BROWSER_COURSE_MODES, type BrowserCourseModeQuery } from './course-mode-selection.js';
import { sameSelectorValue } from './selector-values.js';
import type { BrowserVehicleSelection } from './vehicle-selection.js';

export interface MobileSelectorButtonModel<Value extends string | number> {
  readonly value: Value;
  readonly label: string;
  readonly ariaLabel: string;
  readonly active: boolean;
}

export function createMobileCourseSelectorModel(
  activeQuery: BrowserCourseModeQuery,
  selections = BROWSER_COURSE_MODES,
): readonly MobileSelectorButtonModel<BrowserCourseModeQuery>[] {
  return selectorModel(activeQuery, selections, (mode) => ({
    value: mode.query,
    label: mode.buttonLabel ?? mode.label,
    ariaLabel: `Select ${mode.label} course`,
  }));
}

export function createMobileVehicleSelectorModel(
  activeId: VehicleId,
  selections: readonly BrowserVehicleSelection[],
): readonly MobileSelectorButtonModel<VehicleId>[] {
  return selectorModel(activeId, selections, ({ compiledVehicle, mobileLabel, accessibleName }) => ({
    value: compiledVehicle.id,
    label: mobileLabel,
    ariaLabel: `Select ${accessibleName}`,
  }));
}

export function createMobileCameraYawSelectorModel(
  activeMode: CameraYawMode,
): readonly MobileSelectorButtonModel<CameraYawMode>[] {
  return selectorModel(activeMode, BROWSER_CAMERA_YAW_MODES, (mode) => mode);
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
