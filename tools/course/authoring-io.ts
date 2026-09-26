import { COURSE_DOCUMENT_LIMITS } from '../../src/course/course-limits.js';
import type { CourseResult } from '../../src/course/course-diagnostics.js';
import type { CompiledCourse } from '../../src/course/compiler/compiled-course.js';
import { readFile, mkdir, writeFile, rename, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { readCourseDocument } from '../../src/course/course-document.js';
import { compileCourseDocument } from '../../src/course/compiler/compiled-course.js';
import { compileSurfaceMaterials } from '../../src/course/surface-material.js';
import { compileCourseImages } from './compile-course-images.js';
import { readCourseImages } from './read-course-images.js';

type AuthoringDiagnostic =
  | Extract<CourseResult<never>, { ok: false }>['diagnostics'][number]
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
export async function loadAuthoringSurfaceMaterials() {
  const filename = fileURLToPath(new URL('../../content/materials/surface.json', import.meta.url));
  const value = (await jsonFile(filename)).value;
  const result = compileSurfaceMaterials([{ id: 'surface', path: 'content/materials/surface.json', value }]);
  if (!result.ok) throw new AuthoringError(result.diagnostics);
  return result.value;
}

export async function loadCourse(file: string, imagesDirectory?: string) {
  const admitted = readCourseDocument((await jsonFile(file)).value, file);
  if (!admitted.ok) throw new AuthoringError(admitted.diagnostics);
  const directory = imagesDirectory ?? path.resolve(path.dirname(file), '../images');
  const images = await readCourseImages(admitted.value.assets, directory);
  const prepared = await compileCourseImages(admitted.value, images);
  const materials = await loadAuthoringSurfaceMaterials();
  const compiled = await compileCourseDocument(prepared.document, prepared.images, materials, file);
  if (!compiled.ok) throw new AuthoringError(compiled.diagnostics);
  return { document: admitted.value, course: compiled.value, images, materials };
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

/** Authored Strip fields are compiled with the course and shared by all previews. */
export async function loadCourseGround(course: CompiledCourse) {
  const { createCourseGround } = await import('../../src/course/compiler/course-ground.js');
  return createCourseGround(course);
}
