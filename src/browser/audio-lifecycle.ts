import { mountAudioTuningControls } from './audio-tuning-controls.js';
import { createNumberStepper } from './number-stepper.js';
import { createAudioEngine } from '../audio/audio-engine.js';
import { DEFAULT_TIRE_SOUND_MODEL, type TireSoundModel } from '../audio/tire-sound-controls.js';
import { AUDIO_TIMING, rivalAudioGain, rivalAudioPan } from '../audio/audio-presentation.js';
import type { ArcadeVehicleState } from '../physics/arcade-vehicle-physics.js';
import { vehicleCatalogEntryForId } from '../vehicle/vehicle-catalog.js';
import {
  createVehicleAudioObservation,
  readEngineAudio,
  readVehicleAudio,
  nearestAudibleRival,
} from './vehicle-audio.js';

// Touch activation arrives on release; pointerdown activates only a mouse.
const GESTURE_EVENTS = ['pointerdown', 'pointerup', 'touchend', 'keydown'] as const;

/** DOM, permission and failure boundary. Presentation updates fail closed without stopping gameplay. */
export function createAudioLifecycle() {
  const button = document.getElementById('sound-toggle');
  const volumeContainer = document.getElementById('sound-volume');
  const tireButton = document.getElementById('tire-sound-toggle');
  let tireModel: TireSoundModel = DEFAULT_TIRE_SOUND_MODEL;
  let context: AudioContext | null = null;
  let engine: Awaited<ReturnType<typeof createAudioEngine>> | null = null;
  let loading: Promise<void> | null = null;
  let enabled = true,
    active = true,
    disposed = false;
  let failed = false;
  let volume = 0.35;
  const playerState = createVehicleAudioObservation(),
    rivalState = createVehicleAudioObservation();
  let nextRival: ArcadeVehicleState | null = null;
  let switchAt = 0;
  const supported = typeof AudioContext !== 'undefined' && typeof AudioWorkletNode !== 'undefined';
  if (button) {
    showSoundState();
    if (!supported) button.setAttribute('disabled', '');
  }
  const tuningContainer = document.getElementById('sound-tuning');
  const tuningControls = tuningContainer
    ? mountAudioTuningControls(tuningContainer, () => {
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
            : engine
              ? 'SOUND ON'
              : 'SOUND…';
    button.setAttribute('aria-pressed', String(enabled && supported));
  }
  function showTireModel(): void {
    if (!tireButton) return;
    tireButton.textContent = tireModel === 'current' ? 'TIRES: CURRENT' : 'TIRES: CONTACT';
    tireButton.setAttribute('aria-pressed', String(tireModel === 'contact'));
    if (!supported) tireButton.setAttribute('disabled', '');
  }
  function toggleTires(): void {
    tireModel = tireModel === 'current' ? 'contact' : 'current';
    showTireModel();
    unlock();
    sync();
  }
  function tireKey(event: Event): void {
    event.stopPropagation();
  }
  showTireModel();
  function audible(): boolean {
    return enabled && active && !document.hidden && !disposed;
  }
  let suspendTimer: ReturnType<typeof setTimeout> | null = null;
  function closeGraph(retired: typeof engine, closing: AudioContext | null): void {
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
    const retired = engine,
      closing = context;
    engine = null;
    context = null;
    loading = null;
    nextRival = null;
    switchAt = 0;
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
    if (!context || !engine) return;
    try {
      if (tuningControls) engine.setTuning(tuningControls.read());
      engine.setTireModel(tireModel);
      engine.setVolume(audible() ? volume : 0);
      if (!active || document.hidden || disposed) void context.suspend().catch(() => {});
      else if (!enabled)
        suspendTimer = setTimeout(() => {
          suspendTimer = null;
          if (!audible()) void context?.suspend().catch(() => {});
        }, AUDIO_TIMING.transitionSeconds * 1000);
    } catch {
      fail();
    }
  }
  async function initialize(): Promise<void> {
    let created: AudioContext | null = null;
    let built: Awaited<ReturnType<typeof createAudioEngine>> | null = null;
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
      built = await createAudioEngine(created);
      if (disposed || context !== created) {
        closeGraph(built, created);
        return;
      }
      engine = built;
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
    tireButton?.removeEventListener('click', toggleTires);
    tireButton?.removeEventListener('keydown', tireKey);
    volumeControl?.dispose();
    volumeContainer?.replaceChildren();
    tuningControls?.dispose();
    releaseAudio();
  }
  for (const type of GESTURE_EVENTS) window.addEventListener(type, unlock);
  window.addEventListener('pagehide', hide);
  window.addEventListener('pageshow', show);
  document.addEventListener('visibilitychange', visibility);
  button?.addEventListener('click', toggle);
  tireButton?.addEventListener('click', toggleTires);
  tireButton?.addEventListener('keydown', tireKey);
  return {
    update(player: ArcadeVehicleState, actors: readonly { readonly vehicle: ArcadeVehicleState }[]): void {
      if (!engine || !context || context.state !== 'running' || !audible()) return;
      try {
        readVehicleAudio(player, playerState);
        engine.update(playerState, vehicleCatalogEntryForId(player.profile.id).sound);
        const nearest = nearestAudibleRival(player, actors);
        if (nearest !== nextRival) {
          nextRival = nearest;
          switchAt = context.currentTime + AUDIO_TIMING.transitionSeconds;
          engine.silenceRival();
        }
        if (context.currentTime < switchAt) return;
        const rival = nextRival;
        if (!rival) {
          engine.silenceRival();
          return;
        }
        readEngineAudio(rival, rivalState);
        const dx = rival.x - player.x,
          dy = rival.y - player.y,
          dz = rival.z - player.z;
        const distance = Math.hypot(dx, dy, dz);
        const lateral = dx * Math.cos(player.yaw) - dz * Math.sin(player.yaw);
        engine.updateRival(
          rivalState,
          vehicleCatalogEntryForId(rival.profile.id).sound,
          rivalAudioGain(distance),
          rivalAudioPan(lateral, distance),
        );
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
