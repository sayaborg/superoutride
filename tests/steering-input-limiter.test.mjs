import assert from 'node:assert/strict';
import test from 'node:test';
import { deriveContactObservation, reorientContactObservation } from '../dist/physics/vehicle-dynamics.js';
import { arcadeBodyKinematics, updateArcadeVehicle } from '../dist/physics/arcade-vehicle-physics.js';
import { createFlatProbe } from '../tools/drift-control-probe.mjs';
import { setArcadeVehicleSteeringOffsetMax } from '../dist/physics/vehicle-calibration.js';
import { VEHICLE_CATALOG } from '../dist/vehicle/vehicle-catalog.js';
import { createVehicleDebugHudModel, drawVehicleControlGraphics } from '../dist/browser/vehicle-debug-hud.js';
const DEG = Math.PI / 180,
  M = 60 * DEG;
const p = createFlatProbe(),
  v = p.vehicle;
function fixture(speed = 30, lateral = 0, pitch = 0) {
  v.y = 2;
  v.pitch = pitch;
  v.yaw = 0;
  v.yawRate = 0;
  v.pitchRate = 0;
  v.velocityX = lateral;
  v.velocityY = 0;
  v.velocityZ = speed;
  const body = arcadeBodyKinematics(v);
  const contact = deriveContactObservation(
    p.guide,
    p.height,
    p.surface,
    body,
    v.profile.frontStation,
    0,
    v.course.segmentIndex,
  );
  return { body, contact: { ...contact, normalLoad: 4000, forceTransmitting: true } };
}

test('M9.26 frame reorientation exactly matches full contact observation without another surface sample', () => {
  const { body } = fixture(20, 5, 0.2);
  for (const d of [-M, -0.1, 0, 0.3, M]) {
    const before = deriveContactObservation(
      p.guide,
      p.height,
      p.surface,
      body,
      v.profile.frontStation,
      0,
      v.course.segmentIndex,
    );
    assert.deepEqual(
      reorientContactObservation(before, body, d),
      deriveContactObservation(p.guide, p.height, p.surface, body, v.profile.frontStation, d, v.course.segmentIndex),
    );
  }
});
test('M9.26 all-nine actual substeps cut only input and retain automatic-plus-delivered target at three rates', () => {
  for (const entry of VEHICLE_CATALOG)
    for (const hz of [60, 120, 240])
      for (const sign of [-1, 1])
        for (const d of [12, 18, 20]) {
          const q = createFlatProbe({
            profile: entry.profile,
            initialSpeed: 30,
            torqueProtection: entry.torqueProtection,
          });
          setArcadeVehicleSteeringOffsetMax(q.vehicle, d * DEG);
          let cut = false;
          for (let i = 0; i < hz * 2; i++) {
            updateArcadeVehicle(
              { guide: q.guide, height: q.height, surfaces: q.surface },
              q.vehicle,
              { steering: i < hz ? sign : 0, throttle: false, brake: false },
              1 / hz,
            );
            const c = q.vehicle.control;
            cut ||= Math.abs(c.requestedSteerOffset - c.deliveredSteerOffset) > 1e-5;
            assert.ok(Number.isFinite(q.vehicle.speed));
            assert.ok(c.deliveredSteerOffset * c.requestedSteerOffset >= -1e-14);
            assert.ok(Math.abs(c.deliveredSteerOffset) <= Math.abs(c.requestedSteerOffset) + 1e-14);
            assert.equal(c.targetSteerAngle, c.automaticSteerAngle + c.deliveredSteerOffset);
          }
          assert.ok(cut, `${entry.profile.id} D${d} exercised the limiter`);
          assert.ok(Math.abs(q.vehicle.control.requestedSteerOffset) < 1e-12);
          assert.equal(q.vehicle.control.deliveredSteerOffset, 0);
        }
});
test('M9.26 HUD distinguishes raw input, post-actuator reduction, automatic alignment and actual rack', () => {
  const q = createFlatProbe(),
    c = q.vehicle.control;
  c.requestedSteerOffset = 0.2;
  c.deliveredSteerOffset = 0.05;
  c.automaticSteerAngle = -0.3;
  c.actualSteerAngle = -0.1;
  const before = structuredClone(c),
    model = createVehicleDebugHudModel('circuit', { steering: 1, throttle: false, brake: false }, q.vehicle);
  assert.equal(model.requestedSteering, 1);
  assert.ok(model.automaticSteering < 0);
  assert.ok(model.deliveredSteerOffset < model.requestedSteerOffset);
  const labels = [],
    rects = [];
  let color = '';
  const ctx = {
    font: '',
    textBaseline: '',
    strokeStyle: '',
    lineWidth: 1,
    lineJoin: '',
    set fillStyle(v) {
      color = v;
    },
    get fillStyle() {
      return color;
    },
    fillText(t) {
      labels.push(t);
    },
    strokeText() {},
    fillRect(x, y, w, h) {
      rects.push({ color, x, y, w, h });
    },
    strokeRect() {},
    beginPath() {},
    arc() {},
    moveTo() {},
    lineTo() {},
    stroke() {},
  };
  drawVehicleControlGraphics(ctx, model, 0, 0);
  for (const t of ['INPUT', 'USER', 'AUTO', 'RACK', 'RED=CUT']) assert.ok(labels.includes(t));
  assert.ok(rects.some((r) => r.color === '#ff535d' && r.y === 24 && r.w > 0));
  assert.deepEqual(c, before);
});
