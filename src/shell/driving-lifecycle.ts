import { resetCameraRig, updateCamera, type CameraRig } from '../view/camera.js';
import { CURRENT_CAMERA_PROFILE } from '../view/current-camera-profile.js';
import { recoverVehicle, type RecoverySettings, type RecoveryState } from '../race/recovery.js';
import type { VehicleState } from '../vehicle/physics/vehicle-physics.js';
import type { VehicleModel } from '../vehicle/physics/vehicle-model.js';
import type { VehicleWorld } from '../course/vehicle-world.js';
import type { CompiledVehicle } from '../vehicle/physics/vehicle-definitions.js';
import { SIM_DT } from '../race/fixed-step.js';

interface DrivingPlayer {
  readonly vehicle: VehicleState;
  readonly model: VehicleModel;
  readonly recovery: RecoveryState;
  readonly cameraRig: CameraRig;
  replacePlayer(compiledVehicle: Readonly<CompiledVehicle>, world: VehicleWorld): void;
}

export interface DrivingLifecycleOptions {
  readonly configurationLocked?: boolean;
  readonly canRecover?: () => boolean;
  readonly world: () => VehicleWorld;
  readonly recoverySettings: Readonly<RecoverySettings>;
  readonly recoveryL?: (s: number) => number;
  /** Replaces observation baselines after a manual discontinuity without awarding progress. */
  readonly resync?: () => void;
}

/** Browser discontinuity order; route/race ticks retain their own recovery and progress rules. */
export function createDrivingLifecycle(player: DrivingPlayer, options: DrivingLifecycleOptions) {
  let camera = updateCamera(player.cameraRig, options.world(), player.vehicle, CURRENT_CAMERA_PROFILE, SIM_DT);
  function update(dt: number, recovered = false): void {
    if (recovered) resetCameraRig(player.cameraRig);
    camera = updateCamera(player.cameraRig, options.world(), player.vehicle, CURRENT_CAMERA_PROFILE, dt);
  }
  function reconstruct(compiledVehicle?: Readonly<CompiledVehicle>): void {
    const world = options.world();
    recoverVehicle(world, player.vehicle, player.model, {
      state: player.recovery,
      reason: 'manual',
      settings: options.recoveryL
        ? { ...options.recoverySettings, targetL: options.recoveryL }
        : options.recoverySettings,
    });
    if (compiledVehicle !== undefined) player.replacePlayer(compiledVehicle, world);
    resetCameraRig(player.cameraRig);
    options.resync?.();
    update(SIM_DT);
  }
  return {
    get camera() {
      return camera;
    },
    update,
    recover: () => reconstruct(),
    replace: (compiledVehicle: Readonly<CompiledVehicle>) => reconstruct(compiledVehicle),
  };
}
