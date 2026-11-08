import assert from 'node:assert/strict';
import test from 'node:test';
import { RECORD_METRES } from '../../tools/road-data/chase-hq/chase-hq-plan.ts';
import { spanBands } from '../../tools/road-data/chase-hq/chase-hq-road-across.ts';

const record = (kind) => ({
  curve: 0,
  grade: 0,
  event: 0,
  secondRoad: 0,
  mask: 0x7e,
  kind,
  scene: 0,
  palette: 0,
  background: 0,
  parameter: 0,
});
const colors = (set) => ({
  edge: [1, 2, 1, 2, 1, 2, 1, 2].map((c) => c + 10 * set),
  body: [3, 4, 3, 4, 3, 4, 3, 4].map((c) => c + 10 * set),
});
const one = [{ from: 0, to: 2 * RECORD_METRES, colors: 0, before: null }];
/** The six lanes' sub program words a merge's mask reads (S 0x4BCE to 0x4BE0). */
const subProgram = () => {
  const sub = new Uint8Array(0x4c00);
  [
    [0x4bce, 0x0c02, 4],
    [0x4bd4, 0x0210, 0x00f0],
    [0x4bda, 0x0c02, 5],
    [0x4be0, 0x0210, 0x000f],
  ].forEach(([a, w0, w1]) => sub.set([w0 >> 8, w0 & 255, w1 >> 8, w1 & 255], a));
  return sub;
};
const at = (s) => ({ joint: 'test', offset: s });

test("a Section's road bands are cut where the road's material changes, its edges the outermost", () => {
  // Two records of six lanes, the second dirt road: each band's base color, asphalt then dirt.
  const sub = subProgram();
  const { strips, outermost } = spanBands(
    sub,
    [record(0), record(6)],
    { from: 0, to: 2 * RECORD_METRES },
    0.5,
    one,
    colors,
    at,
  );
  assert.deepEqual(
    strips.map((s) => [s.start.offset, s.end.offset, s.color, s.material]),
    [
      [0, RECORD_METRES, 1, 'ASPHALT'],
      [RECORD_METRES, 2 * RECORD_METRES, 1, 'DIRT'],
      [0, RECORD_METRES, 3, 'ASPHALT'],
      [RECORD_METRES, 2 * RECORD_METRES, 3, 'DIRT'],
      [0, RECORD_METRES, 1, 'ASPHALT'],
      [RECORD_METRES, 2 * RECORD_METRES, 1, 'DIRT'],
    ],
  );
  assert.deepEqual(
    [outermost[0].band.left, outermost[0].band.right, outermost[1].band.left, outermost[1].band.right],
    [-11.3, -10.8, 10.8, 11.3],
  );
});

test("a road band's color at a place is its colors' stretch's, however the bands are cut", () => {
  // A change of colors from 10 m over 10 m; the bands cut nowhere else, or every metre.
  const stretches = [
    { from: 0, to: 10, colors: 0, before: null },
    { from: 10, to: 20, colors: 1, before: 0 },
    { from: 20, to: 2 * RECORD_METRES, colors: 1, before: null },
  ];
  const span = { from: 0, to: 2 * RECORD_METRES };
  const bands = (cuts) =>
    spanBands(
      subProgram(),
      [record(0), record(0)],
      span,
      0.5,
      stretches,
      colors,
      at,
      undefined,
      undefined,
      undefined,
      cuts,
    ).strips;
  // Each band's color at station `s`: its Strip's there, a band told by its left side.
  const lefts = [
    { lane: 'a', side: 'left', offset: -0.5 },
    { lane: 'a', side: 'left', offset: 0 },
    { lane: 'f', side: 'right', offset: 0 },
  ].map((l) => JSON.stringify(l));
  const colorAt = (strips, s) =>
    lefts.map(
      (left) => strips.find((t) => JSON.stringify(t.left) === left && t.start.offset <= s && s < t.end.offset)?.color,
    );
  const [whole, cut] = [bands([]), bands(Array.from({ length: 49 }, (_, k) => k + 0.5))];
  assert.ok(cut.length > whole.length);
  for (let s = 0.25; s < 2 * RECORD_METRES; s += 0.5) assert.deepEqual(colorAt(cut, s), colorAt(whole, s), `at ${s} m`);
  assert.deepEqual(colorAt(whole, 15), [
    { from: 1, to: 11 },
    { from: 3, to: 13 },
    { from: 1, to: 11 },
  ]);
});
