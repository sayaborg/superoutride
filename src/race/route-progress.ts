import {
  routeCrossingFraction,
  type createRouteCrossSections,
  type RoutePosition,
  type RouteRaceLine,
} from './route-cross-sections.js';

export interface RouteRaceEvent {
  readonly landmark: RouteRaceLine['landmark'];
  readonly kind: RouteRaceLine['kind'];
  readonly lap: number;
  readonly u: number;
  readonly finish: boolean;
}
/**
 * Linear, branch and circuit races consume the same ordered route lines. A competitor joining at route station
 * `fromS` (one appearing ahead) awaits only the lines after it. Each step proposes the lines its motion crossed, in
 * route order, and accepts none: its owner accepts them one at a time, in that order, for as long as the race runs.
 */
export function createRouteProgress(
  lines: ReturnType<typeof createRouteCrossSections>,
  initial: RoutePosition,
  fromS = -Infinity,
) {
  let acceptedS = fromS;
  const state = {
    next: lines.after(acceptedS),
    s: initial.s,
    status: 'RUNNING' as 'RUNNING' | 'FINISHED',
    acceptedFinishCount: 0,
  };
  let indexed = lines.race;
  // The open step's crossing candidates and their lines, and how many of them were accepted.
  const candidates: RouteRaceEvent[] = [];
  const crossed: RouteRaceLine[] = [];
  let accepted = 0;
  return Object.freeze({
    state,
    /** The step from `previous` to `current`: the lines it crossed, in route order, as candidates. */
    crossings(previous: RoutePosition, current: RoutePosition, recovered: boolean): readonly RouteRaceEvent[] {
      candidates.length = crossed.length = accepted = 0;
      if (state.status === 'FINISHED') return candidates;
      state.s = current.s;
      if (indexed !== lines.race) {
        indexed = lines.race;
        const next = lines.after(acceptedS);
        // Refresh a line's domain after extension; a missed line stays required.
        if (!state.next || next?.s === state.next.s) state.next = next;
      }
      if (recovered) return candidates;
      for (let line = state.next; line; line = lines.after(line.s)) {
        const u = routeCrossingFraction(line, previous, current);
        if (u === null) break;
        candidates.push(
          Object.freeze({ landmark: line.landmark, kind: line.kind, lap: line.lap, u, finish: line.finish }),
        );
        crossed.push(line);
        if (line.finish) break;
      }
      return candidates;
    },
    /** Accept the open step's next candidate; true when it is the completing FINISH. */
    accept(): boolean {
      const line = crossed[accepted++];
      if (!line) throw new Error('No crossing candidate left to accept');
      acceptedS = line.s;
      if (line.kind === 'finish') state.acceptedFinishCount += 1;
      state.next = lines.after(acceptedS);
      if (!line.finish) return false;
      state.status = 'FINISHED';
      state.s = line.s;
      state.next = null;
      return true;
    },
    resync(current: RoutePosition) {
      if (state.status === 'RUNNING') state.s = current.s;
    },
  });
}
