import { TireSynthesis } from './tire-synthesis.js';
declare const sampleRate: number;
declare const AudioWorkletProcessor: { new (): { readonly port: MessagePort } };
declare function registerProcessor(name: string, processor: typeof AudioWorkletProcessor): void;

class TireProcessor extends AudioWorkletProcessor {
  private readonly front = new TireSynthesis(sampleRate, 123456789);
  private readonly rear = new TireSynthesis(sampleRate, 362436069);
  private running = true;
  constructor() {
    super();
    this.port.onmessage = ({ data }) => {
      if (data === 'stop') this.running = false;
      else if (
        data &&
        [data.front, data.rear].every(
          (value) =>
            value &&
            ['rolling', 'friction', 'squeal', 'cutoff'].every((key) => Number.isFinite(value[key])) &&
            value.rolling >= 0 &&
            value.rolling <= 1 &&
            value.friction >= 0 &&
            value.friction <= 1 &&
            value.squeal >= 0 &&
            value.squeal <= 1 &&
            value.cutoff >= 100 &&
            value.cutoff <= 10000,
        )
      ) {
        this.front.update(data.front);
        this.rear.update(data.rear);
      } else {
        const silent = { rolling: 0, friction: 0, squeal: 0, cutoff: 900 as const };
        this.front.update(silent);
        this.rear.update(silent);
      }
    };
  }
  process(_inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
    if (!this.running) return false;
    const output = outputs[0]?.[0];
    if (output) for (let i = 0; i < output.length; i++) output[i] = this.front.sample() + this.rear.sample();
    return true;
  }
}
registerProcessor('vehicle-tires', TireProcessor);
