import { openProfileChainage } from '../core/open-profile-chainage.js';

export interface HeightNode {
  readonly s: number;
  readonly y: number;
}

export interface HeightSample {
  y: number;
  grade: number;
  segmentIndex: number;
  sStart: number;
  sEnd: number;
}

/** Same smooth H authority used by physics plus its analytic dH/ds. */
export interface PhysicsHeightSample {
  readonly y: number;
  readonly dYdS: number;
}

export interface HeightProfileReader {
  readonly courseLength: number;
  readonly nodes: readonly HeightNode[];
  sampleRender(s: number): HeightSample;
  samplePhysics(s: number): number;
  samplePhysicsDifferential(s: number): PhysicsHeightSample;
  sampleCamera(s: number): number;
  distanceToNextRenderNode(s: number): number;
}

const EPSILON = 1e-9;

/** General stage height source. Chainage is the open interval [0, courseLength]. */
export class HeightProfile implements HeightProfileReader {
  readonly nodes: readonly HeightNode[];

  constructor(readonly courseLength: number, nodes: readonly HeightNode[]) {
    if (!(courseLength > 0) || !Number.isFinite(courseLength)) {
      throw new RangeError('height profile length must be finite and > 0');
    }
    if (nodes.length < 2) throw new Error('height profile requires at least two nodes');

    for (const node of nodes) {
      if (!Number.isFinite(node.s) || !Number.isFinite(node.y)) {
        throw new RangeError('height node values must be finite');
      }
    }
    const copied = nodes.map((node) => ({ ...node })).sort((a, b) => a.s - b.s);
    if (Math.abs(copied[0]!.s) > EPSILON) throw new Error('height profile must start at s=0');
    if (Math.abs(copied.at(-1)!.s - courseLength) > EPSILON) {
      throw new Error('open height profile must end at courseLength');
    }

    copied[0]!.s = 0;
    copied[copied.length - 1]!.s = courseLength;
    for (let i = 0; i < copied.length; i += 1) {
      const node = copied[i]!;
      if (node.s < 0 || node.s > courseLength) throw new RangeError('height node outside open profile');
      if (i > 0 && node.s <= copied[i - 1]!.s) throw new Error('height nodes must be unique');
    }
    this.nodes = Object.freeze(copied.map((node) => Object.freeze(node)));
  }

  sampleRender(s: number): HeightSample {
    const local = openProfileChainage(s, this.courseLength, 'height profile');
    const i = this.findSegment(local);
    const a = this.nodes[i]!;
    const b = this.nodes[i + 1]!;
    const length = b.s - a.s;
    const grade = (b.y - a.y) / length;
    return {
      y: a.y + grade * (local - a.s),
      grade,
      segmentIndex: i,
      sStart: a.s,
      sEnd: b.s,
    };
  }

  samplePhysics(s: number): number {
    return this.samplePhysicsDifferential(s).y;
  }

  samplePhysicsDifferential(s: number): PhysicsHeightSample {
    const local = openProfileChainage(s, this.courseLength, 'height profile');
    const i = this.findSegment(local);
    const a = this.nodes[i]!;
    const b = this.nodes[i + 1]!;
    return smoothPhysicsSample(a, b, local);
  }

  sampleCamera(s: number): number {
    return this.samplePhysics(s);
  }

  distanceToNextRenderNode(s: number): number {
    const local = openProfileChainage(s, this.courseLength, 'height profile');
    if (local === this.courseLength) return 0;
    const i = this.findSegment(local);
    return this.nodes[i + 1]!.s - local;
  }

  private findSegment(local: number): number {
    if (local === this.courseLength) return this.nodes.length - 2;
    let low = 0;
    let high = this.nodes.length - 2;
    while (low <= high) {
      const mid = (low + high) >> 1;
      const current = this.nodes[mid]!;
      const next = this.nodes[mid + 1]!;
      if (local < current.s) high = mid - 1;
      else if (local >= next.s) low = mid + 1;
      else return mid;
    }
    throw new RangeError('height profile chainage is not covered by a segment');
  }
}

function smoothPhysicsSample(a: HeightNode, b: HeightNode, s: number): PhysicsHeightSample {
  const length = b.s - a.s;
  const t = (s - a.s) / length;
  const angle = Math.PI * t;
  const smooth = 0.5 - 0.5 * Math.cos(angle);
  const dSmoothDs = 0.5 * Math.PI * Math.sin(angle) / length;
  return {
    y: a.y + (b.y - a.y) * smooth,
    dYdS: (b.y - a.y) * dSmoothDs,
  };
}
