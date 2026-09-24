import type { WheelSolveResult } from './tire-wheel.js';
import {
  contactForceWorld,
  momentAboutCg,
  VEHICLE_GRAVITY,
  type BodyKinematics,
  type ContactObservation,
} from './vehicle-dynamics.js';
import { add3, scale3, type Vec3 } from '../../core/vector3.js';
import type { CompiledVehicle } from './vehicle-definitions.js';

export interface VehicleWrench {
  readonly force: Vec3;
  readonly moment: Vec3;
}

export function createWrenchWorkspace() {
  const v = () => ({ x: 0, y: 0, z: 0 });
  return { value: { force: v(), moment: v() }, front: v(), rear: v(), a: v(), b: v(), c: v() };
}

/** The single contact/aero/gravity/wheel-reaction assembly, shared by protection and integration. */
export function evaluateVehicleWrench(
  compiledVehicle: CompiledVehicle,
  body: BodyKinematics,
  front: ContactObservation,
  rear: ContactObservation,
  frontWheel: WheelSolveResult,
  rearWheel: WheelSolveResult,
  workspace = createWrenchWorkspace(),
): VehicleWrench {
  const { a, b, c, value } = workspace;
  const frontForce = contactForceWorld(front, frontWheel.tire.fx, frontWheel.tire.fy, workspace.front);
  const rearForce = contactForceWorld(rear, rearWheel.tire.fx, rearWheel.tire.fy, workspace.rear);
  a.x = body.velocity.x;
  a.y = 0;
  a.z = body.velocity.z;
  const planarSpeed = Math.hypot(a.x, a.z);
  const aeroForce = scale3(a, -compiledVehicle.quadraticDrag * planarSpeed, a);
  b.x = 0;
  b.y = -compiledVehicle.mass * VEHICLE_GRAVITY;
  b.z = 0;
  add3(add3(frontForce, rearForce, c), add3(aeroForce, b, a), value.force);
  const contactMoment = add3(
    momentAboutCg(front, body.position, frontForce, a),
    momentAboutCg(rear, body.position, rearForce, b),
    c,
  );
  const wheelReaction = add3(
    scale3(front.wheelAxis, -compiledVehicle.frontStation.wheelInertia * frontWheel.omegaDot, a),
    scale3(rear.wheelAxis, -compiledVehicle.rearStation.wheelInertia * rearWheel.omegaDot, b),
    a,
  );
  add3(contactMoment, wheelReaction, value.moment);
  return value;
}
