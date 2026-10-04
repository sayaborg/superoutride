import { routeS, type RouteOccurrence, type RouteView } from '../course/course-route.js';
import type { CourseFixedObject } from '../course/course-objects.js';
import {
  createContactParty,
  writeVehicleParty,
  type ContactBody,
  type ContactParty,
  type createContactFaces,
} from './body-contacts.js';

/** The index of the first object at or after station `s` in a station-ordered list. */
export function firstObjectFrom(objects: readonly CourseFixedObject[], s: number): number {
  let low = 0,
    high = objects.length;
  while (low < high) {
    const mid = (low + high) >>> 1;
    if (objects[mid]!.s < s) low = mid + 1;
    else high = mid;
  }
  return low;
}

/** A fixed object of a Route occurrence as a contact party: zero length, its width, its height range, not moving. */
function writeObjectParty(party: ContactParty, occurrence: RouteOccurrence, index: number): ContactParty {
  const object = occurrence.section.objects[index]!;
  party.key = `object ${occurrence.ordinal} ${index}`;
  party.s = party.previousS = routeS(occurrence, object.s);
  party.l = party.previousL = object.l - occurrence.lateralOrigin;
  party.length = 0;
  party.width = object.width;
  party.bottom = object.bottom;
  party.top = object.top;
  party.mass = Infinity;
  party.velocityX = party.velocityZ = 0;
  return party;
}

/**
 * The race's fixed-object contacts for one fixed step, from the state at the step's start, added to each body's contact
 * force. A fixed object meets a vehicle as another vehicle would (`createContactFaces`), as a party of zero length and its
 * width that never moves, so only the vehicle receives the force, on its own mass. A contact is first met where the
 * object lies within the vehicle's length in the occurrence at the vehicle's centre; once begun it is followed wherever
 * the object is until the pair separates, in the order the contacts began.
 */
export function createObjectContacts(route: Pick<RouteView, 'at'>, faces: ReturnType<typeof createContactFaces>) {
  const vehicle = createContactParty(),
    object = createContactParty(),
    force = { x: 0, z: 0 };
  // The pairs in contact at the end of the previous step, by key: the body's id and the object's occurrence and index.
  let held = new Map<string, { readonly id: string; readonly occurrence: RouteOccurrence; readonly index: number }>(),
    next = new Map<string, { readonly id: string; readonly occurrence: RouteOccurrence; readonly index: number }>();
  const meet = (body: ContactBody, occurrence: RouteOccurrence, index: number) => {
    writeObjectParty(object, occurrence, index);
    if (!faces.push(vehicle, object, force)) return;
    next.set(`${body.id}\u0000${object.key}`, { id: body.id, occurrence, index });
    body.contactForce.x -= force.x;
    body.contactForce.z -= force.z;
  };
  return (bodies: readonly ContactBody[]) => {
    next.clear();
    for (const [, pair] of held) {
      const body = bodies.find((candidate) => candidate.id === pair.id);
      if (!body || route.at(pair.occurrence.start) !== pair.occurrence) continue;
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
        if (faces.held(body.id, `object ${occurrence.ordinal} ${i}`)) continue;
        meet(body, occurrence, i);
      }
    }
    [held, next] = [next, held];
  };
}
