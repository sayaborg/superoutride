/** Scheduling/ownership fake; real waveform rendering is checked by the browser audio probe. */
export class FakeAudioParam {
  value = 0;
  events = [];
  cancelAndHoldAtTime(time) {
    this.events.push(['hold', time]);
  }
  setTargetAtTime(value, time, tau) {
    this.value = value;
    this.events.push(['target', value, time, tau]);
  }
}
class Node {
  connections = [];
  disconnected = false;
  constructor(context) {
    context.nodes.push(this);
    for (const key of ['gain', 'frequency', 'Q', 'pan', 'threshold', 'knee', 'ratio', 'attack', 'release'])
      this[key] = new FakeAudioParam();
  }
  connect(target) {
    this.connections.push(target);
    return target;
  }
  disconnect() {
    this.disconnected = true;
  }
  start() {
    this.started = true;
  }
  stop() {
    this.stopped = true;
  }
  setPeriodicWave(wave) {
    this.wave = wave;
  }
}
export class FakeAudioContext {
  static instances = [];
  static load = () => Promise.resolve();
  static failResume = false;
  nodes = [];
  state = 'suspended';
  currentTime = 0;
  sampleRate = 48000;
  destination = {};
  audioWorklet = {
    addModule: (url) => {
      this.moduleUrl = String(url);
      return FakeAudioContext.load();
    },
  };
  constructor() {
    FakeAudioContext.instances.push(this);
  }
  createGain() {
    return new Node(this);
  }
  createBiquadFilter() {
    return new Node(this);
  }
  createDynamicsCompressor() {
    return new Node(this);
  }
  createStereoPanner() {
    return new Node(this);
  }
  createOscillator() {
    return new Node(this);
  }
  createPeriodicWave(real, imag) {
    return { real, imag };
  }
  async resume() {
    if (FakeAudioContext.failResume) throw new Error('resume denied');
    this.state = 'running';
  }
  async suspend() {
    this.state = 'suspended';
  }
  async close() {
    this.state = 'closed';
  }
}
export class FakeAudioWorkletNode extends Node {
  port = {
    postMessage: () => {
      this.finished = true;
    },
    close: () => {},
  };
}
