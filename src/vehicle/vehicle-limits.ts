import { sampleEngineTorque } from './physics/automatic-powertrain.js';
import { radialKneeInverse } from './physics/tire-friction-calibration.js';
import { VEHICLE_GRAVITY } from './physics/vehicle-state.js';
import type { VehicleModel } from './physics/vehicle-model.js';

/** Bisection steps of a steady speed; the bracket runs to the top gear's fuel-cut speed. */
const STEADY_SPEED_ITERATIONS = 40;
/** Bisection steps of a longitudinal limit, whose axle loads move with the force itself. */
const LOAD_TRANSFER_ITERATIONS = 24;

/**
 * A vehicle's limits as a point mass on two axles, per unit mass (m/s²), the one model a planned driver plans with.
 * Each axle's tire forms a friction ellipse whose semi-axes are `muX` and `muY` times gravity, the surface grip, the
 * axle's static share of the weight and its effective load factor: its load over its static load, read through the
 * tire's load sensitivity, `n/(1+r(n-1))`, as the wheel solve reads loads. Both axles share the vehicle's load factor
 * `n`, which the tires' longitudinal force moves between them by its moment at the centre of mass's height. Drive is
 * the best full-throttle wheel force over the gears (a gear whose engine speed would pass redline is not available but
 * the top gear's, up to fuel cut; below the clutch lock the slipping clutch holds the engine at its maximum-torque
 * speed), bounded by the driven axles' ellipses under the drive split; braking is each axle's brake torque at its
 * rolling radius, bounded by its ellipse. The steering axle's lateral ellipse bounds the lateral acceleration, and the
 * tires' lateral slip drags. Drag acts as the mechanics apply it, and the wheels' rotational inertia adds to the mass.
 */
export interface VehicleLimits {
  readonly mass: number;
  /**
   * The vehicle's inertia along its travel per unit mass: 1 plus the wheels' rotational inertia at their rolling radii.
   * A longitudinal force per unit mass accelerates the vehicle by itself over this.
   */
  readonly inertia: number;
  /** m/s²: the full brake torques' force over the mass. */
  readonly brake: number;
  /** m/s²: aerodynamic drag at speed `v` over the mass. */
  drag(v: number): number;
  /** m/s²: the best full-throttle wheel force at speed `v` over the mass, before the tires bound it. */
  drive(v: number): number;
  /**
   * m/s²: the lateral limit at utilization `utilization` on `grip` at load factor `n` while the tires' longitudinal force
   * is `longitudinal` (m/s², drive positive): the steering axle's lateral ellipse.
   */
  lateralLimit(utilization: number, grip: number, n: number, longitudinal: number): number;
  /**
   * m/s²: the drive force at speed `v` within the driven axles' ellipses at `utilization` on `grip` at load factor `n`,
   * of which the lateral demand leaves `share` of each longitudinal semi-axis.
   */
  driveLimit(v: number, utilization: number, grip: number, n: number, share: number): number;
  /** m/s²: the brake force at `utilization` of the brake torques within the axles' ellipses, as `driveLimit`. */
  brakeLimit(utilization: number, grip: number, n: number, share: number): number;
  /**
   * m/s²: the drag of the tires' slip when they carry lateral acceleration `lateral` at load factor `n` on `grip`: the
   * lateral times the pure-lateral slip the tire law needs for it.
   */
  corneringDrag(lateral: number, n: number, grip: number): number;
  /**
   * m/s: the fastest steady speed on a path of curvature `curvature` (1/m) at grade angle `grade` (rad) and vertical
   * curvature `vertical` (1/m), on `grip` with rolling resistance `rolling`, at utilization `utilization`: the lateral
   * demand within the lateral limit, and drive enough for drag, grade, rolling and cornering drag within what the
   * ellipses leave the driven axles. Where the load factor reaches 0 the vehicle leaves the ground: any speed holds.
   */
  steadySpeed(
    curvature: number,
    grade: number,
    vertical: number,
    grip: number,
    rolling: number,
    utilization: number,
  ): number;
  /** m/s: the steady speed on a level straight with rolling resistance `rolling`, at full utilization. */
  speedCap(rolling: number): number;
}

/** The effective load factor the tire law reads at load factor `n`: `n/(1+r(n-1))`, none at or below zero. */
function effectiveLoadFactor(loadSensitivity: number, n: number): number {
  return n > 0 ? n / (1 + loadSensitivity * (n - 1)) : 0;
}

