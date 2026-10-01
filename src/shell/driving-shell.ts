import type { SessionVehicle } from '../content/session-vehicle.js';
import { createAudioLifecycle } from './audio-lifecycle.js';
import type { TireSurfaceSounds } from '../audio/surface-sounds.js';
import type { AudioSettings } from '../audio/audio-document.js';
import { createDrivingLifecycle, type DrivingLifecycleOptions } from './driving-lifecycle.js';
import type { CameraRig } from '../view/camera.js';
import { createCameraRig, setCameraYawMode, type CameraState } from '../view/camera.js';
import { createLogicalFrame, LOGICAL_HEIGHT, LOGICAL_WIDTH } from '../view/display-scale.js';
import { expandRgb555Pixels } from '../image/rgb555.js';
import { SoftwareSurface } from '../view/software-surface.js';
import type { DrivingDocument } from '../vehicle/driving-definition.js';
import { InputManager } from '../input/input-manager.js';
import type { VehicleState } from '../vehicle/physics/vehicle-physics.js';
import type { VehicleModel } from '../vehicle/physics/vehicle-model.js';
import { drawVehicleLeanDebug } from './debug/vehicle-lean-debug.js';
import { drawVehicleYawDebug } from './debug/vehicle-yaw-debug.js';
import { compileDrivingDocument } from '../vehicle/definition-document.js';
import { DRIVING_DEFINITION_ID } from '../content/vehicle-catalog.js';
import { mountDrivingTuningControls } from './driving-tuning-controls.js';
import { downloadDefinition } from './definition-export.js';
import type { BrowserCourseModeQuery } from './course-mode-selection.js';
import { mustGet } from './dom.js';
import { createFrameLoop } from './frame-loop.js';
import { mountMobileCameraYawSelector } from './mobile-selector-controls.js';
import { createTouchIndicators } from './touch-indicators.js';
import { drawVehicleDebugHud } from './vehicle-debug-hud.js';
import type { CompetitorObservation } from '../race/competitor-observation.js';

interface BrowserDrivingShell {
  readonly framebuffer: SoftwareSurface;
  readonly inputManager: InputManager;
  readonly cameraRig: CameraRig;
  mountControls(options: DrivingLifecycleOptions): ReturnType<typeof createDrivingLifecycle>;
  present(
    query: BrowserCourseModeQuery,
    camera: CameraState,
    playerScreenX: number,
    playerScreenY: number,
    observed: { readonly player: CompetitorObservation; readonly rivals: readonly CompetitorObservation[] },
    diagnostics: { readonly vehicle: VehicleState; readonly model: VehicleModel },
  ): void;
  /** The one start/stop procedure, called by the run state when `running` changes. */
  setRunning(running: boolean): void;
}

/**
 * Browser wiring for the Session vehicle: display, input, audio, the one frame loop over `frame` and DEV
 * controls. It supplies the player's input only; the race owns every competitor's mechanics.
 */
