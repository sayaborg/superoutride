import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { HeightProfile } from '../dist/core/height-profile.js';
import { arcadeBodyKinematics, updateArcadeVehicle } from '../dist/physics/arcade-vehicle-physics.js';
import { VEHICLE_GRAVITY as g } from '../dist/physics/vehicle-dynamics.js';
import { createDynamicVehicleCourseSprite } from '../dist/render/dynamic-vehicle-sprite.js';
import { drawVehicleLeanDebug } from '../dist/render/vehicle-lean-debug.js';
import {
  deriveVehicleNormalizedBank as bank,
  deriveVehicleLeanRadians as lean,
} from '../dist/render/vehicle-presentation.js';
import { VEHICLE_CATALOG } from '../dist/vehicle/vehicle-catalog.js';
import { createSpriteAssets, selectVehicleSprite } from '../dist/visual/sprite-assets.js';
import { createTerrainProbe, runTerrainProbe } from '../tools/torque-protection-terrain-probe.mjs';
import { withHighBikeCg, withHighBikeCgEntry } from './helpers/bike-cg-reference.mjs';
const bikes = VEHICLE_CATALOG.filter((e) => e.presentationFamily === 'BIKE');

test('four bikes lower only compiled CG/free reach to 30% wheelbase; five cars are exact ', () => {
  const carHashes = {
    TESTAROSSA: '31889234e93ddb6a844a797f1fb4c5700fdb363b17b73c37b4b88f248f9fbe70',
    '911_TURBO_3_3': '9e2f638f91c888d2545bf9b6f0ca77e034391488677c63648d989b7bc043e35b',
    CORVETTE_C4: '13a1b02896761edaa93181f2c0296268fab800308f06624a3d56e16e91e36f89',
    GOLF_GTI_16V: 'cfacb2a0a5f8990460ce4188af61550e7dad6123962e24bdd367dcde27dd5101',
    DELTA_HF_INTEGRALE: '65dd33bbeb9bf075c17be54376e53d6b2041feadfc43c16e0269369bc4ff1bbd',
  };
  const withoutCg = (p) =>
    JSON.parse(JSON.stringify(p, (k, v) => (['desiredCgHeight', 'freeReachDown'].includes(k) ? undefined : v)));
  assert.equal(bikes.length, 4);
  for (const { profile: p } of VEHICLE_CATALOG) {
    if (p.id in carHashes) {
      assert.equal(createHash('sha256').update(JSON.stringify(p)).digest('hex'), carHashes[p.id]);
    } else {
      const old = withHighBikeCg(p);
      assert.ok(Math.abs(p.desiredCgHeight / (p.frontAxle + p.rearAxle) - 0.3) < 1e-14);
      assert.ok(p.desiredCgHeight < old.desiredCgHeight);
      assert.deepEqual(withoutCg(p), withoutCg(old));
      for (const key of ['frontStation', 'rearStation']) {
        assert.equal(p[key].freeReachDown, p.desiredCgHeight + p[key].suspension.qStatic);
      }
      const probe = createTerrainProbe(
        VEHICLE_CATALOG.find((e) => e.profile === p),
        { speed: 0 },
      );
      assert.ok(Math.abs(probe.vehicle.presentationY) < 1e-12, 'lower CG preserves grounded sprite placement');
    }
  }
});

for (const hz of [60, 120, 240])
  test(`lower CG reduces moving yaw excursion in all-four matched turn-brake cases at ${hz}Hz`, () => {
    for (const entry of bikes)
      for (const grip of [1, 0.25]) {
        const options = { hz, grip, kind: 'turnBrake', speed: 30, seconds: 6 };
        const old = runTerrainProbe(withHighBikeCgEntry(entry), options),
          current = runTerrainProbe(entry, options);
        assert.equal(current.error, null);
        assert.equal(current.completed, true);
        assert.equal(current.overturned, false);
        assert.ok(
          current.maxAbsBetaAbove15 < old.maxAbsBetaAbove15,
          JSON.stringify({
            id: entry.profile.id,
            hz,
            grip,
            old: old.maxAbsBetaAbove15,
            current: current.maxAbsBetaAbove15,
          }),
        );
        assert.ok(current.maxEllipse <= 1 + 1e-10);
        assert.equal(current.maxPositiveSlipPower, 0);
        assert.equal(current.torqueBudgetViolation, 0);
        assert.equal(current.zeroLoadForceViolation, 0);
      }
  });

