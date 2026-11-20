import { ExhaustRenderer, type ExhaustRateDivisor } from './exhaust-rate.js';
import { EngineChain } from './engine-chain.js';
import type { ControlSettings } from './audio-control-policy.js';
import type { VehicleEngineSound } from './vehicle-engine-sound.js';
import { ProcessingMeter } from './processing-meter.js';
import { WorkletRest } from './worklet-rest.js';
declare const sampleRate: number;
declare const AudioWorkletProcessor: { new (): { readonly port: MessagePort } };
declare function registerProcessor(name: string, processor: typeof AudioWorkletProcessor): void;

/** What the voice installs: an admitted sound and control, its kernel's divisor and the gain for that divisor. */
export interface ExhaustConfiguration {
  readonly sound: VehicleEngineSound;
  readonly control: ControlSettings;
  readonly divisor: ExhaustRateDivisor;
  readonly gain: number;
}

class ExhaustProcessor extends AudioWorkletProcessor {
  private engine: { readonly renderer: ExhaustRenderer; readonly chain: EngineChain } | null = null;
  private running = true;
  private readonly meter = new ProcessingMeter(this.port, sampleRate);
  private readonly rest = new WorkletRest();
  // One render quantum's targets and sound, sized at the first quantum.
  private rpm = new Float64Array(0);
  private load = new Float64Array(0);
  private pressure = new Float64Array(0);
  static get parameterDescriptors() {
    return [
      // An author value above every catalog redline; the parameter's range is the only bound on rpm
      // ([Audio](../../docs/audio.md)).
      { name: 'rpm', defaultValue: 1000, minValue: 1, maxValue: 24000, automationRate: 'k-rate' },
      { name: 'load', defaultValue: 0, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
      { name: 'fuelCut', defaultValue: 0, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
      { name: 'blip', defaultValue: 0, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
    ];
  }
  constructor(options?: { processorOptions?: ExhaustConfiguration }) {
    super();
    const initial = options?.processorOptions;
    if (initial) this.configure(initial);
    this.port.onmessage = ({ data }) => {
      if (this.meter.receive(data) || this.rest.receive(data)) return;
      if (data === 'stop') {
        this.running = false;
        this.engine = null;
      } else if (data === null) this.engine = null;
      else {
        try {
          this.configure(data);
        } catch {
          this.engine = null;
        }
      }
    };
  }
  /** The voice sends an admitted configuration, used as given; the kernel and the chain start from silence. */
  private configure({ sound, control, divisor, gain }: ExhaustConfiguration): void {
    this.engine = {
      renderer: new ExhaustRenderer(sound, sampleRate, divisor, control),
      chain: new EngineChain(sampleRate, gain),
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
    const started = this.meter.begin();
    if (this.rest.resting) {
      output.fill(0);
      this.meter.end(started, output.length);
      return true;
    }
    const rpm = parameters.rpm![0]!,
      load = Math.max(parameters.load![0]!, parameters.blip![0]!);
    const burns = parameters.fuelCut![0]! < 0.5;
    if (this.pressure.length !== output.length) {
      this.rpm = new Float64Array(output.length);
      this.load = new Float64Array(output.length);
      this.pressure = new Float64Array(output.length);
    }
    this.rpm.fill(rpm);
    this.load.fill(load);
    // The exhaust's sound at the output's rate, then the engine's chain: compressor, gain, soft clip.
    const { renderer, chain } = this.engine;
    renderer.render(this.pressure, 0, output.length, this.rpm, this.load, burns);
    for (let i = 0; i < output.length; i++) output[i] = chain.process(this.pressure[i]!);
    this.meter.end(started, output.length);
    return true;
  }
}
registerProcessor('exhaust-waveguide', ExhaustProcessor);
