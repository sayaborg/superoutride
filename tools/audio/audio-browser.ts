import { mustGet } from '../../src/shell/dom.js';
import { REFLECTION_REFERENCE, PIPE_COEFFICIENTS } from '../../src/audio/exhaust-acoustics.js';
import { DEFAULT_AUDIO_SETTINGS } from '../../src/audio/audio-defaults.js';
// The audition has no delivered audio document: it hears the implementer's defaults.
const { exhaust: defaultExhaust, control: defaultControl } = DEFAULT_AUDIO_SETTINGS;
import { mountEngineSoundSettings } from '../../src/shell/engine-sound-settings-controls.js';
import { createEngineVoice } from '../../src/audio/engine-voice.js';
import { loadVehicleDefinitions } from '../../src/content/vehicle-catalog.js';
import { loadEngineSounds } from '../../src/content/engine-sound-catalog.js';
import { loadContentManifest } from '../../src/content/content-manifest.js';
const content = await loadContentManifest(new URL('../../delivery/', import.meta.url));
const { vehicles } = await loadVehicleDefinitions(content, await loadEngineSounds(content));
import { createVehicleAudioObservation } from '../../src/shell/vehicle-audio.js';
const vehicle = mustGet<HTMLSelectElement>('vehicle');
for (const entry of vehicles) {
  const option = document.createElement('option');
  option.value = String(vehicle.options.length);
  option.textContent = entry.compiledVehicle.id;
  vehicle.append(option);
}
mustGet<HTMLElement>('reference-conditions').textContent =
  `基準条件（仮定）：内径 ${REFLECTION_REFERENCE.radiusMeters * 2000} mm、温度 ${(REFLECTION_REFERENCE.temperatureK - 273.15).toFixed(0)} ℃の空気、開放管端。管内損失は ${REFLECTION_REFERENCE.frequencyHz} Hzで近似。実車の測定値ではありません。導出した管の係数（定数）：出口の反射 ${PIPE_COEFFICIENTS.outletReflection}、戻りの高域上限 ${PIPE_COEFFICIENTS.returnCutoffHz} Hz、減衰 ${PIPE_COEFFICIENTS.attenuationPerMeter} Np/m。全閉時の励振は音作りの設定です。`;
mustGet<HTMLElement>('output-conditions').textContent =
  `音作り・出力の設定：追従 ${(defaultControl.observationSeconds * 1000).toFixed(0)} ms。出力順：DC除去（初期値 ${defaultExhaust.dcHz} Hz）→ ソフトクリップ（上限の初期値 ${defaultExhaust.clipCeiling}）→ 最終LPF（一次、− / +で調整・初期値 ${defaultExhaust.outputCutoffHz} Hz）。排気の物理量とは区別します。`;
mustGet<HTMLElement>('boundary-conditions').textContent =
  `境界の設定（初期値、− / +で調整）：閉端側の圧力反射 ${defaultExhaust.cylinderClosedReflection}、開口側 ${defaultExhaust.cylinderOpenReflection}、開口変化の幅は発火周期の ${defaultExhaust.cylinderWindowCycles}。気筒への戻り波に周期的な境界変化を与えます。実測のバルブタイミングや流量ではありません。`;
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
    `${compiledVehicle.id} ／ ${sound.firingPhases.length}気筒 ／ ${sound.cycleRevolutions * 2}ストローク ／ 1周期 ${cycleDegrees}° ／ アイドル ${compiledVehicle.powertrain.idleRpm} RPM ／ 上限 ${compiledVehicle.powertrain.redlineRpm} RPM`;
  const body = mustGet<HTMLElement>('vehicle-pipes');
  body.replaceChildren();
  const degrees = (value: number) => `${Number(value.toFixed(2))}°`;
  const meters = (value: number) => `${value.toFixed(2)} m`;
  const { pipes } = sound.exhaust;
  const pipesText = pipes
    .map(
      ({ length, from, to }) =>
        `${String.fromCharCode(65 + from)}→${to === null ? '出口' : String.fromCharCode(65 + to)} ${meters(length)}`,
    )
    .join('、');
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
    'パルスは全車種共通：基準強度1。立ち上がり・減衰は上の− / +で調整します。';
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
  listening.textContent = '停止';
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
      if (current === request) listening.textContent = '再生終了';
    };
    playing.start();
    listening.textContent = `WAVEGUIDE・${entry.compiledVehicle.id}`;
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
