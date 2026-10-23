/**
 * TURBO OUTRUN's road data commands ([Development](../../docs/development.md#road-data-commands)): each prints one JSON
 * result, or its diagnostics and exits 1.
 */
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { atomicWrite, requireInput } from '../course/authoring-io.js';
import { POSITION_METRES } from './offset-plan.js';
import { turboOutrunDump } from './turbo-outrun-dump.js';
import { assembleTurboOutrunPrograms } from './turbo-outrun-rom.js';
import { turboOutrunObjects } from './turbo-outrun-scenery.js';
import {
  COURSE_ID as TURBO_OUTRUN_COURSE_ID,
  TURBO_OUTRUN_CONVERSION_VERSION,
  turboOutrunCourse,
} from './turbo-outrun-course.js';
import { TURBO_OUTRUN_NAMES } from './turbo-outrun-names.js';
import { pathTurn } from './road-tables.js';

import {
  dumpDirectory,
  oneZip,
  romDirectory,
  romSet,
  round1,
  round3,
  saveCourse,
  type RoadDataCommands,
} from './road-data-commands.js';

export const TURBO_OUTRUN_COMMANDS: RoadDataCommands = Object.freeze({
  'turbo-outrun-read': async (options) => {
    // TURBO OUTRUN's ROM zip checked and read, never decrypted; every table its course uses to the dump, and the
    // tables described as OUTRUN's checked against OUTRUN's ROM zip.
    const zip = await oneZip(options.get('--zip'), romDirectory('turbo-outrun'), '--zip');
    const outrunZip = await oneZip(options.get('--outrun-zip'), romDirectory('outrun'), '--outrun-zip');
    const set = await romSet('toutrun', [zip]);
    const dump = turboOutrunDump(set, await romSet('outrun', [outrunZip]));
    // Where the objects stand: at the top speed with the original's 108 objects, and as designed (one step a
    // position, below 216.3 km/h, with no object wanting).
    const { main } = assembleTurboOutrunPrograms(set);
    const model = (kmh: number, slots: number) => {
      const { objects, runs } = turboOutrunObjects(main, dump.stages, { kmh, slots });
      return { objects, runs };
    };
    const top = model(dump.constants.topSpeed, dump.constants.objectSlots.count);
    const designed = model(216, 4096);
    const out = options.get('--out') ?? dumpDirectory('turbo-outrun');
    await atomicWrite(path.join(out, 'turbo-outrun.json'), JSON.stringify(dump) + '\n');
    const degrees = (radians: number) => Math.round(((radians * 180) / Math.PI) * 100) / 100;
    console.log(
      JSON.stringify({
        ok: true,
        zip,
        outrunZip,
        out,
        constants: dump.constants,
        stages: dump.stages.map((stage, n) => {
          const { path: p } = stage;
          // Where the last turn ends: the heading holds from there to the path's end.
          let lastTurn = p.x.length - 1;
          while (lastTurn > 0 && p.x[lastTurn - 1] === p.x[lastTurn] && p.y[lastTurn - 1] === p.y[lastTurn]) lastTurn--;
          return {
            number: n,
            name: dump.names[n]!.name,
            curves: stage.curves.length,
            widths: stage.widthsHeights.filter((q) => q.kind !== 0).length,
            heights: stage.widthsHeights.filter((q) => q.kind === 0).length,
            scenery: stage.scenery.length,
            lastTurn,
            // Counterclockwise positive, as `pathTurn` counts.
            turn: degrees(pathTurn(p, 0, p.x.length - 1)),
            background: dump.stageBackgrounds[n]!.background,
          };
        }),
        heightTables: Object.keys(dump.heightTables).length,
        sceneryTypes: Object.keys(dump.sceneryTypes).length,
        kinds: Object.keys(dump.kinds).length,
        sizeLists: Object.keys(dump.sizeLists).length,
        palettes: Object.keys(dump.palettes).length,
        startObjects: dump.startObjects.map((s) => s.shown.length),
        sameAsOutrun: dump.sameAsOutrun,
        objects: {
          kmh: dump.constants.topSpeed,
          stages: top.runs.map((run) => ({
            stage: run.stage,
            gate: round3(run.gate),
            backgroundChange: round3(run.backgroundChange),
            end: round3(run.end),
            stops: run.stops,
            standing: top.objects.filter((o) => o.stage === run.stage).length,
            brought: run.brought,
            dropped: run.dropped,
            ended: run.ended,
            intoNext: top.objects.filter((o) => o.from.stage === run.stage && o.stage !== run.stage).length,
          })),
          standing: top.objects.length,
          pointItems: top.runs.reduce((n, r) => n + r.brought, 0),
          dropped: top.runs.reduce((n, r) => n + r.dropped, 0),
          designed: designed.runs.reduce((n, r) => n + r.brought, 0),
          designedDropped: designed.runs.reduce((n, r) => n + r.dropped, 0),
        },
      }),
    );
  },
  'turbo-outrun-course': async (options) => {
    // TURBO OUTRUN's course and skies from its ROM zip, written to content, or with `--check` compared.
    const check = options.has('--check');
    const zip = await oneZip(options.get('--zip'), romDirectory('turbo-outrun'), '--zip');
    const built = turboOutrunCourse(await romSet('toutrun', [zip]));
    const file = await saveCourse(TURBO_OUTRUN_COURSE_ID, built.document, check);
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
    const { layout } = built;
    const { width } = layout;
    const degrees = (radians: number) => round1((radians * 180) / Math.PI);
    const arcs = layout.path.filter((s) => s.turn !== 0);
    const radius = (s: (typeof arcs)[number]) => ((s.to - s.from) * POSITION_METRES) / Math.abs(s.turn);
    const tightest = arcs.reduce((a, b) => (radius(b) < radius(a) ? b : a));
    console.log(
      JSON.stringify({
        ok: true,
        zip,
        conversion: TURBO_OUTRUN_CONVERSION_VERSION,
        checked: check,
        course: file,
        kmh: built.kmh,
        positions: round3(layout.total - layout.go),
        metres: round1(layout.station(layout.total)),
        sections: layout.pieces.map((p) => p.id),
        stages: layout.course.map(({ run, start, length, joined }, n) => ({
          name: TURBO_OUTRUN_NAMES[n],
          length: round3(length),
          gate: round3(run.gate),
          end: round3(run.end),
          joined,
          endWidth: round1(width.at(start + run.end)),
          turn: degrees(
            layout.plan.elements
              .filter((e) => e.from >= start - 1e-9 && e.to <= start + length + 1e-9)
              .reduce((sum, e) => sum + e.turn, 0),
          ),
        })),
        runs: layout.plan.runs.length,
        elements: layout.path.length,
        fromPath: round3(layout.plan.departure),
        planElements: built.document.sections.reduce((n, s) => n + s.plan.length, 0),
        tightest: { at: round1(tightest.from), radius: round1(radius(tightest)) },
        narrowedSand: layout.sand.narrowed.map((n) => ({
          at: round1(n.from),
          side: n.side ? 'right' : 'left',
          sand: round1(n.sand),
        })),
        crossings: layout.crossings.map((c) => ({
          passages: c.passages.map((p) => [round1(p.from), round1(p.to)]),
          levels: c.levels,
          moves: c.moves,
          heights: c.heights.map(round1),
        })),
        objects: built.placing,
        pictures: built.pictures.length,
        skies: skies.length,
      }),
    );
  },
});
