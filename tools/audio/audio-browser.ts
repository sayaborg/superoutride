import { mustGet } from '../../src/shell/dom.js';
import { REFLECTION_REFERENCE, PIPE_COEFFICIENTS } from '../../src/audio/exhaust-acoustics.js';
import { DEFAULT_AUDIO_SETTINGS } from '../../src/audio/audio-defaults.js';
// The audition has no delivered audio document: it hears the implementer's defaults.
const { exhaust: defaultExhaust, control: defaultControl } = DEFAULT_AUDIO_SETTINGS;
import { mountEngineSoundSettings } from '../../src/shell/controls/engine-sound-settings-controls.js';
import { createEngineVoice } from '../../src/audio/engine-voice.js';
import { loadVehicleDefinitions } from '../../src/content/vehicle-catalog.js';
import { loadEngineSounds } from '../../src/content/engine-sound-catalog.js';
import { loadContentManifest } from '../../src/content/content-delivery.js';
const content = await loadContentManifest(new URL('../../delivery/', import.meta.url));
const { vehicles } = await loadVehicleDefinitions(content, await loadEngineSounds(content));
import { createVehicleAudioObservation } from '../../src/audio/vehicle-audio-observation.js';
const vehicle = mustGet<HTMLSelectElement>('vehicle');
for (const entry of vehicles) {
  const option = document.createElement('option');
  option.value = String(vehicle.options.length);
  option.textContent = entry.compiledVehicle.id;
  vehicle.append(option);
}
mustGet<HTMLElement>('reference-conditions').textContent =
  `Reference conditions (assumed): bore ${REFLECTION_REFERENCE.radiusMeters * 2000} mm, air at ${(REFLECTION_REFERENCE.temperatureK - 273.15).toFixed(0)} ℃, open pipe end. Pipe losses approximated at ${REFLECTION_REFERENCE.frequencyHz} Hz. Not measured on real vehicles. Derived pipe coefficients (constants): outlet reflection ${PIPE_COEFFICIENTS.outletReflection}, return high-frequency limit ${PIPE_COEFFICIENTS.returnCutoffHz} Hz, attenuation ${PIPE_COEFFICIENTS.attenuationPerMeter} Np/m. Closed-throttle excitation is a sound-design setting.`;
mustGet<HTMLElement>('output-conditions').textContent =
  `Sound-design and output settings: smoothing ${(defaultControl.observationSeconds * 1000).toFixed(0)} ms. Output order: DC removal (default ${defaultExhaust.dcHz} Hz) → soft clip (default ceiling ${defaultExhaust.clipCeiling}) → final LPF (first order, adjust with − / +, default ${defaultExhaust.outputCutoffHz} Hz). Kept separate from the exhaust's physical quantities.`;
mustGet<HTMLElement>('boundary-conditions').textContent =
  `Boundary settings (defaults, adjust with − / +): closed-end pressure reflection ${defaultExhaust.cylinderClosedReflection}, open side ${defaultExhaust.cylinderOpenReflection}, opening window ${defaultExhaust.cylinderWindowCycles} of the firing period. Gives waves returning to the cylinder a periodic boundary change. Not measured valve timing or flow.`;
