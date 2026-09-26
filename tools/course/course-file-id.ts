import path from 'node:path';

/** A course's identifier is its saved file name without the `.course.json` (or `.json`) extension. */
export function courseFileId(file: string): string {
  return path.basename(file).replace(/(\.course)?\.json$/, '');
}
