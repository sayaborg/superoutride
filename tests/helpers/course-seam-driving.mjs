import { compileCourseDocument } from '../../dist/compiler/compiled-course.js';
import { compileCoursePhysicalDomains } from '../../dist/compiler/course-physical-overlap.js';
import { compileCoursePresentationDomains } from '../../dist/compiler/course-presentation-overlap.js';
import { createCourseDrivingSource } from '../../dist/runtime/course-driving-view.js';
import { courseSectionDrivingDemand } from '../../dist/runtime/course-driving-demand.js';
import { createCourseGeometryTraversal } from '../../dist/runtime/course-occurrence.js';
import { createCourseGeometryView } from '../../dist/runtime/course-geometry-view.js';
import { RECOVERY_PROFILE } from '../../dist/gameplay/recovery.js';
import { commonPresentationDocument } from './course-common-presentation.mjs';
import { cameraProfile, ok } from './course-driving-probe.mjs';

export async function createSeamDrivingFixture(
  shiftDestination = 0,
  name = 'linked-linear',
  selectLinks = (c) => c.links,
) {
  const f = await commonPresentationDocument(name, (d) => {
    for (const s of d.sections) {
      s.primitives[0].length = 2000;
      for (const b of s.boundaries)
        for (const k of b.knots) if (k.anchor.kind === 'absolute' && k.anchor.s === 300) k.anchor.s = 2000;
      for (const p of s.ports) p.anchor = { kind: 'absolute', s: p.kind === 'entry' ? 500 : 1400 };
    }
    for (const l of d.links) l.overlap = { behind: 500, ahead: 500 };
    if (shiftDestination !== 0)
      for (const boundary of d.sections[1].boundaries) for (const knot of boundary.knots) knot.l += shiftDestination;
  });
  for (const s of f.document.sections) {
    s.presentation.ground.left = 1000;
    s.presentation.ground.right = 1000;
    // This edge case has no stamps: a fractional chart offset is not a shared stamp texel lattice.
    if (shiftDestination !== 0) s.presentation.ground.stamps = [];
  }
  const c = ok(await compileCourseDocument(f.document, f.inputs));
  const pose = { behind: 20, ahead: 20, left: 1, right: 1 },
    step = { behind: 1, ahead: 1, left: 0.1, right: 0.1 };
  const physical = ok(
    compileCoursePhysicalDomains(selectLinks(c), {
      pose,
      step,
      consumers: {
        contact: { behind: 300, ahead: 300, left: 8, right: 8 },
        driverLookahead: { behind: 0, ahead: 400, left: 0, right: 0 },
        reverseRecovery: { behind: 300, ahead: 300, left: 2, right: 2 },
      },
    }),
  );
  const footprint = { behind: 8, ahead: 198, left: 200, right: 200 };
  const presentation = ok(
    compileCoursePresentationDomains(selectLinks(c), {
      pose,
      step,
      consumers: { cameraRender: footprint, groundFilter: footprint, scenery: footprint },
    }),
  );
  const traversal = createCourseGeometryTraversal(c.entry, {
    retainBehind: 1000,
    selectAhead: 1000,
    maxOccurrences: 4,
  });
  ok(traversal.select(traversal.snapshot().active, c.links[0]));
  return { c, traversal, source: createCourseDrivingSource(physical, presentation), physical, presentation, saved: f };
}
export function seamDrivingView(f, s = 1400, slack = 20) {
  const active = f.traversal.snapshot().active.section;
  const d = courseSectionDrivingDemand(
    active.guide,
    { minS: s - slack, maxS: s + slack, maxAdvance: 1 },
    cameraProfile,
    { dMax: 200 },
    { ...RECOVERY_PROFILE, lastSafeS: s },
  );
  const geometry = ok(createCourseGeometryView(f.traversal.snapshot(), d));
  return { geometry, driving: ok(f.source.createView(geometry)) };
}
