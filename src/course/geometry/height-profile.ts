import { compileOpenProfile, openProfileChainage, profileIndexAt } from './open-profile.js';
import { finite } from '../../core/validation.js';

interface HeightNode {
  readonly s: number;
  readonly y: number;
}

interface HeightSample {
  y: number;
  grade: number;
  segmentIndex: number;
  sStart: number;
  sEnd: number;
}

/** Same smooth H authority used by physics plus its analytic dH/ds. */
interface PhysicsHeightSample {
  y: number;
  dYdS: number;
}

export interface HeightProfileReader {
  readonly courseLength: number;
  readonly nodes: readonly HeightNode[];
  sampleRender(s: number, out?: HeightSample): HeightSample;
  samplePhysics(s: number): number;
  samplePhysicsDifferential(s: number, out?: PhysicsHeightSample): PhysicsHeightSample;
  sampleCamera(s: number): number;
  distanceToNextRenderNode(s: number): number;
}

/** General stage height source. Chainage is the open interval [0, courseLength]. */
export class HeightProfile implements HeightProfileReader {
  readonly #physicsScratch = { y: 0, dYdS: 0 };
  readonly nodes: readonly HeightNode[];

  constructor(
    readonly courseLength: number,
    nodes: readonly HeightNode[],
  ) {
    for (const node of nodes) finite(node.y, 'height node values');
    this.nodes = compileOpenProfile(nodes, {
      length: courseLength,
      chainage: 's',
      label: 'height profile',
      endNode: true,
    });
  }

  sampleRender(s: number, out = { y: 0, grade: 0, segmentIndex: 0, sStart: 0, sEnd: 0 }): HeightSample {
    const local = openProfileChainage(s, this.courseLength, 'height profile');
    const i = this.findSegment(local);
    const a = this.nodes[i]!;
    const b = this.nodes[i + 1]!;
    const length = b.s - a.s;
    const grade = (b.y - a.y) / length;
    out.y = a.y + grade * (local - a.s);
    out.grade = grade;
    out.segmentIndex = i;
    out.sStart = a.s;
    out.sEnd = b.s;
    return out;
  }

  samplePhysics(s: number): number {
    return this.samplePhysicsDifferential(s, this.#physicsScratch).y;
  }

  samplePhysicsDifferential(s: number, out = { y: 0, dYdS: 0 }): PhysicsHeightSample {
    const local = openProfileChainage(s, this.courseLength, 'height profile');
    const i = this.findSegment(local);
    const a = this.nodes[i]!;
    const b = this.nodes[i + 1]!;
    return smoothPhysicsSample(a, b, local, out);
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
    return Math.min(this.nodes.length - 2, profileIndexAt(this.nodes, 's', local));
  }
}

function smoothPhysicsSample(a: HeightNode, b: HeightNode, s: number, out: PhysicsHeightSample): PhysicsHeightSample {
  const length = b.s - a.s;
  const t = (s - a.s) / length;
  const angle = Math.PI * t;
  const smooth = 0.5 - 0.5 * Math.cos(angle);
  const dSmoothDs = (0.5 * Math.PI * Math.sin(angle)) / length;
  out.y = a.y + (b.y - a.y) * smooth;
  out.dYdS = (b.y - a.y) * dSmoothDs;
  return out;
}
