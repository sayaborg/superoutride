import { clamp } from '../core/math.js';
import { follow } from './audio-parameter.js';
import { createEngineVoice } from './engine-voice.js';
import type { ExhaustSettings } from './exhaust-acoustics.js';
import { createSoundGraph, type SoundBus } from './sound-graph.js';
import type { TireComponents } from './tire-sound-controls.js';
import type { UnifiedSettings } from './tire-unified-acoustics.js';
import { createTireVoice } from './tire-voice.js';
import type { CompiledEngineSound } from './engine-sound.js';
import type { VehicleAudioObservation } from './vehicle-audio-observation.js';

/** Physical world position in meters. */
export interface AudioPosition {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/** Physical world position in meters and heading in radians. */
export interface AudioPose extends AudioPosition {
  readonly yaw: number;
}

/** Consumer-owned read contract: one competitor's acoustic observation, identity and world pose. */
export interface VehicleAudioEmitter extends VehicleAudioObservation, AudioPose {
  readonly id: string;
}

/** Rival selection, distance mix and reassignment; presentation policy, never vehicle properties. */
export const RIVAL_AUDIO_POLICY = Object.freeze({
  audibleMeters: 100,
  peakGain: 0.6,
  halfGainMeters: 12,
  panMinimumMeters: 3,
  reassignmentSeconds: 0.09,
});

export function rivalAudioGain(distanceMeters: number): number {
  const { peakGain, halfGainMeters, audibleMeters } = RIVAL_AUDIO_POLICY;
  return (peakGain / (1 + (distanceMeters / halfGainMeters) ** 2)) * Math.max(0, 1 - distanceMeters / audibleMeters);
}

/** Lateral displacement is supplied in the listener's yaw frame by the audio scene. */
export function rivalAudioPan(lateralMeters: number, distanceMeters: number): number {
  return lateralMeters / Math.max(RIVAL_AUDIO_POLICY.panMinimumMeters, distanceMeters);
}

/** Physical world distance, independent of raster depth and local stage chainage. */
export function nearestAudibleRival<T extends AudioPosition>(listener: AudioPosition, rivals: readonly T[]): T | null {
  // Candidates are the race's observed rivals, which never include the listener.
  let nearest: T | null = null;
  let distanceSquared = RIVAL_AUDIO_POLICY.audibleMeters ** 2;
  for (const candidate of rivals) {
    const d2 = (candidate.x - listener.x) ** 2 + (candidate.y - listener.y) ** 2 + (candidate.z - listener.z) ** 2;
    if (d2 < distanceSquared) {
      nearest = candidate;
      distanceSquared = d2;
    }
  }
  return nearest;
}

export function rivalSpatialization(
  listener: AudioPose,
  rival: AudioPosition,
): { readonly gain: number; readonly pan: number } {
  const dx = rival.x - listener.x,
    dy = rival.y - listener.y,
    dz = rival.z - listener.z;
  const distance = Math.hypot(dx, dy, dz);
  const lateral = dx * Math.cos(listener.yaw) - dz * Math.sin(listener.yaw);
  return { gain: rivalAudioGain(distance), pan: rivalAudioPan(lateral, distance) };
}

/**
 * Loads the generators, owns the voices (player engine, rival engine and its panner, player tires) on the
 * sound graph's buses, and the rival voice assignment: a change silences the voice and waits before the new
 * rival sounds.
 */
export async function createAudioScene(context: AudioContext) {
  await context.audioWorklet.addModule(new URL('./vehicle-processor.js', import.meta.url));
  const graph = createSoundGraph(context);
  const playerEngine = createEngineVoice(context, graph.input('engine'));
  const rivalPan = context.createStereoPanner();
  rivalPan.connect(graph.input('engine'));
  const rivalEngine = createEngineVoice(context, rivalPan);
  const tires = createTireVoice(context, graph.input('tire'));
  let assignedId: string | null = null;
  let switchAt = 0;
  let disposed = false;
  return {
    update(player: VehicleAudioEmitter, rivals: readonly VehicleAudioEmitter[], sound: CompiledEngineSound): void {
      playerEngine.update(player, sound);
      tires.update(player);
      const nearest = nearestAudibleRival(player, rivals);
      const nearestId = nearest?.id ?? null;
      if (nearestId !== assignedId) {
        assignedId = nearestId;
        switchAt = context.currentTime + RIVAL_AUDIO_POLICY.reassignmentSeconds;
        rivalEngine.silence();
      }
      if (context.currentTime < switchAt) return;
      if (!nearest) {
        rivalEngine.silence();
        return;
      }
      const { gain, pan } = rivalSpatialization(player, nearest);
      rivalEngine.update(nearest, sound, gain);
      follow(rivalPan.pan, clamp(pan, -1, 1), context.currentTime, 0.06);
    },
    setExhaustSettings(value: ExhaustSettings): void {
      playerEngine.setSettings(value);
      rivalEngine.setSettings(value);
    },
    setTireSettings(value: UnifiedSettings): void {
      tires.setSettings(value);
    },
    setTireComponents(value: TireComponents): void {
      tires.setComponents(value);
    },
    setBusGain(bus: SoundBus, value: number): void {
      graph.setBusGain(bus, value);
    },
    setMasterGain(value: number): void {
      graph.setMasterGain(value);
    },
    dispose(): void {
      if (disposed) return;
      disposed = true;
      playerEngine.dispose();
      rivalEngine.dispose();
      tires.dispose();
      rivalPan.disconnect();
      graph.dispose();
    },
  };
}
