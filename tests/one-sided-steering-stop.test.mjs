import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { arcadeBodyKinematics } from '../dist/physics/arcade-vehicle-physics.js';
import { limitSteeringInput as limit } from '../dist/physics/steering-input-limiter.js';
import { compileTireCharacteristics } from '../dist/physics/tire-friction-calibration.js';
import { deriveContactObservation, reorientContactObservation } from '../dist/physics/vehicle-dynamics.js';
import { createFlatProbe } from '../tools/drift-control-probe.mjs';
// Fixed 8% geometry fixture; browser onset is separately exercised by integration.
const rad = Math.PI / 180,
  p = createFlatProbe({ initialSpeed: 30 }),
  tire = compileTireCharacteristics({ gripX: 4, peakSlipX: 0.08, gripY: 2.5, peakSlipY: 0.08, knee: 0.74 });
function fixture(speed = 30, beta = 0, pitch = 0) {
  p.vehicle.y = 2;
  p.vehicle.pitch = pitch;
  const body = arcadeBodyKinematics(p.vehicle);
  const c = deriveContactObservation(
    p.guide,
    p.height,
    p.surface,
    body,
    p.vehicle.profile.frontStation,
    0,
    p.vehicle.course.segmentIndex,
  );
  return {
    body,
    c: {
      ...c,
      forceTransmitting: true,
      tireFrameValid: true,
      reachVelocity: { x: speed * Math.sin(beta), y: 0, z: speed * Math.cos(beta) },
    },
  };
}
// Independent frame projection: q is squared slip inequality after multiplying by |projected heading|².
function excess(body, c, angle) {
  const f = reorientContactObservation(c, body, angle),
    n = c.surface.normal;
  const h = {
    x: body.forward.x * Math.cos(angle) + body.right.x * Math.sin(angle),
    y: body.forward.y * Math.cos(angle) + body.right.y * Math.sin(angle),
    z: body.forward.z * Math.cos(angle) + body.right.z * Math.sin(angle),
  };
  const normal = h.x * n.x + h.y * n.y + h.z * n.z;
  const norm2 = h.x * h.x + h.y * h.y + h.z * h.z - normal * normal;
  const s = c.surface.material.gripFactor * 0.08;
  return (
    norm2 *
    (f.lateralVelocity ** 2 - s * s * (f.longitudinalVelocity ** 2 + c.profile.tire.lowSpeedRegularization ** 2))
  );
}

