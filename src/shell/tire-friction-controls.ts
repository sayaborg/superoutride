import {
  compileTireCharacteristics,
  createVehicleTireFrictionCalibration,
} from '../vehicle/physics/tire-friction-calibration.js';
import { retuneVehicleModel } from '../vehicle/physics/vehicle-model.js';
import { mountMobileTireCalibrationSelector } from './mobile-selector-controls.js';
import type { VehicleModelSlot } from './steering-calibration-controls.js';
import { stepBrowserTireCalibration, type BrowserTireCalibrationAxis } from './tire-friction-selection.js';

/** Explicit +/- buttons own both directions through one operation; both stations stay linked. */
export function mountBrowserTireFrictionControls(
  container: HTMLElement,
  slot: VehicleModelSlot,
  documentRef: Document = document,
): void {
  const selector = mountMobileTireCalibrationSelector(container, slot.get().tires, stepAxis, documentRef);

  function stepAxis(axis: BrowserTireCalibrationAxis, direction: -1 | 1): void {
    const model = slot.get();
    const tires = createVehicleTireFrictionCalibration(
      compileTireCharacteristics(stepBrowserTireCalibration(axis, direction, model.tires)),
    );
    const next = retuneVehicleModel(model, { tires });
    slot.set(next);
    selector.setCalibration(next.tires);
  }
}
