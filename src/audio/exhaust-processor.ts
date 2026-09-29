import { ExhaustWaveguide } from './exhaust-waveguide.js';
import type { ExhaustSettings } from './exhaust-acoustics.js';
import type { ControlSettings } from './audio-control-policy.js';
import type { EngineSound } from './engine-sound.js';
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
      sound: EngineSound;
      settings?: Partial<ExhaustSettings>;
      control?: Partial<ControlSettings>;
    };
  }) {
    super();
    const initial = options?.processorOptions;
    if (initial) this.configure(initial.sound, initial.settings, initial.control);
    this.port.onmessage = ({ data }) => {
      if (data === 'stop') {
        this.running = false;
        this.engine = null;
      } else if (data === null) this.engine = null;
      else {
        try {
          this.configure(data.sound, data.settings, data.control);
        } catch {
          this.engine = null;
        }
      }
    };
  }
  private configure(
    sound: EngineSound,
    settings: Partial<ExhaustSettings> = {},
    control: Partial<ControlSettings> = {},
  ): void {
    this.engine = new ExhaustWaveguide(compileEngineSound(sound), sampleRate, settings, control);
  }
  process(_inputs: Float32Array[][], outputs: Float32Array[][], parameters: Record<string, Float32Array>): boolean {
    if (!this.running) return false;
    const output = outputs[0]?.[0];
    if (!output) return true;
    if (!this.engine) {
      output.fill(0);
      return true;
    }
    const opening = parameters.load![0]!;
    const rpm = parameters.rpm![0]!,
      load = Math.max(opening, parameters.blip![0]!);
    const fuelCut = parameters.fuelCut![0]! >= 0.5;
    // Overrun reads the observed opening before the blip, so a blip suppresses pops.
    const overrun = opening === 0 && !fuelCut;
    for (let i = 0; i < output.length; i++) output[i] = this.engine.sample(rpm, load, fuelCut, overrun);
    return true;
  }
}
registerProcessor('exhaust-waveguide', ExhaustProcessor);
