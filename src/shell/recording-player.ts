import type { createAudioScene } from '../audio/audio-scene.js';
import type { RecordingLoop, RecordingPlayback } from '../audio/recording-playback.js';
import type { SoundBus } from '../audio/sound-graph.js';

type AudioScene = Awaited<ReturnType<typeof createAudioScene>>;

/** A recording requested to play: it sounds once its recording is decoded, unless it was stopped first. */
export interface RecordingHandle {
  pause(): void;
  /** Continue from where it paused. */
  resume(): void;
  /** Stop with the silence fade. */
  stop(): void;
  /** Fade out over the music fade and stop. */
  fadeOut(): void;
}

const SILENT: RecordingHandle = Object.freeze({ pause() {}, resume() {}, stop() {}, fadeOut() {} });

/**
 * Recordings for the current audio scene, decoded from their delivered bytes off the frame and menu path. Decoded
 * effects and impacts are kept; one music track is kept at a time (a request for another releases the previous).
 * A recording that cannot be decoded reports once through `onFailure` and stays silent; it is not decoded again.
 */
export function createRecordingPlayer(
  read: (id: string) => Promise<Uint8Array>,
  onFailure: (id: string, error: unknown) => void,
) {
  const decoded = new Map<string, Promise<AudioBuffer | null>>();
  let scene: AudioScene | null = null;
  const decode = (id: string, owner: AudioScene): Promise<AudioBuffer | null> => {
    const known = decoded.get(id);
    if (known) return known;
    if (id.startsWith('music/'))
      for (const key of [...decoded.keys()]) if (key.startsWith('music/')) decoded.delete(key);
    const pending = read(id)
      .then((bytes) => owner.decodeRecording(bytes))
      .catch((error: unknown) => {
        // A scene retired while decoding (its context closed) is not the recording's failure.
        if (scene !== owner) decoded.delete(id);
        else onFailure(id, error);
        return null;
      });
    decoded.set(id, pending);
    return pending;
  };
  return {
    /** The scene playbacks are made on, or null while there is none. */
    setScene(value: AudioScene | null): void {
      scene = value;
    },
    /** Decode the recording `id` ahead of its first play. */
    prepare(id: string): void {
      if (scene) void decode(id, scene);
    },
    /** Play the recording `id` on `bus` from its start, once or looped, at `volume` (0–1). */
    play(
      id: string,
      bus: SoundBus,
      options?: { readonly volume?: number; readonly loop?: RecordingLoop | null },
    ): RecordingHandle {
      const owner = scene;
      if (!owner) return SILENT;
      let state: 'playing' | 'paused' | 'ended' = 'playing';
      let playback: RecordingPlayback | null = null;
      void decode(id, owner).then((buffer) => {
        if (!buffer || state === 'ended' || scene !== owner) return;
        playback = owner.createPlayback(buffer, bus, options);
        if (state === 'playing') playback.play();
      });
      return {
        pause() {
          if (state !== 'playing') return;
          state = 'paused';
          playback?.pause();
        },
        resume() {
          if (state !== 'paused') return;
          state = 'playing';
          playback?.play();
        },
        stop() {
          state = 'ended';
          playback?.stop();
        },
        fadeOut() {
          state = 'ended';
          playback?.fadeOut();
        },
      };
    },
  };
}
