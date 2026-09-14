import { CONTACT_INPUTS, CONTACT_TEXTURES, CONTACT_ACOUSTICS } from '../dist/audio/tire-contact-acoustics.js';
import { follow } from '../dist/audio/audio-parameter.js';

const get = (id) => document.getElementById(id);
const controls = new Map();
for (const axle of ['front', 'rear']) {
  const group = document.createElement('fieldset');
  const legend = document.createElement('legend');
  legend.textContent = axle === 'front' ? 'Front' : 'Rear';
  group.append(legend);
  for (const [key, range] of Object.entries(CONTACT_INPUTS)) {
    const label = document.createElement('label'),
      input = document.createElement('input'),
      value = document.createElement('output');
    input.type = 'range';
    input.min = range.min;
    input.max = range.max;
    input.step = range.step;
    input.value = key === 'travelSpeed' ? 30 : key === 'load' ? 5 : 0;
    input.setAttribute('aria-label', `${axle} ${range.label}`);
    label.append(`${range.label}: `, value, input);
    group.append(label);
    const update = () => {
      value.textContent = input.value;
      current?.node?.parameters.get(`${axle}_${key}`).setValueAtTime(Number(input.value), current.context.currentTime);
    };
    input.addEventListener('input', update);
    controls.set(`${axle}_${key}`, { input, update });
    value.textContent = input.value;
  }
  get('controls').append(group);
}
for (const [id, texture] of Object.entries(CONTACT_TEXTURES)) {
  const option = document.createElement('option');
  option.value = id;
  option.textContent = texture.label;
  get('texture').append(option);
}
let current = null;
function setControls(front, rear) {
  for (const [axle, values] of [
    ['front', front],
    ['rear', rear],
  ])
    Object.keys(CONTACT_INPUTS).forEach((key, i) => {
      const control = controls.get(`${axle}_${key}`);
      control.input.value = values[i];
      control.update();
    });
}
const presets = {
  roll: [
    [30, 0, 5],
    [30, 0, 5],
  ],
  front: [
    [30, 0.5, 5],
    [30, 0, 5],
  ],
  rear: [
    [0, 0, 5],
    [0, 0.5, 5],
  ],
  both: [
    [30, 0.5, 5],
    [30, 0.8, 5],
  ],
  air: [
    [30, 0.5, 0],
    [30, 0.8, 0],
  ],
};
for (const button of document.querySelectorAll('[data-preset]'))
  button.addEventListener('click', () => setControls(...presets[button.dataset.preset]));
function mix() {
  if (!current?.taps) return;
  const axles = get('axles').value,
    components = get('components').value;
  current.taps.forEach((tap, i) => {
    const axle = i < 2 ? 'front' : 'rear',
      component = i % 2 === 0 ? 'road' : 'friction';
    follow(
      tap.gain,
      (axles === 'both' || axles === axle) && (components === 'both' || components === component) ? 1 : 0,
      current.context.currentTime,
    );
  });
}
function stop() {
  const retired = current;
  current = null;
  get('start').disabled = false;
  get('stop').disabled = true;
  get('texture').disabled = false;
  get('status').textContent = 'Stopped';
  if (retired) {
    retired.context.onstatechange = null;
    try {
      retired.node?.port.postMessage('stop');
      retired.node?.port.close();
    } finally {
      retired.node?.disconnect();
      retired.taps?.forEach((node) => node.disconnect());
      retired.master?.disconnect();
      void retired.context.close().catch(() => {});
    }
  }
}
async function start() {
  if (current) {
    await current.context.resume().catch((error) => {
      get('status').textContent = error.message;
    });
    return;
  }
  let state;
  try {
    const context = new AudioContext();
    state = { context };
    current = state;
    get('start').disabled = true;
    get('stop').disabled = false;
    get('texture').disabled = true;
    get('status').textContent = 'Starting…';
    const resumed = context.resume().then(
      () => true,
      () => false,
    );
    await context.audioWorklet.addModule(new URL('../dist/dev/diagnostics/tire-contact-processor.js', import.meta.url));
    if (current !== state) return;
    state.node = new AudioWorkletNode(context, 'tire-contact-trial', {
      numberOfInputs: 0,
      numberOfOutputs: 4,
      outputChannelCount: [1, 1, 1, 1],
      processorOptions: { texture: get('texture').value },
    });
    state.master = context.createGain();
    state.master.gain.value = CONTACT_ACOUSTICS.listeningGain;
    state.master.connect(context.destination);
    state.taps = Array.from({ length: 4 }, (_, i) => {
      const node = context.createGain();
      state.node.connect(node, i);
      node.connect(state.master);
      return node;
    });
    for (const control of controls.values()) control.update();
    mix();
    state.node.onprocessorerror = () => {
      if (current !== state) return;
      stop();
      get('status').textContent = 'Processor failed; stopped rather than clipping/resetting hidden state.';
    };
    if (!(await resumed)) throw new Error('Playback permission denied');
    if (current !== state) return;
    context.onstatechange = () => {
      if (current === state) {
        get('status').textContent = `${context.state} · ${context.sampleRate} Hz · fixed gain`;
        get('start').disabled = context.state === 'running';
      }
    };
    context.onstatechange();
  } catch (error) {
    if (!state || current === state) {
      stop();
      get('status').textContent = `Sound unavailable: ${error.message}`;
    }
  }
}
get('start').addEventListener('click', start);
get('stop').addEventListener('click', stop);
get('axles').addEventListener('change', mix);
get('components').addEventListener('change', mix);
window.addEventListener('pagehide', stop);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) stop();
});
