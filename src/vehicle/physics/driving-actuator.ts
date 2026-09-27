import { DefinitionDomainError } from '../../core/admission.js';
import { clamp } from '../../core/math.js';
import {
  clampSteering,
  drivingInputApplyMethod,
  normalizedPedalRequest,
  type DrivingInput,
  type DrivingInputApplyMethod,
} from '../driving-input.js';

// Normalized actuator units: 10^-12 budget (~4,500 eps) absorbs repeated rate*dt additions
// near a target; at most this much extra travel is snapped to the target.
const ACTUATOR_TARGET_TOLERANCE = 1e-12;

export interface CompiledActuatorRate {
  /** Normalized units per second toward any non-neutral target, including steering reversal. */
  readonly applyRate: number;
  /** Normalized units per second toward neutral. */
  readonly releaseRate: number;
}

export interface CompiledDrivingActuators {
  readonly steering: CompiledActuatorRate;
  readonly throttle: CompiledActuatorRate;
  readonly brake: CompiledActuatorRate;
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

export function validateCompiledDrivingActuators(definition: CompiledDrivingActuators): void {
  for (const name of ['steering', 'throttle', 'brake'] as const) {
    const channel = definition[name];
    if (!channel) throw new DefinitionDomainError(name, `${name} actuator channel is required`);
    if (!(channel.applyRate > 0) || !Number.isFinite(channel.applyRate)) {
      throw new DefinitionDomainError(`${name}/applyRate`, `${name} actuator apply rate must be finite and > 0`);
    }
    if (!(channel.releaseRate > 0) || !Number.isFinite(channel.releaseRate)) {
      throw new DefinitionDomainError(`${name}/releaseRate`, `${name} actuator release rate must be finite and > 0`);
    }
  }
}

/**
 * One bounded asymmetric response primitive for steering, throttle and brake.
 * A nonzero steering reversal uses applyRate continuously through neutral.
 */
function stepNormalizedActuator(
  current: number,
  target: number,
  dt: number,
  definition: CompiledActuatorRate,
  minimum: number,
  maximum: number,
): number {
  if (!Number.isFinite(current) || !Number.isFinite(target))
    throw new RangeError('actuator state and target must be finite');
  const boundedCurrent = clamp(current, minimum, maximum);
  const boundedTarget = clamp(target, minimum, maximum);
  const rate = boundedTarget === 0 ? definition.releaseRate : definition.applyRate;
  const difference = boundedTarget - boundedCurrent;
  const maximumChange = rate * dt;
  if (Math.abs(difference) <= maximumChange + ACTUATOR_TARGET_TOLERANCE) return boundedTarget;
  return clamp(boundedCurrent + Math.sign(difference) * maximumChange, minimum, maximum);
}

export function updateDrivingActuators(
  state: DrivingActuatorState,
  input: DrivingInput,
  dt: number,
  definition: CompiledDrivingActuators,
): void {
  const steeringTarget = clampSteering(input.steering);
  const throttleTarget = normalizedPedalRequest(input.throttle);
  const brakeTarget = normalizedPedalRequest(input.brake);
  const steeringMethod = drivingInputApplyMethod(input.steeringApplyMethod);
  const pedalMethod = drivingInputApplyMethod(input.pedalApplyMethod);
  state.steering = applyRequestedActuator(
    state.steering,
    steeringTarget,
    dt,
    definition.steering,
    -1,
    1,
    steeringMethod,
  );
  state.throttle = applyRequestedActuator(state.throttle, throttleTarget, dt, definition.throttle, 0, 1, pedalMethod);
  state.brake = applyRequestedActuator(state.brake, brakeTarget, dt, definition.brake, 0, 1, pedalMethod);
}

function applyRequestedActuator(
  current: number,
  target: number,
  dt: number,
  definition: CompiledActuatorRate,
  minimum: number,
  maximum: number,
  applyMethod: DrivingInputApplyMethod,
): number {
  if (applyMethod === 'DIRECT') return clamp(target, minimum, maximum);
  return stepNormalizedActuator(current, target, dt, definition, minimum, maximum);
}
