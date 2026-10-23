/**
 * An original's road path P laid in the world ([Original road data](../../docs/original-road-data.md#super-hang-on)):
 * its straights and arcs one after another from the course's entry, the plane the centre lane runs on (P laid off a
 * fixed distance to its left, so again straights and arcs), and each road position's station on the plane.
 */

/** A pose: metres, heading in radians counterclockwise from +x. */
export interface Pose {
  readonly x: number;
  readonly y: number;
  readonly heading: number;
}

/** An element of P from `start` (metres along P): a straight, or an arc turning `turn` radians (left positive). */
export interface PathElement {
  readonly start: number;
  readonly length: number;
  readonly turn: number;
}

/**
 * P and its plane: P's elements from the entry, facing +y; the plane `offset` metres left of P, where an arc turning
 * left (its inside) is shorter and one turning right longer by the offset times the turn.
 */
export class CoursePath {
  readonly length: number;
  /** Each element's station on the plane where it starts, and the plane's length. */
  private readonly stations: readonly number[];
  readonly planeLength: number;
  private readonly poses: readonly Pose[];
  constructor(
    readonly elements: readonly PathElement[],
    readonly offset: number,
  ) {
    const last = elements.at(-1)!;
    this.length = last.start + last.length;
    const stations = [0];
    const poses: Pose[] = [{ x: 0, y: 0, heading: Math.PI / 2 }];
    for (const e of elements) {
      stations.push(stations.at(-1)! + this.planeScale(e) * e.length);
      poses.push(advance(poses.at(-1)!, e, e.length));
    }
    this.stations = stations;
    this.planeLength = stations.at(-1)!;
    this.poses = poses;
  }

  /** How much longer the plane is than P along `e`. */
  planeScale(e: PathElement): number {
    return 1 - (this.offset * e.turn) / e.length;
  }

  /** The element holding `u` metres along P (the later at a joint), and its index. */
  private at(u: number): { e: PathElement; k: number } {
    let [lo, hi] = [0, this.elements.length - 1];
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (this.elements[mid]!.start <= u) lo = mid;
      else hi = mid - 1;
    }
    return { e: this.elements[lo]!, k: lo };
  }

  /** The station on the plane across from `u` metres along P. */
  station(u: number): number {
    const { e, k } = this.at(u);
    return this.stations[k]! + this.planeScale(e) * (u - e.start);
  }

  /** The metres along P across from station `s`. */
  along(s: number): number {
    let [lo, hi] = [0, this.elements.length - 1];
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (this.stations[mid]! <= s) lo = mid;
      else hi = mid - 1;
    }
    const e = this.elements[lo]!;
    return e.start + (s - this.stations[lo]!) / this.planeScale(e);
  }

  /** P's pose `u` metres along it. */
  pose(u: number): Pose {
    const { e, k } = this.at(u);
    return advance(this.poses[k]!, e, u - e.start);
  }

  /** The point `lateral` metres right of P `u` metres along it. */
  aside(u: number, lateral: number): Pose {
    const p = this.pose(u);
    return { x: p.x + lateral * Math.sin(p.heading), y: p.y - lateral * Math.cos(p.heading), heading: p.heading };
  }
}

/** The pose `d` metres along `e` from `pose`. */
function advance(pose: Pose, e: PathElement, d: number): Pose {
  if (e.turn === 0)
    return { x: pose.x + d * Math.cos(pose.heading), y: pose.y + d * Math.sin(pose.heading), heading: pose.heading };
  const k = e.turn / e.length;
  return {
    x: pose.x + (Math.sin(pose.heading + k * d) - Math.sin(pose.heading)) / k,
    y: pose.y + (Math.cos(pose.heading) - Math.cos(pose.heading + k * d)) / k,
    heading: pose.heading + k * d,
  };
}
