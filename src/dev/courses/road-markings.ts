import type { LongitudinalRoadMarking } from '../../groundmap/ground-map.js';

export const CENTER_DASH_MARKINGS: readonly LongitudinalRoadMarking[] = Object.freeze([
  Object.freeze({ centerL: 0, width: 0.14, pattern: 'DASHED', dashLength: 7, gapLength: 5 }),
]);
