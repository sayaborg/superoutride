import { resetCameraRig, updateCamera, type CameraRig } from '../camera/camera.js';
import { CURRENT_CAMERA_PROFILE } from '../camera/current-camera-profile.js';
import { recoverVehicle, type RecoveryProfile, type RecoveryState } from '../gameplay/recovery.js';
import type { ArcadeVehicleState } from '../physics/arcade-vehicle-physics.js';
import type { VehicleWorld } from '../physics/vehicle-contract.js';
import type { CompiledArcadeVehicleProfile } from '../physics/vehicle-profiles.js';
import { SIM_DT } from './frame-loop.js';

interface DrivingPlayer {
  readonly vehicle: ArcadeVehicleState;
  readonly recovery: RecoveryState;
  readonly cameraRig: CameraRig;
  replacePlayer(profile: Readonly<CompiledArcadeVehicleProfile>, world: VehicleWorld): void;
}

export interface DrivingLifecycleOptions {
  readonly world: () => VehicleWorld;
  readonly recoveryProfile: Readonly<RecoveryProfile>;
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
  function reconstruct(profile?: Readonly<CompiledArcadeVehicleProfile>): void {
    const world = options.world();
    recoverVehicle(world, player.vehicle, {
      state: player.recovery,
      reason: 'manual',
      profile: options.recoveryProfile,
    });
    if (profile !== undefined) player.replacePlayer(profile, world);
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
    replace: (profile: Readonly<CompiledArcadeVehicleProfile>) => reconstruct(profile),
  };
}
