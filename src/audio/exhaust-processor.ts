import { ExhaustWaveguide } from './exhaust-waveguide.js';
import type { ExhaustSettings } from './exhaust-acoustics.js';
import type { CompiledEngineSound } from './engine-sound.js';
import { compileEngineSound } from './engine-sound.js';
declare const sampleRate: number;
declare const AudioWorkletProcessor: { new (): { readonly port: MessagePort } };
declare function registerProcessor(name: string, processor: typeof AudioWorkletProcessor): void;

class ExhaustProcessor extends AudioWorkletProcessor {
  private engine: ExhaustWaveguide | null = null;
  private running = true;
  static get parameterDescriptors() {
    return [
      { name: 'rpm', defaultValue: 1000, minValue: 1, maxValue: 24000, automationRate: 'k-rate' },
      { name: 'load', defaultValue: 0, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
      { name: 'fuelCut', defaultValue: 0, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
      { name: 'blip', defaultValue: 0, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
    ];
  }
  constructor(options?: {
    processorOptions?: {
      sound: CompiledEngineSound;
      settings?: Partial<ExhaustSettings>;
    };
  }) {
    super();
    const initial = options?.processorOptions;
    if (initial) this.configure(initial.sound, initial.settings);
    this.port.onmessage = ({ data }) => {
      if (data === 'stop') {
        this.running = false;
        this.engine = null;
      } else if (data === null) this.engine = null;
      else {
        try {
          this.configure(data.sound, data.settings);
        } catch {
          this.engine = null;
        }
      }
    };
  }
  private configure(sound: CompiledEngineSound, settings: Partial<ExhaustSettings> = {}): void {
    this.engine = new ExhaustWaveguide(compileEngineSound(sound), sampleRate, settings);
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
      load = Math.max(parameters.load![0]!, parameters.blip![0]!);
    const fuelCut = parameters.fuelCut![0]! >= 0.5;
    for (let i = 0; i < output.length; i++) output[i] = this.engine.sample(rpm, load, fuelCut);
    return true;
  }
}
registerProcessor('exhaust-waveguide', ExhaustProcessor);
