import type { createAudioLifecycle, AudioTimingSource } from './audio-lifecycle.js';
import { createLogicalFrame, LOGICAL_HEIGHT, LOGICAL_WIDTH } from '../view/display-scale.js';
import { expandRgb555Pixels, scaleRgb555Pixels } from '../image/rgb555.js';
import { SoftwareSurface } from '../view/software-surface.js';
import { thinLines } from '../view/line-thinning.js';
import { InputManager } from '../input/input-manager.js';
import { TouchPointers } from '../input/touch-pointers.js';
import { GamepadReading } from '../input/gamepads.js';
import { MenuInput, type MenuCommand, type InputRoute } from '../input/menu-input.js';
import type { MenuResponse } from './screen-host.js';
import { createCornerButtons } from './corner-buttons.js';
import { mustGet } from './dom.js';
import { createTouchIndicators } from './touch-indicators.js';
import type { CompetitorObservation } from '../race/competitor-observation.js';
import type { VolumeName } from './player-record.js';
import type { RecordingHandle } from './recording-player.js';
import type { PlaybackOptions } from '../audio/recording-playback.js';
import type { SoundBus } from '../audio/sound-graph.js';
import type { EffectRecording, ImpactRecording } from '../audio/recordings.js';

/**
 * The page's display and input, which stand before its audio: the frame is presented and the input routed as soon as the
 * text tiles are read ([Browser](../../docs/browser.md#display-and-scheduling)).
 */
export interface BrowserDevices {
  readonly framebuffer: SoftwareSurface;
  readonly inputManager: InputManager;
  /**
   * Expand the framebuffer to the canvas at the current brightness, update the touch indicators, then draw `overlay`
   * (DEV only) on top.
   */
  present(overlay?: (ctx: CanvasRenderingContext2D) => void): void;
  /** The brightness frames are presented at, in eighths: the screen host's black transition sets it. */
  setBrightness(eighths: number): void;
  /** Hold the frame presented last for line thinning: the screen host's change from a screen that thins away. */
  holdFrame(): void;
  /** The share of lines frames are presented on, the held frame on the rest: the screen host's line thinning sets it. */
  setThinning(share: number): void;
  /**
   * The one procedure that routes devices, called by the screen host when the route changes: driving input is live only
   * while driving and vehicle sound while a vehicle is driven; menu commands follow the route.
   */
  setRoute(route: InputRoute, vehicleSound: boolean): void;
  /** Read the devices for a fixed step and return the menu commands since the last call. */
  menuCommands(): MenuCommand[];
  /**
   * Play what a menu command did: `menu-move`, `series-slide`, `menu-confirm`, `menu-entry`, `menu-deny` or `menu-back`;
   * silent until the audio has joined.
   */
  menuSound(response: MenuResponse): void;
  /**
   * Called within a user gesture outside driving: prepare sound so runs sound from their start, once the audio has
   * joined, and request fullscreen; a refusal is ignored.
   */
  activate(): void;
  /**
   * Join the page's audio, assembled once its catalogs are read: it takes the route the screen host last set at once,
   * and menu sounds and activation reach it from then. It joins once.
   */
  joinAudio(audio: PageAudio): BrowserDrivingShell;
}

/** The page's audio lifetime, its one owner of sound. */
export type PageAudio = ReturnType<typeof createAudioLifecycle>;

/** The page's browser devices with its audio joined. */
export interface BrowserDrivingShell extends Omit<BrowserDevices, 'joinAudio'> {
  /** The run's vehicles for the audio scene. */
  updateAudio(player: CompetitorObservation, rivals: readonly CompetitorObservation[]): void;
  /** Set a volume in percent: the player record keeps it and the sound follows at once. */
  setVolume(name: VolumeName, percent: number): void;
  /** A player contact that began: its counterpart's impact at a volume from its work (J). */
  playImpact(counterpart: ImpactRecording, work: number): void;
  /** Play the delivered recording `id` on `bus`; it sounds once decoded. */
  playRecording(id: string, bus: SoundBus, options?: Omit<PlaybackOptions, 'from'>): RecordingHandle;
  /** DEV only: the audio timing HUD's source. */
  readonly audioTiming: AudioTimingSource;
}