test('lateral G owns lean, including sliding sign, upright spin and sprite saturation', () => {
  assert.equal(lean({}), 0);
  for (const value of [-2.5, -1, -0.5, 0, 0.5, 1, 2.5]) {
    const state = { lateralAcceleration: value * g, longitudinalSpeed: 30, yawRate: -Math.sign(value) };
    assert.ok(Math.abs(lean(state) - Math.atan(value)) < 1e-14);
    assert.ok(Math.abs(bank(state)) <= 1);
  }
  assert.equal(lean({ lateralAcceleration: 0, longitudinalSpeed: 30, yawRate: 2 }), 0);
  assert.equal(bank({ lateralAcceleration: g }), 1);
  assert.ok(lean({ lateralAcceleration: 2.5 * g }) > Math.PI / 4, 'angle survives art saturation for line display');
});

test('real sideslip acceleration and world sprite bank share the observed outer-step G', () => {
  const p = createTerrainProbe(bikes[0], { speed: 30 }),
    v = p.vehicle,
    dt = 1 / 120;
  v.velocityX = 8; // Initial sideslip, no initial yaw: yaw*speed cannot describe its lateral force.
  const before = { x: v.velocityX, y: v.velocityY, z: v.velocityZ };
  updateArcadeVehicle(
    { guide: p.guide, height: p.height, surfaces: p.surface },
    v,
    { steering: 0, throttle: 0, brake: 0 },
    dt,
  );
  const right = arcadeBodyKinematics(v).right;
  const a =
    ((v.velocityX - before.x) * right.x + (v.velocityY - before.y) * right.y + (v.velocityZ - before.z) * right.z) / dt;
  assert.ok(Math.abs(a) > 1);
  assert.ok(Math.abs(lean(v) - Math.atan2(a, g)) < 1e-12);
  assert.ok(Math.abs(lean(v) - Math.atan2(v.longitudinalSpeed * v.yawRate, g)) > 0.01);
  const assets = createSpriteAssets();
  const sprite = createDynamicVehicleCourseSprite(
    'bike',
    v,
    v.yaw,
    assets.bike,
    new HeightProfile(p.guide.length, [
      { s: 0, y: 0 },
      { s: p.guide.length, y: 0 },
    ]),
  );
  assert.equal(sprite.asset, selectVehicleSprite(assets.bike, 0, bank(v)).asset);
});

test('lean line starts at ground anchor and continuously follows signed G beyond bitmap banks', async () => {
  for (const value of [-2.5, -1, 0, 1, 2.5]) {
    const starts = [],
      ends = [],
      marks = [];
    const ctx = {
      save() {},
      restore() {},
      beginPath() {},
      stroke() {},
      moveTo(x, y) {
        starts.push([x, y]);
      },
      lineTo(x, y) {
        ends.push([x, y]);
      },
      fillRect(...args) {
        marks.push(args);
      },
    };
    drawVehicleLeanDebug(ctx, 160, 210, { lateralAcceleration: value * g });
    assert.deepEqual(starts, [
      [160, 210],
      [160, 210],
    ]);
    const [x, y] = ends[0];
    assert.deepEqual(ends[0], ends[1]);
    assert.ok(Math.abs((x - 160) / (210 - y) - value) < 1e-12);
    assert.ok(Math.abs(Math.hypot(x - 160, y - 210) - 48) < 1e-12);
    assert.deepEqual(marks, [[159, 209, 3, 3]]);
  }
  const shell = await readFile(new URL('../src/browser/driving-shell.ts', import.meta.url), 'utf8');
  assert.match(
    shell,
    /presentationFamily === 'BIKE'[\s\S]*drawVehicleLeanDebug\(ctx, camera.playerScreenX, playerScreenY, vehicle\)/,
  );
  const renderer = await readFile(new URL('../src/render/renderer.ts', import.meta.url), 'utf8');
  assert.match(renderer, /deriveVehicleNormalizedBank\(vehicle\)/);
});
