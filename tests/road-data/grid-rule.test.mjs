import assert from 'node:assert/strict';
import test from 'node:test';
import { gridReach, ruleGrid } from '../../tools/road-data/shared/grid-rule.ts';

/** The catalog's largest bodies' lengths, metres: a car's and a bike's. */
const CAR = 4.996;
const BIKE = 2.38;
const close = (a, b, what) => assert.ok(Math.abs(a - b) < 1e-9, `${what}: ${a} is not ${b}`);
const lanes = { lanes: ['a', 'b'], meet: 0, laneWidth: 4 };
const limits = [10, 10];

test("a circuit's grid stands from its line back: half the kind's largest body before it", () => {
  // The original's cars by a rule from the line: rows of two, 6 m apart, either side of P.
  const rule = (k) => ({ ahead: -6 * Math.floor(k / 2), right: k % 2 === 0 ? 2.5 : -2 });
  const stand = { origin: { s: 500, lateral: 0 }, originals: { car: { rule } }, line: 500, limits, ...lanes };
  const cars = ruleGrid('car', stand);
  assert.equal(cars.length, 16);
  // The rule laid on to sixteen, in its order, the whole moved back half a car.
  cars.forEach((slot, k) => {
    close(slot.s, 500 - CAR / 2 - 6 * Math.floor(k / 2), `car ${k + 1}`);
    assert.equal(slot.lateral, k % 2 === 0 ? 2.5 : -2);
  });
  // No original bike: the general form, its front row half a bike before the line, four a row 3 m apart.
  const bikes = ruleGrid('bike', stand);
  bikes.forEach((slot, k) => close(slot.s, 500 - BIKE / 2 - 3 * Math.floor(k / 4), `bike ${k + 1}`));
  assert.deepEqual(
    bikes.slice(0, 4).map((slot) => slot.lateral),
    [
      { lane: 'a', side: 'center', offset: -1 },
      { lane: 'a', side: 'center', offset: 1 },
      { lane: 'b', side: 'center', offset: -1 },
      { lane: 'b', side: 'center', offset: 1 },
    ],
  );
  // An original's front farther than half a body stays where it is.
  const behind = ruleGrid('car', {
    ...stand,
    originals: { car: { rule: (k) => ({ ...rule(k), ahead: rule(k).ahead - 6 }) } },
  });
  close(behind[0].s, 494, 'a front 6 m before the line');
});

test("an original's places that would overlap spread from the front by the least factor", () => {
  // Rows 3 m apart, a car's length 4.996: each row's distance behind the front grows by 4.996 / 3.
  const rule = (k) => ({ ahead: -3 * Math.floor(k / 2), right: k % 2 === 0 ? 2.5 : -2 });
  const cars = ruleGrid('car', {
    origin: { s: 0, lateral: 0 },
    originals: { car: { rule } },
    line: 0,
    limits,
    ...lanes,
  });
  cars.forEach((slot, k) => close(slot.s, -CAR / 2 - CAR * Math.floor(k / 2), `car ${k + 1}`));
  // Places as far along that would overlap leave the general form alone.
  const abreast = {
    places: [
      { ahead: 0, right: 0 },
      { ahead: 0, right: 1 },
    ],
  };
  const general = ruleGrid('car', { origin: { s: 100, lateral: 0 }, originals: { car: abreast }, limits, ...lanes });
  general.forEach((slot, k) => {
    close(slot.s, 100 - 12 * k, `car ${k + 1}`);
    assert.deepEqual(slot.lateral, { lane: k % 2 === 0 ? 'a' : 'b', side: 'center', offset: 0 });
  });
});

test("behind an original's table the general form follows, its own vehicle's place first among those as far along", () => {
  // The own car in lane b's centre, the lanes meeting half a lane left of it; one rival 3 m left beside it.
  const table = {
    places: [
      { ahead: 0, right: 0 },
      { ahead: 0, right: -3 },
      { ahead: 0, right: 3 },
    ],
  };
  const origin = { s: 200, lateral: { lane: 'b', side: 'center', offset: 0 } };
  const stand = { origin, originals: { car: table }, limits, lanes: ['a', 'b'], meet: -2, laneWidth: 4 };
  const cars = ruleGrid('car', stand);
  assert.deepEqual(
    cars.slice(0, 3).map((slot) => [slot.s, slot.lateral]),
    [
      [200, { lane: 'b', side: 'center', offset: 0 }],
      [200, { lane: 'b', side: 'center', offset: -3 }],
      [200, { lane: 'b', side: 'center', offset: 3 }],
    ],
  );
  // The last original right of where the lanes meet: the general form from the left lane, 12 m behind it.
  cars.slice(3).forEach((slot, j) => {
    close(slot.s, 188 - 12 * j, `car ${j + 4}`);
    assert.equal(slot.lateral.lane, j % 2 === 0 ? 'a' : 'b');
  });
  // The start line is the front of the original's places of either kind: a bike 3 m ahead puts the cars' front there.
  const bikes = {
    places: [
      { ahead: 0, right: 0 },
      { ahead: 3, right: 1 },
    ],
  };
  const ahead = ruleGrid('car', { ...stand, originals: { bike: bikes } });
  close(ahead[0].s, 203, 'the car grid from the line');
  // The grids reach 180 m behind the own car: the car grid's sixteenth.
  close(gridReach({ ...stand, originals: { car: { places: [{ ahead: 0, right: 0 }] } } }), 180, 'the reach');
});
