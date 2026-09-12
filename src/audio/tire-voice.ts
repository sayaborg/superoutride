import { clamp } from '../core/math.js';
import { follow } from './audio-parameter.js';
import type { TireAudioObservation, VehicleAudioObservation } from './vehicle-audio-observation.js';

const MATERIAL = {
  ASPHALT: { rolling: 0.35, squeal: 1, cutoff: 900 },
  SHOULDER: { rolling: 0.7, squeal: 0.45, cutoff: 1600 },
  GRASS: { rolling: 0.6, squeal: 0.05, cutoff: 700 },
  DIRT: { rolling: 0.8, squeal: 0.15, cutoff: 1800 },
  SAND: { rolling: 1, squeal: 0.03, cutoff: 1200 },
  VOID: { rolling: 0, squeal: 0, cutoff: 900 },
} as const;

function station(tire: TireAudioObservation) {
  const material = MATERIAL[tire.surface];
  const load = tire.surface === 'VOID' ? 0 : clamp(tire.load / 5000, 0, 1);
  const motion = clamp(tire.slipSpeed / 8, 0, 1);
  const slip = load * motion * clamp((tire.utilization - 0.45) / 0.8, 0, 1);
  return {
    rolling: load * clamp(tire.rollingSpeed / 55, 0, 1) * material.rolling,
    slip,
    squeal: slip * material.squeal,
    cutoff: material.cutoff,
  };
}

export function tireParameters(state: VehicleAudioObservation) {
  const front = station(state.front),
    rear = station(state.rear);
  const weight = front.rolling + rear.rolling;
  return {
    rolling: 0.09 * weight,
    friction: 0.055 * (front.slip + rear.slip),
    squeal: 0.025 * (front.squeal + rear.squeal),
    cutoff: weight > 0 ? (front.cutoff * front.rolling + rear.cutoff * rear.rolling) / weight : 900,
    pitch: 1100 + 450 * clamp((state.front.slipSpeed + state.rear.slipSpeed) / 30, 0, 1),
  };
}

export function createTireVoice(context: BaseAudioContext, noise: AudioNode, destination: AudioNode) {
  const road = context.createBiquadFilter();
  road.type = 'lowpass';
  road.Q.value = 0.5;
  const friction = context.createBiquadFilter();
  friction.type = 'bandpass';
  friction.Q.value = 3;
  const tone = context.createOscillator();
  tone.type = 'sine';
  const rollingGain = context.createGain(),
    frictionGain = context.createGain(),
    toneGain = context.createGain();
  rollingGain.gain.value = frictionGain.gain.value = toneGain.gain.value = 0;
  noise.connect(road, 0);
  noise.connect(friction, 1);
  road.connect(rollingGain).connect(destination);
  friction.connect(frictionGain).connect(destination);
  tone.connect(toneGain).connect(destination);
  tone.start();
  return {
    update(state: VehicleAudioObservation): void {
      const values = tireParameters(state),
        now = context.currentTime;
      follow(rollingGain.gain, values.rolling, now);
      follow(frictionGain.gain, values.friction, now);
      follow(toneGain.gain, values.squeal, now);
      follow(road.frequency, values.cutoff, now);
      follow(friction.frequency, values.pitch, now);
      follow(tone.frequency, values.pitch, now, 0.05);
    },
    dispose(): void {
      tone.stop();
      for (const node of [road, friction, tone, rollingGain, frictionGain, toneGain]) node.disconnect();
    },
  };
}
