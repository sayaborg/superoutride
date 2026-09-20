import type { CourseGround } from '../compiler/course-ground.js';
import { selectGroundLevel } from '../groundmap/resident-ground.js';
import { guideCoordinateMetricsAt, type GuideCoordinateReader } from '../core/guide-coordinate-frame.js';
import { guidePathToWorld, projectWorldOnGuideInterval, sampleGuidePath } from '../core/guide-curve.js';
import { dot, subtract, tangentFromHeading, normalFromHeading, wrapAngle, type Vec2 } from '../core/math.js';
import { invertPlanarTransform, transformPlanarPoint } from '../core/planar-transform.js';
import { rasterPathToWorld } from '../core/raster-path.js';
import type { RasterCoordinateReader, RasterGeometry } from '../core/raster-coordinate-reader.js';
import type { HeightProfileReader } from '../core/height-profile.js';
import { profileIndexAt } from '../core/open-profile.js';
import { COURSE_DOCUMENT_LIMITS } from '../course/course-document.js';
import { compileCourseGeometryWindow } from '../course/course-geometry-window.js';
import type { CompiledSection } from '../compiler/course-graph.js';
import { compileCoursePhysicalDomains } from '../compiler/course-physical-overlap.js';
import { compileCoursePresentationDomains } from '../compiler/course-presentation-overlap.js';
import { createBandSurfaceReader } from '../physics/band-surface-reader.js';
import type { VehicleWorld } from '../physics/vehicle-contract.js';
import { createCoursePresentationPreview } from '../render/course-presentation-preview.js';
import type { GroundColorReader } from '../render/renderer.js';
import type { VisualProfileReader } from '../visual/visual-profile.js';
import type { CourseGeometryView } from './course-geometry-view.js';
import type { CourseOccurrence } from './course-occurrence.js';

type Physical = Extract<ReturnType<typeof compileCoursePhysicalDomains>, { ok: true }>['value'];
type Presentation = Extract<ReturnType<typeof compileCoursePresentationDomains>, { ok: true }>['value'];
// At most one straight per Raster segment and one fillet per vertex. Occurrence ordinals do not wrap.
const seedStride = 2 * COURSE_DOCUMENT_LIMITS.rasterSegments;
const seed = (ordinal: number, index: number) => {
  const value = ordinal * seedStride + index;
  if (!Number.isSafeInteger(value) || value < 0 || index >= seedStride)
    throw new RangeError('Occurrence projection seed exceeds its exact integer domain');
  return value;
};

