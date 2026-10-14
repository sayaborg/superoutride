import type { createAudioScene } from '../audio/audio-scene.js';
import type { PlaybackOptions, RecordingPlayback } from '../audio/recording-playback.js';
import type { SoundBus } from '../audio/sound-graph.js';

type AudioScene = Awaited<ReturnType<typeof createAudioScene>>;

/** A recording requested to play: it sounds once its recording is decoded, unless it was stopped first. */
export interface RecordingHandle {
  pause(): void;
  /** Continue from where it paused. */
  resume(): void;
  /** Stop with the silence fade. */
  stop(): void;
  /** Fade out over `seconds`, by default the music fade, and stop. */
  fadeOut(seconds?: number): void;
}

const SILENT: RecordingHandle = Object.freeze({ pause() {}, resume() {}, stop() {}, fadeOut() {} });

/** A request the player holds: its recording, bus and options, its state and its playback on the current scene. */
interface Request {
  readonly id: string;
  readonly bus: SoundBus;
  readonly options: Omit<PlaybackOptions, 'from'> | undefined;
  state: 'playing' | 'paused' | 'ended';
  playback: RecordingPlayback | null;
  /** Its latest binding to a scene: only that binding's decode makes its playback. */
  binding: number;
}

/**
 * Recordings for the current audio scene, decoded from their delivered bytes off the frame and menu path. Decodes
 * belong to the scene they were made on and a new scene starts without them; decoded effects and impacts are kept; one
 * music track is kept at a time (a request for another releases the previous). A request bound again (to a new scene)
 * takes only its latest binding's decode, so an earlier one finishing later makes nothing.
 * A recording that cannot be decoded reports once through `onFailure` and stays silent; it is not decoded again.
 * Once the page's audio has begun (`begin`), the player owns every looped request until it is stopped: a request made
 * without a scene, or whose scene was replaced, sounds from its start on the next scene. Before that a request is
 * silent, and a recording played once belongs to the scene it was asked of.
 */
export function createRecordingPlayer(
  read: (id: string) => Promise<Uint8Array>,
  onFailure: (id: string, error: unknown) => void,
) {
  const decoded = new Map<string, Promise<AudioBuffer | null>>();
  const looped = new Set<Request>();
  let scene: AudioScene | null = null,
    decodedOn: AudioScene | null = null,
    begun = false;
  const decode = (id: string, owner: AudioScene): Promise<AudioBuffer | null> => {
    if (decodedOn !== owner) {
      decoded.clear();
      decodedOn = owner;
    }
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
  // A request's playback on `owner`, from the recording's start, once it is decoded.
  const bind = (request: Request, owner: AudioScene) => {
    request.playback = null;
    const binding = ++request.binding;
    void decode(request.id, owner).then((buffer) => {
      if (!buffer || request.state === 'ended' || scene !== owner || request.binding !== binding) return;
      request.playback = owner.createPlayback(buffer, request.bus, request.options);
      if (request.state === 'playing') request.playback.play();
    });
  };
  const end = (request: Request) => {
    request.state = 'ended';
    looped.delete(request);
  };
  return {
    /** The page's audio has begun: from now on looped requests wait for a scene when there is none. */
    begin(): void {
      begun = true;
    },
    /** The scene playbacks are made on, or null while there is none; looped requests move to it. */
    setScene(value: AudioScene | null): void {
      scene = value;
      for (const request of looped)
        if (value) bind(request, value);
        else request.playback = null;
    },
    /** Decode the recording `id` ahead of its first play. */
    prepare(id: string): void {
      if (scene) void decode(id, scene);
    },
    /** Play the recording `id` on `bus` from its start, once or looped, at `volume` (0–1). */
    play(id: string, bus: SoundBus, options?: Omit<PlaybackOptions, 'from'>): RecordingHandle {
      const loop = (options?.loop ?? null) !== null;
      if (!scene && !(loop && begun)) return SILENT;
      const request: Request = { id, bus, options, state: 'playing', playback: null, binding: 0 };
      if (loop) looped.add(request);
      if (scene) bind(request, scene);
      return {
        pause() {
          if (request.state !== 'playing') return;
          request.state = 'paused';
          request.playback?.pause();
        },
        resume() {
          if (request.state !== 'paused') return;
          request.state = 'playing';
          request.playback?.play();
        },
        stop() {
          end(request);
          request.playback?.stop();
        },
        fadeOut(seconds) {
          end(request);
          request.playback?.fadeOut(seconds);
        },
      };
    },
  };
}
