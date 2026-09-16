import { TireHybridSynthesis } from './tire-hybrid-model.js';
import { TireSpectralSynthesis } from './tire-spectral-model.js';
import { SPECTRAL_INPUT_KEYS, SPECTRAL_SETTINGS, type SpectralObservation } from './tire-spectral-acoustics.js';
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

class TireProcessor extends AudioWorkletProcessor {
  private front: TireSynthesis | null = new TireSynthesis(sampleRate, CONTACT_ACOUSTICS.frontSeed);
  private rear: TireSynthesis | null = new TireSynthesis(sampleRate, CONTACT_ACOUSTICS.rearSeed);
  private frontContact: TireContactSynthesis | null = null;
  private rearContact: TireContactSynthesis | null = null;
  private frontHybrid: TireHybridSynthesis | null = null;
  private rearHybrid: TireHybridSynthesis | null = null;
  private frontSpectral: TireSpectralSynthesis | null = null;
  private rearSpectral: TireSpectralSynthesis | null = null;
  private readonly frontSpectralControl = Object.fromEntries(SPECTRAL_INPUT_KEYS.map((key) => [key, 0])) as {
    -readonly [K in keyof SpectralObservation]: number;
  };
  private readonly rearSpectralControl = { ...this.frontSpectralControl };
  private readonly componentFollow = 1 - Math.exp(-1 / (sampleRate * TIRE_COMPONENT_FADE_SECONDS));
  private roadMix = 1;
  private scrubMix = 1;
  private squealMix = 1;
  private model: TireSoundModel = DEFAULT_TIRE_SOUND_MODEL;
  private valid = true;
  private running = true;
  private readonly frontControl = { squeal: 0, pitch: 900 };
  private readonly rearControl = { squeal: 0, pitch: 900 };
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
      if (data === 'stop') {
        this.running = false;
        this.frontHybrid = this.rearHybrid = null;
        this.front = this.rear = this.frontContact = this.rearContact = this.frontSpectral = this.rearSpectral = null;
      } else if (!this.running) return;
      else if (!TIRE_SOUND_MODELS.includes(data?.model)) this.valid = false;
      else {
        this.valid = true;
        if (data.model === this.model) return;
        // Called only after the voice fades to silence. Never run the inactive model.
        this.model = data.model;
        this.front = this.rear = null;
        this.frontHybrid = this.rearHybrid = null;
        this.frontContact = this.rearContact = this.frontSpectral = this.rearSpectral = null;
        if (this.model === 'current') {
          this.front = new TireSynthesis(sampleRate, CONTACT_ACOUSTICS.frontSeed);
          this.rear = new TireSynthesis(sampleRate, CONTACT_ACOUSTICS.rearSeed);
        } else if (this.model === 'contact') {
          this.frontContact = new TireContactSynthesis(sampleRate, CONTACT_ACOUSTICS.frontSeed);
          this.rearContact = new TireContactSynthesis(sampleRate, CONTACT_ACOUSTICS.rearSeed);
        } else if (this.model === 'hybrid') {
          this.frontHybrid = new TireHybridSynthesis(sampleRate, SPECTRAL_SETTINGS.seed, CONTACT_ACOUSTICS.frontSeed);
          this.rearHybrid = new TireHybridSynthesis(sampleRate, SPECTRAL_SETTINGS.rearSeed, CONTACT_ACOUSTICS.rearSeed);
        } else {
          this.frontSpectral = new TireSpectralSynthesis(sampleRate, SPECTRAL_SETTINGS.seed);
          this.rearSpectral = new TireSpectralSynthesis(sampleRate, SPECTRAL_SETTINGS.rearSeed);
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
  private updateSpectral(
    p: Record<string, Float32Array>,
    axle: string,
    control: typeof this.frontSpectralControl,
    kernel: TireSpectralSynthesis,
  ): void {
    const valid = this.readSpectral(p, axle, control);
    const surface = this.read(p, axle, 'spectral_surfaceIndex');
    if (valid && Number.isInteger(surface)) kernel.update(control, surface);
    else {
      for (const key of SPECTRAL_INPUT_KEYS) control[key] = 0;
      kernel.update(control); // Release only this axle; retain finite tails and permit later recovery.
    }
  }
  private readSpectral(
    p: Record<string, Float32Array>,
    axle: string,
    control: typeof this.frontSpectralControl,
  ): boolean {
    let valid = this.valid;
    for (const key of SPECTRAL_INPUT_KEYS) {
      control[key] = this.read(p, axle, `spectral_${key}`);
      valid = valid && Number.isFinite(control[key]);
    }
    return valid;
  }
  private updateHybrid(
    p: Record<string, Float32Array>,
    axle: string,
    control: typeof this.frontSpectralControl,
    current: typeof this.frontControl,
    kernel: TireHybridSynthesis,
  ): void {
    const valid = this.readSpectral(p, axle, control);
    const surface = this.read(p, axle, 'spectral_surfaceIndex');
    current.squeal = this.read(p, axle, 'squeal');
    current.pitch = this.read(p, axle, 'pitch');
    if (valid && Number.isInteger(surface) && Number.isFinite(current.squeal) && Number.isFinite(current.pitch))
      kernel.update(control, current, surface);
    else {
      for (const key of SPECTRAL_INPUT_KEYS) control[key] = 0;
      current.squeal = 0;
      current.pitch = TIRE_CONTROL_RANGES.pitch.defaultValue;
      kernel.update(control, current);
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
    const output = outputs[0]?.[0];
    if (!this.running) {
      output?.fill(0);
      return false;
    }
    if (!output) return true;
    if (this.model === 'current') {
      this.updateCurrent(p, 'front', this.frontControl, this.front!);
      this.updateCurrent(p, 'rear', this.rearControl, this.rear!);
      for (let i = 0; i < output.length; i++) output[i] = this.front!.sample() + this.rear!.sample();
    } else if (this.model === 'contact') {
      this.updateContact(p, 'front', this.frontContact!);
      this.updateContact(p, 'rear', this.rearContact!);
      for (let i = 0; i < output.length; i++)
        output[i] = (this.frontContact!.sample() + this.rearContact!.sample()) * CONTACT_ACOUSTICS.listeningGain;
    } else if (this.model === 'hybrid') {
      this.updateHybrid(p, 'front', this.frontSpectralControl, this.frontControl, this.frontHybrid!);
      this.updateHybrid(p, 'rear', this.rearSpectralControl, this.rearControl, this.rearHybrid!);
      const road = this.readMix(p, 'mix_road'),
        squeal = this.readMix(p, 'mix_squeal');
      const front = this.frontHybrid!,
        rear = this.rearHybrid!;
      for (let i = 0; i < output.length; i++) {
        this.roadMix += this.componentFollow * (road - this.roadMix);
        this.squealMix += this.componentFollow * (squeal - this.squealMix);
        front.sample();
        rear.sample();
        output[i] =
          front.roadOutput * this.roadMix +
          front.squealOutput * this.squealMix +
          (rear.roadOutput * this.roadMix + rear.squealOutput * this.squealMix);
      }
    } else {
      this.updateSpectral(p, 'front', this.frontSpectralControl, this.frontSpectral!);
      this.updateSpectral(p, 'rear', this.rearSpectralControl, this.rearSpectral!);
      const road = this.readMix(p, 'mix_road'),
        scrub = this.readMix(p, 'mix_scrub'),
        squeal = this.readMix(p, 'mix_squeal');
      const front = this.frontSpectral!,
        rear = this.rearSpectral!;
      for (let i = 0; i < output.length; i++) {
        this.roadMix += this.componentFollow * (road - this.roadMix);
        this.scrubMix += this.componentFollow * (scrub - this.scrubMix);
        this.squealMix += this.componentFollow * (squeal - this.squealMix);
        front.sample();
        rear.sample();
        output[i] =
          front.scrubOutput * this.scrubMix +
          front.squealOutput * this.squealMix +
          front.roadOutput * this.roadMix +
          (rear.scrubOutput * this.scrubMix + rear.squealOutput * this.squealMix + rear.roadOutput * this.roadMix);
      }
    }
    return true;
  }
}
registerProcessor('vehicle-tires', TireProcessor);
