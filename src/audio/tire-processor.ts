import { TireUnifiedSynthesis } from './tire-unified-model.js';
import {
  UNIFIED_SETTINGS,
  resolveUnifiedTuning,
  sameUnifiedTuning,
  type UnifiedTuning,
} from './tire-unified-acoustics.js';
import { TIRE_SOUND_INPUT_KEYS, type TireSoundObservation } from './tire-sound-observation.js';
import {
  TIRE_CONTROL_RANGES,
  TIRE_COMPONENTS,
  TIRE_COMPONENT_RANGE,
  TIRE_COMPONENT_FADE_SECONDS,
} from './tire-sound-controls.js';
declare const sampleRate: number;
declare const AudioWorkletProcessor: { new (): { readonly port: MessagePort } };
declare function registerProcessor(name: string, processor: typeof AudioWorkletProcessor): void;

function createPair(tuning: UnifiedTuning) {
  return {
    front: new TireUnifiedSynthesis(sampleRate, UNIFIED_SETTINGS.frontSeed, tuning),
    rear: new TireUnifiedSynthesis(sampleRate, UNIFIED_SETTINGS.rearSeed, tuning),
  };
}

class TireProcessor extends AudioWorkletProcessor {
  private tuning = resolveUnifiedTuning();
  private pair: ReturnType<typeof createPair> | null = createPair(this.tuning);
  private readonly frontObservation = Object.fromEntries(TIRE_SOUND_INPUT_KEYS.map((key) => [key, 0])) as {
    -readonly [K in keyof TireSoundObservation]: number;
  };
  private readonly rearObservation = { ...this.frontObservation };
  private readonly componentFollow = 1 - Math.exp(-1 / (sampleRate * TIRE_COMPONENT_FADE_SECONDS));
  private roadMix = 1;
  private squealMix = 1;
  private valid = true;
  static get parameterDescriptors() {
    return [
      ...TIRE_COMPONENTS.map(({ key }) => ({ name: `mix_${key}`, ...TIRE_COMPONENT_RANGE, automationRate: 'k-rate' })),
      ...['front', 'rear'].flatMap((axle) =>
        Object.entries(TIRE_CONTROL_RANGES).map(([key, range]) => ({
          name: `${axle}_${key}`,
          ...range,
          automationRate: 'k-rate',
        })),
      ),
    ];
  }
  constructor() {
    super();
    this.port.onmessage = ({ data }) => {
      if (data === 'stop') this.pair = null;
      else if (this.pair !== null) {
        try {
          if (data === null || typeof data !== 'object' || !Object.hasOwn(data, 'tuning'))
            throw new TypeError('tire settings message must contain tuning');
          const tuning = resolveUnifiedTuning(data.tuning);
          // Replace after the voice fade; identical settings preserve the running state.
          if (!sameUnifiedTuning(tuning, this.tuning)) this.pair = createPair(tuning);
          this.tuning = tuning;
          this.valid = true;
        } catch {
          this.valid = false;
        }
      }
    };
  }
  private read(p: Record<string, Float32Array>, axle: string, key: keyof typeof TIRE_CONTROL_RANGES): number {
    const value = p[`${axle}_${key}`]?.[0];
    const range = TIRE_CONTROL_RANGES[key];
    return value !== undefined && Number.isFinite(value) && value >= range.minValue && value <= range.maxValue
      ? value
      : NaN;
  }
  private updateObserved(
    p: Record<string, Float32Array>,
    axle: string,
    observation: typeof this.frontObservation,
    kernel: TireUnifiedSynthesis,
  ): void {
    let valid = this.valid;
    for (const key of TIRE_SOUND_INPUT_KEYS) {
      observation[key] = this.read(p, axle, `tire_${key}`);
      valid = valid && Number.isFinite(observation[key]);
    }
    const surface = this.read(p, axle, 'tire_surfaceIndex');
    if (valid && Number.isInteger(surface)) kernel.update(observation, surface);
    else {
      for (const key of TIRE_SOUND_INPUT_KEYS) observation[key] = 0;
      kernel.update(observation, 0); // Release only this axle; preserve finite tails and later recovery.
    }
  }
  private readMix(p: Record<string, Float32Array>, key: string): number {
    const value = p[key]?.[0];
    return value !== undefined &&
      Number.isFinite(value) &&
      value >= TIRE_COMPONENT_RANGE.minValue &&
      value <= TIRE_COMPONENT_RANGE.maxValue
      ? value
      : 0;
  }
  process(_inputs: Float32Array[][], outputs: Float32Array[][], p: Record<string, Float32Array>): boolean {
    const output = outputs[0]?.[0],
      pair = this.pair;
    if (!pair) {
      output?.fill(0);
      return false;
    }
    if (!output) return true;
    this.updateObserved(p, 'front', this.frontObservation, pair.front);
    this.updateObserved(p, 'rear', this.rearObservation, pair.rear);
    const road = this.readMix(p, 'mix_road'),
      squeal = this.readMix(p, 'mix_squeal');
    for (let i = 0; i < output.length; i++) {
      this.roadMix += this.componentFollow * (road - this.roadMix);
      this.squealMix += this.componentFollow * (squeal - this.squealMix);
      pair.front.sample();
      pair.rear.sample();
      output[i] =
        pair.front.roadOutput * this.roadMix +
        pair.front.frictionOutput * this.squealMix +
        (pair.rear.roadOutput * this.roadMix + pair.rear.frictionOutput * this.squealMix);
    }
    return true;
  }
}
registerProcessor('vehicle-tires', TireProcessor);
