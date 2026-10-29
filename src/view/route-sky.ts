import type { RouteOccurrence, RouteWindow } from '../course/course-route.js';
import { routeS, routeSectionS, sectionTurn } from '../course/course-route.js';
import { wrapAngle } from '../core/math.js';
import { stationIndexAt } from '../course/geometry/station-sequence.js';
import type { RouteEnvironment, RouteSky } from './background-transition.js';
import type { TileBackground } from './tile-background.js';

/** A change of sky on the route ruler: from its knot, `length` metres, away from the background `from`. */
interface SkyChange {
  readonly start: number;
  readonly length: number;
  readonly from: TileBackground;
}
/** The background in force and the last change begun, as the Route enters or leaves an occurrence. */
interface SkyState {
  readonly inForce: TileBackground | null;
  readonly change: SkyChange | null;
}
/** The share of `change` made at route station `s`, in exact proportion from its knot; 1 outside it. */
const shareOf = (change: SkyChange | null, s: number) =>
  change && change.length > 0 ? Math.min(1, Math.max(0, (s - change.start) / change.length)) : 1;
/** An occurrence's environments on the route ruler, and its sky as the Route enters and leaves it. */
interface OccurrenceSky {
  readonly environments: readonly RouteEnvironment[];
  readonly entering: SkyState;
  readonly begun: readonly SkyChange[];
  readonly leaving: SkyState;
}

/**
 * The sky along a Route ([Image assets](../../docs/image-assets.md#background-transitions)), shared by the game's
 * readers and the course viewer. Each occurrence's sky is kept with it when first read (its predecessor then read
 * too), so that a change outlives the occurrence it began in when a window drops it.
 */
export function createRouteSkies() {
  const skies = new WeakMap<RouteOccurrence, OccurrenceSky>();
  return function read(route: Pick<RouteWindow, 'occurrences' | 'at' | 'start'>) {
    const occurrences = route.occurrences;
    let leaving: SkyState = { inForce: null, change: null };
    for (const occurrence of occurrences) {
      let sky = skies.get(occurrence);
      if (!sky) {
        // Each yaw origin in the Route's continued frame, as the Route first entered the Section: the same every lap.
        const turn = occurrence.heading - occurrence.repeatTurn - occurrence.section.segments[0]!.start.heading;
        const environments = occurrence.section.appearance.environments.map((e, index) =>
          Object.freeze({
            occurrence,
            index,
            start: routeS(occurrence, e.at.s),
            background: Object.freeze({
              image: e.background.asset.image,
              imageHorizonY: e.background.horizonY,
              yawOriginRadians: e.background.yawOriginRadians + turn,
            }),
            transition: e.transition,
          }),
        );
        // A knot whose picture is the one in force changes nothing, so a change runs on across a Section border into
        // a Section that begins with its picture.
        const begun: SkyChange[] = [];
        let state = leaving;
        for (const environment of environments) {
          const before = state.inForce;
          if (before && before.image !== environment.background.image)
            begun.push({ start: environment.start, length: environment.transition, from: before });
          state = { inForce: environment.background, change: begun.at(-1) ?? state.change };
        }
        sky = Object.freeze({ environments: Object.freeze(environments), entering: leaving, begun, leaving: state });
        skies.set(occurrence, sky);
      }
      leaving = sky.leaving;
    }
    const first = skies.get(occurrences[0]!)!.entering.change;
    const changes = [...(first ? [first] : []), ...occurrences.flatMap((occurrence) => skies.get(occurrence)!.begun)];
    const changeAt = (s: number) => {
      for (let i = changes.length - 1; i >= 0; i--) if (changes[i]!.start <= s) return changes[i]!;
      return null;
    };
    const occurrenceAt = (s: number) => route.at(s) ?? (s < route.start ? occurrences[0]! : occurrences.at(-1)!);
    const environmentAt = (s: number): RouteEnvironment => {
      const occurrence = occurrenceAt(s);
      const { environments } = skies.get(occurrence)!;
      return environments[
        stationIndexAt(
          occurrence.section.appearance.environments.map((e) => ({ s: e.at.s })),
          's',
          routeSectionS(occurrence, s),
        )
      ]!;
    };
    return Object.freeze({
      /** The environment interval at route station `s`: its background, its knot's route station and its change. */
      environmentAt,
      /**
       * The sky at route station `s`: the background in force, and within a change's interval the one before it with
       * the share of lines already changed, in exact proportion to `s` from the knot.
       */
      skyAt(s: number): RouteSky {
        const to = environmentAt(s).background;
        const change = changeAt(s);
        const p = shareOf(change, s);
        return p < 1 ? { from: change!.from, to, p } : { from: null, to, p: 1 };
      },
      /** The share of the change at route station `s` already made, 1 outside a change: the road's colors' too. */
      shareAt: (s: number) => shareOf(changeAt(s), s),
      /**
       * The sky's yaw for a camera at yaw `yaw` following route station `s`: the road's heading there continued along
       * the Route (across ±180°, Sections and laps) and the camera's turn from the road, so a sky moves only as the
       * camera turns.
       */
      skyYawAt(s: number, yaw: number): number {
        const occurrence = occurrenceAt(s);
        const u = Math.min(Math.max(routeSectionS(occurrence, s), 0), occurrence.section.coordinates.domain.end);
        const road = occurrence.heading + sectionTurn(occurrence.section, u);
        return road + wrapAngle(yaw - road);
      },
    });
  };
}
