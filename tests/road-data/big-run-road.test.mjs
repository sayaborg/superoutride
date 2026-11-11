import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ANGLE_RADIANS,
  bigRunRoad,
  positionMetres,
  stageCheckpoint,
  stageGoal,
  stageGrid,
} from '../../tools/road-data/big-run/big-run-road.ts';
import { bigRunPlan } from '../../tools/road-data/big-run/big-run-plan.ts';
import { bigRunProfile } from '../../tools/road-data/big-run/big-run-heights.ts';

const writer = (bytes) => {
  const put = (at, words) =>
    words.forEach((w, i) => ((bytes[at + 2 * i] = (w >> 8) & 0xff), (bytes[at + 2 * i + 1] = w & 0xff)));
  return { put, long: (at, v) => put(at, [(v >>> 16) & 0xffff, v & 0xffff]) };
};

/**
 * A road CPU's program holding stage 1's tables for road `road` at the address its road CPU reads them from: plan
 * records `plan` ({ start, radius, flag, heading, x, y, kind }) and profile records `profile` ({ start, radius, flag,
 * height, grade }).
 */
function roadProgram(road, plan, profile) {
  const p = new Uint8Array(0x10000);
  const { put, long } = writer(p);
  const lea = road === 1 ? 0xa1e : 0xa0e;
  const table = 0x900;
  put(lea, [0x41fa, table - lea - 2, 0xe940, 0xd0c0, 0x2258, 0x2458, 0x2858, 0x2a58]);
  const at = table + 16; // stage 1
  [0x2000, 0x3000, 0x4000, 0x5000].forEach((v, k) => long(at + 4 * k, v));
  plan.forEach((r, k) => {
    long(0x2000 + 4 * k, r.start);
    const a = 0x3000 + 26 * k;
    put(a, [r.flag, r.radius]);
    long(a + 6, r.y);
    long(a + 0xa, r.x);
    put(a + 0xe, [r.heading]);
    put(a + 0x16, [r.kind ?? 0, 0]);
  });
  long(0x2000 + 4 * plan.length, 0xffffffff);
  profile.forEach((r, k) => {
    long(0x4000 + 4 * k, r.start);
    const a = 0x5000 + 24 * k;
    put(a, [r.flag, r.radius]);
    long(a + 6, r.height);
    put(a + 0xe, [r.grade & 0xffff]);
  });
  long(0x4000 + 4 * profile.length, 0xffffffff);
  return p;
}

const QUARTER = 0x1000;

test("a road's tables are its road CPU's, a flag's top bit an arc to the right, its heading turning right", () => {
  // Straight along heading 0 for 1000, a quarter turn right of radius 2000, then straight on to the right.
  const R = 2000;
  const turn = (Math.PI / 2) * R;
  const plan = [
    { start: 0, radius: 0, flag: 0, heading: 0, x: 0, y: 0, kind: 8 },
    { start: 1000, radius: R, flag: 0x8000, heading: 0, x: 1000, y: 0 },
    { start: 1000 + Math.round(turn), radius: 0, flag: 0, heading: QUARTER, x: 1000 + R, y: R },
  ];
  const profile = [{ start: 0, radius: 0, flag: 0, height: 0, grade: 0 }];
  for (const road of [1, 2]) {
    const tables = bigRunRoad(roadProgram(road, plan, profile), road, 1, 9000);
    assert.deepEqual(
      tables.plan.map((r) => [r.start, r.radius, r.side, r.heading, r.x, r.y]),
      plan.map((r) => [r.start, r.radius, r.flag ? 'right' : 'left', r.heading, r.x, r.y]),
    );
    assert.equal(tables.plan[0].kind, 8);
    // Records from `end` on are not read.
    assert.equal(bigRunRoad(roadProgram(road, plan, profile), road, 1, 1000).plan.length, 1);
  }
  // Laid by the shared rule its arc turns right, onto the table's next heading and position.
  const tables = bigRunRoad(roadProgram(2, plan, profile), 2, 1, 9000);
  const laid = bigRunPlan(tables.plan, tables.plan, 9000, 0.0132, () => 10);
  assert.ok(Math.abs(laid.p.elements[1].turn + Math.PI / 2) < 1e-3);
  assert.ok(laid.p.fidelity.position < 1 && laid.p.fidelity.heading < 0.03 * ANGLE_RADIANS * 50);
  assert.deepEqual(laid.beside.partings, []);
});

test("a road position is the speed's shown km/h over its half position a tick, at 30 ticks a second", () => {
  const main = new Uint8Array(0x20000);
  const { put } = writer(main);
  put(0x15dea, [0x3039, 0x000f, 0x3056, 0xc0fc, 0xb6db, 0x4840]);
  put(0x3248, [0x382e, 0x0016, 0xe24c]);
  assert.ok(Math.abs(positionMetres(main) - ((0xb6db / 0x10000) * (1 / 30)) / (3.6 * 0.5)) < 1e-15);
});

test("a stage's goal, checkpoint and grid are the main program's tables a stage", () => {
  const main = new Uint8Array(0x2000);
  const { put, long } = writer(main);
  put(0x10a2, [0x41fa, 0x1156 - 0x10a4]);
  put(0x10b8, [0x41fa, 0x116e - 0x10ba]);
  put(0xf54, [0x41fa, 0x1186 - 0xf56]);
  put(0xf60, [0xed48]);
  long(0x1156 + 4, 370000);
  long(0x116e, 999999);
  long(0x116e + 4, 185000);
  put(0x1186 + 64, [-22 & 0xffff, 0, 0, 903, 22, 1, 0, 103]);
  assert.equal(stageGoal(main, 1), 370000);
  assert.deepEqual([stageCheckpoint(main, 0), stageCheckpoint(main, 1)], [null, 185000]);
  assert.deepEqual(stageGrid(main, 1).slice(0, 2), [
    { lateral: -22, road: 2, position: 903 },
    { lateral: 22, road: 1, position: 103 },
  ]);
});

test("a road's profile rises by its grades' sines, a vertical arc's grade changing evenly to the next record's", () => {
  const deg = (d) => Math.round((d * 0x4000) / 360);
  const profile = [
    { start: 0, radius: 0, flag: 0, height: 0, grade: 0 },
    { start: 1000, radius: 5000, flag: 0x8000, height: 0, grade: 0 },
    { start: 2000, radius: 0, flag: 0, height: 100, grade: deg(10) },
    { start: 4000, radius: 0, flag: 0, height: 447, grade: deg(-5) },
  ];
  const plan = [{ start: 0, radius: 0, flag: 0, heading: 0, x: 0, y: 0 }];
  const { profile: laid, departure } = bigRunProfile(
    bigRunRoad(roadProgram(1, plan, profile), 1, 1, 6000).profile,
    6000,
  );
  const sine = (g) => Math.sin(g * ANGLE_RADIANS);
  assert.ok(Math.abs(laid.grade(1500) - sine(deg(10)) / 2) < 1e-12);
  assert.ok(Math.abs(laid.grade(3000) - sine(deg(10))) < 1e-12);
  // A straight's grade changes at once where it ends.
  assert.ok(Math.abs(laid.grade(4000 + 1e-6) - sine(deg(-5))) < 1e-9);
  assert.ok(Math.abs(laid.height(2000) - (1000 * sine(deg(10))) / 2) < 1e-9);
  // How far it departs from the table's heights where its records start.
  assert.ok(Math.abs(departure - (100 - (1000 * sine(deg(10))) / 2)) < 1e-9);
});
