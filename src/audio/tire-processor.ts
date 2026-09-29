import { resolveControlSettings, sameControlSettings, type ControlSettings } from './audio-control-policy.js';
import { TireUnifiedSynthesis } from './tire-unified-model.js';
import {
  UNIFIED_SYNTHESIS,
  resolveUnifiedSettings,
  sameUnifiedSettings,
  type UnifiedSettings,
} from './tire-unified-acoustics.js';
import { resolveRollingSettings, sameRollingSettings, type RollingSettings } from './tire-rolling-acoustics.js';
import { TIRE_SOUND_INPUT_KEYS, TIRE_CONTROL_RANGES, type TireSoundObservation } from './tire-sound-transport.js';
import { SURFACE_SOUND_RECORDS } from './surface-sounds.js';
import { TIRE_COMPONENTS, TIRE_COMPONENT_RANGE } from './tire-sound-components.js';
declare const sampleRate: number;
declare const AudioWorkletProcessor: { new (): { readonly port: MessagePort } };
declare function registerProcessor(name: string, processor: typeof AudioWorkletProcessor): void;

function createPair(settings: UnifiedSettings, rolling: RollingSettings, control: ControlSettings) {
  return {
    front: new TireUnifiedSynthesis(sampleRate, UNIFIED_SYNTHESIS.frontSeed, settings, rolling, control),
    rear: new TireUnifiedSynthesis(sampleRate, UNIFIED_SYNTHESIS.rearSeed, settings, rolling, control),
  };
}

const componentFollow = (control: ControlSettings) => 1 - Math.exp(-1 / (sampleRate * control.componentSeconds));

class TireProcessor extends AudioWorkletProcessor {
  private settings = resolveUnifiedSettings();
  private rolling = resolveRollingSettings();
  private control = resolveControlSettings();
  private pair: ReturnType<typeof createPair> | null = createPair(this.settings, this.rolling, this.control);
  private readonly frontObservation = Object.fromEntries(TIRE_SOUND_INPUT_KEYS.map((key) => [key, 0])) as {
    -readonly [K in keyof TireSoundObservation]: number;
  };
  private readonly rearObservation = { ...this.frontObservation };
  private componentFollow = componentFollow(this.control);
  private rollingMix = 1;
  private frictionMix = 1;
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
          if (data === null || typeof data !== 'object' || !Object.hasOwn(data, 'settings'))
            throw new TypeError('tire settings message must contain settings');
          const settings = resolveUnifiedSettings(data.settings);
          const rolling = resolveRollingSettings(data.rolling);
          const control = resolveControlSettings(data.control);
          // Replace after the voice fade; identical settings preserve the running state.
          if (
            !sameUnifiedSettings(settings, this.settings) ||
            !sameRollingSettings(rolling, this.rolling) ||
            !sameControlSettings(this.control, control)
          )
            this.pair = createPair(settings, rolling, control);
          this.settings = settings;
          this.rolling = rolling;
          this.control = control;
          this.componentFollow = componentFollow(control);
          this.valid = true;
        } catch {
          this.valid = false;
        }
      }
    };
  }
  // The voice validated these values once; the descriptors' ranges let Web Audio clamp automation.
  private read(p: Record<string, Float32Array>, axle: string, key: keyof typeof TIRE_CONTROL_RANGES): number {
    return p[`${axle}_${key}`]![0]!;
  }
  private updateObserved(
    p: Record<string, Float32Array>,
    axle: string,
    observation: typeof this.frontObservation,
    kernel: TireUnifiedSynthesis,
  ): void {
    for (const key of TIRE_SOUND_INPUT_KEYS) observation[key] = this.read(p, axle, `tire_${key}`);
    // Numerical stability only: float transport must still name a surface record.
    const surface = Math.round(this.read(p, axle, 'tire_surfaceIndex'));
    if (this.valid && surface >= 0 && surface < SURFACE_SOUND_RECORDS.length) kernel.update(observation, surface);
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
    const rolling = this.readMix(p, 'mix_rolling'),
      friction = this.readMix(p, 'mix_friction');
    for (let i = 0; i < output.length; i++) {
      this.rollingMix += this.componentFollow * (rolling - this.rollingMix);
      this.frictionMix += this.componentFollow * (friction - this.frictionMix);
      pair.front.sample();
      pair.rear.sample();
      output[i] =
        pair.front.rollingOutput * this.rollingMix +
        pair.front.frictionOutput * this.frictionMix +
        (pair.rear.rollingOutput * this.rollingMix + pair.rear.frictionOutput * this.frictionMix);
    }
    return true;
  }
}
registerProcessor('vehicle-tires', TireProcessor);
