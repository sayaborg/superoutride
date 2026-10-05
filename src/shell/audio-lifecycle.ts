import { mountSoundControls } from './controls/sound-controls.js';
import { createAudioScene } from '../audio/audio-scene.js';
import type { TireSurfaceSounds } from '../audio/surface-sounds.js';
import type { AudioSettings } from '../audio/audio-document.js';
import { SOUND_BUSES, type SoundBus } from '../audio/sound-graph.js';
import type { CompiledVehicleDefinition } from '../vehicle/definition-document.js';
import type { CompetitorObservation } from '../race/competitor-observation.js';
import { createVehicleAudioEmitter, readVehicleAudio } from './vehicle-audio.js';
import type { PlayerRecord, VolumeName } from './player-record.js';
import { createRecordingPlayer } from './recording-player.js';
import { EFFECT_RECORDINGS, recordingId } from '../audio/recordings.js';
import type { ProcessingReport } from '../audio/processing-meter.js';
import type { InputRoute } from '../input/menu-input.js';

/** DEV: what the audio timing HUD reads of the audio lifetime. */
export interface AudioTimingSource {
  /** The current AudioContext, or null before the audio starts or after it fails. */
  context(): AudioContext | null;
  /** Report every worklet's processing to `listener`, including scenes built later; null stops it. */
  measureProcessing(listener: ((report: ProcessingReport) => void) | null): void;
  /** The recordings that could not be decoded, by manifest ID. */
  recordingFailures(): readonly string[];
}

/** The player record's volume that sets a bus's gain; the other buses take the DEV mix values. */
const BUS_VOLUMES: Readonly<Partial<Record<SoundBus, VolumeName>>> = Object.freeze({
  music: 'music',
  effects: 'effects',
});

// Touch activation arrives on release; pointerdown activates only a mouse.
const GESTURE_EVENTS = ['pointerdown', 'pointerup', 'touchend', 'keydown'] as const;

/** DOM, permission and failure boundary. Presentation updates fail closed without stopping gameplay. */
/**
 * Each competitor's engine sounds its own vehicle's engine sound, from the vehicle catalog. The DEV sound controls
 * start from the delivered audio document's `settings`. The player record is the one owner of the MASTER, MUSIC and
 * EFFECTS volumes: `setVolume` changes them, the DEV stepper shows MASTER, and every sync sets the master gain and the
 * buses from the record. This lifecycle syncs the controls' values to the scene, owns the AudioContext and plays
 * recordings read through `recordingBytes`.
 */
