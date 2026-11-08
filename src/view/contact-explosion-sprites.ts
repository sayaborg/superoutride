import type { ContactExplosion, ExplosionScript } from '../content/contact-explosion-pictures.js';
import type { CompetitorObservation } from '../race/competitor-observation.js';
import { contactResponseStopped, type ContactResponseObservation } from '../race/contact-response.js';
import type { PlanCoordinateReader } from '../course/geometry/plan-coordinate.js';
import { createPlanCoordinateSample } from '../course/geometry/plan-coordinate.js';
import { basePoint, type BasePoint } from './base-point.js';
import type { CourseSprite } from './course-sprite.js';
import { debrisAt, debrisWords, type DebrisPiece } from './explosion-debris.js';

/** The explosion's frame of a stopped vehicle's response, from its contact, or null while it is not stopped. */
export function explosionFrame(script: ExplosionScript, response: ContactResponseObservation): number | null {
  return contactResponseStopped(response) ? Math.floor(response.seconds * script.framesASecond) : null;
}

/** Whether a vehicle is drawn: while it is not stopped, or on the frames its explosion's script draws it standing. */
export function explosionShowsVehicle(script: ExplosionScript, response: ContactResponseObservation): boolean {
  const frame = explosionFrame(script, response);
  return frame === null || script.frames[frame] === 'vehicle';
}

/**
 * Each stopped vehicle's explosion as its script draws it ([Authored contact
 * response](../../docs/content-and-gameplay.md#authored-contact-response)): on its fireball's frames the fireball at
 * the vehicle's common base point, and its debris from the frames it is thrown to the frame it is cleared, each piece's
 * picture at its place from that point (right, forward by the vehicle's heading, and up), its route station the
 * vehicle's and its distance forward. They enter the scene's ordinary depth ordering; none casts a shadow.
 */
export function createContactExplosionSprites({ script, pictures }: ContactExplosion) {
  const picture = (name: string) => {
    const asset = pictures.get(name);
    if (!asset) throw new Error(`The explosion has no picture ${name}`);
    return asset;
  };
  const debrisPictures = script.debris.pictures.map(picture);
  const { metres } = script.debris;
  const sprites: CourseSprite[] = [];
  const pieces: DebrisPiece[] = [];
  const base: BasePoint = { x: 0, y: 0, z: 0, s: 0 },
    sample = createPlanCoordinateSample();
  // Each explosion's words, by vehicle and drawn again only for a new explosion.
  const words = new Map<string, { seed: number; words: Uint16Array }>();
  return (actors: readonly CompetitorObservation[], coordinates: PlanCoordinateReader): readonly CourseSprite[] => {
    sprites.length = 0;
    for (const actor of actors) {
      const frame = explosionFrame(script, actor.contactResponse);
      if (frame === null) continue;
      basePoint(coordinates, actor, base, sample);
      const drawing = script.frames[frame] ?? null;
      if (drawing !== null && drawing !== 'vehicle')
        sprites.push({
          name: `explosion-${actor.id}`,
          x: base.x,
          y: base.y,
          z: base.z,
          sRender: base.s,
          shadow: null,
          asset: picture(drawing),
        });
      const { seed } = actor.contactResponse;
      let thrown = words.get(actor.id);
      if (!thrown || thrown.seed !== seed) words.set(actor.id, (thrown = { seed, words: debrisWords(seed) }));
      const count = debrisAt(script, thrown.words, frame, pieces);
      const [forwardX, forwardZ] = [Math.sin(actor.yaw), Math.cos(actor.yaw)];
      for (let k = 0; k < count; k++) {
        const { piece, across, along, up } = pieces[k]!;
        const [right, forward] = [across * metres.across, along * metres.along];
        sprites.push({
          name: `debris-${actor.id}-${piece}`,
          x: base.x + forward * forwardX + right * forwardZ,
          y: base.y + up * metres.up,
          z: base.z + forward * forwardZ - right * forwardX,
          sRender: base.s + forward,
          shadow: null,
          asset: debrisPictures[piece]!,
        });
      }
    }
    return sprites;
  };
}
