import type { CompiledArcadeVehicleProfile } from './vehicle-profiles.js';
import { contactForceWorld, momentAboutCg, VEHICLE_GRAVITY,
  type BodyKinematics, type ContactObservation } from './vehicle-dynamics.js';
import type { WheelSolveResult } from './tire-wheel.js';
import { add3, scale3, type Vec3 } from './vehicle-math3.js';

export interface VehicleWrench { readonly force: Vec3; readonly moment: Vec3 }

/** The single contact/aero/gravity/wheel-reaction assembly, shared by protection and integration. */
export function evaluateVehicleWrench(profile: CompiledArcadeVehicleProfile, body: BodyKinematics,
  front: ContactObservation, rear: ContactObservation,
  frontWheel: WheelSolveResult, rearWheel: WheelSolveResult): VehicleWrench {
  const frontForce = contactForceWorld(front, frontWheel.tire.fx, frontWheel.tire.fy);
  const rearForce = contactForceWorld(rear, rearWheel.tire.fx, rearWheel.tire.fy);
  const planarVelocity = { x: body.velocity.x, y: 0, z: body.velocity.z };
  const planarSpeed = Math.hypot(planarVelocity.x, planarVelocity.z);
  const aeroForce = scale3(planarVelocity, -profile.quadraticDrag * planarSpeed);
  const gravity = { x: 0, y: -profile.mass * VEHICLE_GRAVITY, z: 0 };
  const force = add3(add3(frontForce, rearForce), add3(aeroForce, gravity));
  const contactMoment = add3(momentAboutCg(front, body.position, frontForce),
    momentAboutCg(rear, body.position, rearForce));
  const wheelReaction = add3(
    scale3(front.wheelAxis, -profile.frontWheelInertia * frontWheel.omegaDot),
    scale3(rear.wheelAxis, -profile.rearWheelInertia * rearWheel.omegaDot));
  return { force, moment: add3(contactMoment, wheelReaction) };
}
