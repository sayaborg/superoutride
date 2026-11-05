/**
 * FINAL LAP 2's research dump ([FINAL LAP 2 road data](../../../docs/final-lap-2-road-data.md#final-lap-2s-tables)):
 * the tables its courses take, read raw, with the ROMs read. A leaf its commands alone read.
 */
import { romRecords, type RomSet } from '../shared/rom-set.js';
import { assembleFinalLap2, FINAL_LAP_2_READ_ROMS } from './final-lap-2-rom.js';
import { intervalMetres, readCurveTables, readGrid, readLaps, readLine, readNames } from './final-lap-2-road.js';

export function finalLap2Dump(set: RomSet) {
  const p = assembleFinalLap2(set);
  return {
    roms: romRecords(FINAL_LAP_2_READ_ROMS),
    names: readNames(p),
    curveTables: readCurveTables(p),
    line: readLine(p),
    laps: readLaps(p),
    grid: Array.from({ length: 8 }, (_, k) => readGrid(p)(k)),
    interval: intervalMetres(p),
  };
}
