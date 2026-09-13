import type { EngineMethod } from './exhaust-acoustics.js';
import { ExhaustWaveguide } from './exhaust-waveguide.js';
import type { DEFAULT_EXHAUST_TUNING } from './exhaust-acoustics.js';
import type { VehicleAudioProfile } from './vehicle-audio-profile.js';
import { compileVehicleAudioProfile } from './vehicle-audio-profile.js';
declare const sampleRate: number;
declare const AudioWorkletProcessor: { new (): { readonly port: MessagePort } };
declare function registerProcessor(name: string, processor: typeof AudioWorkletProcessor): void;

class ExhaustProcessor extends AudioWorkletProcessor {
  private engine: ExhaustWaveguide | null = null;
  private running = true;
  private steps = 2;
  static get parameterDescriptors() {
    return [
      { name: 'rpm', defaultValue: 1000, minValue: 0, maxValue: 24000, automationRate: 'k-rate' },
      { name: 'load', defaultValue: 0, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
    ];
  }
  constructor(options?: {
    processorOptions?: {
      profile: VehicleAudioProfile;
      method?: EngineMethod;
      tuning?: Partial<typeof DEFAULT_EXHAUST_TUNING>;
    };
  }) {
    super();
    const initial = options?.processorOptions;
    if (initial) this.configure(initial.profile, initial.method, initial.tuning);
    this.port.onmessage = ({ data }) => {
      if (data === 'stop') {
        this.running = false;
        this.engine = null;
      } else if (data === null) this.engine = null;
      else {
        try {
          this.configure(data.profile, data.method, data.tuning);
        } catch {
          this.engine = null;
        }
      }
    };
  }
  private configure(
    profile: VehicleAudioProfile,
    method: EngineMethod = 'waveguide',
    tuning: Partial<typeof DEFAULT_EXHAUST_TUNING> = {},
  ): void {
    if (method !== 'waveguide' && method !== 'waveguide-lite') throw new RangeError('invalid engine method');
    const steps = method === 'waveguide-lite' ? 1 : 2;
    const engine = new ExhaustWaveguide(compileVehicleAudioProfile(profile), sampleRate * steps, tuning);
    this.steps = steps;
    this.engine = engine;
  }
  process(_inputs: Float32Array[][], outputs: Float32Array[][], parameters: Record<string, Float32Array>): boolean {
    if (!this.running) return false;
    const output = outputs[0]?.[0];
    if (!output) return true;
    if (!this.engine) {
      output.fill(0);
      return true;
    }
    const rpm = parameters.rpm![0]!,
      load = parameters.load![0]!;
    if (this.steps === 1) {
      for (let i = 0; i < output.length; i++) output[i] = this.engine.sample(rpm, load);
    } else {
      // Reference keeps its original two acoustic steps and output averaging exactly.
      for (let i = 0; i < output.length; i++)
        output[i] = (this.engine.sample(rpm, load) + this.engine.sample(rpm, load)) * 0.5;
    }
    return true;
  }
}
registerProcessor('exhaust-waveguide', ExhaustProcessor);
