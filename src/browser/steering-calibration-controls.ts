import type { ArcadeVehicleState } from '../physics/arcade-vehicle-physics.js';
import {
  setArcadeVehicleMaxRoadWheelSteer,
  setArcadeVehicleSteeringOffsetMax,
  setArcadeVehicleSymmetricSteeringActuatorRate,
} from '../physics/vehicle-calibration.js';
import {
  BROWSER_MAX_STEER_CYCLE_CODE,
  BROWSER_STEERING_OFFSET_CYCLE_CODE,
  BROWSER_STEERING_RESPONSE_CYCLE_CODE,
  nextBrowserMaxRoadWheelSteer,
  nextBrowserSteeringOffset,
  nextBrowserSteeringResponseRate,
} from './steering-calibration-selection.js';
import {
  mountMobileMaxRoadWheelSteerSelector,
  mountMobileSteeringOffsetSelector,
  mountMobileSteeringResponseSelector,
} from './mobile-selector-controls.js';

export interface BrowserSteeringCalibrationContainers {
  readonly steeringOffset: HTMLElement;
  readonly maxRoadWheelSteer: HTMLElement;
  readonly steeringResponse: HTMLElement;
}

export interface BrowserSteeringCalibrationControls {
  handleKey(code: string): boolean;
}

/** One browser adapter connects keyboard and touch presentation to vehicle-owned M/D/T calibration. */
export function mountBrowserSteeringCalibrationControls(
  containers: BrowserSteeringCalibrationContainers,
  getVehicle: () => ArcadeVehicleState,
  documentRef: Document = document,
): BrowserSteeringCalibrationControls {
  const initial = getVehicle().steeringCalibration;
  const steeringOffsetSelector = mountMobileSteeringOffsetSelector(
    containers.steeringOffset,
    initial.steeringOffsetMax,
    selectSteeringOffset,
    documentRef,
  );
  const maxSteerSelector = mountMobileMaxRoadWheelSteerSelector(
    containers.maxRoadWheelSteer,
    initial.maxRoadWheelSteer,
    selectMaxSteer,
    documentRef,
  );
  const responseSelector = mountMobileSteeringResponseSelector(
    containers.steeringResponse,
    initial.steeringActuatorResponse.applyRate,
    selectResponse,
    documentRef,
  );

  function selectSteeringOffset(steeringOffsetMax: number): void {
    setArcadeVehicleSteeringOffsetMax(getVehicle(), steeringOffsetMax);
    steeringOffsetSelector.setActive(steeringOffsetMax);
  }

  function selectMaxSteer(maxRoadWheelSteer: number): void {
    setArcadeVehicleMaxRoadWheelSteer(getVehicle(), maxRoadWheelSteer);
    maxSteerSelector.setActive(maxRoadWheelSteer);
  }

  function selectResponse(rate: number): void {
    setArcadeVehicleSymmetricSteeringActuatorRate(getVehicle(), rate);
    responseSelector.setActive(rate);
  }

  return Object.freeze({
    handleKey(code: string): boolean {
      const vehicle = getVehicle();
      if (code === BROWSER_STEERING_OFFSET_CYCLE_CODE) {
        selectSteeringOffset(nextBrowserSteeringOffset(
          vehicle.steeringCalibration.steeringOffsetMax,
        ));
        return true;
      }
      if (code === BROWSER_MAX_STEER_CYCLE_CODE) {
        selectMaxSteer(nextBrowserMaxRoadWheelSteer(
          vehicle.steeringCalibration.maxRoadWheelSteer,
        ));
        return true;
      }
      if (code === BROWSER_STEERING_RESPONSE_CYCLE_CODE) {
        selectResponse(nextBrowserSteeringResponseRate(
          vehicle.steeringCalibration.steeringActuatorResponse.applyRate,
        ));
        return true;
      }
      return false;
    },
  });
}
