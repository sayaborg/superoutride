/**
 * The recordings the game plays besides music, by name: the one list that the content build requires and playback
 * reads. A recording's manifest ID is its group and name, such as `effects/goal`.
 */
export const EFFECT_RECORDINGS = Object.freeze([
  'countdown-lamp',
  'countdown-go',
  'checkpoint',
  'lap',
  'extend',
  'goal',
  'game-over',
  'menu-move',
  'menu-confirm',
  'menu-back',
] as const);
export type EffectRecording = (typeof EFFECT_RECORDINGS)[number];

/** One impact recording per contact counterpart. */
export const IMPACT_RECORDINGS = Object.freeze(['vehicle', 'wall', 'object', 'movable'] as const);
export type ImpactRecording = (typeof IMPACT_RECORDINGS)[number];

/** The recording groups: each is an authored directory and the first segment of its recordings' IDs. */
export const RECORDING_GROUPS = Object.freeze(['music', 'effects', 'impacts'] as const);
export type RecordingGroup = (typeof RECORDING_GROUPS)[number];

export const recordingId = (group: RecordingGroup, name: string): string => `${group}/${name}`;
