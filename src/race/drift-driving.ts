import { clamp, wrapAngle } from '../core/math.js';
import { openingForDriveTorque } from '../vehicle/physics/automatic-powertrain.js';
import { effectiveTireLoad } from '../vehicle/physics/tire-friction-calibration.js';
import type { VehicleDrivingRead } from '../vehicle/physics/vehicle-contract.js';
import { rollingDrivenWheelOmega } from '../vehicle/physics/vehicle-definitions.js';
import type { VehicleModel } from '../vehicle/physics/vehicle-model.js';
import type { TireObservation } from '../vehicle/physics/vehicle-tire-observation.js';
import { createSteeringRule } from '../vehicle/steering-rule.js';

const DEGREE = Math.PI / 180;

/**
 * The drift style's values ([Content and gameplay](../../docs/content-and-gameplay.md#drivers)), apart from
 * `PLANNED_DRIVER`'s, whose plan and path following it shares. `version` identifies these values and the drift law that
 * reads them; it rises with any change that alters a drift driver's input for the same state and observations
 * ([Calibration](../../docs/calibration.md)).
 */
export const DRIFT_DRIVER = Object.freeze({
  version: 1,
  /**
   * The drift style's steering rule: the front reference, full input reaching 95 % of the front tire's lateral bound,
   * so no input aligns the front wheels with their own travel and the input is the front tire's share of its bound.
   */
  steering: createSteeringRule('front', 0.95),
  /**
   * The drift style's wheel slip protection, its rule's: ABS keeps the brakes from locking the wheels; TCS and MSR
   * stay off, since they would keep the driven wheels from spinning.
   */
  wheelSlip: Object.freeze({ drive: false, brake: true }),
  /** Metres: a corner is a run of the path curving one way tighter than this radius. */
  cornerRadius: 160,
  /** Seconds of speed, at least the metres: how far ahead the driver reads the corner at hand. */
  lookSeconds: 0.35,
  lookMetres: 4,
  /** Seconds of speed, at least the metres: how far ahead it looks for a corner the other way. */
  switchSeconds: 0.7,
  switchMetres: 6,
  /** Seconds of speed plus the metres: how far ahead it reads the plan's least speed. */
  planSeconds: 1.2,
  planMetres: 10,
  /** A drift starts within `enterOver` of the speeds at hand, or once already sliding `startAngle`. */
  enterOver: 1.08,
  startAngle: 12 * DEGREE,
  /** A drift whose angle stays below `giveUpAngle` after `giveUpSeconds` is given up until its corner ends. */
  giveUpSeconds: 1.2,
  giveUpAngle: 6 * DEGREE,
  /** The asked angle's bounds; it moves at most `mostAngle` in `angleSeconds`. */
  leastAngle: 8 * DEGREE,
  mostAngle: 50 * DEGREE,
  angleSeconds: 0.35,
  /** The throttle's feedback on the angle: gain per radian, damping (s), integral gain (1/s) and bound. */
  throttleGain: 1.6,
  throttleDamping: 0.35,
  throttleIntegral: 2.5,
  throttleIntegralBound: 0.6,
  /** Faster than `capOver` of the plan's speed the throttle is capped at `cappedThrottle` and the brake scrubs. */
  capOver: 1.12,
  cappedThrottle: 0.3,
  scrubGain: 3,
  scrubBrake: 0.5,
  scrubSlack: 5 * DEGREE,
  /** The front tire's least share: its most countersteer. */
  counterShare: 0.3,
  /** The steering's integral gain (1/s) and bound on the front share. */
  lateralIntegral: 0.4,
  lateralIntegralBound: 0.5,
  /** Seconds: the steering's damping of the angle's rate. */
  steeringDamping: 0.25,
  /** Over-rotation beyond the asked angle and its slack is taken back at this gain per radian. */
  overSlack: 8 * DEGREE,
  overGain: 3,
  /** Seconds: the measured lateral acceleration is smoothed over this. */
  lateralSeconds: 0.05,
  /** Its own spin control: rear wheel slip beyond `slipLimit` lowers the throttle's cap at `slipRate` per second. */
  slipLimit: 0.12,
  slipRate: 4,
  /** m/s: the least speed a wheel's slip is read against. */
  slipSpeed: 3,
  /** The throttle's least cap. */
  leastCap: 0.05,
  /** Seconds: away from a drifted corner, grip driving damps the sideslip's rate by this. */
  gripDamping: 0.2,
});

