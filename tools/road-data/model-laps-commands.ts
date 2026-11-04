/**
 * The laps on their models solved from the ROM zips ([Original road data](../../docs/original-road-data.md#a-lap-on-its-model),
 * The answers kept): `model-laps` solves every course with a model and writes `model-laps.json`, or with `--check`
 * compares what it solves with the file and writes nothing; `--course` solves one course alone. Each course takes
 * minutes.
 */
import { readFile } from 'node:fs/promises';
import { requireInput } from '../authoring/authoring-error.js';
import { formatSavedJson } from '../../src/content/saved-json.js';
import { atomicWrite } from '../course/authoring-io.js';
import { command, readSource, zipOptions, type RoadDataCommands } from './road-data-commands.js';
import { lapDigest, solveLap, type KeptLap } from './shared/model-lap.js';
import { POLE_POSITION_II_ROMS } from './pole-position-ii/pole-position-ii-rom.js';
import { polePositionIIModelLaps } from './pole-position-ii/pole-position-ii-course.js';

const FILE = 'tools/road-data/shared/model-laps.json';

const ABOUT =
  'The laps on their models (Original road data, A lap on its model), solved from the ROM zips by ' +
  '`npm run road-data -- model-laps`. Each is a course with a model: its model, the SHA-256 of what it was solved from ' +
  '(its curve table, its model, its road width and least radius), its turn scale, where its start lies on its model ' +
  "(metres from the model's start line) and its runs' factors in doublings, its runs read round its table from the " +
  'first that its start does not part.';

interface LapsFile {
  readonly about: string;
  readonly laps: readonly KeptLap[];
}

export const MODEL_LAPS_COMMANDS: RoadDataCommands = Object.freeze({
  'model-laps': command(
    { '--check': 'flag', '--course': 'value', ...zipOptions(POLE_POSITION_II_ROMS) },
    async function* (options) {
      const check = options.has('--check');
      const only = options.get('--course');
      const laps = polePositionIIModelLaps((await readSource(POLE_POSITION_II_ROMS, options)).set);
      requireInput(!only || laps.some((l) => l.course === only), '/--course', `No course with a model is ${only}`);
      const kept = JSON.parse(await readFile(FILE, 'utf8').catch(() => '{"laps":[]}')) as LapsFile;
      const keptBy = new Map(kept.laps.map((lap) => [lap.course, lap]));
      const differ: string[] = [];
      const solved: KeptLap[] = [];
      for (const { course, inputs } of laps) {
        if (only && course !== only) {
          const old = keptBy.get(course);
          if (old) solved.push(old);
          continue;
        }
        const started = performance.now();
        const best = solveLap(inputs);
        const seconds = Math.round((performance.now() - started) / 1000);
        requireInput(best, `/${course}`, `${course}'s lap meets its rule at no turn scale of the procedure's`);
        const lap: KeptLap = { course, model: inputs.model.id, inputs: lapDigest(inputs), ...best.answer };
        if (JSON.stringify(lap) !== JSON.stringify(keptBy.get(course))) differ.push(course);
        solved.push(lap);
        yield { ok: true, course, seconds, turnScale: lap.turnScale, start: lap.start, sum: best.measure.sum };
      }
      const file: LapsFile = { about: ABOUT, laps: solved };
      if (check) requireInput(differ.length === 0, `/${FILE}`, `${differ.join(', ')} differ from the laps kept`);
      else await atomicWrite(FILE, formatSavedJson(file));
      yield { ok: true, checked: check, solved: laps.length, differ };
    },
    [POLE_POSITION_II_ROMS],
  ),
});
