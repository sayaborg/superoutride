import { mountEngineSoundSettings } from './engine-sound-settings-controls.js';
import {
  mountRollingSoundSettings,
  mountScrapeSoundSettings,
  mountTireSoundSettings,
} from './tire-sound-settings-controls.js';
import {
  mountImpactSoundSettings,
  mountMixSoundSettings,
  mountRivalSoundSettings,
  mountTimingSoundSettings,
} from './mix-sound-settings-controls.js';
import { createRangeControl } from './range-control.js';
import { createNumberStepper } from './number-stepper.js';
import { TIRE_COMPONENTS, type TireComponent, type TireComponents } from '../../audio/tire-sound-components.js';
import { audioSettingsDocument, type AudioSettings } from '../../audio/audio-document.js';
import type { SoundBus } from '../../audio/sound-graph.js';
import { downloadDefinition } from '../definition-export.js';
import {
  mountEngineSoundRecords,
  mountSurfaceSoundSettings,
  mountWallSoundSettings,
} from './record-sound-settings-controls.js';
import type { CompiledEngineSound } from '../../audio/engine-sound.js';
import { engineSoundDocument } from '../../audio/engine-sound-document.js';
import type { CompiledSurfaceSounds, SurfaceSound } from '../../audio/surface-sounds.js';
import { surfaceSoundDocument } from '../../audio/surface-sound-document.js';
import { wallSoundDocument, type CompiledWallSounds, type WallSound } from '../../audio/wall-sounds.js';

/** The DEV screen's name for each tire component: its button label and description. */
const TIRE_COMPONENT_LABELS: Readonly<Record<TireComponent, { readonly label: string; readonly description: string }>> =
  Object.freeze({
    rolling: Object.freeze({ label: 'R', description: 'Rolling' }),
    friction: Object.freeze({ label: 'Q', description: 'Friction' }),
  });

/** The buses whose volume is a DEV mix value, with their labels; the player record sets the others. */
const MIX_BUSES = Object.freeze({ engine: 'ENG', tire: 'TIRE' }) satisfies Partial<Record<SoundBus, string>>;
type MixBus = keyof typeof MIX_BUSES;

/**
 * What the DEV sound controls currently hold: the eight settings records, the surface and wall sounds by ID (the same
 * objects until a value changes), the engine sounds by ID (likewise), the mix volumes and R/Q components.
 */
export interface SoundControlValues {
  readonly settings: AudioSettings;
  readonly surfaces: Readonly<Record<string, SurfaceSound>>;
  readonly walls: Readonly<Record<string, WallSound>>;
  readonly engines: Readonly<Record<string, CompiledEngineSound>>;
  readonly busVolumes: Readonly<Partial<Record<SoundBus, number>>>;
  readonly components: TireComponents;
}

/**
 * The DEV sound controls found by their ids in `root`: the sound toggle, MASTER volume stepper, ENG/TIRE volumes,
 * R/Q buttons, the eight settings panels, the surface, wall and engine sound panels and the four exports. The settings
 * panels start from, and reset to, `initial`, and the sound panels the delivered `sounds`; each export saves its panels'
 * current values in its document (the engine sound export, the chosen engine sound's). The stepper shows the MASTER volume, starting at `initialVolume` percent, and
 * passes each press to `onVolume`; the player record keeps the volume. A missing host leaves its control out and its
 * value at its initial value.
 */