export function createVehicleLimits(model: VehicleModel): VehicleLimits {
  const { compiledVehicle: vehicle, tire, powertrain: constants } = model;
  const { mass, frontDriveTorqueFraction: split, powertrain, frontStation, rearStation } = vehicle;
  const wheelbase = vehicle.frontAxle + vehicle.rearAxle;
  // Static weight shares, and each axle's load factor change per unit tire force (m/s²) toward the front.
  const frontShare = vehicle.rearAxle / wheelbase,
    rearShare = vehicle.frontAxle / wheelbase;
  // The suspension pitches with the load moved, which moves the contacts under the centre of mass and moves more load:
  // a pitch compliance amplifies the rigid transfer.
  const compliance =
    ((mass * VEHICLE_GRAVITY * vehicle.desiredCgHeight) / (wheelbase * wheelbase)) *
    (1 / frontStation.suspension.springRate + 1 / rearStation.suspension.springRate);
  const height = vehicle.desiredCgHeight / (1 - compliance);
  const frontTransfer = height / (VEHICLE_GRAVITY * vehicle.rearAxle),
    rearTransfer = height / (VEHICLE_GRAVITY * vehicle.frontAxle);
  const frontBrake = frontStation.maxBrakeTorque / frontStation.rollingRadius / mass,
    rearBrake = rearStation.maxBrakeTorque / rearStation.rollingRadius / mass;
  // Driven-wheel speed per unit road speed, which is also the wheel force per unit drive torque.
  const wheelPerSpeed = split / frontStation.rollingRadius + (1 - split) / rearStation.rollingRadius;
  const top = powertrain.gearRatios.length;
  const rpmPerSpeed = (wheelPerSpeed * powertrain.finalDriveRatio * 60) / (2 * Math.PI);
  const fuelCut = powertrain.redlineRpm * constants.fuelCutEnterRedlineRatio;
  const upper = fuelCut / (rpmPerSpeed * powertrain.gearRatios[top - 1]!);
  const friction = (mu: number, n: number) => mu * VEHICLE_GRAVITY * effectiveLoadFactor(tire.loadSensitivity, n);
  // Each axle's longitudinal ellipse per unit vehicle mass while the tires' longitudinal force is `force`.
  const front = (n: number, force: number) => frontShare * friction(tire.muX, n - force * frontTransfer);
  const rear = (n: number, force: number) => rearShare * friction(tire.muX, n + force * rearTransfer);

  const drag = (v: number) => (vehicle.quadraticDrag * v * v) / mass;
  const drive = (v: number) => {
    let best = 0;
    for (let gear = 1; gear <= top; gear++) {
      const ratio = powertrain.gearRatios[gear - 1]!;
      const rpm = Math.abs(v) * rpmPerSpeed * ratio;
      if (rpm > (gear === top ? fuelCut : powertrain.redlineRpm)) continue;
      const engine = sampleEngineTorque(powertrain, gear === 1 ? Math.max(rpm, powertrain.peakTorqueRpm) : rpm);
      best = Math.max(best, engine * ratio * powertrain.finalDriveRatio * constants.drivelineEfficiency);
    }
    return (best * wheelPerSpeed) / mass;
  };
  const lateralLimit = (utilization: number, grip: number, n: number, longitudinal: number) =>
    utilization * grip * friction(tire.muY, n - longitudinal * frontTransfer);
  // A longitudinal force within the axles' ellipses whose own load transfer bounds it: the largest `force` at or below
  // `bound(force)`, by bisection from `most`.
  const transferred = (most: number, bound: (force: number) => number) => {
    if (bound(most) >= most) return most;
    let low = 0,
      high = most;
    for (let i = 0; i < LOAD_TRANSFER_ITERATIONS; i++) {
      const force = (low + high) / 2;
      if (bound(force) >= force) low = force;
      else high = force;
    }
    return low;
  };
  const driveLimit = (v: number, utilization: number, grip: number, n: number, share: number) => {
    const scale = utilization * grip * share;
    return transferred(drive(v), (force) =>
      Math.min(
        split > 0 ? (scale * front(n, force)) / split : Infinity,
        split < 1 ? (scale * rear(n, force)) / (1 - split) : Infinity,
      ),
    );
  };
  const brakeLimit = (utilization: number, grip: number, n: number, share: number) => {
    const scale = utilization * grip * share;
    return transferred(
      utilization * (frontBrake + rearBrake),
      (force) =>
        Math.min(utilization * frontBrake, scale * front(n, -force)) +
        Math.min(utilization * rearBrake, scale * rear(n, -force)),
    );
  };
  const corneringDrag = (lateral: number, n: number, grip: number) => {
    const capacity = grip * friction(tire.muY, n);
    if (!(capacity > 0)) return 0;
    const demand = radialKneeInverse(tire.rhoKnee, Math.min(1, Math.abs(lateral) / capacity));
    return (Math.abs(lateral) * grip * demand * tire.muY) / tire.kY;
  };
  const steadySpeed = (
    curvature: number,
    grade: number,
    vertical: number,
    grip: number,
    rolling: number,
    utilization: number,
  ) => {
    const k = Math.abs(curvature);
    const feasible = (v: number) => {
      const n = Math.cos(grade) + (v * v * vertical) / VEHICLE_GRAVITY;
      if (!(n > 0)) return true;
      const lateral = v * v * k;
      const longitudinal =
        drag(v) + corneringDrag(lateral, n, grip) + VEHICLE_GRAVITY * (Math.sin(grade) + rolling * n);
      const capacity = lateralLimit(utilization, grip, n, Math.max(0, longitudinal));
      if (!(lateral <= capacity)) return false;
      return driveLimit(v, utilization, grip, n, Math.sqrt(1 - (lateral / capacity) ** 2)) >= longitudinal;
    };
    let low = 0,
      high = upper;
    for (let i = 0; i < STEADY_SPEED_ITERATIONS; i++) {
      const v = (low + high) / 2;
      if (feasible(v)) low = v;
      else high = v;
    }
    return low;
  };
  return Object.freeze({
    mass,
    inertia:
      1 +
      (frontStation.wheelInertia / frontStation.rollingRadius ** 2 +
        rearStation.wheelInertia / rearStation.rollingRadius ** 2) /
        mass,
    brake: frontBrake + rearBrake,
    drag,
    drive,
    lateralLimit,
    driveLimit,
    brakeLimit,
    corneringDrag,
    steadySpeed,
    speedCap: (rolling: number) => steadySpeed(0, 0, 0, 1, rolling, 1),
  });
}
