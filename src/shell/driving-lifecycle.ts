import { resetCameraRig, updateCamera, type CameraRig } from '../view/camera.js';
import { CURRENT_CAMERA_PROFILE } from '../view/current-camera-profile.js';
import { recoverVehicle, type RecoverySettings, type RecoveryState } from '../race/recovery.js';
import type { VehicleState } from '../vehicle/physics/vehicle-physics.js';
import type { VehicleModel } from '../vehicle/physics/vehicle-model.js';
import type { VehicleWorld } from '../course/vehicle-world.js';
import type { VehicleCameraReadState } from '../vehicle/physics/vehicle-contract.js';

interface DrivingPlayer {
  readonly vehicle: VehicleState;
  readonly model: VehicleModel;
  readonly recovery: RecoveryState;
  readonly cameraRig: CameraRig;
}

export interface DrivingLifecycleOptions {
  readonly canRecover?: () => boolean;
  readonly world: () => VehicleWorld;
  readonly recoverySettings: Readonly<RecoverySettings>;
  /** The player's borrowed competitor observation, current after each step and each manual discontinuity. */
  readonly observation: () => VehicleCameraReadState;
  readonly recoveryL?: (s: number) => number;
  /** Replaces observation baselines after a manual discontinuity without awarding progress. */
  readonly resync?: () => void;
}

/** Browser discontinuity order; route/race ticks retain their own recovery and progress rules. */
export function createDrivingLifecycle(player: DrivingPlayer, options: DrivingLifecycleOptions) {
  let camera = updateCamera(player.cameraRig, options.world(), options.observation(), CURRENT_CAMERA_PROFILE);
  function update(recovered = false): void {
    if (recovered) resetCameraRig(player.cameraRig);
    camera = updateCamera(player.cameraRig, options.world(), options.observation(), CURRENT_CAMERA_PROFILE);
  }
  function recover(): void {
    recoverVehicle(options.world(), player.vehicle, player.model, {
      state: player.recovery,
      reason: 'manual',
      settings: options.recoveryL
        ? { ...options.recoverySettings, targetL: options.recoveryL }
        : options.recoverySettings,
    });
    resetCameraRig(player.cameraRig);
    options.resync?.();
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
