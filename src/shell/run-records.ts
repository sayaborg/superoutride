import type { RunRequest } from './run-request.js';
import {
  arcadeRecordKey,
  timeTrialRecordKey,
  type ArcadeRecord,
  type PlayerRecords,
  type TimeTrialRecord,
} from './player-record.js';
import { raceMilliseconds } from './race-time.js';

/** What a run records against before it is driven: its mode's records (ARCADE's in its class) and its identities. */
export interface RecordSelection {
  readonly rules:
    | { readonly mode: 'ARCADE'; readonly seriesId: string; readonly classId: string }
    | { readonly mode: Exclude<RunRequest['mode'], 'ARCADE'> };
  readonly courseId: string;
  readonly vehicleId: string;
  readonly lapCount: number;
  readonly courseSha256: string;
  readonly vehicleSha256: string;
  /** The course's FINISH gates: an ARCADE goal is known before driving only on a course with one. */
  readonly goals: readonly string[];
}

/** A run that reached GOAL: its selection and the race's facts at GOAL. */
export interface RecordedRun extends RecordSelection {
  /** The route taken (`race.routeLinks`). */
  readonly routeLinks: readonly string[] | null;
  /** The FINISH gate reached. */
  readonly goal: string;
  /** The run's ending race time (`race.outcome.endSeconds`). */
  readonly finishSeconds: number;
  readonly crossingSeconds: readonly number[];
  readonly bestLapSeconds: number | null;
}

/** A run's standing against the record it was judged against, as RESULT shows it. */
export interface RecordOutcome {
  /** The record before the run; null when none, or when its identities differ from the run's. */
  readonly previous: { readonly timeMs: number; readonly bestLapMs: number | null } | null;
  readonly newRecord: boolean;
  /** TIME TRIAL on a CIRCUIT: the run's best lap beat the recorded one. */
  readonly newBestLap: boolean;
}

/** The one judgement of a run against the records: what RESULT shows and what is saved. */
export interface RecordJudgement extends RecordOutcome {
  readonly timeMs: number;
  /** The records to save; null when nothing changes. */
  readonly records: PlayerRecords | null;
}

/** The record a run compares with while driven: its time and, for a TIME TRIAL record, its gate and lap crossings. */
export interface ComparedRecord {
  readonly timeMs: number;
  readonly splitsMs: readonly number[] | null;
}

// A stored record counts only while its identities are the selection's.
const identical = <T extends TimeTrialRecord | ArcadeRecord>(stored: T | undefined, selection: RecordSelection) =>
  stored && stored.courseSha256 === selection.courseSha256 && stored.vehicleSha256 === selection.vehicleSha256
    ? stored
    : null;
const timeTrialRecord = (records: PlayerRecords, selection: RecordSelection, routeLinks: readonly string[]) =>
  identical(
    records.timeTrial[timeTrialRecordKey(selection.courseId, routeLinks, selection.lapCount, selection.vehicleId)],
    selection,
  );
const arcadeRecord = (
  records: PlayerRecords,
  selection: RecordSelection,
  rules: { readonly seriesId: string; readonly classId: string },
  goal: string,
) => identical(records.arcade[arcadeRecordKey(rules.seriesId, rules.classId, goal, selection.vehicleId)], selection);

/**
 * The record a run compares with while it is driven, from the records before it: on its route (TIME TRIAL; undefined
 * while the route is undecided) or at the course's one goal (ARCADE). Null when there is none, when its identities
 * differ from the selection's, on an ARCADE course with several goals, and in FREE PLAY.
 */
export function comparedRecord(
  records: PlayerRecords,
  selection: RecordSelection,
  routeLinks: readonly string[] | null,
): ComparedRecord | null | undefined {
  const { rules, goals } = selection;
  if (rules.mode === 'TIME_TRIAL') {
    if (routeLinks === null) return undefined;
    const stored = timeTrialRecord(records, selection, routeLinks);
    return stored && { timeMs: stored.timeMs, splitsMs: stored.splitsMs };
  }
  if (rules.mode !== 'ARCADE' || goals.length !== 1) return null;
  const stored = arcadeRecord(records, selection, rules, goals[0]!);
  return stored && { timeMs: stored.timeMs, splitsMs: null };
}

/**
 * Judge a run that reached GOAL against the records. TIME TRIAL records per course, route, laps and vehicle the fastest
 * time with that run's gate and lap crossings, and separately the fastest lap of any GOAL run; ARCADE records per
 * series, class, goal and vehicle the fastest time. Only a faster time replaces a record; a record whose identities
 * differ from the run's counts as none. FREE PLAY, and a TIME TRIAL whose route is undecided, record nothing (null).
 */
export function judgeRun(records: PlayerRecords, run: RecordedRun): RecordJudgement | null {
  const { rules } = run;
  const timeMs = raceMilliseconds(run.finishSeconds);
  const identity = { courseSha256: run.courseSha256, vehicleSha256: run.vehicleSha256 };
  if (rules.mode === 'ARCADE') {
    const key = arcadeRecordKey(rules.seriesId, rules.classId, run.goal, run.vehicleId);
    const previous = arcadeRecord(records, run, rules, run.goal);
    const newRecord = previous === null || timeMs < previous.timeMs;
    const record: ArcadeRecord = { timeMs, ...identity };
    return {
      previous: previous && { timeMs: previous.timeMs, bestLapMs: null },
      timeMs,
      newRecord,
      newBestLap: false,
      records: newRecord ? { ...records, arcade: { ...records.arcade, [key]: record } } : null,
    };
  }
  if (rules.mode !== 'TIME_TRIAL' || run.routeLinks === null) return null;
  const key = timeTrialRecordKey(run.courseId, run.routeLinks, run.lapCount, run.vehicleId);
  const previous = timeTrialRecord(records, run, run.routeLinks);
  const newRecord = previous === null || timeMs < previous.timeMs;
  const bestLapMs = run.bestLapSeconds === null ? null : raceMilliseconds(run.bestLapSeconds);
  const newBestLap =
    bestLapMs !== null && (previous === null || previous.bestLapMs === null || bestLapMs < previous.bestLapMs);
  const record: TimeTrialRecord = {
    timeMs: newRecord ? timeMs : previous!.timeMs,
    splitsMs: newRecord ? run.crossingSeconds.map(raceMilliseconds) : previous!.splitsMs,
    bestLapMs: newBestLap ? bestLapMs : (previous?.bestLapMs ?? null),
    ...identity,
  };
  return {
    previous: previous && { timeMs: previous.timeMs, bestLapMs: previous.bestLapMs },
    timeMs,
    newRecord,
    newBestLap,
    records: newRecord || newBestLap ? { ...records, timeTrial: { ...records.timeTrial, [key]: record } } : null,
  };
}
