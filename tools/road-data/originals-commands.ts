/**
 * Every original raised again from its ROM zips at once
 * ([Raising the originals again](../../docs/original-road-data.md#raising-the-originals-again)): each original's
 * conversion in one order, each reading its zips from its ROM directory, and the originals' place made exactly what
 * they write.
 */
import { courseImageNames, readCourseDocument } from '../../src/course/course-document.js';
import { namingSources } from './shared/conversion-errors.js';
import { conversionName, ORIGINALS } from './originals-register.js';
import { command, readSource, type RoadDataCommands } from './road-data-commands.js';
import { outputsDiagnostics, placedOriginals, removeOriginal, settleOutputs } from './original-outputs.js';
import { type OriginalOutputs } from './shared/conversion.js';
import { spriteTable, tableKey } from './shared/sprite-rules.js';

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
  originals: command({ '--check': 'flag' }, async function* (options) {
    // Every original's outputs from its zips: each conversion's result one line, then what changed. A conversion that
    // fails is reported and the rest still run; the command then ends with a failure. Once every conversion ran, the
    // originals' place holds exactly their outputs: a file no conversion writes is removed, or with `--check` named.
    const check = options.has('--check');
    const failed: string[] = [],
      written = new Set<string>(),
      changed: string[] = [],
      pictures: string[] = [];
    let differs = false;
    for (const original of ORIGINALS) {
      const { conversion, source } = original,
        name = conversionName(original);
      try {
        const { zips, set } = await readSource(source, new Map());
        const { outputs, report } = conversion(set);
        const settled = await settleOutputs(outputs, check);
        for (const place of outputs.paths) written.add(place);
        const touched = new Set([...settled.changed, ...settled.missing]);
        changed.push(...changedCourses(outputs, touched));
        pictures.push(...[...touched].filter((place) => IMAGE.test(place)));
        const diagnostics = check ? outputsDiagnostics(settled) : [];
        if (diagnostics.length) {
          differs = true;
          yield { ok: false, command: name, outputs: settled, diagnostics };
        } else yield { ok: true, command: name, zips, ...report, checked: check, outputs: settled };
      } catch (error) {
        failed.push(name);
        yield { ok: false, command: name, diagnostics: diagnosticsOf(namingSources(error, [source])) };
      }
    }
    // Which files no conversion writes can be told only once every conversion has said what it writes.
    const extra = failed.length ? null : (await placedOriginals()).filter((place) => !written.has(place));
    if (extra && !check) for (const place of extra) await removeOriginal(place);
    const extraDiagnostics = check && extra ? outputsDiagnostics({ files: 0, changed: [], missing: [] }, extra) : [];
    // K's table judges pictures some original draws: each key the `tableKey` of an image written; one naming none is
    // stale, told once every conversion has run.
    const drawn = new Set(
      [...written].flatMap((place) => [IMAGE.exec(place)?.[1]].flatMap((n) => (n ? [tableKey(n)] : []))),
    );
    const stale = failed.length ? [] : [...spriteTable().keys()].filter((id) => !drawn.has(id));
    const tableDiagnostics = stale.map((id) => ({
      kind: 'tool',
      code: 'invalid_input',
      path: `/tools/road-data/shared/sprite-table.json/pictures/${id}`,
      message: `K's table judges ${id}, a picture no original draws`,
    }));
    const ok = failed.length === 0 && !differs && extraDiagnostics.length === 0 && stale.length === 0;
    yield {
      ok,
      checked: check,
      failed,
      extra,
      changedCourses: changed.sort(),
      changedPictures: pictures.length,
      measure: changed.length ? 'npm run measure -- generate' : null,
      ...(extraDiagnostics.length || stale.length ? { diagnostics: [...extraDiagnostics, ...tableDiagnostics] } : {}),
    };
  }),
});
