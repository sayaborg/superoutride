import type { CourseGround } from '../course/compiler/course-ground.js';
import type { CompiledSection } from '../course/compiler/course-graph.js';
import type { CourseRoute } from '../course/course-route.js';
import { routeS, routeSectionS } from '../course/course-route.js';
import { knotIndexAt } from '../course/geometry/knot-sequence.js';
import { transformPlanarPoint } from '../core/planar-transform.js';
import { createBandGroundSampler } from './band-ground-sampler.js';
import { createCourseRenderResources } from './course-render-resources.js';
import type { BandGroundReader } from './renderer.js';

/** Visual content over the same route ruler as the physical readers. Derived lists change with the route. */
export function createCourseRouteVisualReaders(route: CourseRoute, fields: CourseGround) {
  const resources = createCourseRenderResources();
  const sections = new Map<CompiledSection, ReturnType<typeof resources.createSectionReaders>>();
  const sectionReaders = (section: CompiledSection) => {
    let readers = sections.get(section);
    if (!readers) {
      if (!section.presentation) throw new Error('Driving Section requires compiled appearance');
      readers = resources.createSectionReaders(
        section.presentation,
        { length: section.raster.length, raster: section.raster },
        section.height,
        section.renderHeight,
      );
      sections.set(section, readers);
    }
    return readers;
  };
  let indexed: CourseRoute['occurrences'] | null = null;
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
            yawOriginRadians:
              background.yawOriginRadians +
              Math.atan2(occurrence.worldFromSection.sine, occurrence.worldFromSection.cosine),
          }),
        ),
      };
    });
    const mappedByOccurrence = new Map(mapped.map((item) => [item.occurrence, item]));
    const visualSections = mapped.flatMap(({ occurrence, native }) => {
      const nativeEnd = routeSectionS(occurrence, occurrence.end);
      return [
        native.visual.sample(occurrence.nativeStart),
        ...native.visual.sections.filter(
          (section) => section.sStart > occurrence.nativeStart && section.sStart < nativeEnd,
        ),
      ].map((section) =>
        Object.freeze({ ...section, sStart: routeS(occurrence, Math.max(section.sStart, occurrence.nativeStart)) }),
      );
    });
    const visual = Object.freeze({
      get courseLength() {
        return route.end;
      },
      sections: Object.freeze(visualSections),
      sample(s: number) {
        return route.at(s) ? visualSections[knotIndexAt(visualSections, 'sStart', s)]! : null;
      },
      distanceToNextSection(s: number) {
        if (!route.at(s)) return Infinity;
        const index = knotIndexAt(visualSections, 'sStart', s);
        return (visualSections[index + 1]?.sStart ?? route.end) - s;
      },
    });
    const sampler = createBandGroundSampler(
      occurrences.map((occurrence) => ({
        ground: fields.forSection(occurrence.section),
        frameStart: occurrence.start,
        nativeStart: occurrence.nativeStart,
        nativeEnd: routeSectionS(occurrence, occurrence.end),
        lateralOrigin: occurrence.lateralOrigin,
      })),
    );
    const ground: BandGroundReader = {
      kind: 'bands',
      sampleSpan(pixels, offset, count, s, l, stepL, deltaS, method, stats) {
        if (!route.at(s)) {
          pixels.fill(0, offset, offset + count);
          return;
        }
        sampler.sampleSpan(pixels, offset, count, s, l, stepL, deltaS, method, stats);
      },
    };
    Object.freeze(ground);
    const placements = mapped.flatMap(({ occurrence, native }) =>
      native.sprites
        .filter(({ sprite }) => route.at(routeS(occurrence, sprite.sRender)) === occurrence)
        .map(({ sprite, unselected }) => {
          const positioned = Object.freeze({
            ...sprite,
            ...transformPlanarPoint(occurrence.worldFromSection, sprite),
            sRender: routeS(occurrence, sprite.sRender),
          });
          return { sprite: positioned, unselected };
        }),
    );
    return Object.freeze({
      ground,
      groundRuler: Object.freeze({ groundLeft: 1, groundRight: 1 }),
      visual,
      worldSprites: Object.freeze(placements.filter((p) => p.unselected === null).map((p) => p.sprite)),
      conditionalSprites: Object.freeze(
        placements.filter((p) => p.unselected !== null).map((p) => ({ unselected: p.unselected!, sprite: p.sprite })),
      ),
      backgroundAt(s: number) {
        const occurrence = route.at(s);
        if (!occurrence) return null;
        const mappedSection = mappedByOccurrence.get(occurrence)!;
        const index = knotIndexAt(mappedSection.native.visual.sections, 'sStart', routeSectionS(occurrence, s));
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
