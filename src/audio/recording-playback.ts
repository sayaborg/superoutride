import type { ControlSettings } from './audio-control-policy.js';
import { follow, hold } from './audio-parameter.js';

/** A looped recording returns from `end` to `start`, in seconds of the decoded recording. */
export interface RecordingLoop {
  readonly start: number;
  readonly end: number;
}

/** One playback of a decoded recording on a bus. */
export interface RecordingPlayback {
  /** Play from the current position: from the start the first time, else where it paused. */
  play(): void;
  /** Stop with the silence fade, keeping the position for {@link RecordingPlayback.play}. */
  pause(): void;
  /** Stop with the silence fade; the playback ends. */
  stop(): void;
  /** Fade out linearly over the music fade (`musicFadeSeconds`) and end. */
  fadeOut(): void;
  /** The position in seconds within the recording. */
  position(): number;
}

/**
 * Play `buffer` into `destination` at `volume` (0–1), once or looped. Each playback has its own source and gain, so
 * playbacks of one recording overlap. A loop runs sample-accurately between its points (the source's own loop). A
 * playback starting from the beginning starts at full volume; one continuing from a pause fades in with the silence
 * fade (`fadeSeconds`), and pause and stop fade out with it before the source stops (`transitionSeconds`). A playback
 * sounds one source at a time: playing again before a paused source has stopped starts when it stops.
 */
export function createRecordingPlayback(
  context: BaseAudioContext,
  destination: AudioNode,
  buffer: AudioBuffer,
  control: () => ControlSettings,
  { volume = 1, loop = null }: { readonly volume?: number; readonly loop?: RecordingLoop | null } = {},
): RecordingPlayback {
  const gain = context.createGain();
  gain.gain.value = 0;
  gain.connect(destination);
  let source: AudioBufferSourceNode | null = null;
  // While playing: the context time the source starts and the position it starts from. A released source sounds
  // until `releasedUntil`.
  let startedAt = 0,
    offset = 0,
    releasedUntil = 0,
    ended = false;
  const position = (): number => {
    if (!source) return offset;
    const elapsed = offset + Math.max(0, context.currentTime - startedAt);
    if (loop && elapsed >= loop.end) return loop.start + ((elapsed - loop.start) % (loop.end - loop.start));
    return Math.min(elapsed, buffer.duration);
  };
  // Stop the source at `at`; the position stays where the release began.
  const release = (at: number): void => {
    const playing = source;
    if (!playing) return;
    offset = position();
    source = null;
    releasedUntil = Math.max(releasedUntil, at);
    playing.stop(at);
  };
  const pause = (): void => {
    const now = context.currentTime;
    follow(gain.gain, 0, now, control().fadeSeconds);
    release(now + control().transitionSeconds);
  };
  return {
    play(): void {
      if (ended || source) return;
      if (!loop && offset >= buffer.duration) return;
      const now = context.currentTime,
        at = Math.max(now, releasedUntil);
      const playing = context.createBufferSource();
      playing.buffer = buffer;
      if (loop) {
        playing.loop = true;
        playing.loopStart = loop.start;
        playing.loopEnd = loop.end;
      }
      playing.connect(gain);
      playing.onended = () => {
        playing.disconnect();
        if (source === playing) {
          source = null;
          offset = buffer.duration;
          ended = true;
        }
        if (ended && !source) gain.disconnect();
      };
      // A source still released keeps its fade to silence; this one fades in when it stops.
      if (at > now) gain.gain.setTargetAtTime(volume, at, control().fadeSeconds);
      else if (offset === 0) {
        gain.gain.cancelScheduledValues(now);
        gain.gain.setValueAtTime(volume, now);
      } else follow(gain.gain, volume, now, control().fadeSeconds);
      playing.start(at, offset);
      source = playing;
      startedAt = at;
    },
    pause,
    stop(): void {
      pause();
      ended = true;
    },
    fadeOut(): void {
      const now = context.currentTime,
        seconds = control().musicFadeSeconds;
      hold(gain.gain, now);
      // A linear ramp runs from the previous event: anchor it at the value held now.
      gain.gain.setValueAtTime(gain.gain.value, now);
      gain.gain.linearRampToValueAtTime(0, now + seconds);
      release(now + seconds);
      ended = true;
    },
    position,
  };
}
