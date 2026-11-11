import assert from 'node:assert/strict';
import test from 'node:test';
import { nearestLine, rowEntry, stagePalettes, stripes } from '../../tools/road-data/big-run/big-run-road-picture.ts';
import { lineRuns, paintedRuns, roadPictureOf } from '../../tools/road-data/jaleco/road-lines.ts';
import { rgb555Of } from '../../tools/road-data/jaleco/palette.ts';
import { lanesOverTwoRoads } from '../../tools/road-data/shared/two-roads.ts';

const writer = (bytes) => {
  const put = (at, words) =>
    words.forEach((w, i) => ((bytes[at + 2 * i] = (w >> 8) & 0xff), (bytes[at + 2 * i + 1] = w & 0xff)));
  return { put, long: (at, v) => put(at, [(v >>> 16) & 0xffff, v & 0xffff]) };
};

/** The first road CPU's picking of a row's line at 0xCA8, as BIG RUN's, its line kinds' table at 0x1900. */
function roadCpu() {
  const p = new Uint8Array(0x4000);
  const { put } = writer(p);
  put(0xca8, [0x3a3c, 0xbb, 0x302a, 0x0016, 0x0c40, 4]);
  put(0xcb8, [0x3a3c, 0x7ed, 0x0c6a, 2, 0x0018]);
  put(0xcc6, [0x3a3c, 0x7ef, 0x0c6a, 6, 0x0018]);
  put(0xcd4, [0x3a3c, 0x50c, 0x4a79, 0x000c, 0x0096]);
  put(0xce2, [0x3a3c, 0x7ee]);
  put(0xcea, [0x41fa, 0x1900 - 0xcec]);
  put(0x1900, [0, 1841, 0, 0, 184]);
  put(0xd2c, [0x41f9, 0, 0x2000]);
  for (let k = 0; k < 0x1fe; k++) put(0x2000 + 2 * k, [k < 255 ? 1 : 5]);
  return p;
}

test("a row's picture is its line kind's nearest line, kind 4 one line by its variant", () => {
  const cpu = roadCpu();
  assert.equal(nearestLine(cpu, 1, 0, 0, false), 187);
  assert.equal(nearestLine(cpu, 1, 2, 0, false), 187 + 1841);
  assert.equal(nearestLine(cpu, 1, 8, 0, false), 187 + 184);
  assert.deepEqual(
    [2, 6, 0].map((v) => nearestLine(cpu, 1, 4, v, false)),
    [0x7ed, 0x7ef, 0x7ee],
  );
  assert.equal(nearestLine(cpu, 1, 4, 0, true), 0x50c);
  assert.deepEqual(stripes(cpu, 1).slice(253, 257), [1, 1, 5, 5]);
});

test("a line's runs are its pens' from its centre, its centre's pen its surface, its ends' the ground or clear", () => {
  const rom = new Uint8Array(512 * 2);
  // Line 1: clear to −20, edge pen 1 to −10, surface pen 5 with a line of pen 6 at 3 to 6, edge pen 7, ground pen 11.
  const pens = (x) => {
    const d = x - 512;
    return d < -20 ? 15 : d < -10 ? 1 : d < 3 ? 5 : d < 6 ? 6 : d < 10 ? 5 : d < 20 ? 7 : 11;
  };
  for (let x = 0; x < 1024; x += 2) rom[512 + x / 2] = (pens(x) << 4) | pens(x + 1);
  const runs = paintedRuns(lineRuns(rom, 1));
  assert.deepEqual(
    runs.map((r) => [r.from, r.to, r.pen, r.paint]),
    [
      [-512, -20, null, 'clear'],
      [-20, -10, 1, 'edge'],
      [-10, 3, 5, 'surface'],
      [3, 6, 6, 'line'],
      [6, 10, 5, 'surface'],
      [10, 20, 7, 'edge'],
      [20, 512, 11, 'outside'],
    ],
  );
  // Its road picture: the lanes over two roads read their lane lines and edges from it.
  const lanes = lanesOverTwoRoads(roadPictureOf(runs));
  assert.deepEqual([lanes.half, lanes.inside, lanes.outer], [20, 10, 5.5]);
});

test("a row's entry is its kind's and variant's, by its stripe", () => {
  assert.deepEqual([rowEntry(2, 0, false, 1), rowEntry(2, 3, false, 1)], [40, 32]);
  assert.deepEqual([rowEntry(6, 1, true, 3), rowEntry(20, 1, false, 3), rowEntry(20, 1, false, 5)], [7, 32, 33]);
});

test("a stage's palettes are the road layers', with STARTING RUN's town, its stage's entry 31 and sky's sets", () => {
  const main = new Uint8Array(0x140000);
  const { put, long } = writer(main);
  put(0x176a, [0x41f9, 0x0011, 0x8880]);
  put(0xb8fa, [0x41f9, 0x0007, 0x3000]);
  put(0xb924, [0x41f9, 0x0007, 0x4440]);
  put(0xb93e, [0x41f9, 0x0007, 0x5880]);
  put(0xb8de, [0x41fa, 0xba08 - 0xb8e0]);
  put(0xb97e, [0x41fa, 0xba20 - 0xb980]);
  put(0x118880 + 32 * 40 + 2 * 8, [0x1230]);
  put(0x73000 + 24 * 2, [0x4440]); // layer 0's entry 3, pen 0
  put(0x74440 + 24 * 2, [0x5550]); // layer 1's
  put(0x75880, [0x6660]);
  long(0xba08 + 4, 0x30000);
  long(0x30000 + 6, 0x31000);
  put(0x31000, [0x7770]);
  long(0xba20 + 8 + 4, 0x32000);
  put(0x32000 + 32 * 2, [0x8880]); // stage 1's sky, set 0, entry 27
  put(0x32000 + 0xc0 * 15 + 32 * 2, [0x9990]); // set 15
  const [l0, l1] = stagePalettes(main, 1);
  assert.equal(l0[40][8], rgb555Of(0x1230));
  assert.deepEqual([l0[3][0], l1[3][0]], [rgb555Of(0x4440), rgb555Of(0x5550)]);
  assert.deepEqual([l0[31][0], stagePalettes(main, 0)[0][31][0]], [rgb555Of(0x7770), rgb555Of(0x6660)]);
  assert.deepEqual([l1[27][0], stagePalettes(main, 1, 15)[1][27][0]], [rgb555Of(0x8880), rgb555Of(0x9990)]);
});
