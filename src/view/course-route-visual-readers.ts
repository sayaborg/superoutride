import type { CompiledSection } from '../course/compiler/course-graph.js';
import type { RouteWindow } from '../course/course-route.js';
import { routeS, routeSectionS } from '../course/course-route.js';
import { stationIndexAt } from '../course/geometry/station-sequence.js';
import { transformPlanarPoint } from '../core/planar-transform.js';
import { createStripGroundSampler, type StripGroundReader } from './strip-ground-sampler.js';
import { createCourseRenderResources } from './course-render-resources.js';
import { courseBoundaryAt } from '../course/course-boundaries.js';
import type { RouteWall } from './course-wall.js';

/** Visual content over the same route ruler as the physical readers. Derived lists change with the route. */
export function createCourseRouteVisualReaders(route: RouteWindow) {
  const resources = createCourseRenderResources();
  const sections = new Map<CompiledSection, ReturnType<typeof resources.createSectionReaders>>();
  const sectionReaders = (section: CompiledSection) => {
    let readers = sections.get(section);
    if (!readers) {
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
    const sampler = createStripGroundSampler(
      occurrences.map((occurrence) => ({
        ground: occurrence.section.color,
        start: occurrence.start,
        end: occurrence.end,
        lateralOrigin: occurrence.lateralOrigin,
      })),
    );
    const ground: StripGroundReader = {
      sampleSpan(pixels, offset, count, s, l, stepL, deltaS, method, stats, shade) {
        // Outside the Route there is no ground: the row keeps the Painter image beneath it.
        if (!route.at(s)) return;
        sampler.sampleSpan(pixels, offset, count, s, l, stepL, deltaS, method, stats, shade);
      },
    };
    Object.freeze(ground);
    const placements = mapped.flatMap(({ occurrence, native }) =>
      native.sprites
        .map((entry, index) => ({ ...entry, index }))
        .filter(({ sprite }) => route.at(routeS(occurrence, sprite.sRender)) === occurrence)
        .map(({ sprite, unselectedLink, knocked, index }) => {
          const positioned = Object.freeze({
            ...sprite,
            ...transformPlanarPoint(occurrence.worldFromSection, sprite),
            sRender: routeS(occurrence, sprite.sRender),
          });
          return { occurrence, sprite: positioned, unselectedLink, movable: knocked !== null, index };
        }),
    );
    // Each occurrence's visible walls on the route ruler; the lateral reads the Boundary in its Section and the color
    // sampler reads the wall's Strips from its route start.
    const walls: RouteWall[] = occurrences.flatMap((occurrence) =>
      occurrence.section.appearance.walls.map((picture) => {
        const start = routeS(occurrence, picture.start),
          end = routeS(occurrence, picture.end);
        return Object.freeze({
          start,
          end,
          lateralAt: (s: number) =>
            courseBoundaryAt(picture.boundary, routeSectionS(occurrence, s)) - occurrence.lateralOrigin,
          bottom: picture.bottom,
          top: picture.top,
          color: createStripGroundSampler([{ ground: picture.color, start, end, lateralOrigin: 0 }]),
        });
      }),
    );
    return Object.freeze({
      ground,
      walls: Object.freeze(walls),
      worldSprites: Object.freeze(
        placements.filter((p) => p.unselectedLink === null && !p.movable).map((p) => p.sprite),
      ),
      // Movable placements stand until the race knocks them; the scene shows each by its Section and placement index.
      movableSprites: Object.freeze(
        placements
          .filter((p) => p.movable)
          .map((p) => ({ section: p.occurrence.section, index: p.index, sprite: p.sprite })),
      ),
      // State-selected signs keep their fork occurrence; the scene shows them from that occurrence's choice.
      conditionalSprites: Object.freeze(
        placements
          .filter((p) => p.unselectedLink !== null)
          .map((p) => ({
            occurrence: p.occurrence,
            unselectedLink: p.unselectedLink!,
            sprite: p.sprite,
          })),
      ),
      /** A movable placement's flying and landed pictures, by its Section and placement index. */
      knockedPictures(section: CompiledSection, index: number) {
        return sectionReaders(section).sprites[index]!.knocked!;
      },
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
