import { compileOpenProfile, openProfileChainage, profileIndexAt } from '../core/open-profile.js';
import { nonEmptyId } from '../core/validation.js';
import type { GroundMapMaterial } from '../course/surface-region.js';

export interface GroundMapLogicalSection {
  readonly sStart: number;
  readonly name: string;
  readonly left: GroundMapMaterial;
  readonly right: GroundMapMaterial;
}

export interface GroundMapLogicalProfileReader {
  readonly courseLength: number;
  sample(s: number): GroundMapLogicalSection;
}

/** General logical GroundMap source. Chainage is the open interval [0, courseLength]. */
export class GroundMapLogicalProfile implements GroundMapLogicalProfileReader {
  readonly sections: readonly GroundMapLogicalSection[];

  constructor(
    readonly courseLength: number,
    sections: readonly GroundMapLogicalSection[],
  ) {
    for (const section of sections) {
      nonEmptyId(section.name, 'GroundMap section name');
      for (const material of [section.left, section.right]) {
        if (material !== 'GRASS' && material !== 'ROCK') throw new RangeError('unknown GroundMap material');
      }
    }
    this.sections = compileOpenProfile(sections, {
      length: courseLength,
      chainage: 'sStart',
      label: 'GroundMap logical profile',
    });
  }

  sample(s: number): GroundMapLogicalSection {
    const local = openProfileChainage(s, this.courseLength, 'GroundMap logical profile');
    return this.sections[profileIndexAt(this.sections, 'sStart', local)]!;
  }
}
