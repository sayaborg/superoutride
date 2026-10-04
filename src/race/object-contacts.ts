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

/**
 * A roadside object's identity: its Section and its index among the Section's objects. Every occurrence of a Section
 * holds the same objects, so a Section met again meets, and shows knocked, the same ones.
 */
const objectKey = (section: CompiledSection, index: number) => `object ${section.id} ${index}`;

/** A standing object of a Route occurrence as a contact party: zero length, its width and height range, at rest. */
function writeObjectParty(party: ContactParty, occurrence: RouteOccurrence, index: number): ContactParty {
  const object = occurrence.section.objects[index]!;
  party.key = objectKey(occurrence.section, index);
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
 * lands and stays. Lines and limits do not act on it. An object is identified by its Section and index (`objectKey`), so a
 * Section met again keeps its objects knocked. Each step a vehicle meets every standing object whose station lies within
 * its length, across occurrences (`sight`); the contact faces hold which pairs are in contact.
 */
export function createRoadsideObjects(options: {
  readonly route: Pick<RouteView, 'at' | 'occurrences'>;
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
  // The ids of the bodies a fixed object pushes this step.
  const pressed = new Set<string>();
  const observations: KnockedObject[] = [];
  /** Whether the object at `index` of an occurrence still stands. */
  const standing = (occurrence: RouteOccurrence, index: number) => !knocked.has(objectKey(occurrence.section, index));
  /*
   * Visit the standing objects of the resident occurrences whose route stations lie from `start` through `end`, in
   * occurrence and station order, each read from its Section's station-ordered list, never by scanning.
   */
  const visitStanding = (
    start: number,
    end: number,
    visit: (occurrence: RouteOccurrence, index: number, s: number, l: number, width: number) => void,
  ) => {
    for (const occurrence of route.occurrences) {
      if (occurrence.end < start || occurrence.start > end) continue;
      const objects = occurrence.section.objects;
      for (let i = firstObjectFrom(objects, start - occurrence.start); i < objects.length; i++) {
        const object = objects[i]!;
        if (occurrence.start + object.s > end) break;
        if (standing(occurrence, i))
          visit(occurrence, i, occurrence.start + object.s, object.l - occurrence.lateralOrigin, object.width);
      }
    }
  };
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
    knocked.set(objectKey(occurrence.section, index), record);
    observations.push(record);
  };
  const meet = (body: ContactBody, occurrence: RouteOccurrence, index: number) => {
    writeObjectParty(object, occurrence, index);
    if (!faces.push(vehicle, object, force)) return;
    body.contactForce.x -= force.x;
    body.contactForce.z -= force.z;
    const movable = occurrence.section.objects[index]!.movable;
    if (!movable && (force.x !== 0 || force.z !== 0)) pressed.add(body.id);
    if (movable && (force.x !== 0 || force.z !== 0)) knock(occurrence, index, movable.mass, movable.launchRadians);
  };
  return Object.freeze({
    /**
     * Visit the standing objects of the resident occurrences whose route stations lie from `start` through `end`, in
     * occurrence and station order, with each one's route station, lateral and width: the one search for standing
     * objects that drivers' sightings, placement and contacts all use.
     */
    sight(start: number, end: number, visit: (s: number, l: number, width: number) => void) {
      visitStanding(start, end, (_occurrence, _index, s, l, width) => visit(s, l, width));
    },
    /** The knocked objects, in the order they were knocked. */
    knocked: observations as readonly KnockedObjectObservation[],
    /** Whether the object at `index` of an occurrence still stands (fixed objects always do). */
    standing,
    /** Whether a fixed object (a solid sprite or a wall's free end) pushes the body with id `id` this step. */
    blocks: (id: string) => pressed.has(id),
    /** The standing objects' contacts for one step, from the state at its start, added to each body's contact force. */
    contacts(bodies: readonly ContactBody[]) {
      pressed.clear();
      for (const body of bodies) {
        writeVehicleParty(vehicle, body);
        const s = body.vehicle.course.s;
        visitStanding(s - vehicle.length / 2, s + vehicle.length / 2, (occurrence, index) =>
          meet(body, occurrence, index),
        );
      }
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
