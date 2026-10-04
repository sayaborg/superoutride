import { createPlanCoordinateSample, type PlanCoordinateReader } from '../course/geometry/plan-coordinate.js';
import { routeSectionS, type RouteView } from '../course/course-route.js';
import { bodyContactForce, type CompiledBodyContact } from '../vehicle/physics/body-contact.js';
import type { ContactBody } from './body-contacts.js';

/**
 * The race's wall and course-limit contacts for one fixed step of `step` seconds, from the state at the step's start,
 * added to each body's contact force. A barrier line acts on a vehicle whose centre's Section station lies on it: the
 * overlap is half the vehicle's overall width less its centre's lateral distance from the line, measured toward the side
 * the line keeps it on (a wall: the side its centre is on). Overlapping, it pushes along the road's horizontal right,
 * away from the line, with the body contact spring-damper on the vehicle's own mass (the line does not move) and the
 * approach speed: how fast the overlap grows, the vehicle's lateral speed toward the line plus the line's slope times its
 * speed along the road (a slanted line closes on a vehicle driving along it). Friction along the road's tangent opposes
 * the vehicle's speed along the road, at
 * `barrierFriction` times the push, never enough to reverse that speed within the step. Height is not compared. Each
 * body a line pushes is passed to `pushed`.
 */
export function createBarrierContacts(
  coordinates: PlanCoordinateReader,
  route: Pick<RouteView, 'at'>,
  contact: CompiledBodyContact,
  step: number,
) {
  const sample = createPlanCoordinateSample();
  return (bodies: readonly ContactBody[], pushed: (body: ContactBody) => void) => {
    for (const body of bodies) {
      const vehicle = body.vehicle;
      const occurrence = route.at(vehicle.course.s);
      if (!occurrence) continue;
      const s = routeSectionS(occurrence, vehicle.course.s),
        l = vehicle.course.l + occurrence.lateralOrigin;
      const { overallWidth, mass } = body.model.compiledVehicle;
      let heading = NaN;
      for (const line of occurrence.section.barriers) {
        if (s < line.start || s > line.end) continue;
        const offset = l - line.lateralAt(s);
        const side = line.keep !== 0 ? line.keep : offset < 0 ? -1 : 1;
        const overlap = overallWidth / 2 - side * offset;
        if (overlap <= 0) continue;
        if (Number.isNaN(heading)) heading = coordinates.toWorld(vehicle.course.s, vehicle.course.l, sample).heading;
        // The unit axis away from the line (the road's right, signed by the kept side) and the road's tangent.
        const nx = side * Math.cos(heading),
          nz = -side * Math.sin(heading);
        const tx = Math.sin(heading),
          tz = Math.cos(heading);
        const along = vehicle.velocityX * tx + vehicle.velocityZ * tz;
        const approach = side * line.slopeAt(s) * along - (vehicle.velocityX * nx + vehicle.velocityZ * nz);
        const push = bodyContactForce(contact, mass, overlap, approach);
        if (push === 0) continue;
        const friction = Math.sign(along) * Math.min(contact.barrierFriction * push, (mass * Math.abs(along)) / step);
        body.contactForce.x += push * nx - friction * tx;
        body.contactForce.z += push * nz - friction * tz;
        pushed(body);
      }
    }
  };
}
