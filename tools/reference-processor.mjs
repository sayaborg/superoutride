import { ExhaustWaveguide } from './waveguide-reference.mjs';
class ReferenceProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: 'rpm', defaultValue: 1000, automationRate: 'k-rate' },
      { name: 'load', defaultValue: 0, automationRate: 'k-rate' },
    ];
  }
  constructor(options) {
    super();
    this.engine = new ExhaustWaveguide(options.processorOptions.profile, sampleRate * 2);
    this.port.onmessage = () => {
      this.engine = null;
    };
  }
  process(_inputs, outputs, parameters) {
    if (!this.engine) {
      outputs[0][0].fill(0);
      return false;
    }
    const rpm = parameters.rpm[0],
      load = parameters.load[0];
    const output = outputs[0][0];
    for (let i = 0; i < output.length; i++)
      output[i] = (this.engine.sample(rpm, load) + this.engine.sample(rpm, load)) * 0.5;
    return true;
  }
}
registerProcessor('reference-exhaust', ReferenceProcessor);
