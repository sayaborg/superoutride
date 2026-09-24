import {
  routeCrossingFraction,
  type createRouteCrossSections,
  type RoutePosition,
  type RouteRaceLine,
} from './route-cross-sections.js';

export interface RouteRaceEvent {
  readonly landmark: RouteRaceLine['landmark'];
  readonly lap: number;
  readonly u: number;
  readonly finish: boolean;
}
export type RouteRaceAdmission = (event: RouteRaceEvent) => boolean;

/** Linear, branch and circuit races consume the same ordered route lines. */
export function createRouteProgress(lines: ReturnType<typeof createRouteCrossSections>, initial: RoutePosition) {
  let acceptedS = -Infinity;
  const state = {
    next: lines.after(acceptedS),
    s: initial.s,
    status: 'RUNNING' as 'RUNNING' | 'FINISHED',
    acceptedFinishCount: 0,
  };
  let indexed = lines.race;
  const events: RouteRaceEvent[] = [];
  const result = { justFinished: false, events };
  const observation = { landmark: null! as RouteRaceLine['landmark'], lap: 0, u: 0, finish: false };
  return Object.freeze({
    state,
    update(previous: RoutePosition, current: RoutePosition, recovered: boolean, admit?: RouteRaceAdmission) {
      events.length = 0;
      result.justFinished = false;
      if (state.status === 'FINISHED') return result;
      state.s = current.s;
      if (indexed !== lines.race) {
        indexed = lines.race;
        const next = lines.after(acceptedS);
        // Refresh a retained line's domain after extension; pruning cannot forgive a missed line.
        if (!state.next || next?.s === state.next.s) state.next = next;
      }
      if (recovered) return result;
      while (state.next) {
        const line = state.next;
        const u = routeCrossingFraction(line, previous, current);
        if (u === null) break;
        observation.landmark = line.landmark;
        observation.lap = line.lap;
        observation.u = u;
        observation.finish = line.finish;
        if (admit && !admit(observation)) break;
        events.push({ ...observation });
        acceptedS = line.s;
        if (line.kind === 'finish') state.acceptedFinishCount += 1;
        state.next = lines.after(acceptedS);
        if (line.finish) {
          state.status = 'FINISHED';
          state.s = line.s;
          state.next = null;
          result.justFinished = true;
          break;
        }
      }
      return result;
    },
    resync(current: RoutePosition) {
      if (state.status === 'RUNNING') state.s = current.s;
    },
  });
}
