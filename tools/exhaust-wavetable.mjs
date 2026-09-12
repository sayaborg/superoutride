import { ExhaustWaveguide } from '../dist/audio/exhaust-waveguide.js';

// Audition approximation, not another gas model. Fixed capture budget; no recorded assets.
const RATE = 96000;
const SIZE = 4096;
const RPM_STEPS = 16;
const LOAD_STEPS = 4;

function capture(profile, tuning, rpm, load) {
  const engine = new ExhaustWaveguide(profile, RATE, false, tuning);
  let previous = 0;
  for (let i = 0; i < RATE * 2; i++) previous = engine.sample(rpm, load);
  let phase = engine.cyclePhase;
  // Start at the next phase-zero crossing, so neighboring tables have the same crank reference.
  let value;
  while (true) {
    value = engine.sample(rpm, load);
    if (engine.cyclePhase < phase) break;
    previous = value;
    phase = engine.cyclePhase;
  }
  phase -= 1;
  let next = engine.cyclePhase;
  const table = new Float32Array(SIZE);
  for (let i = 0; i < SIZE; i++) {
    const target = i / SIZE;
    while (next < target) {
      previous = value;
      phase = next;
      value = engine.sample(rpm, load);
      next = engine.cyclePhase;
      if (next < phase) next += 1;
    }
    table[i] = previous + ((target - phase) / (next - phase)) * (value - previous);
  }
  return table;
}

/** Prepare one vehicle/settings bank. Yield between captures so the audition UI stays responsive. */
export async function bakeExhaustTables(profile, tuning, idleRpm, redlineRpm, progress = () => {}) {
  const tables = [];
  const total = (RPM_STEPS + 1) * (LOAD_STEPS + 1);
  for (let r = 0; r <= RPM_STEPS; r++)
    for (let l = 0; l <= LOAD_STEPS; l++) {
      tables.push(capture(profile, tuning, idleRpm + ((redlineRpm - idleRpm) * r) / RPM_STEPS, l / LOAD_STEPS));
      progress(tables.length, total);
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  return {
    tables,
    idleRpm,
    redlineRpm,
    cycleRevolutions: profile.cycleRevolutions,
    rpmSteps: RPM_STEPS,
    loadSteps: LOAD_STEPS,
  };
}

function lookup(table, phase) {
  const position = phase * table.length;
  const index = Math.floor(position);
  const fraction = position - index;
  return table[index] + fraction * (table[(index + 1) % table.length] - table[index]);
}

/** Four neighboring periodic waves, phase-aligned and linearly interpolated. No pipe simulation. */
export class ExhaustTablePlayer {
  constructor(bank, rate) {
    this.bank = bank;
    this.rate = rate;
    this.phase = 0;
    this.rpm = bank.idleRpm;
    this.load = 0;
    this.smoothing = 1 - Math.exp(-1 / (0.025 * rate));
  }
  sample(rpm, load) {
    const b = this.bank;
    this.rpm += this.smoothing * (Math.max(b.idleRpm, Math.min(b.redlineRpm, rpm)) - this.rpm);
    this.load += this.smoothing * (Math.max(0, Math.min(1, load)) - this.load);
    this.phase = (this.phase + this.rpm / (60 * b.cycleRevolutions * this.rate)) % 1;
    const r = ((this.rpm - b.idleRpm) / (b.redlineRpm - b.idleRpm)) * b.rpmSteps;
    const l = this.load * b.loadSteps;
    const ri = Math.min(b.rpmSteps - 1, Math.floor(r));
    const li = Math.min(b.loadSteps - 1, Math.floor(l));
    const index = ri * (b.loadSteps + 1) + li;
    const a = lookup(b.tables[index], this.phase);
    const c = lookup(b.tables[index + b.loadSteps + 1], this.phase);
    const low = a + (l - li) * (lookup(b.tables[index + 1], this.phase) - a);
    const high = c + (l - li) * (lookup(b.tables[index + b.loadSteps + 2], this.phase) - c);
    return low + (r - ri) * (high - low);
  }
}
