/**
 * Which bodies beside a course its player's car reaches within its limits, as a conversion's report gives them
 * ([original road data](../../../docs/original-road-data.md#a-circuit-laid-out)).
 */
import type { layCourse } from './circuit-layout.js';
import { straightThrough } from './piecewise-linear.js';

/** How far a body may lie past a limit and still only touch it, metres: a micrometre, as a course writes a lateral. */
const TOUCH = 1e-6;

/** A body as a course places it: its station, lateral, image and body. */
type Placed = Parameters<typeof layCourse>[0]['objects'][number];

/**
 * Of the bodies `objects`, by their images, those the player's car reaches within its limits `limits` (a body more
 * than a micrometre inside them) and did not within the picture's edges `edge`, those it reached and no longer does,
 * how many it reaches within both, and how many just touch a limit.
 */
export function limitBodies(
  limits: {
    readonly left: readonly (readonly [number, number])[];
    readonly right: readonly (readonly [number, number])[];
  },
  objects: readonly Placed[],
  edge: number,
) {
  const [left, right] = [straightThrough(limits.left), straightThrough(limits.right)];
  // How far a body reaches past the nearer of two limits inside them, metres: positive within, about 0 touching.
  const inside = (o: Placed, l: number, r: number) =>
    Math.max(
      ...(o.body === null ? [] : typeof o.body === 'number' ? [{ across: 0, width: o.body }] : o.body).map((part) => {
        const [a, b] = [o.lateral + part.across - part.width / 2, o.lateral + part.across + part.width / 2];
        return Math.min(b, r) - Math.max(a, l);
      }),
    );
  const reached = { now: [] as string[], before: [] as string[], both: 0, touch: 0 };
  for (const o of objects) {
    if (o.body === null) continue;
    const [now, before] = [inside(o, left.at(o.s), right.at(o.s)), inside(o, -edge, edge)];
    if (Math.abs(now) <= TOUCH || Math.abs(before) <= TOUCH) reached.touch++;
    else if (now > 0 && before > 0) reached.both++;
    else if (now > 0) reached.now.push(o.image);
    else if (before > 0) reached.before.push(o.image);
  }
  const count = (names: readonly string[]) =>
    Object.fromEntries([...new Set(names)].map((n) => [n, names.filter((m) => m === n).length]));
  return {
    reached: reached.now.length,
    reachedImages: count(reached.now),
    noLonger: reached.before.length,
    noLongerImages: count(reached.before),
    still: reached.both,
    touching: reached.touch,
  };
}
