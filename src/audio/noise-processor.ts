import './exhaust-processor.js';
// AudioWorklet global declarations are not included in TypeScript's DOM library.
declare const AudioWorkletProcessor: {
  new (): { readonly port: MessagePort };
};
declare function registerProcessor(name: string, processor: typeof AudioWorkletProcessor): void;

/** Continuous independent noise streams. No buffers, allocation or messages in the render loop. */
class DrivingNoise extends AudioWorkletProcessor {
  private seeds = new Int32Array([123456789, 362436069, 521288629]);
  private running = true;
  constructor() {
    super();
    this.port.onmessage = () => {
      this.running = false;
    };
  }
  process(_inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
    if (!this.running) return false;
    for (let stream = 0; stream < outputs.length; stream += 1) {
      let seed = this.seeds[stream]!;
      const channel = outputs[stream]![0]!;
      for (let i = 0; i < channel.length; i += 1) {
        seed ^= seed << 13;
        seed ^= seed >>> 17;
        seed ^= seed << 5;
        channel[i] = seed / 2147483648;
      }
      this.seeds[stream] = seed;
    }
    return true;
  }
}
registerProcessor('driving-noise', DrivingNoise);
export {};
