import { COURSE_DOCUMENT_LIMITS } from '../../src/course/course-limits.js';
import type { CourseResult } from '../../src/course/course-diagnostics.js';
import type { ContentLoadDiagnostic } from '../../src/content/content-load-error.js';
import { readFile, mkdir, writeFile, rename, rm } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { readCourseDocumentBytes } from '../../src/course/course-document.js';
import { compileContent, type CompiledContent, type ContentCompilation } from '../authoring/compile-content.js';
import type { ContentStore } from '../authoring/content-store.js';
import { createNodeContentStore } from '../build/node-content-store.js';
import { readCourseImages } from './read-course-images.js';
import { courseFileId } from './course-file-id.js';

type AuthoringDiagnostic =
  | Extract<CourseResult<never>, { ok: false }>['diagnostics'][number]
  | ContentLoadDiagnostic
  | { kind: string; code: string; path?: string; message: string };

class AuthoringError extends Error {
  readonly diagnostics: readonly AuthoringDiagnostic[];
  constructor(diagnostics: readonly AuthoringDiagnostic[]) {
    super(diagnostics[0]?.message ?? 'Authoring failed');
    this.diagnostics = diagnostics;
  }
}
export function requireInput(condition: unknown, location: string, message: string, kind = 'tool'): asserts condition {
  if (!condition) throw new AuthoringError([{ kind, code: 'invalid_input', path: location, message }]);
}
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
 * The repository's content store with `file` as the course of its name and, before `content/images/`, the saved
 * images of `imagesDirectory`. It reads only.
 */
function courseFileStore(file: string, imagesDirectory: string): ContentStore {
  const content = createNodeContentStore(),
    name = `${courseFileId(file)}.course.json`;
  return Object.freeze({
    async read(target: string) {
      if (target === `courses/${name}`) return new Uint8Array(await readFile(file));
      if (target.startsWith('images/'))
        try {
          return new Uint8Array(await readFile(path.join(imagesDirectory, target.slice('images/'.length))));
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
        }
      return content.read(target);
    },
    list: async (directory: string) => {
      const names = await content.list(directory);
      return directory === 'courses' && !names.includes(name) ? [...names, name].sort() : names;
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
  const store = courseFileStore(file, imagesDirectory ?? path.resolve(path.dirname(file), '../images'));
  const content = requireCompiled(await compileContent(store));
  const id = courseFileId(file);
  const document = readCourseDocumentBytes(await store.read(`courses/${id}.course.json`), file);
  if (!document.ok) throw new AuthoringError(document.diagnostics);
  const images = await readCourseImages(document.value.assets, (name) => store.read(`images/${name}`));
  return {
    document: document.value,
    course: content.courses.find((course) => course.id === id)!,
    images,
    materials: content.materials,
    content,
  };
}
/** Reads the files of `directory` by name. */
export function readDirectoryFile(directory: string) {
  return async (file: string) => new Uint8Array(await readFile(path.join(directory, file)));
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
export function reportError(input: unknown) {
  const error = input as Error & { diagnostics?: readonly AuthoringDiagnostic[]; diagnostic?: AuthoringDiagnostic };
  console.log(
    JSON.stringify({
      ok: false,
      diagnostics:
        error.diagnostics ??
        (error.diagnostic
          ? [error.diagnostic]
          : [{ kind: 'tool', code: 'operation_failed', message: (error as Error).message }]),
    }),
  );
  process.exitCode = 1;
}
