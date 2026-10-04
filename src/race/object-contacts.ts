import { routeS, type RouteOccurrence, type RouteView } from '../course/course-route.js';
import type { CompiledSection } from '../course/compiler/course-graph.js';
import type { CourseObject } from '../course/course-objects.js';
import type { ProfileReader } from '../course/geometry/profile.js';
import { createPlanCoordinateSample, type PlanCoordinateReader } from '../course/geometry/plan-coordinate.js';
import { VEHICLE_GRAVITY } from '../vehicle/physics/vehicle-state.js';
import {
  createContactParty,
  writeVehicleParty,
  type ContactBody,
  type ContactParty,
  type createContactFaces,
} from './body-contacts.js';

/** The index of the first object at or after station `s` in a station-ordered list. */
export function firstObjectFrom(objects: readonly CourseObject[], s: number): number {
  let low = 0,
    high = objects.length;
  while (low < high) {
    const mid = (low + high) >>> 1;
    if (objects[mid]!.s < s) low = mid + 1;
    else high = mid;
  }
  return low;
}

/**
 * A knocked movable object as the race publishes it: its Section and placement index (`sprite`), whether it is flying
 * or has landed, and where. While it flies, `s` and `l` are its route position and `y` its height; once landed, `at`
 * holds its place in the Section it landed in (Section station and lateral), where it lies for the rest of the Session.
 */
export interface KnockedObjectObservation {
  readonly section: CompiledSection;
  readonly sprite: number;
  readonly state: 'airborne' | 'landed';
  readonly s: number;
  readonly l: number;
  readonly y: number;
  readonly at: { readonly section: CompiledSection; readonly s: number; readonly l: number } | null;
}

interface KnockedObject {
  section: CompiledSection;
  sprite: number;
  state: 'airborne' | 'landed';
  occurrence: RouteOccurrence;
  s: number;
  l: number;
  y: number;
  /** Along-road, lateral (route) and vertical speeds, m/s; the horizontal ones hold through the flight. */
  speedS: number;
  speedL: number;
  speedY: number;
  at: { section: CompiledSection; s: number; l: number } | null;
}

/** A standing object of a Route occurrence as a contact party: zero length, its width and height range, at rest. */
function writeObjectParty(party: ContactParty, occurrence: RouteOccurrence, index: number): ContactParty {
  const object = occurrence.section.objects[index]!;
  party.key = `object ${occurrence.ordinal} ${index}`;
  party.s = party.previousS = routeS(occurrence, object.s);
  party.l = party.previousL = object.l - occurrence.lateralOrigin;
  party.length = 0;
  party.width = object.width;
  party.bottom = object.bottom;
  party.top = object.top;
  party.mass = object.movable?.mass ?? Infinity;
  party.velocityX = party.velocityZ = 0;
  return party;
}

/**
 * The race's roadside objects for fixed steps of `step` seconds. A standing object meets a vehicle as another vehicle
 * would (`createContactFaces`), as a party of zero length and its width, at rest. A fixed object never moves, so only the
 * vehicle receives the force, on its own mass. A movable object takes the reduced mass of the two; in the step it is
 * pushed it is knocked: it receives the opposite horizontal force and an upward force of that force times
 * `tan(launch)`, as the velocity change of one step, and contacts end. Knocked, it flies as a point under gravity alone
 * with constant horizontal speed, on route coordinates, until its height reaches the road height at its station, where it
 * lands and stays. Lines and limits do not act on it. Knocked objects are keyed by Section and placement index, so a
 * Section met again keeps them knocked. A contact is first met where the object lies within the vehicle's length in the
 * occurrence at the vehicle's centre; once begun it is followed until the pair separates, in the order contacts began.
 */
