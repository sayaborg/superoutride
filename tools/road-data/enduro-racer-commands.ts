/**
 * ENDURO RACER's road data commands ([Development](../../docs/development.md#road-data-commands)): each prints one JSON
 * result, or its diagnostics and exits 1.
 */
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { atomicWrite, requireInput } from '../course/authoring-io.js';
import { enduroRacerDump } from './enduro-racer-dump.js';
import {
  COURSE_ID as ENDURO_RACER_COURSE_ID,
  ENDURO_RACER_CONVERSION_VERSION,
  enduroRacerCourse,
} from './enduro-racer-course.js';

import {
  crossingReport,
  dumpDirectory,
  fidelityReport,
  gradeReport,
  romDirectory,
  romSet,
  round1,
  round3,
  saveCourse,
  type RoadDataCommands,
} from './road-data-commands.js';

/** The original's top speed, km/h: its display shows at most 199 ([research notes](../../docs/research/enduro-racer.md)). */
const TOP_KMH = 199;

/** Where K's two ENDURO RACER ROM zips lie: never committed. */
const ENDURO_RACER_ZIPS = Object.freeze({
  '--zip': `${romDirectory('enduro-racer')}/enduror.zip`,
  '--bootleg-zip': `${romDirectory('enduro-racer')}/endurobl.zip`,
} as const);

/** ENDURO RACER's ROM set, from its two zips as one: `enduror` (`--zip`) and `endurobl` (`--bootleg-zip`). */
async function enduroRacerSet(options: ReadonlyMap<string, string>) {
  const zips = Object.entries(ENDURO_RACER_ZIPS).map(([option, zip]) => options.get(option) ?? zip);
  return { zips, set: await romSet('enduror and endurobl', zips) };
}

export const ENDURO_RACER_COMMANDS: RoadDataCommands = Object.freeze({
  'enduro-racer-read': async (options) => {
    // ENDURO RACER's two ROM zips read, never decrypted; every table its course uses to the dump.
    const { zips, set } = await enduroRacerSet(options);
    const dump = enduroRacerDump(set);
    const out = options.get('--out') ?? dumpDirectory('enduro-racer');
    await atomicWrite(path.join(out, 'enduro-racer.json'), JSON.stringify(dump) + '\n');
    const degrees = (radians: number) => round1((radians * 180) / Math.PI);
    console.log(
      JSON.stringify({
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
        waterCrossings: dump.waterCrossings,
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
      }),
    );
  },
  'enduro-racer-course': async (options) => {
    // ENDURO RACER's course from its two ROM zips, written to content, or with `--check` compared.
    const check = options.has('--check');
    const { zips, set } = await enduroRacerSet(options);
    const built = enduroRacerCourse(set);
    const file = await saveCourse(ENDURO_RACER_COURSE_ID, built.document, check);
    for (const { image } of built.pictures) {
      const picture = `content/${image.path}`;
      if (check) {
        const committed = await readFile(picture).catch(() => null);
        requireInput(
          committed && Buffer.compare(committed, image.bytes) === 0,
          `/${picture}`,
          `${picture} is not the ROMs'`,
        );
      } else await atomicWrite(picture, image.bytes);
    }
    // Each stage's sky, baked from its background; course images are saved as their exact compact bytes.
    const { skies } = built;
    for (const { name, document } of skies) {
      const text = JSON.stringify(document);
      const skyFile = `content/images/${name}.json`;
      if (check) {
        const committed = await readFile(skyFile, 'utf8').catch(() => null);
        requireInput(committed === text, `/${skyFile}`, `${skyFile} is not the ROMs'`);
      } else await atomicWrite(skyFile, text);
    }
    const degrees = (radians: number) => round1((radians * 180) / Math.PI);
    const arcs = built.path.elements.filter((e) => e.turn !== 0);
    const radius = (e: (typeof arcs)[number]) => e.length / Math.abs(e.turn);
    const tightest = arcs.reduce((a, b) => (radius(b) < radius(a) ? b : a));
    const { stationOf } = built;
    console.log(
      JSON.stringify({
        ok: true,
        zips,
        conversion: ENDURO_RACER_CONVERSION_VERSION,
        checked: check,
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
        jumps: Object.fromEntries(Object.entries(built.jumps).map(([k, v]) => [k, round3(v)])),
        ...gradeReport(built.profile, built.screenProfile, built.path.length, TOP_KMH),
        crossings: built.crossings.map((c) => crossingReport(c, built.profile.height)),
        rampRadius: built.rampRadius === null ? null : Math.round(built.rampRadius),
        objects: built.placed.length,
        ground: round3(built.ground),
        bodies: built.placed.filter((o) => o.body !== null).length,
        // The pictures whose bodies the original's hit narrows, with their colored widths.
        narrowed: built.pictures
          .filter((p) => p.colored > built.hitWidth && built.placed.some((o) => o.image === p.name && o.body))
          .map((p) => ({ name: p.name, colored: round3(p.colored) })),
        onOtherPassages: built.dropped,
        passedThrough: built.passedThrough.length,
        passedThroughByStage: [0, 1, 2, 3, 4].map(
          (stage) => built.passedThrough.filter((o) => Math.min(4, Math.floor(o.position / 2048)) === stage).length,
        ),
        pictures: built.pictures.length,
        skies: skies.length,
      }),
    );
  },
});
