import type { CameraRig } from '../camera/camera.js';
import {
  createCameraRig,
  resetCameraRig,
  setCameraYawMode,
  toggleCameraYawMode,
  type CameraState,
} from '../camera/camera.js';
import { LOGICAL_HEIGHT, LOGICAL_WIDTH } from '../core/constants.js';
import type { RecoveryState } from '../gameplay/recovery.js';
import { createRecoveryState } from '../gameplay/recovery.js';
import type { DrivingInput } from '../input/driving-input.js';
import { InputManager } from '../input/input-manager.js';
import type { ArcadeVehicleState } from '../physics/arcade-vehicle-physics.js';
import { createArcadeVehicle } from '../physics/arcade-vehicle-physics.js';
import type { VehicleWorld } from '../physics/vehicle-contract.js';
import type { CompiledArcadeVehicleProfile } from '../physics/vehicle-profiles.js';
import { SoftwareSurface } from '../render/software-surface.js';
import { drawVehicleLeanDebug } from '../render/vehicle-lean-debug.js';
import { drawVehicleYawDebug } from '../render/vehicle-yaw-debug.js';
import type { VehicleCatalogEntry } from '../vehicle/vehicle-catalog.js';
import { DEFAULT_VEHICLE_CATALOG_ENTRY, vehicleCatalogEntryForId } from '../vehicle/vehicle-catalog.js';
import { browserRequestsCameraYawToggle, BROWSER_RECOVERY_CODE } from './key-bindings.js';
import type { BrowserCourseModeQuery } from './course-mode-selection.js';
import { createFrameLoop, type FrameLoop } from './frame-loop.js';
import { mountMobileCameraYawSelector, mountMobileVehicleSelector } from './mobile-selector-controls.js';
import { mountBrowserSteeringCalibrationControls } from './steering-calibration-controls.js';
import { mountBrowserTireFrictionControls } from './tire-friction-controls.js';
import { DEFAULT_BROWSER_TIRE_FRICTION_CALIBRATION } from './tire-friction-selection.js';
import { browserUsesTouchInterface } from './touch-interface.js';
import { drawVehicleDebugHud } from './vehicle-debug-hud.js';
import { browserVehicleProfileForKey } from './vehicle-profile-selection.js';

export interface BrowserDrivingShell {
  readonly vehicle: ArcadeVehicleState;
  readonly presentation: VehicleCatalogEntry;
  readonly recovery: RecoveryState;
  readonly framebuffer: SoftwareSurface;
  readonly inputManager: InputManager;
  readonly cameraRig: CameraRig;
  replacePlayer(profile: Readonly<CompiledArcadeVehicleProfile>, active: VehicleWorld): void;
  mountControls(onReplace: (profile: Readonly<CompiledArcadeVehicleProfile>) => void, onRecover: () => void): void;
  present(query: BrowserCourseModeQuery, input: DrivingInput, camera: CameraState, playerScreenY: number): void;
  start(tick: (dt: number) => void, render: () => void): void;
  stop(): void;
}

/** Shared browser/player wiring only. Route ticks, recovery geography and race state stay in roots. */
export function createBrowserDrivingShell(runtime: VehicleWorld, startL: number): BrowserDrivingShell {
  const canvas = mustGet<HTMLCanvasElement>('game');
  canvas.width = LOGICAL_WIDTH;
  canvas.height = LOGICAL_HEIGHT;
  document.documentElement.classList.toggle('touch-capable', browserUsesTouchInterface());
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) throw new Error('2D canvas context unavailable');
  ctx.imageSmoothingEnabled = false;
  const imageData = ctx.createImageData(LOGICAL_WIDTH, LOGICAL_HEIGHT);
  const framebuffer = new SoftwareSurface(LOGICAL_WIDTH, LOGICAL_HEIGHT, new Uint32Array(imageData.data.buffer));
  const inputManager = new InputManager(
    mustGet('steer-left-button'),
    mustGet('steer-right-button'),
    mustGet('throttle-button'),
    mustGet('brake-button'),
  );
  let vehicle = createArcadeVehicle(DEFAULT_VEHICLE_CATALOG_ENTRY.profile, runtime, {
    s: 45,
    l: startL,
    initialSpeed: 45,
    tireFrictionCalibration: DEFAULT_BROWSER_TIRE_FRICTION_CALIBRATION,
    torqueProtection: DEFAULT_VEHICLE_CATALOG_ENTRY.torqueProtection,
  });
  let recovery = createRecoveryState(vehicle);
  const cameraRig = createCameraRig();

  let loop: FrameLoop | null = null;
  return {
    start(tick, render): void {
      loop?.stop();
      loop = createFrameLoop(tick, render);
      loop.start();
    },
    stop(): void {
      loop?.stop();
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
    /** Called after root-owned safe recovery; no chart or progress decision is made here. */
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
      resetCameraRig(cameraRig);
    },
    mountControls(onReplace: (profile: Readonly<CompiledArcadeVehicleProfile>) => void, onRecover: () => void): void {
      const selectVehicleProfile = (profile: Readonly<CompiledArcadeVehicleProfile>) => {
        if (profile.id === vehicle.profile.id) return;
        onReplace(profile);
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
      window.addEventListener('keydown', (event) => {
        if (event.repeat) return;
        if (browserRequestsCameraYawToggle(event.code)) {
          cameraYawSelector.setActive(toggleCameraYawMode(cameraRig));
          return;
        }
        if (steeringCalibrationControls.handleKey(event.code)) return;
        if (tireFrictionControls.handleKey(event.code)) return;
        const selectedProfile = browserVehicleProfileForKey(event.code);
        if (selectedProfile !== null) {
          selectVehicleProfile(selectedProfile);
        } else if (event.code === BROWSER_RECOVERY_CODE) {
          event.preventDefault();
          onRecover();
        }
      });
    },
    present(query: BrowserCourseModeQuery, input: DrivingInput, camera: CameraState, playerScreenY: number): void {
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

function mustGet<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing #${id}`);
  return element as T;
}
