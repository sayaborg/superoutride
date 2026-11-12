import type { ContentKind } from '../content/content-load-error.js';
import type { ContentEntry, ContentManifest } from '../content/content-manifest.js';
import { TEXT_TILES_ID } from '../content/text-tiles-catalog.js';

/**
 * The kinds the page reads whole at startup, in the order it reads them; courses, their products and the recordings are
 * read after it.
 */
const STARTUP_KINDS: readonly ContentKind[] = [
  'material',
  'engine-sound',
  'vehicle-sprite-set',
  'driving',
  'vehicle',
  'vehicle-listing',
  'course-index',
  'screen-picture',
  'music',
  'series',
  'free-play',
  'front-end',
  'explosion',
  'explosion-picture',
  'puffs',
  'puff-picture',
  'audio',
  'surface-sound',
  'engine-loudness',
];

/**
 * The files the page reads at startup, decided from the manifest before reading starts, in the order it reads them:
 * the text tiles, then every file of the startup's kinds ([Browser](../../docs/browser.md#display-and-scheduling)).
 * Fetched in this order, the files a loader takes come before those the loaders after it take.
 */
export const startupFiles = (manifest: ContentManifest): readonly ContentEntry[] => [
  ...manifest.files.filter((entry) => entry.kind === 'image' && entry.id === TEXT_TILES_ID),
  ...STARTUP_KINDS.flatMap((kind) => manifest.files.filter((entry) => entry.kind === kind)),
];
