/**
 * OUTRUN's road data dump ([OUTRUN road data](../../../docs/outrun-road-data.md)): every table its courses use, read from
 * the ROM set as the programs hold them, raw. It stays on the machine that read the ROMs.
 */
import type { OutrunPrograms } from './outrun-rom.js';
import { requireInput } from '../../authoring/authoring-error.js';
import { romRecords } from '../shared/rom-set.js';
import { OUTRUN_DUMP_ROMS } from './outrun-rom.js';
import {
  readStages,
  readForkStretch,
  readGoalStretches,
  readSceneryType,
  readStage,
  stageLength,
  type Stretch,
  OUTRUN_HEIGHT_TABLES,
} from './outrun-road.js';
import { pathTurn, readHeightTable } from '../out-run-hardware/road-tables.js';

/** The dump's format: raw tables, local to the machine that read the ROMs. */
export const OUTRUN_DUMP_FORMAT = Object.freeze({ format: 'superoutride.outrun-road-data', version: 3 } as const);

/** Every table the courses use, from OUTRUN's programs. */
export function outrunDump(programs: OutrunPrograms) {
  const length = stageLength(programs.main);
  const stages = readStages(programs.main)
    .flat()
    .map((number) => readStage(programs, number));
  const fork = readForkStretch(programs);
  const goals = readGoalStretches(programs);
  const stretches: Stretch[] = [...stages, fork, ...goals.stretches];
  // Every stage's path returns to its first heading or turns once around; points at or past its length, which the
  // road position never reaches within the stage, are reported.
  for (const stage of stages) {
    const name = `0x${stage.number.toString(16)}`;
    const turns = pathTurn(stage.path, 0, length) / (2 * Math.PI);
    requireInput(
      Math.abs(turns - Math.round(turns)) < 1 / 360 && Math.abs(Math.round(turns)) <= 1,
      `/stages/${name}`,
      `Stage ${name}'s path turns ${(turns * 360).toFixed(2)}°, not 0° or ±360°`,
    );
  }
  const heightNumbers = [
    ...new Set(stretches.flatMap((s) => s.widthsHeights.filter((p) => p.kind === 0).map((p) => p.value))),
  ].sort((a, b) => a - b);
  const sceneryTypes = [...new Set(stretches.flatMap((s) => s.scenery.map((p) => p.type)))].sort((a, b) => a - b);
  const dump = {
    ...OUTRUN_DUMP_FORMAT,
    stageLength: length,
    roms: romRecords(OUTRUN_DUMP_ROMS),
    stages,
    fork,
    goals,
    heightTables: Object.fromEntries(
      heightNumbers.map((n) => [n, readHeightTable(programs.sub, n, OUTRUN_HEIGHT_TABLES)]),
    ),
    sceneryTypes: Object.fromEntries(sceneryTypes.map((t) => [t, readSceneryType(programs.main, t)])),
  };
  return dump;
}
