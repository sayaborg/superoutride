import { follow } from '../dist/audio/audio-parameter.js';

// Audition-only composition; defaults and the game's worklet path are unchanged.
export async function createReflectionVoice(context, destination, profile, tuning, bank) {
  await context.audioWorklet.addModule(
    bank
      ? new URL('./wavetable-processor.mjs', import.meta.url)
      : new URL('./reflection-processor.mjs', import.meta.url),
  );
  const node = new AudioWorkletNode(context, bank ? 'exhaust-wavetable' : 'reflection-candidate', {
    numberOfInputs: 0,
    numberOfOutputs: 1,
    outputChannelCount: [1],
    processorOptions: bank ? { bank } : { profile, tuning },
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
      follow(node.parameters.get('load'), Math.max(0, Math.min(1, state.drive)), context.currentTime);
      follow(gain.gain, 1, context.currentTime);
    },
    dispose() {
      node.port.postMessage('stop');
      node.port.close();
      node.disconnect();
      gain.disconnect();
    },
  };
}
