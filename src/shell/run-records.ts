import type { RunRequest } from './run-request.js';
import {
  arcadeRecordKey,
  timeTrialRecordKey,
  type ArcadeRecord,
  type PlayerRecords,
  type TimeTrialRecord,
} from './player-record.js';
import { raceMilliseconds } from './race-status-hud.js';

/** What a finished run records against: its rules, its identities and the race's facts at GOAL. */
export interface RecordedRun {
  readonly mode: RunRequest['mode'];
  readonly courseId: string;
  /** The ARCADE series; null in other modes. */
  readonly seriesId: string | null;
  readonly vehicleId: string;
  readonly lapCount: number;
  /** The route taken (`race.routeLinks`). */
  readonly routeLinks: readonly string[] | null;
  /** The FINISH gate reached. */
  readonly goal: string;
  readonly finishSeconds: number;
  readonly crossingSeconds: readonly number[];
  readonly bestLapSeconds: number | null;
  readonly courseSha256: string;
  readonly vehicleSha256: string;
}

/** The one judgement of a run against the records: what RESULT shows and what is saved. */
export interface RecordJudgement {
  /** The record before the run; null when none, or when its identities differ from the run's. */
  readonly previous: { readonly timeMs: number; readonly bestLapMs: number | null } | null;
  readonly timeMs: number;
  readonly newRecord: boolean;
  /** TIME TRIAL on a CIRCUIT: the run's best lap beat the recorded one. */
  readonly newBestLap: boolean;
  /** The records to save; null when nothing changes. */
  readonly records: PlayerRecords | null;
}

const sameIdentity = (record: { courseSha256: string; vehicleSha256: string }, run: RecordedRun) =>
  record.courseSha256 === run.courseSha256 && record.vehicleSha256 === run.vehicleSha256;

/**
 * Judge a run that reached GOAL against the records. TIME TRIAL records per course, route, laps and vehicle the fastest
 * time with that run's gate and lap crossings, and separately the fastest lap of any GOAL run; ARCADE records per
 * series, course, goal and vehicle the fastest time. Only a faster time replaces a record; a record whose identities
 * differ from the run's counts as none. FREE PLAY, and a TIME TRIAL whose route is undecided, record nothing (null).
 */
export function judgeRun(records: PlayerRecords, run: RecordedRun): RecordJudgement | null {
  const timeMs = raceMilliseconds(run.finishSeconds);
  if (run.mode === 'ARCADE' && run.seriesId !== null) {
    const key = arcadeRecordKey(run.seriesId, run.courseId, run.goal, run.vehicleId);
    const stored = records.arcade[key];
    const previous = stored && sameIdentity(stored, run) ? stored : null;
    const newRecord = previous === null || timeMs < previous.timeMs;
    const record: ArcadeRecord = { timeMs, courseSha256: run.courseSha256, vehicleSha256: run.vehicleSha256 };
    return {
      previous: previous && { timeMs: previous.timeMs, bestLapMs: null },
      timeMs,
      newRecord,
      newBestLap: false,
      records: newRecord ? { ...records, arcade: { ...records.arcade, [key]: record } } : null,
    };
  }
  if (run.mode !== 'TIME_TRIAL' || run.routeLinks === null) return null;
  const key = timeTrialRecordKey(run.courseId, run.routeLinks, run.lapCount, run.vehicleId);
  const stored = records.timeTrial[key];
  const previous = stored && sameIdentity(stored, run) ? stored : null;
  const newRecord = previous === null || timeMs < previous.timeMs;
  const bestLapMs = run.bestLapSeconds === null ? null : raceMilliseconds(run.bestLapSeconds);
  const newBestLap =
    bestLapMs !== null && (previous === null || previous.bestLapMs === null || bestLapMs < previous.bestLapMs);
  const record: TimeTrialRecord = {
    timeMs: newRecord ? timeMs : previous!.timeMs,
    splitsMs: newRecord ? run.crossingSeconds.map(raceMilliseconds) : previous!.splitsMs,
    bestLapMs: newBestLap ? bestLapMs : (previous?.bestLapMs ?? null),
    courseSha256: run.courseSha256,
    vehicleSha256: run.vehicleSha256,
  };
  return {
    previous: previous && { timeMs: previous.timeMs, bestLapMs: previous.bestLapMs },
    timeMs,
    newRecord,
    newBestLap,
    records: newRecord || newBestLap ? { ...records, timeTrial: { ...records.timeTrial, [key]: record } } : null,
  };
}
