import { createAudioLifecycle, type AudioTimingSource } from './audio-lifecycle.js';
import type { TireSurfaceSounds } from '../audio/surface-sounds.js';
import type { WallSoundRecords } from '../audio/wall-sounds.js';
import type { WallRubObservation } from '../audio/scrape-voice.js';
import type { AudioSettings } from '../audio/audio-document.js';
import { createLogicalFrame, LOGICAL_HEIGHT, LOGICAL_WIDTH } from '../view/display-scale.js';
import { expandRgb555Pixels } from '../image/rgb555.js';
import { SoftwareSurface } from '../view/software-surface.js';
import type { CompiledVehicleDefinition } from '../vehicle/definition-document.js';
import { InputManager } from '../input/input-manager.js';
import { TouchPointers } from '../input/touch-pointers.js';
import { MenuInput, type MenuCommand, type InputRoute } from '../input/menu-input.js';
import type { MenuResponse } from './screen-host.js';
import { createCornerButtons } from './corner-buttons.js';
import { mustGet } from './dom.js';
import { createTouchIndicators } from './touch-indicators.js';
import type { CompetitorObservation } from '../race/competitor-observation.js';
import type { PlayerRecord, VolumeName } from './player-record.js';
import type { RecordingHandle } from './recording-player.js';
import type { RecordingLoop } from '../audio/recording-playback.js';
import type { SoundBus } from '../audio/sound-graph.js';
import type { ImpactRecording } from '../audio/recordings.js';

export interface BrowserDrivingShell {
  readonly framebuffer: SoftwareSurface;
  readonly inputManager: InputManager;
  /** Expand the framebuffer to the canvas, update the touch indicators, then draw `overlay` (DEV only) on top. */
  present(overlay?: (ctx: CanvasRenderingContext2D) => void): void;
  /** The run's vehicles for the audio scene, and the player's wall rubs of the last step. */
  updateAudio(
    player: CompetitorObservation,
    rivals: readonly CompetitorObservation[],
    rubs: readonly WallRubObservation[],
  ): void;
  /**
   * The one procedure that routes devices, called by the screen host when the route changes: driving input and sound are
   * live only while driving; menu commands follow the route.
   */
  setRoute(route: InputRoute): void;
  /** The menu commands since the last call. */
  menuCommands(): MenuCommand[];
  /** Play what a menu command did: `menu-move`, `menu-confirm` or `menu-back`. */
  menuSound(response: MenuResponse): void;
  /**
   * Called within a user gesture outside driving: prepare sound so runs sound from their start, and request
   * fullscreen; a refusal is ignored.
   */
  activate(): void;
  /** Set a volume in percent: the player record keeps it and the sound follows at once. */
  setVolume(name: VolumeName, percent: number): void;
  /** A player contact that began: its counterpart's impact at a volume from its work (J). */
  playImpact(counterpart: ImpactRecording, work: number): void;
  /** Play the delivered recording `id` on `bus`; it sounds once decoded. */
  playRecording(
    id: string,
    bus: SoundBus,
    options?: { readonly volume?: number; readonly loop?: RecordingLoop | null },
  ): RecordingHandle;
  /** DEV only: the audio timing HUD's source. */
  readonly audioTiming: AudioTimingSource;
}

/**
 * The page's browser devices: display, input and audio. They outlive every screen and run and hold no run. They
 * supply the player's input only; the race owns every competitor's mechanics.
 */
export function createBrowserDrivingShell(
  vehicles: readonly CompiledVehicleDefinition[],
  surfaceSounds: TireSurfaceSounds,
  wallSounds: WallSoundRecords,
  audioSettings: AudioSettings,
  player: PlayerRecord,
  recordingBytes: (id: string) => Promise<Uint8Array>,
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
  const audio = createAudioLifecycle(vehicles, surfaceSounds, wallSounds, audioSettings, player, recordingBytes);
  return {
    setRoute(route): void {
      const live = route === 'driving';
      inputManager.setSuspended(!live);
      audio.setRoute(route);
      menuInput.setRoute(route);
      corners.setRoute(route);
    },
    menuCommands: () => menuInput.poll(),
    menuSound: (response) => void audio.playRecording(`effects/menu-${response}`, 'effects'),
    setVolume: (name, percent) => audio.setVolume(name, percent),
    playRecording: (id, bus, options) => audio.playRecording(id, bus, options),
    playImpact: (counterpart, work) => audio.playImpact(counterpart, work),
    audioTiming: audio.timing,
    activate(): void {
      audio.enable();
      const page = document.documentElement;
      if (!document.fullscreenElement && page.requestFullscreen) void page.requestFullscreen().catch(() => {});
    },
    framebuffer,
    inputManager,
    present(overlay): void {
      // The RGB555 frame is expanded to the canvas's RGBA once per presented frame.
      expandRgb555Pixels(framebuffer.pixels, presented);
      ctx.putImageData(imageData, 0, 0);
      touchIndicators.update(inputManager.touch);
      overlay?.(ctx);
    },
    updateAudio(player, rivals, rubs): void {
      audio.update(player, rivals, rubs);
    },
  };
}
