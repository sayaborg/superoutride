import type { ArcadeVehicleState } from '../physics/arcade-vehicle-physics.js';
import { setArcadeVehicleTireFrictionCalibration } from '../physics/tire-friction-calibration.js';
import {
  BROWSER_TIRE_GRIP_CYCLE_CODE,
  BROWSER_TIRE_PEAK_CYCLE_CODE,
  BROWSER_TIRE_SLIDE_CYCLE_CODE,
  browserTireCalibrationForGrip,
  browserTireCalibrationForPeak,
  browserTireCalibrationForSlide,
  nextBrowserTireGripId,
  nextBrowserTirePeakId,
  nextBrowserTireSlideId,
  type BrowserTireCalibrationAxis,
} from './tire-friction-selection.js';
import { mountMobileTireCalibrationSelector } from './mobile-selector-controls.js';

export interface BrowserTireFrictionControls {
  handleKey(code: string): boolean;
}

/** One browser adapter connects keyboard and touch to the three vehicle-owned tire calibration axes. */
export function mountBrowserTireFrictionControls(
  container: HTMLElement,
  getVehicle: () => ArcadeVehicleState,
  documentRef: Document = document,
): BrowserTireFrictionControls {
  const selector = mountMobileTireCalibrationSelector(
    container,
    getVehicle().tireFrictionCalibration,
    cycleAxis,
    documentRef,
  );

  function applyCalibration(
    calibration: Parameters<typeof setArcadeVehicleTireFrictionCalibration>[1],
  ): void {
    setArcadeVehicleTireFrictionCalibration(getVehicle(), calibration);
    selector.setCalibration(getVehicle().tireFrictionCalibration);
  }

  function cycleAxis(axis: BrowserTireCalibrationAxis): void {
    const current = getVehicle().tireFrictionCalibration;
    if (axis === 'GRIP') {
      applyCalibration(browserTireCalibrationForGrip(nextBrowserTireGripId(current), current));
      return;
    }
    if (axis === 'PEAK') {
      applyCalibration(browserTireCalibrationForPeak(nextBrowserTirePeakId(current), current));
      return;
    }
    applyCalibration(browserTireCalibrationForSlide(nextBrowserTireSlideId(current), current));
  }

  return Object.freeze({
    handleKey(code: string): boolean {
      if (code === BROWSER_TIRE_GRIP_CYCLE_CODE) {
        cycleAxis('GRIP');
        return true;
      }
      if (code === BROWSER_TIRE_PEAK_CYCLE_CODE) {
        cycleAxis('PEAK');
        return true;
      }
      if (code === BROWSER_TIRE_SLIDE_CYCLE_CODE) {
        cycleAxis('SLIDE');
        return true;
      }
      return false;
    },
  });
}
