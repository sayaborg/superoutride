import type { Vec2 } from '../core/math.js';
import {
  createOrderedRaceProgressState,
  resyncOrderedRaceProgress,
  updateOrderedRaceProgress,
  createOrderedRaceProgressWorkspace,
  type OrderedRaceProgressState,
} from './ordered-race-progress.js';

type CircuitRaceRules = {
  readonly id: string;
  readonly lapCount: number;
  readonly entryS: number;
  readonly lapLength: number;
  readonly lap: Parameters<typeof createOrderedRaceProgressState>[0];
};
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
export function updateCircuitRaceProgress(
  state: CircuitRaceProgressState,
  rules: CircuitRaceRules,
  current: Sample,
  accept?: Parameters<typeof updateOrderedRaceProgress>[3],
  workspace = createOrderedRaceProgressWorkspace(),
) {
  const update = updateOrderedRaceProgress(state.lap, rules.lap, current, accept, workspace);
  const justFinishedLap = update.justFinished;
  if (justFinishedLap) state.acceptedFinishCount += 1;
  if (state.acceptedFinishCount >= rules.lapCount) state.status = 'FINISHED';
  const complete = state.lap.status === 'FINISHED';
  const base = (state.acceptedFinishCount - (complete ? 1 : 0)) * rules.lapLength;
  state.validatedProgressFloor = base + Math.max(0, state.lap.validatedProgressFloor - rules.entryS);
  state.sProgress = base + Math.max(0, state.lap.sProgress - rules.entryS);
  workspace.update.status = state.status;
  workspace.update.justFinished = justFinishedLap && state.status === 'FINISHED';
  return workspace.update;
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
