import type { ArcadeVehicleState } from '../physics/arcade-vehicle-physics.js';
import { setArcadeVehicleTireFrictionCalibration } from '../physics/tire-friction-calibration.js';
import { BROWSER_TIRE_AXES, stepBrowserTireCalibration, type BrowserTireCalibrationAxis } from './tire-friction-selection.js';
import { mountMobileTireCalibrationSelector } from './mobile-selector-controls.js';

export interface BrowserTireFrictionControls {
  handleKey(code: string, reverse?: boolean): boolean;
}

/** Keyboard and +/- buttons share one five-axis operation on the current vehicle. */
export function mountBrowserTireFrictionControls(
  container: HTMLElement, getVehicle: () => ArcadeVehicleState, documentRef: Document = document,
): BrowserTireFrictionControls {
  const selector = mountMobileTireCalibrationSelector(container,
    getVehicle().tireFrictionCalibration, stepAxis, documentRef);

  function stepAxis(axis: BrowserTireCalibrationAxis, direction: -1 | 1): void {
    const vehicle = getVehicle();
    setArcadeVehicleTireFrictionCalibration(vehicle,
      stepBrowserTireCalibration(axis, direction, vehicle.tireFrictionCalibration));
    selector.setCalibration(vehicle.tireFrictionCalibration);
  }
  return Object.freeze({
    handleKey(code: string, reverse = false): boolean {
      const axis = BROWSER_TIRE_AXES.find(axis => axis.code === code);
      if (!axis) return false;
      stepAxis(axis.id, reverse ? -1 : 1);
      return true;
    },
  });
}
