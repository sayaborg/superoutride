import { compileKnotSequence, knotSequenceChainage, knotIndexAt } from './geometry/knot-sequence.js';
import { nonEmptyId } from '../core/validation.js';

interface VisualSection {
  readonly sStart: number;
  readonly name: string;
}

export interface VisualProfileReader {
  readonly sections: readonly VisualSection[];
  sample(s: number): VisualSection;
  distanceToNextSection(s: number): number;
}

/** General stage visual source. Chainage is the open interval [0, courseLength]. */
export class VisualProfile implements VisualProfileReader {
  readonly sections: readonly VisualSection[];

  constructor(
    readonly courseLength: number,
    sections: readonly VisualSection[],
  ) {
    this.sections = compileKnotSequence(
      sections.map((section) => {
        nonEmptyId(section.name, 'visual section name');
        return { ...section };
      }),
      { length: courseLength, chainage: 'sStart', label: 'visual profile' },
    );
  }

  sample(s: number): VisualSection {
    const local = knotSequenceChainage(s, this.courseLength, 'visual profile');
    return this.sections[knotIndexAt(this.sections, 'sStart', local)]!;
  }

  distanceToNextSection(s: number): number {
    const local = knotSequenceChainage(s, this.courseLength, 'visual profile');
    if (local === this.courseLength) return 0;
    const index = knotIndexAt(this.sections, 'sStart', local);
    return (this.sections[index + 1]?.sStart ?? this.courseLength) - local;
  }
}
