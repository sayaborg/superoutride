import assert from 'node:assert/strict';
import test from 'node:test';
import { readDeliveredContent } from '../../tools/course/read-content.ts';
import { loadDeliveredCourse } from '../../src/content/load-delivered-course.js';
import { loadSurfaceMaterials } from '../../src/content/surface-material-catalog.js';
import { nextParting } from '../../src/race/next-parting.js';

const content = await readDeliveredContent();
const materials = await loadSurfaceMaterials(content);

test("the next parting's side shows from the gate before it to where the roads part, and none without one", async () => {
  // OUTRUN B takes its forks L, R, L, L; each stage after a fork has a checkpoint.
  const course = await loadDeliveredCourse(content, 'outrun-b', materials);
  const { gates } = course;
  const partings = gates.intervals.flatMap((i) => i.partings.map((p) => ({ section: i.section, ...p })));
  assert.deepEqual(
    partings.map((p) => p.side),
    ['left', 'right', 'left', 'left'],
  );
  // From the start, the first fork's side; past each parting, none until the next stage's checkpoint.
  assert.equal(nextParting(gates, course.entry, 0), 'left');
  const [first, second] = partings;
  assert.equal(nextParting(gates, first.section, first.at.s + 1), null);
  const checkpoint = gates.intervals.flatMap((i) => i.checkpoints)[0];
  assert.equal(nextParting(gates, checkpoint.section, checkpoint.at.s - 1), null);
  assert.equal(nextParting(gates, checkpoint.section, checkpoint.at.s), second.side);
  // The last stage, after the last parting's checkpoint, ends in its finish: nothing shows.
  const last = gates.intervals.flatMap((i) => i.checkpoints).at(-1);
  assert.equal(nextParting(gates, last.section, last.at.s), null);
  // A course without partings shows none.
  const africa = await loadDeliveredCourse(content, 'super-hang-on-africa', materials);
  assert.equal(nextParting(africa.gates, africa.entry, 0), null);
});
