import { resetCameraRig, updateCamera, type CameraRig } from '../view/camera.js';
import { CURRENT_CAMERA_PROFILE } from '../view/current-camera-profile.js';
import { recoverVehicle, type RecoverySettings, type RecoveryState } from '../race/recovery.js';
import type { ArcadeVehicleState } from '../vehicle/physics/arcade-vehicle-physics.js';
import type { VehicleWorld } from '../course/vehicle-world.js';
import type { CompiledArcadeVehicleProfile } from '../vehicle/physics/vehicle-profiles.js';
import { SIM_DT } from './frame-loop.js';

interface DrivingPlayer {
  readonly vehicle: ArcadeVehicleState;
  readonly recovery: RecoveryState;
  readonly cameraRig: CameraRig;
  replacePlayer(profile: Readonly<CompiledArcadeVehicleProfile>, world: VehicleWorld): void;
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
  function reconstruct(profile?: Readonly<CompiledArcadeVehicleProfile>): void {
    const world = options.world();
    recoverVehicle(world, player.vehicle, {
      state: player.recovery,
      reason: 'manual',
      settings: options.recoveryL
        ? { ...options.recoverySettings, targetL: options.recoveryL }
        : options.recoverySettings,
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
