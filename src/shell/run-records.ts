import { arcadeRecordKey, type ArcadeRecord, type PlayerRecords } from './player-record.js';
import { raceMilliseconds } from './race-time.js';

/** What a run records against before it is driven: ARCADE's records in its class, and its identities. */
export interface RecordSelection {
  readonly rules:
    | { readonly mode: 'ARCADE'; readonly seriesId: string; readonly classId: string }
    | { readonly mode: 'TIME_ATTACK' | 'FREE_PLAY' };
  readonly vehicleId: string;
  readonly courseSha256: string;
  readonly vehicleSha256: string;
  /** The course's FINISH gates: an ARCADE goal is known before driving only on a course with one. */
  readonly goals: readonly string[];
}

/** A run that reached GOAL: its selection and the race's facts at GOAL. */
export interface RecordedRun extends RecordSelection {
  /** The FINISH gate reached. */
  readonly goal: string;
  /** The run's ending race time (`race.outcome.endSeconds`). */
  readonly finishSeconds: number;
}

/** A run's standing against the record it was judged against, as RESULT shows it. */
export interface RecordOutcome {
  /** The record before the run; null when none, or when its identities differ from the run's. */
  readonly previous: { readonly timeMs: number } | null;
  readonly newRecord: boolean;
}

/** The one judgement of a run against the records: what RESULT shows and what is saved. */
export interface RecordJudgement extends RecordOutcome {
  readonly timeMs: number;
  /** The records to save; null when nothing changes. */
  readonly records: PlayerRecords | null;
}

/** The record a run compares with while driven: its time and its gate and lap crossings, when it keeps them. */
export interface ComparedRecord {
  readonly timeMs: number;
  readonly splitsMs: readonly number[] | null;
}

// A stored record counts only while its identities are the selection's.
const identical = (stored: ArcadeRecord | undefined, selection: RecordSelection) =>
  stored && stored.courseSha256 === selection.courseSha256 && stored.vehicleSha256 === selection.vehicleSha256
    ? stored
    : null;
const arcadeRecord = (
  records: PlayerRecords,
  selection: RecordSelection,
  rules: { readonly seriesId: string; readonly classId: string },
  goal: string,
) => identical(records.arcade[arcadeRecordKey(rules.seriesId, rules.classId, goal, selection.vehicleId)], selection);

/**
 * The record a run compares with while it is driven, from the records before it: ARCADE's at the course's one goal.
 * Null when there is none, when its identities differ from the selection's, on a course with several goals, and in
 * the other modes.
 */
export function comparedRecord(records: PlayerRecords, selection: RecordSelection): ComparedRecord | null {
  const { rules, goals } = selection;
  if (rules.mode !== 'ARCADE' || goals.length !== 1) return null;
  const stored = arcadeRecord(records, selection, rules, goals[0]!);
  return stored && { timeMs: stored.timeMs, splitsMs: null };
}

/**
 * Judge a run that reached GOAL against the records: ARCADE records per series, class, goal and vehicle the fastest
 * time. Only a faster time replaces a record; a record whose identities differ from the run's counts as none. The other
 * modes record nothing (null).
 */
export function judgeRun(records: PlayerRecords, run: RecordedRun): RecordJudgement | null {
  const { rules } = run;
  if (rules.mode !== 'ARCADE') return null;
  const timeMs = raceMilliseconds(run.finishSeconds);
  const key = arcadeRecordKey(rules.seriesId, rules.classId, run.goal, run.vehicleId);
  const previous = arcadeRecord(records, run, rules, run.goal);
  const newRecord = previous === null || timeMs < previous.timeMs;
  const record: ArcadeRecord = { timeMs, courseSha256: run.courseSha256, vehicleSha256: run.vehicleSha256 };
  return {
    previous: previous && { timeMs: previous.timeMs },
    timeMs,
    newRecord,
    records: newRecord ? { ...records, arcade: { ...records.arcade, [key]: record } } : null,
  };
}

/**
 * A class's best ARCADE time, in whole milliseconds, over the given vehicles (catalog ID to vehicle identity) at any of
 * its course's goals: the records SELECT CLASS shows, counted only while their identities are current. Null when none.
 */
export function classBestMilliseconds(
  records: PlayerRecords,
  seriesId: string,
  classId: string,
  courseSha256: string,
  vehicles: ReadonlyMap<string, string>,
): number | null {
  let best: number | null = null;
  for (const [key, record] of Object.entries(records.arcade)) {
    const [series, classKey, , vehicleId] = JSON.parse(key) as [string, string, string, string];
    if (series !== seriesId || classKey !== classId) continue;
    if (record.courseSha256 !== courseSha256 || record.vehicleSha256 !== vehicles.get(vehicleId)) continue;
    if (best === null || record.timeMs < best) best = record.timeMs;
  }
  return best;
}
