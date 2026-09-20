/** Product composition limits. These are admission/retention settings, never mechanics tuning. */
export const COURSE_DRIVING_POLICY = Object.freeze({
  guard: Object.freeze({
    pose: Object.freeze({ behind: 2, ahead: 2, left: 32, right: 32 }),
    step: Object.freeze({ behind: 4, ahead: 4, left: 2, right: 2 }),
    contact: Object.freeze({ behind: 5, ahead: 5, left: 2, right: 2 }),
  }),
  traversal: Object.freeze({ retainBehind: 500, selectAhead: 500, maxOccurrences: 8 }),
  // Player plus the product's sixteen rivals; retain three recent reader layouts per actor.
  readerCacheSize: 17 * 3,
});

/** Development course settings, resolved here until authored Session presets replace them. */
export const COURSE_PLAY_SETTINGS = Object.freeze({
  rivalCount: 2,
  lapCount: 2,
  touringSpeed: 45,
  standingSpeed: 0,
  playerS: 45,
  playerL: 0,
  rivalFirstS: 55,
  rivalSpacing: 12,
  rivalLane: 2,
});
