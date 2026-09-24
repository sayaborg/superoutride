import type { SessionVehicle } from '../race/session-configuration.js';
import { createAudioLifecycle } from './audio-lifecycle.js';
import { createDrivingLifecycle, type DrivingLifecycleOptions } from './driving-lifecycle.js';
import type { CameraRig } from '../view/camera.js';
import { createCameraRig, setCameraYawMode, toggleCameraYawMode, type CameraState } from '../view/camera.js';
import { LOGICAL_HEIGHT, LOGICAL_WIDTH } from '../view/display-scale.js';
import type { RecoveryState } from '../race/recovery.js';
import { createRecoveryState } from '../race/recovery.js';
import { SoftwareSurface } from '../view/software-surface.js';
import type { DrivingInput } from '../vehicle/driving-input.js';
import { InputManager } from '../input/input-manager.js';
import type { VehicleState } from '../vehicle/physics/vehicle-physics.js';
import { createVehicle } from '../vehicle/physics/vehicle-physics.js';
import type { VehicleWorld } from '../course/vehicle-world.js';
import type { CompiledVehicle } from '../vehicle/physics/vehicle-definitions.js';
import { drawVehicleLeanDebug } from './debug/vehicle-lean-debug.js';
import { drawVehicleYawDebug } from './debug/vehicle-yaw-debug.js';
import {
  vehicleDefinitionForId,
  type CompiledVehicleDefinition,
  type VehicleDefinitions,
} from '../vehicle/definition-document.js';
import { admitBrowserSteeringGrid } from './steering-calibration-selection.js';
import { admitBrowserTireGrid } from './tire-friction-selection.js';
import type { BrowserCourseModeQuery } from './course-mode-selection.js';
import { mustGet } from './dom.js';
import { createFrameLoop, type FrameLoop } from './frame-loop.js';
import { BROWSER_RECOVERY_CODE, browserRequestsCameraYawToggle } from './key-bindings.js';
import { mountMobileCameraYawSelector, mountMobileVehicleSelector } from './mobile-selector-controls.js';
import { mountBrowserSteeringCalibrationControls } from './steering-calibration-controls.js';
import { mountBrowserTireFrictionControls } from './tire-friction-controls.js';
import { browserSessionVehicle } from './session-vehicle.js';
import { browserUsesTouchInterface } from './touch-interface.js';
import { drawVehicleDebugHud } from './vehicle-debug-hud.js';
import { browserVehicleForKey, createBrowserVehicleSelections } from './vehicle-selection.js';

interface BrowserDrivingShell {
  readonly vehicle: VehicleState;
  readonly presentation: CompiledVehicleDefinition;
  readonly recovery: RecoveryState;
  readonly framebuffer: SoftwareSurface;
  readonly inputManager: InputManager;
  readonly cameraRig: CameraRig;
  replacePlayer(compiledVehicle: Readonly<CompiledVehicle>, active: VehicleWorld): void;
  mountControls(options: DrivingLifecycleOptions): ReturnType<typeof createDrivingLifecycle>;
  present(
    query: BrowserCourseModeQuery,
    input: DrivingInput,
    camera: CameraState,
    playerScreenY: number,
    rivals?: readonly { readonly vehicle: VehicleState }[],
  ): void;
  start(tick: (dt: number) => void, render: () => void): void;
  stop(): void;
  dispose(): void;
}

/** Shared browser/player wiring only. Route ticks, recovery geography and race state stay in roots. */
export function createBrowserDrivingShell(
  runtime: VehicleWorld,
  startL: number,
  spawn: { readonly initialSpeed: number; readonly s: number; readonly vehicle: SessionVehicle },
  definitions: VehicleDefinitions,
): BrowserDrivingShell {
  const { vehicles, driving } = definitions;
  const selections = createBrowserVehicleSelections(vehicles);
  admitBrowserSteeringGrid(driving.source);
  admitBrowserTireGrid(driving.source);
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
  let vehicle = createVehicle(selected.compiledVehicle, runtime, {
    s: spawn.s,
    l: startL,
    initialSpeed: spawn.initialSpeed,
    drivingDefinition: selected.drivingDefinition,
    supportReserve: selected.supportReserve,
  });
  let recovery = createRecoveryState(vehicle);
  const cameraRig = createCameraRig();

  const audio = createAudioLifecycle(vehicles);
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
      return vehicleDefinitionForId(vehicles, vehicle.compiledVehicle.id);
    },
    get recovery() {
      return recovery;
    },
    framebuffer,
    inputManager,
    cameraRig,
    /** Called by the shared lifecycle after safe recovery; no chart or progress decision is made here. */
    replacePlayer(compiledVehicle: Readonly<CompiledVehicle>, active: VehicleWorld): void {
      const steeringCalibration = vehicle.steeringCalibration;
      const tireFrictionCalibration = vehicle.tireFrictionCalibration;
      vehicle = createVehicle(compiledVehicle, active, {
        s: vehicle.course.s,
        l: vehicle.course.l,
        initialSpeed: vehicle.longitudinalSpeed,
        steeringCalibration,
        tireFrictionCalibration,
        ...browserSessionVehicle(vehicleDefinitionForId(vehicles, compiledVehicle.id), driving),
      });
      recovery = createRecoveryState(vehicle);
    },
    mountControls(options: DrivingLifecycleOptions) {
      const lifecycle = createDrivingLifecycle(this, options);
      const selectVehicle = (compiledVehicle: Readonly<CompiledVehicle>) => {
        if (options.configurationLocked || compiledVehicle.id === vehicle.compiledVehicle.id) return;
        lifecycle.replace(compiledVehicle);
        vehicleSelector.setActive(vehicle.compiledVehicle.id);
      };
      const vehicleSelector = mountMobileVehicleSelector(
        mustGet('vehicle-selector-buttons'),
        vehicle.compiledVehicle.id,
        selectVehicle,
        selections,
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
        const selectedVehicle = browserVehicleForKey(event.code, selections);
        if (selectedVehicle !== null) {
          selectVehicle(selectedVehicle);
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
      rivals: readonly { readonly vehicle: VehicleState }[] = [],
    ): void {
      audio.update(vehicle, rivals);
      ctx.putImageData(imageData, 0, 0);
      drawVehicleDebugHud(ctx, query, input, vehicle, vehicleDefinitionForId(vehicles, vehicle.compiledVehicle.id));
      if (vehicleDefinitionForId(vehicles, vehicle.compiledVehicle.id).form === 'bike') {
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
