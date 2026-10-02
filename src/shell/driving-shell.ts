import { createAudioLifecycle } from './audio-lifecycle.js';
import type { TireSurfaceSounds } from '../audio/surface-sounds.js';
import type { AudioSettings } from '../audio/audio-document.js';
import type { CameraState } from '../view/camera.js';
import { createLogicalFrame, LOGICAL_HEIGHT, LOGICAL_WIDTH } from '../view/display-scale.js';
import { expandRgb555Pixels } from '../image/rgb555.js';
import { SoftwareSurface } from '../view/software-surface.js';
import type { DrivingDocument } from '../vehicle/driving-definition.js';
import type { CompiledVehicleDefinition } from '../vehicle/definition-document.js';
import { InputManager } from '../input/input-manager.js';
import type { VehicleState } from '../vehicle/physics/vehicle-physics.js';
import type { VehicleModel } from '../vehicle/physics/vehicle-model.js';
import { drawVehicleLeanDebug } from './debug/vehicle-lean-debug.js';
import { drawVehicleYawDebug } from './debug/vehicle-yaw-debug.js';
import type { BrowserCourseId, BrowserCourseSelection } from './course-selection.js';
import { mustGet } from './dom.js';
import { createFrameLoop } from './frame-loop.js';
import { createTouchIndicators } from './touch-indicators.js';
import { drawVehicleDebugHud } from './vehicle-debug-hud.js';
import type { CompetitorObservation } from '../race/competitor-observation.js';
import type { PlayerRecord } from './player-record.js';

/** The DEV vehicle HUD's reading of the player: the race's diagnostics and the run's definitions. */
export interface PlayerDiagnostics {
  readonly vehicle: VehicleState;
  readonly model: VehicleModel;
  readonly driving: DrivingDocument;
  readonly definition: CompiledVehicleDefinition;
}

interface BrowserDrivingShell {
  readonly framebuffer: SoftwareSurface;
  readonly inputManager: InputManager;
  present(
    query: BrowserCourseId,
    camera: CameraState,
    playerScreenX: number,
    playerScreenY: number,
    observed: { readonly player: CompetitorObservation; readonly rivals: readonly CompetitorObservation[] },
    diagnostics: PlayerDiagnostics,
  ): void;
  /** The one start/stop procedure, called by the run state when `running` changes. */
  setRunning(running: boolean): void;
}

/**
 * The page's browser devices: display, input, audio and the one frame loop over `frame`. They outlive every run and
 * hold no run; each presented frame passes the run's observations. It supplies the player's input only; the race
 * owns every competitor's mechanics.
 */
export function createBrowserDrivingShell(
  courses: readonly BrowserCourseSelection[],
  vehicles: readonly CompiledVehicleDefinition[],
  surfaceSounds: TireSurfaceSounds,
  audioSettings: AudioSettings,
  player: PlayerRecord,
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

  const audio = createAudioLifecycle(vehicles, surfaceSounds, audioSettings, player);
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
    present(query, camera, playerScreenX, playerScreenY, observed, diagnostics): void {
      const { player } = observed;
      audio.update(player, observed.rivals);
      // The RGB555 frame is expanded to the canvas's RGBA once per presented frame.
      expandRgb555Pixels(framebuffer.pixels, presented);
      ctx.putImageData(imageData, 0, 0);
      touchIndicators.update(inputManager.touch);
      // The DEV vehicle HUD diagnoses mechanics internals through the race's DEV-only diagnostics.
      drawVehicleDebugHud(
        ctx,
        courses,
        query,
        inputManager.lastSample,
        diagnostics.vehicle,
        diagnostics.model,
        diagnostics.driving,
        diagnostics.definition,
      );
      if (player.form === 'bike') {
        drawVehicleLeanDebug(ctx, playerScreenX, playerScreenY, player);
      }
      drawVehicleYawDebug(ctx, playerScreenX, playerScreenY, diagnostics.vehicle, camera.yaw);
    },
  };
}
