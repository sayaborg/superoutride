import { createPlanarCoordinateSample } from '../core/planar-sample.js';
import { createMappedPlanCoordinateReader } from './geometry/plan-coordinate-reader.js';
import { dot, subtract, tangentFromHeading, normalFromHeading, wrapAngle, type Vec2 } from '../core/math.js';
import { invertPlanarTransform } from '../core/planar-transform.js';
import { rasterPathToWorld } from './geometry/raster-path.js';
import type { RasterCoordinateReader, RasterGeometry } from './geometry/raster-coordinate-reader.js';
import type { HeightProfileReader } from './geometry/height-profile.js';
import type { CompiledSection } from './compiler/course-graph.js';
import type { compileCoursePhysicalDomains } from './compiler/course-physical-overlap.js';
import { createRegionSurfaceReader } from './region-surface-reader.js';
import type { VehicleWorld } from './vehicle-world.js';
import type { CourseGeometryView } from './course-geometry-view.js';
import type { CourseOccurrence } from './course-occurrence.js';

type Physical = Extract<ReturnType<typeof compileCoursePhysicalDomains>, { ok: true }>['value'];
/** Native physical readers and occurrence mappings shared by race and rendering. */
export function createCourseDrivingReaders(physical: Physical) {
  if (!physical || physical.scope !== 'physical-query-domain')
    throw new TypeError('Driving readers require a physical query-domain product');
  const linkedSeedCount = Math.max(
    0,
    ...physical.links.flatMap((link) => [
      link.source.section.coordinates.seedCount,
      link.destination.section.coordinates.seedCount,
    ]),
  );
  const surfaces = new Map<CompiledSection, ReturnType<typeof createRegionSurfaceReader>>();
  const surface = (section: CompiledSection) => {
    let value = surfaces.get(section);
    if (!value) {
      value = createRegionSurfaceReader(section.regionPartition, section.physicalBindings);
      surfaces.set(section, value);
    }
    return value;
  };
  const createView = (view: CourseGeometryView) => {
    if (!view || !Array.isArray(view.spans) || !view.activeRange || !view.availableRange)
      throw new TypeError('Driving admission requires an occurrence geometry view');
    const active = view.frame,
      range = view.activeRange;
    const spans: CourseGeometryView['spans'] = view.spans;
    // Each occurrence owns its interval. Only contact and the crossing step share the guard.
    for (const span of spans) {
      const link = span.occurrence.incoming;
      if (link && !physical.links.includes(link))
        return Object.freeze({ ok: false as const, reason: 'unqualified_links' as const });
    }
    const mapped = Object.freeze(
      spans.map((span) =>
        Object.freeze({
          ...span,
          sourceFromView: invertPlanarTransform(span.viewFromSource),
          surface: surface(span.occurrence.section),
        }),
      ),
    );
    const check = (s: number) => {
      if (typeof s !== 'number') throw new TypeError('Driving chainage must be numeric');
      if (!Number.isFinite(s) || s < range.start || s > range.end)
        throw new RangeError('Driving query exceeds its admitted window');
      return s;
    };
    const mappingAt = (s: number) => {
      check(s);
      let i = mapped.length - 1;
      while (i > 0 && mapped[i]!.frameStart > s) i -= 1;
      return mapped[i]!;
    };
    const resolve = (s: number, l: number) => {
      const mapping = mappingAt(s);
      const address = {
        occurrence: mapping.occurrence,
        sourceS: mapping.sourceChainageInFrame(s),
        sourceL: l + mapping.sourceLateralOrigin,
      };
      return { address, mapping, section: mapping.occurrence.section };
    };
    const activeS = (mapping: (typeof mapped)[number], s: number) => mapping.frameAnchorS + (s - mapping.sourceAnchorS);
    const headingInFrame = (mapping: (typeof mapped)[number], heading: number) =>
      mapping.occurrence === active
        ? heading
        : wrapAngle(heading + Math.atan2(mapping.viewFromSource.sine, mapping.viewFromSource.cosine));
    const { reader: coordinates, seedCount } = createMappedPlanCoordinateReader(view, {
      mapped,
      seedStride: Math.max(linkedSeedCount, active.section.coordinates.seedCount),
      mappingAt,
      activeS,
      headingInFrame,
    });

    const nodes = mapped
      .flatMap((mapping) => {
        const section = mapping.occurrence.section;
        return [
          ...new Set([
            mapping.sourceRange.start,
            ...section.height.nodes
              .map((n) => n.s)
              .filter((s) => s > mapping.sourceRange.start && s < mapping.sourceRange.end),
            mapping.sourceRange.end,
          ]),
        ].map((s) => Object.freeze({ s: activeS(mapping, s), y: section.height.sampleRender(s).y }));
      })
      .filter((n, i, list) => i === 0 || n.s !== list[i - 1]!.s);
    const height: HeightProfileReader = Object.freeze({
      courseLength: view.availableRange.end,
      nodes: Object.freeze(nodes),
      sampleRender(s: number, out = { y: 0, grade: 0, segmentIndex: 0, sStart: 0, sEnd: 0 }) {
        const m = mappingAt(s);
        m.occurrence.section.height.sampleRender(m.sourceChainageInFrame(s), out);
        out.sStart = activeS(m, Math.max(m.sourceRange.start, out.sStart));
        out.sEnd = activeS(m, Math.min(m.sourceRange.end, out.sEnd));
        return out;
      },
      samplePhysics(s: number) {
        const m = mappingAt(s);
        return m.occurrence.section.height.samplePhysics(m.sourceChainageInFrame(s));
      },
      samplePhysicsDifferential(s: number, out = { y: 0, dYdS: 0 }) {
        const m = mappingAt(s);
        return m.occurrence.section.height.samplePhysicsDifferential(m.sourceChainageInFrame(s), out);
      },
      sampleCamera(s: number) {
        const m = mappingAt(s);
        return m.occurrence.section.height.sampleCamera(m.sourceChainageInFrame(s));
      },
      distanceToNextRenderNode(s: number) {
        const { address, mapping, section } = resolve(s, 0);
        return Math.min(section.height.distanceToNextRenderNode(address.sourceS), mapping.frameEnd - s);
      },
    });
    const raster: RasterCoordinateReader = Object.freeze({
      length: view.availableRange.end,
      segments: Object.freeze(
        mapped.flatMap((mapping) =>
          mapping.occurrence.section.raster.segments.flatMap((segment) => {
            const start = Math.max(mapping.sourceRange.start, segment.sStart),
              end = Math.min(mapping.sourceRange.end, segment.sStart + segment.length);
            return end > start
              ? [
                  Object.freeze({
                    sStart: activeS(mapping, start),
                    length: end - start,
                    heading: headingInFrame(mapping, segment.heading),
                  }),
                ]
              : [];
          }),
        ),
      ),
      toWorld(s: number, l: number, out: ReturnType<typeof createPlanarCoordinateSample>) {
        const m = mappingAt(s);
        rasterPathToWorld(m.occurrence.section.raster, m.sourceChainageInFrame(s), l + m.sourceLateralOrigin, out);
        const t = m.viewFromSource;
        const x = t.cosine * out.x + t.sine * out.z + t.translation.x;
        out.z = -t.sine * out.x + t.cosine * out.z + t.translation.z;
        out.x = x;
        out.s = s;
        out.l = l;
        out.heading = headingInFrame(m, out.heading);
        return out;
      },
    });
    const world: VehicleWorld = Object.freeze({
      coordinates,
      height,
      surfaces: Object.freeze({
        maxSupportedAbsL: Math.max(...mapped.map((m) => m.surface.maxSupportedAbsL + Math.abs(m.sourceLateralOrigin))),
        sample(s: number, l: number) {
          const m = mappingAt(s);
          return m.surface.sampleInChart(m.sourceChainageInFrame(s), l, m.sourceLateralOrigin);
        },
      }),
    });
    const geometry: RasterGeometry = Object.freeze({ length: raster.length, raster });
    return Object.freeze({
      ok: true as const,
      value: Object.freeze({
        scope: 'occurrence-driving' as const,
        physical,
        frame: active,
        range,
        world,
        geometry,
        mapping: Object.freeze({ mapped, check, mappingAt, resolve, activeS }),
        metadata: Object.freeze({
          planSeeds: seedCount,
          rasterSegments: raster.segments.length,
          heightNodes: nodes.length,
        }),
      }),
    });
  };
  return Object.freeze({
    createView: (view: CourseGeometryView) => createView(view),
    /** Contact/step admission needs the canonical seam and active frame, not another rendering view. */
    createMotionGuard(frame: CourseOccurrence, successor: CourseOccurrence) {
      if (!successor?.incoming || !physical.links.includes(successor.incoming))
        return Object.freeze({ ok: false as const, reason: 'unqualified_links' as const });
      if (
        frame !== successor &&
        !(frame.ordinal === successor.ordinal - 1 && frame.section === successor.incoming.source.section)
      )
        return Object.freeze({ ok: false as const, reason: 'unqualified_window' as const });
      const link = successor.incoming!,
        port = frame === successor ? link.destination : link.source;
      const observe = (point: Vec2) => {
        if (!point || typeof point.x !== 'number' || typeof point.z !== 'number')
          throw new TypeError('Seam motion requires numeric world points');
        if (![point.x, point.z].every(Number.isFinite)) throw new RangeError('Seam motion must be finite');
        const relative = subtract(point, port.pose);
        return {
          s: dot(relative, tangentFromHeading(port.pose.heading)),
          l: dot(relative, normalFromHeading(port.pose.heading)),
        };
      };
      return Object.freeze({
        ok: true as const,
        value: Object.freeze({
          /** Pure observation in the actual active frame; no traversal, physical or progress mutation. */
          admitMotion(previous: Vec2, current: Vec2) {
            const a = observe(previous),
              b = observe(current);
            const { pose, step } = physical.demand;
            const consumer = 'physical' as const;
            if (
              a.s < -pose.behind ||
              a.s > pose.ahead ||
              a.l < -pose.left ||
              a.l > pose.right ||
              b.s < -pose.behind - step.behind ||
              b.s > pose.ahead + step.ahead ||
              b.l < -pose.left - step.left ||
              b.l > pose.right + step.right
            )
              return Object.freeze({ ok: false as const, reason: 'pose_domain_exhausted' as const, consumer });
            const ds = b.s - a.s,
              dl = b.l - a.l;
            if (ds < -step.behind || ds > step.ahead || dl < -step.left || dl > step.right)
              return Object.freeze({ ok: false as const, reason: 'step_domain_exhausted' as const, consumer });
            return Object.freeze({ ok: true as const });
          },
        }),
      });
    },
  });
}
