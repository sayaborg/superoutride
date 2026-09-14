import { ExhaustWaveguide } from './exhaust-waveguide.js';
import type { ExhaustTuning } from './exhaust-acoustics.js';
import type { VehicleAudioProfile } from './vehicle-audio-profile.js';
import { compileVehicleAudioProfile } from './vehicle-audio-profile.js';
declare const sampleRate: number;
declare const AudioWorkletProcessor: { new (): { readonly port: MessagePort } };
declare function registerProcessor(name: string, processor: typeof AudioWorkletProcessor): void;

class ExhaustProcessor extends AudioWorkletProcessor {
  private engine: ExhaustWaveguide | null = null;
  private running = true;
  static get parameterDescriptors() {
    return [
      { name: 'rpm', defaultValue: 1000, minValue: 0, maxValue: 24000, automationRate: 'k-rate' },
      { name: 'load', defaultValue: 0, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
    ];
  }
  constructor(options?: {
    processorOptions?: {
      profile: VehicleAudioProfile;
      tuning?: Partial<ExhaustTuning>;
    };
  }) {
    super();
    const initial = options?.processorOptions;
    if (initial) this.configure(initial.profile, initial.tuning);
    this.port.onmessage = ({ data }) => {
      if (data === 'stop') {
        this.running = false;
        this.engine = null;
      } else if (data === null) this.engine = null;
      else {
        try {
          this.configure(data.profile, data.tuning);
        } catch {
          this.engine = null;
        }
      }
    };
  }
  private configure(profile: VehicleAudioProfile, tuning: Partial<ExhaustTuning> = {}): void {
    this.engine = new ExhaustWaveguide(compileVehicleAudioProfile(profile), sampleRate, tuning);
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
    for (let i = 0; i < output.length; i++) output[i] = this.engine.sample(rpm, load);
    return true;
  }
}
registerProcessor('exhaust-waveguide', ExhaustProcessor);
