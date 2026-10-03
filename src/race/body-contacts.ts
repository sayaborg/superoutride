import { createPlanCoordinateSample, type PlanCoordinateReader } from '../course/geometry/plan-coordinate.js';
import type { Writable } from '../core/writable.js';
import type { Vec3 } from '../core/vector3.js';
import { bodyContactForce, type CompiledBodyContact } from '../vehicle/physics/body-contact.js';
import type { VehicleState } from '../vehicle/physics/vehicle-physics.js';
import type { VehicleModel } from '../vehicle/physics/vehicle-model.js';

/** A vehicle's footprint on the Route: its centre (route s and l) and its overall length and width. */
export interface RouteFootprint {
  readonly s: number;
  readonly l: number;
  readonly length: number;
  readonly width: number;
}

/**
 * Two footprints laid along the road overlap when both their ahead-behind and side-to-side overlaps are positive:
 * `(length₁ + length₂)/2 − |Δs|` and `(width₁ + width₂)/2 − |Δl|`. Height is not compared.
 */
export function footprintsOverlap(a: RouteFootprint, b: RouteFootprint): boolean {
  return (a.length + b.length) / 2 - Math.abs(b.s - a.s) > 0 && (a.width + b.width) / 2 - Math.abs(b.l - a.l) > 0;
}

/** One vehicle in body contact: its live state and model, and the external force the contacts write. */
export interface ContactBody {
  readonly vehicle: VehicleState;
  readonly model: VehicleModel;
  readonly contactForce: Writable<Vec3>;
}

/**
 * The race's body contacts for one fixed step, from the state at the step's start. Every pair whose footprints
 * overlap pushes apart along the shallower overlap: along the road's horizontal tangent when the ahead-behind overlap
 * is the smaller (or equal), else along its horizontal right, both read at the pair's midpoint. Each body receives the
 * spring-damper force on the pair's reduced mass, equal and opposite, summed over its pairs in body order.
 */
export function createBodyContacts(coordinates: PlanCoordinateReader, contact: CompiledBodyContact) {
  const sample = createPlanCoordinateSample();
  return (bodies: readonly ContactBody[]) => {
    for (const body of bodies) {
      body.contactForce.x = 0;
      body.contactForce.y = 0;
      body.contactForce.z = 0;
    }
    for (let i = 0; i < bodies.length; i += 1) {
      const a = bodies[i]!,
        av = a.vehicle,
        am = a.model.compiledVehicle;
      for (let j = i + 1; j < bodies.length; j += 1) {
        const b = bodies[j]!,
          bv = b.vehicle,
          bm = b.model.compiledVehicle;
        const ds = bv.course.s - av.course.s;
        const overlapS = (am.overallLength + bm.overallLength) / 2 - Math.abs(ds);
        if (overlapS <= 0) continue;
        const dl = bv.course.l - av.course.l;
        const overlapL = (am.overallWidth + bm.overallWidth) / 2 - Math.abs(dl);
        if (overlapL <= 0) continue;
        const { heading } = coordinates.toWorld(
          (av.course.s + bv.course.s) / 2,
          (av.course.l + bv.course.l) / 2,
          sample,
        );
        // The unit axis from a towards b: the road tangent or its right, signed by b's side of a.
        const alongS = overlapS <= overlapL;
        const sign = (alongS ? ds : dl) < 0 ? -1 : 1;
        const nx = sign * (alongS ? Math.sin(heading) : Math.cos(heading));
        const nz = sign * (alongS ? Math.cos(heading) : -Math.sin(heading));
        const approach = (av.velocityX - bv.velocityX) * nx + (av.velocityZ - bv.velocityZ) * nz;
        const force = bodyContactForce(
          contact,
          (am.mass * bm.mass) / (am.mass + bm.mass),
          alongS ? overlapS : overlapL,
          approach,
        );
        a.contactForce.x -= force * nx;
        a.contactForce.z -= force * nz;
        b.contactForce.x += force * nx;
        b.contactForce.z += force * nz;
      }
    }
  };
}
