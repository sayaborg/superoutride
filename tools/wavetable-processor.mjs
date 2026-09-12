import { ExhaustTablePlayer } from './exhaust-wavetable.mjs';

class WavetableProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: 'rpm', defaultValue: 1000, minValue: 0, maxValue: 24000, automationRate: 'k-rate' },
      { name: 'load', defaultValue: 0, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
    ];
  }
  constructor(options) {
    super();
    this.engine = new ExhaustTablePlayer(options.processorOptions.bank, sampleRate * 2);
    this.port.onmessage = () => {
      this.engine = null;
    };
  }
  process(_inputs, outputs, parameters) {
    const output = outputs[0][0];
    if (!this.engine) {
      output.fill(0);
      return false;
    }
    for (let i = 0; i < output.length; i++)
      output[i] =
        (this.engine.sample(parameters.rpm[0], parameters.load[0]) +
          this.engine.sample(parameters.rpm[0], parameters.load[0])) *
        0.5;
    return true;
  }
}
registerProcessor('exhaust-wavetable', WavetableProcessor);
