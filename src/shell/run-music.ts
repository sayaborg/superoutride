import type { MusicTrack } from '../audio/music-document.js';
import type { RaceStatus } from '../race/course-race.js';
import type { RecordingHandle } from './recording-player.js';
import type { BrowserDrivingShell } from './driving-shell.js';

/** Play `track` from its start, looped, on the music bus: the run's track and every audition use this one form. */
export function playTrack(shell: Pick<BrowserDrivingShell, 'playRecording'>, track: MusicTrack): RecordingHandle {
  return shell.playRecording(`music/${track.id}`, 'music', { loop: track.loop });
}

/**
 * The one owner of when a run's track plays. Each Session's track starts from its beginning when its race enters READY
 * and loops; it pauses while the run is not live and continues from there when it is again; at GOAL or GAME OVER it fades
 * out with the music fade and stays silent through RESULT. A new Session (a DEV rebuild) stops the previous Session's
 * track, and its own starts at its READY. It reads only the race's status and whether the run is live, never a clock.
 */
export function createRunMusic(shell: Pick<BrowserDrivingShell, 'playRecording'>, track: MusicTrack) {
  let session: object | null = null,
    handle: RecordingHandle | null = null,
    ended = false,
    paused = false;
  return {
    /** Each drawn frame: the current Session (any object identifying it), its race status and whether the run is live. */
    update(current: object, status: RaceStatus, live: boolean): void {
      if (current !== session) {
        handle?.stop();
        [session, handle, ended, paused] = [current, null, false, false];
      }
      if (ended) return;
      if (!handle) {
        if (status !== 'READY') return;
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
