import { clamp } from '../core/math.js';
import { resolveControlSettings, type ControlSettings } from './audio-control-policy.js';
import { follow } from './audio-parameter.js';
import { DEFAULT_AUDIO_SETTINGS } from './audio-defaults.js';
import { createEngineVoice } from './engine-voice.js';
import type { ExhaustSettings } from './exhaust-acoustics.js';
import { createSoundGraph, type MixSettings, type SoundBus } from './sound-graph.js';
import type { TireComponents } from './tire-sound-components.js';
import type { UnifiedSettings } from './tire-unified-acoustics.js';
import type { RollingSettings } from './tire-rolling-acoustics.js';
import { createTireVoice } from './tire-voice.js';
import type { TireSurfaceSounds } from './surface-sounds.js';
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

/**
 * Rival selection, distance law and reassignment: presentation policy, never vehicle properties. Listening
 * settings on the DEV RIVAL panel; the distance law and pan are geometry.
 */
export interface RivalSettings {
  /** Game policy cutoff: rivals beyond it are never selected. */
  readonly audibleMeters: number;
  /** Distance of full gain for the inverse-distance law. */
  readonly referenceMeters: number;
  /** Pan denominator floor. */
  readonly panMinimumMeters: number;
  readonly reassignmentSeconds: number;
}

export const RIVAL_SETTING_RANGES: Readonly<Record<keyof RivalSettings, { min: number; max: number; step: number }>> =
  Object.freeze({
    audibleMeters: Object.freeze({ min: 20, max: 300, step: 5 }),
    referenceMeters: Object.freeze({ min: 1, max: 20, step: 0.5 }),
    panMinimumMeters: Object.freeze({ min: 1, max: 20, step: 0.5 }),
    reassignmentSeconds: Object.freeze({ min: 0.02, max: 0.5, step: 0.01 }),
  });

export function resolveRivalSettings(overrides: Partial<RivalSettings> = {}): RivalSettings {
  const settings = { ...DEFAULT_AUDIO_SETTINGS.rival };
  for (const key of Object.keys(RIVAL_SETTING_RANGES) as (keyof RivalSettings)[]) {
    const value = overrides[key] === undefined ? settings[key] : overrides[key];
    const range = RIVAL_SETTING_RANGES[key];
    if (!Number.isFinite(value) || value < range.min || value > range.max)
      throw new RangeError(`invalid rival settings: ${key}`);
    settings[key] = value;
  }
  return Object.freeze(settings);
}

/** Inverse-distance (spherical spreading) pressure law, unity within the reference distance. */
export function rivalAudioGain(distanceMeters: number, settings: RivalSettings = DEFAULT_AUDIO_SETTINGS.rival): number {
  return settings.referenceMeters / Math.max(settings.referenceMeters, distanceMeters);
}

/** Lateral displacement is supplied in the listener's yaw frame by the audio scene. */
export function rivalAudioPan(
  lateralMeters: number,
  distanceMeters: number,
  settings: RivalSettings = DEFAULT_AUDIO_SETTINGS.rival,
): number {
  return lateralMeters / Math.max(settings.panMinimumMeters, distanceMeters);
}

/** Physical world distance, independent of raster depth and local stage chainage. */
export function nearestAudibleRival<T extends AudioPosition>(
  listener: AudioPosition,
  rivals: readonly T[],
  audibleMeters = DEFAULT_AUDIO_SETTINGS.rival.audibleMeters,
): T | null {
  // Candidates are the race's observed rivals, which never include the listener.
  let nearest: T | null = null;
  let distanceSquared = audibleMeters ** 2;
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
  settings: RivalSettings = DEFAULT_AUDIO_SETTINGS.rival,
): { readonly gain: number; readonly pan: number } {
  const dx = rival.x - listener.x,
    dy = rival.y - listener.y,
    dz = rival.z - listener.z;
  const distance = Math.hypot(dx, dy, dz);
  const lateral = dx * Math.cos(listener.yaw) - dz * Math.sin(listener.yaw);
  return { gain: rivalAudioGain(distance, settings), pan: rivalAudioPan(lateral, distance, settings) };
}

/**
 * Loads the generators, owns the voices (player engine, rival engine and its panner, player tires) on the
 * sound graph's buses, and the rival voice assignment: a change silences the voice and waits before the new
 * rival sounds.
 */
export async function createAudioScene(context: AudioContext, surfaces: TireSurfaceSounds) {
  await context.audioWorklet.addModule(new URL('./vehicle-processor.js', import.meta.url));
  const graph = createSoundGraph(context);
  const playerEngine = createEngineVoice(context, graph.input('engine'));
  const rivalPan = context.createStereoPanner();
  rivalPan.connect(graph.input('engine'));
  const rivalEngine = createEngineVoice(context, rivalPan);
  const tires = createTireVoice(context, graph.input('tire'), surfaces);
  let rival = DEFAULT_AUDIO_SETTINGS.rival;
  let control = resolveControlSettings();
  let assignedId: string | null = null;
  let switchAt = 0;
  let disposed = false;
  return {
    update(player: VehicleAudioEmitter, rivals: readonly VehicleAudioEmitter[], sound: CompiledEngineSound): void {
      playerEngine.update(player, sound);
      tires.update(player);
      const nearest = nearestAudibleRival(player, rivals, rival.audibleMeters);
      const nearestId = nearest?.id ?? null;
      if (nearestId !== assignedId) {
        assignedId = nearestId;
        switchAt = context.currentTime + rival.reassignmentSeconds;
        rivalEngine.silence();
      }
      if (context.currentTime < switchAt) return;
      if (!nearest) {
        rivalEngine.silence();
        return;
      }
      const { gain, pan } = rivalSpatialization(player, nearest, rival);
      rivalEngine.update(nearest, sound, gain);
      follow(rivalPan.pan, clamp(pan, -1, 1), context.currentTime, control.panSeconds);
    },
    setExhaustSettings(value: ExhaustSettings): void {
      playerEngine.setSettings(value);
      rivalEngine.setSettings(value);
    },
    setTireSettings(value: UnifiedSettings): void {
      tires.setSettings(value);
    },
    setRollingSettings(value: RollingSettings): void {
      tires.setRollingSettings(value);
    },
    setTireComponents(value: TireComponents): void {
      tires.setComponents(value);
    },
    setMixSettings(value: MixSettings): void {
      graph.setMixSettings(value);
    },
    setControlSettings(value: ControlSettings): void {
      control = resolveControlSettings(value);
      graph.setControlSettings(control);
      playerEngine.setControl(control);
      rivalEngine.setControl(control);
      tires.setControl(control);
    },
    setRivalSettings(value: RivalSettings): void {
      rival = resolveRivalSettings(value);
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
