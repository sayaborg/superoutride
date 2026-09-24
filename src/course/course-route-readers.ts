import { wrapAngle, type Vec2 } from '../core/math.js';
import type { Writable } from '../core/writable.js';
import { SURFACE_MATERIALS } from './surface-material.js';
import { createRegionSurfaceReader } from './region-surface-reader.js';
import {
  PLAN_PROJECTION_WINDOW_METERS,
  type PlanCoordinateMetrics,
  type PlanCoordinateProjection,
  type PlanCoordinateSample,
  type PlanLateralBounds,
  type PlanProjectionWorkspace,
} from './geometry/plan-coordinate.js';
import type { CompiledSection } from './compiler/course-graph.js';
import { rasterPathToWorld } from './geometry/raster-path.js';
import { routeS, routeSectionS, type CourseRoute, type RouteOccurrence } from './course-route.js';

/** An inverted closed interval represents the empty coordinate domain. */
export const EMPTY_ROUTE_DOMAIN = Object.freeze({ left: Infinity, right: -Infinity });

/** The route has no material outside its coordinate domain. */
export const ROUTE_OUTSIDE_SURFACE = Object.freeze({
  sectionName: 'OUTSIDE',
  type: SURFACE_MATERIALS.VOID.type,
  material: SURFACE_MATERIALS.VOID,
});

