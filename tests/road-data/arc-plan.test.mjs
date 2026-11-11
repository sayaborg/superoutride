import assert from 'node:assert/strict';
import test from 'node:test';
import { arcPlan } from '../../tools/road-data/shared/arc-plan.ts';

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
  // A jump beside an arc.
  stops(
    table(
      [
        { start: 0, radius: 0, side: 'left' },
        { start: 1000, radius: 3000, side: 'left' },
        { start: 2000, radius: 0, side: 'left' },
      ],
      3000,
      0.3,
      { 2: 0.2 },
    ),
    3000,
    /beside an arc/,
  );
  // A turn taking more than the straight before it holds.
  stops(straights([0, 1000, 1050, 3000], 4000, { 2: 0.2 }), 4000, /more than the straights/);
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
  // A plan departing from its table's positions beyond the limit.
  const moved = table(RECORDS, 10000).map((r, i) => (i === 3 ? { ...r, x: r.x + 20 } : r));
  stops(moved, 10000, /departs/);
});
