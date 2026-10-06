import { compileVehicleDefinitions, type VehicleDefinitions } from '../../src/content/vehicle-catalog.js';
import { compileEngineSounds } from '../../src/content/engine-sound-catalog.js';
import {
  ContentLoadError,
  requireLoaded,
  type ContentKind,
  type ContentLoadDiagnostic,
} from '../../src/content/content-load-error.js';
import { authoredDocumentSource, type DocumentSource } from '../../src/content/document-catalog.js';
import { encodeContentJson } from '../../src/content/content-manifest.js';
import { compileCourseDocument, type CompiledCourse } from '../../src/course/compiler/compiled-course.js';
import { admitSeriesCourse, compileSeriesCatalog, type SeriesCourse } from '../../src/content/series-catalog.js';
import { courseImageNames, readCourseDocumentBytes } from '../../src/course/course-document.js';
import { CourseAssetError, courseFailures } from '../../src/course/course-diagnostics.js';
import type { SurfaceMaterialCatalog } from '../../src/course/surface-material.js';
import { compileSurfaceMaterials } from '../../src/content/surface-material-catalog.js';
import { resolveSurfaceSoundRecords } from '../../src/audio/surface-sounds.js';
import { compileSurfaceSounds } from '../../src/content/surface-sound-catalog.js';
import { compileAudioSettings } from '../../src/content/audio-catalog.js';
import { compileFreePlayRules, type FreePlayRules } from '../../src/content/free-play-rules.js';
import { admit } from '../../src/core/admission.js';
import { compileTextTiles } from '../../src/image/text-tiles.js';
import { TEXT_TILES_ID } from '../../src/content/text-tiles-catalog.js';
import { COURSE_INDEX_ID, courseIndexDocument } from '../../src/content/course-index.js';
import { RECORDING_GROUPS, recordingId } from '../../src/audio/recordings.js';
import { compileMusicCatalog, compileRecordings, type RecordingSource } from '../../src/content/recording-catalog.js';
import { TEXT_COLUMNS } from '../../src/view/text-layer.js';
import { admitCourseWallSounds, compileWallSounds } from '../../src/content/wall-sound-catalog.js';
import { assembleVehicleSpriteLibrary } from '../graphics/vehicle-sprite-sets.js';
import { compileVehicleSpriteLibrary } from '../graphics/vehicle-sprite-library.js';
import { compileCourseImages } from '../course/compile-course-images.js';
import { readCourseImages } from '../course/read-course-images.js';
import { courseFileId, courseFileSha256 } from '../course/course-file-id.js';
import { createSessionVehicle, sessionVehicleSha256 } from '../../src/content/session-vehicle.js';
import { readCourseTimeBudgets } from '../../src/content/course-time-budgets.js';
import { procedureSha256 } from '../course/procedure.js';
import { ENVELOPE_MEASUREMENT } from '../course/rival-envelope-measurement.js';
import { REFERENCE_RUN } from '../course/reference-run.js';
import { courseTimeBudgetsProduct } from '../course/course-reference.js';
import {
  deliveredEnvelope,
  deliveredSchedule,
  measuredEnvelopePath,
  readSavedEnvelope,
  readSavedReferenceTimes,
  referenceTimes,
  referenceTimesPath,
  staleMeasurement,
  type SavedReferenceTimes,
} from '../course/measured-products.js';
import { contentDigest } from '../../src/core/content-digest.js';
import type { ContentStore } from './content-store.js';

/** One delivered file: its manifest kind and ID and its exact bytes, which callers read and never modify. */
export interface DeliveredFile {
  readonly kind: ContentKind;
  readonly id: string;
  readonly bytes: Uint8Array<ArrayBuffer>;
}

/** The delivered files in delivery order, with the compiled products later stages and tools consume. */
export interface CompiledContent {
  readonly files: readonly DeliveredFile[];
  readonly library: ReturnType<typeof compileVehicleSpriteLibrary>;
  readonly materials: SurfaceMaterialCatalog;
  readonly freePlay: FreePlayRules;
  readonly definitions: VehicleDefinitions;
  readonly courses: readonly CompiledCourse[];
  /** Each series course with its admitted series settings. */
  readonly seriesCourses: readonly { readonly course: CompiledCourse; readonly settings: SeriesCourse }[];
}

/** Each stage's result with the key of its inputs, which a later compile may reuse. */
export type CompileStages = ReadonlyMap<string, { readonly key: string; readonly value: unknown }>;