/** Route readers share Section lookup and conversion; their derived indexes change only with the route. */
export function createCourseRouteReaders(route: CourseRoute) {
  const surfaces = new Map<CompiledSection, ReturnType<typeof createRegionSurfaceReader>>();
  const native = { x: 0, z: 0, s: 0, l: 0, heading: 0 };
  const rasterSample = { x: 0, z: 0, s: 0, l: 0, heading: 0, segmentIndex: 0 };
  const bounds = { left: 0, right: 0 };
  const endpoint = { x: 0, z: 0, s: 0, l: 0, heading: 0 };
  function extend(out: PlanCoordinateSample, s: number, l: number, end: number) {
    const tx = Math.sin(out.heading),
      tz = Math.cos(out.heading);
    out.x += (s - end) * tx + l * tz;
    out.z += (s - end) * tz - l * tx;
    out.s = s;
    out.l = l;
  }
  let indexed: readonly RouteOccurrence[] = [];
  let candidates: readonly {
    readonly occurrence: RouteOccurrence;
    readonly start: number;
    readonly end: number;
    readonly native: ReturnType<CompiledSection['coordinates']['projectionCandidates']>[number];
  }[] = [];
  let rasterSegments: readonly { readonly sStart: number; readonly length: number; readonly heading: number }[] = [];
  let heightKnots: readonly { readonly s: number; readonly y: number; readonly curveLength: number }[] = [];
  let renderKnots: readonly { readonly s: number; readonly y: number }[] = [];
  const sync = () => {
    if (indexed === route.occurrences) return;
    indexed = route.occurrences;
    candidates = indexed.flatMap((occurrence) =>
      occurrence.section.coordinates
        .projectionCandidates(0, occurrence.section.coordinates.domain.end)
        .map((candidate) => ({
          occurrence,
          start: routeS(occurrence, candidate.start),
          end: routeS(occurrence, candidate.end),
          native: candidate,
        })),
    );
    rasterSegments = indexed.flatMap((occurrence) =>
      occurrence.section.raster.segments.flatMap((segment) => {
        const start = Math.max(0, segment.sStart);
        const end = Math.min(occurrence.section.coordinates.domain.end, segment.sStart + segment.length);
        return end > start
          ? [{ sStart: routeS(occurrence, start), length: end - start, heading: heading(occurrence, segment.heading) }]
          : [];
      }),
    );
    const profileKnots = indexed.flatMap((occurrence) =>
      occurrence.section.height.knots
        .filter((knot) => knot.s >= 0 && knot.s <= occurrence.section.coordinates.domain.end)
        .map((knot) => Object.freeze({ ...knot, s: routeS(occurrence, knot.s) })),
    );
    heightKnots = profileKnots.filter((knot, i) => i + 1 === profileKnots.length || knot.s !== profileKnots[i + 1]!.s);
    const displayKnots = indexed.flatMap((occurrence) => {
      const end = occurrence.section.coordinates.domain.end;
      return [
        0,
        ...occurrence.section.renderHeight.knots.map((knot) => knot.s).filter((s) => s > 0 && s < end),
        end,
      ].map((s) => Object.freeze({ s: routeS(occurrence, s), y: occurrence.section.renderHeight.sample(s).y }));
    });
    renderKnots = displayKnots.filter((knot, i) => i + 1 === displayKnots.length || knot.s !== displayKnots[i + 1]!.s);
  };
  const lookup = (s: number) => route.at(s);
  const heading = (occurrence: RouteOccurrence, sectionHeading: number) =>
    wrapAngle(sectionHeading + occurrence.rotation);
  const domain = Object.freeze({
    lateralAt,
  });
  const coordinates = Object.freeze({
    domain,
    forwardEnd(start: number, end: number, yaw: number) {
      const first = lookup(start);
      if (!first) return start;
      const occurrences = route.occurrences;
      for (let i = occurrences.indexOf(first); i < occurrences.length; i++) {
        const occurrence = occurrences[i]!;
        const a = Math.max(start, occurrence.start),
          b = Math.min(end, occurrence.end);
        if (b <= a) continue;
        const nativeEnd = occurrence.section.coordinates.forwardEnd(
          routeSectionS(occurrence, a),
          routeSectionS(occurrence, b),
          yaw - occurrence.rotation,
        );
        const result = routeS(occurrence, nativeEnd);
        if (result < b) return result;
        if (b === end) break;
      }
      return end;
    },
    toWorld(s: number, l: number, out: PlanCoordinateSample): PlanCoordinateSample {
      const occurrence = lookup(s);
      if (!occurrence) {
        const end = s < route.start ? route.start : route.end;
        coordinates.toWorld(end, 0, out);
        extend(out, s, l, end);
        return out;
      }
      occurrence.section.coordinates.toWorld(routeSectionS(occurrence, s), l + occurrence.lateralOrigin, native);
      const t = occurrence.worldFromSection;
      out.x = t.cosine * native.x + t.sine * native.z + t.translation.x;
      out.z = -t.sine * native.x + t.cosine * native.z + t.translation.z;
      out.s = s;
      out.l = l;
      out.heading = heading(occurrence, native.heading);
      return out;
    },
    metricsAt(s: number, l: number, out: Writable<PlanCoordinateMetrics>): PlanCoordinateMetrics {
      const occurrence = lookup(s);
      if (occurrence)
        return occurrence.section.coordinates.metricsAt(
          routeSectionS(occurrence, s),
          l + occurrence.lateralOrigin,
          out,
        );
      out.curvature = 0;
      out.offsetMetric = 1;
      return out;
    },
    locateLocal(
      world: Vec2,
      previousS: number,
      out: PlanCoordinateProjection,
      workspace: PlanProjectionWorkspace,
    ): PlanCoordinateProjection {
      sync();
      const from = previousS - PLAN_PROJECTION_WINDOW_METERS;
      const to = previousS + PLAN_PROJECTION_WINDOW_METERS;
      // Candidates are ordered by route chainage; binary search skips every earlier primitive.
      let lo = 0,
        hi = candidates.length;
      while (lo < hi) {
        const mid = (lo + hi) >>> 1;
        if (candidates[mid]!.end <= from) lo = mid + 1;
        else hi = mid;
      }
      let bestDistance = Infinity,
        bestInside = false,
        bestOwner = false,
        found = false;
      for (let i = lo; i < candidates.length; i += 1) {
        const candidate = candidates[i]!;
        if (candidate.start >= to) break;
        const a = Math.max(from, candidate.start),
          b = Math.min(to, candidate.end);
        if (!(b > a)) continue;
        const occurrence = candidate.occurrence,
          t = occurrence.sectionFromWorld;
        workspace.local.x = t.cosine * world.x + t.sine * world.z + t.translation.x;
        workspace.local.z = -t.sine * world.x + t.cosine * world.z + t.translation.z;
        candidate.native.project(
          workspace.local,
          Math.max(candidate.native.start, routeSectionS(occurrence, a)),
          Math.min(candidate.native.end, routeSectionS(occurrence, b)),
          workspace.candidate,
        );
        const projected = workspace.candidate;
        occurrence.section.coordinates.domain.lateralAt(projected.s, workspace.bounds);
        const inside =
          projected.isFoot && projected.l >= workspace.bounds.left && projected.l <= workspace.bounds.right;
        const s = routeS(occurrence, projected.s),
          owner = lookup(s) === occurrence;
        if (
          found &&
          ((bestInside && !inside) ||
            (bestInside === inside &&
              ((bestOwner && !owner) || (bestOwner === owner && projected.distanceSquared >= bestDistance))))
        )
          continue;
        out.s = s;
        out.l = projected.l - occurrence.lateralOrigin;
        out.inDomain = inside;
        bestDistance = projected.distanceSquared;
        bestInside = inside;
        bestOwner = owner;
        found = true;
      }
      // The two tangent rays complete the chainage ruler beyond the retained occurrences.
      for (let side = 0; side < 2; side += 1) {
        const end = side === 0 ? route.start : route.end;
        const a = side === 0 ? from : Math.max(from, end);
        const b = side === 0 ? Math.min(to, end) : to;
        if (b <= a) continue;
        coordinates.toWorld(end, 0, endpoint);
        const tx = Math.sin(endpoint.heading),
          tz = Math.cos(endpoint.heading);
        const dx = world.x - endpoint.x,
          dz = world.z - endpoint.z;
        const foot = end + dx * tx + dz * tz;
        const s = Math.max(a, Math.min(b, foot));
        const distance = (dx - (s - end) * tx) ** 2 + (dz - (s - end) * tz) ** 2;
        if (found && (bestInside || distance >= bestDistance)) continue;
        out.s = s;
        out.l = dx * tz - dz * tx;
        out.inDomain = false;
        bestDistance = distance;
        found = true;
      }
      return out;
    },
  });
  function lateralAt(s: number, out: Writable<PlanLateralBounds>): PlanLateralBounds {
    const occurrence = lookup(s);
    if (!occurrence) {
      out.left = EMPTY_ROUTE_DOMAIN.left;
      out.right = EMPTY_ROUTE_DOMAIN.right;
      return out;
    }
    occurrence.section.coordinates.domain.lateralAt(routeSectionS(occurrence, s), bounds);
    out.left = bounds.left - occurrence.lateralOrigin;
    out.right = bounds.right - occurrence.lateralOrigin;
    return out;
  }
  const endpointHeight = (s: number) => {
    const occurrence = s < route.start ? route.occurrences[0]! : route.occurrences.at(-1)!;
    return occurrence.section.height.sample(routeSectionS(occurrence, s < route.start ? route.start : route.end));
  };
  const height = Object.freeze({
    get knots() {
      sync();
      return heightKnots;
    },
    sample(s: number) {
      const occurrence = lookup(s);
      return occurrence ? occurrence.section.height.sample(routeSectionS(occurrence, s)) : endpointHeight(s);
    },
    sampleDifferential(s: number, out = { y: 0, dYdS: 0 }) {
      const occurrence = lookup(s);
      if (occurrence) return occurrence.section.height.sampleDifferential(routeSectionS(occurrence, s), out);
      out.y = endpointHeight(s);
      out.dYdS = 0;
      return out;
    },
  });
  const renderHeight = Object.freeze({
    get knots() {
      sync();
      return renderKnots;
    },
    sample(s: number, out = { y: 0, grade: 0, segmentIndex: 0, sStart: 0, sEnd: 0 }) {
      const occurrence = lookup(s);
      if (!occurrence) {
        const end = s < route.start ? route.start : route.end;
        renderHeight.sample(end, out);
        out.grade = 0;
        out.sStart = s < route.start ? -Infinity : end;
        out.sEnd = s < route.start ? end : Infinity;
        out.segmentIndex = -1;
        return out;
      }
      occurrence.section.renderHeight.sample(routeSectionS(occurrence, s), out);
      out.sStart = Math.max(occurrence.start, routeS(occurrence, out.sStart));
      out.sEnd = Math.min(occurrence.end, routeS(occurrence, out.sEnd));
      return out;
    },
    distanceToNextKnot(s: number) {
      const occurrence = lookup(s);
      return occurrence
        ? Math.min(occurrence.section.renderHeight.distanceToNextKnot(routeSectionS(occurrence, s)), occurrence.end - s)
        : s < route.start
          ? route.start - s
          : Infinity;
    },
  });
  const raster = Object.freeze({
    get segments() {
      sync();
      return rasterSegments;
    },
    toWorld(s: number, l: number, out: typeof rasterSample) {
      const occurrence = lookup(s);
      if (!occurrence) {
        const end = s < route.start ? route.start : route.end;
        raster.toWorld(end, 0, out);
        extend(out, s, l, end);
        out.segmentIndex = -1;
        return out;
      }
      rasterPathToWorld(
        occurrence.section.raster,
        routeSectionS(occurrence, s),
        l + occurrence.lateralOrigin,
        rasterSample,
      );
      const t = occurrence.worldFromSection;
      out.x = t.cosine * rasterSample.x + t.sine * rasterSample.z + t.translation.x;
      out.z = -t.sine * rasterSample.x + t.cosine * rasterSample.z + t.translation.z;
      out.s = s;
      out.l = l;
      out.heading = heading(occurrence, rasterSample.heading);
      out.segmentIndex = rasterSample.segmentIndex;
      return out;
    },
  });
  const material = Object.freeze({
    sample(s: number, l: number) {
      const occurrence = lookup(s);
      if (!occurrence) return ROUTE_OUTSIDE_SURFACE;
      const nativeS = routeSectionS(occurrence, s);
      occurrence.section.coordinates.domain.lateralAt(nativeS, bounds);
      const nativeL = l + occurrence.lateralOrigin;
      if (nativeL < bounds.left || nativeL > bounds.right) return ROUTE_OUTSIDE_SURFACE;
      let reader = surfaces.get(occurrence.section);
      if (!reader) {
        reader = createRegionSurfaceReader(occurrence.section.regionPartition, occurrence.section.physicalBindings);
        surfaces.set(occurrence.section, reader);
      }
      return reader.sampleInChart(routeSectionS(occurrence, s), l, occurrence.lateralOrigin);
    },
  });
  return Object.freeze({
    extent: route,
    coordinates,
    height,
    renderHeight,
    raster,
    surfaces: material,
    sync,
  });
}
