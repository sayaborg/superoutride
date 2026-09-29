import { mountEngineSoundSettings } from './engine-sound-settings-controls.js';
import { mountRollingSoundSettings, mountTireSoundSettings } from './tire-sound-settings-controls.js';
import {
  mountMixSoundSettings,
  mountRivalSoundSettings,
  mountTimingSoundSettings,
} from './mix-sound-settings-controls.js';
import { createRangeControl } from './range-control.js';
import { createNumberStepper } from './number-stepper.js';
import { TIRE_COMPONENTS } from '../audio/tire-sound-components.js';
import { DEFAULT_CONTROL_SETTINGS } from '../audio/audio-control-policy.js';
import { createAudioScene } from '../audio/audio-scene.js';
import type { TireSurfaceSounds } from '../audio/surface-sounds.js';
import { SOUND_BUSES, type SoundBus } from '../audio/sound-graph.js';
import type { CompiledVehicleDefinition } from '../vehicle/definition-document.js';
import type { CompetitorObservation } from '../race/competitor-observation.js';
import { createVehicleAudioEmitter, readVehicleAudio } from './vehicle-audio.js';

// Touch activation arrives on release; pointerdown activates only a mouse.
const GESTURE_EVENTS = ['pointerdown', 'pointerup', 'touchend', 'keydown'] as const;

