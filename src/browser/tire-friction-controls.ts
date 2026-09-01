import type { ArcadeVehicleState } from '../physics/arcade-vehicle-physics.js';
import { setArcadeVehicleTireFrictionCalibration } from '../physics/tire-friction-calibration.js';
import {
  BROWSER_TIRE_FRICTION_CYCLE_CODE,
  browserTirePresetCalibration,
  browserTirePresetIdForCalibration,
  nextBrowserTirePresetId,
  type BrowserTirePresetId,
} from './tire-friction-selection.js';
import { mountMobileTireFrictionSelector } from './mobile-selector-controls.js';

export interface BrowserTireFrictionControls {
  handleKey(code: string): boolean;
}

/** One browser adapter connects keyboard and touch to vehicle-owned tire calibration. */
export function mountBrowserTireFrictionControls(
  container: HTMLElement,
  getVehicle: () => ArcadeVehicleState,
  documentRef: Document = document,
): BrowserTireFrictionControls {
  const selector = mountMobileTireFrictionSelector(
    container,
    browserTirePresetIdForCalibration(getVehicle().tireFrictionCalibration) ?? '100',
    selectPreset,
    documentRef,
  );

  function selectPreset(id: BrowserTirePresetId): void {
    setArcadeVehicleTireFrictionCalibration(getVehicle(), browserTirePresetCalibration(id));
    selector.setActive(id);
  }

  return Object.freeze({
    handleKey(code: string): boolean {
      if (code !== BROWSER_TIRE_FRICTION_CYCLE_CODE) return false;
      selectPreset(nextBrowserTirePresetId(getVehicle().tireFrictionCalibration));
      return true;
    },
  });
}
