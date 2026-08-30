import assert from 'node:assert/strict';
import test from 'node:test';

import { SIM_DT } from '../dist/core/constants.js';
import { createM2StadiumGuide } from '../dist/dev/debug-course.js';
import { createM5DebugSurfaceMap } from '../dist/dev/m5-debug-surface-map.js';
import {
  appendDrivingInput,
  createDrivingInputTrace,
  drivingInputTraceTickCount,
  parseDrivingInputTrace,
  serializeDrivingInputTrace,
  visitDrivingInputTrace,
} from '../dist/dev/driving-input-trace.js';
import {
  createVehicleTelemetryRecorder,
  recordVehicleTelemetryTick,
  summarizeVehicleTelemetry,
} from '../dist/dev/vehicle-telemetry.js';
import { CAR_VEHICLE_PROFILE, createTestCar, updateTestVehicle } from './helpers/vehicle-fixture.mjs';
import { createM3DebugHeightProfile } from '../dist/visual/height-profile.js';

function makeProbeTrace() {
  const trace = createDrivingInputTrace(SIM_DT);
  appendDrivingInput(trace, { steering: 0, throttle: true, brake: false }, 90);
  appendDrivingInput(trace, { steering: 0.18, throttle: true, brake: false }, 45);
  appendDrivingInput(trace, { steering: 0, throttle: false, brake: true }, 30);
  return trace;
}

test('M6.6 trace uses deterministic run-length encoding for identical adjacent commands', () => {
  const trace = createDrivingInputTrace(1 / 60);
  appendDrivingInput(trace, { steering: 0, throttle: true, brake: false }, 2);
  appendDrivingInput(trace, { steering: 0, throttle: true, brake: false }, 3);
  appendDrivingInput(trace, { steering: 0.25, throttle: true, brake: false }, 4);

  assert.equal(trace.runs.length, 2);
  assert.equal(trace.runs[0].ticks, 5);
  assert.equal(trace.runs[1].ticks, 4);
  assert.equal(drivingInputTraceTickCount(trace), 9);
});

test('driving input trace JSON round-trip preserves the exact command sequence', () => {
  const trace = makeProbeTrace();
  const json = serializeDrivingInputTrace(trace);
  const parsed = parseDrivingInputTrace(json);
  assert.deepEqual(parsed, trace);

  const originalTicks = [];
  const parsedTicks = [];
  visitDrivingInputTrace(trace, (input, tick) => originalTicks.push([tick, { ...input }]));
  visitDrivingInputTrace(parsed, (input, tick) => parsedTicks.push([tick, { ...input }]));
  assert.deepEqual(parsedTicks, originalTicks);
});

test('trace rejects non-canonical steering values rather than silently clamping them', () => {
  const trace = createDrivingInputTrace(1 / 60);
  assert.throws(
    () => appendDrivingInput(trace, { steering: 1.1, throttle: false, brake: false }),
    /steering/,
  );
});

function replayProbe(trace, profile = CAR_VEHICLE_PROFILE) {
  const guide = createM2StadiumGuide();
  const height = createM3DebugHeightProfile(guide.length);
  const surfaces = createM5DebugSurfaceMap(guide.length);
  const car = createTestCar(guide, height, surfaces, 45, 0, 45, profile);
  const recorder = createVehicleTelemetryRecorder(trace.dt, guide.length, car);

  visitDrivingInputTrace(trace, (input) => {
    updateTestVehicle(guide, height, surfaces, car, input, trace.dt);
    recordVehicleTelemetryTick(recorder, input, car);
  });
  return summarizeVehicleTelemetry(recorder);
}

test('same trace replayed against the same physics produces bit-for-bit identical telemetry summary', () => {
  const trace = makeProbeTrace();
  assert.deepEqual(replayProbe(trace), replayProbe(trace));
});

test('same immutable trace can A/B two physics parameter sets without changing the trace', () => {
  const trace = makeProbeTrace();
  const before = serializeDrivingInputTrace(trace);
  const baseline = replayProbe(trace);
  const lowerDrive = replayProbe(trace, {
    ...CAR_VEHICLE_PROFILE,
    powertrain: {
      ...CAR_VEHICLE_PROFILE.powertrain,
      torqueCurve: CAR_VEHICLE_PROFILE.powertrain.torqueCurve.map((point) => ({
        ...point,
        torqueNewtonMeters: point.torqueNewtonMeters * 0.55,
      })),
    },
  });

  assert.equal(serializeDrivingInputTrace(trace), before);
  assert.notEqual(lowerDrive.maxSpeedMetersPerSecond, baseline.maxSpeedMetersPerSecond);
  assert.notEqual(lowerDrive.planarDistanceMeters, baseline.planarDistanceMeters);
});
