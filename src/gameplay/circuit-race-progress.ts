import type { GuidePath } from '../core/guide-curve.js';
import type { Vec2 } from '../core/math.js';
import { nonEmptyId, positiveInteger } from '../core/validation.js';
import {
  compileOrderedRaceCourseRules,
  createOrderedRaceProgressState,
  resyncOrderedRaceProgress,
  updateOrderedRaceProgress,
  type OrderedRaceProgressState,
} from './ordered-race-progress.js';

interface CircuitRaceAuthoring {
  readonly id: string;
  readonly lapCount: number;
  readonly entryS: number;
  readonly finishS: number;
  readonly checkpointChainages: readonly number[];
}

/** One source lap, one ordered gate set, and a finite required count. No geometry copies. */
export function compileCircuitRaceRules(guide: GuidePath, authoring: CircuitRaceAuthoring) {
  nonEmptyId(authoring.id, 'circuit race id');
  positiveInteger(authoring.lapCount, 'circuit race lapCount');
  const { entryS, finishS } = authoring;
  if (
    !Number.isFinite(entryS) ||
    !Number.isFinite(finishS) ||
    entryS < 0 ||
    finishS <= entryS ||
    finishS >= guide.length
  )
    throw new RangeError('circuit entry and finish require 0 <= entry < finish < source length');
  if (
    !authoring.checkpointChainages.length ||
    authoring.checkpointChainages.some((s) => !Number.isFinite(s) || s <= entryS || s >= finishS)
  )
    throw new RangeError('circuit needs checkpoints strictly between entry and finish');
  const lap = compileOrderedRaceCourseRules(guide, [
    ...authoring.checkpointChainages.map((s, i) => ({ kind: 'checkpoint' as const, name: `CP${i + 1}`, s })),
    { kind: 'finish', name: 'LAP', s: finishS },
  ]);
  return Object.freeze({ id: authoring.id, lapCount: authoring.lapCount, entryS, lapLength: finishS - entryS, lap });
}

type CircuitRaceRules = ReturnType<typeof compileCircuitRaceRules>;
interface Sample extends Vec2 {
  readonly s: number;
}
interface CircuitRaceProgressState {
  lap: OrderedRaceProgressState;
  status: 'RUNNING' | 'FINISHED';
  acceptedFinishCount: number;
  validatedProgressFloor: number;
  sProgress: number;
}

export function createCircuitRaceProgressState(rules: CircuitRaceRules, initial: Sample): CircuitRaceProgressState {
  return {
    lap: createOrderedRaceProgressState(rules.lap, initial),
    status: 'RUNNING',
    acceptedFinishCount: 0,
    validatedProgressFloor: 0,
    sProgress: Math.max(0, initial.s - rules.entryS),
  };
}

/** Source-frame world motion alone validates gates. Occurrence identity never supplies lap credit. */
export function updateCircuitRaceProgress(state: CircuitRaceProgressState, rules: CircuitRaceRules, current: Sample) {
  const update = updateOrderedRaceProgress(state.lap, rules.lap, current);
  const justFinishedLap = update.justFinished;
  if (justFinishedLap) state.acceptedFinishCount += 1;
  if (state.acceptedFinishCount >= rules.lapCount) state.status = 'FINISHED';
  const complete = state.lap.status === 'FINISHED';
  const base = (state.acceptedFinishCount - (complete ? 1 : 0)) * rules.lapLength;
  state.validatedProgressFloor = base + Math.max(0, state.lap.validatedProgressFloor - rules.entryS);
  state.sProgress = base + Math.max(0, state.lap.sProgress - rules.entryS);
  return { ...update, status: state.status, justFinished: justFinishedLap && state.status === 'FINISHED' };
}

/** Frame change, recovery or replacement resets observations while preserving all accepted gates. */
export function resyncCircuitRaceProgress(
  state: CircuitRaceProgressState,
  rules: CircuitRaceRules,
  current: Sample,
): void {
  if (state.status === 'RUNNING' && state.lap.status === 'FINISHED' && current.s <= rules.lap.gates[0]!.s) {
    state.lap = createOrderedRaceProgressState(rules.lap, current);
    // A new source observation cannot credit the displacement of a recovery or frame reset.
    state.lap.sProgress = rules.entryS;
  } else resyncOrderedRaceProgress(state.lap, rules.lap, current);
}
