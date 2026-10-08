/**
 * A worklet node's processor failure. After a `processorerror` the node renders silence; the voice's next update calls
 * the returned check, which throws, so the audio lifetime fails the graph and offers its retry. Every voice's worklets
 * report failure this one way.
 */
export function watchProcessor(node: AudioWorkletNode, name: string): () => void {
  let failed = false;
  node.onprocessorerror = () => {
    failed = true;
  };
  return () => {
    if (failed) throw new Error(`${name} processor failed`);
  };
}
