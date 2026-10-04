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
 * One side of a contact as contacts read it, on the Route: its stable key, its route position now and at the start of
 * the previous step, its footprint (overall length and width), its height range, its mass (infinite for a body that does
 * not move) and its world velocity.
 */
export interface ContactParty {
  key: string;
  s: number;
  l: number;
  previousS: number;
  previousL: number;
  length: number;
  width: number;
  bottom: number;
  top: number;
  mass: number;
  velocityX: number;
  velocityZ: number;
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
 * along that axis one step earlier. A contact that begins with both axes already overlapping — two footprints that
 * overlapped while their heights did not, when their heights come to overlap — takes the shallower overlap of this step,
 * signed by the current side.
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
 * The race's contact faces, one rule for every pair that pushes apart: two vehicles, a vehicle and an object. A contact
 * begins when the two footprints and height ranges overlap. Its face, the axis and the side each is pushed to, is decided
 * once as it begins (`entryFace`) and kept until the footprints separate: until the overlap along the face, the half sum
 * less the signed relative position, or the other axis's overlap is no longer positive. While the height ranges overlap
 * it pushes along that axis, the road's horizontal tangent or right read at the pair's midpoint, with the spring-damper on
 * the pair's reduced mass (a party that does not move contributes the other's mass). A pair is keyed by its two keys in
 * order, so neither key nor face depends on which party is `a`; a pair not met in a step is forgotten.
 */
export function createContactFaces(coordinates: PlanCoordinateReader, contact: CompiledBodyContact) {
  const sample = createPlanCoordinateSample();
  // Faces by the pair's lesser key, then its greater one: a lookup allocates nothing.
  type Faces = Map<string, Map<string, ContactFace>>;
  let faces: Faces = new Map(),
    next: Faces = new Map();
  const faceOf = (low: string, high: string) => faces.get(low)?.get(high);
  return Object.freeze({
    /** Start a step: only the pairs met in the previous step keep their faces. */
    beginStep() {
      [faces, next] = [next, faces];
      next.clear();
    },
    /**
     * Meet `a` and `b` this step: true while they are in contact, with the force on `b` (world x and z, N) written to
     * `out` (zero while their heights do not overlap); `a` receives the opposite force.
     */
    push(a: ContactParty, b: ContactParty, out: { x: number; z: number }): boolean {
      const hs = (a.length + b.length) / 2,
        hl = (a.width + b.width) / 2;
      const ds = b.s - a.s,
        dl = b.l - a.l;
      const ordered = a.key < b.key;
      const low = ordered ? a.key : b.key,
        high = ordered ? b.key : a.key;
      const flip = ordered ? 1 : -1;
      let face = faceOf(low, high);
      const begun = face !== undefined;
      if (face) {
        const along = face.sign * flip * (face.alongS ? ds : dl);
        if (hs - (face.alongS ? along : Math.abs(ds)) <= 0 || hl - (face.alongS ? Math.abs(dl) : along) <= 0)
          return false;
      } else {
        if (hs - Math.abs(ds) <= 0 || hl - Math.abs(dl) <= 0) return false;
        face = entryFace(
          flip * (b.previousS - a.previousS),
          flip * (b.previousL - a.previousL),
          flip * ds,
          flip * dl,
          hs,
          hl,
        );
      }
      const touching = Math.min(a.top, b.top) - Math.max(a.bottom, b.bottom) > 0;
      // A contact begins only where the parties touch; once begun, its face holds while their footprints overlap.
      if (!touching && !begun) return false;
      let met = next.get(low);
      if (!met) next.set(low, (met = new Map()));
      met.set(high, face);
      out.x = 0;
      out.z = 0;
      if (!touching) return true;
      const { heading } = coordinates.toWorld((a.s + b.s) / 2, (a.l + b.l) / 2, sample);
      // The unit axis from a towards b, and the overlap along it.
      const sign = face.sign * flip;
      const overlap = face.alongS ? hs - sign * ds : hl - sign * dl;
      const nx = sign * (face.alongS ? Math.sin(heading) : Math.cos(heading));
      const nz = sign * (face.alongS ? Math.cos(heading) : -Math.sin(heading));
      const approach = (a.velocityX - b.velocityX) * nx + (a.velocityZ - b.velocityZ) * nz;
      const reduced = !Number.isFinite(b.mass)
        ? a.mass
        : !Number.isFinite(a.mass)
          ? b.mass
          : (a.mass * b.mass) / (a.mass + b.mass);
      const force = bodyContactForce(contact, reduced, overlap, approach);
      out.x = force * nx;
      out.z = force * nz;
      return true;
    },
  });
}

/** A vehicle as a contact party: its id, route position now and one step earlier, footprint, height range, mass and velocity. */
export function writeVehicleParty(party: ContactParty, body: ContactBody): ContactParty {
  const { vehicle } = body,
    { overallLength, overallWidth, overallHeight, desiredCgHeight, mass } = body.model.compiledVehicle;
  party.key = body.id;
  party.s = vehicle.course.s;
  party.l = vehicle.course.l;
  party.previousS = body.previous.s;
  party.previousL = body.previous.l;
  party.length = overallLength;
  party.width = overallWidth;
  party.bottom = vehicle.y - desiredCgHeight;
  party.top = party.bottom + overallHeight;
  party.mass = mass;
  party.velocityX = vehicle.velocityX;
  party.velocityZ = vehicle.velocityZ;
  return party;
}

/** An empty contact party, to be written before each use. */
export function createContactParty(): ContactParty {
  return {
    key: '',
    s: 0,
    l: 0,
    previousS: 0,
    previousL: 0,
    length: 0,
    width: 0,
    bottom: 0,
    top: 0,
    mass: 0,
    velocityX: 0,
    velocityZ: 0,
  };
}

/**
 * The race's body contacts between the present vehicles for one fixed step, from the state at the step's start (a
 * vehicle's height range runs from its bottom, its centre-of-mass height less `desiredCgHeight`, up `overallHeight`).
 * It resets every body's contact force, then adds each pair's equal and opposite push (`createContactFaces`), summed over
 * its pairs in body order.
 */
export function createBodyContacts(faces: ReturnType<typeof createContactFaces>) {
  const parties: ContactParty[] = [];
  const force = { x: 0, z: 0 };
  return (bodies: readonly ContactBody[]) => {
    while (parties.length < bodies.length) parties.push(createContactParty());
    for (let i = 0; i < bodies.length; i += 1) {
      const body = bodies[i]!;
      body.contactForce.x = 0;
      body.contactForce.y = 0;
      body.contactForce.z = 0;
      writeVehicleParty(parties[i]!, body);
    }
    for (let i = 0; i < bodies.length; i += 1)
      for (let j = i + 1; j < bodies.length; j += 1) {
        if (!faces.push(parties[i]!, parties[j]!, force)) continue;
        const a = bodies[i]!.contactForce,
          b = bodies[j]!.contactForce;
        a.x -= force.x;
        a.z -= force.z;
        b.x += force.x;
        b.z += force.z;
      }
  };
}
