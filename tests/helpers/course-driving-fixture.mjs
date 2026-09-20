import assert from 'node:assert/strict';
import { presentationDocument } from './course-presentation-documents.mjs';
import { compileCourseDocument } from '../../dist/compiler/compiled-course.js';
import { createCourseGeometryTraversal } from '../../dist/runtime/course-occurrence.js';
import { createCourseGeometryView } from '../../dist/runtime/course-geometry-view.js';
export const ok = (result) => {
  assert.equal(result.ok, true, result.ok ? undefined : JSON.stringify(result));
  return result.value;
};
export const cameraProfile = Object.freeze({
  dCam: 5,
  height: 2.469902425419539,
  baseDownPitch: (12 * Math.PI) / 180,
  focalLength: 200,
  centerX: 160,
  centerY: 120,
  directionSpeedMin: 0.25,
  playerTargetY: 190,
  tauVertical: 0.22,
  deltaYMax: 4,
});

/** Explicit diagnostic course/presentation, not authored-image admission or product art acceptance. */
export async function courseDrivingFixture(turn = 30) {
  const { document, inputs } = await presentationDocument('linear');
  const source = document.sections[0];
  source.start.heading = 27;
  source.primitives[0].length = 1200;
  source.primitives[1].radius = 300;
  source.primitives[1].turn = turn;
  source.primitives[2].length = 2200;
  source.height.splice(
    1,
    0,
    { anchor: { kind: 'primitive', primitiveId: 'approach', fraction: 0.5 }, y: 4 },
    { anchor: { kind: 'primitive', primitiveId: 'approach', fraction: 1 }, y: 0 },
    { anchor: { kind: 'primitive', primitiveId: 'bend', fraction: 1 }, y: 2 },
  );
  return ok(await compileCourseDocument(document, inputs));
}

export function queryDemand(pose) {
  const extent = { behind: 300, ahead: 400 };
  return {
    pose,
    consumers: { cameraRender: extent, contact: extent, driverLookahead: extent, reverseRecovery: extent },
  };
}
export function drivingWindow(course, pose) {
  const traversal = createCourseGeometryTraversal(course.entry, { retainBehind: 0, selectAhead: 0, maxOccurrences: 2 });
  const demand = queryDemand(pose);
  return { demand, view: ok(createCourseGeometryView(traversal.snapshot(), demand)) };
}
