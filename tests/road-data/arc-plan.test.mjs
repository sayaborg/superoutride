import assert from 'node:assert/strict';
import test from 'node:test';
import { arcPlan, meetingsWithP, secondRoad } from '../../tools/road-data/shared/arc-plan.ts';

const LIMITS = { heading: (0.03 * Math.PI) / 180, position: 14 };
const METRES = 0.0132;
/** No lane needs more than 10 m. */
const LEAST = () => 10;

/**
 * A table of `records` (start, radius, side) to `end`, each with the heading and position its plan reaches where it
 * starts, from heading `h0` at (0, 0); `jumps` adds a heading's jump (radians) at a record's start.
 */
function table(records, end, h0 = 0.3, jumps = {}) {
  let [x, y, h] = [0, 0, h0];
  return records.map((r, i) => {
    h += jumps[i] ?? 0;
    const out = { ...r, heading: h, x, y };
    const length = (records[i + 1]?.start ?? end) - r.start;
    if (r.radius === 0) [x, y] = [x + length * Math.cos(h), y + length * Math.sin(h)];
    else {
      const sign = r.side === 'left' ? 1 : -1;
      const turn = (sign * length) / r.radius;
      const R = sign * r.radius;
      [x, y] = [x + R * (Math.sin(h + turn) - Math.sin(h)), y - R * (Math.cos(h + turn) - Math.cos(h))];
      h += turn;
    }
    return out;
  });
}

const RECORDS = [
  { start: 0, radius: 0, side: 'left' },
  { start: 1000, radius: 5000, side: 'left' },
  { start: 4000, radius: 0, side: 'left' },
  { start: 5000, radius: 8000, side: 'right' },
  { start: 9000, radius: 0, side: 'left' },
];

test("a table's arcs make its plan, its headings and positions met where each record starts, its degrees unread", () => {
  const records = table(RECORDS, 10000);
  const plan = arcPlan(records, 10000, METRES, LEAST, LIMITS);
  assert.deepEqual(
    plan.elements.map((e) => [e.from, e.to]),
    [
      [0, 1000],
      [1000, 4000],
      [4000, 5000],
      [5000, 9000],
      [9000, 10000],
    ],
  );
  assert.ok(Math.abs(plan.elements[1].turn - 3000 / 5000) < 1e-12);
  assert.ok(Math.abs(plan.elements[3].turn + 4000 / 8000) < 1e-12);
  assert.ok(plan.fidelity.heading < 1e-9 && plan.fidelity.position < 1e-9);
  assert.equal(plan.start, 0.3);
  // A record's degrees, rounded in a table, are not read.
  const rounded = records.map((r) => ({ ...r, degrees: 7 }));
  assert.deepEqual(arcPlan(rounded, 10000, METRES, LEAST, LIMITS).elements, plan.elements);
});

test("a table's straights one after another are one", () => {
  const records = table(
    [
      { start: 0, radius: 0, side: 'left' },
      { start: 500, radius: 0, side: 'left' },
      { start: 1200, radius: 4000, side: 'right' },
      { start: 2000, radius: 0, side: 'left' },
    ],
    3000,
  );
  assert.deepEqual(
    arcPlan(records, 3000, METRES, LEAST, LIMITS).elements.map((e) => [e.from, e.to]),
    [
      [0, 1200],
      [1200, 2000],
      [2000, 3000],
    ],
  );
});

