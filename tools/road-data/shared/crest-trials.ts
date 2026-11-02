/**
 * The crests rule's trials ([Original road data](../../../docs/original-road-data.md#crests)): until K chooses its
 * speed, each original's course written with the rule at each speed K may choose, its Sections' profiles alone; the
 * DEV setting CREST SPEED lays them over the course as it loads.
 */
import type { CourseDocument } from '../../../src/course/course-document.js';
import { CREST_TRIAL_KMH } from '../../../src/content/crest-trials.js';
import { laidProfile, type RoadHeights } from './crest-bound.js';
import type { Profile } from './road-profile.js';

/** A course's document written with the rule at each trial speed, by its speed. */
export const crestTrials = (heights: RoadHeights, write: (profile: Profile) => CourseDocument) =>
  new Map(CREST_TRIAL_KMH.map((kmh) => [kmh, write(laidProfile(heights, kmh))]));