/**
 * A drift driver's values from its vehicle's model: its tire's sliding ratio, which its plan drifts the corners on;
 * the speed its driven wheels roll at through first gear midway between the engine's peak power and its redline, which
 * sets the angle it asks (`band`); the fastest it starts a drift, its driven wheels spinning past the tire's peak slip
 * at the engine's peak power in first gear (`entry`); the engine speeds between which its throttle closes, so that the
 * spinning driven wheels keep the engine off the fuel cut, open to the redline and closed where the cut clears; and its
 * rear axle's distance behind the centre of mass.
 */
export interface DriftDriving {
  readonly slidingRatio: number;
  /** m/s */
  readonly band: number;
  /** m/s */
  readonly entry: number;
  /** rpm */
  readonly redline: number;
  readonly closed: number;
  /** m */
  readonly rearAxle: number;
}

export function compileDriftDriving(model: VehicleModel): DriftDriving {
  const { compiledVehicle, tire } = model;
  const { powertrain } = compiledVehicle;
  // The driven wheels' rolling speed through first gear at an engine speed (rpm), as the automatic reads it.
  const first = (rpm: number) =>
    (rpm * 2 * Math.PI) /
    60 /
    (powertrain.gearRatios[0]! * powertrain.finalDriveRatio) /
    rollingDrivenWheelOmega(compiledVehicle, 1, 1);
  return Object.freeze({
    slidingRatio: tire.slidingRatio,
    band: first((powertrain.peakPowerRpm + powertrain.redlineRpm) / 2),
    entry: first(powertrain.peakPowerRpm) / (1 + ((2 - tire.rhoKnee) * tire.muX) / tire.kX),
    redline: powertrain.redlineRpm,
    closed: powertrain.redlineRpm * model.powertrain.fuelCutClearRedlineRatio,
    rearAxle: compiledVehicle.rearAxle,
  });
}

/**
 * The parts of a driver's plan the drift law reads: its segments' path distances, cells and curvatures, its cells'
 * drift speeds squared, its constrained speeds squared, whether it drifts each segment, its speed now (`plan.target`),
 * and the path following its steering asks (`steer`).
 */
export interface DriftPlanRead {
  readonly count: number;
  readonly distances: Float64Array;
  readonly segmentCells: Int32Array;
  readonly curvatures: Float64Array;
  readonly cornering: { readonly drifts: Float64Array };
  readonly constrained: Float64Array;
  readonly drifted: Uint8Array;
  readonly plan: { readonly target: number };
  readonly steer: DriftSteer;
}

/**
 * What the planned driver's steering asks this step: the path's lateral acceleration (m/s², positive to the right), the
 * front tire's load factor it reads and the grip of the surface under the vehicle.
 */
export interface DriftSteer {
  lateral: number;
  frontLoad: number;
  grip: number;
}

/**
 * One vehicle's drift state: the corner it drifts (`side`, the sign of its curvature; 0 while it grips), the corner
 * side it gave up, whether it is leaving, the asked angle, the controllers' memory and the previous step's
 * observations. Its driver's workspace holds it.
 */
export function createDriftState() {
  return {
    side: 0,
    givenUp: 0,
    leaving: false,
    seconds: 0,
    asked: 0,
    throttleIntegral: 0,
    lateralIntegral: 0,
    travel: NaN,
    sideslip: NaN,
    toward: NaN,
    lateral: 0,
    throttleCap: 1,
  };
}
export type DriftState = ReturnType<typeof createDriftState>;

