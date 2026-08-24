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

export interface HeightProfileReader {
  readonly courseLength: number;
  sampleRender(s: number): HeightSample;
  samplePhysics(s: number): number;
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

    const copied = nodes.map((node) => ({ ...node })).sort((a, b) => a.s - b.s);
    if (Math.abs(copied[0]!.s) > EPSILON) throw new Error('height profile must start at s=0');
    if (Math.abs(copied.at(-1)!.s - courseLength) > EPSILON) {
      throw new Error('open height profile must end at courseLength');
    }

    copied[0]!.s = 0;
    copied[copied.length - 1]!.s = courseLength;
    for (let i = 0; i < copied.length; i += 1) {
      const node = copied[i]!;
      if (!Number.isFinite(node.s) || !Number.isFinite(node.y)) {
        throw new RangeError('height node values must be finite');
      }
      if (node.s < 0 || node.s > courseLength) throw new RangeError('height node outside open profile');
      if (i > 0 && node.s <= copied[i - 1]!.s) throw new Error('height nodes must be unique');
    }
    this.nodes = Object.freeze(copied);
  }

  sampleRender(s: number): HeightSample {
    const local = openChainage(s, this.courseLength, 'height profile');
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
    return this.sampleSmooth(s);
  }

  sampleCamera(s: number): number {
    return this.sampleSmooth(s);
  }

  distanceToNextRenderNode(s: number): number {
    const local = openChainage(s, this.courseLength, 'height profile');
    if (local === this.courseLength) return 0;
    const i = this.findSegment(local);
    return this.nodes[i + 1]!.s - local;
  }

  private sampleSmooth(s: number): number {
    const local = openChainage(s, this.courseLength, 'height profile');
    const i = this.findSegment(local);
    const a = this.nodes[i]!;
    const b = this.nodes[i + 1]!;
    const t = (local - a.s) / (b.s - a.s);
    const smooth = 0.5 - 0.5 * Math.cos(Math.PI * t);
    return a.y + (b.y - a.y) * smooth;
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

/** Explicit legacy/circuit adapter. Only this layer performs periodic addressing. */
export class CyclicHeightProfile implements HeightProfileReader {
  readonly nodes: readonly HeightNode[];

  constructor(readonly courseLength: number, nodes: readonly HeightNode[]) {
    if (!(courseLength > 0) || !Number.isFinite(courseLength)) {
      throw new RangeError('height profile length must be finite and > 0');
    }
    if (nodes.length < 2) throw new Error('cyclic height profile requires at least two nodes');
    const copied = nodes.map((node) => ({ ...node })).sort((a, b) => a.s - b.s);
    if (Math.abs(copied[0]!.s) > EPSILON) throw new Error('cyclic height profile must start at s=0');
    for (let i = 0; i < copied.length; i += 1) {
      const node = copied[i]!;
      if (!Number.isFinite(node.s) || !Number.isFinite(node.y)) throw new RangeError('height node values must be finite');
      if (node.s < 0 || node.s >= courseLength) throw new RangeError('cyclic height node outside course');
      if (i > 0 && node.s <= copied[i - 1]!.s) throw new Error('height nodes must be unique');
    }
    this.nodes = Object.freeze(copied);
  }

  sampleRender(s: number): HeightSample {
    const local = wrapPositive(s, this.courseLength);
    const i = findCyclicSegment(this.nodes, this.courseLength, local);
    const a = this.nodes[i]!;
    const b = this.nodes[(i + 1) % this.nodes.length]!;
    const sEnd = i === this.nodes.length - 1 ? this.courseLength : b.s;
    const grade = (b.y - a.y) / (sEnd - a.s);
    return {
      y: a.y + grade * (local - a.s),
      grade,
      segmentIndex: i,
      sStart: a.s,
      sEnd,
    };
  }

  samplePhysics(s: number): number {
    return cyclicSmooth(this.nodes, this.courseLength, s);
  }

  sampleCamera(s: number): number {
    return cyclicSmooth(this.nodes, this.courseLength, s);
  }

  distanceToNextRenderNode(s: number): number {
    const local = wrapPositive(s, this.courseLength);
    const sample = this.sampleRender(local);
    const distance = sample.sEnd - local;
    return distance > EPSILON ? distance : this.courseLength;
  }
}

export function createM3DebugHeightProfile(courseLength: number): HeightProfile {
  const interior = [
    { s: 0, y: 0 },
    { s: 60, y: 0 },
    { s: 125, y: 8 },
    { s: 180, y: 8 },
    { s: 250, y: 0 },
    { s: 320, y: 0 },
    { s: 385, y: -5 },
    { s: 450, y: 0 },
    { s: 560, y: 0 },
    { s: 700, y: 0 },
  ].filter((node, index, array) => node.s < courseLength && (index === 0 || node.s > array[index - 1]!.s));
  return new HeightProfile(courseLength, [...interior, { s: courseLength, y: interior.at(-1)?.y ?? 0 }]);
}

function cyclicSmooth(nodes: readonly HeightNode[], courseLength: number, s: number): number {
  const local = wrapPositive(s, courseLength);
  const i = findCyclicSegment(nodes, courseLength, local);
  const a = nodes[i]!;
  const b = nodes[(i + 1) % nodes.length]!;
  const sEnd = i === nodes.length - 1 ? courseLength : b.s;
  const t = (local - a.s) / (sEnd - a.s);
  const smooth = 0.5 - 0.5 * Math.cos(Math.PI * t);
  return a.y + (b.y - a.y) * smooth;
}

function findCyclicSegment(nodes: readonly HeightNode[], courseLength: number, local: number): number {
  let low = 0;
  let high = nodes.length - 1;
  while (low <= high) {
    const mid = (low + high) >> 1;
    const current = nodes[mid]!;
    const nextS = mid === nodes.length - 1 ? courseLength : nodes[mid + 1]!.s;
    if (local < current.s) high = mid - 1;
    else if (local >= nextS) low = mid + 1;
    else return mid;
  }
  return nodes.length - 1;
}

function openChainage(s: number, courseLength: number, label: string): number {
  if (!Number.isFinite(s)) throw new RangeError(`${label} chainage must be finite`);
  if (s < -EPSILON || s > courseLength + EPSILON) {
    throw new RangeError(`${label} chainage is outside [0, courseLength]`);
  }
  if (Math.abs(s) <= EPSILON) return 0;
  if (Math.abs(s - courseLength) <= EPSILON) return courseLength;
  return s;
}
