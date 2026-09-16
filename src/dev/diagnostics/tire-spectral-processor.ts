import { TireSpectralSynthesis } from '../../audio/tire-spectral-model.js';
import { SPECTRAL_INPUTS, SPECTRAL_INPUT_KEYS, type SpectralObservation } from '../../audio/tire-spectral-acoustics.js';
declare const sampleRate: number;
declare const AudioWorkletProcessor: { new (): { readonly port: MessagePort } };
declare function registerProcessor(name: string, processor: typeof AudioWorkletProcessor): void;

/** Isolated two-tap audition; never imported by the game's processor entry. */
class TireSpectralProcessor extends AudioWorkletProcessor {
  private kernel: TireSpectralSynthesis | null = new TireSpectralSynthesis(sampleRate);
  private readonly input = Object.fromEntries(SPECTRAL_INPUT_KEYS.map((key) => [key, 0])) as {
    -readonly [K in keyof SpectralObservation]: number;
  };
  static get parameterDescriptors() {
    return Object.entries(SPECTRAL_INPUTS).map(([name, range]) => ({
      name,
      defaultValue: 0,
      minValue: range.min,
      maxValue: range.max,
      automationRate: 'k-rate',
    }));
  }
  constructor() {
    super();
    this.port.onmessage = ({ data }) => {
      if (data === 'stop') this.kernel = null;
    };
  }
  process(_inputs: Float32Array[][], outputs: Float32Array[][], p: Record<string, Float32Array>): boolean {
    if (!this.kernel) {
      for (const output of outputs) for (const channel of output) channel.fill(0);
      return false;
    }
    const scrub = outputs[0]?.[0],
      squeal = outputs[1]?.[0];
    if (!scrub || !squeal || scrub.length !== squeal.length) {
      for (const output of outputs) for (const channel of output) channel.fill(0);
      return true;
    }
    for (const key of SPECTRAL_INPUT_KEYS) this.input[key] = p[key]?.[0] ?? NaN;
    try {
      this.kernel.update(this.input);
    } catch (error) {
      // The kernel already cut excitation. Keep its release tail; a later valid frame can recover.
      if (!(error instanceof RangeError)) throw error;
    }
    for (let i = 0; i < scrub.length; i++) {
      this.kernel.sample();
      scrub[i] = this.kernel.scrubOutput;
      squeal[i] = this.kernel.squealOutput;
    }
    return true;
  }
}
registerProcessor('tire-spectral-trial', TireSpectralProcessor);
