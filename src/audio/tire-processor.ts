import { TireHybridSynthesis } from './tire-hybrid-model.js';
import { HYBRID_SETTINGS } from './tire-hybrid-acoustics.js';
import { TireUnifiedSynthesis } from './tire-unified-model.js';
import {
  UNIFIED_SETTINGS,
  resolveUnifiedTuning,
  sameUnifiedTuning,
  type UnifiedTuning,
} from './tire-unified-acoustics.js';
import { TireSpectralSynthesis } from './tire-spectral-model.js';
import { TIRE_SOUND_INPUT_KEYS, type TireSoundObservation } from './tire-sound-observation.js';
import { SPECTRAL_SETTINGS } from './tire-spectral-acoustics.js';
import { TireSynthesis } from './tire-synthesis.js';
import { TireContactSynthesis } from './tire-contact-model.js';
import { CONTACT_ACOUSTICS } from './tire-contact-acoustics.js';
import {
  DEFAULT_TIRE_SOUND_MODEL,
  TIRE_CONTROL_RANGES,
  TIRE_SOUND_MODELS,
  TIRE_COMPONENTS,
  TIRE_COMPONENT_RANGE,
  TIRE_COMPONENT_FADE_SECONDS,
  type TireSoundModel,
} from './tire-sound-controls.js';
declare const sampleRate: number;
declare const AudioWorkletProcessor: { new (): { readonly port: MessagePort } };
declare function registerProcessor(name: string, processor: typeof AudioWorkletProcessor): void;

type ObservedSynthesis = TireHybridSynthesis | TireSpectralSynthesis | TireUnifiedSynthesis;
type TirePair =
  | { model: 'current'; front: TireSynthesis; rear: TireSynthesis }
  | { model: 'contact'; front: TireContactSynthesis; rear: TireContactSynthesis }
  | { model: 'hybrid'; front: TireHybridSynthesis; rear: TireHybridSynthesis }
  | { model: 'spectral'; front: TireSpectralSynthesis; rear: TireSpectralSynthesis }
  | { model: 'unified'; front: TireUnifiedSynthesis; rear: TireUnifiedSynthesis };

/** Only the selected model exists; startup and faded model replacement share this constructor. */
function createPair(model: TireSoundModel, tuning?: UnifiedTuning): TirePair {
  if (model === 'current')
    return {
      model,
      front: new TireSynthesis(sampleRate, CONTACT_ACOUSTICS.frontSeed),
      rear: new TireSynthesis(sampleRate, CONTACT_ACOUSTICS.rearSeed),
    };
  if (model === 'contact')
    return {
      model,
      front: new TireContactSynthesis(sampleRate, CONTACT_ACOUSTICS.frontSeed),
      rear: new TireContactSynthesis(sampleRate, CONTACT_ACOUSTICS.rearSeed),
    };
  if (model === 'hybrid')
    return {
      model,
      front: new TireHybridSynthesis(sampleRate, HYBRID_SETTINGS.frontSeed),
      rear: new TireHybridSynthesis(sampleRate, HYBRID_SETTINGS.rearSeed),
    };
  if (model === 'unified')
    return {
      model,
      front: new TireUnifiedSynthesis(sampleRate, UNIFIED_SETTINGS.frontSeed, tuning),
      rear: new TireUnifiedSynthesis(sampleRate, UNIFIED_SETTINGS.rearSeed, tuning),
    };
  return {
    model,
    front: new TireSpectralSynthesis(sampleRate, SPECTRAL_SETTINGS.seed),
    rear: new TireSpectralSynthesis(sampleRate, SPECTRAL_SETTINGS.rearSeed),
  };
}