export function createBrowserDrivingShell(
  sessionVehicle: SessionVehicle,
  surfaceSounds: TireSurfaceSounds,
  audioSettings: AudioSettings,
  frame: { tick(): void; render(): void },
): BrowserDrivingShell {
  const canvas = mustGet<HTMLCanvasElement>('game');
  canvas.width = LOGICAL_WIDTH;
  canvas.height = LOGICAL_HEIGHT;
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) throw new Error('2D canvas context unavailable');
  ctx.imageSmoothingEnabled = false;
  const imageData = ctx.createImageData(LOGICAL_WIDTH, LOGICAL_HEIGHT);
  const framebuffer = createLogicalFrame();
  const presented = new Uint32Array(imageData.data.buffer);
  // The whole viewport is the touch area.
  const inputManager = new InputManager(window, () => ({
    left: 0,
    top: 0,
    width: window.innerWidth,
    height: window.innerHeight,
  }));
  const touchIndicators = createTouchIndicators(document);
  // The tuned driving definition persists across rebuilt Sessions for the next tuning step and export.
  let driving = sessionVehicle.drivingDefinition;
  const sessionVehicleDefinition = sessionVehicle.vehicleDefinition;
  const sessionVehicleId = sessionVehicleDefinition.compiledVehicle.id;
  const cameraRig = createCameraRig();

  const audio = createAudioLifecycle(sessionVehicleDefinition, surfaceSounds, audioSettings);
  // Each start begins a new frame clock, so stopped real time never enters the simulation.
  const loop = createFrameLoop(
    () => frame.tick(),
    () => frame.render(),
  );
  return {
    setRunning(running): void {
      if (running) {
        inputManager.setSuspended(false);
        audio.setActive(true);
        frame.render();
        loop.start();
      } else {
        loop.stop();
        inputManager.setSuspended(true);
        audio.setActive(false);
        // The stopped frame shows neutral input, no touch indicators and the stopped status.
        frame.render();
      }
    },
    framebuffer,
    inputManager,
    cameraRig,
    mountControls(options: DrivingLifecycleOptions) {
      const lifecycle = createDrivingLifecycle(cameraRig, options);
      const tuning = {
        get: () => driving.source,
        set: (definition: DrivingDocument) => {
          // A tuned definition is not a delivered document and has no reference identity.
          const admitted = compileDrivingDocument(definition, 'DEV driving tuning', null);
          if (!admitted.ok) return false;
          driving = admitted.value;
          options.rebuildSession(driving);
          return true;
        },
      };
      const cameraYawSelector = mountMobileCameraYawSelector(
        mustGet('camera-selector-buttons'),
        cameraRig.yawMode,
        (mode) => {
          setCameraYawMode(cameraRig, mode);
          cameraYawSelector.setActive(mode);
        },
      );
      // DEV driving tuning stays available in a Session.
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
      // Export writes the admitted source documents in the saved layout, never runtime values.
      const exportVehicle = mustGet<HTMLButtonElement>('export-vehicle-button');
      exportVehicle.textContent = `vehicles/${sessionVehicleId}.json`;
      mustGet<HTMLButtonElement>('export-driving-button').addEventListener('click', () =>
        downloadDefinition(`${DRIVING_DEFINITION_ID}.json`, driving.source),
      );
      exportVehicle.addEventListener('click', () =>
        downloadDefinition(`${sessionVehicleId}.json`, sessionVehicleDefinition.mechanics),
      );
      mustGet<HTMLButtonElement>('recover-button').addEventListener('click', () => {
        if (options.canRecover?.() ?? true) lifecycle.recover();
      });
      return lifecycle;
    },
    present(
      query: BrowserCourseModeQuery,
      camera: CameraState,
      playerScreenX: number,
      playerScreenY: number,
      observed: { readonly player: CompetitorObservation; readonly rivals: readonly CompetitorObservation[] },
      diagnostics: { readonly vehicle: VehicleState; readonly model: VehicleModel },
    ): void {
      const { player } = observed;
      audio.update(player, observed.rivals);
      // The RGB555 frame is expanded to the canvas's RGBA once per presented frame.
      expandRgb555Pixels(framebuffer.pixels, presented);
      ctx.putImageData(imageData, 0, 0);
      touchIndicators.update(inputManager.touch);
      // The DEV vehicle HUD diagnoses mechanics internals through the race's DEV-only diagnostics.
      drawVehicleDebugHud(
        ctx,
        query,
        inputManager.lastSample,
        diagnostics.vehicle,
        diagnostics.model,
        driving.source,
        sessionVehicleDefinition,
      );
      if (player.form === 'bike') {
        drawVehicleLeanDebug(ctx, playerScreenX, playerScreenY, player);
      }
      drawVehicleYawDebug(
        ctx,
        playerScreenX,
        playerScreenY,
        player.yaw,
        camera.movementYaw,
        camera.yaw,
        camera.yawMode,
      );
    },
  };
}