export function createAudioLifecycle(
  vehicles: readonly CompiledVehicleDefinition[],
  surfaces: TireSurfaceSounds,
  settings: AudioSettings,
  player: PlayerRecord,
  recordingBytes: (id: string) => Promise<Uint8Array>,
) {
  let context: AudioContext | null = null;
  let scene: Awaited<ReturnType<typeof createAudioScene>> | null = null;
  let loading: Promise<void> | null = null;
  // The screen host's route sets whether the page is visible and a run is driven; both start false.
  let enabled = true,
    visible = false,
    live = false,
    disposed = false;
  let failed = false;
  // DEV: the processing listener, applied to every scene built while it is set.
  let processingListener: ((report: ProcessingReport) => void) | null = null;
  const sounds = new Map(vehicles.map((vehicle) => [vehicle.compiledVehicle.id, vehicle.sound]));
  const soundOf = (vehicleId: string) => {
    const sound = sounds.get(vehicleId);
    if (!sound) throw new Error(`No engine sound for vehicle ${vehicleId}`);
    return sound;
  };
  const playerEmitter = createVehicleAudioEmitter();
  const rivalEmitters: ReturnType<typeof createVehicleAudioEmitter>[] = [];
  const presentRivals: ReturnType<typeof createVehicleAudioEmitter>[] = [];
  const supported = typeof AudioContext !== 'undefined' && typeof AudioWorkletNode !== 'undefined';
  const recordingFailures: string[] = [];
  const recordings = createRecordingPlayer(recordingBytes, (id, error) => {
    recordingFailures.push(id);
    console.error(`Recording ${id} could not be decoded`, error);
  });
  const controls = mountSoundControls(document, settings, player.settings.volumes.master, {
    onChange() {
      unlock();
      sync();
    },
    onVolume: (percent) => setVolume('master', percent),
    onToggle: toggle,
  });
  /** The one way a volume changes: the player record keeps it and the scene follows. */
  function setVolume(name: VolumeName, percent: number): void {
    player.updateSettings({ volumes: { ...player.settings.volumes, [name]: percent } });
    if (name === 'master') controls.showVolume(percent);
    sync();
  }
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
    return enabled && visible && !disposed;
  }
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
    recordings.setScene(null);
    context = null;
    loading = null;
    closeGraph(retired, closing);
  }
  function fail(): void {
    releaseAudio();
    failed = true;
    showSoundState();
  }
  function sync(): void {
    showSoundState();
    if (!context || !scene) return;
    try {
      const { settings: current, busVolumes, components } = controls.read();
      const { volumes } = player.settings;
      scene.setControlSettings(current.control);
      scene.setMixSettings(current.mix);
      scene.setRivalSettings(current.rival);
      scene.setExhaustSettings(current.exhaust);
      scene.setTireSettings(current.unified);
      scene.setRollingSettings(current.rolling);
      for (const bus of SOUND_BUSES) {
        const volume = BUS_VOLUMES[bus];
        scene.setBusGain(bus, volume ? volumes[volume] / 100 : (busVolumes[bus] ?? 1));
      }
      scene.setTireComponents(components);
      scene.setMasterGain(audible() ? volumes.master / 100 : 0);
      scene.setLive(live);
      // Only a hidden page suspends the context; SOUND OFF only silences the output.
      if (!visible || disposed) void context.suspend().catch(() => {});
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
      recordings.setScene(built);
      // Effects are decoded ahead, so the first of each sounds when it happens.
      for (const name of EFFECT_RECORDINGS) recordings.prepare(recordingId('effects', name));
      if (processingListener) built.measureProcessing(processingListener);
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
    // Outside driving only `enable` creates the audio; any gesture resumes it.
    if (context || live) start();
  }
  /** Create the audio, or resume it; within a user gesture the browser lets it run. */
  function start(): void {
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
    setVolume,
    /** Play a recording on a bus; see {@link createRecordingPlayer}. Without audio it stays silent. */
    playRecording: recordings.play,
    /** A user gesture outside driving: create the audio now, so the next run sounds from its start. */
    enable(): void {
      if (supported && enabled && !disposed) start();
    },
    update(player: CompetitorObservation, rivals: readonly CompetitorObservation[]): void {
      if (!scene || !context || context.state !== 'running' || !audible() || !live) return;
      try {
        readVehicleAudio(player, playerEmitter);
        while (rivalEmitters.length < rivals.length) rivalEmitters.push(createVehicleAudioEmitter());
        presentRivals.length = rivals.length;
        for (let i = 0; i < rivals.length; i += 1) {
          readVehicleAudio(rivals[i]!, rivalEmitters[i]!);
          presentRivals[i] = rivalEmitters[i]!;
        }
        scene.update(playerEmitter, presentRivals, soundOf);
      } catch {
        fail();
      }
    },
    /** DEV only: the audio timing HUD's source. */
    timing: Object.freeze<AudioTimingSource>({
      context: () => context,
      measureProcessing(listener) {
        processingListener = listener;
        scene?.measureProcessing(listener);
      },
      recordingFailures: () => recordingFailures,
    }),
    /**
     * The screen host's route: the context runs while the page is visible and is suspended while it is hidden; the
     * live buses sound only while driving.
     */
    setRoute(route: InputRoute): void {
      visible = route !== 'off';
      live = route === 'driving';
      sync();
      if (audible() && context)
        void context
          .resume()
          .then(sync)
          .catch(() => {});
    },
  };
}
