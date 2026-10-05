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
import { compileVehicleSpriteLibrary } from '../graphics/vehicle-sprite-library.js';
import { compileCourseImages } from '../course/compile-course-images.js';
import { readCourseImages } from '../course/read-course-images.js';
import { courseFileId, courseFileSha256 } from '../course/course-file-id.js';
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
 * the wall sounds) and their images, the course index, then series. Each stage receives earlier products directly and
 * admits its documents as delivery does. An expected content error ends compilation with its diagnostics and no
 * product; other failures, store reads included, propagate.
 */
export async function compileContent(store: ContentStore): Promise<ContentCompilation> {
  try {
    return Object.freeze({ ok: true as const, value: await compile(store) });
  } catch (error) {
    if (error instanceof ContentLoadError) return Object.freeze({ ok: false as const, diagnostics: error.diagnostics });
    if (error instanceof CourseAssetError) return courseFailures([error]);
    throw error;
  }
}

async function compile(store: ContentStore): Promise<CompiledContent> {
  const files: DeliveredFile[] = [];
  const add = (kind: ContentKind, id: string, bytes: Uint8Array<ArrayBuffer>) =>
    files.push(Object.freeze({ kind, id, bytes }));
  const json = async (path: string) => JSON.parse(new TextDecoder().decode(await store.read(path))) as unknown;

  const library = compileVehicleSpriteLibrary(await json('sprites/vehicles.json'), 'content/sprites/vehicles.json');
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