test('ordinary stop retains small input, approaches onset conservatively and passes flat standstill', () => {
  for (const speed of [0, 0.001, 1, 30])
    for (const sign of [-1, 1]) {
      const { body, c } = fixture(speed),
        d = sign * 20 * rad,
        e = limit(0, d, body, c, tire);
      assert.equal(limit(0, 0, body, c, tire), 0);
      if (speed <= 0.001) assert.equal(e, d);
      else {
        assert.ok(Math.abs(e) < Math.abs(d));
        assert.ok(excess(body, c, e) <= 1e-10);
      }
    }
  const { body, c } = fixture();
  assert.equal(limit(0, 0.01, body, c, tire), 0.01);
  const e = limit(0, 20 * rad, body, c, tire);
  const f = reorientContactObservation(c, body, e);
  const slip = Math.abs(f.lateralVelocity) / Math.hypot(f.longitudinalVelocity, c.profile.tire.lowSpeedRegularization);
  assert.ok(slip > 0.079 && slip < 0.08);
});
test('outside baseline stops farther input, passes partial correction, and stops before opposite excess', () => {
  for (const sign of [-1, 1]) {
    const { body, c } = fixture(),
      b = sign * 6 * rad;
    assert.equal(Math.abs(limit(b, sign * 20 * rad, body, c, tire)), 0);
    assert.equal(limit(b, -sign * rad, body, c, tire), -sign * rad);
    const e = limit(b, -sign * 20 * rad, body, c, tire);
    assert.ok(e * sign < 0 && Math.abs(e) < 20 * rad);
    assert.ok(excess(body, c, b + e) < 1e-8);
    assert.ok(Math.abs(b + e) < Math.atan(0.08) + 1e-4);
  }
});
test('former 0-to-20-degree tangent release is continuous and does not inflate onset', () => {
  const values = [];
  for (const beta of [-129.99, -129.9999, -130, -130.0001, -130.01]) {
    const { body, c } = fixture(30, beta * rad);
    const e = limit(-40 * rad, 20 * rad, body, c, tire);
    values.push(e);
    assert.ok(Math.abs(e) < 0.011 * rad);
  }
  assert.ok(Math.max(...values) - Math.min(...values) < 0.011 * rad);
});
test('exact physical excess respects the quadratic certificate through signed tilted correction paths', () => {
  let seed = 20260910;
  const rng = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32;
  let inside = 0,
    outside = 0,
    noZero = 0;
  for (let i = 0; i < 1500; i++) {
    const { body, c: base } = fixture(0.1 + rng() * 80, (rng() - 0.5) * 2 * Math.PI, (rng() - 0.5) * 0.8);
    const nx = (rng() - 0.5) * 0.5,
      nz = (rng() - 0.5) * 0.5,
      z = Math.hypot(nx, 1, nz);
    const c = {
      ...base,
      surface: {
        ...base.surface,
        normal: { x: nx / z, y: 1 / z, z: nz / z },
        material: { ...base.surface.material, gripFactor: 0.25 + rng() * 2 },
      },
    };
    const b = (rng() - 0.5) * 80 * rad,
      d = (rng() - 0.5) * 40 * rad,
      e = limit(b, d, body, c, tire);
    const q = (x) => excess(body, c, x),
      v = q(b),
      other = q(b + Math.PI / 2);
    const cc = (v - other) / 2,
      cs = (q(b + Math.PI / 4) - q(b - Math.PI / 4)) / 2,
      R = Math.hypot(cc, cs),
      g = 2 * cs;
    const Q = (x) => v + g * x + 2 * R * x * x;
    const minQ = v - (g * g) / (8 * R);
    if (v <= 0) inside++;
    else outside++;
    if (minQ > 0) {
      noZero++;
      assert.ok(Math.abs(e) <= Math.abs(-g / (4 * R)) + 1e-8);
    }
    assert.ok(e * d >= -1e-12 && Math.abs(e) <= Math.abs(d) + 1e-12);
    for (let j = 0; j <= 20; j++) {
      const step = (e * j) / 20;
      assert.ok(q(b + step) <= Q(step) + 1e-7);
      assert.ok(q(b + step) <= Math.max(0, v) + 1e-7);
    }
    // One state, many requests: a nonexpansive monotone map, no sign reversal or invented neutral.
    let previous = limit(b, -20 * rad, body, c, tire);
    for (let k = -19; k <= 20; k++) {
      const next = limit(b, k * rad, body, c, tire);
      assert.ok(next >= previous - 1e-12 && next - previous <= rad + 1e-12);
      previous = next;
    }
  }
  assert.ok(inside > 10 && outside > 10 && noZero > 10);
});
test('absent physical contact retains existing bypass, without a new surface or force observation', () => {
  const { body, c } = fixture();
  for (const x of [
    { ...c, forceTransmitting: false },
    { ...c, tireFrameValid: false },
    { ...c, surface: { ...c.surface, material: { ...c.surface.material, gripFactor: 0 } } },
    { ...c, surface: { ...c.surface, normal: body.right } },
  ])
    assert.equal(limit(0.1, 0.2, body, x, tire), 0.2);
});
test('one fixed onset and one quadratic replace baseline inflation and angular root selection', async () => {
  const src = await readFile(new URL('../src/physics/steering-input-limiter.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(
    src,
    /baseSlip|sAllowed|Math\.acos|Math\.atan2|\bfor\s*\(|\bwhile\s*\(|solveWheelOmega|evaluateTireForce|\.omega|yawRate|speedTable/,
  );
  assert.match(src, /Math\.sqrt\(Math\.max\(0, center \* center - value \/ \(2 \* radius\)\)\)/);
});

test('ordinary high-speed brake replay removes the old rate-independent 20-degree input release', async () => {
  const { createTerrainProbe } = await import('../tools/torque-protection-terrain-probe.mjs');
  const { STEERING_STOP_CASES, runSteeringStopCase } = await import('../tools/steering-input-stop-probe.mjs');
  const { VEHICLE_CATALOG } = await import('../dist/vehicle/vehicle-catalog.js');
  const { setArcadeVehicleSteeringOffsetMax } = await import('../dist/physics/vehicle-calibration.js');
  const scenario = STEERING_STOP_CASES.find((x) => x.name === 'fullBrakeHold'),
    steps = [];
  for (const hz of [60, 120, 240]) {
    const parent = createTerrainProbe(VEHICLE_CATALOG[0], { speed: 60 });
    setArcadeVehicleSteeringOffsetMax(parent.vehicle, 20 * rad);
    const result = runSteeringStopCase(parent, scenario, { hz });
    assert.ok(result.cutSeconds > 0);
    assert.equal(result.unsupportedSeconds, 0);
    steps.push(result.maxInputStepDeg);
  }
  assert.ok(steps[1] < steps[0] * 0.6 && steps[2] < steps[1] * 0.6);
  assert.ok(steps[2] < 1); // retained20 degrees at every one of these three step rates.
});
