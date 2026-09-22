import type { SessionVehicle } from '../gameplay/session-configuration.js';
import { createAudioLifecycle } from './audio-lifecycle.js';
import { createDrivingLifecycle, type DrivingLifecycleOptions } from './driving-lifecycle.js';
import type { CameraRig } from '../camera/camera.js';
import { createCameraRig, setCameraYawMode, toggleCameraYawMode, type CameraState } from '../camera/camera.js';
import { LOGICAL_HEIGHT, LOGICAL_WIDTH } from '../core/presentation-scale.js';
import type { RecoveryState } from '../gameplay/recovery.js';
import { createRecoveryState } from '../gameplay/recovery.js';
import { SoftwareSurface } from '../graphics/software-surface.js';
import type { DrivingInput } from '../vehicle/driving-input.js';
import { InputManager } from '../input/input-manager.js';
import type { ArcadeVehicleState } from '../vehicle/physics/arcade-vehicle-physics.js';
import { createArcadeVehicle } from '../vehicle/physics/arcade-vehicle-physics.js';
import type { VehicleWorld } from '../vehicle/physics/vehicle-contract.js';
import type { CompiledArcadeVehicleProfile } from '../vehicle/physics/vehicle-profiles.js';
import { drawVehicleLeanDebug } from './debug/vehicle-lean-debug.js';
import { drawVehicleYawDebug } from './debug/vehicle-yaw-debug.js';
import type { VehicleCatalogEntry } from '../vehicle/vehicle-catalog.js';
import { DEFAULT_VEHICLE_CATALOG_ENTRY, vehicleCatalogEntryForId } from '../vehicle/vehicle-catalog.js';
import type { BrowserCourseModeQuery } from './course-mode-selection.js';
import { mustGet } from './dom.js';
import { createFrameLoop, type FrameLoop } from './frame-loop.js';
import { BROWSER_RECOVERY_CODE, browserRequestsCameraYawToggle } from './key-bindings.js';
import { mountMobileCameraYawSelector, mountMobileVehicleSelector } from './mobile-selector-controls.js';
import { mountBrowserSteeringCalibrationControls } from './steering-calibration-controls.js';
import { mountBrowserTireFrictionControls } from './tire-friction-controls.js';
import { DEFAULT_BROWSER_TIRE_FRICTION_CALIBRATION } from './tire-friction-selection.js';
import { browserUsesTouchInterface } from './touch-interface.js';
import { drawVehicleDebugHud } from './vehicle-debug-hud.js';
import { browserVehicleProfileForKey } from './vehicle-profile-selection.js';

interface BrowserDrivingShell {
  readonly vehicle: ArcadeVehicleState;
  readonly presentation: VehicleCatalogEntry;
  readonly recovery: RecoveryState;
  readonly framebuffer: SoftwareSurface;
  readonly inputManager: InputManager;
  readonly cameraRig: CameraRig;
  replacePlayer(profile: Readonly<CompiledArcadeVehicleProfile>, active: VehicleWorld): void;
  mountControls(options: DrivingLifecycleOptions): ReturnType<typeof createDrivingLifecycle>;
  present(
    query: BrowserCourseModeQuery,
    input: DrivingInput,
    camera: CameraState,
    playerScreenY: number,
    rivals?: readonly { readonly vehicle: ArcadeVehicleState }[],
  ): void;
  start(tick: (dt: number) => void, render: () => void): void;
  stop(): void;
  dispose(): void;
}