test("a heading's jump between straights is a turn over the fewest whole positions that keep the lanes", () => {
  const jump = (12 * Math.PI) / 180;
  const records = table(
    [
      { start: 0, radius: 0, side: 'left' },
      { start: 2000, radius: 0, side: 'left' },
      { start: 5000, radius: 0, side: 'left' },
    ],
    6000,
    0.3,
    { 1: jump },
  );
  const plan = arcPlan(records, 6000, METRES, LEAST, LIMITS);
  // A turn of 2n positions turning `jump` has radius 2n × METRES / jump: the least n keeping 10 m.
  const n = Math.ceil((10 * jump) / (2 * METRES));
  assert.ok((2 * (n - 1) * METRES) / jump < 10 && (2 * n * METRES) / jump >= 10);
  assert.equal(plan.turns.length, 1);
  assert.deepEqual([plan.turns[0].from, plan.turns[0].to], [2000 - n, 2000 + n]);
  assert.ok(Math.abs(plan.turns[0].turn - jump) < 1e-12);
  assert.deepEqual(
    plan.elements.map((e) => [e.from, e.to]),
    [
      [0, 2000 - n],
      [2000 - n, 2000 + n],
      [2000 + n, 6000],
    ],
  );
  // The distance along the road is the table's, and the heading after the turn the next record's.
  assert.equal(
    plan.elements.reduce((sum, e) => sum + (e.to - e.from), 0),
    6000,
  );
  const after = plan.start + plan.elements.reduce((sum, e) => sum + e.turn, 0);
  assert.ok(Math.abs(after - records[2].heading) < 1e-12);
  assert.ok(plan.fidelity.heading < 1e-9);
  assert.equal(plan.shifts.length, 1);
});

test("a heading's jump beside an arc is a turn added to it, over the fewest whole positions keeping the lanes on each side", () => {
  const jump = 0.2;
  const records = table(
    [
      { start: 0, radius: 0, side: 'left' },
      { start: 1000, radius: 3000, side: 'left' },
      { start: 2000, radius: 0, side: 'left' },
    ],
    4000,
    0.3,
    { 2: jump },
  );
  const plan = arcPlan(records, 4000, METRES, LEAST, LIMITS);
  // The arc's side keeps 10 m with the turn's curvature added to the arc's; the straight's with the turn's alone.
  const keeps = (n, curvature) => METRES / (jump / (2 * n) + curvature) >= 10;
  let n = 1;
  while (!(keeps(n, 1 / 3000) && keeps(n, 0))) n++;
  assert.ok(!keeps(n - 1, 1 / 3000) && keeps(n - 1, 0), 'the arc decides the turn');
  assert.deepEqual([plan.turns[0].from, plan.turns[0].to], [2000 - n, 2000 + n]);
  assert.deepEqual(
    plan.elements.map((e) => [e.from, e.to]),
    [
      [0, 1000],
      [1000, 2000 - n],
      [2000 - n, 2000],
      [2000, 2000 + n],
      [2000 + n, 4000],
    ],
  );
  const curvature = (e) => e.turn / (e.to - e.from);
  assert.ok(Math.abs(curvature(plan.elements[1]) - 1 / 3000) < 1e-12);
  assert.ok(Math.abs(curvature(plan.elements[2]) - (jump / (2 * n) + 1 / 3000)) < 1e-12);
  assert.ok(Math.abs(curvature(plan.elements[3]) - jump / (2 * n)) < 1e-12);
  // The heading after it the next record's, the distance along the road the table's.
  const after = plan.start + plan.elements.reduce((sum, e) => sum + e.turn, 0);
  assert.ok(Math.abs(after - records[2].heading) < 1e-12);
  assert.equal(plan.elements.at(-1).to - plan.elements[0].from, 4000);
});

test('a plan from arcs stops where its table cannot be laid by the rule', () => {
  const stops = (records, end, re, limits = LIMITS, least = LEAST) =>
    assert.throws(() => arcPlan(records, end, METRES, least, limits), re);
  const straights = (starts, end, jumps) =>
    table(
      starts.map((start) => ({ start, radius: 0, side: 'left' })),
      end,
      0.3,
      jumps,
    );
  // A turn taking more than the record before it holds.
  stops(straights([0, 1000, 1050, 3000], 4000, { 2: 0.2 }), 4000, /more than the records/);
  // Two turns that overlap.
  stops(straights([0, 1000, 1150, 3000], 4000, { 1: 0.2, 2: 0.2 }), 4000, /overlap/);
  // A turn reaching the table's start.
  stops(straights([0, 76, 3000], 4000, { 1: 0.2 }), 4000, /ends/);
  // An arc tighter than its lanes' least radius.
  stops(
    table(
      [
        { start: 0, radius: 0, side: 'left' },
        { start: 1000, radius: 500, side: 'left' },
        { start: 1200, radius: 0, side: 'left' },
      ],
      2000,
    ),
    2000,
    /tighter/,
  );
  // A record departing from its table's next position beyond the limit.
  const moved = table(RECORDS, 10000).map((r, i) => (i === 3 ? { ...r, x: r.x + 20 } : r));
  stops(moved, 10000, /departs/);
});