/** Native source readers are shared; only bounded mapping/observation metadata is constructed per view. */
export function createCourseDrivingSource(resident: CourseGround, physical: Physical, presentation: Presentation) {
  if (
    !physical ||
    physical.scope !== 'physical-query-domain' ||
    !presentation ||
    presentation.scope !== 'presentation-query-domain'
  )
    throw new TypeError('Driving source requires physical and presentation query-domain products');
  if (
    physical.links.length !== presentation.links.length ||
    physical.links.some((l) => !presentation.links.includes(l))
  )
    throw new RangeError('Driving qualifications must refer to the same canonical Links');
  const surfaces = new Map<CompiledSection, ReturnType<typeof createBandSurfaceReader>>();
  const surface = (section: CompiledSection) => {
    let value = surfaces.get(section);
    if (!value) {
      value = createBandSurfaceReader(section.bandPartition, section.physicalBindings);
      surfaces.set(section, value);
    }
    return value;
  };
  const preview = createCoursePresentationPreview();
  const presentations = new Map<CompiledSection, ReturnType<typeof preview.createSource>>();
  const sourcePresentation = (section: CompiledSection) => {
    let value = presentations.get(section);
    if (!value) {
      if (!section.presentation) throw new Error('Admitted driving view lost its presentation');
      value = preview.createSource(
        section.presentation,
        { length: section.raster.length, raster: section.raster },
        section.height,
      );
      presentations.set(section, value);
    }
    return value;
  };
  const qualified = new Map<CompiledSection, Set<string>>();
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
      const section = span.occurrence.section;
      const intervals = qualified.get(section) ?? new Set<string>();
      const interval = `${span.sourceRange.start}:${span.sourceRange.end}`;
      if (intervals.has(interval)) continue;
      const proof = compileCourseGeometryWindow(section, {
        sStart: span.sourceRange.start,
        sEnd: span.sourceRange.end,
      });
      if (!proof.ok)
        return Object.freeze({
          ok: false as const,
          reason: 'geometry_qualification_failed' as const,
          diagnostics: proof.diagnostics,
        });
      intervals.add(interval);
      qualified.set(section, intervals);
    }
    if (spans.some((span) => !span.occurrence.section.presentation))
      return Object.freeze({ ok: false as const, reason: 'presentation_unavailable' as const });
    const mapped = spans.map((span) => ({
      ...span,
      sourceFromView: invertPlanarTransform(span.viewFromSource),
      surface: surface(span.occurrence.section),
      ground: resident.forSection(span.occurrence.section),
      presentation: sourcePresentation(span.occurrence.section),
      backgrounds: sourcePresentation(span.occurrence.section).backgrounds.map((background) =>
        Object.freeze({
          ...background,
          yawOriginRadians:
            background.yawOriginRadians + Math.atan2(span.viewFromSource.sine, span.viewFromSource.cosine),
        }),
      ),
    }));
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
    const candidates = mapped.flatMap((mapping) =>
      mapping.occurrence.section.guide.segments.flatMap((segment) => {
        const start = Math.max(mapping.sourceRange.start, segment.sStart),
          end = Math.min(mapping.sourceRange.end, segment.sEnd);
        return end > start
          ? [{ mapping, segment, start, end, seed: seed(mapping.occurrence.ordinal, segment.index) }]
          : [];
      }),
    );
    const guide: GuideCoordinateReader = Object.freeze({
      domain: view.availableRange,
      toWorld(s: number, l: number) {
        const { address, mapping, section } = resolve(s, l);
        const p = guidePathToWorld(section.guide, address.sourceS, address.sourceL);
        return {
          ...p,
          ...transformPlanarPoint(mapping.viewFromSource, p),
          s,
          l,
          heading: headingInFrame(mapping, p.heading),
          segmentIndex: seed(mapping.occurrence.ordinal, p.segmentIndex),
        };
      },
      metricsAt(s: number, l: number, segmentIndex: number) {
        if (typeof segmentIndex !== 'number') throw new TypeError('Projection seed must be numeric');
        const { address, section, mapping } = resolve(s, l);
        const index = segmentIndex - mapping.occurrence.ordinal * seedStride;
        if (!Number.isInteger(index) || index < 0 || index >= section.guide.segments.length)
          throw new RangeError('Projection seed does not belong to the addressed occurrence');
        return guideCoordinateMetricsAt(section.guide, address.sourceS, address.sourceL, index);
      },
      locateLocal(world: Vec2, previousSegmentIndex: number, searchRadius: number, clampL: boolean) {
        if (
          !world ||
          typeof world.x !== 'number' ||
          typeof world.z !== 'number' ||
          typeof previousSegmentIndex !== 'number' ||
          typeof searchRadius !== 'number' ||
          typeof clampL !== 'boolean'
        )
          throw new TypeError('Projection requires numeric world position, seed/radius and boolean clamping');
        if (!Number.isSafeInteger(previousSegmentIndex) || !Number.isSafeInteger(searchRadius) || searchRadius < 0)
          throw new RangeError('Projection requires an exact seed and nonnegative search radius');
        const at = candidates.findIndex((c) => c.seed === previousSegmentIndex);
        if (at < 0) throw new RangeError('Projection seed is outside the retained occurrence window');
        if (
          (at - searchRadius < 0 && range.start > view.availableRange.start) ||
          (at + searchRadius >= candidates.length && range.end < view.availableRange.end)
        )
          throw new RangeError('Driving window does not cover the complete seeded search');
        let best: { s: number; l: number; segmentIndex: number; distanceSquared: number } | null = null;
        for (let i = Math.max(0, at - searchRadius); i < Math.min(candidates.length, at + searchRadius + 1); i += 1) {
          const candidate = candidates[i]!;
          const { mapping, segment, start, end } = candidate;
          if (
            start > Math.max(mapping.sourceOwnership.start, segment.sStart) ||
            end < Math.min(mapping.sourceOwnership.end, segment.sEnd)
          )
            throw new RangeError('Driving window clips a seeded projection candidate');
          const section = mapping.occurrence.section,
            local = transformPlanarPoint(mapping.sourceFromView, world);
          const p = projectWorldOnGuideInterval(section.guide, segment.index, local, start, end, clampL);
          // Compare the same view-chart zero, not different source centerlines at a lateral Link offset.
          const center = sampleGuidePath(section.guide, p.s),
            n = normalFromHeading(center.heading),
            origin = mapping.sourceLateralOrigin;
          const distanceSquared =
            origin === 0
              ? p.distanceSquared
              : (local.x - center.x - n.x * origin) ** 2 + (local.z - center.z - n.z * origin) ** 2;
          if (best && distanceSquared >= best.distanceSquared) continue;
          const s = activeS(mapping, p.s),
            l = p.l - origin;
          const canonical = resolve(s, l);
          const sample = sampleGuidePath(canonical.section.guide, canonical.address.sourceS);
          best = {
            s,
            l,
            segmentIndex:
              canonical.mapping.occurrence === mapping.occurrence
                ? candidate.seed
                : seed(canonical.mapping.occurrence.ordinal, sample.segmentIndex),
            distanceSquared,
          };
        }
        if (!best) throw new Error('Admitted driving projection lost its candidates');
        return best;
      },
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
      sampleRender(s: number) {
        const { address, mapping, section } = resolve(s, 0),
          p = section.height.sampleRender(address.sourceS);
        return {
          ...p,
          sStart: activeS(mapping, Math.max(mapping.sourceRange.start, p.sStart)),
          sEnd: activeS(mapping, Math.min(mapping.sourceRange.end, p.sEnd)),
        };
      },
      samplePhysics(s: number) {
        const { address, section } = resolve(s, 0);
        return section.height.samplePhysics(address.sourceS);
      },
      samplePhysicsDifferential(s: number) {
        const { address, section } = resolve(s, 0);
        return section.height.samplePhysicsDifferential(address.sourceS);
      },
      sampleCamera(s: number) {
        const { address, section } = resolve(s, 0);
        return section.height.sampleCamera(address.sourceS);
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
      toWorld(s: number, l: number) {
        const { address, mapping, section } = resolve(s, l),
          p = rasterPathToWorld(section.raster, address.sourceS, address.sourceL);
        return {
          ...p,
          ...transformPlanarPoint(mapping.viewFromSource, p),
          s,
          l,
          heading: headingInFrame(mapping, p.heading),
        };
      },
    });
    const world: VehicleWorld = Object.freeze({
      guide,
      height,
      surfaces: Object.freeze({
        maxSupportedAbsL: Math.max(...mapped.map((m) => m.surface.maxSupportedAbsL + Math.abs(m.sourceLateralOrigin))),
        sample(s: number, l: number) {
          const { address, mapping } = resolve(s, l);
          return mapping.surface.sampleInChart(address.sourceS, l, mapping.sourceLateralOrigin);
        },
      }),
    });
    const geometry: RasterGeometry = Object.freeze({ length: raster.length, raster });
    const visualSections = Object.freeze(
      mapped
        .flatMap((mapping) => {
          const source = mapping.presentation.visual;
          return [
            source.sample(mapping.sourceRange.start),
            ...source.sections.filter(
              (s) => s.sStart > mapping.sourceRange.start && s.sStart <= mapping.sourceRange.end,
            ),
          ].map((s) =>
            Object.freeze({ ...s, sStart: activeS(mapping, Math.max(s.sStart, mapping.sourceRange.start)) }),
          );
        })
        .filter((s, i, list) => i + 1 === list.length || s.sStart !== list[i + 1]!.sStart),
    );
    const visual: VisualProfileReader = Object.freeze({
      courseLength: view.availableRange.end,
      sections: visualSections,
      sample(s: number) {
        check(s);
        return visualSections[profileIndexAt(visualSections, 'sStart', s)]!;
      },
      distanceToNextSection(s: number) {
        check(s);
        const index = profileIndexAt(visualSections, 'sStart', s);
        return (visualSections[index + 1]?.sStart ?? range.end) - s;
      },
    });
    const ground: GroundColorReader = Object.freeze({
      kind: 'baked',
      kMax: resident.kMax,
      selectLevel: (deltaS: number) => selectGroundLevel(deltaS, resident.kMax),
      sampleAtLevel(s: number, l: number, level: number) {
        const mapping = mappingAt(s);
        const sourceS = mapping.sourceChainageInFrame(s);
        const sourceL = l + mapping.sourceLateralOrigin;
        const { left, right } = mapping.ground.domain;
        if (sourceL >= left && sourceL < right) return mapping.ground.sampleAtLevel(sourceS, sourceL, level);
        const environment = mapping.presentation.visual.sample(sourceS);
        const base = sourceL < left ? environment.groundBaseLeft : environment.groundBaseRight;
        return base.kind === 'color' ? base.color : null;
      },
    });
    const scenery = mapped.flatMap((mapping) =>
      mapping.presentation.sprites
        .filter(({ sprite }) => {
          const s = activeS(mapping, sprite.sRender);
          return s >= range.start && s <= range.end && resolve(s, 0).address.occurrence === mapping.occurrence;
        })
        .map(({ sprite, unselected }) => ({ mapping, sprite, unselected })),
    );
    const worldSprites = Object.freeze(
      scenery
        .filter(({ unselected }) => unselected === null)
        .map(({ mapping, sprite }) =>
          Object.freeze({
            ...sprite,
            ...transformPlanarPoint(mapping.viewFromSource, sprite),
            sRender: activeS(mapping, sprite.sRender),
          }),
        ),
    );
    const groundProfile = Object.freeze({
      groundLeft: Math.min(...mapped.map((m) => -m.presentation.ground.domain.left + m.sourceLateralOrigin)),
      groundRight: Math.min(...mapped.map((m) => m.presentation.ground.domain.right - m.sourceLateralOrigin)),
    });
    if (groundProfile.groundLeft + groundProfile.groundRight <= 0)
      return Object.freeze({ ok: false as const, reason: 'presentation_strip_disjoint' as const });
    return Object.freeze({
      ok: true as const,
      value: Object.freeze({
        scope: 'occurrence-driving' as const,
        frame: active,
        range,
        world,
        geometry,
        presentation: Object.freeze({
          ground,
          groundProfile,
          visual,
          worldSprites,
          conditionalSprites: Object.freeze(
            scenery
              .filter(({ unselected }) => unselected !== null)
              .map(({ mapping, sprite, unselected }) =>
                Object.freeze({
                  unselected: unselected!,
                  sprite: Object.freeze({
                    ...sprite,
                    ...transformPlanarPoint(mapping.viewFromSource, sprite),
                    sRender: activeS(mapping, sprite.sRender),
                  }),
                }),
              ),
          ),
          backgroundAt(s: number) {
            const { address, mapping } = resolve(s, 0),
              source = mapping.presentation,
              background = source.backgrounds[profileIndexAt(source.visual.sections, 'sStart', address.sourceS)]!;
            return mapping.backgrounds[source.backgrounds.indexOf(background)]!;
          },
        }),
        metadata: Object.freeze({
          guideSegments: candidates.length,
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
            for (const [consumer, { demand }] of [
              ['physical', physical],
              ['presentation', presentation],
            ] as const) {
              const { pose, step } = demand;
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
            }
            return Object.freeze({ ok: true as const });
          },
        }),
      });
    },
  });
}
