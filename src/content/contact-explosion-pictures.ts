import { admit, readArray, readNumber, readRecord, readString, requireAdmission } from '../core/admission.js';
import { readSpriteLodAsset, type SpriteLodAsset } from '../image/sprite.js';
import type { ContentDelivery } from './content-delivery.js';
import { requireLoaded } from './content-load-error.js';

/**
 * The explosion every vehicle whose contact response explodes plays: POLE POSITION II's player's car's, its script as
 * the road data tool writes it ([Authored contact response](../../docs/content-and-gameplay.md#authored-contact-response)).
 */
export const CONTACT_EXPLOSION_SCRIPT = 'polepos2-explosion';

/** A frame's drawing: the vehicle as it stands, a fireball picture by name, or nothing. */
export type ExplosionDrawing = 'vehicle' | string | null;

/**
 * The debris' rule in the original's integers, 16-bit words: a thrown piece's speed is its random word shifted right
 * `speed`, its place the speed shifted right `place` (z `upPlace`), z's speed `lift` more; each frame a step is the
 * speed shifted right `step`, the speed loses the step shifted right `drag`, z's `gravity` more, a fallen piece is made
 * to bounce, the speed of the `damped` pieces shifted right `bounce`; a place shifted right `unit` is a unit.
 */
export interface DebrisRule {
  readonly speed: number;
  readonly place: number;
  readonly upPlace: number;
  readonly lift: number;
  readonly step: number;
  readonly drag: number;
  readonly gravity: number;
  readonly bounce: number;
  readonly damped: readonly number[];
  readonly unit: number;
}

/**
 * An explosion's script: each frame's drawing from the contact's (frame 0), the frames a second, the frame the vehicle
 * is back at, and its debris: the frames each two pieces are thrown at (pieces k and k + 4 at the kth), the frame they
 * are cleared at, each piece's picture, a unit's metres across, along and up, and its rule.
 */
export interface ExplosionScript {
  readonly framesASecond: number;
  readonly frames: readonly ExplosionDrawing[];
  readonly recovers: number;
  readonly debris: {
    readonly thrown: readonly number[];
    readonly cleared: number;
    readonly pictures: readonly string[];
    readonly metres: { readonly across: number; readonly along: number; readonly up: number };
    readonly rule: DebrisRule;
  };
}

/** The debris' pieces, thrown two at a time, and the words each piece is thrown from. */
export const DEBRIS_PIECES = 8;
export const DEBRIS_WORDS = 3;

const shiftCount = (value: unknown, path: string) => readNumber(value, path, { min: 0, max: 15, integer: true });
const word = (value: unknown, path: string) => readNumber(value, path, { min: 0, max: 0xffff, integer: true });

/** Admit an explosion's script (parsed): its frames and timing, its debris' throws, pictures, units and rule. */
export function readExplosionScript(value: unknown): ExplosionScript {
  const root = readRecord(value, '', ['about', 'framesASecond', 'frames', 'recovers', 'debris']);
  readString(root.about, '/about');
  const framesASecond = readNumber(root.framesASecond, '/framesASecond', { min: 0, exclusiveMin: true });
  const frames = readArray(root.frames, '/frames', (frame, at) => (frame === null ? null : readString(frame, at)), {
    min: 1,
  });
  const recovers = readNumber(root.recovers, '/recovers', { integer: true });
  requireAdmission(
    recovers === frames.length,
    'invalid_value',
    '/recovers',
    'The vehicle is back after the last frame',
  );
  const debris = readRecord(root.debris, '/debris', ['thrown', 'cleared', 'pictures', 'metres', 'rule']);
  const cleared = readNumber(debris.cleared, '/debris/cleared', { min: 0, max: recovers, integer: true });
  const thrown = readArray(
    debris.thrown,
    '/debris/thrown',
    (frame, at) => readNumber(frame, at, { min: 0, max: cleared, integer: true }),
    { length: DEBRIS_PIECES / 2 },
  );
  requireAdmission(
    thrown.every((frame, k) => k === 0 || frame > thrown[k - 1]!),
    'invalid_value',
    '/debris/thrown',
    'The debris is thrown in order',
  );
  const pictures = readArray(debris.pictures, '/debris/pictures', (name, at) => readString(name, at), {
    length: DEBRIS_PIECES,
  });
  const metres = readRecord(debris.metres, '/debris/metres', ['across', 'along', 'up']);
  const unit = (axis: string) => readNumber(metres[axis], `/debris/metres/${axis}`, { min: 0, exclusiveMin: true });
  const rule = readRecord(debris.rule, '/debris/rule', [
    'speed',
    'place',
    'upPlace',
    'lift',
    'step',
    'drag',
    'gravity',
    'bounce',
    'damped',
    'unit',
  ]);
  return Object.freeze({
    framesASecond,
    frames,
    recovers,
    debris: Object.freeze({
      thrown,
      cleared,
      pictures,
      metres: Object.freeze({ across: unit('across'), along: unit('along'), up: unit('up') }),
      rule: Object.freeze({
        speed: shiftCount(rule.speed, '/debris/rule/speed'),
        place: shiftCount(rule.place, '/debris/rule/place'),
        upPlace: shiftCount(rule.upPlace, '/debris/rule/upPlace'),
        lift: word(rule.lift, '/debris/rule/lift'),
        step: shiftCount(rule.step, '/debris/rule/step'),
        drag: shiftCount(rule.drag, '/debris/rule/drag'),
        gravity: word(rule.gravity, '/debris/rule/gravity'),
        bounce: shiftCount(rule.bounce, '/debris/rule/bounce'),
        damped: readArray(rule.damped, '/debris/rule/damped', (piece, at) =>
          readNumber(piece, at, { min: 0, max: DEBRIS_PIECES - 1, integer: true }),
        ),
        unit: shiftCount(rule.unit, '/debris/rule/unit'),
      }),
    }),
  });
}

/** The pictures an explosion's script names: its fireball's, in its frames, and its debris'. */
export const explosionPictureNames = (script: ExplosionScript): readonly string[] => [
  ...new Set([
    ...script.frames.filter((frame): frame is string => frame !== null && frame !== 'vehicle'),
    ...script.debris.pictures,
  ]),
];

/** An explosion as delivered: its script and its pictures by name. */
export interface ContactExplosion {
  readonly script: ExplosionScript;
  readonly pictures: ReadonlyMap<string, SpriteLodAsset>;
}

/** The contact explosion's script and pictures, each admitted as delivered. */
export async function loadContactExplosion(content: ContentDelivery): Promise<ContactExplosion> {
  const value = await content.json('explosion', CONTACT_EXPLOSION_SCRIPT);
  const script = requireLoaded(admit(`explosions/${CONTACT_EXPLOSION_SCRIPT}.json`, () => readExplosionScript(value)));
  const pictures = await Promise.all(
    explosionPictureNames(script).map(async (name) => {
      const picture = await content.json('image', name);
      return [name, requireLoaded(admit(`images/${name}.json`, () => readSpriteLodAsset(picture)))] as const;
    }),
  );
  return Object.freeze({ script, pictures: new Map(pictures) });
}
