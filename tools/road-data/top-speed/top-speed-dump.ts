/**
 * TOP SPEED's research dump ([Original road data](../../../docs/original-road-data.md#an-originals-modules)): its
 * stages' sections and goal sections, each record read raw, its stages' paths and its courses' sections and skies, with
 * the ROMs read. A leaf its commands alone read.
 */
import { romRecords, type RomSet } from '../shared/rom-set.js';
import { skyChanges } from './top-speed-backgrounds.js';
import { courseRecords } from './top-speed-road-across.js';
import {
  assembleTopSpeedMain,
  assembleTopSpeedSub,
  TOP_SPEED_PROGRAM_ROMS,
  TOP_SPEED_SUB_ROMS,
} from './top-speed-rom.js';
import { COURSES, courseSections, readStages, stagePaths } from './top-speed-road.js';

export function topSpeedDump(set: RomSet) {
  const main = assembleTopSpeedMain(set);
  const stages = readStages(assembleTopSpeedSub(set));
  return {
    roms: romRecords([...TOP_SPEED_PROGRAM_ROMS, ...TOP_SPEED_SUB_ROMS].flatMap(({ even, odd }) => [even, odd])),
    stages: stages.map((stage) => ({
      sections: stage.sections,
      goals: Object.fromEntries(stage.goals),
      paths: stagePaths(stage),
    })),
    courses: Array.from({ length: COURSES }, (_, course) => {
      const sections = courseSections(stages, course);
      return {
        course: 'ABCDEFG'[course]!,
        sections: sections.map((s) => ({ stage: s.stage, section: s.section })),
        skies: skyChanges(main, courseRecords(sections)),
      };
    }),
  };
}
