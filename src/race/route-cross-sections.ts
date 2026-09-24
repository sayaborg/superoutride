import type { CompiledCourse } from '../course/compiler/compiled-course.js';
import type { CompiledCourseLandmark } from '../course/compiler/course-rules.js';
import { routeS, routeSectionS, type CourseRoute, type RouteOccurrence } from '../course/course-route.js';

export interface RouteCrossSection {
  readonly s: number;
  readonly left: number;
  readonly right: number;
  readonly occurrence: RouteOccurrence;
}

export interface RouteRaceLine extends RouteCrossSection {
  readonly landmark: CompiledCourseLandmark;
  readonly kind: 'checkpoint' | 'finish';
  readonly lap: number;
  readonly finish: boolean;
}

export interface RoutePosition {
  readonly s: number;
  readonly l: number;
}

/** Arrival owns a forward crossing. Width is the closed route coordinate domain at the line. */
export function routeCrossingFraction(
  line: RouteCrossSection,
  previous: RoutePosition,
  current: RoutePosition,
): number | null {
  if (!(previous.s < line.s && current.s >= line.s)) return null;
  const u = (line.s - previous.s) / (current.s - previous.s);
  const l = previous.l + u * (current.l - previous.l);
  return l >= line.left && l <= line.right ? u : null;
}

/** One shared index. Stable route stations survive list replacement and pruning. */
export function createRouteCrossSections(route: CourseRoute, course: CompiledCourse, lapCount: number) {
  const rules = new Map(course.rules!.intervals.map((interval) => [interval.section, interval]));
  let indexed: readonly RouteOccurrence[] = [];
  let race: readonly RouteRaceLine[] = [];
  let forks: readonly RouteCrossSection[] = [];
  const bounds = { left: 0, right: 0 };
  const line = (occurrence: RouteOccurrence, nativeS: number): RouteCrossSection => {
    const s = routeS(occurrence, nativeS);
    const owner = route.at(s)!;
    owner.section.coordinates.domain.lateralAt(routeSectionS(owner, s), bounds);
    return {
      s,
      left: bounds.left - owner.lateralOrigin,
      right: bounds.right - owner.lateralOrigin,
      occurrence,
    };
  };
  const sync = () => {
    if (indexed === route.occurrences) return;
    indexed = route.occurrences;
    const nextRace: RouteRaceLine[] = [],
      nextForks: RouteCrossSection[] = [];
    for (const occurrence of indexed) {
      const interval = rules.get(occurrence.section)!;
      const lap = course.type === 'CIRCUIT' ? occurrence.ordinal + 1 : 1;
      if (lap <= lapCount) {
        for (const landmark of interval.checkpoints)
          nextRace.push(
            Object.freeze({ ...line(occurrence, landmark.at.s), landmark, kind: 'checkpoint', lap, finish: false }),
          );
        if (interval.finish)
          nextRace.push(
            Object.freeze({
              ...line(occurrence, interval.finish.at.s),
              landmark: interval.finish,
              kind: 'finish',
              lap,
              finish: course.type !== 'CIRCUIT' || lap === lapCount,
            }),
          );
      }
      if (occurrence.section.fork) nextForks.push(Object.freeze(line(occurrence, occurrence.section.fork.lock.s)));
    }
    race = Object.freeze(nextRace);
    forks = Object.freeze(nextForks);
  };
  return Object.freeze({
    get race() {
      sync();
      return race;
    },
    get forks() {
      sync();
      return forks;
    },
    after(s: number): RouteRaceLine | null {
      sync();
      let lo = 0,
        hi = race.length;
      while (lo < hi) {
        const mid = (lo + hi) >>> 1;
        if (race[mid]!.s <= s) lo = mid + 1;
        else hi = mid;
      }
      return race[lo] ?? null;
    },
  });
}
