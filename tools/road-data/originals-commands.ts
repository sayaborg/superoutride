/**
 * Every original raised again from its ROM zips at once
 * ([Raising the originals again](../../docs/original-road-data.md#raising-the-originals-again)): each original's
 * conversion in one order, each reading its zips from its ROM directory, and the originals' place made exactly what
 * they write.
 */
import { courseImageNames, readCourseDocument } from '../../src/course/course-document.js';
import { OUTRUN_CONVERSION } from './outrun-commands.js';
import { SUPER_HANG_ON_CONVERSION } from './super-hang-on-commands.js';
import { TURBO_OUTRUN_CONVERSION } from './turbo-outrun-commands.js';
import { ENDURO_RACER_CONVERSION } from './enduro-racer-commands.js';
import { SUPER_MONACO_GP_CONVERSION } from './super-monaco-gp-commands.js';
import type { RoadDataCommands, RoadDataOptions } from './road-data-commands.js';
import {
  outputsDiagnostics,
  placedOriginals,
  removeOriginal,
  settleOutputs,
  type Conversion,
  type OriginalOutputs,
} from './original-outputs.js';

/** The conversions, by their commands' names, in the order they run. */
const ORDER: readonly (readonly [string, Conversion])[] = Object.freeze([
  ['outrun-course', OUTRUN_CONVERSION],
  ['super-hang-on-course', SUPER_HANG_ON_CONVERSION],
  ['turbo-outrun-course', TURBO_OUTRUN_CONVERSION],
  ['enduro-racer-course', ENDURO_RACER_CONVERSION],
  ['super-monaco-gp-course', SUPER_MONACO_GP_CONVERSION],
]);

/** An error's diagnostics, else its message as one. */
function diagnosticsOf(error: unknown): readonly unknown[] {
  const { diagnostics, diagnostic } = (error ?? {}) as { diagnostics?: readonly unknown[]; diagnostic?: unknown };
  return (
    diagnostics ?? (diagnostic ? [diagnostic] : [{ kind: 'tool', code: 'failed', path: '', message: String(error) }])
  );
}

const COURSE = /^courses\/(.+)\.course\.json$/;
const IMAGE = /^images\/(.+)\.json$/;

/** The courses of `outputs` whose document or one of whose images is among `changed`, by course id. */
function changedCourses(outputs: OriginalOutputs, changed: ReadonlySet<string>): string[] {
  const courses: string[] = [];
  for (const place of outputs.paths) {
    const id = COURSE.exec(place)?.[1];
    if (id === undefined) continue;
    const read = readCourseDocument(JSON.parse(new TextDecoder().decode(outputs.bytes(place))), place);
    if (!read.ok) throw new Error(`${place} does not read`);
    if (changed.has(place) || courseImageNames(read.value).some((name) => changed.has(`images/${name}.json`)))
      courses.push(id);
  }
  return courses;
}

export const ORIGINALS_COMMANDS: RoadDataCommands = Object.freeze({
  originals: async (options: RoadDataOptions) => {
    // Every original's outputs from its zips: each conversion's result one line, then what changed. A conversion that
    // fails is reported and the rest still run; the command then ends with a failure. Once every conversion ran, the
    // originals' place holds exactly their outputs: a file no conversion writes is removed, or with `--check` named.
    const check = options.has('--check');
    const failed: string[] = [],
      written = new Set<string>(),
      changed: string[] = [],
      pictures: string[] = [];
    let differs = false;
    for (const [command, conversion] of ORDER) {
      try {
        const { outputs, report } = await conversion(new Map());
        const settled = await settleOutputs(outputs, check);
        for (const place of outputs.paths) written.add(place);
        const touched = new Set([...settled.changed, ...settled.missing]);
        changed.push(...changedCourses(outputs, touched));
        pictures.push(...[...touched].filter((place) => IMAGE.test(place)));
        const diagnostics = check ? outputsDiagnostics(settled) : [];
        if (diagnostics.length) {
          differs = true;
          console.log(JSON.stringify({ ok: false, command, outputs: settled, diagnostics }));
        } else console.log(JSON.stringify({ ok: true, command, ...report, checked: check, outputs: settled }));
      } catch (error) {
        failed.push(command);
        console.log(JSON.stringify({ ok: false, command, diagnostics: diagnosticsOf(error) }));
      }
    }
    // Which files no conversion writes can be told only once every conversion has said what it writes.
    const extra = failed.length ? null : (await placedOriginals()).filter((place) => !written.has(place));
    if (extra && !check) for (const place of extra) await removeOriginal(place);
    const extraDiagnostics = check && extra ? outputsDiagnostics({ files: 0, changed: [], missing: [] }, extra) : [];
    const ok = failed.length === 0 && !differs && extraDiagnostics.length === 0;
    console.log(
      JSON.stringify({
        ok,
        checked: check,
        failed,
        extra,
        changedCourses: changed.sort(),
        changedPictures: pictures.length,
        measure: changed.length ? 'npm run measure -- generate' : null,
        ...(extraDiagnostics.length ? { diagnostics: extraDiagnostics } : {}),
      }),
    );
    if (!ok) process.exitCode = 1;
  },
});
