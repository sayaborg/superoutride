import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const course = (id) =>
  JSON.parse(readFileSync(new URL(`../../content/originals/courses/${id}.course.json`, import.meta.url), 'utf8'));

test("CHASE H.Q.'s fork shows no ground between its road narrowing and the road not taken", () => {
  for (const stage of [1, 2, 3, 4, 5])
    for (const side of ['left', 'right']) {
      const { sections } = course(`chase-hq-${stage}-${side}`);
      const k = sections.findIndex((s) => (s.boundaries ?? []).some((b) => b.id.startsWith('not-taken')));
      assert.ok(k > 0, `chase-hq-${stage}-${side} draws no road not taken`);
      // The 12.3 m before the fork: the one road the original draws, its body across its full mask in metres.
      const [, body] = sections[k - 1].strips.filter((s) => s.material === 'ASPHALT');
      assert.equal(typeof body.left, 'number');
      assert.equal(typeof body.right, 'number');
      // From the fork's record on, the road not taken starts where that one road's other side was, its inner side at P.
      const first = (id) => sections[k].boundaries.find((b) => b.id === id).knots[0].lateral;
      const [inner, outer] =
        side === 'left' ? ['not-taken-left', 'not-taken-right'] : ['not-taken-right', 'not-taken-left'];
      assert.equal(first(inner), 0);
      assert.equal(first(outer), side === 'left' ? body.right : body.left);
    }
});
