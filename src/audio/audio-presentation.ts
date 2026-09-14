// Presentation timing and rival mix policy, never mechanical or pipe properties.
export const AUDIO_TIMING = Object.freeze({ controlSeconds: 0.025, transitionSeconds: 0.09 });
export const RIVAL_AUDIBLE_METERS = 100;

export function rivalAudioGain(distanceMeters: number): number {
  return (0.6 / (1 + (distanceMeters / 12) ** 2)) * Math.max(0, 1 - distanceMeters / RIVAL_AUDIBLE_METERS);
}

/** Lateral displacement is supplied in the listener's yaw frame by the browser adapter. */
export function rivalAudioPan(lateralMeters: number, distanceMeters: number): number {
  return lateralMeters / Math.max(3, distanceMeters);
}
