import type { ArcadeVehicleState } from '../physics/arcade-vehicle-physics.js';
import {
  setArcadeVehicleMaxRoadWheelSteer,
  setArcadeVehicleSteeringOffsetMax,
  setArcadeVehicleSymmetricSteeringActuatorRate,
} from '../physics/vehicle-calibration.js';
import {
  mountMobileMaxRoadWheelSteerSelector,
  mountMobileSteeringOffsetSelector,
  mountMobileSteeringResponseSelector,
} from './mobile-selector-controls.js';
import {
  BROWSER_MAX_STEER_CYCLE_CODE,
  BROWSER_STEERING_OFFSET_CYCLE_CODE,
  BROWSER_STEERING_RESPONSE_CYCLE_CODE,
  DEFAULT_BROWSER_MAX_ROAD_WHEEL_STEER,
  DEFAULT_BROWSER_STEERING_OFFSET,
  DEFAULT_BROWSER_STEERING_RESPONSE_RATE,
  nextBrowserMaxRoadWheelSteer,
  nextBrowserSteeringOffset,
  nextBrowserSteeringResponseRate,
} from './steering-calibration-selection.js';

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
  const bindings = [
    {
      code: BROWSER_STEERING_OFFSET_CYCLE_CODE,
      initial: DEFAULT_BROWSER_STEERING_OFFSET,
      container: containers.steeringOffset,
      read: (vehicle: ArcadeVehicleState) => vehicle.steeringCalibration.steeringOffsetMax,
      write: setArcadeVehicleSteeringOffsetMax,
      next: nextBrowserSteeringOffset,
      mount: mountMobileSteeringOffsetSelector,
    },
    {
      code: BROWSER_MAX_STEER_CYCLE_CODE,
      initial: DEFAULT_BROWSER_MAX_ROAD_WHEEL_STEER,
      container: containers.maxRoadWheelSteer,
      read: (vehicle: ArcadeVehicleState) => vehicle.steeringCalibration.maxRoadWheelSteer,
      write: setArcadeVehicleMaxRoadWheelSteer,
      next: nextBrowserMaxRoadWheelSteer,
      mount: mountMobileMaxRoadWheelSteerSelector,
    },
    {
      code: BROWSER_STEERING_RESPONSE_CYCLE_CODE,
      initial: DEFAULT_BROWSER_STEERING_RESPONSE_RATE,
      container: containers.steeringResponse,
      read: (vehicle: ArcadeVehicleState) => vehicle.steeringCalibration.steeringActuatorResponse.applyRate,
      write: setArcadeVehicleSymmetricSteeringActuatorRate,
      next: nextBrowserSteeringResponseRate,
      mount: mountMobileSteeringResponseSelector,
    },
  ];
  const keyActions = new Map<string, () => void>();
  for (const binding of bindings) {
    binding.write(getVehicle(), binding.initial);
    const select = (value: number) => {
      binding.write(getVehicle(), value);
      selector.setActive(value);
    };
    const selector = binding.mount(binding.container, binding.initial, select, documentRef);
    keyActions.set(binding.code, () => select(binding.next(binding.read(getVehicle()))));
  }
  return Object.freeze({
    handleKey(code: string): boolean {
      const action = keyActions.get(code);
      if (!action) return false;
      action();
      return true;
    },
  });
}