class TireProcessor extends AudioWorkletProcessor {
  private pair: TirePair | null = createPair(DEFAULT_TIRE_SOUND_MODEL);
  private tuning = resolveUnifiedTuning();
  private readonly frontObservation = Object.fromEntries(TIRE_SOUND_INPUT_KEYS.map((key) => [key, 0])) as {
    -readonly [K in keyof TireSoundObservation]: number;
  };
  private readonly rearObservation = { ...this.frontObservation };
  private readonly componentFollow = 1 - Math.exp(-1 / (sampleRate * TIRE_COMPONENT_FADE_SECONDS));
  private roadMix = 1;
  private scrubMix = 1;
  private squealMix = 1;
  private valid = true;
  private readonly frontControl: { squeal: number; pitch: number } = {
    squeal: 0,
    pitch: TIRE_CONTROL_RANGES.pitch.defaultValue,
  };
  private readonly rearControl = { ...this.frontControl };
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
      else if (this.pair === null) return;
      else if (!TIRE_SOUND_MODELS.includes(data?.model)) this.valid = false;
      else {
        try {
          const tuning = data.model === 'unified' ? resolveUnifiedTuning(data.tuning) : this.tuning;
          // Only after the voice fade. Identical settings preserve state; no live stiffness retuning.
          if (data.model !== this.pair.model || (data.model === 'unified' && !sameUnifiedTuning(tuning, this.tuning)))
            this.pair = createPair(data.model, tuning);
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
  private updateCurrent(
    p: Record<string, Float32Array>,
    axle: string,
    control: typeof this.frontControl,
    kernel: TireSynthesis,
  ): void {
    const squeal = this.read(p, axle, 'squeal'),
      pitch = this.read(p, axle, 'pitch');
    const valid = this.valid && Number.isFinite(squeal) && Number.isFinite(pitch);
    control.squeal = valid ? squeal : 0;
    control.pitch = valid ? pitch : TIRE_CONTROL_RANGES.pitch.defaultValue;
    kernel.update(control);
  }
  private updateContact(p: Record<string, Float32Array>, axle: string, kernel: TireContactSynthesis): void {
    const travel = this.read(p, axle, 'travelSpeed'),
      slip = this.read(p, axle, 'slipSpeed');
    const load = this.read(p, axle, 'load'),
      texture = this.read(p, axle, 'surfaceIndex');
    if (this.valid && Number.isFinite(travel + slip + load) && Number.isInteger(texture))
      kernel.update(travel, slip, load, texture);
    else kernel.update(0, 0, 0);
  }
  private updateObserved(
    p: Record<string, Float32Array>,
    axle: string,
    observation: typeof this.frontObservation,
    kernel: ObservedSynthesis,
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
    if (pair.model === 'current') {
      this.updateCurrent(p, 'front', this.frontControl, pair.front);
      this.updateCurrent(p, 'rear', this.rearControl, pair.rear);
      for (let i = 0; i < output.length; i++) output[i] = pair.front.sample() + pair.rear.sample();
    } else if (pair.model === 'contact') {
      this.updateContact(p, 'front', pair.front);
      this.updateContact(p, 'rear', pair.rear);
      for (let i = 0; i < output.length; i++)
        output[i] = (pair.front.sample() + pair.rear.sample()) * CONTACT_ACOUSTICS.listeningGain;
    } else {
      this.updateObserved(p, 'front', this.frontObservation, pair.front);
      this.updateObserved(p, 'rear', this.rearObservation, pair.rear);
      const road = this.readMix(p, 'mix_road'),
        scrub = this.readMix(p, 'mix_scrub'),
        squeal = this.readMix(p, 'mix_squeal');
      for (let i = 0; i < output.length; i++) {
        this.roadMix += this.componentFollow * (road - this.roadMix);
        this.scrubMix += this.componentFollow * (scrub - this.scrubMix);
        this.squealMix += this.componentFollow * (squeal - this.squealMix);
        pair.front.sample();
        pair.rear.sample();
        if (pair.model === 'unified') {
          const { front, rear } = pair;
          output[i] =
            front.roadOutput * this.roadMix +
            front.frictionOutput * this.squealMix +
            (rear.roadOutput * this.roadMix + rear.frictionOutput * this.squealMix);
        } else {
          const { front, rear } = pair;
          output[i] =
            front.scrubOutput * this.scrubMix +
            front.squealOutput * this.squealMix +
            front.roadOutput * this.roadMix +
            (rear.scrubOutput * this.scrubMix + rear.squealOutput * this.squealMix + rear.roadOutput * this.roadMix);
        }
      }
    }
    return true;
  }
}
registerProcessor('vehicle-tires', TireProcessor);
