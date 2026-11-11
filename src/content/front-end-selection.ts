import {
  admit,
  readDocument,
  readIdentified,
  readRecord,
  readString,
  requireAdmission,
  type AdmissionResult,
} from '../core/admission.js';
import { COURSE_DOCUMENT_LIMITS, COURSE_TEXT_LIMITS } from '../course/course-limits.js';
import type { MusicTrack } from '../audio/music-document.js';
import type { TilePicture } from '../image/tile-picture.js';
import type { ContentDelivery } from './content-delivery.js';
import { requireLoaded } from './content-load-error.js';
import { courseTextString } from './course-texts.js';
import { admitSingleDocument, type DocumentSource } from './document-catalog.js';
import type { MusicCatalog } from './recording-catalog.js';
import { SERIES_IMAGE, type ScreenPictureCatalog } from './screen-picture-catalog.js';
import type { CompiledSeries, SeriesCatalog } from './series-catalog.js';

/** The single front end selection document's identifier: its file name and manifest ID. */
export const FRONT_END_SELECTION_ID = 'selection';
/** The directory under `content/` that holds it. */
export const FRONT_END_DIRECTORY = 'front-end';
export const FRONT_END_SELECTION_FORMAT = Object.freeze({
  format: 'superoutride.front-end-selection',
  version: 3,
} as const);

/** The saved document: the series SELECT SERIES offers and FREE PLAY's groups of courses, each in its order. */
export interface FrontEndSelectionDocument {
  /**
   * Each series by its ID. A series without a document yet names what its document will hold, its title track, title
   * and description; one with a document names none of them (null).
   */
  readonly series: readonly {
    readonly id: string;
    readonly music: string | null;
    readonly title: string | null;
    readonly description: string | null;
  }[];
}

/** A series SELECT SERIES shows: its picture, its document (null before it has one), title track, name and description. */
export interface SelectableSeries {
  readonly id: string;
  /** The screen picture named by the series' ID: 40×30 tiles and opaque. */
  readonly picture: TilePicture;
  readonly series: CompiledSeries | null;
  readonly titleTrack: MusicTrack;
  readonly name: string;
  readonly description: string;
}

/** The admitted selection: the series shown and the listed series without a picture yet. */
export interface FrontEndSelection {
  /** SELECT SERIES' series with a picture, in the document's order, then the DEV series with one in document order. */
  seriesRow(dev: boolean): readonly SelectableSeries[];
  /** How many listed series have no picture yet and are not shown. */
  readonly unpictured: number;
}

/**
 * Admit the `superoutride.front-end-selection` version 3 document: series IDs unique, each with its music ID, title and
 * description, or none of them.
 */
export function readFrontEndSelection(value: unknown, document = ''): AdmissionResult<FrontEndSelectionDocument> {
  return admit(document, () => {
    const data = readDocument(
      value,
      ['format', 'version', 'series'],
      FRONT_END_SELECTION_FORMAT.format,
      FRONT_END_SELECTION_FORMAT.version,
    );
    const id = { maxLength: COURSE_DOCUMENT_LIMITS.idCodeUnits };
    const series = readIdentified(data.series, '/series', (item, at) => {
      const entry = readRecord(item, at, ['id', 'music', 'title', 'description']);
      const text = (key: 'title' | 'description', limit: number) =>
        entry[key] === null ? null : courseTextString(entry[key], `${at}/${key}`, limit);
      return Object.freeze({
        id: readString(entry.id, `${at}/id`, id),
        music: entry.music === null ? null : readString(entry.music, `${at}/music`, id),
        title: text('title', COURSE_TEXT_LIMITS.nameCodeUnits),
        description: text('description', COURSE_TEXT_LIMITS.descriptionCodeUnits),
      });
    });
    return Object.freeze({ series: Object.freeze(series) });
  });
}

/**
 * Admit the selection against the content: a listed series shows when the screen picture of its ID exists, which is
 * then 40×30 tiles and opaque; a series with a document takes its title track from it and lists no music, and one
 * without names a delivered track; a DEV series is not listed, and every other series document is.
 */
