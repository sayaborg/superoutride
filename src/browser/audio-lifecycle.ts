import { mountAudioTuningControls } from './audio-tuning-controls.js';
import { createAudioEngine } from '../audio/audio-engine.js';
import type { ArcadeVehicleState } from '../physics/arcade-vehicle-physics.js';
import { vehicleCatalogEntryForId } from '../vehicle/vehicle-catalog.js';
import { createVehicleAudioObservation, readEngineAudio, nearestAudibleRival } from './vehicle-audio.js';

/** DOM and permission lifecycle. Construction never creates an AudioContext. */
export function createAudioLifecycle() {
  const button = document.getElementById('sound-toggle');
  const methodControl = document.getElementById('sound-method') as HTMLSelectElement | null;
  const volumeControl = document.getElementById('sound-volume') as HTMLInputElement | null;
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
    button.textContent = supported ? 'SOUND ON' : 'SOUND UNAVAILABLE';
    button.setAttribute('aria-pressed', String(enabled && supported));
    if (!supported) button.setAttribute('disabled', '');
  }
  const tuningContainer = document.getElementById('sound-tuning');
  const tuningControls = tuningContainer
    ? mountAudioTuningControls(tuningContainer, () => {
        unlock();
        sync();
      })
    : null;
  function audible(): boolean {
    return enabled && active && !document.hidden && !disposed;
  }
  let suspendTimer: ReturnType<typeof setTimeout> | null = null;
  function sync(): void {
    if (suspendTimer !== null) clearTimeout(suspendTimer);
    suspendTimer = null;
    if (!context || !engine) return;
    engine.setCoupled(methodControl?.value !== 'reflection');
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
      // Attach both rejection handlers immediately, and await both before cleanup.
      const [resume, build] = await Promise.allSettled([created.resume(), createAudioEngine(created)]);
      if (build.status === 'fulfilled') built = build.value;
      if (resume.status === 'rejected' || build.status === 'rejected') throw new Error('audio initialization failed');
      if (disposed) {
        built?.dispose();
        await created.close();
        return;
      }
      engine = built;
      if (button) button.textContent = enabled ? 'SOUND ON' : 'SOUND OFF';
      sync();
    } catch {
      built?.dispose();
      engine = null;
      if (context === created) context = null;
      await created?.close().catch(() => {});
      failed = true;
      if (button && !disposed) button.textContent = 'SOUND RETRY';
    }
  }
  function unlock(event?: Event): void {
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
    enabled = failed ? true : !enabled;
    if (button) {
      button.textContent = enabled ? 'SOUND ON' : 'SOUND OFF';
      button.setAttribute('aria-pressed', String(enabled));
    }
    if (enabled) unlock();
    sync();
  }
  function changeMethod(): void {
    unlock();
    sync();
  }
  function methodKey(event: Event): void {
    // Let the native select use arrow keys without steering/accelerating the vehicle.
    event.stopPropagation();
  }
  function changeVolume(): void {
    const value = Number(volumeControl?.value);
    if (Number.isFinite(value)) volume = Math.max(0, Math.min(1, value / 100));
    unlock();
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
    window.removeEventListener('pointerdown', unlock);
    window.removeEventListener('keydown', unlock);
    window.removeEventListener('pagehide', hide);
    window.removeEventListener('pageshow', show);
    document.removeEventListener('visibilitychange', visibility);
    button?.removeEventListener('click', toggle);
    volumeControl?.removeEventListener('input', changeVolume);
    methodControl?.removeEventListener('change', changeMethod);
    methodControl?.removeEventListener('keydown', methodKey);
    tuningControls?.dispose();
    engine?.dispose();
    engine = null;
    if (context && !loading) void context.close().catch(() => {});
  }
  window.addEventListener('pointerdown', unlock);
  window.addEventListener('keydown', unlock);
  window.addEventListener('pagehide', hide);
  window.addEventListener('pageshow', show);
  document.addEventListener('visibilitychange', visibility);
  button?.addEventListener('click', toggle);
  volumeControl?.addEventListener('input', changeVolume);
  methodControl?.addEventListener('change', changeMethod);
  methodControl?.addEventListener('keydown', methodKey);
  return {
    update(player: ArcadeVehicleState, actors: readonly { readonly vehicle: ArcadeVehicleState }[]): void {
      if (!engine || !context || context.state !== 'running' || !audible()) return;
      readEngineAudio(player, playerState);
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
