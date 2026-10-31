/**
 * An original's road path P laid in the world ([Original road data](../../../docs/original-road-data.md#plan-from-a-heading-table)):
 * its straights and arcs one after another from the course's entry, a station a distance along it.
 */

/** A pose: metres, heading in radians counterclockwise from +x. */
export interface Pose {
  readonly x: number;
  readonly y: number;
  readonly heading: number;
}

/** A piece of P: a straight (`turn` 0), or an arc turning `turn` radians (left positive), `length` metres. */
export interface PathPiece {
  readonly length: number;
  readonly turn: number;
}

/** An element of P: a piece from `start`, the lengths before it, metres along P. */
export interface PathElement extends PathPiece {
  readonly start: number;
}

/** P: its elements from the entry, facing +y. */
export class CoursePath {
  readonly length: number;
  readonly elements: readonly PathElement[];
  /** Each element's pose where it starts. */
  private readonly poses: readonly Pose[];
  /** P laid from `pieces` in order, straights one after another one straight. */
  constructor(pieces: readonly PathPiece[]) {
    const joined: PathPiece[] = [];
    for (const piece of pieces) {
      const last = joined.at(-1);
      if (last && last.turn === 0 && piece.turn === 0)
        joined[joined.length - 1] = { ...last, length: last.length + piece.length };
      else joined.push(piece);
    }
    let start = 0;
    this.elements = joined.map((piece) => {
      const element = { start, length: piece.length, turn: piece.turn };
      start += piece.length;
      return element;
    });
    this.length = start;
    const poses: Pose[] = [{ x: 0, y: 0, heading: Math.PI / 2 }];
    for (const e of this.elements) poses.push(advance(poses.at(-1)!, e, e.length));
    this.poses = poses;
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