export function createRoadsideObjects(options: {
  readonly route: Pick<RouteView, 'at'>;
  readonly coordinates: PlanCoordinateReader;
  readonly height: ProfileReader;
  readonly extent: { readonly start: number; readonly end: number };
  readonly faces: ReturnType<typeof createContactFaces>;
  readonly step: number;
}) {
  const { route, coordinates, height, extent, faces, step } = options;
  const vehicle = createContactParty(),
    object = createContactParty(),
    force = { x: 0, z: 0 },
    sample = createPlanCoordinateSample();
  const knocked = new Map<string, KnockedObject>();
  const observations: KnockedObject[] = [];
  const keyOf = (section: CompiledSection, sprite: number) => `${section.id} ${sprite}`;
  /** Whether the object at `index` of an occurrence still stands. */
  const standing = (occurrence: RouteOccurrence, index: number) => {
    const sprite = occurrence.section.objects[index]!.sprite;
    return sprite === null || !knocked.has(keyOf(occurrence.section, sprite));
  };
  // The pairs in contact at the end of the previous step, by key: the body's id and the object's occurrence and index.
  type Pair = { readonly id: string; readonly occurrence: RouteOccurrence; readonly index: number };
  let held = new Map<string, Pair>(),
    next = new Map<string, Pair>();
  const knock = (occurrence: RouteOccurrence, index: number, mass: number, launchRadians: number) => {
    const source = occurrence.section.objects[index]!;
    // The object's share of the step's push, as its velocity change: horizontal along the push, upward by the elevation.
    const push = Math.hypot(force.x, force.z);
    const { heading } = coordinates.toWorld(object.s, object.l, sample);
    const record: KnockedObject = {
      section: occurrence.section,
      sprite: source.sprite!,
      state: 'airborne',
      occurrence,
      s: object.s,
      l: object.l,
      y: source.bottom,
      speedS: ((force.x * Math.sin(heading) + force.z * Math.cos(heading)) * step) / mass,
      speedL: ((force.x * Math.cos(heading) - force.z * Math.sin(heading)) * step) / mass,
      speedY: (push * Math.tan(launchRadians) * step) / mass,
      at: null,
    };
    knocked.set(keyOf(occurrence.section, record.sprite), record);
    observations.push(record);
  };
  const meet = (body: ContactBody, occurrence: RouteOccurrence, index: number) => {
    writeObjectParty(object, occurrence, index);
    if (!faces.push(vehicle, object, force)) return;
    body.contactForce.x -= force.x;
    body.contactForce.z -= force.z;
    const movable = occurrence.section.objects[index]!.movable;
    if (movable && (force.x !== 0 || force.z !== 0)) knock(occurrence, index, movable.mass, movable.launchRadians);
    else next.set(`${body.id}\u0000${object.key}`, { id: body.id, occurrence, index });
  };
  return Object.freeze({
    /** The knocked objects, in the order they were knocked. */
    knocked: observations as readonly KnockedObjectObservation[],
    /** Whether the object at `index` of an occurrence still stands (fixed objects always do). */
    standing,
    /** The standing objects' contacts for one step, from the state at its start, added to each body's contact force. */
    contacts(bodies: readonly ContactBody[]) {
      next.clear();
      for (const [, pair] of held) {
        const body = bodies.find((candidate) => candidate.id === pair.id);
        if (!body || route.at(pair.occurrence.start) !== pair.occurrence || !standing(pair.occurrence, pair.index))
          continue;
        writeVehicleParty(vehicle, body);
        meet(body, pair.occurrence, pair.index);
      }
      for (const body of bodies) {
        const occurrence = route.at(body.vehicle.course.s);
        if (!occurrence) continue;
        const objects = occurrence.section.objects;
        if (!objects.length) continue;
        writeVehicleParty(vehicle, body);
        const s = body.vehicle.course.s - occurrence.start;
        for (let i = firstObjectFrom(objects, s - vehicle.length / 2); i < objects.length; i++) {
          if (objects[i]!.s > s + vehicle.length / 2) break;
          if (!standing(occurrence, i) || faces.held(body.id, `object ${occurrence.ordinal} ${i}`)) continue;
          meet(body, occurrence, i);
        }
      }
      [held, next] = [next, held];
    },
    /** One step of every flying object: gravity on its height, its horizontal speeds on its route position, landing. */
    advance() {
      for (const record of observations) {
        if (record.state !== 'airborne') continue;
        record.speedY -= VEHICLE_GRAVITY * step;
        record.s += record.speedS * step;
        record.l += record.speedL * step;
        record.y += record.speedY * step;
        const ground = height.sample(Math.min(extent.end, Math.max(extent.start, record.s)));
        if (record.y > ground) continue;
        record.y = ground;
        record.state = 'landed';
        const landing = route.at(record.s) ?? record.occurrence;
        record.at = {
          section: landing.section,
          s: record.s - landing.start,
          l: record.l + landing.lateralOrigin,
        };
      }
    },
  });
}
