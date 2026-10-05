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
import { readCourseDocumentBytes } from '../../src/course/course-document.js';
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
import type { ContentStore } from './content-store.js';

/** One delivered file: its manifest kind and ID and its exact bytes, which belong to the caller alone. */
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

export type ContentCompilation =
  | { readonly ok: true; readonly value: CompiledContent }
  | { readonly ok: false; readonly diagnostics: readonly ContentLoadDiagnostic[] };

/**
 * The authoring core: compile the authored documents of `store` into every delivered file, in dependency order and in
 * one pass: vehicle sprite library, text tiles, materials, surface sounds, wall sounds, audio settings, recordings and
 * music, FREE PLAY rules, engine sounds, vehicle and driving definitions, courses (their walls' sounds admitted against
 * the wall sounds) and their images, the course index, series, then the measured products: each catalog vehicle's
 * envelope and each series course's time budgets and pace schedules from the saved measurements, which must be current.
 * Each stage receives earlier products directly and admits its documents as delivery does. With `measured: false` it
 * stops before the measured products, for tools that produce them or do not use them. An expected content error ends compilation with its diagnostics and no
 * product; other failures, store reads included, propagate.
 */
export async function compileContent(
  store: ContentStore,
  { measured = true }: { readonly measured?: boolean } = {},
): Promise<ContentCompilation> {
  try {
    return Object.freeze({ ok: true as const, value: await compile(store, measured) });
  } catch (error) {
    if (error instanceof ContentLoadError) return Object.freeze({ ok: false as const, diagnostics: error.diagnostics });
    if (error instanceof CourseAssetError) return courseFailures([error]);
    throw error;
  }
}

/** The JSON value saved at `path`. */
async function readJson(store: ContentStore, path: string): Promise<unknown> {
  return JSON.parse(new TextDecoder().decode(await store.read(path)));
}

async function compile(store: ContentStore, measured: boolean): Promise<CompiledContent> {
  const files: DeliveredFile[] = [];
  const add = (kind: ContentKind, id: string, bytes: Uint8Array<ArrayBuffer>) =>
    files.push(Object.freeze({ kind, id, bytes }));
  const json = (path: string) => readJson(store, path);

  // The vehicle sprite library, assembled from one document per set.
  const setDocuments = [];
  for (const name of await store.list('sprites'))
    if (name.endsWith('.json'))
      setDocuments.push({
        name: name.slice(0, -'.json'.length),
        document: `content/sprites/${name}`,
        value: await json(`sprites/${name}`),
      });
  const library = compileVehicleSpriteLibrary(assembleVehicleSpriteLibrary(setDocuments), 'content/sprites');
  add('image', 'vehicles', encodeContentJson(library.product));

  // The text tiles are delivered as authored once admitted.
  const textTiles = await json('text-tiles/default.json');
  requireLoaded(admit('content/text-tiles/default.json', () => compileTextTiles(textTiles)));
  add('image', TEXT_TILES_ID, encodeContentJson(textTiles));

  // Each document's file name is its manifest identity; catalogs admit these sources as delivery does.
  const sources = async (directory: string, extension = '.json') => {
    const result: DocumentSource[] = [];
    for (const name of await store.list(directory)) {
      if (!name.endsWith(extension)) continue;
      const path = `${directory}/${name}`;
      result.push(await authoredDocumentSource(name.slice(0, -extension.length), `content/${path}`, await json(path)));
    }
    return result;
  };
  // Admitted documents are delivered as authored.
  const deliver = (kind: ContentKind, documents: readonly DocumentSource[]) => {
    for (const source of documents) add(kind, source.id, encodeContentJson(source.value));
  };
  const materialSources = await sources('materials');
  const materials = requireLoaded(compileSurfaceMaterials(materialSources));
  deliver('material', materialSources);

  // A catalog material without a surface sound and a surface sound for an unknown material are rejected here.
  const surfaceSoundSources = await sources('surface-sounds');
  const surfaceSounds = requireLoaded(compileSurfaceSounds(surfaceSoundSources));
  resolveSurfaceSoundRecords(
    surfaceSounds,
    materials.source.materials.map((material) => material.id),
  );
  deliver('surface-sound', surfaceSoundSources);

  // Each course's solid walls are admitted against the wall sounds below.
  const wallSoundSources = await sources('wall-sounds');
  const wallSounds = requireLoaded(compileWallSounds(wallSoundSources));
  deliver('wall-sound', wallSoundSources);

  const audioSources = await sources('audio');
  requireLoaded(compileAudioSettings(audioSources));
  deliver('audio', audioSources);

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
  const recordings = requireLoaded(compileRecordings(recordingSources));
  const musicSources = await sources('music');
  requireLoaded(compileMusicCatalog(musicSources, TEXT_COLUMNS, recordings));
  for (const source of recordingSources) add('recording', source.id, source.bytes);
  deliver('music', musicSources);

  const freePlaySources = await sources('free-play');
  const freePlay = requireLoaded(compileFreePlayRules(freePlaySources));
  deliver('free-play', freePlaySources);

  const soundSources = await sources('engine-sounds');
  const sounds = requireLoaded(compileEngineSounds(soundSources));
  deliver('engine-sound', soundSources);

  const vehicleSources = await sources('vehicles'),
    listingSources = await sources('vehicle-listings'),
    drivingSources = await sources('driving');
  const definitions = requireLoaded(
    compileVehicleDefinitions(library.sprites, sounds, drivingSources, vehicleSources, listingSources),
  );
  deliver('vehicle', vehicleSources);
  deliver('vehicle-listing', listingSources);
  deliver('driving', drivingSources);

  // A course and its images are delivered only once the course compiles.
  const courses: CompiledCourse[] = [];
  for (const name of await store.list('courses')) {
    if (!name.endsWith('.course.json')) continue;
    const path = `content/courses/${name}`;
    const document = requireLoaded(readCourseDocumentBytes(await store.read(`courses/${name}`), path));
    requireLoaded(admitCourseWallSounds(document, wallSounds, path));
    const prepared = await compileCourseImages(
      document,
      await readCourseImages(document.assets, (file) => store.read(`images/${file}`)),
    );
    const id = courseFileId(name);
    const compiled = requireLoaded(
      await compileCourseDocument(
        prepared.document,
        id,
        await courseFileSha256(prepared.document),
        prepared.images,
        materials,
        path,
      ),
    );
    add('course', id, encodeContentJson(prepared.document));
    for (const image of prepared.images) add('image', image.sha256, new Uint8Array(image.bytes));
    courses.push(compiled);
  }
  add('course-index', COURSE_INDEX_ID, encodeContentJson(courseIndexDocument(courses)));

  // Every series course is admitted against its compiled course.
  const seriesSources = await sources('series', '.series.json');
  const series = requireLoaded(
    compileSeriesCatalog(
      seriesSources,
      courses.map((course) => course.id),
      definitions.vehicles,
    ),
  );
  const seriesCourses = courses.flatMap((course) => {
    const settings = series.courseSettings(course.id);
    if (!settings) return [];
    const source = seriesSources.find((s) => s.id === settings.series.id)!;
    return [Object.freeze({ course, settings: requireLoaded(admitSeriesCourse(settings, course, source.path)) })];
  });
  deliver('series', seriesSources);
  if (measured) files.push(...(await measuredFiles(store, definitions, materials, seriesCourses)));
  return Object.freeze({
    files: Object.freeze(files),
    library,
    materials,
    freePlay,
    definitions,
    courses: Object.freeze(courses),
    seriesCourses: Object.freeze(seriesCourses),
  });
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
  const json = (path: string) => readJson(store, path);
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
