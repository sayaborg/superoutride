import assert from 'node:assert/strict';
import test from 'node:test';
import { crestBound, crestBoundLap } from '../../tools/road-data/shared/crest-bound.ts';
import { profileOf } from '../../tools/road-data/shared/road-profile.ts';

const R = 227;
const fall = 1 / R;
/** A road of grade changes `[from, to, change]`, kinks `[at, change]`. */
const road = (bends, kinks = []) =>
  profileOf(
    bends.map(([from, to, change]) => ({ from, to, curvature: change / (to - from) })),
    [],
    kinks.map(([at, change]) => ({ at, change })),
  );
/** The most two profiles' heights differ over `[0, length]`, every 0.1 m. */
const most = (p, q, length) => {
  let d = 0;
  for (let s = 0; s <= length; s += 0.1) d = Math.max(d, Math.abs(p.height(s) - q.height(s)));
  return d;
};

test('a road within the radius is kept as it is', () => {
  const p = road([
    [100, 200, 0.2],
    [300, 400, -0.2],
  ]);
  assert.equal(crestBound(p, 1000, R), p);
});

test('a sharp crest becomes one curve of the radius, touching the road at both ends', () => {
  // +10 % to −10 % over 10 m: far sharper than R.
  const p = road([
    [0, 1, 0.1],
    [500, 510, -0.2],
    [1500, 1501, 0.1],
  ]);
  const q = crestBound(p, 2000, R);
  const curve = q.bends.filter((b) => Math.abs(b.curvature + fall) < 1e-12);
  assert.equal(curve.length, 1);
  const { from: a, to: b } = curve[0];
  // Over it the grade falls 20 % at 1/R: 45.4 m, about the crest.
  assert.ok(Math.abs(b - a - 0.2 * R) < 1e-6);
  assert.ok(a < 500 && b > 510);
  // It touches the road: grades and heights alike at both ends; outside nothing changes.
  for (const s of [a, b]) {
    assert.ok(Math.abs(q.grade(s) - p.grade(s)) < 1e-9);
    assert.ok(Math.abs(q.height(s) - p.height(s)) < 1e-9);
  }
  for (const s of [0, 100, a - 1, b + 1, 1000, 2000]) assert.ok(Math.abs(q.height(s) - p.height(s)) < 1e-9);
});

test('two near crests are one stretch', () => {
  const p = road([
    [0, 1, 0.1],
    [500, 502, -0.1],
    [505, 507, 0.02],
    [510, 512, -0.12],
    [1500, 1501, 0.1],
  ]);
  const q = crestBound(p, 2000, R);
  assert.equal(q.bends.filter((b) => Math.abs(b.curvature + fall) < 1e-12).length, 1);
});

test('a sharp dip is kept', () => {
  const p = road([
    [500, 510, 0.2],
    [600, 601, -0.2],
  ]);
  const q = crestBound(p, 1000, R);
  // The dip's sharp rise stays; only the crest at 600 is laid.
  assert.ok(q.bends.some((b) => b.from === 500 && b.to === 510 && Math.abs(b.curvature - 0.02) < 1e-12));
  assert.ok(Math.abs(q.height(550) - p.height(550)) < 1e-9);
});

test("the road's ends keep their heights; a stretch at the start changes only the grade there", () => {
  // Falling from the start at once: a crest at 0.
  const p = road([[0, 5, -0.1]], [[0, 0.05]]);
  const q = crestBound(p, 1000, R);
  assert.equal(q.height(0), 0);
  assert.ok(Math.abs(q.height(1000) - p.height(1000)) < 1e-9);
  assert.ok(q.kinks.some((k) => k.at === 0));
  // Past the stretch the road is the road's.
  assert.ok(Math.abs(q.height(500) - p.height(500)) < 1e-9);
});

