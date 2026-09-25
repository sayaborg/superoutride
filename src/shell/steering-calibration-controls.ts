import { retuneVehicleModel, type VehicleModel } from '../vehicle/physics/vehicle-model.js';
import type { VehicleSteeringCalibrationInput } from '../vehicle/physics/vehicle-calibration.js';
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

/** The player's current model; DEV tuning replaces it and the next step uses the replacement. */
export interface VehicleModelSlot {
  get(): VehicleModel;
  set(model: VehicleModel): void;
}

/** One browser adapter connects DEV buttons to the model's D/M/ACT steering calibration. */
export function mountBrowserSteeringCalibrationControls(
  containers: BrowserSteeringCalibrationContainers,
  slot: VehicleModelSlot,
  documentRef: Document = document,
): void {
  type Steering = VehicleSteeringCalibrationInput;
  const bindings = [
    {
      container: containers.steeringOffset,
      read: (steering: Steering) => steering.steeringOffsetMax,
      write: (steering: Steering, value: number): Steering => ({ ...steering, steeringOffsetMax: value }),
      mount: mountMobileSteeringOffsetSelector,
    },
    {
      container: containers.maxRoadWheelSteer,
      read: (steering: Steering) => steering.maxRoadWheelSteer,
      write: (steering: Steering, value: number): Steering => ({ ...steering, maxRoadWheelSteer: value }),
      mount: mountMobileMaxRoadWheelSteerSelector,
    },
    {
      container: containers.steeringResponse,
      read: (steering: Steering) => steering.steeringActuatorResponse.applyRate,
      write: (steering: Steering, value: number): Steering => ({
        ...steering,
        steeringActuatorResponse: { applyRate: value, releaseRate: value },
      }),
      mount: mountMobileSteeringResponseSelector,
    },
  ];
  for (const binding of bindings) {
    const initial = binding.read(slot.get().steering);
    const select = (value: number) => {
      const model = slot.get();
      slot.set(retuneVehicleModel(model, { steering: binding.write(model.steering, value) }));
      selector.setActive(value);
    };
    const selector = binding.mount(binding.container, initial, select, documentRef);
  }
}
