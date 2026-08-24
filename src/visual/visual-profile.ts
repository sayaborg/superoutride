import { wrapPositive } from '../core/math.js';

export type GroundBase =
  | { kind: 'color'; color: number }
  | { kind: 'transparent' };

export interface VisualSection {
  sStart: number;
  groundBaseLeft: GroundBase;
  groundBaseRight: GroundBase;
  name: string;
}

export interface VisualProfileReader {
  readonly courseLength: number;
  sample(s: number): VisualSection;
  distanceToNextSection(s: number): number;
}

const EPSILON = 1e-9;

/** General stage visual source. Chainage is the open interval [0, courseLength]. */
export class VisualProfile implements VisualProfileReader {
  readonly sections: readonly VisualSection[];

  constructor(readonly courseLength: number, sections: readonly VisualSection[]) {
    if (!(courseLength > 0) || !Number.isFinite(courseLength)) {
      throw new RangeError('visual profile length must be finite and > 0');
    }
    const copied = sections.map((section) => ({ ...section })).sort((a, b) => a.sStart - b.sStart);
    if (copied.length === 0 || Math.abs(copied[0]!.sStart) > EPSILON) {
      throw new Error('visual profile must start at s=0');
    }
    copied[0]!.sStart = 0;
    for (let i = 0; i < copied.length; i += 1) {
      const section = copied[i]!;
      if (!Number.isFinite(section.sStart) || section.sStart < 0 || section.sStart >= courseLength) {
        throw new RangeError('visual section outside open profile');
      }
      if (section.name.trim().length === 0) throw new Error('visual section name must be non-empty');
      if (i > 0 && section.sStart <= copied[i - 1]!.sStart) throw new Error('visual sections must be unique');
    }
    this.sections = Object.freeze(copied);
  }

  sample(s: number): VisualSection {
    const local = openChainage(s, this.courseLength, 'visual profile');
    let index = this.sections.length - 1;
    for (let i = 0; i < this.sections.length; i += 1) {
      if (this.sections[i]!.sStart <= local) index = i;
      else break;
    }
    return this.sections[index]!;
  }

  distanceToNextSection(s: number): number {
    const local = openChainage(s, this.courseLength, 'visual profile');
    if (local === this.courseLength) return 0;
    for (const section of this.sections) {
      if (section.sStart > local + EPSILON) return section.sStart - local;
    }
    return this.courseLength - local;
  }
}

/** Explicit legacy/circuit adapter. Only this layer performs periodic addressing. */
export class CyclicVisualProfile implements VisualProfileReader {
  readonly source: VisualProfile;

  constructor(readonly courseLength: number, sections: readonly VisualSection[]) {
    this.source = new VisualProfile(courseLength, sections);
  }

  get sections(): readonly VisualSection[] {
    return this.source.sections;
  }

  sample(s: number): VisualSection {
    return this.source.sample(wrapPositive(s, this.courseLength));
  }

  distanceToNextSection(s: number): number {
    const local = wrapPositive(s, this.courseLength);
    const distance = this.source.distanceToNextSection(local);
    return distance > EPSILON ? distance : this.courseLength;
  }
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