export function compileFrontEndSelection(
  source: DocumentSource,
  series: SeriesCatalog,
  pictures: ScreenPictureCatalog,
  music: MusicCatalog,
): AdmissionResult<FrontEndSelection> {
  const read = readFrontEndSelection(source.value, source.path);
  if (!read.ok) return read;
  const document = read.value;
  return admit(source.path, () => {
    const listed: SelectableSeries[] = [];
    let unpictured = 0;
    document.series.forEach((entry, i) => {
      const at = `/series/${i}`;
      const compiled = series.series.find((s) => s.id === entry.id) ?? null;
      requireAdmission(!compiled?.dev, 'invalid_value', `${at}/id`, `DEV series ${entry.id} is not listed`);
      for (const key of ['music', 'title', 'description'] as const)
        requireAdmission(
          (compiled === null) !== (entry[key] === null),
          'invalid_value',
          `${at}/${key}`,
          compiled
            ? `Series ${entry.id} takes its title track, title and description from its document`
            : `Series ${entry.id} has no document yet and names its title track, title and description`,
        );
      const titleTrack = compiled?.music.title ?? music.find((track) => track.id === entry.music);
      requireAdmission(titleTrack !== undefined, 'unresolved_reference', `${at}/music`, `Unknown track ${entry.music}`);
      const picture = pictures.get(entry.id);
      if (!picture) {
        unpictured++;
        return;
      }
      requireAdmission(
        picture.columns === SERIES_IMAGE.columns && picture.rows === SERIES_IMAGE.rows && picture.opaque,
        'invalid_value',
        `${at}/id`,
        `The picture ${entry.id} is an opaque ${SERIES_IMAGE.columns}×${SERIES_IMAGE.rows}-tile picture`,
      );
      listed.push(
        Object.freeze({
          id: entry.id,
          picture,
          series: compiled,
          titleTrack,
          name: compiled?.title ?? entry.title!,
          description: compiled?.description ?? entry.description!,
        }),
      );
    });
    for (const compiled of series.series)
      requireAdmission(
        compiled.dev || document.series.some((entry) => entry.id === compiled.id),
        'unresolved_reference',
        '/series',
        `Series ${compiled.id} is not listed`,
      );
    const dev = series.series
      .filter((s) => s.dev && pictures.get(s.id))
      .map((s) =>
        Object.freeze({
          id: s.id,
          picture: pictures.get(s.id)!,
          series: s,
          titleTrack: s.music.title,
          name: s.title,
          description: s.description,
        }),
      );
    const shown = Object.freeze(listed),
      withDev = Object.freeze([...listed, ...dev]);
    return Object.freeze({
      seriesRow: (devShown: boolean) => (devShown ? withDev : shown),
      unpictured,
    });
  });
}

/** The single document among `sources`, admitted against the content as the build admits it. */
export function compileFrontEndSelectionSources(
  sources: readonly DocumentSource[],
  series: SeriesCatalog,
  pictures: ScreenPictureCatalog,
  music: MusicCatalog,
): AdmissionResult<FrontEndSelection> {
  const single = admitSingleDocument(sources, FRONT_END_SELECTION_ID, 'front end selection document');
  if (!single.ok) return single;
  return compileFrontEndSelection(single.value, series, pictures, music);
}

/** Transport verifies the saved bytes before admission; each composition loads the selection once. */
export async function loadFrontEndSelection(
  content: ContentDelivery,
  series: SeriesCatalog,
  pictures: ScreenPictureCatalog,
  music: MusicCatalog,
): Promise<FrontEndSelection> {
  const sources: DocumentSource[] = [];
  for (const file of content.manifest.files.filter((file) => file.kind === 'front-end'))
    sources.push({
      id: file.id,
      path: file.path,
      value: await content.json('front-end', file.id),
      sha256: file.sha256,
    });
  return requireLoaded(compileFrontEndSelectionSources(sources, series, pictures, music));
}
