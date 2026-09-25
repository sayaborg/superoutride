import type { VehicleState } from '../vehicle/physics/vehicle-physics.js';
import { setVehicleTireFrictionCalibration } from '../vehicle/physics/tire-friction-calibration.js';
import { mountMobileTireCalibrationSelector } from './mobile-selector-controls.js';
import { stepBrowserTireCalibration, type BrowserTireCalibrationAxis } from './tire-friction-selection.js';

/** Explicit +/- buttons own both directions through one operation. */
export function mountBrowserTireFrictionControls(
  container: HTMLElement,
  getVehicle: () => VehicleState,
  documentRef: Document = document,
): void {
  const selector = mountMobileTireCalibrationSelector(
    container,
    getVehicle().tireFrictionCalibration,
    stepAxis,
    documentRef,
  );

  function stepAxis(axis: BrowserTireCalibrationAxis, direction: -1 | 1): void {
    const vehicle = getVehicle();
    setVehicleTireFrictionCalibration(
      vehicle,
      stepBrowserTireCalibration(axis, direction, vehicle.tireFrictionCalibration),
    );
    selector.setCalibration(vehicle.tireFrictionCalibration);
  }
}