const engineSoundSettings = mountEngineSoundSettings(
  mustGet<HTMLElement>('engine-sound-settings'),
  DEFAULT_AUDIO_SETTINGS.exhaust,
  () => {},
);
const readSettings = engineSoundSettings.read;
function showVehicleData() {
  const { sound, compiledVehicle } = vehicles[Number(vehicle.value)]!;
  const cycleDegrees = sound.cycleRevolutions * 360;
  mustGet<HTMLElement>('vehicle-summary').textContent =
    `${compiledVehicle.id} / ${sound.firingPhases.length} cylinders / ${sound.cycleRevolutions * 2}-stroke / cycle ${cycleDegrees}° / idle ${compiledVehicle.powertrain.idleRpm} RPM / redline ${compiledVehicle.powertrain.redlineRpm} RPM`;
  const body = mustGet<HTMLElement>('vehicle-pipes');
  body.replaceChildren();
  const degrees = (value: number) => `${Number(value.toFixed(2))}°`;
  const meters = (value: number) => `${value.toFixed(2)} m`;
  const { pipes } = sound.exhaust;
  const pipesText = pipes
    .map(
      ({ length, from, to }) =>
        `${String.fromCharCode(65 + from)}→${to === null ? 'outlet' : String.fromCharCode(65 + to)} ${meters(length)}`,
    )
    .join(', ');
  // Shortest pipe path from a junction to an open end.
  const openPath = (start: number): number => {
    const best = new Map<number, number>([[start, 0]]);
    let result = Infinity;
    for (let changed = true; changed;) {
      changed = false;
      for (const { length, from, to } of pipes)
        for (const [a, b] of [
          [from, to],
          [to, from],
        ] as const) {
          const here = a === null ? undefined : best.get(a);
          if (here === undefined) continue;
          if (b === null) result = Math.min(result, here + length);
          else if (here + length < (best.get(b) ?? Infinity)) {
            best.set(b, here + length);
            changed = true;
          }
        }
    }
    return result;
  };
  sound.firingPhases.forEach((phase, i, phases) => {
    const next = i + 1 < phases.length ? phases[i + 1]! : phases[0]! + 1;
    const length = sound.exhaust.lengths[i]!;
    const row = document.createElement('tr');
    for (const value of [
      i + 1,
      degrees(phase * cycleDegrees),
      degrees((next - phase) * cycleDegrees),
      String.fromCharCode(65 + sound.exhaust.banks[i]!),
      meters(length),
      pipesText,
      meters(length + openPath(sound.exhaust.banks[i]!)),
    ]) {
      const cell = document.createElement('td');
      cell.textContent = String(value);
      row.append(cell);
    }
    body.append(row);
  });
  mustGet<HTMLElement>('vehicle-pulse').textContent =
    'Pulses are shared by every vehicle: reference strength 1. Adjust rise and decay with − / + above.';
}
vehicle.onchange = showVehicleData;
vehicle.value = '1';
showVehicleData();
let playback: AudioContext | undefined,
  playing: AudioBufferSourceNode | null | undefined,
  request = 0;
const listening = mustGet<HTMLElement>('listening');
function stop() {
  request++;
  playing?.stop();
  playing?.disconnect();
  playing = null;
  listening.textContent = 'Stopped';
}
mustGet<HTMLElement>('stop').onclick = stop;
async function audition() {
  stop();
  const current = request;
  try {
    playback ??= new AudioContext();
    await playback.resume();
    const settings = readSettings();
    const scenario = mustGet<HTMLSelectElement>('scenario').value;
    const entry = vehicles[Number(vehicle.value)]!;
    const context = new OfflineAudioContext(1, 4 * 48000, 48000);
    const state = createVehicleAudioObservation();
    const { idleRpm, redlineRpm } = entry.compiledVehicle.powertrain;
    Object.assign(state, {
      rpm: Number(mustGet<HTMLInputElement>('rpm').value) || 3000,
      effectiveOpening: Number(mustGet<HTMLSelectElement>('load').value),
    });
    await context.audioWorklet.addModule(new URL('./exhaust-processor.js', import.meta.url));
    const voice = createEngineVoice(context, context.destination, {
      sound: entry.sound,
      settings,
    });
    voice.update(state, entry.sound);
    if (scenario === 'rev') {
      const target = Math.max(idleRpm, Math.min(state.rpm, redlineRpm));
      state.rpm = idleRpm;
      state.effectiveOpening = 0;
      voice.update(state, entry.sound);
      for (let tick = 20; tick < 80; tick++) {
        const time = tick / 20;
        void context.suspend(time).then(() => {
          const accelerating = time < 2.5;
          state.effectiveOpening = accelerating ? 1 : 0;
          const fraction = accelerating ? (time - 1) / 1.5 : 1 - (time - 2.5) / 1.5;
          state.rpm = idleRpm + (target - idleRpm) * fraction;
          voice.update(state, entry.sound);
          return context.resume();
        });
      }
    }
    const rendered = await context.startRendering();
    voice?.dispose();
    if (current !== request) return;
    const samples = rendered.getChannelData(0).subarray(48000);
    const buffer = playback.createBuffer(1, samples.length, 48000);
    const output = buffer.getChannelData(0);
    for (let i = 0; i < output.length; i++) {
      const fade = Math.min(1, i / 960, (output.length - 1 - i) / 960);
      output[i] = samples[i]! * 0.6 * fade;
    }
    playing = playback.createBufferSource();
    playing.buffer = buffer;
    playing.connect(playback.destination);
    playing.onended = () => {
      if (current === request) listening.textContent = 'Finished';
    };
    playing.start();
    listening.textContent = `WAVEGUIDE · ${entry.compiledVehicle.id}`;
  } catch (error) {
    if (current === request) listening.textContent = String(error);
  }
}
mustGet<HTMLElement>('play').onclick = audition;
document.addEventListener('visibilitychange', () => {
  if (document.hidden) stop();
});
window.addEventListener('pagehide', () => {
  stop();
  void playback?.close();
});
