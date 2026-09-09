import { openProfileChainage } from '../core/open-profile-chainage.js';
import { compileGroundBase, type AuthoredGroundBase } from '../course/surface-region.js';

export type GroundBase = AuthoredGroundBase;

export interface VisualSection {
  readonly sStart: number;
  readonly groundBaseLeft: GroundBase;
  readonly groundBaseRight: GroundBase;
  readonly name: string;
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
    for (const section of sections) {
      if (!Number.isFinite(section.sStart)) throw new RangeError('visual section chainage must be finite');
    }
    const copied = sections.map((section) => ({
      ...section,
      groundBaseLeft: compileGroundBase(section.groundBaseLeft),
      groundBaseRight: compileGroundBase(section.groundBaseRight),
    })).sort((a, b) => a.sStart - b.sStart);
    if (copied.length === 0 || Math.abs(copied[0]!.sStart) > EPSILON) {
      throw new Error('visual profile must start at s=0');
    }
    copied[0]!.sStart = 0;
    for (let i = 0; i < copied.length; i += 1) {
      const section = copied[i]!;
      if (section.sStart < 0 || section.sStart >= courseLength) {
        throw new RangeError('visual section outside open profile');
      }
      if (section.name.trim().length === 0) throw new Error('visual section name must be non-empty');
      if (i > 0 && section.sStart <= copied[i - 1]!.sStart) throw new Error('visual sections must be unique');
    }
    this.sections = Object.freeze(copied.map((section) => Object.freeze(section)));
  }

  sample(s: number): VisualSection {
    const local = openProfileChainage(s, this.courseLength, 'visual profile');
    return sectionAt(this.sections, local);
  }

  distanceToNextSection(s: number): number {
    const local = openProfileChainage(s, this.courseLength, 'visual profile');
    if (local === this.courseLength) return 0;
    for (const section of this.sections) {
      if (section.sStart > local + EPSILON) return section.sStart - local;
    }
    return this.courseLength - local;
  }
}

function sectionAt(sections: readonly VisualSection[], local: number): VisualSection {
  let index = sections.length - 1;
  for (let i = 0; i < sections.length; i += 1) {
    if (sections[i]!.sStart <= local) index = i;
    else break;
  }
  return sections[index]!;
}
