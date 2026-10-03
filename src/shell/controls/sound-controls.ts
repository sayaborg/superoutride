import { mountEngineSoundSettings } from './engine-sound-settings-controls.js';
import { mountRollingSoundSettings, mountTireSoundSettings } from './tire-sound-settings-controls.js';
import {
  mountMixSoundSettings,
  mountRivalSoundSettings,
  mountTimingSoundSettings,
} from './mix-sound-settings-controls.js';
import { createRangeControl } from './range-control.js';
import { createNumberStepper } from './number-stepper.js';
import { TIRE_COMPONENTS, type TireComponents } from '../../audio/tire-sound-components.js';
import { audioSettingsDocument, type AudioSettings } from '../../audio/audio-document.js';
import { SOUND_BUSES, type SoundBus } from '../../audio/sound-graph.js';
import { downloadDefinition } from '../definition-export.js';

/** What the DEV sound controls currently hold: the six settings records, volumes and R/Q components. */
export interface SoundControlValues {
  readonly settings: AudioSettings;
  readonly volume: number;
  readonly busVolumes: Readonly<Record<SoundBus, number>>;
  readonly components: TireComponents;
}

/**
 * The DEV sound controls found by their ids in `root`: the sound toggle, volume stepper, ENG/TIRE volumes, R/Q
 * buttons, the six settings panels and the audio export. The panels start from, and reset to, `initial`; the
 * export saves their current values. The volume starts at `initialVolume` percent and reports each change to
 * `onVolume`. A missing host leaves its control out and its value at its initial value.
 */
export function mountSoundControls(
  root: Document,
  initial: AudioSettings,
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
  const componentButtons = TIRE_COMPONENTS.map(({ key, label, description }) => {
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
  let volume = initialVolume / 100;
  const busVolumes: Record<SoundBus, number> = { engine: 1, tire: 1 };
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
        onChange: changeVolume,
      })
    : null;
  // The one way the MASTER volume changes: the stepper here and SETTINGS both pass through it.
  function changeVolume(value: number): void {
    volume = value / 100;
    callbacks.onVolume(value);
    callbacks.onChange();
  }
  if (volumeControl) volumeContainer!.replaceChildren(volumeControl.group);
  const mixControls = SOUND_BUSES.flatMap((bus) => {
    const host = root.getElementById(`${bus}-volume`);
    if (!host) return [];
    const control = createRangeControl(
      `${bus === 'engine' ? 'ENG' : 'TIRE'} volume`,
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
  // The current values of every panel; a missing panel keeps the document's record.
  const currentSettings = (): AudioSettings => ({
    exhaust: engineSoundSettings?.read() ?? initial.exhaust,
    unified: tireSoundSettings?.read() ?? initial.unified,
    rolling: rollingSettings?.read() ?? initial.rolling,
    mix: mixSettings?.read() ?? initial.mix,
    control: timingSettings?.read() ?? initial.control,
    rival: rivalSettings?.read() ?? initial.rival,
  });
  const exportButton = root.getElementById('export-audio-button');
  const exportAudio = (): void => downloadDefinition('default.json', audioSettingsDocument(currentSettings()));
  exportButton?.addEventListener('click', exportAudio);
  function showComponents(): void {
    componentHost?.setAttribute(
      'aria-label',
      `Tire sound components: ${TIRE_COMPONENTS.map(({ label, description }) => `${label} ${description}`).join(', ')}`,
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
      volume,
      busVolumes,
      components: componentState,
    }),
    /** Set the MASTER volume in percent, as the volume stepper does, and show it there. */
    setVolume(percent: number): void {
      volumeControl?.setValue(percent);
      changeVolume(percent);
    },
    /** The sound toggle's label and pressed state, which the audio lifecycle owns. */
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
      for (const panel of [tireSoundSettings, rollingSettings, mixSettings, timingSettings, rivalSettings])
        panel?.setEnabled(value);
    },
    dispose(): void {
      button?.removeEventListener('click', callbacks.onToggle);
      exportButton?.removeEventListener('click', exportAudio);
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
      for (const { host, control } of mixControls) {
        control.dispose();
        host.replaceChildren();
      }
    },
  };
}
