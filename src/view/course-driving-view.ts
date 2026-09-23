import { createBandGroundSampler } from '../course/band-ground.js';
import type { CourseGround } from '../course/compiler/course-ground.js';
import type { CompiledSection } from '../course/compiler/course-graph.js';
import type { compileCoursePhysicalDomains } from '../course/compiler/course-physical-overlap.js';
import type { compileCoursePresentationDomains } from '../course/compiler/course-presentation-overlap.js';
import type { createCourseDrivingReaders } from '../course/course-driving-readers.js';
import { knotIndexAt } from '../course/geometry/knot-sequence.js';
import type { VisualProfileReader } from '../course/visual-profile.js';
import { transformPlanarPoint } from '../core/planar-transform.js';
import { createCourseRenderResources } from './course-render-resources.js';
import type { BandGroundReader } from './renderer.js';

type Physical = Extract<ReturnType<typeof compileCoursePhysicalDomains>, { ok: true }>['value'];
type Presentation = Extract<ReturnType<typeof compileCoursePresentationDomains>, { ok: true }>['value'];
type DrivingView = Extract<
  ReturnType<ReturnType<typeof createCourseDrivingReaders>['createView']>,
  { ok: true }
>['value'];

/** Rendering readers overlay the exact occurrence mapping already admitted by the physical source. */
export function createCourseDrivingViewSource(fields: CourseGround, physical: Physical, presentation: Presentation) {
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
  const resources = createCourseRenderResources();
  const presentations = new Map<CompiledSection, ReturnType<typeof resources.createSectionReaders>>();
  const sourcePresentation = (section: CompiledSection) => {
    let value = presentations.get(section);
    if (!value) {
      if (!section.presentation) throw new Error('Admitted driving view lost its presentation');
      value = resources.createSectionReaders(
        section.presentation,
        { length: section.raster.length, raster: section.raster },
        section.height,
        section.renderHeight,
      );
      presentations.set(section, value);
    }
    return value;
  };
  const views = new WeakMap<DrivingView['mapping'], ReturnType<typeof createView>>();
  const createView = (view: DrivingView) => {
    const { range, mapping: shared } = view;
    const { check, resolve, activeS } = shared;
    if (shared.mapped.some((span) => !span.occurrence.section.presentation))
      return Object.freeze({ ok: false as const, reason: 'presentation_unavailable' as const });
    const mapped = shared.mapped.map((span) => ({
      ...span,
      presentation: sourcePresentation(span.occurrence.section),
      backgrounds: sourcePresentation(span.occurrence.section).backgrounds.map((background) =>
        Object.freeze({
          ...background,
          yawOriginRadians:
            background.yawOriginRadians + Math.atan2(span.viewFromSource.sine, span.viewFromSource.cosine),
        }),
      ),
    }));
    const presentationAt = new Map(shared.mapped.map((mapping, i) => [mapping, mapped[i]!]));
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
      courseLength: view.geometry.length,
      sections: visualSections,
      sample(s: number) {
        check(s);
        return visualSections[knotIndexAt(visualSections, 'sStart', s)]!;
      },
      distanceToNextSection(s: number) {
        check(s);
        const index = knotIndexAt(visualSections, 'sStart', s);
        return (visualSections[index + 1]?.sStart ?? range.end) - s;
      },
    });
    const ground: BandGroundReader = Object.freeze({
      kind: 'bands' as const,
      ...createBandGroundSampler(
        mapped.map((mapping) => ({
          ground: fields.forSection(mapping.occurrence.section),
          frameStart: mapping.frameStart,
          nativeStart: mapping.sourceRange.start,
          nativeEnd: mapping.sourceRange.end,
          lateralOrigin: mapping.sourceLateralOrigin,
        })),
      ),
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
    const groundRuler = Object.freeze({ groundLeft: 1, groundRight: 1 });
    return Object.freeze({
      ok: true as const,
      value: Object.freeze({
        ground,
        groundRuler,
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
          const { address, mapping: physicalMapping } = resolve(s, 0),
            mapping = presentationAt.get(physicalMapping)!,
            source = mapping.presentation,
            background = source.backgrounds[knotIndexAt(source.visual.sections, 'sStart', address.sourceS)]!;
          return mapping.backgrounds[source.backgrounds.indexOf(background)]!;
        },
      }),
    });
  };
  return Object.freeze({
    createView(view: DrivingView) {
      if (view.physical !== physical) throw new RangeError('Rendering view requires its physical source');
      const cached = views.get(view.mapping);
      if (cached) return cached;
      const result = createView(view);
      if (result.ok) views.set(view.mapping, result);
      return result;
    },
  });
}