test('a table is taken record by record; the plan laid on from its first record departs by what they add up to', () => {
  // Straights along x, each record's table point 3 positions further than its record before reaches.
  const records = [0, 1000, 2000, 3000, 4000, 5000, 6000].map((start, i) => ({
    start,
    radius: 0,
    side: 'left',
    heading: 0,
    x: start + 3 * i,
    y: 0,
  }));
  const plan = arcPlan(records, 7000, METRES, LEAST, LIMITS);
  assert.ok(Math.abs(plan.fidelity.position - 3) < 1e-9);
  // Laid on from the first record, the plan misses the last record's point by the six records' 3 positions: past the
  // limit, which the departure has none of.
  assert.ok(Math.abs(plan.departure.position - 18) < 1e-9);
  assert.ok(plan.departure.position > LIMITS.position);
  // Headings each a little off the heading their record before reaches, adding up past the limit: no jump.
  const step = 0.8 * LIMITS.heading;
  const turning = table(
    [0, 1000, 2000, 3000, 4000].map((start) => ({ start, radius: 0, side: 'left' })),
    5000,
    0.3,
    { 1: step, 2: step, 3: step, 4: step },
  );
  const drifted = arcPlan(turning, 5000, METRES, LEAST, LIMITS);
  assert.equal(drifted.turns.length, 0);
  assert.ok(Math.abs(drifted.fidelity.heading - step) < 1e-12);
  assert.ok(Math.abs(drifted.departure.heading - 4 * step) < 1e-12);
  // A heading off by more than the limit from the one its record before reaches is a jump.
  const jumped = table(
    [0, 1000, 2000, 3000, 4000].map((start) => ({ start, radius: 0, side: 'left' })),
    5000,
    0.3,
    { 1: step, 2: step, 3: 2 * LIMITS.heading },
  );
  assert.deepEqual(
    arcPlan(jumped, 5000, METRES, LEAST, LIMITS).turns.map((t) => t.from < 3000 && 3000 < t.to),
    [true],
  );
});

/**
 * Two tables parting by S bends either side, P's to its right and the second's to its left, `apart` each, and back: the
 * second's last bend a little wider, turning as much, so that it misses P where they meet again; with `meets` both one
 * from 6000.
 */
function twoTables(apart, meets = true) {
  const R = 3000;
  const s = Math.sqrt(apart * R);
  const bends = (side, other, wider = 0) => {
    const last = (s * (R + wider)) / R;
    return [
      { start: 0, radius: 0, side: 'left' },
      { start: 2000, radius: R, side },
      { start: 2000 + s, radius: R, side: other },
      { start: 2000 + 2 * s, radius: 0, side: 'left' },
      { start: 6000 - 2 * last, radius: R + wider, side: other },
      { start: 6000 - last, radius: R + wider, side },
    ];
  };
  const p0 = table([...bends('right', 'left'), { start: 6000, radius: 0, side: 'left' }], 8000, 0);
  const q0 = table([...bends('left', 'right', 60), { start: 6000, radius: 0, side: 'left' }], 8000, 0);
  // From 2000 on the second's own records; where they meet, one record, P's.
  const p = p0.map((r, i) => (i === p0.length - 1 ? { ...r, heading: 0, y: 0 } : r));
  const q = q0.map((r, i) => (i === 0 ? p[0] : i === q0.length - 1 ? p.at(-1) : r)).slice(0, meets ? undefined : -1);
  const plan = (t) => arcPlan(t, 8000, METRES, LEAST, LIMITS);
  return { p, q, road: secondRoad(p, plan(p), q, plan(q), 8000) };
}

