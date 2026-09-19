import type { CompiledSection } from '../compiler/course-graph.js';
import { compileCourseGeometryWindow } from '../course/course-geometry-window.js';
import { guideCoordinateMetricsAt, type GuideCoordinateReader } from '../core/guide-coordinate-frame.js';
import { guideLocalSearchRange, guidePathToWorld, locateWorldOnGuideLocal } from '../core/guide-curve.js';
import type { HeightProfileReader } from '../core/height-profile.js';
import type { Vec2 } from '../core/math.js';
import { profileIndexAt } from '../core/open-profile.js';
import { rasterPathToWorld } from '../core/raster-path.js';
import type { RasterCoordinateReader, RasterGeometry } from '../core/raster-coordinate-reader.js';
import { GEOMETRY_SAMPLING_TOLERANCE_METERS } from '../core/tolerances.js';
import { createBandSurfaceReader } from '../physics/band-surface-reader.js';
import type { VehicleWorld } from '../physics/vehicle-contract.js';
import type { CourseGeometryView } from './course-geometry-view.js';

/**
 * Prepare canonical physical facets once, then admit bounded readers over one active Section.
 * Multi-occurrence driving remains gated on complete Link/content qualification.
 */
export function createCourseSectionDrivingSource(section: CompiledSection) {
  if (!section || !section.guide || !section.raster || !section.height || !section.bandPartition)
    throw new TypeError('Driving source requires a compiled Section');
  const surface = createBandSurfaceReader(section.bandPartition, section.physicalBindings);
  return Object.freeze({
    createView(view: CourseGeometryView) {
      if (!view || !Array.isArray(view.spans) || !view.frame || !view.activeRange)
        throw new TypeError('Driving view requires an admitted geometry view');
      if (view.frame.section !== section)
        throw new RangeError('Driving source and active occurrence must share the canonical Section');
      if (view.spans.length !== 1 || view.spans[0]!.occurrence !== view.frame)
        return Object.freeze({ ok: false as const, reason: 'unqualified_links' as const });
      const { start, end } = view.activeRange;
      const qualification = compileCourseGeometryWindow(section, { sStart: start, sEnd: end });
      if (!qualification.ok)
        return Object.freeze({
          ok: false as const,
          reason: 'geometry_qualification_failed' as const,
          diagnostics: qualification.diagnostics,
        });

      const check = (s: number) => {
        if (typeof s !== 'number') throw new TypeError('Driving reader chainage must be numeric');
        if (
          !Number.isFinite(s) ||
          s < start - GEOMETRY_SAMPLING_TOLERANCE_METERS ||
          s > end + GEOMETRY_SAMPLING_TOLERANCE_METERS
        )
          throw new RangeError(`Driving query ${s} exceeds admitted window [${start}, ${end}]`);
        return s;
      };
      const guide: GuideCoordinateReader = Object.freeze({
        // Logical finite source endpoints are not moving window edges. A short window must fail,
        // never silently shorten driver lookahead or move a recovery target.
        domain: Object.freeze({ start: 0, end: section.guide.length }),
        toWorld: (s: number, l: number) => guidePathToWorld(section.guide, check(s), l),
        metricsAt: (s: number, l: number, segmentIndex: number) =>
          guideCoordinateMetricsAt(section.guide, check(s), l, segmentIndex),
        locateLocal(world: Vec2, previousSegmentIndex: number, searchRadius: number, clampL: boolean) {
          const interval = guideLocalSearchRange(section.guide, previousSegmentIndex, searchRadius);
          check(interval.start);
          check(interval.end);
          return locateWorldOnGuideLocal(section.guide, world, previousSegmentIndex, searchRadius, clampL);
        },
      });
      const sourceHeight = section.height;
      const firstNode = Math.min(sourceHeight.nodes.length - 2, profileIndexAt(sourceHeight.nodes, 's', start));
      const lastNode = Math.min(sourceHeight.nodes.length - 1, profileIndexAt(sourceHeight.nodes, 's', end) + 1);
      const height: HeightProfileReader = Object.freeze({
        courseLength: sourceHeight.courseLength,
        nodes: Object.freeze(sourceHeight.nodes.slice(firstNode, lastNode + 1)),
        sampleRender: (s: number) => sourceHeight.sampleRender(check(s)),
        samplePhysics: (s: number) => sourceHeight.samplePhysics(check(s)),
        samplePhysicsDifferential: (s: number) => sourceHeight.samplePhysicsDifferential(check(s)),
        sampleCamera: (s: number) => sourceHeight.sampleCamera(check(s)),
        distanceToNextRenderNode: (s: number) => sourceHeight.distanceToNextRenderNode(check(s)),
      });
      const rasterSegments = Object.freeze(
        section.raster.segments.filter((s) => s.sStart <= end && s.sStart + s.length >= start),
      );
      const raster: RasterCoordinateReader = Object.freeze({
        length: section.raster.length,
        segments: rasterSegments,
        toWorld: (s: number, l: number) => rasterPathToWorld(section.raster, check(s), l),
      });
      const geometry: RasterGeometry = Object.freeze({ length: section.raster.length, raster });
      const world: VehicleWorld = Object.freeze({
        guide,
        height,
        surfaces: Object.freeze({
          maxSupportedAbsL: surface.maxSupportedAbsL,
          sample: (s: number, l: number) => surface.sample(check(s), l),
        }),
      });
      return Object.freeze({
        ok: true as const,
        value: Object.freeze({
          scope: 'single-section-driving' as const,
          frame: view.frame,
          range: view.activeRange,
          qualification: qualification.value,
          geometry,
          world,
          metadata: Object.freeze({ rasterSegments: rasterSegments.length, heightNodes: height.nodes.length }),
        }),
      });
    },
  });
}
