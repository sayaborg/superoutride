import { ExhaustWaveguide } from '../dist/audio/exhaust-waveguide.js';
import { compileVehicleAudioProfile } from '../dist/audio/vehicle-audio-profile.js';
class ReflectionProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: 'rpm', defaultValue: 1000, minValue: 0, maxValue: 24000, automationRate: 'k-rate' },
      { name: 'load', defaultValue: 0, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
    ];
  }
  constructor(options) {
    super();
    const { profile, tuning } = options.processorOptions;
    this.engine = new ExhaustWaveguide(compileVehicleAudioProfile(profile), sampleRate * 2, false, tuning);
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
    for (let i = 0; i < output.length; i++) {
      output[i] =
        (this.engine.sample(parameters.rpm[0], parameters.load[0]) +
          this.engine.sample(parameters.rpm[0], parameters.load[0])) *
        0.5;
    }
    return true;
  }
}
registerProcessor('reflection-candidate', ReflectionProcessor);