test('a second road from its own table: one where the tables are, parting by its arcs, meeting where they meet', () => {
  const { road } = twoTables(150);
  assert.equal(road.partings.length, 1);
  const [g] = road.partings;
  assert.deepEqual([g.from, g.to, g.meets], [2000, 6000, true]);
  assert.ok(g.miss > 0.5 && g.miss < 14);
  // One where the tables hold one record, and at P where they meet again.
  for (const s of [500, 1999, 6000, 7500]) assert.equal(road.lateralAt(s), 0);
  assert.ok(Math.abs(road.lateralAt(5999.999)) < 1e-2);
  // Between, the second lies to P's left, the two bends' 300 positions apart.
  assert.ok(Math.abs(road.lateralAt(4000) + 300) < 2);
  // Its miss spread straight along the road: its poses less its own plan's, which one that never meets keeps.
  const { road: own } = twoTables(150, false);
  const spread = (s) => [road.pose(s).x - own.pose(s).x, road.pose(s).y - own.pose(s).y];
  const [a, b, c] = [3000, 4000, 5000].map(spread);
  assert.ok(Math.hypot(b[0] - (a[0] + c[0]) / 2, b[1] - (a[1] + c[1]) / 2) < 1e-9);
  assert.ok(Math.abs(Math.hypot(...spread(5000)) - (g.miss * 3) / 4) < 1e-9);
});

test('a second road that never meets P again keeps its own arcs', () => {
  const { q, road } = twoTables(150, false);
  const [g] = road.partings;
  assert.deepEqual([g.from, g.to, g.meets, g.miss], [2000, 8000, false, 0]);
  // Where it parts its pose is P's, and on from there its own plan's.
  const own = arcPlan(q, 8000, METRES, LEAST, LIMITS);
  const at = own.elements[1].to;
  assert.ok(Math.abs(road.pose(at).heading - own.elements[1].turn) < 1e-12);
  assert.ok(Math.abs(road.pose(2000).y) < 1e-9 && road.pose(2500).y > 0);
});

test('a second road that meets P again by a jump keeps its own arcs over its parting and starts again from P there', () => {
  const p = table(
    [
      { start: 0, radius: 0, side: 'left' },
      { start: 2000, radius: 0, side: 'left' },
      { start: 6000, radius: 0, side: 'left' },
    ],
    8000,
    0,
  );
  // From 2000 its own arc turns left of P; at 6000 its table's record is P's, far from where the arc reaches.
  const own = table(
    [
      { start: 0, radius: 0, side: 'left' },
      { start: 2000, radius: 5000, side: 'left' },
    ],
    6000,
    0,
  );
  const q = [p[0], own[1], p[2]];
  const meets = meetingsWithP(p, q, 8000);
  assert.deepEqual(meets, [6000]);
  const reached = [2000 + 5000 * Math.sin(0.8), 5000 * (1 - Math.cos(0.8))];
  // Taken against the record before, it departs; where it meets P, it jumps back onto it.
  assert.throws(() => arcPlan(q, 8000, METRES, LEAST, LIMITS), /departs/);
  const qPlan = arcPlan(q, 8000, METRES, LEAST, LIMITS, meets);
  assert.equal(qPlan.jumpsBack.length, 1);
  const [back] = qPlan.jumpsBack;
  assert.equal(back.at, 6000);
  assert.ok(Math.abs(back.heading - 0.8) < 1e-12);
  assert.ok(Math.abs(back.position - Math.hypot(reached[0] - 6000, reached[1])) < 1e-6);
  assert.ok(qPlan.departure.position < 1e-6 && qPlan.fidelity.position < 1e-6);
  // Its parting keeps its own arc, its miss not spread, and meets P where the tables are one again.
  const road = secondRoad(p, arcPlan(p, 8000, METRES, LEAST, LIMITS), q, qPlan, 8000);
  const [g] = road.partings;
  assert.deepEqual([g.from, g.to, g.meets, g.jumps], [2000, 6000, true, true]);
  assert.ok(Math.abs(g.miss - back.position) < 1e-6);
  const at = road.pose(5000);
  assert.ok(Math.hypot(at.x - (2000 + 5000 * Math.sin(0.6)), at.y - 5000 * (1 - Math.cos(0.6))) < 1e-6);
  assert.equal(road.lateralAt(6000), 0);
});
