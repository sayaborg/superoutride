import type { SessionVehicle } from '../race/session-configuration.js';
import { createAudioLifecycle } from './audio-lifecycle.js';
import { createDrivingLifecycle, type DrivingLifecycleOptions } from './driving-lifecycle.js';
import type { CameraRig } from '../view/camera.js';
import { createCameraRig, setCameraYawMode, type CameraState } from '../view/camera.js';
import { LOGICAL_HEIGHT, LOGICAL_WIDTH } from '../view/display-scale.js';
import type { RecoveryState } from '../race/recovery.js';
import { createRecoveryState } from '../race/recovery.js';
import { SoftwareSurface } from '../view/software-surface.js';
import type { DrivingInput } from '../vehicle/driving-input.js';
import type { DrivingDocument } from '../vehicle/driving-definition.js';
import { InputManager } from '../input/input-manager.js';
import type { VehicleState } from '../vehicle/physics/vehicle-physics.js';
import { createVehicle } from '../vehicle/physics/vehicle-physics.js';
import { createVehicleModel, type VehicleModel } from '../vehicle/physics/vehicle-model.js';
import type { VehicleWorld } from '../course/vehicle-world.js';
import type { CompiledVehicle } from '../vehicle/physics/vehicle-definitions.js';
import { drawVehicleLeanDebug } from './debug/vehicle-lean-debug.js';
import { drawVehicleYawDebug } from './debug/vehicle-yaw-debug.js';
import {
  compileDrivingDocument,
  vehicleDefinitionForId,
  type CompiledVehicleDefinition,
  type VehicleDefinitions,
} from '../vehicle/definition-document.js';
import { admitDrivingTuningGrid } from './driving-tuning.js';
import { mountDrivingTuningControls } from './driving-tuning-controls.js';
import type { BrowserCourseModeQuery } from './course-mode-selection.js';
import { mustGet } from './dom.js';
import { createFrameLoop, type FrameLoop } from './frame-loop.js';
import { mountMobileCameraYawSelector, mountMobileVehicleSelector } from './mobile-selector-controls.js';
import { createSessionVehicle } from '../race/session-vehicle.js';
import { browserUsesTouchInterface } from './touch-interface.js';
import { drawVehicleDebugHud } from './vehicle-debug-hud.js';
import type { AudibleActor } from './vehicle-audio.js';
import { createBrowserVehicleSelections } from './vehicle-selection.js';

interface BrowserDrivingShell {
  readonly vehicle: VehicleState;
  readonly model: VehicleModel;
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
    rivals?: readonly AudibleActor[],
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
  const { vehicles } = definitions;
  const selections = createBrowserVehicleSelections(vehicles);
  admitDrivingTuningGrid(spawn.vehicle.drivingDefinition.source);
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
  // DEV tuning edits the driving definition and rebuilds the whole model; the next step uses it.
  let driving = spawn.vehicle.drivingDefinition;
  let model = createVehicleModel(spawn.vehicle);
  let vehicle = createVehicle(model, runtime, { s: spawn.s, l: startL, initialSpeed: spawn.initialSpeed });
  const modelFor = (id: string) =>
    createVehicleModel(createSessionVehicle(vehicleDefinitionForId(vehicles, id), driving));
  const tuning = {
    get: () => driving.source,
    set: (definition: DrivingDocument) => {
      const admitted = compileDrivingDocument(definition, 'DEV driving tuning');
      if (!admitted.ok) return false;
      driving = admitted.value;
      model = modelFor(model.compiledVehicle.id);
      return true;
    },
  };
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
    get model() {
      return model;
    },
    get presentation() {
      return vehicleDefinitionForId(vehicles, model.compiledVehicle.id);
    },
    get recovery() {
      return recovery;
    },
    framebuffer,
    inputManager,
    cameraRig,
    /** Called by the shared lifecycle after safe recovery; no chart or progress decision is made here. */
    replacePlayer(compiledVehicle: Readonly<CompiledVehicle>, active: VehicleWorld): void {
      // The replacement vehicle is built from the tuned driving definition.
      model = modelFor(compiledVehicle.id);
      vehicle = createVehicle(model, active, {
        s: vehicle.course.s,
        l: vehicle.course.l,
        initialSpeed: vehicle.longitudinalSpeed,
      });
      recovery = createRecoveryState(vehicle);
    },
    mountControls(options: DrivingLifecycleOptions) {
      const lifecycle = createDrivingLifecycle(this, options);
      const selectVehicle = (compiledVehicle: Readonly<CompiledVehicle>) => {
        if (options.configurationLocked || compiledVehicle.id === model.compiledVehicle.id) return;
        lifecycle.replace(compiledVehicle);
        vehicleSelector.setActive(model.compiledVehicle.id);
      };
      const vehicleSelector = mountMobileVehicleSelector(
        mustGet('vehicle-selector-buttons'),
        model.compiledVehicle.id,
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
      // DEV driving tuning stays available in a Session; only the Session vehicle is locked.
      mountDrivingTuningControls(
        {
          STEERING: mustGet('tuning-steering-buttons'),
          PEDALS: mustGet('tuning-pedal-buttons'),
          TIRES: mustGet('tuning-tire-buttons'),
          POWERTRAIN: mustGet('tuning-powertrain-buttons'),
          ASSIST: mustGet('tuning-assist-buttons'),
        },
        tuning,
      );
      if (options.configurationLocked)
        for (const child of Array.from(mustGet('vehicle-selector-buttons').querySelectorAll('button')))
          child.disabled = true;
      mustGet<HTMLButtonElement>('recover-button').addEventListener('click', () => {
        if (options.canRecover?.() ?? true) lifecycle.recover();
      });
      return lifecycle;
    },
    present(
      query: BrowserCourseModeQuery,
      input: DrivingInput,
      camera: CameraState,
      playerScreenY: number,
      rivals: readonly AudibleActor[] = [],
    ): void {
      audio.update({ vehicle, vehicleId: model.compiledVehicle.id }, rivals);
      ctx.putImageData(imageData, 0, 0);
      const entry = vehicleDefinitionForId(vehicles, model.compiledVehicle.id);
      drawVehicleDebugHud(ctx, query, input, vehicle, model, driving.source, entry);
      if (entry.form === 'bike') {
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
