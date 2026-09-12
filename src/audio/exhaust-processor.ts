import { ExhaustWaveguide } from './exhaust-waveguide.js';
import type { DEFAULT_REFLECTION_TUNING } from './exhaust-acoustics.js';
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
      coupled?: boolean;
      tuning?: Partial<typeof DEFAULT_REFLECTION_TUNING>;
    };
  }) {
    super();
    const initial = options?.processorOptions;
    if (initial)
      this.engine = new ExhaustWaveguide(
        compileVehicleAudioProfile(initial.profile),
        sampleRate * 2,
        initial.coupled,
        initial.tuning,
      );
    this.port.onmessage = ({ data }) => {
      if (data === 'stop') {
        this.running = false;
        this.engine = null;
      } else if (data === null) this.engine = null;
      else {
        try {
          this.engine = new ExhaustWaveguide(
            compileVehicleAudioProfile(data.profile),
            sampleRate * 2,
            data.coupled !== false,
            data.tuning,
          );
        } catch {
          this.engine = null;
        }
      }
    };
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
    for (let i = 0; i < output.length; i++) {
      // Two acoustic steps per output sample reduce event quantization and nonlinear aliasing.
      output[i] = (this.engine.sample(rpm, load) + this.engine.sample(rpm, load)) * 0.5;
    }
    return true;
  }
}
registerProcessor('exhaust-waveguide', ExhaustProcessor);
