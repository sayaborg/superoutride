import { clamp } from '../core/math.js';
import {
  assertExclusivePedalInput,
  drivingInputApplyMode,
  normalizedPedalRequest,
  type DrivingInput,
  type DrivingInputApplyMode,
} from '../input/driving-input.js';

export interface NormalizedActuatorRateProfile {
  /** Normalized units per second toward any non-neutral target, including steering reversal. */
  readonly applyRate: number;
  /** Normalized units per second toward neutral. */
  readonly releaseRate: number;
}

export interface DrivingActuatorProfile {
  readonly steering: NormalizedActuatorRateProfile;
  readonly throttle: NormalizedActuatorRateProfile;
  readonly brake: NormalizedActuatorRateProfile;
}

/** The only persistent input-response state owned by vehicle mechanics. */
export interface DrivingActuatorState {
  steering: number;
  throttle: number;
  brake: number;
}

export function createDrivingActuatorState(): DrivingActuatorState {
  return { steering: 0, throttle: 0, brake: 0 };
}

export function resetDrivingActuatorState(state: DrivingActuatorState): void {
  state.steering = 0;
  state.throttle = 0;
  state.brake = 0;
}

export function validateDrivingActuatorProfile(profile: DrivingActuatorProfile): void {
  for (const [name, channel] of Object.entries(profile)) {
    if (!(channel.applyRate > 0) || !Number.isFinite(channel.applyRate)) {
      throw new RangeError(`${name} actuator apply rate must be finite and > 0`);
    }
    if (!(channel.releaseRate > 0) || !Number.isFinite(channel.releaseRate)) {
      throw new RangeError(`${name} actuator release rate must be finite and > 0`);
    }
  }
}

/** Current steering calibration permits one traversal rate, never separate apply/release authority. */
export function validateSymmetricSteeringActuatorRateProfile(
  profile: NormalizedActuatorRateProfile,
): void {
  if (!(profile.applyRate > 0) || !Number.isFinite(profile.applyRate)
    || !(profile.releaseRate > 0) || !Number.isFinite(profile.releaseRate)) {
    throw new RangeError('vehicle steering actuator rates must be finite and > 0');
  }
  if (profile.applyRate !== profile.releaseRate) {
    throw new RangeError('vehicle steering actuator apply/release rates must be symmetric');
  }
}

/**
 * One bounded asymmetric response primitive for steering, throttle and brake.
 * A nonzero steering reversal uses applyRate continuously through neutral.
 */
export function stepNormalizedActuator(
  current: number,
  target: number,
  dt: number,
  profile: NormalizedActuatorRateProfile,
  minimum: number,
  maximum: number,
): number {
  if (!(dt > 0) || !Number.isFinite(dt)) {
    throw new RangeError('actuator dt must be finite and > 0');
  }
  if (![current, target, minimum, maximum].every(Number.isFinite) || minimum >= maximum) {
    throw new RangeError('actuator state, target and bounds must be finite and ordered');
  }
  if (!(profile.applyRate > 0) || !(profile.releaseRate > 0)
    || !Number.isFinite(profile.applyRate) || !Number.isFinite(profile.releaseRate)) {
    throw new RangeError('actuator rates must be finite and > 0');
  }
  const boundedCurrent = clamp(current, minimum, maximum);
  const boundedTarget = clamp(target, minimum, maximum);
  const rate = boundedTarget === 0 ? profile.releaseRate : profile.applyRate;
  const difference = boundedTarget - boundedCurrent;
  const maximumChange = rate * dt;
  if (Math.abs(difference) <= maximumChange + 1e-12) return boundedTarget;
  return clamp(
    boundedCurrent + Math.sign(difference) * maximumChange,
    minimum,
    maximum,
  );
}

export function updateDrivingActuators(
  state: DrivingActuatorState,
  input: DrivingInput,
  dt: number,
  profile: DrivingActuatorProfile,
  steeringResponse: NormalizedActuatorRateProfile = profile.steering,
): void {
  assertExclusivePedalInput(input);
  const steeringTarget = clamp(input.steering, -1, 1);
  const throttleTarget = normalizedPedalRequest(input.throttle);
  const brakeTarget = normalizedPedalRequest(input.brake);
  state.steering = applyRequestedActuator(
    state.steering,
    steeringTarget,
    dt,
    steeringResponse,
    -1,
    1,
    drivingInputApplyMode(input.steeringApplyMode),
  );
  state.throttle = applyRequestedActuator(
    state.throttle,
    throttleTarget,
    dt,
    profile.throttle,
    0,
    1,
    drivingInputApplyMode(input.pedalApplyMode),
  );
  state.brake = applyRequestedActuator(
    state.brake,
    brakeTarget,
    dt,
    profile.brake,
    0,
    1,
    drivingInputApplyMode(input.pedalApplyMode),
  );
}

function applyRequestedActuator(
  current: number,
  target: number,
  dt: number,
  profile: NormalizedActuatorRateProfile,
  minimum: number,
  maximum: number,
  applyMode: DrivingInputApplyMode,
): number {
  if (applyMode === 'DIRECT') return clamp(target, minimum, maximum);
  return stepNormalizedActuator(current, target, dt, profile, minimum, maximum);
}