/** Forget the drift state: the vehicle is driven on afresh. */
export function resetDriftState(state: DriftState): void {
  state.side = 0;
  state.givenUp = 0;
  state.leaving = false;
  state.seconds = 0;
  state.asked = 0;
  state.throttleIntegral = 0;
  state.lateralIntegral = 0;
  state.travel = NaN;
  state.sideslip = NaN;
  state.toward = NaN;
  state.lateral = 0;
  state.throttleCap = 1;
}

/**
 * The sideslip (rad) of a steady drift at `speed` on curvature `curvature` whose driven wheels roll at `wheels` (m/s):
 * the rear tire's sliding force then lies across the travel, so the speed holds, where
 * `wheels = speed*(1/cos b + rearAxle*k*tan b)`; 0 where the wheels roll no faster than the vehicle.
 */
function steadyAngle(drift: DriftDriving, speed: number, curvature: number, wheels: number) {
  const r = wheels / speed,
    t = drift.rearAxle * Math.abs(curvature);
  const n = Math.hypot(r, t);
  return n <= 1 ? 0 : Math.max(0, Math.acos(1 / n) - Math.atan2(t, r));
}

/** The plan's segment holding the station `ahead` metres along the path. */
function segmentAhead(plan: DriftPlanRead, ahead: number) {
  let j = 1;
  while (j < plan.count && plan.distances[j]! < ahead) j++;
  return j;
}

/** The strongest signed curvature the plan drifts within `reach` metres, of sign `sign` when it is not 0; else 0. */
function strongestAhead(plan: DriftPlanRead, reach: number, sign = 0) {
  let best = 0;
  for (let j = 1; j < plan.count && plan.distances[j - 1]! <= reach; j++) {
    if (plan.drifted[j] !== 1) continue;
    const k = plan.curvatures[plan.segmentCells[j]!]!;
    if (sign !== 0 && Math.sign(k) !== sign) continue;
    if (Math.abs(k) > Math.abs(best)) best = k;
  }
  return best;
}

/**
 * The plan's least speed within `reach` metres (behind the vehicle ahead when one constrains it), and the signed
 * curvature there where the plan drifts it, else 0.
 */
function leastAhead(plan: DriftPlanRead, reach: number, out: { speed: number; curvature: number }) {
  let least = Infinity,
    at = 0;
  for (let j = 0; j < plan.count && plan.distances[j]! <= reach; j++)
    if (plan.constrained[j]! < least) {
      least = plan.constrained[j]!;
      at = j;
    }
  out.speed = Math.sqrt(Math.max(0, least === Infinity ? 0 : least));
  const j = Math.max(1, at);
  out.curvature = plan.count === 0 || plan.drifted[j] !== 1 ? 0 : plan.curvatures[plan.segmentCells[j]!]!;
  return out;
}

/** A tire's longitudinal slip from its observation: positive spinning, negative locking; 0 unloaded. */
function slipOf(tire: TireObservation) {
  return tire.load > 0
    ? (tire.wheelSpeed - tire.longitudinalVelocity) /
        Math.max(DRIFT_DRIVER.slipSpeed, Math.abs(tire.longitudinalVelocity))
    : 0;
}

const least = { speed: 0, curvature: 0 };
const pedals = { opening: 0, wheelTorquePerOpening: 0 };

/**
 * The drift style's input over the grip input `input` (the planned driver's, written in place) for `model`'s vehicle,
 * travelling in the direction `travel` (rad). Where the plan drifts a corner it drifts it in first gear: the throttle
 * holds the angle a steady drift there asks and the steering the path; elsewhere it drives the grip input under its own
 * spin control.
 */
