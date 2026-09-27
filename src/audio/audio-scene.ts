import { RIVAL_AUDIBLE_METERS, rivalAudioGain, rivalAudioPan } from './audio-presentation.js';

/** Physical world position in meters. */
export interface AudioPosition {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/** Physical world position in meters and heading in radians. */
export interface AudioListener extends AudioPosition {
  readonly yaw: number;
}

/** Physical world distance, independent of raster depth and local stage chainage. */
export function nearestAudibleRival<T extends AudioPosition>(
  listener: AudioPosition,
  candidates: readonly T[],
): T | null {
  let nearest: T | null = null;
  let distanceSquared = RIVAL_AUDIBLE_METERS ** 2;
  for (const candidate of candidates) {
    if (candidate === listener) continue;
    const d2 = (candidate.x - listener.x) ** 2 + (candidate.y - listener.y) ** 2 + (candidate.z - listener.z) ** 2;
    if (d2 < distanceSquared) {
      nearest = candidate;
      distanceSquared = d2;
    }
  }
  return nearest;
}

export function rivalSpatialization(
  listener: AudioListener,
  rival: AudioPosition,
): { readonly gain: number; readonly pan: number } {
  const dx = rival.x - listener.x,
    dy = rival.y - listener.y,
    dz = rival.z - listener.z;
  const distance = Math.hypot(dx, dy, dz);
  const lateral = dx * Math.cos(listener.yaw) - dz * Math.sin(listener.yaw);
  return { gain: rivalAudioGain(distance), pan: rivalAudioPan(lateral, distance) };
}