export type ContentCompilation = (
  | { readonly ok: true; readonly value: CompiledContent }
  | { readonly ok: false; readonly diagnostics: readonly ContentLoadDiagnostic[] }
) & {
  /** The stages that completed, for `previous`. */
  readonly stages: CompileStages;
};

/**
 * The authoring core: compile the authored documents of `store` into every delivered file, in dependency order and in
 * one pass: vehicle sprite library, text tiles, materials, surface sounds, wall sounds, audio settings, recordings and
 * music, FREE PLAY rules, engine sounds, vehicle and driving definitions, courses (their walls' sounds admitted against
 * the wall sounds) and their images, the course index, series, then the measured products: each catalog vehicle's
 * envelope and each series course's time budgets and pace schedules from the saved measurements, which must be current.
 * Each stage receives earlier products directly and admits its documents as delivery does. With `measured: false` it
 * stops before the measured products, for tools that produce them or do not use them. An expected content error ends
 * compilation with its diagnostics and no product; other failures, store reads included, propagate.
 *
 * Each stage, and each course on its own, is keyed by the SHA-256 of what it reads: its documents' bytes and the keys
 * of the earlier stages it uses. Given a `previous` compilation, a stage whose key is unchanged takes its earlier
 * result instead of running again, so the products equal those of a compile without it; reused products are shared
 * between the compilations.
 */
export async function compileContent(
  store: ContentStore,
  { measured = true, previous }: { readonly measured?: boolean; readonly previous?: ContentCompilation } = {},
): Promise<ContentCompilation> {
  const stages = new Map<string, { readonly key: string; readonly value: unknown }>();
  const done = () => Object.freeze(new Map(stages));
  try {
    const value = await compile(store, measured, createStageRunner(previous?.stages, stages));
    return Object.freeze({ ok: true as const, value, stages: done() });
  } catch (error) {
    if (error instanceof ContentLoadError)
      return Object.freeze({ ok: false as const, diagnostics: error.diagnostics, stages: done() });
    if (error instanceof CourseAssetError) return Object.freeze({ ...courseFailures([error]), stages: done() });
    throw error;
  }
}

/** One input of a stage: a file's bytes, or the key of an earlier stage or another identifying text. */
type StageInput = Uint8Array<ArrayBuffer> | string;

function createStageRunner(
  previous: CompileStages | undefined,
  next: Map<string, { readonly key: string; readonly value: unknown }>,
) {
  return async <T>(name: string, inputs: readonly StageInput[], run: () => Promise<T> | T) => {
    const parts = [name];
    for (const input of inputs) parts.push(typeof input === 'string' ? input : await contentDigest(input));
    const key = await contentDigest(new TextEncoder().encode(JSON.stringify(parts)));
    const earlier = previous?.get(name);
    const value = earlier?.key === key ? (earlier.value as T) : await run();
    next.set(name, Object.freeze({ key, value }));
    return { key, value };
  };
}
type Stage = ReturnType<typeof createStageRunner>;

/** The JSON value of saved bytes. */
function parseJson(bytes: Uint8Array): unknown {
  return JSON.parse(new TextDecoder().decode(bytes));
}

const deliveredFile = (kind: ContentKind, id: string, bytes: Uint8Array<ArrayBuffer>): DeliveredFile =>
  Object.freeze({ kind, id, bytes });