/** DOM, permission and failure boundary. Presentation updates fail closed without stopping gameplay. */
/** Every competitor drives the Session vehicle, so player and rival engines use its sound. */
export function createAudioLifecycle(sessionVehicle: CompiledVehicleDefinition, surfaces: TireSurfaceSounds) {
  const button = document.getElementById('sound-toggle');
  const volumeContainer = document.getElementById('sound-volume');
  const componentState = { rolling: true, friction: true };
  const componentHost = document.getElementById('tire-component-controls');
  const componentButtons = TIRE_COMPONENTS.map(({ key, label, description }) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'selector-button';
    button.id = `tire-component-${key}`;
    const toggle = (): void => {
      if (disposed || !supported) return;
      componentState[key] = !componentState[key];
      showComponents();
      unlock();
      sync();
    };
    button.addEventListener('click', toggle);
    button.addEventListener('keydown', tireKey);
    componentHost?.appendChild(button);
    return { key, label, description, button, toggle };
  });
  let context: AudioContext | null = null;
  let scene: Awaited<ReturnType<typeof createAudioScene>> | null = null;
  let loading: Promise<void> | null = null;
  let enabled = true,
    active = true,
    disposed = false;
  let failed = false;
  let volume = 0.35;
  const busVolumes: Record<SoundBus, number> = { engine: 1, tire: 1 };
  const playerEmitter = createVehicleAudioEmitter();
  const rivalEmitters: ReturnType<typeof createVehicleAudioEmitter>[] = [];
  const presentRivals: ReturnType<typeof createVehicleAudioEmitter>[] = [];
  const supported = typeof AudioContext !== 'undefined' && typeof AudioWorkletNode !== 'undefined';
  if (button) {
    showSoundState();
    if (!supported) button.setAttribute('disabled', '');
  }
  const engineSoundContainer = document.getElementById('engine-sound-settings');
  const engineSoundSettings = engineSoundContainer
    ? mountEngineSoundSettings(engineSoundContainer, () => {
        unlock();
        sync();
      })
    : null;
  const volumeControl = volumeContainer
    ? createNumberStepper({
        label: '音量',
        min: 0,
        max: 100,
        step: 1,
        value: volume * 100,
        format: (value) => `${value}%`,
        onChange(value) {
          volume = value / 100;
          unlock();
          sync();
        },
      })
    : null;
  if (volumeControl) volumeContainer!.replaceChildren(volumeControl.group);
  const mixControls = SOUND_BUSES.flatMap((bus) => {
    const host = document.getElementById(`${bus}-volume`);
    if (!host) return [];
    const control = createRangeControl(
      `${bus === 'engine' ? 'ENG' : 'TIRE'} 音量`,
      { min: 0, max: 100, step: 1 },
      100,
      (value) => {
        busVolumes[bus] = value / 100;
        unlock();
        sync();
      },
      '%',
    );
    host.replaceChildren(control.group);
    return { host, control };
  });
  const tireSoundSettingsHost = document.getElementById('tire-sound-settings');
  const tireSoundSettings = tireSoundSettingsHost
    ? mountTireSoundSettings(tireSoundSettingsHost, () => {
        unlock();
        sync();
      })
    : null;
  const mountHost = <P>(id: string, mount: (host: HTMLElement, onChange: () => void) => P): P | null => {
    const host = document.getElementById(id);
    return host
      ? mount(host, () => {
          unlock();
          sync();
        })
      : null;
  };
  const mixSettings = mountHost('mix-sound-settings', mountMixSoundSettings);
  const timingSettings = mountHost('timing-sound-settings', mountTimingSoundSettings);
  const rivalSettings = mountHost('rival-sound-settings', mountRivalSoundSettings);
  const rollingSettings = mountHost('rolling-sound-settings', mountRollingSoundSettings);
  function showSoundState(): void {
    if (!button || disposed) return;
    button.textContent = !supported
      ? 'SOUND UNAVAILABLE'
      : failed
        ? 'SOUND RETRY'
        : !enabled
          ? 'SOUND OFF'
          : context?.state !== 'running'
            ? 'SOUND START'
            : scene
              ? 'SOUND ON'
              : 'SOUND…';
    button.setAttribute('aria-pressed', String(enabled && supported));
  }
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
  for (const panel of [tireSoundSettings, rollingSettings, mixSettings, timingSettings, rivalSettings])
    panel?.setEnabled(supported);
  function audible(): boolean {
    return enabled && active && !document.hidden && !disposed;
  }
  let suspendTimer: ReturnType<typeof setTimeout> | null = null;
  function closeGraph(retired: typeof scene, closing: AudioContext | null): void {
    try {
      retired?.dispose();
    } catch {
      // A node/port fault must not prevent closing the rest of the graph.
    }
    if (closing) {
      try {
        closing.onstatechange = null;
        void closing.close().catch(() => {});
      } catch {
        // A synchronous browser close failure also stays inside the audio boundary.
      }
    }
  }
  function releaseAudio(): void {
    const retired = scene,
      closing = context;
    scene = null;
    context = null;
    loading = null;
    if (suspendTimer !== null) clearTimeout(suspendTimer);
    suspendTimer = null;
    closeGraph(retired, closing);
  }
  function fail(): void {
    releaseAudio();
    failed = true;
    showSoundState();
  }
  function sync(): void {
    if (suspendTimer !== null) clearTimeout(suspendTimer);
    suspendTimer = null;
    showSoundState();
    if (!context || !scene) return;
    try {
      if (timingSettings) scene.setControlSettings(timingSettings.read());
      if (mixSettings) scene.setMixSettings(mixSettings.read());
      if (rivalSettings) scene.setRivalSettings(rivalSettings.read());
      if (engineSoundSettings) scene.setExhaustSettings(engineSoundSettings.read());
      const tireSettings = tireSoundSettings?.read();
      if (tireSettings) scene.setTireSettings(tireSettings);
      if (rollingSettings) scene.setRollingSettings(rollingSettings.read());
      for (const bus of SOUND_BUSES) scene.setBusGain(bus, busVolumes[bus]);
      scene.setTireComponents(componentState);
      scene.setMasterGain(audible() ? volume : 0);
      if (!active || document.hidden || disposed) void context.suspend().catch(() => {});
      else if (!enabled)
        suspendTimer = setTimeout(
          () => {
            suspendTimer = null;
            if (!audible()) void context?.suspend().catch(() => {});
          },
          (timingSettings?.read() ?? DEFAULT_CONTROL_SETTINGS).transitionSeconds * 1000,
        );
    } catch {
      fail();
    }
  }
  async function initialize(): Promise<void> {
    let created: AudioContext | null = null;
    let built: Awaited<ReturnType<typeof createAudioScene>> | null = null;
    try {
      failed = false;
      created = new AudioContext();
      context = created;
      created.onstatechange = showSoundState;
      // Resume may remain pending for permission; own the graph independently of that promise.
      const resumed = created.resume().then(
        () => true,
        () => false,
      );
      built = await createAudioScene(created, surfaces);
      if (disposed || context !== created) {
        closeGraph(built, created);
        return;
      }
      scene = built;
      if (!(await resumed)) throw new Error('audio resume failed');
      if (context === created) sync();
    } catch {
      // A retired initialization must never close or clear a newer retry's graph.
      if (context === created) fail();
      else closeGraph(built, created);
    }
  }
  function unlock(event?: Event): void {
    if (event?.type === 'pointerdown' && (event as PointerEvent).pointerType !== 'mouse') return;
    if (event?.target === button || !supported || !audible()) return;
    if (!context && !loading) {
      const pending = initialize();
      loading = pending;
      void pending.finally(() => {
        if (loading === pending) loading = null;
      });
    } else if (context && context.state !== 'running') {
      void context
        .resume()
        .then(sync)
        .catch(() => {});
    }
  }
  function toggle(): void {
    // A first tap or interrupted context needs a start/resume, not a mute toggle.
    enabled = failed || !context || (audible() && context.state !== 'running') ? true : !enabled;
    if (enabled) unlock();
    sync();
  }
  function visibility(): void {
    sync();
    if (audible() && context)
      void context
        .resume()
        .then(sync)
        .catch(() => {});
  }
  function hide(event: PageTransitionEvent): void {
    if (event.persisted) {
      active = false;
      sync();
    } else dispose();
  }
  function show(): void {
    active = true;
    visibility();
  }
  function dispose(): void {
    if (disposed) return;
    disposed = true;
    for (const type of GESTURE_EVENTS) window.removeEventListener(type, unlock);
    window.removeEventListener('pagehide', hide);
    window.removeEventListener('pageshow', show);
    document.removeEventListener('visibilitychange', visibility);
    button?.removeEventListener('click', toggle);
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
    releaseAudio();
  }
  for (const type of GESTURE_EVENTS) window.addEventListener(type, unlock);
  window.addEventListener('pagehide', hide);
  window.addEventListener('pageshow', show);
  document.addEventListener('visibilitychange', visibility);
  button?.addEventListener('click', toggle);
  return {
    update(player: CompetitorObservation, rivals: readonly CompetitorObservation[]): void {
      if (!scene || !context || context.state !== 'running' || !audible()) return;
      try {
        readVehicleAudio(player, playerEmitter);
        while (rivalEmitters.length < rivals.length) rivalEmitters.push(createVehicleAudioEmitter());
        presentRivals.length = rivals.length;
        for (let i = 0; i < rivals.length; i += 1) {
          readVehicleAudio(rivals[i]!, rivalEmitters[i]!);
          presentRivals[i] = rivalEmitters[i]!;
        }
        scene.update(playerEmitter, presentRivals, sessionVehicle.sound);
      } catch {
        fail();
      }
    },
    setActive(value: boolean): void {
      active = value;
      visibility();
    },
    dispose,
  };
}
