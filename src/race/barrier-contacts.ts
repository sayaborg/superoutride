import { createPlanCoordinateSample, type PlanCoordinateReader } from '../course/geometry/plan-coordinate.js';
import { routeSectionS, type RouteView } from '../course/course-route.js';
import {
  bodyContactDampingPower,
  bodyContactForce,
  type CompiledBodyContact,
} from '../vehicle/physics/body-contact.js';
import type { ContactLog } from './contact-log.js';
import type { ContactBody, createContactFaces } from './body-contacts.js';

/**
 * The race's wall and course-limit contacts for one fixed step of `step` seconds, from the state at the step's start,
 * added to each body's contact force. A barrier line acts on a vehicle whose centre's Section station lies on it: the
 * overlap is half the vehicle's overall width less its centre's lateral distance from the line, measured toward the side
 * the line keeps it on (a course limit: its own side; a wall: the side the vehicle's centre was on when it began to touch
 * the wall, kept by the contact faces while they overlap). Overlapping, it pushes along the road's horizontal right,
 * away from the line, with the body contact spring-damper on the vehicle's own mass (the line does not move) and the
 * approach speed: how fast the overlap grows, the vehicle's lateral speed toward the line plus the line's slope times its
 * speed along the road (a slanted line closes on a vehicle driving along it). Friction along the road's tangent opposes
 * the vehicle's speed along the road, at
 * `barrierFriction` times the push, never enough to reverse that speed within the step. Height is not compared. Each
 * body a line pushes is passed to `pushed`. Every line touch is recorded in the contact faces, so a line's contact begins
 * as a pair's does; `log` receives each begun contact (a `wall`, course limits included, with its damper term's work
 * over the step) and each push with its friction's power.
 *
 * The Route's ends are course limits across the road (K, 2026-11-12): its start (`ends.start`) keeps vehicles after it
 * and its terminal (`ends.terminal`, the end of a Section no Link leaves; none on a circuit) before it. Each acts as a
 * side limit does, turned across the road: the overlap is half the footprint less the centre's route distance from the
 * end, the push is along the road's tangent with the same spring-damper and friction opposes the speed across the road;
 * contact records, sound and an exploding vehicle's explosion follow as for any limit.
 */
export function createBarrierContacts(
  coordinates: PlanCoordinateReader,
  route: Pick<RouteView, 'at'>,
  ends: { readonly start: number; readonly terminal: number | null },
  contact: CompiledBodyContact,
  faces: ReturnType<typeof createContactFaces>,
  step: number,
  log: ContactLog,
) {
  const sample = createPlanCoordinateSample();
  // The Route end at `station` keeping `body` on its `keep` side (1: after it, -1: before it), as the limit `key`.
  const end = (body: ContactBody, station: number, keep: 1 | -1, key: string, pushed: (body: ContactBody) => void) => {
    const { vehicle } = body;
    const { footprint, mass } = body.model.compiledVehicle;
    const overlap = footprint / 2 - keep * (vehicle.course.s - station);
    if (overlap <= 0) return;
    const began = faces.touchLine(body.id, key, keep);
    const heading = coordinates.toWorld(vehicle.course.s, vehicle.course.l, sample).heading;
    // The unit axis away from the end (the road's tangent, signed by the kept side) and the road's right.
    const nx = keep * Math.sin(heading),
      nz = keep * Math.cos(heading);
    const rx = Math.cos(heading),
      rz = -Math.sin(heading);
    const approach = -(vehicle.velocityX * nx + vehicle.velocityZ * nz);
    const across = vehicle.velocityX * rx + vehicle.velocityZ * rz;
    const push = bodyContactForce(contact, mass, overlap, approach);
    if (began) log.start(body.id, 'wall', push > 0 ? bodyContactDampingPower(contact, mass, approach) * step : 0);
    if (push === 0) return;
    const friction = Math.sign(across) * Math.min(contact.barrierFriction * push, (mass * Math.abs(across)) / step);
    body.contactForce.x += push * nx - friction * rx;
    body.contactForce.z += push * nz - friction * rz;
    pushed(body);
  };
  return (bodies: readonly ContactBody[], pushed: (body: ContactBody) => void) => {
    for (const body of bodies) {
      end(body, ends.start, 1, 'route start', pushed);
      if (ends.terminal !== null) end(body, ends.terminal, -1, 'route terminal', pushed);
      const vehicle = body.vehicle;
      const occurrence = route.at(vehicle.course.s);
      if (!occurrence) continue;
      const s = routeSectionS(occurrence, vehicle.course.s),
        l = vehicle.course.l + occurrence.lateralOrigin;
      const { footprint, mass } = body.model.compiledVehicle;
      let heading = NaN;
      occurrence.section.barriers.forEach((line, index) => {
        if (s < line.start || s > line.end) return;
        const offset = l - line.lateralAt(s);
        const key = `line ${occurrence.section.id} ${index}`;
        const side = line.keep !== 0 ? line.keep : faces.lineSide(body.id, key, offset < 0 ? -1 : 1);
        const overlap = footprint / 2 - side * offset;
        if (overlap <= 0) return;
        const began = faces.touchLine(body.id, key, side);
        if (Number.isNaN(heading)) heading = coordinates.toWorld(vehicle.course.s, vehicle.course.l, sample).heading;
        // The unit axis away from the line (the road's right, signed by the kept side) and the road's tangent.
        const nx = side * Math.cos(heading),
          nz = -side * Math.sin(heading);
        const tx = Math.sin(heading),
          tz = Math.cos(heading);
        const along = vehicle.velocityX * tx + vehicle.velocityZ * tz;
        const approach = side * line.slopeAt(s) * along - (vehicle.velocityX * nx + vehicle.velocityZ * nz);
        const push = bodyContactForce(contact, mass, overlap, approach);
        if (began) log.start(body.id, 'wall', push > 0 ? bodyContactDampingPower(contact, mass, approach) * step : 0);
        if (push === 0) return;
        const friction = Math.sign(along) * Math.min(contact.barrierFriction * push, (mass * Math.abs(along)) / step);
        body.contactForce.x += push * nx - friction * tx;
        body.contactForce.z += push * nz - friction * tz;
        pushed(body);
      });
    }
  };
}