async function compile(store: ContentStore, measured: boolean, stage: Stage): Promise<CompiledContent> {
  // The files of a directory with an extension: each one's name, its path under `content/` and its bytes.
  const read = async (directory: string, extension = '.json') => {
    const files = [];
    for (const name of await store.list(directory))
      if (name.endsWith(extension))
        files.push({
          name,
          id: name.slice(0, name.length - extension.length),
          bytes: await store.read(`${directory}/${name}`),
        });
    return files;
  };
  type Read = Awaited<ReturnType<typeof read>>;
  const inputs = (files: Read) => files.flatMap((file) => [file.name, file.bytes]);
  // Each document's file name is its manifest identity; catalogs admit these sources as delivery does.
  const sources = async (directory: string, files: Read) => {
    const result: DocumentSource[] = [];
    for (const file of files)
      result.push(await authoredDocumentSource(file.id, `content/${directory}/${file.name}`, parseJson(file.bytes)));
    return result;
  };
  // Admitted documents are delivered as authored.
  const delivered = (kind: ContentKind, documents: readonly DocumentSource[]) =>
    documents.map((source) => deliveredFile(kind, source.id, encodeContentJson(source.value)));

  // The vehicle sprite library, assembled from one document per set.
  const spriteFiles = await read('sprites');
  const sprites = await stage('sprites', inputs(spriteFiles), () => {
    const library = compileVehicleSpriteLibrary(
      assembleVehicleSpriteLibrary(
        spriteFiles.map((file) => ({
          name: file.id,
          document: `content/sprites/${file.name}`,
          value: parseJson(file.bytes),
        })),
      ),
      'content/sprites',
    );
    return { library, files: [deliveredFile('image', 'vehicles', encodeContentJson(library.product))] };
  });

  // The text tiles are delivered as authored once admitted.
  const textTileBytes = await store.read('text-tiles/default.json');
  const textTiles = await stage('text-tiles', [textTileBytes], () => {
    const value = parseJson(textTileBytes);
    requireLoaded(admit('content/text-tiles/default.json', () => compileTextTiles(value)));
    return [deliveredFile('image', TEXT_TILES_ID, encodeContentJson(value))];
  });

  const materialFiles = await read('materials');
  const materials = await stage('materials', inputs(materialFiles), async () => {
    const documents = await sources('materials', materialFiles);
    return { catalog: requireLoaded(compileSurfaceMaterials(documents)), files: delivered('material', documents) };
  });

  // A catalog material without a surface sound and a surface sound for an unknown material are rejected here.
  const surfaceSoundFiles = await read('surface-sounds');
  const surfaceSounds = await stage('surface-sounds', [materials.key, ...inputs(surfaceSoundFiles)], async () => {
    const documents = await sources('surface-sounds', surfaceSoundFiles);
    resolveSurfaceSoundRecords(
      requireLoaded(compileSurfaceSounds(documents)),
      materials.value.catalog.source.materials.map((material) => material.id),
    );
    return delivered('surface-sound', documents);
  });

  // Each course's solid walls are admitted against the wall sounds below.
  const wallSoundFiles = await read('wall-sounds');
  const wallSounds = await stage('wall-sounds', inputs(wallSoundFiles), async () => {
    const documents = await sources('wall-sounds', wallSoundFiles);
    return { catalog: requireLoaded(compileWallSounds(documents)), files: delivered('wall-sound', documents) };
  });

  const audioFiles = await read('audio');
  const audio = await stage('audio', inputs(audioFiles), async () => {
    const documents = await sources('audio', audioFiles);
    requireLoaded(compileAudioSettings(documents));
    return delivered('audio', documents);
  });

  // Recordings are delivered as their authored bytes once admitted; music documents are admitted against them, with
  // titles that fit one line of the text grid.
  const recordingSources: RecordingSource[] = [];
  for (const group of RECORDING_GROUPS)
    for (const name of await store.list(group)) {
      if (group === 'music' && name.endsWith('.json')) continue;
      recordingSources.push({
        id: recordingId(group, name.replace(/\.[^.]*$/, '')),
        path: `content/${group}/${name}`,
        bytes: await store.read(`${group}/${name}`),
      });
    }
  const musicFiles = await read('music');
  const recordings = await stage(
    'recordings',
    [...recordingSources.flatMap((source) => [source.path, source.bytes]), ...inputs(musicFiles)],
    async () => {
      const admitted = requireLoaded(compileRecordings(recordingSources));
      const documents = await sources('music', musicFiles);
      requireLoaded(compileMusicCatalog(documents, TEXT_COLUMNS, admitted));
      return [
        ...recordingSources.map((source) => deliveredFile('recording', source.id, source.bytes)),
        ...delivered('music', documents),
      ];
    },
  );

  const freePlayFiles = await read('free-play');
  const freePlay = await stage('free-play', inputs(freePlayFiles), async () => {
    const documents = await sources('free-play', freePlayFiles);
    return { rules: requireLoaded(compileFreePlayRules(documents)), files: delivered('free-play', documents) };
  });

  const soundFiles = await read('engine-sounds');
  const sounds = await stage('engine-sounds', inputs(soundFiles), async () => {
    const documents = await sources('engine-sounds', soundFiles);
    return { catalog: requireLoaded(compileEngineSounds(documents)), files: delivered('engine-sound', documents) };
  });

  const vehicleFiles = await read('vehicles'),
    listingFiles = await read('vehicle-listings'),
    drivingFiles = await read('driving');
  const definitions = await stage(
    'definitions',
    [sprites.key, sounds.key, ...inputs(vehicleFiles), ...inputs(listingFiles), ...inputs(drivingFiles)],
    async () => {
      const vehicles = await sources('vehicles', vehicleFiles),
        listings = await sources('vehicle-listings', listingFiles),
        driving = await sources('driving', drivingFiles);
      const value = requireLoaded(
        compileVehicleDefinitions(sprites.value.library.sprites, sounds.value.catalog, driving, vehicles, listings),
      );
      return {
        definitions: value,
        files: [
          ...delivered('vehicle', vehicles),
          ...delivered('vehicle-listing', listings),
          ...delivered('driving', driving),
        ],
      };
    },
  );

  // Each course is its own stage: its document, the images it names, the materials and the wall sounds. A course and
  // its images are delivered only once the course compiles.
  const courses: { readonly key: string; readonly value: { compiled: CompiledCourse; files: DeliveredFile[] } }[] = [];
  for (const { name, bytes } of await read('courses', '.course.json')) {
    const path = `content/courses/${name}`;
    const imageBytes = [];
    for (const image of namedImages(bytes))
      imageBytes.push(image, await store.read(`images/${image}.json`).catch(() => image));
    courses.push(
      await stage(`course:${name}`, [materials.key, wallSounds.key, bytes, ...imageBytes], async () => {
        const document = requireLoaded(readCourseDocumentBytes(bytes, path));
        requireLoaded(admitCourseWallSounds(document, wallSounds.value.catalog, path));
        const prepared = await compileCourseImages(
          document,
          await readCourseImages(courseImageNames(document), (file) => store.read(`images/${file}`)),
        );
        const id = courseFileId(name);
        const compiled = requireLoaded(
          await compileCourseDocument(
            prepared.document,
            id,
            await courseFileSha256(prepared.document),
            prepared.images,
            materials.value.catalog,
            path,
          ),
        );
        return {
          compiled,
          files: [
            deliveredFile('course', id, encodeContentJson(prepared.document)),
            ...prepared.images.map((image) => deliveredFile('image', image.name, new Uint8Array(image.bytes))),
          ],
        };
      }),
    );
  }
  const compiledCourses = courses.map((course) => course.value.compiled);
  const courseKeys = courses.map((course) => course.key);
  const courseIndex = await stage('course-index', courseKeys, () => [
    deliveredFile('course-index', COURSE_INDEX_ID, encodeContentJson(courseIndexDocument(compiledCourses))),
  ]);

  // Every series course is admitted against its compiled course.
  const seriesFiles = await read('series', '.series.json');
  const series = await stage('series', [definitions.key, ...courseKeys, ...inputs(seriesFiles)], async () => {
    const documents = await sources('series', seriesFiles);
    const catalog = requireLoaded(
      compileSeriesCatalog(
        documents,
        compiledCourses.map((course) => course.id),
        definitions.value.definitions.vehicles,
      ),
    );
    const seriesCourses = compiledCourses.flatMap((course) => {
      const settings = catalog.courseSettings(course.id);
      if (!settings) return [];
      const source = documents.find((s) => s.id === settings.series.id)!;
      return [Object.freeze({ course, settings: requireLoaded(admitSeriesCourse(settings, course, source.path)) })];
    });
    return { seriesCourses: Object.freeze(seriesCourses), files: delivered('series', documents) };
  });

  const files: DeliveredFile[] = [
    ...sprites.value.files,
    ...textTiles.value,
    ...materials.value.files,
    ...surfaceSounds.value,
    ...wallSounds.value.files,
    ...audio.value,
    ...recordings.value,
    ...freePlay.value.files,
    ...sounds.value.files,
    ...definitions.value.files,
    ...courses.flatMap((course) => course.value.files),
    ...courseIndex.value,
    ...series.value.files,
  ];
  if (measured) {
    const envelopeFiles = await read('envelopes', ''),
      timeFiles = await read('reference-times', '');
    const products = await stage(
      'measured',
      [definitions.key, materials.key, series.key, ...inputs(envelopeFiles), ...inputs(timeFiles)],
      () => measuredFiles(store, definitions.value.definitions, materials.value.catalog, series.value.seriesCourses),
    );
    files.push(...products.value);
  }
  return Object.freeze({
    files: Object.freeze(files),
    library: sprites.value.library,
    materials: materials.value.catalog,
    freePlay: freePlay.value.rules,
    definitions: definitions.value.definitions,
    courses: Object.freeze(compiledCourses),
    seriesCourses: series.value.seriesCourses,
  });
}

