import type { VehicleState } from '../vehicle/physics/vehicle-physics.js';
import {
  setVehicleMaxRoadWheelSteer,
  setVehicleSteeringOffsetMax,
  setVehicleSymmetricSteeringActuatorRate,
} from '../vehicle/physics/vehicle-calibration.js';
import {
  mountMobileMaxRoadWheelSteerSelector,
  mountMobileSteeringOffsetSelector,
  mountMobileSteeringResponseSelector,
} from './mobile-selector-controls.js';
import {
  BROWSER_MAX_STEER_CYCLE_CODE,
  BROWSER_STEERING_OFFSET_CYCLE_CODE,
  BROWSER_STEERING_RESPONSE_CYCLE_CODE,
  nextBrowserMaxRoadWheelSteer,
  nextBrowserSteeringOffset,
  nextBrowserSteeringResponseRate,
} from './steering-calibration-selection.js';

interface BrowserSteeringCalibrationContainers {
  readonly steeringOffset: HTMLElement;
  readonly maxRoadWheelSteer: HTMLElement;
  readonly steeringResponse: HTMLElement;
}

interface BrowserSteeringCalibrationControls {
  handleKey(code: string): boolean;
}

/** One browser adapter connects keyboard and touch presentation to vehicle-owned M/D/T calibration. */
export function mountBrowserSteeringCalibrationControls(
  containers: BrowserSteeringCalibrationContainers,
  getVehicle: () => VehicleState,
  documentRef: Document = document,
): BrowserSteeringCalibrationControls {
  const bindings = [
    {
      code: BROWSER_STEERING_OFFSET_CYCLE_CODE,
      container: containers.steeringOffset,
      read: (vehicle: VehicleState) => vehicle.steeringCalibration.steeringOffsetMax,
      write: setVehicleSteeringOffsetMax,
      next: nextBrowserSteeringOffset,
      mount: mountMobileSteeringOffsetSelector,
    },
    {
      code: BROWSER_MAX_STEER_CYCLE_CODE,
      container: containers.maxRoadWheelSteer,
      read: (vehicle: VehicleState) => vehicle.steeringCalibration.maxRoadWheelSteer,
      write: setVehicleMaxRoadWheelSteer,
      next: nextBrowserMaxRoadWheelSteer,
      mount: mountMobileMaxRoadWheelSteerSelector,
    },
    {
      code: BROWSER_STEERING_RESPONSE_CYCLE_CODE,
      container: containers.steeringResponse,
      read: (vehicle: VehicleState) => vehicle.steeringCalibration.steeringActuatorResponse.applyRate,
      write: setVehicleSymmetricSteeringActuatorRate,
      next: nextBrowserSteeringResponseRate,
      mount: mountMobileSteeringResponseSelector,
    },
  ];
  const keyActions = new Map<string, () => void>();
  for (const binding of bindings) {
    const initial = binding.read(getVehicle());
    const select = (value: number) => {
      binding.write(getVehicle(), value);
      selector.setActive(value);
    };
    const selector = binding.mount(binding.container, initial, select, documentRef);
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
