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

/** One vehicle in body contact: its stable id, live state and model, its route position one step earlier, and the external force the contacts write. */
export interface ContactBody {
  readonly id: string;
  readonly vehicle: VehicleState;
  readonly model: VehicleModel;
  /** Its route position at the start of the previous step. */
  readonly previous: Readonly<{ s: number; l: number }>;
  readonly contactForce: Writable<Vec3>;
}

/** A pair's contact face, fixed when the contact begins: ahead-behind (`s`) or side to side (`l`), and b's side of a. */
interface ContactFace {
  readonly alongS: boolean;
  readonly sign: 1 | -1;
}

/**
 * The fraction of the previous step at which a separated axis began to overlap, from the relative positions `before`
 * (separated) and `now` (overlapping) along it and the half sum `half` of the two extents, moving linearly between them.
 */
function overlapStart(before: number, now: number, half: number): number {
  const sign = before < 0 ? -1 : 1;
  return (sign * before - half) / (sign * before - sign * now);
}

/**
 * Decide the face of a contact beginning this step from the pair's relative positions one step earlier (`ps`, `pl`) and
 * now (`ds`, `dl`), with half sums `hs` and `hl`: the axis that was separated while the other overlapped; when both were
 * separated, the one that began to overlap later within the step (ahead-behind when equal). The sign is b's side of a
 * along that axis one step earlier. Should both have overlapped already, the shallower current overlap decides, signed by
 * the current side, as in an untracked contact.
 */
function entryFace(ps: number, pl: number, ds: number, dl: number, hs: number, hl: number): ContactFace {
  const apartS = hs - Math.abs(ps) <= 0,
    apartL = hl - Math.abs(pl) <= 0;
  let alongS: boolean;
  if (apartS && apartL) alongS = overlapStart(ps, ds, hs) >= overlapStart(pl, dl, hl);
  else if (apartS || apartL) alongS = apartS;
  else {
    alongS = hs - Math.abs(ds) <= hl - Math.abs(dl);
    return { alongS, sign: (alongS ? ds : dl) < 0 ? -1 : 1 };
  }
  return { alongS, sign: (alongS ? ps : pl) < 0 ? -1 : 1 };
}

/**
 * The race's body contacts for one fixed step, from the state at the step's start. A contact begins when two
 * footprints and height ranges overlap; a vehicle's height range runs from its bottom, its centre-of-mass height less
 * `desiredCgHeight`, up `overallHeight`. Its face, the axis and the side each is pushed to, is decided once as the
 * contact begins (`entryFace`) and kept until the footprints separate: until the overlap along the face, the half sum
 * less the signed relative position, or the other axis's overlap is no longer positive. The push acts along that axis,
 * the road's horizontal tangent or right read at the pair's midpoint, for as long as the height ranges overlap. Each
 * body receives the spring-damper force on the pair's reduced mass, equal and opposite, summed over its pairs in body
 * order. A pair is keyed by its two ids; pairs no longer in contact, including those of vehicles gone from the Session,
 * are forgotten each step.
 */
export function createBodyContacts(coordinates: PlanCoordinateReader, contact: CompiledBodyContact) {
  const sample = createPlanCoordinateSample();
  let faces = new Map<string, ContactFace>(),
    next = new Map<string, ContactFace>();
  return (bodies: readonly ContactBody[]) => {
    for (const body of bodies) {
      body.contactForce.x = 0;
      body.contactForce.y = 0;
      body.contactForce.z = 0;
    }
    next.clear();
    for (let i = 0; i < bodies.length; i += 1) {
      const a = bodies[i]!,
        av = a.vehicle,
        am = a.model.compiledVehicle;
      for (let j = i + 1; j < bodies.length; j += 1) {
        const b = bodies[j]!,
          bv = b.vehicle,
          bm = b.model.compiledVehicle;
        const hs = (am.overallLength + bm.overallLength) / 2,
          hl = (am.overallWidth + bm.overallWidth) / 2;
        const ds = bv.course.s - av.course.s,
          dl = bv.course.l - av.course.l;
        // The key and the face read the pair in id order, so neither depends on body order.
        const ordered = a.id < b.id;
        const key = ordered ? `${a.id}\u0000${b.id}` : `${b.id}\u0000${a.id}`;
        const flip = ordered ? 1 : -1;
        let face = faces.get(key);
        if (face) {
          const along = face.sign * flip * (face.alongS ? ds : dl);
          if (hs - (face.alongS ? along : Math.abs(ds)) <= 0 || hl - (face.alongS ? Math.abs(dl) : along) <= 0)
            continue;
        } else {
          if (hs - Math.abs(ds) <= 0 || hl - Math.abs(dl) <= 0) continue;
          const first = ordered ? a : b,
            second = ordered ? b : a;
          face = entryFace(
            second.previous.s - first.previous.s,
            second.previous.l - first.previous.l,
            flip * ds,
            flip * dl,
            hs,
            hl,
          );
        }
        const aBottom = av.y - am.desiredCgHeight,
          bBottom = bv.y - bm.desiredCgHeight;
        const touching =
          Math.min(aBottom + am.overallHeight, bBottom + bm.overallHeight) - Math.max(aBottom, bBottom) > 0;
        // A contact begins only where the bodies touch; once begun, its face holds while their footprints overlap.
        if (!touching && !faces.has(key)) continue;
        next.set(key, face);
        if (!touching) continue;
        const { heading } = coordinates.toWorld(
          (av.course.s + bv.course.s) / 2,
          (av.course.l + bv.course.l) / 2,
          sample,
        );
        // The unit axis from a towards b, and the overlap along it.
        const sign = face.sign * flip;
        const overlap = face.alongS ? hs - sign * ds : hl - sign * dl;
        const nx = sign * (face.alongS ? Math.sin(heading) : Math.cos(heading));
        const nz = sign * (face.alongS ? Math.cos(heading) : -Math.sin(heading));
        const approach = (av.velocityX - bv.velocityX) * nx + (av.velocityZ - bv.velocityZ) * nz;
        const force = bodyContactForce(contact, (am.mass * bm.mass) / (am.mass + bm.mass), overlap, approach);
        a.contactForce.x -= force * nx;
        a.contactForce.z -= force * nz;
        b.contactForce.x += force * nx;
        b.contactForce.z += force * nz;
      }
    }
    [faces, next] = [next, faces];
  };
}