/** The image names a course document's bytes use, read leniently: only to key the course's stage. */
function namedImages(bytes: Uint8Array): string[] {
  const names = new Set<string>();
  const visit = (value: unknown, key: string) => {
    if (typeof value === 'string' && ['image', 'airborne', 'landed'].includes(key)) names.add(value);
    else if (Array.isArray(value)) for (const item of value) visit(item, '');
    else if (value && typeof value === 'object') for (const [k, item] of Object.entries(value)) visit(item, k);
  };
  try {
    visit(parseJson(bytes), '');
  } catch {
    return [];
  }
  return [...names].filter((name) => /^[a-zA-Z0-9_-][a-zA-Z0-9_.-]*$/.test(name));
}

/**
 * The measured products: each catalog vehicle's delivered envelope and, for each series course it is a candidate of,
 * its time budgets and pace schedule, from the saved measurements. Every saved file must be current and owned; the
 * series' margin applies to the saved times here.
 */
async function measuredFiles(
  store: ContentStore,
  definitions: VehicleDefinitions,
  materials: SurfaceMaterialCatalog,
  seriesCourses: CompiledContent['seriesCourses'],
): Promise<DeliveredFile[]> {
  const files: DeliveredFile[] = [];
  const add = (kind: ContentKind, id: string, bytes: Uint8Array<ArrayBuffer>) =>
    files.push(Object.freeze({ kind, id, bytes }));
  const json = async (path: string) => parseJson(await store.read(path));
  const measurementSha256 = await procedureSha256(ENVELOPE_MEASUREMENT),
    referenceSha256 = await procedureSha256(REFERENCE_RUN);
  const vehicleSha256 = new Map<string, string>();
  for (const entry of definitions.vehicles)
    vehicleSha256.set(
      entry.compiledVehicle.id,
      await sessionVehicleSha256(createSessionVehicle(entry, definitions.driving), materials),
    );
  // Every saved measurement belongs to a catalog vehicle or a series course, and each of those has its own.
  const owned = new Set([
    ...definitions.vehicles.map((entry) => measuredEnvelopePath(entry.compiledVehicle.id)),
    ...seriesCourses.map(({ course }) => referenceTimesPath(course.id)),
  ]);
  const saved = new Set<string>();
  for (const directory of ['envelopes', 'reference-times'])
    for (const name of await store.list(directory)) saved.add(`${directory}/${name}`);
  for (const path of saved)
    if (!owned.has(path))
      requireLoaded(
        admit(`content/${path}`, () => staleMeasurement('', 'No catalog vehicle or series course owns it')),
      );
  const savedJson = async (path: string) => {
    if (!saved.has(path)) requireLoaded(admit(`content/${path}`, () => staleMeasurement('', 'It is absent')));
    return json(path);
  };
  const times = new Map<string, SavedReferenceTimes>();
  for (const { course, settings } of seriesCourses) {
    const path = referenceTimesPath(course.id);
    const candidates = settings.series.vehicles.map((vehicleId) => ({
      vehicleId,
      vehicleSha256: vehicleSha256.get(vehicleId)!,
    }));
    times.set(
      course.id,
      requireLoaded(
        readSavedReferenceTimes(course, candidates, referenceSha256, await savedJson(path), `content/${path}`),
      ),
    );
  }
  for (const entry of definitions.vehicles) {
    const id = entry.compiledVehicle.id,
      sha256 = vehicleSha256.get(id)!,
      path = measuredEnvelopePath(id);
    const saved = requireLoaded(readSavedEnvelope(sha256, measurementSha256, await savedJson(path), `content/${path}`));
    add('envelope', id, encodeContentJson(deliveredEnvelope(saved)));
    for (const { course, settings } of seriesCourses) {
      const vehicle = times.get(course.id)!.vehicles.find((candidate) => candidate.vehicleId === id);
      if (!vehicle) continue;
      const budget = courseTimeBudgetsProduct(course, sha256, referenceTimes(vehicle), settings.series.timeMargin);
      requireLoaded(readCourseTimeBudgets(course, sha256, budget, `budgets/${course.id}/${id}.json`));
      add('budget', `${course.id}/${id}`, encodeContentJson(budget));
      add(
        'schedule',
        `${course.id}/${id}`,
        encodeContentJson(deliveredSchedule(course.identity.buildSha256, sha256, vehicle.schedule)),
      );
    }
  }
  return files;
}
