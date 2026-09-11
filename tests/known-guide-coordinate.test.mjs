import assert from 'node:assert/strict';
import test from 'node:test';
import { SIM_DT } from '../dist/browser/frame-loop.js';
import { locateWorldOnGuideCoordinateGlobal } from '../dist/core/guide-coordinate-frame.js';
import { compileGuidePath } from '../dist/core/guide-curve.js';
import { HeightProfile } from '../dist/core/height-profile.js';
import { compileRasterPath } from '../dist/core/raster-path.js';
import { createFiscoRuntime } from '../dist/dev/courses/fisco-circuit.js';
import { createTsukubaCourse2000Runtime } from '../dist/dev/courses/tsukuba-circuit.js';
import {
  createCircuitRaceProgressState,
  resyncCircuitRaceProgress,
  updateCircuitRaceProgress,
} from '../dist/gameplay/circuit-race-progress.js';
import { createRecoveryState, recoverVehicle, recoverVehicleToGuideCoordinate } from '../dist/gameplay/recovery.js';
import { sampleRivalDrivingInput } from '../dist/gameplay/rival-driver.js';
import { createArcadeVehicle, updateArcadeVehicle } from '../dist/physics/arcade-vehicle-physics.js';
import { SurfaceMap } from '../dist/physics/surface-map.js';
import { initializeGuideObservation } from '../dist/physics/vehicle-dynamics.js';
import { DEFAULT_VEHICLE_CATALOG_ENTRY, VEHICLE_CATALOG } from '../dist/vehicle/vehicle-catalog.js';

for (const [name, createRuntime] of [
  ['Tsukuba', createTsukubaCourse2000Runtime],
  ['FISCO', createFiscoRuntime],
]) {
  test(`${name}: physical second lap survives recovery and vehicle replacement`, () => {
    const { window: w, raceRules } = createRuntime();
    const L = w.topology.lapLength;
    const entry = DEFAULT_VEHICLE_CATALOG_ENTRY;
    const spawn = (s, l, speed) =>
      createArcadeVehicle(
        entry.profile,
        { guide: w.guide, height: w.height, surfaces: w.surface },
        { s, l, initialSpeed: speed, torqueProtection: entry.torqueProtection },
      );
    let vehicle = spawn(95, 0, 45);
    const sample = () => ({ x: vehicle.x, z: vehicle.z, sWindow: vehicle.course.s });
    const progress = createCircuitRaceProgressState(raceRules, sample());
    const driveTo = (s) => {
      let ticks = 0;
      while (vehicle.course.s < s && ticks++ < 30_000) {
        updateArcadeVehicle(
          { guide: w.guide, height: w.height, surfaces: w.surface },
          vehicle,
          sampleRivalDrivingInput(w.guide, vehicle, 0),
          SIM_DT,
        );
        updateCircuitRaceProgress(progress, raceRules, sample());
      }
      assert.ok(vehicle.course.s >= s, `did not physically reach ${s}: ${vehicle.course.s}`);
    };
    // Reach the overlapping copy by ordinary physics, never by editing course/race state.
    driveTo(L + 100);
    assert.equal(progress.acceptedFinishCount, 1);
    const recovery = createRecoveryState(vehicle);
    const target = vehicle.course.s - 8;
    const validated = () => [
      progress.nextGateIndex,
      progress.acceptedGateCount,
      progress.acceptedFinishCount,
      progress.validatedProgressFloor,
      progress.sProgress,
    ];
    const before = validated();
    recoverVehicle({ guide: w.guide, height: w.height, surfaces: w.surface }, vehicle, {
      state: recovery,
      reason: 'manual',
    });
    assert.ok(
      Math.abs(vehicle.course.s - target) < 1,
      `recovery lost known copy: target=${target}, actual=${vehicle.course.s}`,
    );
    resyncCircuitRaceProgress(progress, raceRules, sample());
    assert.deepEqual(validated(), before);
    const replacementS = vehicle.course.s;
    vehicle = spawn(replacementS, vehicle.course.l, vehicle.longitudinalSpeed);
    assert.ok(
      Math.abs(vehicle.course.s - replacementS) < 1,
      `replacement lost known copy: target=${replacementS}, actual=${vehicle.course.s}`,
    );
    resyncCircuitRaceProgress(progress, raceRules, sample());
    assert.deepEqual(validated(), before);
    driveTo(2 * L + 25);
    assert.equal(progress.acceptedFinishCount, 2);
    assert.equal(progress.shortcutViolationCount, 0);
  });

  test(`${name}: direct spawn retains each finite overlapping copy`, () => {
    const { window: w } = createRuntime();
    for (const { profile } of VEHICLE_CATALOG) {
      for (let copy = 0; copy < w.repeatCount; copy++) {
        const s = copy * w.topology.lapLength + 100;
        const vehicle = createArcadeVehicle(
          profile,
          { guide: w.guide, height: w.height, surfaces: w.surface },
          { s, l: 1, initialSpeed: 0 },
        );
        assert.ok(Math.abs(vehicle.course.s - s) < 1, `${s} -> ${vehicle.course.s}`);
        assert.ok(Math.abs(vehicle.course.l - 1) < 1e-7);
      }
    }
  });
}

test('known placement reprojects the actual elevated CG in a nonzero lateral frame', () => {
  const guide = compileGuidePath(
    compileRasterPath([
      { x: 0, z: 0 },
      { x: 0, z: 1000 },
    ]),
    { lMax: 20, mMin: 0.25, dCam: 5 },
  );
  const frame = { guide, lateralOrigin: 4 };
  const height = new HeightProfile(1000, [
    { s: 0, y: 0 },
    { s: 1000, y: 100 },
  ]);
  const surfaces = new SurfaceMap(1000, [
    { sStart: 0, name: 'slope', bands: [{ lMin: -20, lMax: 20, type: 'ASPHALT' }] },
  ]);
  const v = createArcadeVehicle(
    DEFAULT_VEHICLE_CATALOG_ENTRY.profile,
    { guide: frame, height, surfaces },
    { s: 500, l: 2, initialSpeed: 0 },
  );
  const assertProjection = (targetS) => {
    const projected = locateWorldOnGuideCoordinateGlobal(frame, { x: v.x, z: v.z });
    assert.deepEqual(v.course, projected);
    assert.ok(v.course.s < targetS - 0.01, 'CG normal offset must not be replaced by the placement coordinate');
    assert.equal(v.course.l, 2);
  };
  assertProjection(500);
  recoverVehicleToGuideCoordinate({ guide: frame, height, surfaces }, v, {
    state: createRecoveryState(v),
    target: { s: 600, l: 2 },
    reason: 'manual',
  });
  assertProjection(600);
  for (const bad of [-1, 1, NaN, Infinity, 0.5]) {
    assert.throws(() => initializeGuideObservation(frame, v.x, v.z, bad), RangeError);
  }
});