export function mountSoundControls(
  root: Document,
  initial: AudioSettings,
  sounds: {
    readonly surfaces: CompiledSurfaceSounds;
    readonly walls: CompiledWallSounds;
    readonly engines: Readonly<Record<string, CompiledEngineSound>>;
  },
  initialVolume: number,
  callbacks: {
    readonly onChange: () => void;
    readonly onVolume: (percent: number) => void;
    readonly onToggle: () => void;
  },
) {
  const button = root.getElementById('sound-toggle');
  const volumeContainer = root.getElementById('sound-volume');
  const componentState = { rolling: true, friction: true };
  let supported = true;
  const componentHost = root.getElementById('tire-component-controls');
  const componentButtons = TIRE_COMPONENTS.map((key) => {
    const { label, description } = TIRE_COMPONENT_LABELS[key];
    const button = root.createElement('button');
    button.type = 'button';
    button.className = 'selector-button';
    button.id = `tire-component-${key}`;
    const toggle = (): void => {
      if (!supported) return;
      componentState[key] = !componentState[key];
      showComponents();
      callbacks.onChange();
    };
    button.addEventListener('click', toggle);
    button.addEventListener('keydown', tireKey);
    componentHost?.appendChild(button);
    return { key, label, description, button, toggle };
  });
  const busVolumes: Record<MixBus, number> = { engine: 1, tire: 1 };
  const engineSoundContainer = root.getElementById('engine-sound-settings');
  const engineSoundSettings = engineSoundContainer
    ? mountEngineSoundSettings(engineSoundContainer, initial.exhaust, callbacks.onChange)
    : null;
  const volumeControl = volumeContainer
    ? createNumberStepper({
        label: 'Volume',
        min: 0,
        max: 100,
        step: 1,
        value: initialVolume,
        format: (value) => `${value}%`,
        onChange: callbacks.onVolume,
      })
    : null;
  if (volumeControl) volumeContainer!.replaceChildren(volumeControl.group);
  const mixControls = (Object.keys(MIX_BUSES) as MixBus[]).flatMap((bus) => {
    const host = root.getElementById(`${bus}-volume`);
    if (!host) return [];
    const control = createRangeControl(
      `${MIX_BUSES[bus]} volume`,
      { min: 0, max: 100, step: 1 },
      100,
      (value) => {
        busVolumes[bus] = value / 100;
        callbacks.onChange();
      },
      '%',
    );
    host.replaceChildren(control.group);
    return { host, control };
  });
  const tireSoundSettingsHost = root.getElementById('tire-sound-settings');
  const tireSoundSettings = tireSoundSettingsHost
    ? mountTireSoundSettings(tireSoundSettingsHost, initial.unified, callbacks.onChange)
    : null;
  const mountHost = <S, P>(
    id: string,
    initial: S,
    mount: (host: HTMLElement, initial: S, onChange: () => void) => P,
  ): P | null => {
    const host = root.getElementById(id);
    return host ? mount(host, initial, callbacks.onChange) : null;
  };
  const mixSettings = mountHost('mix-sound-settings', initial.mix, mountMixSoundSettings);
  const timingSettings = mountHost('timing-sound-settings', initial.control, mountTimingSoundSettings);
  const rivalSettings = mountHost('rival-sound-settings', initial.rival, mountRivalSoundSettings);
  const rollingSettings = mountHost('rolling-sound-settings', initial.rolling, mountRollingSoundSettings);
  const scrapeSettings = mountHost('scrape-sound-settings', initial.scrape, mountScrapeSoundSettings);
  const impactSettings = mountHost('impact-sound-settings', initial.impact, mountImpactSoundSettings);
  const surfaceSettings = mountHost('surface-sound-settings', sounds.surfaces.surfaces, mountSurfaceSoundSettings);
  const wallSettings = mountHost('wall-sound-settings', sounds.walls.walls, mountWallSoundSettings);
  const surfaces = () => surfaceSettings?.read() ?? sounds.surfaces.surfaces;
  const walls = () => wallSettings?.read() ?? sounds.walls.walls;
  const engineRecords = mountHost('engine-sound-records', sounds.engines, mountEngineSoundRecords);
  // The current values of every panel; a missing panel keeps the document's record.
  const currentSettings = (): AudioSettings => ({
    exhaust: engineSoundSettings?.read() ?? initial.exhaust,
    unified: tireSoundSettings?.read() ?? initial.unified,
    scrape: scrapeSettings?.read() ?? initial.scrape,
    rolling: rollingSettings?.read() ?? initial.rolling,
    mix: mixSettings?.read() ?? initial.mix,
    control: timingSettings?.read() ?? initial.control,
    rival: rivalSettings?.read() ?? initial.rival,
    impact: impactSettings?.read() ?? initial.impact,
  });
  const exportButton = root.getElementById('export-audio-button');
  const exportAudio = (): void => downloadDefinition('default.json', audioSettingsDocument(currentSettings()));
  exportButton?.addEventListener('click', exportAudio);
  const exportSurfacesButton = root.getElementById('export-surface-sounds-button');
  const exportSurfaces = (): void => downloadDefinition('default.json', surfaceSoundDocument(surfaces()));
  exportSurfacesButton?.addEventListener('click', exportSurfaces);
  const exportWallsButton = root.getElementById('export-wall-sounds-button');
  const exportWalls = (): void =>
    downloadDefinition('default.json', wallSoundDocument({ courseLimit: sounds.walls.courseLimit, walls: walls() }));
  exportWallsButton?.addEventListener('click', exportWalls);
  const exportEngineButton = root.getElementById('export-engine-sound-button');
  const exportEngine = (): void => {
    if (!engineRecords) return;
    const id = engineRecords.chosen();
    downloadDefinition(`${id}.json`, engineSoundDocument(engineRecords.read()[id]!));
  };
  exportEngineButton?.addEventListener('click', exportEngine);
  function showComponents(): void {
    componentHost?.setAttribute(
      'aria-label',
      `Tire sound components: ${TIRE_COMPONENTS.map((key) => `${TIRE_COMPONENT_LABELS[key].label} ${TIRE_COMPONENT_LABELS[key].description}`).join(', ')}`,
    );
    for (const { key, label, description, button } of componentButtons) {
      const on = componentState[key];
      button.textContent = `${label}: ${on ? 'ON' : 'OFF'}`;
      button.setAttribute('aria-pressed', String(on));
      button.setAttribute('aria-label', `${description}: ${on ? 'on' : 'off'}.`);
      button.title = `${label}: ${description}. Both axles. Other components are not normalized.`;
      button.disabled = !supported;
    }
  }
  function tireKey(event: Event): void {
    event.stopPropagation();
  }
  showComponents();
  button?.addEventListener('click', callbacks.onToggle);
  return {
    read: (): SoundControlValues => ({
      settings: currentSettings(),
      surfaces: surfaces(),
      walls: walls(),
      engines: engineRecords?.read() ?? sounds.engines,
      busVolumes,
      components: componentState,
    }),
    /** Show the MASTER volume in percent on the stepper. */
    showVolume(percent: number): void {
      volumeControl?.setValue(percent);
    },
    /** The sound toggle's label and pressed state, which the audio lifecycle owns. */
    /** DEV: whether the measured engine loudness describes the panels' current engines. */
    showEngineLoudness(text: string): void {
      const line = root.getElementById('engine-loudness-state');
      if (line) line.textContent = text;
    },
    showSoundState(text: string, pressed: boolean): void {
      if (!button) return;
      button.textContent = text;
      button.setAttribute('aria-pressed', String(pressed));
    },
    /** Whether an event came from the sound toggle, which handles its own activation. */
    isSoundToggle: (target: EventTarget | null): boolean => target === button,
    /** Without AudioContext/AudioWorklet support the toggle, R/Q buttons and settings panels are disabled. */
    setEnabled(value: boolean): void {
      supported = value;
      if (button && !value) button.setAttribute('disabled', '');
      showComponents();
      for (const panel of [
        tireSoundSettings,
        scrapeSettings,
        rollingSettings,
        mixSettings,
        timingSettings,
        rivalSettings,
        impactSettings,
        surfaceSettings,
        wallSettings,
        engineRecords,
      ])
        panel?.setEnabled(value);
    },
    dispose(): void {
      button?.removeEventListener('click', callbacks.onToggle);
      exportButton?.removeEventListener('click', exportAudio);
      exportSurfacesButton?.removeEventListener('click', exportSurfaces);
      exportWallsButton?.removeEventListener('click', exportWalls);
      exportEngineButton?.removeEventListener('click', exportEngine);
      for (const { button, toggle } of componentButtons) {
        button.removeEventListener('click', toggle);
        button.removeEventListener('keydown', tireKey);
      }
      componentHost?.replaceChildren();
      volumeControl?.dispose();
      volumeContainer?.replaceChildren();
      engineSoundSettings?.dispose();
      tireSoundSettings?.dispose();
      mixSettings?.dispose();
      timingSettings?.dispose();
      rivalSettings?.dispose();
      rollingSettings?.dispose();
      scrapeSettings?.dispose();
      impactSettings?.dispose();
      surfaceSettings?.dispose();
      wallSettings?.dispose();
      engineRecords?.dispose();
      for (const { host, control } of mixControls) {
        control.dispose();
        host.replaceChildren();
      }
    },
  };
}
