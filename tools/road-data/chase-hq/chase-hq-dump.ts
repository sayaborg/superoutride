/**
 * CHASE H.Q.'s research dump ([Original road data](../../../docs/original-road-data.md#an-originals-modules)): its
 * roads' records and next sections, the road palettes its records name and its far sky layer's turn, read raw, with
 * the ROMs read. A leaf its commands alone read.
 */
import { romRecords, type RomSet } from '../shared/rom-set.js';
import { assembleChaseHqMain, CHASE_HQ_MAIN_ROMS } from './chase-hq-rom.js';
import { courseSections, readRoadPalette, readRoads, readSkyTurn, STAGES } from './chase-hq-road.js';

export function chaseHqDump(set: RomSet) {
  const main = assembleChaseHqMain(set);
  const roads = readRoads(main);
  const entries = [...new Set(roads.flat().flatMap((s) => s.records.map((r) => r.palette)))].sort((a, b) => a - b);
  return {
    roms: romRecords(CHASE_HQ_MAIN_ROMS.flatMap(({ even, odd }) => [even, odd])),
    roads,
    courses: Array.from({ length: STAGES }, (_, stage) =>
      (['left', 'right'] as const).map((side) => ({
        stage: stage + 1,
        side,
        sections: courseSections(roads, stage, side),
      })),
    ).flat(),
    palettes: Object.fromEntries(entries.map((e) => [e, readRoadPalette(main, e)])),
    skyTurn: readSkyTurn(main),
  };
}
