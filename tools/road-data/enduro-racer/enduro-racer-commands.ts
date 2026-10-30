/**
 * ENDURO RACER's road data commands ([Development](../../../docs/development.md#road-data-commands)): each prints one JSON
 * result, or its diagnostics and exits 1.
 */
import path from 'node:path';
import { atomicWrite } from '../../course/authoring-io.js';
import { enduroRacerDump } from './enduro-racer-dump.js';
import {
  COURSE_ID as ENDURO_RACER_COURSE_ID,
  ENDURO_RACER_CONVERSION_VERSION,
  enduroRacerCourse,
} from './enduro-racer-course.js';

import {
  overpassReport,
  dumpDirectory,
  fidelityReport,
  gradeReport,
  readSource,
  zipOptions,
  round1,
  round3,
  type RoadDataCommands,
  command,
} from '../road-data-commands.js';
import { ENDURO_RACER_ROMS } from './enduro-racer-rom.js';
import { STAGE_POSITIONS } from './enduro-racer-road.js';
import { conversionCommand, OriginalOutputs, type Conversion } from '../original-outputs.js';

/** enduro-racer's conversion: its courses, pictures and skies raised from the ROMs, and its report. */
export const ENDURO_RACER_CONVERSION: Conversion = async (options) => {
  // ENDURO RACER's course from its two ROM zips, written to content, or with `--check` compared.
  const outputs = new OriginalOutputs();
  const { zips, set } = await readSource(ENDURO_RACER_ROMS, options);
  const built = enduroRacerCourse(set);
  const file = outputs.course(ENDURO_RACER_COURSE_ID, built.document);
  for (const { image } of built.pictures) outputs.file(image.path, image.bytes);
  // Each stage's sky, baked from its background; course images are saved as their exact compact bytes.
  const { skies } = built;
  for (const { name, document } of skies) {
    const text = JSON.stringify(document);
    outputs.file(`images/${name}.json`, text);
  }
  const degrees = (radians: number) => round1((radians * 180) / Math.PI);
  const arcs = built.path.elements.filter((e) => e.turn !== 0);
  const radius = (e: (typeof arcs)[number]) => e.length / Math.abs(e.turn);
  const tightest = arcs.reduce((a, b) => (radius(b) < radius(a) ? b : a));
  const { stationOf } = built;
  return {
    outputs,
    report: {
      zips,
      conversion: ENDURO_RACER_CONVERSION_VERSION,
      course: file,
      metresAPosition: built.metres,
      metresAUnit: built.unit,
      crossSection: built.cross,
      metres: round1(built.path.length),
      sections: built.pieces.map((p) => p.id),
      runs: built.plan.runs.length,
      elements: built.path.elements.length,
      ...fidelityReport(built.plan.fidelity),
      turn: degrees(built.plan.elements.reduce((sum, e) => sum + e.turn, 0)),
      tightest: { at: round1(tightest.start), radius: round1(radius(tightest)) },
      checkpoints: built.checks.map((q) => round1(stationOf(q))),
      finish: round1(stationOf(built.finish)),
      pastFinish: round1(built.path.length - stationOf(built.finish)),
      yawOrigin: round3(built.yawOrigin),
      // The jumps' shape, and how they join.
      jumps: Object.fromEntries(
        Object.entries(built.jumps).map(([k, v]) => [k, typeof v === 'number' ? round3(v) : v]),
      ),
      // The fords, positions, as the original's and with the ramps taken out.
      water: {
        original: built.water.original.map((w) => w.map(round1)),
        laid: built.water.laid.map((w) => w.map(round1)),
      },
      ...gradeReport(built.profile, built.screenProfile, built.path.length, built.topKmh),
      overpasses: built.overpasses.map((c) => overpassReport(c, built.profile.height)),
      rampRadius: built.rampRadius === null ? null : Math.round(built.rampRadius),
      objects: built.placed.length,
      ground: round3(built.ground),
      bodies: built.placed.filter((o) => o.body !== null).length,
      // The pictures whose bodies the original's hit narrows, with their colored widths.
      narrowed: built.pictures
        .filter((p) => p.colored > built.hitWidth && built.placed.some((o) => o.image === p.name && o.body))
        .map((p) => ({ name: p.name, colored: round3(p.colored) })),
      onOtherPassages: built.dropped,
      onRoad: built.onRoad.length,
      onRoadByStage: [0, 1, 2, 3, 4].map(
        (stage) => built.onRoad.filter((o) => Math.min(4, Math.floor(o.position / STAGE_POSITIONS)) === stage).length,
      ),
      pictures: built.pictures.length,
      skies: skies.length,
    },
  };
};