/** The effect each menu response sounds. */
const MENU_SOUNDS: Readonly<Record<MenuResponse, EffectRecording>> = Object.freeze({
  start: 'press-start',
  move: 'menu-move',
  slide: 'series-slide',
  confirm: 'menu-confirm',
  entry: 'menu-entry',
  deny: 'menu-deny',
  back: 'menu-back',
});

/**
 * The page's browser devices: display and input, and audio once it joins. They outlive every screen and run and hold no
 * run. They supply the player's input only; the race owns every competitor's mechanics.
 */
export function createBrowserDevices(): BrowserDevices {
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
  // The page's one gamepad reader, read once per fixed step as the step's menu commands are taken.
  const gamepads = new GamepadReading(window);
  const inputManager = new InputManager(window, pointers, gamepads, touchArea);
  const menuInput = new MenuInput(window, pointers, gamepads, touchArea);
  const corners = createCornerButtons(document, (command) => menuInput.press(command));
  pointers.subscribe({ begin: () => corners.touched(), move: () => {}, end: () => {} });
  const touchIndicators = createTouchIndicators(document);
  // The audio once it joins, and the route the host last set, which it takes when it joins.
  let audio: PageAudio | null = null;
  let route: InputRoute = 'off',
    vehicleSound = false;
  let brightness = 8,
    thinning = 1;
  const held = new Uint16Array(framebuffer.pixels.length);
  const shown: Omit<BrowserDevices, 'joinAudio'> = {
    setBrightness(eighths): void {
      brightness = eighths;
    },
    holdFrame(): void {
      held.set(framebuffer.pixels);
    },
    setThinning(share): void {
      thinning = share;
    },
    setRoute(next, sound): void {
      [route, vehicleSound] = [next, sound];
      inputManager.setSuspended(route !== 'driving');
      audio?.setRoute(route, vehicleSound);
      menuInput.setRoute(route);
      corners.setRoute(route);
    },
    menuCommands() {
      gamepads.read();
      return menuInput.poll();
    },
    menuSound: (response) => void audio?.playRecording(`effects/${MENU_SOUNDS[response]}`, 'effects'),
    activate(): void {
      audio?.enable();
      const page = document.documentElement;
      if (!document.fullscreenElement && page.requestFullscreen) void page.requestFullscreen().catch(() => {});
    },
    framebuffer,
    inputManager,
    present(overlay): void {
      // The RGB555 frame is expanded to the canvas's RGBA once per presented frame; every screen draws its whole frame
      // anew, so scaling it in place for a transition never compounds.
      scaleRgb555Pixels(framebuffer.pixels, brightness);
      if (thinning < 1) thinLines(framebuffer.pixels, held, framebuffer.width, framebuffer.height, thinning);
      expandRgb555Pixels(framebuffer.pixels, presented);
      ctx.putImageData(imageData, 0, 0);
      touchIndicators.update(inputManager.touch);
      overlay?.(ctx);
    },
  };
  return Object.freeze({
    ...shown,
    joinAudio(joined: PageAudio): BrowserDrivingShell {
      if (audio) throw new Error("The page's audio has already joined");
      audio = joined;
      audio.setRoute(route, vehicleSound);
      const shell: BrowserDrivingShell = {
        ...shown,
        setVolume: (name, percent) => joined.setVolume(name, percent),
        playRecording: (id, bus, options) => joined.playRecording(id, bus, options),
        playImpact: (counterpart, work) => joined.playImpact(counterpart, work),
        updateAudio: (player, rivals) => joined.update(player, rivals),
        audioTiming: joined.timing,
      };
      return Object.freeze(shell);
    },
  });
}
