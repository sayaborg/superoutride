import { formatSavedJson } from '../../src/content/saved-json.js';
import { bakeCoursePieces, unbakeCoursePieces, type BakeEntry, type UnbakedPiece } from '../authoring/course-bake.js';
import {
  onePart,
  renameCoursePictures,
  savedCourseDocument,
  setCoursePictureWidths,
} from '../authoring/course-edits.js';
import type { Json } from '../authoring/json-pointer.js';

/**
 * One change of a product course the sprite editor makes: pictures renamed, the collision width of the placements of
 * `images` set to `width` or moved by `step` (to a tenth of a millimetre), a bake entry's pieces baked into `image`, or
 * a baked picture's pieces put back. A rename or a putting back that is `optional` and finds nothing to change is no
 * refusal: it changes nothing and counts 0.
 */
export type CourseEdit =
  | { readonly kind: 'rename'; readonly renames: readonly (readonly [string, string])[]; readonly optional: boolean }
  | { readonly kind: 'widths'; readonly images: readonly string[]; readonly width: number }
  | { readonly kind: 'step widths'; readonly images: readonly string[]; readonly step: number }
  | {
      readonly kind: 'bake';
      readonly entry: BakeEntry;
      readonly included: readonly boolean[];
      readonly image: string;
      readonly across: number;
      readonly up: number;
    }
  | {
      readonly kind: 'unbake';
      readonly image: string;
      readonly pieces: readonly UnbakedPiece[];
      readonly optional: boolean;
    };

/** A product course's document changed off the page's thread by `edits`, in order. */
export interface CourseEditRequest {
  readonly id: number;
  readonly kind: 'edit';
  readonly bytes: Uint8Array<ArrayBuffer>;
  readonly edits: readonly CourseEdit[];
}

/**
 * The document's bytes once edited, saved as a course document is (`savedCourseDocument`, `formatSavedJson`), with how
 * many names each edit changed; or the reason the first refused edit gives, and nothing written.
 */
export type CourseEdited =
  | { readonly bytes: Uint8Array<ArrayBuffer>; readonly changes: readonly number[]; readonly reason: null }
  | { readonly bytes: null; readonly changes: readonly number[]; readonly reason: string };

export function editCourse(request: CourseEditRequest): CourseEdited {
  let document = JSON.parse(new TextDecoder().decode(request.bytes)) as Json;
  const changes: number[] = [];
  for (const edit of request.edits) {
    const result =
      edit.kind === 'rename'
        ? renameCoursePictures(document, new Map(edit.renames))
        : edit.kind === 'widths'
          ? setCoursePictureWidths(document, edit.images, edit.width)
          : edit.kind === 'step widths'
            ? setCoursePictureWidths(document, edit.images, (width) => Math.round((width + edit.step) * 1e4) / 1e4)
            : edit.kind === 'bake'
              ? bakeCoursePieces(document, edit.entry, edit.included, edit.image, edit.across, edit.up)
              : unbakeCoursePieces(document, edit.image, edit.pieces);
    if (!result.ok) {
      if ((edit.kind === 'rename' || edit.kind === 'unbake') && edit.optional) {
        changes.push(0);
        continue;
      }
      return { bytes: null, changes, reason: result.reason };
    }
    changes.push(result.changes.length);
    document = result.document;
  }
  return { bytes: new TextEncoder().encode(formatSavedJson(savedCourseDocument(document))), changes, reason: null };
}

/** An original course's collision widths of the placements naming any of `names`, to read off the page's thread. */
export interface CourseWidthsRequest {
  readonly id: number;
  readonly kind: 'widths of';
  readonly bytes: Uint8Array<ArrayBuffer>;
  readonly names: readonly string[];
}

/** Each collision width the placements of `names` whose body is one part on their lateral have, with how many have it. */
export function courseWidthsOf(request: CourseWidthsRequest): readonly (readonly [number, number])[] {
  const names = new Set(request.names);
  const counts = new Map<number, number>();
  const visit = (value: Json | undefined): void => {
    if (Array.isArray(value)) value.forEach(visit);
    else if (typeof value === 'object' && value !== null) {
      const width = onePart(value)?.width;
      if (value.kind === 'sprite' && names.has(value.image as string) && typeof width === 'number')
        counts.set(width, (counts.get(width) ?? 0) + 1);
      Object.values(value).forEach(visit);
    }
  };
  visit(JSON.parse(new TextDecoder().decode(request.bytes)) as Json);
  return [...counts];
}
