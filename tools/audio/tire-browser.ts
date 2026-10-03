import { mustGet } from '../../src/shell/dom.js';
import { createTireVoice } from '../../src/audio/tire-voice.js';
import { createVehicleAudioObservation, type TireAudioObservation } from '../../src/audio/vehicle-audio-observation.js';
import { TIRE_AUDITION_PHASES as phases, TIRE_AUDITION_SECONDS as seconds } from './tire-scenarios.js';
import { resolveSurfaceSoundRecords } from '../../src/audio/surface-sounds.js';
import { loadContentManifest } from '../../src/content/content-manifest.js';
import { loadSurfaceMaterials } from '../../src/content/surface-material-catalog.js';
import { loadSurfaceSounds } from '../../src/content/surface-sound-catalog.js';
// The audition hears the delivered material catalog and surface-sound document, numbered as in the game.
const content = await loadContentManifest(new URL('../../delivery/', import.meta.url));
const materialIds = (await loadSurfaceMaterials(content)).source.materials.map((material) => material.id);
const surfaceSounds = {
  materialIds,
  surfaces: resolveSurfaceSoundRecords(await loadSurfaceSounds(content), materialIds),
};
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
  const voice = createTireVoice(context, context.destination, surfaceSounds);
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
  result.textContent = 'Stopped';
};
mustGet<HTMLElement>('play').onclick = async () => {
  stop();
  const current = generation;
  try {
    playback ??= new AudioContext();
    await playback.resume();
    result.textContent = 'Preparing';
    const buffer = await render(48000, mustGet<HTMLSelectElement>('axles').value);
    if (current !== generation) return;
    playing = playback.createBufferSource();
    playing.buffer = buffer;
    playing.connect(playback.destination);
    playing.start();
    result.textContent = 'Playing: straight → sideslip → recovery → lock → dirt → stop';
    playing.onended = () => {
      if (current === generation) result.textContent = 'Finished';
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