/** Shared browser/player wiring only. Route ticks, recovery geography and race state stay in roots. */
export function createBrowserDrivingShell(
  runtime: VehicleWorld,
  startL: number,
  spawn: { readonly initialSpeed?: number; readonly s?: number; readonly vehicle?: SessionVehicle } = {},
): BrowserDrivingShell {
  const canvas = mustGet<HTMLCanvasElement>('game');
  canvas.width = LOGICAL_WIDTH;
  canvas.height = LOGICAL_HEIGHT;
  document.documentElement.classList.toggle('touch-capable', browserUsesTouchInterface());
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) throw new Error('2D canvas context unavailable');
  ctx.imageSmoothingEnabled = false;
  const imageData = ctx.createImageData(LOGICAL_WIDTH, LOGICAL_HEIGHT);
  const framebuffer = new SoftwareSurface(LOGICAL_WIDTH, LOGICAL_HEIGHT, new Uint32Array(imageData.data.buffer));
  const inputManager = new InputManager();
  const selected = spawn.vehicle;
  let vehicle = createArcadeVehicle(selected?.profile ?? DEFAULT_VEHICLE_CATALOG_ENTRY.profile, runtime, {
    s: spawn.s ?? 45,
    l: startL,
    initialSpeed: spawn.initialSpeed ?? 45,
    tireFrictionCalibration: selected?.tireFrictionCalibration ?? DEFAULT_BROWSER_TIRE_FRICTION_CALIBRATION,
    steeringCalibration: selected?.steeringCalibration,
    torqueProtection: selected?.torqueProtection ?? DEFAULT_VEHICLE_CATALOG_ENTRY.torqueProtection,
  });
  let recovery = createRecoveryState(vehicle);
  const cameraRig = createCameraRig();

  const audio = createAudioLifecycle();
  let loop: FrameLoop | null = null;
  window.addEventListener('pagehide', () => {
    loop?.stop();
    audio.setActive(false);
  });
  window.addEventListener('pageshow', (event) => {
    if (event.persisted) location.reload();
  });
  return {
    start(tick, render): void {
      loop?.stop();
      loop = createFrameLoop(tick, render);
      inputManager.setSuspended(false);
      audio.setActive(true);
      render();
      loop.start();
    },
    stop(): void {
      loop?.stop();
      audio.setActive(false);
    },
    dispose(): void {
      inputManager.setSuspended(true);
      loop?.stop();
      audio.dispose();
    },
    get vehicle() {
      return vehicle;
    },
    get presentation() {
      return vehicleCatalogEntryForId(vehicle.profile.id);
    },
    get recovery() {
      return recovery;
    },
    framebuffer,
    inputManager,
    cameraRig,
    /** Called by the shared lifecycle after safe recovery; no chart or progress decision is made here. */
    replacePlayer(profile: Readonly<CompiledArcadeVehicleProfile>, active: VehicleWorld): void {
      const steeringCalibration = vehicle.steeringCalibration;
      const tireFrictionCalibration = vehicle.tireFrictionCalibration;
      vehicle = createArcadeVehicle(profile, active, {
        s: vehicle.course.s,
        l: vehicle.course.l,
        initialSpeed: vehicle.longitudinalSpeed,
        steeringCalibration,
        tireFrictionCalibration,
        torqueProtection: vehicleCatalogEntryForId(profile.id).torqueProtection,
      });
      recovery = createRecoveryState(vehicle);
    },
    mountControls(options: DrivingLifecycleOptions) {
      const lifecycle = createDrivingLifecycle(this, options);
      const selectVehicleProfile = (profile: Readonly<CompiledArcadeVehicleProfile>) => {
        if (options.configurationLocked || profile.id === vehicle.profile.id) return;
        lifecycle.replace(profile);
        vehicleSelector.setActive(vehicle.profile.id);
      };
      const vehicleSelector = mountMobileVehicleSelector(
        mustGet('vehicle-selector-buttons'),
        vehicle.profile.id,
        selectVehicleProfile,
      );
      const cameraYawSelector = mountMobileCameraYawSelector(
        mustGet('camera-selector-buttons'),
        cameraRig.yawMode,
        (mode) => {
          setCameraYawMode(cameraRig, mode);
          cameraYawSelector.setActive(mode);
        },
      );
      const steeringCalibrationControls = mountBrowserSteeringCalibrationControls(
        {
          steeringOffset: mustGet('steering-offset-selector-buttons'),
          maxRoadWheelSteer: mustGet('max-steer-selector-buttons'),
          steeringResponse: mustGet('steering-response-selector-buttons'),
        },
        () => vehicle,
      );
      const tireContainer = mustGet('tire-friction-selector-buttons');
      const tireFrictionControls = mountBrowserTireFrictionControls(tireContainer, () => vehicle);
      if (options.configurationLocked) {
        for (const id of [
          'vehicle-selector-buttons',
          'steering-offset-selector-buttons',
          'max-steer-selector-buttons',
          'steering-response-selector-buttons',
          'tire-friction-selector-buttons',
        ]) {
          const container = mustGet(id);
          for (const child of Array.from(container.querySelectorAll('button'))) child.disabled = true;
        }
      }
      window.addEventListener('keydown', (event) => {
        if (event.repeat) return;
        if (browserRequestsCameraYawToggle(event.code)) {
          cameraYawSelector.setActive(toggleCameraYawMode(cameraRig));
          return;
        }
        if (!options.configurationLocked && steeringCalibrationControls.handleKey(event.code)) return;
        if (!options.configurationLocked && tireFrictionControls.handleKey(event.code)) return;
        const selectedProfile = browserVehicleProfileForKey(event.code);
        if (selectedProfile !== null) {
          selectVehicleProfile(selectedProfile);
        } else if (event.code === BROWSER_RECOVERY_CODE) {
          event.preventDefault();
          if (options.canRecover?.() ?? true) lifecycle.recover();
        }
      });
      return lifecycle;
    },
    present(
      query: BrowserCourseModeQuery,
      input: DrivingInput,
      camera: CameraState,
      playerScreenY: number,
      rivals: readonly { readonly vehicle: ArcadeVehicleState }[] = [],
    ): void {
      audio.update(vehicle, rivals);
      ctx.putImageData(imageData, 0, 0);
      drawVehicleDebugHud(ctx, query, input, vehicle);
      if (vehicleCatalogEntryForId(vehicle.profile.id).presentationFamily === 'BIKE') {
        drawVehicleLeanDebug(ctx, camera.playerScreenX, playerScreenY, vehicle);
      }
      drawVehicleYawDebug(
        ctx,
        camera.playerScreenX,
        playerScreenY,
        vehicle.yaw,
        camera.movementYaw,
        camera.yaw,
        camera.yawMode,
      );
    },
  };
}
