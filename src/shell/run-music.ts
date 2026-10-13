import type { MusicTrack } from '../audio/music-document.js';
import type { RaceStatus } from '../race/course-race.js';
import type { RecordingHandle } from './recording-player.js';
import type { BrowserDrivingShell } from './driving-shell.js';

/**
 * Play `track` from its start, looped, on the music bus, rising over `fadeInSeconds` when given: the run's track, the
 * title tracks and the audition use this one form.
 */
export function playTrack(
  shell: Pick<BrowserDrivingShell, 'playRecording'>,
  track: MusicTrack,
  fadeInSeconds = 0,
): RecordingHandle {
  return shell.playRecording(`music/${track.id}`, 'music', { loop: track.loop, fadeInSeconds });
}

/**
 * The one owner of when a run's track plays. Each run's track starts from its beginning when its race enters READY
 * and loops; it pauses while the run is not live and continues from there when it is again; at GOAL or GAME OVER it fades
 * out with the music fade and stays silent through RESULT. A new run (a DEV rebuild) stops the previous run's
 * track, and its own starts at its READY. It reads only the race's status and whether the run is live, never a clock.
 * A run with MUSIC OFF (no track) plays none.
 */
export function createRunMusic(shell: Pick<BrowserDrivingShell, 'playRecording'>, track: MusicTrack | null) {
  let setup: object | null = null,
    handle: RecordingHandle | null = null,
    ended = false,
    paused = false;
  return {
    /** Each drawn frame: the current run (any object identifying it), its race status and whether the run is live. */
    update(current: object, status: RaceStatus, live: boolean): void {
      if (current !== setup) {
        handle?.stop();
        [setup, handle, ended, paused] = [current, null, false, false];
      }
      if (ended) return;
      if (!handle) {
        if (status !== 'READY' || track === null) return;
        handle = playTrack(shell, track);
      }
      if (status === 'GOAL' || status === 'GAME_OVER') {
        handle.fadeOut();
        ended = true;
      } else if (live === paused) {
        paused = !live;
        if (paused) handle.pause();
        else handle.resume();
      }
    },
    /** The run is left: its track stops. */
    stop(): void {
      handle?.stop();
      ended = true;
    },
  };
}
