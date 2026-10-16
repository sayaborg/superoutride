import { ExhaustWaveguide } from './exhaust-waveguide.js';
import { softClip, type ExhaustSettings } from './exhaust-acoustics.js';
import type { ControlSettings } from './audio-control-policy.js';
import type { VehicleEngineSound } from './vehicle-engine-sound.js';
import { ProcessingMeter } from './processing-meter.js';
import { WorkletRest } from './worklet-rest.js';
declare const sampleRate: number;
declare const AudioWorkletProcessor: { new (): { readonly port: MessagePort } };
declare function registerProcessor(name: string, processor: typeof AudioWorkletProcessor): void;

class ExhaustProcessor extends AudioWorkletProcessor {
  private engine: ExhaustWaveguide | null = null;
  private drive = 1;
  private ceiling = 1;
  private running = true;
  private readonly meter = new ProcessingMeter(this.port, sampleRate);
  private readonly rest = new WorkletRest();
  // One render quantum's targets and pressure, sized at the first quantum.
  private rpm = new Float64Array(0);
  private load = new Float64Array(0);
  private pressure = new Float64Array(0);
  static get parameterDescriptors() {
    return [
      // An author value above every catalog redline; the parameter's range is the only bound on rpm ([Audio](audio.md)).
      { name: 'rpm', defaultValue: 1000, minValue: 1, maxValue: 24000, automationRate: 'k-rate' },
      { name: 'load', defaultValue: 0, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
      { name: 'fuelCut', defaultValue: 0, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
      { name: 'blip', defaultValue: 0, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
    ];
  }
  constructor(options?: {
    processorOptions?: {
      sound: VehicleEngineSound;
      settings: ExhaustSettings;
      control: ControlSettings;
      drive: number;
    };
  }) {
    super();
    const initial = options?.processorOptions;
    if (initial) this.configure(initial.sound, initial.settings, initial.control, initial.drive);
    this.port.onmessage = ({ data }) => {
      if (this.meter.receive(data) || this.rest.receive(data)) return;
      if (data === 'stop') {
        this.running = false;
        this.engine = null;
      } else if (data === null) this.engine = null;
      else {
        try {
          this.configure(data.sound, data.settings, data.control, data.drive);
        } catch {
          this.engine = null;
        }
      }
    };
  }
  /** The voice sends an admitted sound, admitted settings and the drive into the soft clip, used as given. */
  private configure(
    sound: VehicleEngineSound,
    settings: ExhaustSettings,
    control: ControlSettings,
    drive: number,
  ): void {
    this.engine = new ExhaustWaveguide(sound, sampleRate, settings, control);
    this.drive = drive;
    this.ceiling = settings.clipCeiling;
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
    const fuelCut = parameters.fuelCut![0]! >= 0.5;
    if (this.pressure.length !== output.length) {
      this.rpm = new Float64Array(output.length);
      this.load = new Float64Array(output.length);
      this.pressure = new Float64Array(output.length);
    }
    this.rpm.fill(rpm);
    this.load.fill(load);
    // The exhaust's pressure, then the listening stage: the drive to the mix's engine loudness and the soft clip.
    this.engine.render(this.pressure, 0, output.length, this.rpm, this.load, fuelCut);
    for (let i = 0; i < output.length; i++) output[i] = softClip(this.drive * this.pressure[i]!, this.ceiling);
    this.meter.end(started, output.length);
    return true;
  }
}
registerProcessor('exhaust-waveguide', ExhaustProcessor);