test('a kink down is laid as a curve, a kink up kept', () => {
  const p = road(
    [],
    [
      [300, 0.05],
      [500, -0.1],
      [700, 0.05],
    ],
  );
  const q = crestBound(p, 1000, R);
  assert.ok(!q.kinks.some((k) => k.change < 0));
  assert.ok(
    q.kinks.some((k) => k.at === 300 && Math.abs(k.change - 0.05) < 1e-12) || q.kinks.some((k) => k.at === 700),
  );
  assert.ok(Math.abs(q.height(1000) - p.height(1000)) < 1e-9);
});

test('a crest narrower than the step is found and laid exactly', () => {
  // Down 2.3 % and back up 1.9 % within 0.4 m, between the step's points.
  const p = road([
    [0, 1, 0.01],
    [500.3, 500.5, -0.023],
    [500.5, 500.7, 0.019],
    [1500, 1501, -0.006],
  ]);
  const q = crestBound(p, 2000, R);
  const curves = q.bends.filter((b) => b.curvature === -fall && b.to < 1000);
  assert.equal(curves.length, 1);
  // It touches the road at both ends, its far end within the rise back.
  const { from: a, to: b } = curves[0];
  assert.ok(a < 500.3 && b > 500.5 && b < 500.7);
  for (const s of [a, b]) {
    assert.ok(Math.abs(q.height(s) - p.height(s)) < 1e-9);
    assert.ok(Math.abs(q.grade(s) - p.grade(s)) < 1e-9);
  }
  assert.ok(most(q, crestBound(p, 2000, R, 0.25), 2000) < 1e-6);
});

test('the answer does not depend on the step that finds the stretches', () => {
  const p = road([
    [0, 1, 0.1],
    [480, 490, -0.08],
    [500, 510, -0.2],
    [560, 600, 0.12],
    [900, 905, -0.05],
    [1500, 1501, 0.1],
  ]);
  const [coarse, fine] = [crestBound(p, 2000, R, 0.5), crestBound(p, 2000, R, 0.25)];
  assert.ok(most(coarse, fine, 2000) < 1e-6);
});

test('a lap closes in height and grade, whatever stretch end it is cut at', () => {
  // A closed lap with a sharp crest straddling its start, another halfway and dips between.
  const lap = 2000;
  const p = road([
    [0, 5, -0.05],
    [490, 510, 0.1],
    [990, 1010, -0.1],
    [1490, 1510, 0.1],
    [1995, 2000, -0.05],
  ]);
  // The lap closes as given: height 0 and the start's grade at its end.
  assert.ok(Math.abs(p.height(lap)) < 1e-9 && Math.abs(p.grade(lap) - p.grade(0)) < 1e-12);
  const q = crestBoundLap(p, lap, R);
  assert.ok(Math.abs(q.height(lap)) < 1e-9);
  assert.ok(Math.abs(q.grade(lap - 1e-9) - q.grade(0)) < 1e-9);
  assert.ok(!q.kinks.some((k) => k.at > 0 && k.change < 0));
  // Cut at a stretch's end other than the lowest point, the answer is the same.
  const ends = q.bends.filter((b) => Math.abs(b.curvature + fall) < 1e-12).map((b) => b.to);
  const other = crestBoundLap(p, lap, R, ends[0] % lap);
  assert.ok(most(q, other, lap) < 1e-6);
});

test('a kink down within the road, after a rise between its nodes, becomes a stretch of the radius', () => {
  // The grade rises 0.2 over 100 m to 300 m and falls 0.001 at once at 299.25 m, less than h rises between its nodes.
  const p = road([[200, 300, 0.2]], [[299.25, -0.001]]);
  const laid = crestBound(p, 1000, R);
  assert.notEqual(laid, p);
  assert.ok(laid.kinks.every((k) => k.change >= 0 || k.at === 0));
  assert.ok(laid.bends.every((b) => b.curvature >= -fall * (1 + 1e-9)));
  assert.ok(Math.abs(laid.height(1000) - p.height(1000)) < 1e-6);
});
