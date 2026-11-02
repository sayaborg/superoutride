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
import { admitSeriesClass, compileSeriesCatalog, type SeriesClass } from '../../src/content/series-catalog.js';
import { courseImageNames, readCourseDocumentBytes } from '../../src/course/course-document.js';
import { CourseAssetError, courseFailures } from '../../src/course/course-diagnostics.js';
import type { SurfaceMaterialCatalog } from '../../src/course/surface-material.js';
import { compileSurfaceMaterials } from '../../src/content/surface-material-catalog.js';
import { resolveSurfaceSoundRecords } from '../../src/audio/surface-sounds.js';
import { compileSurfaceSounds } from '../../src/content/surface-sound-catalog.js';
import { compileAudioSettings } from '../../src/content/audio-catalog.js';
import type { CompiledAudioSettings } from '../../src/audio/audio-document.js';
import { ENGINE_LOUDNESS_ID, engineLoudnessSources, readEngineLoudness } from '../../src/content/engine-loudness.js';
import { ENGINE_LOUDNESS_PATH, engineLoudnessProcedureSha256 } from './engine-loudness.js';
import { compileFreePlayRules, type FreePlayRules } from '../../src/content/free-play-rules.js';
import { admitPuffPicture, compilePuffs, puffPictureNames } from '../../src/content/puff-catalog.js';
import { readSpriteLodAsset, type SpriteLodAsset } from '../../src/image/sprite.js';
import { CONTACT_EXPLOSION_PICTURES } from '../../src/content/contact-explosion-pictures.js';
import { admit } from '../../src/core/admission.js';
import { compileTextTiles } from '../../src/image/text-tiles.js';
import { TEXT_TILES_ID } from '../../src/content/text-tiles-catalog.js';
import { compileScreenPictures, SCREEN_PICTURES_DIRECTORY } from '../../src/content/screen-picture-catalog.js';
import { COURSE_INDEX_ID, courseIndexDocument } from '../../src/content/course-index.js';
import { RECORDING_GROUPS, recordingId } from '../../src/audio/recordings.js';
import { compileMusicCatalog, compileRecordings, type RecordingSource } from '../../src/content/recording-catalog.js';
import { TEXT_COLUMNS } from '../../src/view/text-layer.js';
import { assembleVehicleSpriteLibrary } from '../graphics/vehicle-sprite-sets.js';
import { compileCourseImages } from '../course/compile-course-images.js';
import { readCourseImages } from '../course/read-course-images.js';
import { courseFileSha256 } from '../course/course-file-id.js';
import { createRunVehicle, runVehicleSha256 } from '../../src/content/run-vehicle.js';
import { readCourseTimeBudgets } from '../../src/content/course-time-budgets.js';
import { procedureSha256 } from '../course/procedure.js';
import { referenceProcedure } from '../course/reference-run.js';
import { RACING_LINE_PROCEDURE } from '../course/racing-line.js';
import { courseReferenceTimesProduct } from '../course/course-reference.js';
import {
  deliveredSchedule,
  measuredCourses,
  racingLinePath,
  readSavedRacingLines,
  racingLineVehicles,
  readSavedReferenceTimes,
  referenceTimes,
  referenceTimesPath,
  staleMeasurement,
  type SavedReferenceTimes,
} from '../course/measured-products.js';
import { contentDigest } from '../../src/core/content-digest.js';
import type { ContentStore } from './content-store.js';
import { imagePath, inOriginalsPlace, readContentPlaces } from './content-places.js';

/** One delivered file: its manifest kind and ID and its exact bytes, which callers read and never modify. */
export interface DeliveredFile {
  readonly kind: ContentKind;
  readonly id: string;
  readonly bytes: Uint8Array<ArrayBuffer>;
}

