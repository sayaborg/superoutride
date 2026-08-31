import type { ArcadeVehicleState } from '../physics/arcade-vehicle-physics.js';
import { setArcadeVehicleReferenceFrictionMultiplier } from '../physics/tire-friction-calibration.js';
import {
  BROWSER_TIRE_FRICTION_CYCLE_CODE,
  nextBrowserTireFrictionMultiplier,
  type BrowserTireFrictionMultiplier,
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
    getVehicle().tireFrictionCalibration.referenceFrictionMultiplier,
    selectMultiplier,
    documentRef,
  );

  function selectMultiplier(multiplier: BrowserTireFrictionMultiplier): void {
    setArcadeVehicleReferenceFrictionMultiplier(getVehicle(), multiplier);
    selector.setActive(multiplier);
  }

  return Object.freeze({
    handleKey(code: string): boolean {
      if (code !== BROWSER_TIRE_FRICTION_CYCLE_CODE) return false;
      selectMultiplier(nextBrowserTireFrictionMultiplier(
        getVehicle().tireFrictionCalibration.referenceFrictionMultiplier,
      ));
      return true;
    },
  });
}
