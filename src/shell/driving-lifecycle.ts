import {
  resetCameraRig,
  updateCamera,
  type CameraDefinition,
  type CameraRig,
  type CameraWorld,
} from '../view/camera.js';
import type { VehicleMotionRead } from '../vehicle/physics/vehicle-contract.js';
import type { CompiledDrivingDefinition } from '../vehicle/compiled-driving-definition.js';

export interface DrivingLifecycleOptions {
  readonly canRecover?: () => boolean;
  readonly world: () => CameraWorld;
  /** The camera definition in use: the product's, or a DEV adjustment of it. */
  readonly cameraDefinition: () => CameraDefinition;
  /** The player's borrowed competitor observation, current after each step and each manual recovery. */
  readonly observation: () => VehicleMotionRead;
  /** The race's manual recovery of the player; it also rewrites the player's observation. */
  readonly recover: () => void;
  /** DEV tuning: rebuild the Session around a vehicle driving the admitted tuned definition. */
  readonly rebuildSession: (driving: CompiledDrivingDefinition) => void;
}

/**
 * Browser camera following, one camera update per fixed step; the race owns mechanics, recovery and progress.
 * Recovery, a Session rebuild and START reset the camera to its target.
 */
export function createDrivingLifecycle(cameraRig: CameraRig, options: DrivingLifecycleOptions) {
  const follow = () => updateCamera(cameraRig, options.world(), options.observation(), options.cameraDefinition());
  let camera = follow();
  function update(recovered = false): void {
    if (recovered) resetCameraRig(cameraRig);
    camera = follow();
  }
  function reset(): void {
    resetCameraRig(cameraRig);
    camera = follow();
  }
  function recover(): void {
    options.recover();
    reset();
  }
  return {
    get camera() {
      return camera;
    },
    update,
    reset,
    recover,
  };
}
