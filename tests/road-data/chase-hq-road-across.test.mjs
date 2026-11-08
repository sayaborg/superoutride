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
const colors = () => ({ edge: [1, 2, 1, 2, 1, 2, 1, 2], body: [3, 4, 3, 4, 3, 4, 3, 4] });
const at = (s) => ({ joint: 'test', offset: s });

test("a Section's road bands are cut where the road's material changes, its edges the outermost", () => {
  // Two records of six lanes, the second dirt road: each band's base color, asphalt then dirt.
  const sub = new Uint8Array(0x4c00);
  [
    [0x4bce, 0x0c02, 4],
    [0x4bd4, 0x0210, 0x00f0],
    [0x4bda, 0x0c02, 5],
    [0x4be0, 0x0210, 0x000f],
  ].forEach(([a, w0, w1]) => sub.set([w0 >> 8, w0 & 255, w1 >> 8, w1 & 255], a));
  const { strips, outermost } = spanBands(
    sub,
    [record(0), record(6)],
    { from: 0, to: 2 * RECORD_METRES },
    0.5,
    colors,
    at,
  );
  assert.deepEqual(
    strips.map((s) => [s.start.offset, s.end.offset, s.color, s.material]),
    [
      [0, RECORD_METRES, 1, 'ASPHALT'],
      [0, RECORD_METRES, 3, 'ASPHALT'],
      [0, RECORD_METRES, 1, 'ASPHALT'],
      [RECORD_METRES, 2 * RECORD_METRES, 1, 'DIRT'],
      [RECORD_METRES, 2 * RECORD_METRES, 3, 'DIRT'],
      [RECORD_METRES, 2 * RECORD_METRES, 1, 'DIRT'],
    ],
  );
  assert.deepEqual(
    [outermost[0].band.left, outermost[0].band.right, outermost[1].band.left, outermost[1].band.right],
    [-11.3, -10.8, 10.8, 11.3],
  );
});
