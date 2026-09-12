import { follow } from '../dist/audio/audio-parameter.js';

// Diagnostic only: the accepted waveguide and its original output gain, never game nodes.
export async function createReferenceVoice(context, destination, profile) {
  await context.audioWorklet.addModule(new URL('./reference-processor.mjs', import.meta.url));
  const node = new AudioWorkletNode(context, 'reference-exhaust', {
    numberOfInputs: 0,
    numberOfOutputs: 1,
    outputChannelCount: [1],
    processorOptions: { profile },
  });
  const gain = context.createGain();
  gain.gain.value = 0;
  node.connect(gain).connect(destination);
  return {
    update(state) {
      follow(
        node.parameters.get('rpm'),
        Math.max(state.idleRpm, Math.min(state.rpm, state.redlineRpm)),
        context.currentTime,
      );
      follow(
        node.parameters.get('load'),
        Math.max(0, Math.min(1, 0.7 * state.throttle + 0.3 * state.drive)),
        context.currentTime,
      );
      follow(gain.gain, profile.pulse.strength, context.currentTime);
    },
    dispose() {
      node.port.postMessage('stop');
      node.port.close();
      node.disconnect();
      gain.disconnect();
    },
  };
}
