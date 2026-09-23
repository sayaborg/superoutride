import type { ArcadeVehicleState } from '../vehicle/physics/arcade-vehicle-physics.js';
import { setArcadeVehicleTireFrictionCalibration } from '../vehicle/physics/tire-friction-calibration.js';
import { mountMobileTireCalibrationSelector } from './mobile-selector-controls.js';
import {
  BROWSER_TIRE_AXES,
  stepBrowserTireCalibration,
  type BrowserTireCalibrationAxis,
} from './tire-friction-selection.js';

interface BrowserTireFrictionControls {
  handleKey(code: string): boolean;
}

/** Keyboard cycles forward; explicit +/- buttons own both directions through the same operation. */
export function mountBrowserTireFrictionControls(
  container: HTMLElement,
  getVehicle: () => ArcadeVehicleState,
  documentRef: Document = document,
): BrowserTireFrictionControls {
  const selector = mountMobileTireCalibrationSelector(
    container,
    getVehicle().tireFrictionCalibration,
    stepAxis,
    documentRef,
  );

  function stepAxis(axis: BrowserTireCalibrationAxis, direction: -1 | 1): void {
    const vehicle = getVehicle();
    setArcadeVehicleTireFrictionCalibration(
      vehicle,
      stepBrowserTireCalibration(axis, direction, vehicle.tireFrictionCalibration),
    );
    selector.setCalibration(vehicle.tireFrictionCalibration);
  }
  return Object.freeze({
    handleKey(code: string): boolean {
      const axis = BROWSER_TIRE_AXES.find((axis) => axis.code === code);
      if (!axis) return false;
      stepAxis(axis.id, 1);
      return true;
    },
  });
}
