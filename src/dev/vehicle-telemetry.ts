import { wrapAngle, wrapSigned } from '../core/math.js';
import type { DrivingInput } from '../input/driving-input.js';
import type { VehicleCameraReadState } from '../physics/vehicle-contract.js';

export interface VehicleTelemetrySample {
  readonly tick: number;
  readonly input: Readonly<DrivingInput>;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly yaw: number;
  readonly sLocal: number;
  readonly lateral: number;
  readonly longitudinalSpeed: number;
  readonly lateralSpeed: number;
}

export interface VehicleTelemetrySummary {
  readonly tickCount: number;
  readonly durationSeconds: number;
  readonly planarDistanceMeters: number;
  readonly netSignedChainageMeters: number;
  readonly maxSpeedMetersPerSecond: number;
  readonly maxAbsLateralMeters: number;
  readonly maxAbsSideslipDegrees: number;
  readonly maxAbsYawRateDegreesPerSecond: number;
}

export interface VehicleTelemetryRecorder {
  readonly dt: number;
  readonly courseLength: number;
  readonly origin: VehicleTelemetrySample;
  readonly samples: VehicleTelemetrySample[];
}

/**
 * Debug/calibration observer only. It must not participate in physics integration.
 * The initial state is captured as tick 0 with neutral input.
 */
export function createVehicleTelemetryRecorder(
  dt: number,
  courseLength: number,
  vehicle: VehicleCameraReadState,
): VehicleTelemetryRecorder {
  if (!(dt > 0) || !Number.isFinite(dt)) throw new RangeError('telemetry dt must be finite and > 0');
  if (!(courseLength > 0) || !Number.isFinite(courseLength)) {
    throw new RangeError('telemetry courseLength must be finite and > 0');
  }
  return {
    dt,
    courseLength,
    origin: snapshot(0, { steering: 0, throttle: false, brake: false }, vehicle),
    samples: [],
  };
}

/** Capture the authoritative post-physics state for one fixed simulation tick. */
export function recordVehicleTelemetryTick(
  recorder: VehicleTelemetryRecorder,
  input: DrivingInput,
  vehicle: VehicleCameraReadState,
): VehicleTelemetrySample {
  const sample = snapshot(recorder.samples.length + 1, input, vehicle);
  recorder.samples.push(sample);
  return sample;
}

export function summarizeVehicleTelemetry(
  recorder: VehicleTelemetryRecorder,
): VehicleTelemetrySummary {
  let previous = recorder.origin;
  let planarDistanceMeters = 0;
  let netSignedChainageMeters = 0;
  let maxSpeedMetersPerSecond = speedOf(previous);
  let maxAbsLateralMeters = Math.abs(previous.lateral);
  let maxAbsSideslipDegrees = Math.abs(sideslipDegrees(previous));
  let maxAbsYawRateDegreesPerSecond = 0;

  for (const sample of recorder.samples) {
    planarDistanceMeters += Math.hypot(sample.x - previous.x, sample.z - previous.z);
    netSignedChainageMeters += wrapSigned(
      sample.sLocal - previous.sLocal,
      recorder.courseLength,
    );
    maxSpeedMetersPerSecond = Math.max(maxSpeedMetersPerSecond, speedOf(sample));
    maxAbsLateralMeters = Math.max(maxAbsLateralMeters, Math.abs(sample.lateral));
    maxAbsSideslipDegrees = Math.max(maxAbsSideslipDegrees, Math.abs(sideslipDegrees(sample)));
    const yawRate = Math.abs(wrapAngle(sample.yaw - previous.yaw) / recorder.dt) * 180 / Math.PI;
    maxAbsYawRateDegreesPerSecond = Math.max(maxAbsYawRateDegreesPerSecond, yawRate);
    previous = sample;
  }

  return {
    tickCount: recorder.samples.length,
    durationSeconds: recorder.samples.length * recorder.dt,
    planarDistanceMeters,
    netSignedChainageMeters,
    maxSpeedMetersPerSecond,
    maxAbsLateralMeters,
    maxAbsSideslipDegrees,
    maxAbsYawRateDegreesPerSecond,
  };
}

function snapshot(
  tick: number,
  input: DrivingInput,
  vehicle: VehicleCameraReadState,
): VehicleTelemetrySample {
  return {
    tick,
    input: {
      steering: input.steering,
      throttle: input.throttle,
      brake: input.brake,
    },
    x: vehicle.x,
    y: vehicle.y,
    z: vehicle.z,
    yaw: vehicle.yaw,
    sLocal: vehicle.course.s,
    lateral: vehicle.course.l,
    longitudinalSpeed: vehicle.longitudinalSpeed,
    lateralSpeed: vehicle.lateralSpeed,
  };
}

function speedOf(sample: VehicleTelemetrySample): number {
  return Math.hypot(sample.longitudinalSpeed, sample.lateralSpeed);
}

function sideslipDegrees(sample: VehicleTelemetrySample): number {
  return Math.atan2(sample.lateralSpeed, Math.max(Math.abs(sample.longitudinalSpeed), 1e-6))
    * 180 / Math.PI;
}
