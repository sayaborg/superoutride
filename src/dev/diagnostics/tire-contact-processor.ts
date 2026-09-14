import { TireContactTrial } from './tire-contact-model.js';
import { CONTACT_INPUTS, CONTACT_TRIAL, type CONTACT_TEXTURES } from './tire-contact-settings.js';
declare const sampleRate: number;
declare const AudioWorkletProcessor: { new (): { readonly port: MessagePort } };
declare function registerProcessor(name: string, processor: typeof AudioWorkletProcessor): void;

class TireContactProcessor extends AudioWorkletProcessor {
  private readonly front: TireContactTrial;
  private readonly rear: TireContactTrial;
  private running = true;
  static get parameterDescriptors() {
    return ['front', 'rear'].flatMap((axle) =>
      Object.entries(CONTACT_INPUTS).map(([key, range]) => ({
        name: `${axle}_${key}`,
        defaultValue: 0,
        minValue: range.min,
        maxValue: range.max,
        automationRate: 'k-rate',
      })),
    );
  }
  constructor(options?: { processorOptions?: { texture?: keyof typeof CONTACT_TEXTURES } }) {
    super();
    const texture = options?.processorOptions?.texture ?? 'paved';
    this.front = new TireContactTrial(sampleRate, CONTACT_TRIAL.frontSeed, texture);
    this.rear = new TireContactTrial(sampleRate, CONTACT_TRIAL.rearSeed, texture);
    this.port.onmessage = ({ data }) => {
      if (data === 'stop') this.running = false;
    };
  }
  process(_inputs: Float32Array[][], outputs: Float32Array[][], p: Record<string, Float32Array>): boolean {
    if (!this.running) {
      for (const output of outputs) for (const channel of output) channel.fill(0);
      return false;
    }
    const fr = outputs[0]?.[0],
      ff = outputs[1]?.[0],
      rr = outputs[2]?.[0],
      rf = outputs[3]?.[0];
    if (!fr || !ff || !rr || !rf) return true;
    this.front.update(p.front_travelSpeed![0]!, p.front_slipSpeed![0]!, p.front_load![0]!);
    this.rear.update(p.rear_travelSpeed![0]!, p.rear_slipSpeed![0]!, p.rear_load![0]!);
    for (let i = 0; i < fr.length; i++) {
      this.front.sample();
      this.rear.sample();
      fr[i] = this.front.roadOutput;
      ff[i] = this.front.frictionOutput;
      rr[i] = this.rear.roadOutput;
      rf[i] = this.rear.frictionOutput;
    }
    return true;
  }
}
registerProcessor('tire-contact-trial', TireContactProcessor);