export const ENDURO_RACER_COMMANDS: RoadDataCommands = Object.freeze({
  'enduro-racer-read': command(
    { ...zipOptions(ENDURO_RACER_ROMS), '--out': 'value' },
    async function* (options) {
      // ENDURO RACER's two ROM zips read, never decrypted; every table its course uses to the dump.
      const { zips, set } = await readSource(ENDURO_RACER_ROMS, options);
      const dump = enduroRacerDump(set);
      const out = options.get('--out') ?? dumpDirectory(ENDURO_RACER_ROMS);
      await atomicWrite(path.join(out, 'enduro-racer.json'), JSON.stringify(dump) + '\n');
      const degrees = (radians: number) => round1((radians * 180) / Math.PI);
      yield {
        ok: true,
        zips,
        out,
        constants: dump.constants,
        stageEnds: dump.stageEnds,
        paths: dump.paths.map(({ address, x, y }) => {
          // Each step's turn, counterclockwise positive as `Math.atan2` counts from x to the right and y ahead.
          let turn = 0;
          for (let p = 1; p < x.length; p++) {
            const step = Math.atan2(y[p]!, x[p]!) - Math.atan2(y[p - 1]!, x[p - 1]!);
            turn += Math.atan2(Math.sin(step), Math.cos(step));
          }
          const lengths = x.map((dx, p) => Math.hypot(dx, y[p]!) / 4096);
          return {
            address: `0x${address.toString(16)}`,
            first: [x[0], y[0]],
            last: [x.at(-1), y.at(-1)],
            turn: degrees(turn),
            notWhole: lengths.filter((l) => Math.abs(l - 1) > 0.01).length,
          };
        }),
        fords: dump.fords,
        hills: dump.hills.map((h) => h.start),
        scenery: Array.from({ length: 6 }, (_, s) => dump.scenery.filter((i) => i.position >> 11 === s).length),
        scaledScenery: dump.scenery.filter((i) => i.height !== undefined).length,
        sceneryTypes: Object.keys(dump.sceneryTypes).length,
        hitTypes: Object.entries(dump.sceneryTypes)
          .filter(([, t]) => t.flags & 8)
          .map(([type]) => Number(type).toString(16)),
        jumps: { halves: dump.jumps.halves, jumps: dump.jumps.jumps.length },
        start: dump.start.map(({ flags, position, x, sizes, height }) => ({
          flags: flags.toString(16),
          position,
          x,
          sizes: sizes.toString(16),
          height,
        })),
        sizeSets: Object.keys(dump.sizeSets).length,
        undrawnRows: Object.fromEntries(
          Object.entries(dump.sizeSets)
            .filter(([, set]) => set.undrawnPixels > 0)
            .map(([address, set]) => [Number(address).toString(16), set.undrawnPixels]),
        ),
        palettes: Object.keys(dump.palettes).length,
        layers: dump.backgrounds.map(({ front, back, backOffset }) => ({
          front: { rows: front.rows, columns: front.columns.length },
          back: { rows: back.rows, columns: back.columns.length, offset: backOffset },
        })),
      };
    },
    [ENDURO_RACER_ROMS],
  ),
  'enduro-racer-course': conversionCommand(ENDURO_RACER_CONVERSION, ENDURO_RACER_ROMS),
});
