import { mountAudioTuningControls } from './audio-tuning-controls.js';
import { createNumberStepper } from './number-stepper.js';
import { createAudioEngine } from '../audio/audio-engine.js';
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

/** DOM and permission lifecycle. Construction never creates an AudioContext. */
export function createAudioLifecycle() {
  const button = document.getElementById('sound-toggle');
  const volumeContainer = document.getElementById('sound-volume');
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
  function audible(): boolean {
    return enabled && active && !document.hidden && !disposed;
  }
  let suspendTimer: ReturnType<typeof setTimeout> | null = null;
  function sync(): void {
    if (suspendTimer !== null) clearTimeout(suspendTimer);
    suspendTimer = null;
    showSoundState();
    if (!context || !engine) return;
    if (tuningControls) engine.setTuning(tuningControls.read());
    engine.setVolume(audible() ? volume : 0);
    if (!active || document.hidden || disposed) void context.suspend().catch(() => {});
    else if (!enabled)
      suspendTimer = setTimeout(() => {
        suspendTimer = null;
        if (!audible()) void context?.suspend().catch(() => {});
      }, 90);
  }
  async function initialize(): Promise<void> {
    let created: AudioContext | null = null;
    let built: Awaited<ReturnType<typeof createAudioEngine>> | null = null;
    try {
      failed = false;
      created = new AudioContext();
      context = created;
      created.onstatechange = showSoundState;
      // Resume may wait indefinitely for permission. Own the graph as soon as it arrives,
      // so disposal can release it without waiting for the browser's pending resume promise.
      const resumed = created.resume().then(
        () => true,
        () => false,
      );
      built = await createAudioEngine(created);
      if (disposed) {
        built.dispose();
        return;
      }
      engine = built;
      if (!(await resumed)) throw new Error('audio resume failed');
      sync();
    } catch {
      built?.dispose();
      engine = null;
      if (context === created) context = null;
      if (created) created.onstatechange = null;
      await created?.close().catch(() => {});
      failed = true;
      showSoundState();
    }
  }
  function unlock(event?: Event): void {
    if (event?.type === 'pointerdown' && (event as PointerEvent).pointerType !== 'mouse') return;
    if (event?.target === button || !supported || !audible()) return;
    if (!context && !loading) {
      loading = initialize().finally(() => {
        loading = null;
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
    if (suspendTimer !== null) clearTimeout(suspendTimer);
    for (const type of GESTURE_EVENTS) window.removeEventListener(type, unlock);
    window.removeEventListener('pagehide', hide);
    window.removeEventListener('pageshow', show);
    document.removeEventListener('visibilitychange', visibility);
    button?.removeEventListener('click', toggle);
    volumeControl?.dispose();
    volumeContainer?.replaceChildren();
    tuningControls?.dispose();
    engine?.dispose();
    engine = null;
    if (context) context.onstatechange = null;
    if (context) void context.close().catch(() => {});
  }
  for (const type of GESTURE_EVENTS) window.addEventListener(type, unlock);
  window.addEventListener('pagehide', hide);
  window.addEventListener('pageshow', show);
  document.addEventListener('visibilitychange', visibility);
  button?.addEventListener('click', toggle);
  return {
    update(player: ArcadeVehicleState, actors: readonly { readonly vehicle: ArcadeVehicleState }[]): void {
      if (!engine || !context || context.state !== 'running' || !audible()) return;
      readVehicleAudio(player, playerState);
      engine.update(playerState, vehicleCatalogEntryForId(player.profile.id).sound);
      const nearest = nearestAudibleRival(player, actors);
      if (nearest !== nextRival) {
        nextRival = nearest;
        switchAt = context.currentTime + 0.09;
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
      const pan = (dx * Math.cos(player.yaw) - dz * Math.sin(player.yaw)) / Math.max(3, distance);
      const gain = (0.6 / (1 + (distance / 12) ** 2)) * Math.max(0, 1 - distance / 100);
      engine.updateRival(rivalState, vehicleCatalogEntryForId(rival.profile.id).sound, gain, pan);
    },
    setActive(value: boolean): void {
      active = value;
      visibility();
    },
    dispose,
  };
}