export function driftDrivingInput(
  model: VehicleModel,
  drift: DriftDriving,
  car: VehicleDrivingRead,
  plan: DriftPlanRead,
  state: DriftState,
  travel: number,
  input: { steering: number; throttle: number | boolean; brake: number | boolean },
): void {
  const D = DRIFT_DRIVER;
  const { step, tire } = model;
  const speed = Math.hypot(car.longitudinalSpeed, car.lateralSpeed);
  const sideslip = wrapAngle(car.yaw - travel);
  const reach = Math.max(D.lookMetres, speed * D.lookSeconds);
  const near = plan.count === 0 ? 0 : plan.segmentCells[segmentAhead(plan, reach)]!;
  const nearCurvature = plan.count === 0 ? 0 : plan.curvatures[near]!;
  const nearDrift = plan.count === 0 ? 0 : Math.sqrt(plan.cornering.drifts[near]!);
  const { speed: leastSpeed, curvature: leastCurvature } = leastAhead(
    plan,
    speed * D.planSeconds + D.planMetres,
    least,
  );
  const target = plan.plan.target;
  // The first step after a start, a recovery or a takeover has no previous step to take rates from.
  const first = Number.isNaN(state.travel);
  // The measured lateral acceleration: the speed times the travel direction's rate, smoothed.
  const travelRate = first ? 0 : wrapAngle(travel - state.travel) / step;
  state.travel = travel;
  state.lateral += (speed * travelRate - state.lateral) * Math.min(1, step / D.lateralSeconds);
  // The driver's own spin control: the throttle's cap falls while the rear wheels spin past the limit.
  const spin = slipOf(car.tires.rear);
  if (!first)
    state.throttleCap = clamp(
      state.throttleCap + (spin > D.slipLimit ? -D.slipRate : D.slipRate / 2) * step,
      D.leastCap,
      1,
    );
  const sideslipRate = Number.isNaN(state.sideslip) ? 0 : wrapAngle(sideslip - state.sideslip) / step;
  state.sideslip = sideslip;
  const grip = () => {
    // Away from a drifted corner the steering damps the sideslip's rate.
    const corner = strongestAhead(plan, speed * D.planSeconds + D.planMetres) !== 0;
    input.steering = clamp(input.steering - (corner ? 0 : D.gripDamping) * sideslipRate, -1, 1);
    input.throttle = Math.min(+input.throttle, state.throttleCap);
  };
  const enter = (side: number) => {
    state.side = side;
    state.seconds = 0;
    state.throttleIntegral = 0;
    state.lateralIntegral = 0;
    state.toward = NaN;
    state.asked = Math.max(0, side * sideslip);
    state.leaving = false;
  };
  // In flight the grip input holds.
  if (car.tires.front.load === 0 && car.tires.rear.load === 0) return grip();
  // A given-up corner stays given up until it ends.
  if (state.givenUp !== 0 && strongestAhead(plan, reach, state.givenUp) === 0) state.givenUp = 0;
  if (state.side === 0) {
    // A drift starts in first gear where a drifted corner lies at hand, once the speed reaches the drift's on the
    // curvature at hand, so that the rear tire nears its sliding force, and is no faster than the least speed ahead; or
    // once the vehicle already slides.
    const k = strongestAhead(plan, reach);
    const side = Math.sign(k);
    if (
      k !== 0 &&
      side !== state.givenUp &&
      car.tires.rear.load > 0 &&
      car.powertrain.gear === 1 &&
      ((speed * D.enterOver >= nearDrift && speed <= leastSpeed * D.enterOver) || side * sideslip > D.startAngle)
    )
      enter(side);
    else return grip();
  }
  // A corner the other way close ahead: swing across when its speed allows, else straighten for the brakes.
  if (strongestAhead(plan, Math.max(D.switchMetres, speed * D.switchSeconds), -state.side) !== 0) {
    if (speed <= leastSpeed * D.enterOver) enter(-state.side);
    else state.leaving = true;
  }
  const side = state.side;
  state.seconds += step;
  const toward = side * sideslip;
  const towardRate = Number.isNaN(state.toward) ? 0 : (toward - state.toward) / step;
  state.toward = toward;
  // Leave when the corner ends ahead, or when the slowest point ahead lies past it (brake in a straight line).
  if (strongestAhead(plan, reach, side) === 0) state.leaving = true;
  if (leastSpeed < speed / D.capOver && side * leastCurvature <= 0) state.leaving = true;
  // A corner whose angle does not build is given up: grip until it ends.
  if (!state.leaving && state.seconds > D.giveUpSeconds && toward < D.giveUpAngle) {
    state.givenUp = side;
    state.side = 0;
    return grip();
  }
  if (state.leaving && toward < D.leastAngle) {
    state.side = 0;
    return grip();
  }
  // The asked angle: a steady drift's at the corner's drift speed at hand, its driven wheels rolling at the band.
  const goal = state.leaving
    ? 0
    : clamp(steadyAngle(drift, Math.max(nearDrift, 1), nearCurvature, drift.band), D.leastAngle, D.mostAngle);
  const rate = (D.mostAngle / D.angleSeconds) * step;
  state.asked += clamp(goal - state.asked, -rate, rate);
  // The throttle holds the angle: from the opening that drives the steady drift's rear tire, its sliding force's part
  // along the body at the asked angle, with feedback on the angle's error.
  const error = state.asked - toward;
  const { compiledVehicle } = model;
  const rear = compiledVehicle.rearStation;
  const sliding =
    drift.slidingRatio *
    tire.muX *
    plan.steer.grip *
    effectiveTireLoad(tire, car.tires.rear.load, rear.suspension.staticLoad) *
    Math.sin(state.asked);
  const steady = clamp(
    openingForDriveTorque(
      compiledVehicle.powertrain,
      model.powertrain,
      car.powertrain,
      sliding * rear.rollingRadius,
      pedals,
    ).opening,
    0,
    1,
  );
  const unbounded = steady + D.throttleGain * error - D.throttleDamping * towardRate + state.throttleIntegral;
  let throttle = clamp(unbounded, 0, 1);
  let brake = 0;
  // While the angle builds, within the scrub's speed, the throttle alone acts: it spins the rear tire loose.
  const initiating = !state.leaving && toward < D.startAngle && speed <= target * D.capOver;
  if (!initiating && speed > target * D.capOver) {
    // Too fast for the plan here: scrub with the angle, and brake while the angle allows.
    throttle = Math.min(throttle, D.cappedThrottle);
    if (toward < state.asked + D.scrubSlack) {
      brake = clamp(D.scrubGain * (speed / target - 1), 0, D.scrubBrake);
      if (brake > 0.02) {
        throttle = 0;
        state.throttleIntegral = Math.min(state.throttleIntegral, 0);
      }
    }
  }
  // The spinning wheels keep the engine off the fuel cut: open to the redline, closed where the cut clears.
  throttle = Math.min(
    throttle,
    clamp((drift.closed - car.powertrain.engineRpm) / (drift.closed - drift.redline), 0, 1),
  );
  // The integral follows the angle's error only while the throttle acts on it unbounded.
  if (!initiating && !(error > 0 && throttle < unbounded) && !(error < 0 && throttle > unbounded))
    state.throttleIntegral = clamp(
      state.throttleIntegral + D.throttleIntegral * error * step,
      -D.throttleIntegralBound,
      D.throttleIntegralBound,
    );
  // The steering keeps the path: the steady drift's front share, its tire's sliding ratio of its bound over the rule's
  // utilization, closing the error between the lateral acceleration the path asks and the measured one through the
  // front tire's authority, its lateral force per unit input over the mass.
  const front = compiledVehicle.frontStation;
  const authority =
    (D.steering.utilization * tire.muY * plan.steer.grip * plan.steer.frontLoad * front.suspension.staticLoad) /
    compiledVehicle.mass;
  const lateralError = (side * (plan.steer.lateral - state.lateral)) / authority;
  state.lateralIntegral = clamp(
    state.lateralIntegral + D.lateralIntegral * lateralError * step,
    -D.lateralIntegralBound,
    D.lateralIntegralBound,
  );
  const share = clamp(
    drift.slidingRatio / D.steering.utilization + lateralError + state.lateralIntegral,
    -D.counterShare,
    1,
  );
  // Over-rotation: front force into the turn adds yaw, so it is taken back beyond the asked angle and a slack.
  const over = Math.max(0, toward - state.asked - D.overSlack);
  input.steering = clamp(side * (share - D.steeringDamping * towardRate - D.overGain * over), -1, 1);
  input.throttle = brake > 0 ? 0 : throttle;
  input.brake = brake;
}
