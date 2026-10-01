import type { CompiledSection } from '../course/compiler/course-graph.js';
import type { RouteWindow } from '../course/course-route.js';
import { routeS, routeSectionS } from '../course/course-route.js';
import { stationIndexAt } from '../course/geometry/station-sequence.js';
import { transformPlanarPoint } from '../core/planar-transform.js';
import { createStripGroundSampler } from './strip-ground-sampler.js';
import { createCourseRenderResources } from './course-render-resources.js';
import type { StripGroundReader } from './renderer.js';

/** Visual content over the same route ruler as the physical readers. Derived lists change with the route. */
export function createCourseRouteVisualReaders(route: RouteWindow) {
  const resources = createCourseRenderResources();
  const sections = new Map<CompiledSection, ReturnType<typeof resources.createSectionReaders>>();
  const sectionReaders = (section: CompiledSection) => {
    let readers = sections.get(section);
    if (!readers) {
      if (!section.appearance) throw new Error('Driving Section requires compiled appearance');
      readers = resources.createSectionReaders(section.appearance, section, section.height);
      sections.set(section, readers);
    }
    return readers;
  };
  let indexed: RouteWindow['occurrences'] | null = null;
  let snapshot: ReturnType<typeof build>;
  function build() {
    const occurrences = route.occurrences;
    const mapped = occurrences.map((occurrence) => {
      const native = sectionReaders(occurrence.section);
      return {
        occurrence,
        native,
        backgrounds: native.backgrounds.map((background) =>
          Object.freeze({
            ...background,
            yawOriginRadians: background.yawOriginRadians + occurrence.rotation,
          }),
        ),
      };
    });
    const mappedByOccurrence = new Map(mapped.map((item) => [item.occurrence, item]));
    const environmentIntervals = mapped.flatMap(({ occurrence, native }) => {
      const nativeEnd = routeSectionS(occurrence, occurrence.end);
      return [
        native.environment.sample(0),
        ...native.environment.intervals.filter((interval) => interval.sStart > 0 && interval.sStart < nativeEnd),
      ].map((interval) => Object.freeze({ ...interval, sStart: routeS(occurrence, Math.max(interval.sStart, 0)) }));
    });
    const environment = Object.freeze({
      intervals: Object.freeze(environmentIntervals),
      sample(s: number) {
        return environmentIntervals[stationIndexAt(environmentIntervals, 'sStart', s)]!;
      },
      distanceToNextInterval(s: number) {
        if (!route.at(s)) return Infinity;
        const index = stationIndexAt(environmentIntervals, 'sStart', s);
        return (environmentIntervals[index + 1]?.sStart ?? route.end) - s;
      },
    });
    const sampler = createStripGroundSampler(
      occurrences.map((occurrence) => ({
        ground: occurrence.section.color,
        start: occurrence.start,
        end: occurrence.end,
        lateralOrigin: occurrence.lateralOrigin,
      })),
    );
    const ground: StripGroundReader = {
      sampleSpan(pixels, offset, count, s, l, stepL, deltaS, method, stats) {
        // Outside the Route there is no ground: the row keeps the Painter image beneath it.
        if (!route.at(s)) return;
        sampler.sampleSpan(pixels, offset, count, s, l, stepL, deltaS, method, stats);
      },
    };
    Object.freeze(ground);
    const placements = mapped.flatMap(({ occurrence, native }) =>
      native.sprites
        .filter(({ sprite }) => route.at(routeS(occurrence, sprite.sRender)) === occurrence)
        .map(({ sprite, unselectedCarriagewayId }) => {
          const positioned = Object.freeze({
            ...sprite,
            ...transformPlanarPoint(occurrence.worldFromSection, sprite),
            sRender: routeS(occurrence, sprite.sRender),
          });
          return { occurrence, sprite: positioned, unselectedCarriagewayId };
        }),
    );
    return Object.freeze({
      ground,
      environment,
      worldSprites: Object.freeze(placements.filter((p) => p.unselectedCarriagewayId === null).map((p) => p.sprite)),
      // State-selected signs keep their fork occurrence; the scene shows them from that occurrence's choice.
      conditionalSprites: Object.freeze(
        placements
          .filter((p) => p.unselectedCarriagewayId !== null)
          .map((p) => ({
            occurrence: p.occurrence,
            unselectedCarriagewayId: p.unselectedCarriagewayId!,
            sprite: p.sprite,
          })),
      ),
      backgroundAt(s: number) {
        const occurrence = route.at(s) ?? (s < route.start ? occurrences[0]! : occurrences.at(-1)!);
        const mappedSection = mappedByOccurrence.get(occurrence)!;
        const index = stationIndexAt(
          mappedSection.native.environment.intervals,
          'sStart',
          routeSectionS(occurrence, s),
        );
        return mappedSection.backgrounds[index]!;
      },
    });
  }
  return Object.freeze({
    read() {
      if (indexed !== route.occurrences) {
        snapshot = build();
        indexed = route.occurrences;
      }
      return snapshot;
    },
  });
}
