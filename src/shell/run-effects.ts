import type { EffectRecording } from '../audio/recordings.js';
import type { RaceFacts } from '../race/course-race.js';
import type { RecordingHandle } from './recording-player.js';

/**
 * The effect, if any, of one player crossing: one crossing gives one sound. The crossing that finishes the run sounds
 * through GOAL's jingle, a crossing that extended the clock gives `extend`, and any other a finish line's `lap` or a
 * checkpoint's `checkpoint`.
 */
function crossingEffect(event: RaceFacts['events'][number]): EffectRecording | null {
  if (event.finish) return null;
  if (event.extensionMs !== null) return 'extend';
  return event.kind === 'finish' ? 'lap' : 'checkpoint';
}

/**
 * The one owner of a run's race effects, read from race facts after every fixed step: a signal lamp lighting, GO, the
 * player's crossings and the GOAL or GAME OVER jingle. Each happening sounds once: a Session's step is read once, and a
 * new Session (a DEV rebuild) starts afresh. The jingle sounds on into RESULT and stops when the run is left or its
 * Session is replaced.
 */
export function createRunEffects(play: (effect: EffectRecording) => RecordingHandle) {
  let session: object | null = null,
    lamps = 0,
    status: RaceFacts['outcome']['status'] = 'WAITING',
    jingle: RecordingHandle | null = null;
  return {
    /** After each fixed step: the current Session (any object identifying it) and its race facts. */
    step(current: object, race: RaceFacts): void {
      if (current !== session) {
        jingle?.stop();
        [session, lamps, status, jingle] = [current, 0, 'WAITING', null];
      }
      const { signalLamps } = race.countdown;
      if (signalLamps > lamps) play('countdown-lamp');
      lamps = signalLamps;
      const next = race.outcome.status;
      if (status === 'READY' && next !== 'READY') play('countdown-go');
      for (const event of race.events) {
        if (event.competitorId !== race.player.id) continue;
        const effect = crossingEffect(event);
        if (effect) play(effect);
      }
      if (next !== status && (next === 'GOAL' || next === 'GAME_OVER')) {
        jingle?.stop();
        jingle = play(next === 'GOAL' ? 'goal' : 'game-over');
      }
      status = next;
    },
    /** The run is left: its jingle stops. */
    stop(): void {
      jingle?.stop();
    },
  };
}
