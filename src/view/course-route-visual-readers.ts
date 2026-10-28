import type { CompiledSection } from '../course/compiler/course-graph.js';
import type { RouteWindow } from '../course/course-route.js';
import { routeS, routeSectionS, sectionTurn } from '../course/course-route.js';
import { wrapAngle } from '../core/math.js';
import { stationIndexAt } from '../course/geometry/station-sequence.js';
import { transformPlanarPoint } from '../core/planar-transform.js';
import { createStripGroundSampler, type StripGroundReader } from './strip-ground-sampler.js';
import { createCourseRenderResources } from './course-render-resources.js';
import { courseBoundaryAt } from '../course/course-boundaries.js';
import type { RouteWall } from './course-wall.js';
import type { RouteEnvironment } from './background-transition.js';
import type { CourseSprite } from './course-sprite.js';

/** Visual content over the same route ruler as the physical readers. Derived lists change with the route. */
export function createCourseRouteVisualReaders(route: RouteWindow) {
  const resources = createCourseRenderResources();
  const sections = new Map<CompiledSection, ReturnType<typeof resources.createSectionReaders>>();
  // The solid body of a Section's movable placement, found by its placement index.
  const movableBody = (section: CompiledSection, index: number) => {
    const body = section.objects.find((object) => object.sprite === index && object.movable);
    if (!body) throw new Error(`Placement ${index} of Section ${section.id} has no movable body`);
    return body;
  };
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
        // Each yaw origin in the Route's continued frame, as the Route first entered the Section: the same on every lap.
        backgrounds: native.backgrounds.map((background) =>
          Object.freeze({
            ...background,
            yawOriginRadians:
              background.yawOriginRadians +
              occurrence.heading -
              occurrence.repeatTurn -
              occurrence.section.segments[0]!.start.heading,
          }),
        ),
      };
    });
    // Each occurrence's environment intervals on the route ruler: the background, where its knot lies and how it
    // arrives, identified by the occurrence and the interval's index.
    const environments = new Map(
      mapped.map(({ occurrence, native, backgrounds }) => [
        occurrence,
        native.environment.intervals.map((interval, index) =>
          Object.freeze({
            occurrence,
            index,
            start: routeS(occurrence, interval.sStart),
            background: backgrounds[index]!,
            arrival: native.backgrounds[index]!.arrival,
          }),
        ),
      ]),
    );
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
      sampleSpan(pixels, offset, count, s, l, stepL, deltaS, stats, shade) {
        // Outside the Route there is no ground: the row keeps the Painter image beneath it.
        if (!route.at(s)) return;
        sampler.sampleSpan(pixels, offset, count, s, l, stepL, deltaS, stats, shade);
      },
    };
    Object.freeze(ground);
    const placements = mapped.flatMap(({ occurrence, native }) =>
      native.sprites
        .map((entry, index) => ({ ...entry, index }))
        .filter(({ sprite }) => route.at(routeS(occurrence, sprite.sRender)) === occurrence)
        .map(({ sprite, unselectedLink, knocked, index }) => {
          const place = {
            ...transformPlanarPoint(occurrence.worldFromSection, sprite),
            sRender: routeS(occurrence, sprite.sRender),
          };
          const positioned: CourseSprite = Object.freeze({ ...sprite, ...place });
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
      // Movable placements stand until the race knocks them; the scene shows each by its Section and placement index,
      // with its body's square footprint (route station and lateral, and its width) for its shadow.
      movableSprites: Object.freeze(
        placements
          .filter((p) => p.movable)
          .map((p) => {
            const body = movableBody(p.occurrence.section, p.index);
            return {
              section: p.occurrence.section,
              index: p.index,
              sprite: p.sprite,
              footprint: Object.freeze({
                s: routeS(p.occurrence, body.s),
                l: body.l - p.occurrence.lateralOrigin,
                side: body.width,
              }),
            };
          }),
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
      /** The body of the movable placement at `index` of a Section. */
      movableBody,
      /**
       * The sky's yaw for a camera at yaw `yaw` following route station `s`: the road's heading there continued along
       * the Route (across ±180°, Sections and laps) and the camera's turn from the road, so a sky moves only as the
       * camera turns.
       */
      skyYawAt(s: number, yaw: number): number {
        const occurrence = route.at(s) ?? (s < route.start ? occurrences[0]! : occurrences.at(-1)!);
        const u = Math.min(Math.max(routeSectionS(occurrence, s), 0), occurrence.section.coordinates.domain.end);
        const road = occurrence.heading + sectionTurn(occurrence.section, u);
        return road + wrapAngle(yaw - road);
      },
      /** The environment interval at route station `s`: its background, its knot's route station and its arrival. */
      environmentAt(s: number): RouteEnvironment {
        const occurrence = route.at(s) ?? (s < route.start ? occurrences[0]! : occurrences.at(-1)!);
        const mappedSection = mappedByOccurrence.get(occurrence)!;
        const index = stationIndexAt(
          mappedSection.native.environment.intervals,
          'sStart',
          routeSectionS(occurrence, s),
        );
        return environments.get(occurrence)![index]!;
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
