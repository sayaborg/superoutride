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

interface BrowserSteeringCalibrationContainers {
  readonly steeringOffset: HTMLElement;
  readonly maxRoadWheelSteer: HTMLElement;
  readonly steeringResponse: HTMLElement;
}

/** One browser adapter connects DEV buttons to vehicle-owned D/M/ACT calibration. */
export function mountBrowserSteeringCalibrationControls(
  containers: BrowserSteeringCalibrationContainers,
  getVehicle: () => VehicleState,
  documentRef: Document = document,
): void {
  const bindings = [
    {
      container: containers.steeringOffset,
      read: (vehicle: VehicleState) => vehicle.steeringCalibration.steeringOffsetMax,
      write: setVehicleSteeringOffsetMax,
      mount: mountMobileSteeringOffsetSelector,
    },
    {
      container: containers.maxRoadWheelSteer,
      read: (vehicle: VehicleState) => vehicle.steeringCalibration.maxRoadWheelSteer,
      write: setVehicleMaxRoadWheelSteer,
      mount: mountMobileMaxRoadWheelSteerSelector,
    },
    {
      container: containers.steeringResponse,
      read: (vehicle: VehicleState) => vehicle.steeringCalibration.steeringActuatorResponse.applyRate,
      write: setVehicleSymmetricSteeringActuatorRate,
      mount: mountMobileSteeringResponseSelector,
    },
  ];
  for (const binding of bindings) {
    const initial = binding.read(getVehicle());
    const select = (value: number) => {
      binding.write(getVehicle(), value);
      selector.setActive(value);
    };
    const selector = binding.mount(binding.container, initial, select, documentRef);
  }
}
