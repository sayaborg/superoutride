import { createCourseGeometryTraversal } from '../../dist/runtime/course-occurrence.js';
import { createCourseGeometryView } from '../../dist/runtime/course-geometry-view.js';

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
    throw new TypeError('View arguments: <source-s> <behind> <ahead> <active-index> [visited-Link-ID ...]');
  // Retain this finite explicit itinerary. Interactive traversal can use a consumer-derived smaller extent.
  const traversal = createCourseGeometryTraversal(course.entry, {
    retainBehind: Number.MAX_VALUE,
    selectAhead: Number.MAX_VALUE,
    maxOccurrences: Math.max(2, linkIds.length + 1),
  });
  let cursor = traversal.snapshot().active;
  for (const [index, id] of linkIds.entries()) {
    const link = cursor.section.outgoing.find((value) => value.id === id);
    if (!link)
      return {
        ok: false,
        reason: 'unknown_link',
        index,
        message: `No outgoing Link ${JSON.stringify(id)}`,
      };
    const result = traversal.select(cursor, link);
    if (!result.ok) return result;
    cursor = result.value;
    if (index < activeIndex) {
      const advanced = traversal.forward();
      if (!advanced.ok) return advanced;
    }
  }
  const extent = { behind, ahead };
  const result = createCourseGeometryView(traversal.snapshot(), {
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
      visitedOccurrences: traversal.snapshot().occurrences.length,
      selectedOccurrences: traversal.snapshot().selected.length,
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
