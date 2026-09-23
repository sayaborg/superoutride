import type { TireAudioObservation } from '../../src/audio/vehicle-audio-observation.js';
import { mustGet } from '../../src/shell/dom.js';
import { createTireVoice } from '../../src/audio/tire-voice.js';
import { createVehicleAudioObservation } from '../../src/shell/vehicle-audio.js';
import { TIRE_AUDITION_PHASES as phases, TIRE_AUDITION_SECONDS as seconds } from './tire-scenarios.js';
const result = mustGet<HTMLElement>('result');
let playback: AudioContext | undefined,
  playing: AudioBufferSourceNode | null | undefined,
  generation = 0;
function stop() {
  generation++;
  playing?.stop();
  playing?.disconnect();
  playing = null;
}
async function render(rate: number, axles: string) {
  const context = new OfflineAudioContext(1, rate * seconds, rate);
  await context.audioWorklet.addModule(new URL('./tire-processor.js', import.meta.url));
  const voice = createTireVoice(context, context.destination);
  const state = createVehicleAudioObservation();

  function apply(phase: Partial<TireAudioObservation>) {
    for (const axle of ['front', 'rear'] as const)
      if (axles === 'both' || axles === axle) Object.assign(state[axle], phase);
    voice.update(state);
  }
  apply(phases[0]!);
  for (let i = 1; i < phases.length; i++)
    void context.suspend(i).then(() => {
      apply(phases[i]!);
      return context.resume();
    });
  try {
    return await context.startRendering();
  } finally {
    voice.dispose();
  }
}
mustGet<HTMLElement>('stop').onclick = () => {
  stop();
  result.textContent = '停止';
};
mustGet<HTMLElement>('play').onclick = async () => {
  stop();
  const current = generation;
  try {
    playback ??= new AudioContext();
    await playback.resume();
    result.textContent = '準備中';
    const buffer = await render(48000, mustGet<HTMLSelectElement>('axles').value);
    if (current !== generation) return;
    playing = playback.createBufferSource();
    playing.buffer = buffer;
    playing.connect(playback.destination);
    playing.start();
    result.textContent = '再生中：直進 → 横滑り → 回復 → ロック → 土 → 停止';
    playing.onended = () => {
      if (current === generation) result.textContent = '再生終了';
    };
  } catch (error) {
    if (current === generation) result.textContent = String(error);
  }
};
document.addEventListener('visibilitychange', () => {
  if (document.hidden) stop();
});
window.addEventListener('pagehide', () => {
  stop();
  void playback?.close();
});
