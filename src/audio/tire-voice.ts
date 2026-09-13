import { tireParameters } from './tire-synthesis.js';
import type { VehicleAudioObservation } from './vehicle-audio-observation.js';

/** One fixed worklet with two independent axle sources, mixed at the player. */
export function createTireVoice(context: BaseAudioContext, destination: AudioNode) {
  const node = new AudioWorkletNode(context, 'vehicle-tires', {
    numberOfInputs: 0,
    numberOfOutputs: 1,
    outputChannelCount: [1],
  });
  node.connect(destination);
  return {
    update(state: VehicleAudioObservation): void {
      node.port.postMessage({ front: tireParameters(state.front), rear: tireParameters(state.rear) });
    },
    dispose(): void {
      node.port.postMessage('stop');
      node.port.close();
      node.disconnect();
    },
  };
}
