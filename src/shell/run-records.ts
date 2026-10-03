import type { RunRequest } from './run-request.js';
import {
  arcadeRecordKey,
  timeTrialRecordKey,
  type ArcadeRecord,
  type PlayerRecords,
  type TimeTrialRecord,
} from './player-record.js';
import { raceMilliseconds, type RecordOutcome } from './race-status-hud.js';

/** What a run records against before it is driven: its rules and its identities. */
export interface RecordSelection {
  readonly mode: RunRequest['mode'];
  readonly courseId: string;
  /** The ARCADE series; null in other modes. */
  readonly seriesId: string | null;
  readonly vehicleId: string;
  readonly lapCount: number;
  readonly courseSha256: string;
  readonly vehicleSha256: string;
}

/** A run that reached GOAL: its selection and the race's facts at GOAL. */
export interface RecordedRun extends RecordSelection {
  /** The route taken (`race.routeLinks`). */
  readonly routeLinks: readonly string[] | null;
  /** The FINISH gate reached. */
  readonly goal: string;
  readonly finishSeconds: number;
  readonly crossingSeconds: readonly number[];
  readonly bestLapSeconds: number | null;
}

/** The one judgement of a run against the records: what RESULT shows and what is saved. */
export interface RecordJudgement extends RecordOutcome {
  readonly timeMs: number;
  /** The records to save; null when nothing changes. */
  readonly records: PlayerRecords | null;
}

/**
 * The record a selection compares against on a route (TIME TRIAL) or at a goal (ARCADE): null when there is none,
 * when its identities differ from the selection's, when the route or goal is undecided (null), and in FREE PLAY.
 */
export function storedRecord(
  records: PlayerRecords,
  selection: RecordSelection,
  routeLinks: readonly string[] | null,
  goal: string | null,
): TimeTrialRecord | ArcadeRecord | null {
  const key = recordKey(selection, routeLinks, goal);
  const stored = key && (key.table === 'timeTrial' ? records.timeTrial : records.arcade)[key.key];
  return stored && stored.courseSha256 === selection.courseSha256 && stored.vehicleSha256 === selection.vehicleSha256
    ? stored
    : null;
}

function recordKey(selection: RecordSelection, routeLinks: readonly string[] | null, goal: string | null) {
  const { mode, seriesId, courseId, vehicleId, lapCount } = selection;
  if (mode === 'ARCADE' && seriesId !== null && goal !== null)
    return { table: 'arcade', key: arcadeRecordKey(seriesId, courseId, goal, vehicleId) } as const;
  if (mode === 'TIME_TRIAL' && routeLinks !== null)
    return { table: 'timeTrial', key: timeTrialRecordKey(courseId, routeLinks, lapCount, vehicleId) } as const;
  return null;
}

/**
 * Judge a run that reached GOAL against the records. TIME TRIAL records per course, route, laps and vehicle the fastest
 * time with that run's gate and lap crossings, and separately the fastest lap of any GOAL run; ARCADE records per
 * series, course, goal and vehicle the fastest time. Only a faster time replaces a record; a record whose identities
 * differ from the run's counts as none. FREE PLAY, and a TIME TRIAL whose route is undecided, record nothing (null).
 */
export function judgeRun(records: PlayerRecords, run: RecordedRun): RecordJudgement | null {
  const key = recordKey(run, run.routeLinks, run.goal);
  if (!key) return null;
  const timeMs = raceMilliseconds(run.finishSeconds);
  const identity = { courseSha256: run.courseSha256, vehicleSha256: run.vehicleSha256 };
  if (key.table === 'arcade') {
    const previous = storedRecord(records, run, null, run.goal) as ArcadeRecord | null;
    const newRecord = previous === null || timeMs < previous.timeMs;
    const record: ArcadeRecord = { timeMs, ...identity };
    return {
      previous: previous && { timeMs: previous.timeMs, bestLapMs: null },
      timeMs,
      newRecord,
      newBestLap: false,
      records: newRecord ? { ...records, arcade: { ...records.arcade, [key.key]: record } } : null,
    };
  }
  const previous = storedRecord(records, run, run.routeLinks, null) as TimeTrialRecord | null;
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
    records: newRecord || newBestLap ? { ...records, timeTrial: { ...records.timeTrial, [key.key]: record } } : null,
  };
}
