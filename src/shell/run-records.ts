import type { RaceEvent } from '../race/course-race.js';
import { timeAttackRecordKey, type PlayerRecord, type PlayerRecords, type TimeAttackRecord } from './player-record.js';
import { raceMilliseconds } from './race-time.js';

/** The TIME ATTACK class whose records a selection reads: its series and class, its course and its vehicles. */
export interface RecordClass {
  readonly seriesId: string;
  readonly classId: string;
  /** The course's build identity. */
  readonly courseSha256: string;
  /** The current identity of each catalog vehicle (`sessionVehicleSha256`); a record counts while its vehicle's does. */
  readonly vehicleSha256: ReadonlyMap<string, string>;
}

/** What a run records against: the TIME ATTACK class, its course's goals and whether its record is a lap. */
export interface RecordSelection extends RecordClass {
  /** The course's FINISH gates; a CIRCUIT has one. */
  readonly goals: readonly string[];
  readonly vehicleId: string;
  readonly circuit: boolean;
}

/** A record as the screens show it: its time (a lap on a CIRCUIT) and the vehicle it was set with. */
export interface ShownRecord {
  readonly timeMs: number;
  readonly vehicleId: string;
}

/** A run's standing against the class's record, as RESULT shows it. */
export interface RecordOutcome {
  /** The record before the run at the goal it judged; null when none, or when its identities are not current. */
  readonly previous: ShownRecord | null;
  /** The run (on a CIRCUIT, one of its laps) set a record. */
  readonly newRecord: boolean;
}

/** The difference from the record at the player's latest gate crossing, and that crossing's race time. */
export interface RecordSplit {
  readonly differenceMs: number;
  readonly atSeconds: number;
}

/** The class's stored record at `goal` while its course and vehicle identities are current, else null. */
function currentRecord(records: PlayerRecords, at: RecordClass, goal: string): TimeAttackRecord | null {
  const stored = records.timeAttack[timeAttackRecordKey(at.seriesId, at.classId, goal)];
  return stored &&
    stored.courseSha256 === at.courseSha256 &&
    stored.vehicleSha256 === at.vehicleSha256.get(stored.vehicleId)
    ? stored
    : null;
}

/**
 * The class's record the screens show (SELECT SESSION, the PRE-RACE card and READY): its fastest current record at any
 * goal, the one record of a course with one goal (a circuit has one); null without one.
 */
export function shownRecord(records: PlayerRecords, at: RecordClass): ShownRecord | null {
  let shown: ShownRecord | null = null;
  for (const key of Object.keys(records.timeAttack)) {
    const [seriesId, classId, goal] = JSON.parse(key) as [string, string, string];
    if (seriesId !== at.seriesId || classId !== at.classId) continue;
    const stored = currentRecord(records, at, goal);
    if (stored && (shown === null || stored.timeMs < shown.timeMs))
      shown = { timeMs: stored.timeMs, vehicleId: stored.vehicleId };
  }
  return shown;
}

/**
 * The one owner of a TIME ATTACK run's records: what it compares with while driven, what it records and what RESULT
 * shows. It reads the player's crossings each step. On a CIRCUIT every completed lap is judged against the class's
 * record when it completes, and a faster lap is saved at once with its gate times within the lap; elsewhere the run is
 * judged once, at its finish, against the record of the goal it reached, and a faster time is saved with its gate
 * times. A record whose identities are not current counts as none; an equal time keeps the earlier record. While
 * driven, each crossing is compared with the record run's crossing of the same index (within the lap on a CIRCUIT),
 * once the goal it can reach is known: from the start with one goal, else once `goal` names it.
 */
export function createRunRecords(player: Pick<PlayerRecord, 'records' | 'updateRecords'>, selection: RecordSelection) {
  // The records as they stood before the run: RESULT shows the record the run was judged against.
  const before = player.records;
  let lapStartSeconds = 0,
    judgedGoal: string | null = null,
    newRecord = false,
    split: RecordSplit | null = null;
  const crossings: number[] = [];
  const judge = (goal: string, timeMs: number, splitsMs: readonly number[]): boolean => {
    judgedGoal = goal;
    const stored = currentRecord(player.records, selection, goal);
    if (stored !== null && timeMs >= stored.timeMs) return false;
    const key = timeAttackRecordKey(selection.seriesId, selection.classId, goal);
    const vehicleSha256 = selection.vehicleSha256.get(selection.vehicleId)!;
    const record = {
      timeMs,
      splitsMs,
      vehicleId: selection.vehicleId,
      courseSha256: selection.courseSha256,
      vehicleSha256,
    };
    player.updateRecords({ ...player.records, timeAttack: { ...player.records.timeAttack, [key]: record } });
    newRecord = true;
    return true;
  };
  return Object.freeze({
    /** The record READY shows, from the records before the run; null without one. */
    shown: shownRecord(before, selection),
    /** The difference at the latest crossing compared with the record; null before one. */
    get split(): RecordSplit | null {
      return split;
    },
    /**
     * After each running step: the player's crossings among `events`, and the goal the run can now reach (null while
     * several remain). True when a lap of a CIRCUIT just set a record; a LINEAR or BRANCH record shows at RESULT.
     */
    step(events: readonly RaceEvent[], playerId: string, goal: string | null): boolean {
      let lapRecord = false;
      for (const event of events) {
        if (event.competitorId !== playerId) continue;
        crossings.push(raceMilliseconds(event.timeSeconds - lapStartSeconds));
        const reachable = selection.goals.length === 1 ? selection.goals[0]! : goal;
        const compared = reachable === null ? null : currentRecord(player.records, selection, reachable);
        const index = crossings.length - 1;
        if (compared && index < compared.splitsMs.length)
          split = { differenceMs: crossings[index]! - compared.splitsMs[index]!, atSeconds: event.timeSeconds };
        if (selection.circuit && event.kind === 'finish') {
          lapRecord = judge(event.landmark.id, crossings[index]!, [...crossings]) || lapRecord;
          lapStartSeconds = event.timeSeconds;
          crossings.length = 0;
        } else if (event.finish) judge(event.landmark.id, crossings[index]!, [...crossings]);
      }
      return lapRecord;
    },
    /** RESULT's record lines: the record before the run at the judged goal (else the one goal), and whether it fell. */
    outcome(): RecordOutcome {
      const goal = judgedGoal ?? (selection.goals.length === 1 ? selection.goals[0]! : null);
      const previous = goal === null ? null : currentRecord(before, selection, goal);
      return { previous: previous && { timeMs: previous.timeMs, vehicleId: previous.vehicleId }, newRecord };
    },
  });
}

export type RunRecords = ReturnType<typeof createRunRecords>;
