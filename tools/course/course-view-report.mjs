import { createCourseGeometryTraversal } from '../../dist/runtime/course-occurrence.js';
import { createCourseGeometryView } from '../../dist/runtime/course-geometry-view.js';
import { createCourseSectionDrivingSource } from '../../dist/runtime/course-section-driving-view.js';
import { courseSectionDrivingDemand } from '../../dist/runtime/course-driving-demand.js';
import { createCourseDrivingSource } from '../../dist/runtime/course-driving-view.js';
import { compileCoursePhysicalDomains } from '../../dist/compiler/course-physical-overlap.js';
import { compileCoursePresentationDomains } from '../../dist/compiler/course-presentation-overlap.js';

/** Resolve an explicit inspection itinerary once above narrow driving consumers. */
function itinerary(course, linkIds, activeIndex) {
  if (!Array.isArray(linkIds) || linkIds.some((id) => typeof id !== 'string') || typeof activeIndex !== 'number')
    throw new TypeError('Itinerary requires Link ID strings and a numeric active index');
  if (!Number.isSafeInteger(activeIndex) || activeIndex < 0 || activeIndex > linkIds.length)
    throw new RangeError('Active index must belong to the explicit itinerary');
  const traversal = createCourseGeometryTraversal(course.entry, {
    retainBehind: Number.MAX_VALUE,
    selectAhead: Number.MAX_VALUE,
    maxOccurrences: Math.max(2, linkIds.length + 1),
  });
  let cursor = traversal.snapshot().active;
  for (const [index, id] of linkIds.entries()) {
    const link = cursor.section.outgoing.find((value) => value.id === id);
    if (!link) return { ok: false, reason: 'unknown_link', index, message: `No outgoing Link ${JSON.stringify(id)}` };
    const result = traversal.select(cursor, link);
    if (!result.ok) return result;
    cursor = result.value;
    if (index < activeIndex) {
      const advanced = traversal.forward();
      if (!advanced.ok) return advanced;
    }
  }
  return { ok: true, value: traversal.snapshot() };
}

/** Scoped saved-content readers; no field lock or actor seam transaction is performed. */
export function courseOccurrenceDrivingReport(course, input) {
  if (!input || !Array.isArray(input.observations))
    throw new TypeError('Occurrence driving requires an inspection request');
  const physical = compileCoursePhysicalDomains(course.links, input.physical);
  if (!physical.ok) return physical;
  const presentation = compileCoursePresentationDomains(course.links, input.presentation);
  if (!presentation.ok) return presentation;
  const history = itinerary(course, input.links, input.activeIndex);
  if (!history.ok) return history;
  const geometry = createCourseGeometryView(history.value, input.view);
  if (!geometry.ok) return geometry;
  const driving = createCourseDrivingSource(physical.value, presentation.value).createView(geometry.value);
  if (!driving.ok) return driving;
  const d = driving.value;
  return {
    ok: true,
    value: {
      scope: d.scope,
      frame: { section: d.frame.section.id, occurrence: d.frame.ordinal },
      range: d.range,
      metadata: d.metadata,
      scenery: d.presentation.worldSprites.length,
      observations: input.observations.map(({ s, l }) => ({
        guide: d.world.guide.toWorld(s, l),
        height: d.world.height.samplePhysicsDifferential(s),
        surface: d.world.surfaces.sample(s, l).type,
        color: d.presentation.ground.sampleAtLevel(s, l, 0),
      })),
    },
  };
}

/** Explicit offline itinerary; no successor is guessed and no actor is committed. */
export function courseViewReport(course, args) {
  const [sText, behindText, aheadText, activeText, ...linkIds] = args;
  const s = Number(sText),
    behind = Number(behindText),
    ahead = Number(aheadText),
    activeIndex = Number(activeText);
  if (
    [sText, behindText, aheadText, activeText].some((v) => v === undefined) ||
    ![s, behind, ahead].every(Number.isFinite) ||
    behind < 0 ||
    ahead < 0 ||
    !Number.isSafeInteger(activeIndex) ||
    activeIndex < 0 ||
    activeIndex > linkIds.length
  )
    throw new TypeError('View arguments: <source-s> <behind> <ahead> <active-index> [Link-ID ...]');
  const history = itinerary(course, linkIds, activeIndex);
  if (!history.ok) return history;
  const extent = { behind, ahead };
  const result = createCourseGeometryView(history.value, {
    pose: { minS: s, maxS: s, maxAdvance: 0 },
    consumers: { cameraRender: extent, contact: extent, driverLookahead: extent, reverseRecovery: extent },
  });
  if (!result.ok) return result;
  const view = result.value;
  return {
    ok: true,
    value: {
      scope: view.scope,
      frame: { section: view.frame.section.id, occurrence: view.frame.ordinal },
      visitedOccurrences: history.value.occurrences.length,
      selectedOccurrences: history.value.selected.length,
      length: view.length,
      coverage: view.coverage,
      spans: view.spans.map((span) => ({
        start: span.start,
        end: span.end,
        section: span.occurrence.section.id,
        occurrence: span.occurrence.ordinal,
        incomingLink: span.occurrence.incoming?.id ?? null,
        sourceAnchorS: span.sourceAnchorS,
        viewAnchorS: span.viewAnchorS,
        sourceLateralOrigin: span.sourceLateralOrigin,
        viewFromSource: span.viewFromSource,
      })),
      endpoints: [0, view.length].map((position) => view.geometry.guideAt(position, 0)),
    },
  };
}

/** Inspect the same bounded source readers used by the real driving integration probe. */
export function courseDrivingViewReport(course, args) {
  if (args.length !== 7)
    throw new TypeError(
      'Driving view requires min-s max-s advance camera-distance render-depth recovery-backtrack last-safe-s',
    );
  const [minS, maxS, maxAdvance, dCam, dMax, backtrackDistance, lastSafeS] = args.map(Number);
  const demand = courseSectionDrivingDemand(
    course.entry.guide,
    { minS, maxS, maxAdvance },
    { dCam },
    { dMax },
    { backtrackDistance, lastSafeS },
  );
  const traversal = createCourseGeometryTraversal(course.entry, { retainBehind: 0, selectAhead: 0, maxOccurrences: 2 });
  const geometry = createCourseGeometryView(traversal.snapshot(), demand);
  if (!geometry.ok) return geometry;
  const driving = createCourseSectionDrivingSource(course.entry).createView(geometry.value);
  if (!driving.ok) return driving;
  const view = driving.value;
  return {
    ok: true,
    value: {
      scope: view.scope,
      section: view.frame.section.id,
      range: view.range,
      demand,
      qualification: {
        scope: view.qualification.scope,
        interval: view.qualification.interval,
        cells: view.qualification.cells,
      },
      metadata: view.metadata,
      observations: [minS, maxS].map((s) => ({
        guide: view.world.guide.toWorld(s, 0),
        height: view.world.height.samplePhysicsDifferential(s),
        surface: view.world.surfaces.sample(s, 0).type,
      })),
    },
  };
}
