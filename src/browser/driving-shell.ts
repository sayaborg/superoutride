import { LOGICAL_HEIGHT, LOGICAL_WIDTH } from '../core/constants.js';
import type { GuideCoordinateSource } from '../core/guide-coordinate-frame.js';
import type { HeightProfileReader } from '../visual/height-profile.js';
import type { SurfaceMapReader } from '../physics/surface-map.js';
import { createArcadeVehicle } from '../physics/arcade-vehicle-physics.js';
import type { CompiledArcadeVehicleProfile } from '../physics/vehicle-profiles.js';
import { setEngineTorqueMultiplier } from '../physics/automatic-powertrain.js';
import { createM5RecoveryState } from '../gameplay/recovery.js';
import { createM5CameraRig, resetM5CameraRig, setM5CameraYawMode, toggleM5CameraYawMode,
  type M5CameraState } from '../camera/m5-camera.js';
import { InputManager } from '../input/input-manager.js';
import type { DrivingInput } from '../input/driving-input.js';
import { SoftwareSurface } from '../render/software-surface.js';
import { drawVehicleYawDebug } from '../render/vehicle-yaw-debug.js';
import { DEFAULT_VEHICLE_CATALOG_ENTRY, vehicleCatalogEntryForId } from '../vehicle/vehicle-catalog.js';
import { browserVehicleProfileForKey } from './vehicle-profile-selection.js';
import { mountBrowserSteeringCalibrationControls } from './steering-calibration-controls.js';
import { DEFAULT_BROWSER_TIRE_FRICTION_CALIBRATION } from './tire-friction-selection.js';
import { mountBrowserTireFrictionControls } from './tire-friction-controls.js';
import { mountBrowserEnginePowerControls } from './engine-power-controls.js';
import { mountMobileCameraYawSelector, mountMobileVehicleSelector } from './mobile-selector-controls.js';
import { browserRequestsCameraYawToggle } from './camera-yaw-mode-selection.js';
import { browserUsesTouchInterface } from './touch-interface.js';
import { drawVehicleDebugHud } from './vehicle-debug-hud.js';
import type { BrowserCourseModeQuery } from './course-mode-selection.js';

/** Explicit active physical inputs. Route roots resolve charts/content before passing them here. */
export interface BrowserDrivingSurface {
  readonly guide: GuideCoordinateSource;
  readonly height: HeightProfileReader;
  readonly surfaces: SurfaceMapReader;
}

/** Shared browser/player wiring only. Route ticks, recovery geography and race state stay in roots. */
export function createBrowserDrivingShell(runtime: BrowserDrivingSurface, startL: number) {
  const canvas = mustGet<HTMLCanvasElement>('game');
  canvas.width = LOGICAL_WIDTH;
  canvas.height = LOGICAL_HEIGHT;
  document.documentElement.classList.toggle('touch-capable', browserUsesTouchInterface());
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) throw new Error('2D canvas context unavailable');
  ctx.imageSmoothingEnabled = false;
  const imageData = ctx.createImageData(LOGICAL_WIDTH, LOGICAL_HEIGHT);
  const framebuffer = new SoftwareSurface(LOGICAL_WIDTH, LOGICAL_HEIGHT,
    new Uint32Array(imageData.data.buffer));
  const inputManager = new InputManager(mustGet('steer-left-button'), mustGet('steer-right-button'),
    mustGet('throttle-button'), mustGet('brake-button'));
  let vehicle = createArcadeVehicle(DEFAULT_VEHICLE_CATALOG_ENTRY.profile,
    runtime.guide, runtime.height, runtime.surfaces, 45, startL, 45, undefined,
    DEFAULT_BROWSER_TIRE_FRICTION_CALIBRATION, DEFAULT_VEHICLE_CATALOG_ENTRY.torqueProtection);
  let recovery = createM5RecoveryState(vehicle);
  const cameraRig = createM5CameraRig();

  return {
    get vehicle() { return vehicle; },
    get recovery() { return recovery; },
    framebuffer, inputManager, cameraRig,
    /** Called after root-owned safe recovery; no chart or progress decision is made here. */
    replacePlayer(profile: Readonly<CompiledArcadeVehicleProfile>, active: BrowserDrivingSurface): void {
      const steeringCalibration = vehicle.steeringCalibration;
      const tireFrictionCalibration = vehicle.tireFrictionCalibration;
      const engineTorqueMultiplier = vehicle.powertrain.engineTorqueMultiplier;
      vehicle = createArcadeVehicle(profile, active.guide, active.height, active.surfaces,
        vehicle.course.s, vehicle.course.l, vehicle.longitudinalSpeed, steeringCalibration,
        tireFrictionCalibration, vehicleCatalogEntryForId(profile.id).torqueProtection);
      setEngineTorqueMultiplier(vehicle.powertrain, engineTorqueMultiplier);
      recovery = createM5RecoveryState(vehicle);
      resetM5CameraRig(cameraRig);
    },
    mountControls(onReplace: (profile: Readonly<CompiledArcadeVehicleProfile>) => void,
      onRecover: () => void): void {
      const selectVehicleProfile = (profile: Readonly<CompiledArcadeVehicleProfile>) => {
        if (profile.id === vehicle.profile.id) return;
        onReplace(profile);
        vehicleSelector.setActive(vehicle.profile.id);
      };
      const vehicleSelector = mountMobileVehicleSelector(mustGet('vehicle-selector-buttons'),
        vehicle.profile.id, selectVehicleProfile);
      const cameraYawSelector = mountMobileCameraYawSelector(mustGet('camera-selector-buttons'),
        cameraRig.yawMode, mode => {
          setM5CameraYawMode(cameraRig, mode);
          cameraYawSelector.setActive(mode);
        });
      const steeringCalibrationControls = mountBrowserSteeringCalibrationControls({
        steeringOffset: mustGet('steering-offset-selector-buttons'),
        maxRoadWheelSteer: mustGet('max-steer-selector-buttons'),
        steeringResponse: mustGet('steering-response-selector-buttons'),
      }, () => vehicle);
      const tireContainer = mustGet('tire-friction-selector-buttons');
      const tireFrictionControls = mountBrowserTireFrictionControls(tireContainer, () => vehicle);
      const enginePowerControls = mountBrowserEnginePowerControls(tireContainer, () => vehicle);
      window.addEventListener('keydown', event => {
        if (event.repeat) return;
        if (browserRequestsCameraYawToggle(event.code)) {
          cameraYawSelector.setActive(toggleM5CameraYawMode(cameraRig));
          return;
        }
        if (steeringCalibrationControls.handleKey(event.code)) return;
        if (tireFrictionControls.handleKey(event.code)) return;
        if (enginePowerControls.handleKey(event.code)) return;
        const selectedProfile = browserVehicleProfileForKey(event.code);
        if (selectedProfile !== null) {
          selectVehicleProfile(selectedProfile);
        } else if (event.code === 'Backspace') {
          event.preventDefault();
          onRecover();
        }
      });
    },
    present(query: BrowserCourseModeQuery, input: DrivingInput, camera: M5CameraState,
      playerScreenY: number): void {
      ctx.putImageData(imageData, 0, 0);
      drawVehicleDebugHud(ctx, query, input, vehicle);
      drawVehicleYawDebug(ctx, camera.playerScreenX, playerScreenY, vehicle.yaw,
        camera.movementYaw, camera.yaw, camera.yawMode);
    },
  };
}

function mustGet<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing #${id}`);
  return element as T;
}
