import type { MusicTrack } from '../audio/music-document.js';
import type { RecordingHandle } from './recording-player.js';
import { playTrack } from './run-music.js';
import type { BrowserDrivingShell } from './driving-shell.js';

/**
 * The one owner of the music the selection screens play: a series' title track, from its start and looped, while its
 * screens are shown. Asking for the track already playing keeps it; another track replaces it; none stops it. The run
 * fades it out over the black transition into READY.
 */
export function createMenuMusic(shell: Pick<BrowserDrivingShell, 'playRecording'>) {
  let track: MusicTrack | null = null,
    handle: RecordingHandle | null = null;
  return {
    /** Play `next` from its start unless it already plays; null stops the music. */
    play(next: MusicTrack | null): void {
      if (next === track) return;
      handle?.stop();
      track = next;
      handle = next ? playTrack(shell, next) : null;
    },
    /** Fade the music out over `seconds` and end it. */
    fadeOut(seconds: number): void {
      handle?.fadeOut(seconds);
      [track, handle] = [null, null];
    },
  };
}
export type MenuMusic = ReturnType<typeof createMenuMusic>;
