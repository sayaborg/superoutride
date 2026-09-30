import { mountSoundControls } from './controls/sound-controls.js';
import { createAudioScene } from '../audio/audio-scene.js';
import type { TireSurfaceSounds } from '../audio/surface-sounds.js';
import type { AudioSettings } from '../audio/audio-document.js';
import { SOUND_BUSES } from '../audio/sound-graph.js';
import type { CompiledVehicleDefinition } from '../vehicle/definition-document.js';
import type { CompetitorObservation } from '../race/competitor-observation.js';
import { createVehicleAudioEmitter, readVehicleAudio } from './vehicle-audio.js';

// Touch activation arrives on release; pointerdown activates only a mouse.
const GESTURE_EVENTS = ['pointerdown', 'pointerup', 'touchend', 'keydown'] as const;

/** DOM, permission and failure boundary. Presentation updates fail closed without stopping gameplay. */
/**
 * Every competitor drives the Session vehicle, so player and rival engines use its sound. The DEV sound controls
 * start from the delivered audio document's `settings`; this lifecycle syncs their values to the scene and owns the
 * AudioContext.
 */
export function createAudioLifecycle(
  sessionVehicle: CompiledVehicleDefinition,
  surfaces: TireSurfaceSounds,
  settings: AudioSettings,
) {
  let context: AudioContext | null = null;
  let scene: Awaited<ReturnType<typeof createAudioScene>> | null = null;
  let loading: Promise<void> | null = null;
  // The run state activates the audio through setActive; it starts inactive.
  let enabled = true,
    active = false,
    disposed = false;
  let failed = false;
  const playerEmitter = createVehicleAudioEmitter();
  const rivalEmitters: ReturnType<typeof createVehicleAudioEmitter>[] = [];
  const presentRivals: ReturnType<typeof createVehicleAudioEmitter>[] = [];
  const supported = typeof AudioContext !== 'undefined' && typeof AudioWorkletNode !== 'undefined';
  const controls = mountSoundControls(document, settings, {
    onChange() {
      unlock();
      sync();
    },
    onToggle: toggle,
  });
  controls.setEnabled(supported);
  showSoundState();
  function showSoundState(): void {
    if (disposed) return;
    const text = !supported
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
    controls.showSoundState(text, enabled && supported);
  }
  function audible(): boolean {
    return enabled && active && !disposed;
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
      const { settings: current, volume, busVolumes, components } = controls.read();
      scene.setControlSettings(current.control);
      scene.setMixSettings(current.mix);
      scene.setRivalSettings(current.rival);
      scene.setExhaustSettings(current.exhaust);
      scene.setTireSettings(current.unified);
      scene.setRollingSettings(current.rolling);
      for (const bus of SOUND_BUSES) scene.setBusGain(bus, busVolumes[bus]);
      scene.setTireComponents(components);
      scene.setMasterGain(audible() ? volume : 0);
      if (!active || disposed) void context.suspend().catch(() => {});
      else if (!enabled)
        suspendTimer = setTimeout(() => {
          suspendTimer = null;
          if (!audible()) void context?.suspend().catch(() => {});
        }, current.control.transitionSeconds * 1000);
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
    if (controls.isSoundToggle(event?.target ?? null) || !supported || !audible()) return;
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
  // A page hidden without entering the back/forward cache ends the audio lifetime.
  function hide(event: PageTransitionEvent): void {
    if (!event.persisted) dispose();
  }
  function dispose(): void {
    if (disposed) return;
    disposed = true;
    for (const type of GESTURE_EVENTS) window.removeEventListener(type, unlock);
    window.removeEventListener('pagehide', hide);
    controls.dispose();
    releaseAudio();
  }
  for (const type of GESTURE_EVENTS) window.addEventListener(type, unlock);
  window.addEventListener('pagehide', hide);
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
      sync();
      if (audible() && context)
        void context
          .resume()
          .then(sync)
          .catch(() => {});
    },
    dispose,
  };
}
