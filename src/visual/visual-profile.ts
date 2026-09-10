import { openProfileChainage } from '../core/open-profile-chainage.js';
import { compileOpenProfile, profileIndexAt } from '../core/open-profile.js';
import { nonEmptyId } from '../core/validation.js';
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
    this.sections = compileOpenProfile(
      sections.map((section) => {
        nonEmptyId(section.name, 'visual section name');
        return {
          ...section,
          groundBaseLeft: compileGroundBase(section.groundBaseLeft),
          groundBaseRight: compileGroundBase(section.groundBaseRight),
        };
      }),
      { length: courseLength, chainage: 'sStart', label: 'visual profile' },
    );
  }

  sample(s: number): VisualSection {
    const local = openProfileChainage(s, this.courseLength, 'visual profile');
    return this.sections[profileIndexAt(this.sections, 'sStart', local)]!;
  }

  distanceToNextSection(s: number): number {
    const local = openProfileChainage(s, this.courseLength, 'visual profile');
    if (local === this.courseLength) return 0;
    const index = profileIndexAt(this.sections, 'sStart', local);
    return (this.sections[index + 1]?.sStart ?? this.courseLength) - local;
  }
}
