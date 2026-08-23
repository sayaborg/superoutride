import { wrapPositive } from '../core/math.js';

export interface HeightNode {
  s: number;
  y: number;
}

export interface HeightSample {
  y: number;
  grade: number;
  segmentIndex: number;
  sStart: number;
  sEnd: number;
}

export class CyclicHeightProfile {
  readonly nodes: readonly HeightNode[];

  constructor(readonly courseLength: number, nodes: readonly HeightNode[]) {
    if (!(courseLength > 0)) throw new RangeError('course length must be > 0');
    if (nodes.length < 2) throw new Error('height profile requires at least two nodes');
    const copied = nodes.map((node) => ({ ...node })).sort((a, b) => a.s - b.s);
    if (Math.abs(copied[0]!.s) > 1e-9) throw new Error('height profile must start at s=0');
    for (let i = 0; i < copied.length; i += 1) {
      const n = copied[i]!;
      if (n.s < 0 || n.s >= courseLength) throw new RangeError('height node outside course');
      if (i > 0 && n.s <= copied[i - 1]!.s) throw new Error('height nodes must be unique');
    }
    this.nodes = copied;
  }

  sampleRender(s: number): HeightSample {
    const local = wrapPositive(s, this.courseLength);
    const i = this.findSegment(local);
    const a = this.nodes[i]!;
    const b = this.nodes[(i + 1) % this.nodes.length]!;
    const sEnd = i === this.nodes.length - 1 ? this.courseLength : b.s;
    const yEnd = b.y;
    const length = sEnd - a.s;
    const grade = (yEnd - a.y) / length;
    return {
      y: a.y + grade * (local - a.s),
      grade,
      segmentIndex: i,
      sStart: a.s,
      sEnd,
    };
  }

  // C1 DEV physics guide. It is a separate semantic channel from Y_render / Y_camera
  // even though M5 deliberately uses the same cosine interpolation for both.
  samplePhysics(s: number): number {
    return this.sampleSmooth(s);
  }

  // C1 debug camera guide: cosine interpolation makes slope 0 on both sides of every node.
  sampleCamera(s: number): number {
    return this.sampleSmooth(s);
  }

  private sampleSmooth(s: number): number {
    const local = wrapPositive(s, this.courseLength);
    const i = this.findSegment(local);
    const a = this.nodes[i]!;
    const b = this.nodes[(i + 1) % this.nodes.length]!;
    const sEnd = i === this.nodes.length - 1 ? this.courseLength : b.s;
    const t = (local - a.s) / (sEnd - a.s);
    const smooth = 0.5 - 0.5 * Math.cos(Math.PI * t);
    return a.y + (b.y - a.y) * smooth;
  }

  distanceToNextRenderNode(s: number): number {
    const local = wrapPositive(s, this.courseLength);
    const sample = this.sampleRender(local);
    const distance = sample.sEnd - local;
    return distance > 1e-9 ? distance : this.courseLength;
  }

  private findSegment(local: number): number {
    let low = 0;
    let high = this.nodes.length - 1;
    while (low <= high) {
      const mid = (low + high) >> 1;
      const current = this.nodes[mid]!;
      const nextS = mid === this.nodes.length - 1 ? this.courseLength : this.nodes[mid + 1]!.s;
      if (local < current.s) high = mid - 1;
      else if (local >= nextS) low = mid + 1;
      else return mid;
    }
    return this.nodes.length - 1;
  }
}

export function createM3DebugHeightProfile(courseLength: number): CyclicHeightProfile {
  return new CyclicHeightProfile(courseLength, [
    { s: 0, y: 0 },
    { s: 60, y: 0 },
    { s: 125, y: 8 },
    { s: 180, y: 8 },
    { s: 250, y: 0 },
    { s: 320, y: 0 },
    { s: 385, y: -5 },
    { s: 450, y: 0 },
    { s: 560, y: 0 },
    { s: Math.min(courseLength - 1, 700), y: 0 },
  ].filter((node, index, array) => node.s < courseLength && (index === 0 || node.s > array[index - 1]!.s)));
}
