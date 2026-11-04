/**
 * POLE POSITION II's research dump ([POLE POSITION II road data](../../../docs/pole-position-ii-road-data.md#pole-position-iis-tables)):
 * the tables its courses take, read raw, with the ROMs read. A leaf its commands alone read.
 */
import { romRecords, type RomSet } from '../shared/rom-set.js';
import { assemblePolePositionII, POLE_POSITION_II_READ_ROMS } from './pole-position-ii-rom.js';
import { intervalMetres, readCurveTables, readNames, readRoadPalettes } from './pole-position-ii-road.js';
import { SPEED_ENTRY } from './pole-position-ii-constants.js';

export function polePositionIIDump(set: RomSet) {
  const p = assemblePolePositionII(set);
  return {
    roms: romRecords(POLE_POSITION_II_READ_ROMS),
    names: readNames(p),
    curveTables: readCurveTables(p),
    roadPalettes: readRoadPalettes(p),
    interval: intervalMetres(p, SPEED_ENTRY),
  };
}
