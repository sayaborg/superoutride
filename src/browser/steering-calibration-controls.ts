import type { ArcadeVehicleState } from '../physics/arcade-vehicle-physics.js';
import {
  setArcadeVehicleSteeringYawTransientGain,
  setArcadeVehicleSteeringYawWashoutTime,
  setArcadeVehicleSymmetricSteeringActuatorRate,
} from '../physics/vehicle-calibration.js';
import {
  BROWSER_STEERING_RESPONSE_CYCLE_CODE,
  BROWSER_YAW_TRANSIENT_CYCLE_CODE,
  BROWSER_YAW_WASHOUT_CYCLE_CODE,
  nextBrowserSteeringResponseRate,
  nextBrowserYawTransientGain,
  nextBrowserYawWashoutTime,
  type BrowserYawTransientGain,
  type BrowserYawWashoutTime,
} from './steering-calibration-selection.js';
import {
  mountMobileSteeringResponseSelector,
  mountMobileYawTransientSelector,
  mountMobileYawWashoutSelector,
} from './mobile-selector-controls.js';

export interface BrowserSteeringCalibrationContainers {
  readonly yawTransient: HTMLElement;
  readonly yawWashout: HTMLElement;
  readonly steeringResponse: HTMLElement;
}

export interface BrowserSteeringCalibrationControls {
  handleKey(code: string): boolean;
}

/** One browser adapter connects keyboard and touch presentation to vehicle-owned calibration. */
export function mountBrowserSteeringCalibrationControls(
  containers: BrowserSteeringCalibrationContainers,
  getVehicle: () => ArcadeVehicleState,
  documentRef: Document = document,
): BrowserSteeringCalibrationControls {
  const initial = getVehicle().steeringCalibration;
  const yawTransientSelector = mountMobileYawTransientSelector(
    containers.yawTransient,
    initial.yawTransientGain,
    selectYawTransient,
    documentRef,
  );
  const yawWashoutSelector = mountMobileYawWashoutSelector(
    containers.yawWashout,
    initial.yawWashoutTime,
    selectYawWashout,
    documentRef,
  );
  const responseSelector = mountMobileSteeringResponseSelector(
    containers.steeringResponse,
    initial.steeringActuatorResponse.applyRate,
    selectResponse,
    documentRef,
  );

  function selectYawTransient(yawTransientGain: BrowserYawTransientGain): void {
    setArcadeVehicleSteeringYawTransientGain(getVehicle(), yawTransientGain);
    yawTransientSelector.setActive(yawTransientGain);
  }

  function selectYawWashout(yawWashoutTime: BrowserYawWashoutTime): void {
    setArcadeVehicleSteeringYawWashoutTime(getVehicle(), yawWashoutTime);
    yawWashoutSelector.setActive(yawWashoutTime);
  }

  function selectResponse(rate: number): void {
    setArcadeVehicleSymmetricSteeringActuatorRate(getVehicle(), rate);
    responseSelector.setActive(rate);
  }

  return Object.freeze({
    handleKey(code: string): boolean {
      const vehicle = getVehicle();
      if (code === BROWSER_YAW_TRANSIENT_CYCLE_CODE) {
        selectYawTransient(nextBrowserYawTransientGain(
          vehicle.steeringCalibration.yawTransientGain,
        ));
        return true;
      }
      if (code === BROWSER_YAW_WASHOUT_CYCLE_CODE) {
        selectYawWashout(nextBrowserYawWashoutTime(
          vehicle.steeringCalibration.yawWashoutTime,
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
