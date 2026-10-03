import { createAudioLifecycle } from './audio-lifecycle.js';
import type { TireSurfaceSounds } from '../audio/surface-sounds.js';
import type { AudioSettings } from '../audio/audio-document.js';
import { createLogicalFrame, LOGICAL_HEIGHT, LOGICAL_WIDTH } from '../view/display-scale.js';
import { expandRgb555Pixels } from '../image/rgb555.js';
import { SoftwareSurface } from '../view/software-surface.js';
import type { CompiledVehicleDefinition } from '../vehicle/definition-document.js';
import { InputManager } from '../input/input-manager.js';
import { TouchPointers } from '../input/touch-pointers.js';
import { MenuInput, type MenuCommand, type InputRoute } from '../input/menu-input.js';
import { createCornerButtons } from './corner-buttons.js';
import { mustGet } from './dom.js';
import { createTouchIndicators } from './touch-indicators.js';
import type { CompetitorObservation } from '../race/competitor-observation.js';
import type { PlayerRecord } from './player-record.js';

interface BrowserDrivingShell {
  readonly framebuffer: SoftwareSurface;
  readonly inputManager: InputManager;
  /** Expand the framebuffer to the canvas, update the touch indicators, then draw `overlay` (DEV only) on top. */
  present(overlay?: (ctx: CanvasRenderingContext2D) => void): void;
  /** The run's competitors for the audio scene. */
  updateAudio(player: CompetitorObservation, rivals: readonly CompetitorObservation[]): void;
  /**
   * The one procedure that routes devices, called by the screen host when the route changes: driving input and sound are
   * live only while driving; menu commands follow the route.
   */
  setRoute(route: InputRoute): void;
  /** The menu commands since the last call. */
  menuCommands(): MenuCommand[];
}

/**
 * The page's browser devices: display, input and audio. They outlive every screen and run and hold no run. They
 * supply the player's input only; the race owns every competitor's mechanics.
 */
export function createBrowserDrivingShell(
  vehicles: readonly CompiledVehicleDefinition[],
  surfaceSounds: TireSurfaceSounds,
  audioSettings: AudioSettings,
  player: PlayerRecord,
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
  // The page's one touch pointer reader; the whole viewport is the touch area.
  const pointers = new TouchPointers(window);
  const touchArea = () => ({ left: 0, top: 0, width: window.innerWidth, height: window.innerHeight });
  const inputManager = new InputManager(window, pointers, touchArea);
  const menuInput = new MenuInput(window, pointers, touchArea);
  const corners = createCornerButtons(document, (command) => menuInput.press(command));
  pointers.subscribe({ begin: () => corners.touched(), move: () => {}, end: () => {} });
  const touchIndicators = createTouchIndicators(document);
  const audio = createAudioLifecycle(vehicles, surfaceSounds, audioSettings, player);
  return {
    setRoute(route): void {
      const live = route === 'driving';
      inputManager.setSuspended(!live);
      audio.setActive(live);
      menuInput.setRoute(route);
      corners.setRoute(route);
    },
    menuCommands: () => menuInput.poll(),
    framebuffer,
    inputManager,
    present(overlay): void {
      // The RGB555 frame is expanded to the canvas's RGBA once per presented frame.
      expandRgb555Pixels(framebuffer.pixels, presented);
      ctx.putImageData(imageData, 0, 0);
      touchIndicators.update(inputManager.touch);
      overlay?.(ctx);
    },
    updateAudio(player, rivals): void {
      audio.update(player, rivals);
    },
  };
}
