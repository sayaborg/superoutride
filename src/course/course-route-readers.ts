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
import type { VehicleWorld } from './vehicle-world.js';
import type { ProfilePolylineReader } from './geometry/profile.js';
import type { RasterGeometry } from './geometry/raster-coordinate-reader.js';
import { routeS, routeSectionS, type CourseRoute, type RouteOccurrence } from './course-route.js';

/** No-content results for route queries. Height holds the endpoint value, and the surface is VOID. */
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
        .projectionCandidates(occurrence.nativeStart, occurrence.nativeEnd)
        .map((candidate) => ({
          occurrence,
          start: routeS(occurrence, candidate.start),
          end: routeS(occurrence, candidate.end),
          native: candidate,
        })),
    );
    rasterSegments = indexed.flatMap((occurrence) =>
      occurrence.section.raster.segments.flatMap((segment) => {
        const start = Math.max(occurrence.nativeStart, segment.sStart);
        const end = Math.min(occurrence.nativeEnd, segment.sStart + segment.length);
        return end > start
          ? [{ sStart: routeS(occurrence, start), length: end - start, heading: heading(occurrence, segment.heading) }]
          : [];
      }),
    );
    const profileKnots = indexed.flatMap((occurrence) =>
      occurrence.section.height.knots
        .filter((knot) => knot.s >= occurrence.nativeStart && knot.s <= occurrence.nativeEnd)
        .map((knot) => Object.freeze({ ...knot, s: routeS(occurrence, knot.s) })),
    );
    heightKnots = profileKnots.filter((knot, i) => i + 1 === profileKnots.length || knot.s !== profileKnots[i + 1]!.s);
    const displayKnots = indexed.flatMap((occurrence) => {
      const end = occurrence.nativeEnd;
      return [
        occurrence.nativeStart,
        ...occurrence.section.renderHeight.knots
          .map((knot) => knot.s)
          .filter((s) => s > occurrence.nativeStart && s < end),
        end,
      ].map((s) => Object.freeze({ s: routeS(occurrence, s), y: occurrence.section.renderHeight.sample(s).y }));
    });
    renderKnots = displayKnots.filter((knot, i) => i + 1 === displayKnots.length || knot.s !== displayKnots[i + 1]!.s);
  };
  const lookup = (s: number) => route.at(s);
  const heading = (occurrence: RouteOccurrence, sectionHeading: number) =>
    wrapAngle(sectionHeading + Math.atan2(occurrence.worldFromSection.sine, occurrence.worldFromSection.cosine));
  const domain = Object.freeze({
    get start() {
      return route.start;
    },
    get end() {
      return route.end;
    },
    lateralAt,
  });
  const coordinates = Object.freeze({
    domain,
    lateralAt(s: number, out: Writable<PlanLateralBounds>): PlanLateralBounds | null {
      return lateralAt(s, out);
    },
    toWorld(s: number, l: number, out: PlanCoordinateSample): PlanCoordinateSample | null {
      const occurrence = lookup(s);
      if (!occurrence) return null;
      occurrence.section.coordinates.toWorld(routeSectionS(occurrence, s), l + occurrence.lateralOrigin, native);
      const t = occurrence.worldFromSection;
      out.x = t.cosine * native.x + t.sine * native.z + t.translation.x;
      out.z = -t.sine * native.x + t.cosine * native.z + t.translation.z;
      out.s = s;
      out.l = l;
      out.heading = heading(occurrence, native.heading);
      return out;
    },
    metricsAt(s: number, l: number, out: Writable<PlanCoordinateMetrics>): PlanCoordinateMetrics | null {
      const occurrence = lookup(s);
      return occurrence
        ? occurrence.section.coordinates.metricsAt(routeSectionS(occurrence, s), l + occurrence.lateralOrigin, out)
        : null;
    },
    locateLocal(
      world: Vec2,
      previousS: number,
      out: PlanCoordinateProjection,
      workspace: PlanProjectionWorkspace,
    ): PlanCoordinateProjection | null {
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
      return found ? out : null;
    },
  });
  function lateralAt(s: number, out: Writable<PlanLateralBounds>): PlanLateralBounds | null {
    const occurrence = lookup(s);
    if (!occurrence) return null;
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
    get courseLength() {
      return route.end;
    },
    get knots() {
      sync();
      return heightKnots;
    },
    sample(s: number) {
      const occurrence = lookup(s);
      return occurrence ? occurrence.section.height.sample(routeSectionS(occurrence, s)) : endpointHeight(s);
    },
    sampleDifferential(s: number, out: { y: number; dYdS: number }) {
      const occurrence = lookup(s);
      if (occurrence) return occurrence.section.height.sampleDifferential(routeSectionS(occurrence, s), out);
      out.y = endpointHeight(s);
      out.dYdS = 0;
      return out;
    },
  });
  const renderHeight = Object.freeze({
    get courseLength() {
      return route.end;
    },
    get knots() {
      sync();
      return renderKnots;
    },
    sample(s: number, out: { y: number; grade: number; segmentIndex: number; sStart: number; sEnd: number }) {
      const occurrence = lookup(s);
      if (!occurrence) return null;
      occurrence.section.renderHeight.sample(routeSectionS(occurrence, s), out);
      out.sStart = Math.max(occurrence.start, routeS(occurrence, out.sStart));
      out.sEnd = Math.min(occurrence.end, routeS(occurrence, out.sEnd));
      return out;
    },
    distanceToNextKnot(s: number) {
      const occurrence = lookup(s);
      return occurrence
        ? Math.min(occurrence.section.renderHeight.distanceToNextKnot(routeSectionS(occurrence, s)), occurrence.end - s)
        : Infinity;
    },
  });
  const raster = Object.freeze({
    get length() {
      return route.end;
    },
    get segments() {
      sync();
      return rasterSegments;
    },
    toWorld(s: number, l: number, out: typeof rasterSample) {
      const occurrence = lookup(s);
      if (!occurrence) return null;
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
      let reader = surfaces.get(occurrence.section);
      if (!reader) {
        reader = createRegionSurfaceReader(occurrence.section.regionPartition, occurrence.section.physicalBindings);
        surfaces.set(occurrence.section, reader);
      }
      return reader.sampleInChart(routeSectionS(occurrence, s), l, occurrence.lateralOrigin);
    },
  });
  // The live vehicle/render contracts require filled outputs. Empty route queries use borrowed
  // no-content observations; ordinary driving remains in the preloaded interval.
  const worldCoordinates: VehicleWorld['coordinates'] = {
    domain: {
      get start() {
        return route.start;
      },
      get end() {
        return route.end;
      },
      lateralAt(s, out) {
        if (!coordinates.lateralAt(s, out)) {
          out.left = 0;
          out.right = 0;
        }
        return out;
      },
    },
    toWorld(s, l, out) {
      if (!coordinates.toWorld(s, l, out)) {
        out.x = 0;
        out.z = 0;
        out.heading = 0;
        out.s = s;
        out.l = l;
      }
      return out;
    },
    metricsAt(s, l, out) {
      if (!coordinates.metricsAt(s, l, out)) {
        out.curvature = 0;
        out.offsetMetric = 1;
      }
      return out;
    },
    locateLocal(point, previousS, out, workspace) {
      if (!coordinates.locateLocal(point, previousS, out, workspace)) {
        out.s = previousS;
        out.l = 0;
        out.inDomain = false;
      }
      return out;
    },
  };
  Object.freeze(worldCoordinates.domain);
  Object.freeze(worldCoordinates);
  const world: VehicleWorld = Object.freeze({ coordinates: worldCoordinates, height, surfaces: material });
  const displayHeight: ProfilePolylineReader = {
    get courseLength() {
      return route.end;
    },
    get knots() {
      return renderHeight.knots;
    },
    sample(s, out = { y: 0, grade: 0, segmentIndex: 0, sStart: 0, sEnd: 0 }) {
      if (!renderHeight.sample(s, out)) {
        out.y = height.sample(s);
        out.grade = 0;
        out.sStart = s;
        out.sEnd = s;
        out.segmentIndex = -1;
      }
      return out;
    },
    distanceToNextKnot: renderHeight.distanceToNextKnot,
  };
  Object.freeze(displayHeight);
  const geometry: RasterGeometry = {
    get length() {
      return route.end;
    },
    get start() {
      return route.start;
    },
    raster: {
      get length() {
        return route.end;
      },
      get segments() {
        return raster.segments;
      },
      toWorld(s, l, out) {
        if (!raster.toWorld(s, l, out)) {
          out.x = 0;
          out.z = 0;
          out.s = s;
          out.l = l;
          out.heading = 0;
          out.segmentIndex = -1;
        }
        return out;
      },
    },
  };
  Object.freeze(geometry.raster);
  Object.freeze(geometry);
  return Object.freeze({
    route,
    coordinates,
    height,
    renderHeight,
    raster,
    material,
    world,
    displayHeight,
    geometry,
    sync,
  });
}
