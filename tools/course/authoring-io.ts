import { COURSE_DOCUMENT_LIMITS } from '../../src/course/course-limits.js';
import { readFile, mkdir, writeFile, rename, rm, realpath } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { courseImageNames, readCourseDocumentBytes } from '../../src/course/course-document.js';
import { compileContent, type CompiledContent, type ContentCompilation } from '../authoring/compile-content.js';
import type { ContentStore } from '../authoring/content-store.js';
import {
  coursePath,
  imageNameOfPath,
  imagePath,
  ORIGINALS_PLACE,
  readContentPlaces,
} from '../authoring/content-places.js';
import { savedCourseDocument } from '../authoring/course-edits.js';
import type { Json } from '../authoring/json-pointer.js';
import { CONTENT_ROOT, createNodeContentStore } from '../build/node-content-store.js';
import { formatSavedJson } from '../../src/content/saved-json.js';
import { fileURLToPath } from 'node:url';
import { readCourseImages } from './read-course-images.js';
import { courseFileId } from './course-file-id.js';
import { AuthoringError, requireInput, type AuthoringDiagnostic } from '../authoring/authoring-error.js';

export function options(args: readonly string[], allowed: readonly string[]) {
  requireInput(args.length % 2 === 0, '/arguments', 'Options require a value');
  const result = new Map<string, string>();
  for (let i = 0; i < args.length; i += 2) {
    requireInput(
      allowed.includes(args[i]!) && !result.has(args[i]!),
      '/arguments',
      `Unknown or repeated option: ${args[i]}`,
    );
    result.set(args[i]!, args[i + 1]!);
  }
  return result;
}
export function finite(value: unknown, location: string, min = -Infinity, max = Infinity): number {
  requireInput(
    typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max,
    location,
    `Expected a finite number in [${min}, ${max}]`,
  );
  return value;
}
export async function jsonFile(file: string): Promise<{ bytes: Buffer; value: unknown }> {
  const bytes = await readFile(file);
  requireInput(
    bytes.length <= COURSE_DOCUMENT_LIMITS.jsonBytes,
    file,
    `Authoring JSON exceeds ${COURSE_DOCUMENT_LIMITS.jsonBytes} bytes`,
  );
  try {
    return { bytes, value: JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) };
  } catch (error) {
    throw new AuthoringError([{ kind: 'tool', code: 'parse_failure', path: file, message: (error as Error).message }]);
  }
}
/** The authoring core's result, or an AuthoringError carrying its diagnostics. */
export function requireCompiled(result: ContentCompilation): CompiledContent {
  if (!result.ok) throw new AuthoringError(result.diagnostics);
  return result.value;
}

/**
 * The repository's content store with `file` as the course of its name, in the place a course of that name lies (the
 * hand-made one where none does), and, before either place's images, the saved images of `imagesDirectory`. It reads
 * only.
 */
async function courseFileStore(file: string, imagesDirectory: string): Promise<ContentStore> {
  const content = createNodeContentStore(),
    id = courseFileId(file),
    target = coursePath(await readContentPlaces(content), id),
    directory = target.slice(0, target.lastIndexOf('/')),
    name = target.slice(directory.length + 1);
  return Object.freeze({
    async read(wanted: string) {
      if (wanted === target) return new Uint8Array(await readFile(file));
      const image = imageNameOfPath(wanted);
      if (image !== null)
        try {
          return new Uint8Array(await readFile(path.join(imagesDirectory, `${image}.json`)));
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
        }
      return content.read(wanted);
    },
    list: async (listed: string) => {
      const names = await content.list(listed);
      return listed === directory && !names.includes(name) ? [...names, name].sort() : names;
    },
    write: () => Promise.reject(new Error('The course file store reads only')),
  });
}

/**
 * Compile the content with the course document `file` (its images from `imagesDirectory`, by default the `images`
 * directory beside its directory) through the authoring core: the compiled course, its admitted document and saved
 * image inputs, and the compiled content.
 */
export async function loadCourse(file: string, imagesDirectory?: string) {
  const store = await courseFileStore(file, imagesDirectory ?? path.resolve(path.dirname(file), '../images'));
  const content = requireCompiled(await compileContent(store, { measured: false }));
  const id = courseFileId(file),
    places = await readContentPlaces(store);
  const document = readCourseDocumentBytes(await store.read(coursePath(places, id)), file);
  if (!document.ok) throw new AuthoringError(document.diagnostics);
  const images = await readCourseImages(courseImageNames(document.value), (name) =>
    store.read(imagePath(places, name.slice(0, -'.json'.length))),
  );
  return {
    document: document.value,
    course: content.courses.find((course) => course.id === id)!,
    images,
    materials: content.materials,
    content,
  };
}
/**
 * Write an edited course document to `file` in the saved layout; a file in the originals' place under `content/`, which
 * the course command never writes, is refused.
 */
export async function writeEditedCourse(file: string, document: Json) {
  await atomicWrite(await outsideOriginals(file), formatSavedJson(savedCourseDocument(document)));
}

/**
 * The course command's output `file`, resolved; refused when it lies in `content/originals/`, the originals' place,
 * which the course command never writes. The check is on the path the file system resolves to, its existing part's
 * symbolic links followed, so neither a name such as `..x` nor a link finds a way in.
 */
export async function outsideOriginals(file: string): Promise<string> {
  const destination = path.resolve(file);
  const originals = await realPath(fileURLToPath(new URL(`${ORIGINALS_PLACE}/`, CONTENT_ROOT)));
  const within = path.relative(originals, await realPath(destination));
  requireInput(
    within === '..' || within.startsWith(`..${path.sep}`) || path.isAbsolute(within),
    '/out',
    `${destination} lies in content/${ORIGINALS_PLACE}/, the originals' place, which the course command never writes`,
  );
  return destination;
}

/** `file` with the symbolic links of its longest existing part followed, the rest as written. */
async function realPath(file: string): Promise<string> {
  try {
    return await realpath(file);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    const parent = path.dirname(file);
    return parent === file ? file : path.join(await realPath(parent), path.basename(file));
  }
}
export async function atomicWrite(file: string, data: string | Uint8Array) {
  await mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, data);
    await rename(temporary, file);
  } finally {
    await rm(temporary, { force: true });
  }
}
/**
 * End a command that failed: expected content and input errors print their diagnostics as JSON alone; any other error
 * is an internal fault and prints with its stack.
 */
export function reportError(input: unknown) {
  const error = input as Error & { diagnostics?: readonly AuthoringDiagnostic[]; diagnostic?: AuthoringDiagnostic };
  const diagnostics = error?.diagnostics ?? (error?.diagnostic ? [error.diagnostic] : null);
  if (diagnostics) console.log(JSON.stringify({ ok: false, diagnostics }));
  else console.error(input);
  process.exitCode = 1;
}
