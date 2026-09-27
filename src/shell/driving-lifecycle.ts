import { resetCameraRig, updateCamera, type CameraRig } from '../view/camera.js';
import { CURRENT_CAMERA_PROFILE } from '../view/current-camera-profile.js';
import type { VehicleWorld } from '../course/vehicle-world.js';
import type { VehicleCameraReadState } from '../vehicle/physics/vehicle-contract.js';
import type { CompiledDrivingDefinition } from '../vehicle/compiled-driving-definition.js';

export interface DrivingLifecycleOptions {
  readonly canRecover?: () => boolean;
  readonly world: () => VehicleWorld;
  /** The player's borrowed competitor observation, current after each step and each manual recovery. */
  readonly observation: () => VehicleCameraReadState;
  /** The race's manual recovery of the player; it also rewrites the player's observation. */
  readonly recover: () => void;
  /** Interim DEV tuning path until 10-7b: the race gives the player a model of the tuned definition. */
  readonly tunePlayerDriving: (driving: CompiledDrivingDefinition) => void;
}

/** Browser camera following; the race owns mechanics, recovery and progress. */
export function createDrivingLifecycle(cameraRig: CameraRig, options: DrivingLifecycleOptions) {
  let camera = updateCamera(cameraRig, options.world(), options.observation(), CURRENT_CAMERA_PROFILE);
  function update(recovered = false): void {
    if (recovered) resetCameraRig(cameraRig);
    camera = updateCamera(cameraRig, options.world(), options.observation(), CURRENT_CAMERA_PROFILE);
  }
  function recover(): void {
    options.recover();
    resetCameraRig(cameraRig);
    update();
  }
  return {
    get camera() {
      return camera;
    },
    update,
    recover,
  };
}
