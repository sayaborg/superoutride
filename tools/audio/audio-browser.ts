import { mustGet } from '../../src/shell/dom.js';
import { REFLECTION_REFERENCE, ACOUSTICS, DEFAULT_EXHAUST_TUNING, OUTPUT } from '../../src/audio/exhaust-acoustics.js';
import { AUDIO_TIMING } from '../../src/audio/audio-presentation.js';
import { mountAudioTuningControls } from '../../src/shell/audio-tuning-controls.js';
import { createEngineVoice } from '../../src/audio/engine-voice.js';
import { loadVehicleDefinitions } from '../../src/vehicle/definition-document.js';
import { loadContentManifest } from '../../src/core/content-manifest.js';
const { vehicles } = await loadVehicleDefinitions(
  await loadContentManifest(new URL('../../content/', import.meta.url)),
);
import { createVehicleAudioObservation } from '../../src/shell/vehicle-audio.js';
const vehicle = mustGet<HTMLSelectElement>('vehicle');
for (const entry of vehicles) {
  const option = document.createElement('option');
  option.value = String(vehicle.options.length);
  option.textContent = entry.compiledVehicle.id;
  vehicle.append(option);
}
mustGet<HTMLElement>('reference-conditions').textContent =
  `基準条件（仮定）：内径 ${REFLECTION_REFERENCE.radiusMeters * 2000} mm、温度 ${(REFLECTION_REFERENCE.temperatureK - 273.15).toFixed(0)} ℃の空気、開放管端。管内損失は ${REFLECTION_REFERENCE.frequencyHz} Hzで近似。実車の測定値ではありません。全閉時の励振は音作りの設定です。`;
mustGet<HTMLElement>('boundary-conditions').textContent =
  `境界の仮設定：閉端側の圧力反射 ${ACOUSTICS.cylinderClosedReflection}、開口側 ${ACOUSTICS.cylinderOpenReflection}、開口変化の幅は発火周期の ${ACOUSTICS.cylinderWindowCycles}。気筒への戻り波に周期的な境界変化を与えます。実測のバルブタイミングや流量ではありません。`;
mustGet<HTMLElement>('output-conditions').textContent =
  `音作り・出力の設定：追従 ${(AUDIO_TIMING.controlSeconds * 1000).toFixed(0)} ms。出力順：DC除去 ${OUTPUT.dcHz} Hz → ソフトクリップ（上限 ${OUTPUT.ceiling}）→ 最終LPF（一次、− / +で調整・初期値 ${DEFAULT_EXHAUST_TUNING.outputCutoffHz} Hz）。排気の物理量とは区別します。`;
const tuningControls = mountAudioTuningControls(mustGet<HTMLElement>('tuning-controls'), () => {});
const readTuning = tuningControls.read;
function showVehicleData() {
  const { sound, compiledVehicle } = vehicles[Number(vehicle.value)]!;
  const cycleDegrees = sound.cycleRevolutions * 360;
  mustGet<HTMLElement>('vehicle-summary').textContent =
    `${compiledVehicle.id} ／ ${sound.firingPhases.length}気筒 ／ ${sound.cycleRevolutions * 2}ストローク ／ 1周期 ${cycleDegrees}° ／ アイドル ${compiledVehicle.powertrain.idleRpm} RPM ／ 上限 ${compiledVehicle.powertrain.redlineRpm} RPM`;
  const body = mustGet<HTMLElement>('vehicle-pipes');
  body.replaceChildren();
  const degrees = (value: number) => `${Number(value.toFixed(2))}°`;
  const meters = (value: number) => `${value.toFixed(2)} m`;
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
      meters(sound.exhaust.outlet),
      meters(length + sound.exhaust.outlet),
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
    const tuning = readTuning();
    const scenario = mustGet<HTMLSelectElement>('scenario').value;
    const entry = vehicles[Number(vehicle.value)]!;
    const context = new OfflineAudioContext(1, 4 * 48000, 48000);
    const state = createVehicleAudioObservation();
    const { idleRpm, redlineRpm } = entry.compiledVehicle.powertrain;
    Object.assign(state, {
      rpm: Number(mustGet<HTMLInputElement>('rpm').value) || 3000,
      drive: Number(mustGet<HTMLSelectElement>('load').value),
    });
    await context.audioWorklet.addModule(new URL('./exhaust-processor.js', import.meta.url));
    const voice = createEngineVoice(context, context.destination, {
      profile: entry.sound,
      tuning,
    });
    voice.update(state, entry.sound);
    if (scenario === 'rev') {
      const target = Math.max(idleRpm, Math.min(state.rpm, redlineRpm));
      state.rpm = idleRpm;
      state.drive = 0;
      voice.update(state, entry.sound);
      for (let tick = 20; tick < 80; tick++) {
        const time = tick / 20;
        void context.suspend(time).then(() => {
          const accelerating = time < 2.5;
          state.drive = accelerating ? 1 : 0;
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