/** The delivered files in delivery order, with the compiled products later stages and tools consume. */
export interface CompiledContent {
  readonly files: readonly DeliveredFile[];
  readonly library: ReturnType<typeof assembleVehicleSpriteLibrary>;
  readonly materials: SurfaceMaterialCatalog;
  readonly freePlay: FreePlayRules;
  readonly definitions: VehicleDefinitions;
  /** The game-wide sound settings, which the engine loudness is measured with. */
  readonly audio: CompiledAudioSettings;
  readonly courses: readonly CompiledCourse[];
  /** Each series course with its admitted series settings. */
  readonly seriesClasses: readonly { readonly course: CompiledCourse; readonly settings: SeriesClass }[];
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
 * one pass: vehicle sprite library, text tiles, materials, surface sounds, puffs, audio settings, recordings and
 * music, FREE PLAY rules, engine sounds, vehicle and driving definitions, courses (their walls' sounds admitted against
 * the wall sounds) and their images, the course index, series, then the measured products: each course's racing lines
 * and each series course's time budgets and pace schedules from the saved measurements, which must be current.
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

/** The JSON value of a saved document's bytes; bytes that are not UTF-8 JSON are an input error of that document. */
function parseJson(bytes: Uint8Array, document: string): unknown {
  try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch (error) {
    if (!(error instanceof SyntaxError || error instanceof TypeError)) throw error;
    throw new ContentLoadError([
      Object.freeze({ kind: 'input' as const, code: 'parse_failure', document, path: '', message: error.message }),
    ]);
  }
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
  // Where each course and image lies: in its hand-made place or the originals'.
  const places = await readContentPlaces(store);
  const inputs = (files: Read) => files.flatMap((file) => [file.name, file.bytes]);
  // Each document's file name is its manifest identity; catalogs admit these sources as delivery does.
  const sources = async (directory: string, files: Read) => {
    const result: DocumentSource[] = [];
    for (const file of files) {
      const document = `content/${directory}/${file.name}`;
      result.push(await authoredDocumentSource(file.id, document, parseJson(file.bytes, document)));
    }
    return result;
  };
  // Admitted documents are delivered as authored.
  const delivered = (kind: ContentKind, documents: readonly DocumentSource[]) =>
    documents.map((source) => deliveredFile(kind, source.id, encodeContentJson(source.value)));

  // The vehicle sprite library, assembled from one document per set.
  const spriteFiles = await read('sprites');
  const sprites = await stage('sprites', inputs(spriteFiles), () => {
    const library = assembleVehicleSpriteLibrary(
      spriteFiles.map((file) => ({
        name: file.id,
        document: `content/sprites/${file.name}`,
        value: parseJson(file.bytes, `content/sprites/${file.name}`),
      })),
      'content/sprites',
    );
    return { library, files: [deliveredFile('image', 'vehicles', encodeContentJson(library.library))] };
  });

  // The text tiles are delivered as authored once admitted.
  const textTileBytes = await store.read('text-tiles/default.json');
  const textTiles = await stage('text-tiles', [textTileBytes], () => {
    const value = parseJson(textTileBytes, 'content/text-tiles/default.json');
    requireLoaded(admit('content/text-tiles/default.json', () => compileTextTiles(value)));
    return [deliveredFile('image', TEXT_TILES_ID, encodeContentJson(value))];
  });

  // The screen pictures are delivered as authored once admitted; series name their images among them.
  const screenPictureFiles = await read(SCREEN_PICTURES_DIRECTORY);
  const screenPictures = await stage('screen-pictures', inputs(screenPictureFiles), async () => {
    const documents = await sources(SCREEN_PICTURES_DIRECTORY, screenPictureFiles);
    return { catalog: requireLoaded(compileScreenPictures(documents)), files: delivered('screen-picture', documents) };
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

  // The puffs, admitted against the material catalog with the pictures they name; delivered with those pictures.
  const puffFiles = await read('puffs');
  // A picture the store does not hold is left to the document's admission, which names it.
  const puffPictures = new Map<string, Uint8Array<ArrayBuffer> | null>();
  for (const name of new Set(puffFiles.flatMap((file) => puffPictureNames(parseJsonLeniently(file.bytes)))))
    puffPictures.set(name, await store.read(imagePath(places, name)).catch(() => null));
  const puffs = await stage(
    'puffs',
    [materials.key, ...inputs(puffFiles), ...[...puffPictures].flat().map((input) => input ?? '')],
    async () => {
      const documents = await sources('puffs', puffFiles);
      const pictures = new Map<string, SpriteLodAsset>();
      const pictureFiles: DeliveredFile[] = [];
      for (const [name, bytes] of puffPictures) {
        if (!bytes) continue;
        const document = `content/${imagePath(places, name)}`;
        const value = parseJson(bytes, document);
        pictures.set(name, requireLoaded(admitPuffPicture(value, document)));
        pictureFiles.push(deliveredFile('image', name, encodeContentJson(value)));
      }
      requireLoaded(
        compilePuffs(
          documents,
          materials.value.catalog.source.materials.map((material) => material.id),
          pictures,
        ),
      );
      return [...delivered('puffs', documents), ...pictureFiles];
    },
  );

  const explosionSources = await Promise.all(
    CONTACT_EXPLOSION_PICTURES.map(async (name) => ({
      name,
      bytes: await store.read(imagePath(places, name)),
    })),
  );
  const explosions = await stage(
    'contact-explosion-pictures',
    explosionSources.flatMap(({ name, bytes }) => [name, bytes]),
    () =>
      explosionSources.map(({ name, bytes }) => {
        const document = `content/${imagePath(places, name)}`,
          value = parseJson(bytes, document);
        requireLoaded(admit(document, () => readSpriteLodAsset(value)));
        return deliveredFile('image', name, encodeContentJson(value));
      }),
  );

  const audioFiles = await read('audio');
  const audio = await stage('audio', inputs(audioFiles), async () => {
    const documents = await sources('audio', audioFiles);
    return { settings: requireLoaded(compileAudioSettings(documents)), files: delivered('audio', documents) };
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
      return {
        tracks: requireLoaded(compileMusicCatalog(documents, TEXT_COLUMNS, admitted)),
        files: [
          ...recordingSources.map((source) => deliveredFile('recording', source.id, source.bytes)),
          ...delivered('music', documents),
        ],
      };
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
  for (const [id, file] of places.courses) {
    const path = `content/${file}`,
      bytes = await store.read(file);
    const imageBytes = [];
    for (const image of namedImages(bytes))
      imageBytes.push(image, await store.read(imagePath(places, image)).catch(() => image));
    courses.push(
      await stage(`course:${file}`, [materials.key, bytes, ...imageBytes], async () => {
        const document = requireLoaded(readCourseDocumentBytes(bytes, path));
        const prepared = await compileCourseImages(
          document,
          await readCourseImages(courseImageNames(document), (name) =>
            store.read(imagePath(places, name.slice(0, -'.json'.length))),
          ),
        );
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
    deliveredFile(
      'course-index',
      COURSE_INDEX_ID,
      encodeContentJson(
        courseIndexDocument(
          compiledCourses,
          new Set([...places.courses].filter(([, path]) => inOriginalsPlace(path)).map(([id]) => id)),
        ),
      ),
    ),
  ]);

  // Every class is admitted against its compiled course.
  const seriesFiles = await read('series', '.series.json');
  const series = await stage(
    'series',
    [definitions.key, screenPictures.key, recordings.key, ...courseKeys, ...inputs(seriesFiles)],
    async () => {
      const documents = await sources('series', seriesFiles);
      const catalog = requireLoaded(
        compileSeriesCatalog(
          documents,
          compiledCourses.map((course) => course.id),
          definitions.value.definitions.vehicles,
          screenPictures.value.catalog,
          recordings.value.tracks,
        ),
      );
      const seriesClasses = catalog.series.flatMap((series) => {
        const source = documents.find((s) => s.id === series.id)!;
        return series.classes.map((settings) => {
          const course = compiledCourses.find((c) => c.id === settings.course)!;
          return Object.freeze({
            course,
            settings: requireLoaded(
              admitSeriesClass(settings, course, definitions.value.definitions.vehicles, source.path),
            ),
          });
        });
      });
      return { seriesClasses: Object.freeze(seriesClasses), files: delivered('series', documents) };
    },
  );

  const files: DeliveredFile[] = [
    ...sprites.value.files,
    ...textTiles.value,
    ...screenPictures.value.files,
    ...materials.value.files,
    ...surfaceSounds.value,
    ...puffs.value,
    ...explosions.value,
    ...audio.value.files,
    ...recordings.value.files,
    ...freePlay.value.files,
    ...sounds.value.files,
    ...definitions.value.files,
    ...courses.flatMap((course) => course.value.files),
    ...courseIndex.value,
    ...series.value.files,
  ];
  if (measured) {
    const timeFiles = await read('reference-times', ''),
      lineFiles = await read('racing-lines', ''),
      loudnessFiles = await read('engine-loudness', '');
    const products = await stage(
      'measured',
      [
        definitions.key,
        materials.key,
        audio.key,
        series.key,
        ...courses.map((course) => course.key),
        ...inputs(timeFiles),
        ...inputs(lineFiles),
        ...inputs(loudnessFiles),
      ],
      () =>
        measuredFiles(
          store,
          definitions.value.definitions,
          materials.value.catalog,
          audio.value.settings,
          series.value.seriesClasses,
          compiledCourses,
        ),
    );
    files.push(...products.value);
  }
  return Object.freeze({
    files: Object.freeze(files),
    library: sprites.value.library,
    materials: materials.value.catalog,
    freePlay: freePlay.value.rules,
    definitions: definitions.value.definitions,
    audio: audio.value.settings,
    courses: Object.freeze(compiledCourses),
    seriesClasses: series.value.seriesClasses,
  });
}

/** A saved document's JSON value, or null for bytes that are not: only to find what a stage reads. */
function parseJsonLeniently(bytes: Uint8Array): unknown {
  try {
    return parseJson(bytes, '');
  } catch {
    return null;
  }
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
    visit(parseJson(bytes, ''), '');
  } catch {
    return [];
  }
  return [...names].filter((name) => /^[a-zA-Z0-9_-][a-zA-Z0-9_.-]*$/.test(name));
}

/**
 * The measured products: each course's racing lines and, for each course a class runs, the reference times and pace schedule of each vehicle a class runs there, from the saved measurements,
 * each delivered once, and the engine loudness, delivered as saved. Every saved file must be current and owned. A run
 * applies its class's margin to the delivered times.
 */
async function measuredFiles(
  store: ContentStore,
  definitions: VehicleDefinitions,
  materials: SurfaceMaterialCatalog,
  audio: CompiledAudioSettings,
  seriesClasses: CompiledContent['seriesClasses'],
  compiledCourses: readonly CompiledCourse[],
): Promise<DeliveredFile[]> {
  const files: DeliveredFile[] = [];
  const add = (kind: ContentKind, id: string, bytes: Uint8Array<ArrayBuffer>) =>
    files.push(Object.freeze({ kind, id, bytes }));
  const json = async (path: string) => parseJson(await store.read(path), `content/${path}`);
  // Reference runs drive the racing lines, so their procedure holds the lines' procedure.
  const referenceSha256 = await procedureSha256(referenceProcedure(RACING_LINE_PROCEDURE));
  const vehicleSha256 = new Map<string, string>();
  for (const entry of definitions.vehicles)
    vehicleSha256.set(
      entry.compiledVehicle.id,
      await runVehicleSha256(createRunVehicle(entry, definitions.driving), materials),
    );
  const courses = measuredCourses(
    seriesClasses,
    definitions.vehicles.map((entry) => entry.compiledVehicle.id),
  );
  // Every saved measurement belongs to a course, and each course has its own.
  const owned = new Set([
    ...courses.map(({ course }) => referenceTimesPath(course.id)),
    ...compiledCourses.map((course) => racingLinePath(course.id)),
    ENGINE_LOUDNESS_PATH,
  ]);
  const saved = new Set<string>();
  for (const directory of ['reference-times', 'racing-lines', 'engine-loudness'])
    for (const name of await store.list(directory)) saved.add(`${directory}/${name}`);
  for (const path of saved)
    if (!owned.has(path))
      requireLoaded(admit(`content/${path}`, () => staleMeasurement('', 'Nothing measured owns it')));
  const savedJson = async (path: string) => {
    if (!saved.has(path)) requireLoaded(admit(`content/${path}`, () => staleMeasurement('', 'It is absent')));
    return json(path);
  };
  const loudness = await savedJson(ENGINE_LOUDNESS_PATH);
  requireLoaded(
    readEngineLoudness(
      loudness,
      engineLoudnessSources(definitions.vehicles, audio.sha256),
      `content/${ENGINE_LOUDNESS_PATH}`,
      {
        procedureSha256: await engineLoudnessProcedureSha256(),
        mismatch: staleMeasurement,
      },
    ),
  );
  add('engine-loudness', ENGINE_LOUDNESS_ID, encodeContentJson(loudness));
  const lineSha256 = await procedureSha256(RACING_LINE_PROCEDURE);
  const catalog = definitions.vehicles.map((entry) => entry.compiledVehicle.id);
  for (const course of compiledCourses) {
    const path = racingLinePath(course.id);
    const timing = racingLineVehicles(course.id, seriesClasses, catalog).map((vehicleId) => ({
      vehicleId,
      vehicleSha256: vehicleSha256.get(vehicleId)!,
    }));
    const lines = requireLoaded(
      readSavedRacingLines(course, lineSha256, timing, await savedJson(path), `content/${path}`),
    );
    add('racing-line', course.id, encodeContentJson(lines));
  }
  const times = new Map<string, SavedReferenceTimes>();
  for (const { course, vehicles } of courses) {
    const path = referenceTimesPath(course.id);
    const candidates = vehicles.map((vehicleId) => ({
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
      sha256 = vehicleSha256.get(id)!;
    for (const { course } of courses) {
      const vehicle = times.get(course.id)!.vehicles.find((candidate) => candidate.vehicleId === id);
      if (!vehicle) continue;
      const product = courseReferenceTimesProduct(course, sha256, referenceTimes(vehicle));
      // The delivered times admit as a run admits them, here with no margin.
      requireLoaded(readCourseTimeBudgets(course, sha256, 1, product, `reference-times/${course.id}/${id}.json`));
      add('reference-times', `${course.id}/${id}`, encodeContentJson(product));
      add(
        'schedule',
        `${course.id}/${id}`,
        encodeContentJson(deliveredSchedule(course.identity.buildSha256, sha256, vehicle.schedule)),
      );
    }
  }
  return files;
}
