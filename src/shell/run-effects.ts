import type { EffectRecording } from '../audio/recordings.js';
import type { RaceFacts } from '../race/course-race.js';
import type { RecordingHandle } from './recording-player.js';

/**
 * The effect, if any, of one player crossing: one crossing gives one sound. The crossing that finishes the run sounds
 * through GOAL's effect, a crossing that extended the clock gives `extend`, a circuit's finish line that begins the
 * last lap `final-lap`, and any other a finish line's `lap` or a checkpoint's `checkpoint`.
 */
function crossingEffect(event: RaceFacts['events'][number], race: RaceFacts): EffectRecording | null {
  if (event.finish) return null;
  if (event.extensionMs !== null) return 'extend';
  if (event.kind !== 'finish') return 'checkpoint';
  return race.courseType === 'CIRCUIT' && event.lap + 1 === race.lapCount ? 'final-lap' : 'lap';
}

/**
 * The one owner of a run's race effects, read from race facts after every fixed step: a signal lamp lighting, GO, the
 * player's crossings and the GOAL or GAME OVER effect, and NEW RECORD once RESULT shows it or a lap sets it. Each happening sounds once:
 * a run's step is read once, and a new run (a DEV rebuild) starts afresh. The outcome effect sounds on into
 * RESULT and stops when the run is left or its run is replaced.
 */
export function createRunEffects(play: (effect: EffectRecording) => RecordingHandle) {
  let setup: object | null = null,
    lamps = 0,
    status: RaceFacts['outcome']['status'] = 'WAITING',
    outcome: RecordingHandle | null = null;
  return {
    /** After each fixed step: the current run (any object identifying it) and its race facts. */
    step(current: object, race: RaceFacts): void {
      if (current !== setup) {
        outcome?.stop();
        [setup, lamps, status, outcome] = [current, 0, 'WAITING', null];
      }
      const { signalLamps } = race.countdown;
      if (signalLamps > lamps) play('countdown-lamp');
      lamps = signalLamps;
      const next = race.outcome.status;
      if (status === 'READY' && next !== 'READY') play('countdown-go');
      for (const event of race.events) {
        if (event.competitorId !== race.player.id) continue;
        const effect = crossingEffect(event, race);
        if (effect) play(effect);
      }
      if (next !== status && (next === 'GOAL' || next === 'GAME_OVER')) {
        outcome?.stop();
        outcome = play(next === 'GOAL' ? 'goal' : 'game-over');
      }
      status = next;
    },
    /** RESULT shows the run's outcome: `new-record` sounds once when it shows NEW RECORD. */
    result(newRecord: boolean): void {
      if (newRecord) play('new-record');
    },
    /** A circuit lap just set a record: `new-record` sounds as it completes. */
    newRecord(): void {
      play('new-record');
    },
    /** The run is left: its outcome effect stops. */
    stop(): void {
      outcome?.stop();
    },
  };
}
