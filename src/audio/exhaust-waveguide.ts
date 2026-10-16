import type { VehicleEngineSound } from './vehicle-engine-sound.js';

import { ACOUSTICS, OUTLET_REFLECTION, openEndCutoffHz, wallLossPoles, wallLossWeights } from './exhaust-acoustics.js';
import type { ExhaustSettings } from './exhaust-acoustics.js';
import type { ControlSettings } from './audio-control-policy.js';
import { DEFAULT_AUDIO_SETTINGS } from './audio-defaults.js';

/**
 * Below this |x| = |riseRate − decayRate| · duration, the pulse cascade uses its series. The closed form's second weight
 * `(first − e^−x)/x` subtracts two values near 1, losing about eps/|x| relative accuracy; the series truncated after x⁴
 * errs by at most |x|⁵/720 (first) and |x|⁵/840 (second). At 1e-2 both are below 3e-13 relative, far below the
 * worklet's 32-bit output resolution (about 6e-8), so either form is exact for the output on both sides of the switch.
 */
const PULSE_CASCADE_SERIES_LIMIT = 1e-2;

/**
 * Exact response over `duration` of a unit decaying pulse p' = -decayRate * p feeding two equal rise stages
 * r1' = riseRate * (p - r1), r2' = riseRate * (r1 - r2) from rest. Writes [pulse, r1, r2] into `weights`;
 * a series replaces the closed form near equal rates.
 */
function pulseCascade(decayRate: number, riseRate: number, duration: number, weights: Float64Array): void {
  const decay = Math.exp(-decayRate * duration);
  const x = (riseRate - decayRate) * duration;
  let first: number;
  let second: number;
  if (Math.abs(x) < PULSE_CASCADE_SERIES_LIMIT) {
    first = 1 - x / 2 + (x * x) / 6 - (x * x * x) / 24 + (x * x * x * x) / 120;
    second = 1 / 2 - x / 3 + (x * x) / 8 - (x * x * x) / 30 + (x * x * x * x) / 144;
  } else {
    first = -Math.expm1(-x) / x;
    second = (first - Math.exp(-x)) / x;
  }
  const rise = riseRate * duration;
  weights[0] = decay;
  weights[1] = rise * decay * first;
  weights[2] = rise * rise * decay * second;
}

/** The one-pole coefficient of an open end's return low-pass for a tube of `diameter`. */
const openEndFollow = (diameter: number, rate: number) =>
  1 - Math.exp((-2 * Math.PI * openEndCutoffHz(diameter)) / rate);

/** The longest block the kernel renders at once; a block is never longer than the shortest delay line. */
const MAX_BLOCK = 64;

/**
 * Acoustic state only: RPM is supplied by physics; no torque or crank dynamics. Each tube is a pair of delay lines, one
 * each way, of its length rounded to whole samples, whose writes pass its wall loss (`wallLossWeights`). The kernel
 * renders in blocks no longer than its shortest line, so every arrival a block reads was written before the block:
 * each block computes its sources, reads every line, scatters at every junction, then passes every line's leaving waves
 * through its loss and writes them. Every sample's arithmetic is the same as one sample rendered alone.
 */
export class ExhaustWaveguide {
  // Delay lines, in one buffer: each primary's forward (valve to junction), each primary's backward, each pipe's
  // downstream (from -> to), each pipe's upstream; each line's start, length and position.
  private readonly buffer: Float32Array;
  private readonly lineStart: Int32Array;
  private readonly lineLength: Int32Array;
  private readonly linePosition: Int32Array;
  // Wall loss: the poles shared by every line, each line's weights [C, R_0..R_3] and its four states.
  private readonly poles: Float64Array;
  private readonly lossWeights: Float64Array;
  private readonly lossStates: Float64Array;
  private readonly block: number;
  // Each junction J's ports, portStart[J] to portStart[J + 1]: its primaries (cylinder order), then each pipe's `from`
  // and `to` ends (pipe order); each port's arriving line and share of the junction's cross-section.
  private readonly portStart: Int32Array;
  private readonly portLine: Int32Array;
  private readonly portShare: Float64Array;
  private readonly pipeFrom: Int32Array;
  // Junction index, or -1 for an open end.
  private readonly pipeTo: Int32Array;
  // Each cylinder's junction (its primary's `to`).
  private readonly banks: Int32Array;
  // One block's values, `block` samples per row: each line's arriving and leaving waves, each junction's pressure,
  // each cylinder's emission and valve-end reflection, and the pickup.
  private readonly arriving: Float64Array;
  private readonly leaving: Float64Array;
  private readonly pressure: Float64Array;
  private readonly emissions: Float64Array;
  private readonly reflections: Float64Array;
  private readonly exhaust: Float64Array;
  private readonly pulse: Float64Array;
  private readonly rise: Float64Array;
  private readonly riseSecond: Float64Array;
  private readonly emission: Float64Array;
  // Each cylinder's firing phase, its greatest valve area over its primary's cross-section and the valve's open share.
  private readonly firingPhases: Float64Array;
  private readonly valveRatio: Float64Array;
  private readonly valveOpen: number;
  // The engine speed (RPM) over this divides into the phase step per sample.
  private readonly cycleSamples: number;
  // Low-passed outgoing wave at each pipe's open end (unused for junction-to-junction pipes), and its coefficient.
  private readonly outlet: Float64Array;
  private readonly outletFollow: Float64Array;
  private readonly openNormalization: number;
  private readonly smoothing: number;
  private readonly dcCoefficient: number;
  private readonly toneCoefficient: number;
  private readonly settings: ExhaustSettings;
  private phase = 0;
  private pulseSeed = 123456789;
  private rpm = 1000;
  private load = 0;
  private dc = 0;
  private tone = 0;
  // Reused cascade weights, so firing events do not allocate.
  private readonly weights = new Float64Array(3);
  // Cylinders of equal blowdown share a decay group: its rate per sample, its sample-average decay and its weights.
  private readonly cylinderGroup: Int32Array;
  private readonly decayRates: Float64Array;
  private readonly decayAverages: Float64Array;
  // Per-sample pulse weights of each decay group, for the excitation they were prepared for.
  private readonly decaySteps: Float64Array;
  private readonly firstCouplings: Float64Array;
  private readonly secondCouplings: Float64Array;
  // Per-sample rise weights shared by every pulse state.
  private riseRate = 0;
  private stageStep = 0;
  private stageLink = 0;
  private excitation = NaN;

  constructor(
    sound: VehicleEngineSound,
    private readonly rate: number,
    settings: ExhaustSettings = DEFAULT_AUDIO_SETTINGS.exhaust,
    control: ControlSettings = DEFAULT_AUDIO_SETTINGS.control,
  ) {
    this.settings = settings;
    const n = sound.firingPhases.length;
    const { primaries, pipes } = sound.exhaust;
    this.banks = Int32Array.from(primaries, ({ to }) => to);
    let groups = 0;
    for (const { to } of primaries) groups = Math.max(groups, to + 1);
    for (const { from, to } of pipes) groups = Math.max(groups, from + 1, (to ?? 0) + 1);
    const tubes = [...primaries, ...primaries, ...pipes, ...pipes];
    this.lineLength = Int32Array.from(tubes, ({ length }) =>
      Math.max(1, Math.round((length * rate) / ACOUSTICS.waveSpeed)),
    );
    this.lineStart = new Int32Array(tubes.length);
    let total = 0;
    this.lineLength.forEach((size, line) => {
      this.lineStart[line] = total;
      total += size;
    });
    this.buffer = new Float32Array(total);
    this.linePosition = new Int32Array(tubes.length);
    this.poles = wallLossPoles(rate);
    this.lossWeights = new Float64Array(5 * tubes.length);
    tubes.forEach(({ length, diameter }, line) =>
      this.lossWeights.set(wallLossWeights(length, diameter, rate), 5 * line),
    );
    this.lossStates = new Float64Array(4 * tubes.length);
    this.block = Math.min(MAX_BLOCK, ...this.lineLength);
    this.pipeFrom = Int32Array.from(pipes, ({ from }) => from);
    this.pipeTo = Int32Array.from(pipes, ({ to }) => to ?? -1);
    // Every port of a junction, its cylinders' primaries and each pipe end attached to it, weighted by its area.
    const area = ({ diameter }: { diameter: number }) => diameter * diameter;
    const junctionArea = new Float64Array(groups);
    for (const primary of primaries) junctionArea[primary.to]! += area(primary);
    for (const pipe of pipes) {
      junctionArea[pipe.from]! += area(pipe);
      if (pipe.to !== null) junctionArea[pipe.to]! += area(pipe);
    }
    // A primary's port receives its forward line, a pipe's `from` end its upstream line and its `to` end its downstream.
    const ports: { junction: number; line: number; share: number }[] = [];
    primaries.forEach((primary, i) =>
      ports.push({ junction: primary.to, line: i, share: area(primary) / junctionArea[primary.to]! }),
    );
    pipes.forEach((pipe, j) => {
      ports.push({ junction: pipe.from, line: 2 * n + pipes.length + j, share: area(pipe) / junctionArea[pipe.from]! });
      if (pipe.to !== null)
        ports.push({ junction: pipe.to, line: 2 * n + j, share: area(pipe) / junctionArea[pipe.to]! });
    });
    ports.sort((a, b) => a.junction - b.junction);
    this.portStart = new Int32Array(groups + 1);
    for (const { junction } of ports) this.portStart[junction + 1]!++;
    for (let junction = 0; junction < groups; junction++) this.portStart[junction + 1]! += this.portStart[junction]!;
    this.portLine = Int32Array.from(ports, ({ line }) => line);
    this.portShare = Float64Array.from(ports, ({ share }) => share);
    const block = this.block;
    this.arriving = new Float64Array(tubes.length * block);
    this.leaving = new Float64Array(tubes.length * block);
    this.pressure = new Float64Array(groups * block);
    this.emissions = new Float64Array(n * block);
    this.reflections = new Float64Array(n * block);
    this.exhaust = new Float64Array(block);
    this.outlet = new Float64Array(pipes.length);
    this.outletFollow = Float64Array.from(pipes, ({ diameter }) => openEndFollow(diameter, rate));
    const { valve } = sound.exhaust;
    this.firingPhases = Float64Array.from(sound.firingPhases);
    this.valveRatio = Float64Array.from(primaries, ({ diameter }) => (valve.diameter / diameter) ** 2);
    this.valveOpen = valve.open;
    this.cycleSamples = 60 * sound.cycleRevolutions * rate;
    this.pulse = new Float64Array(n);
    this.rise = new Float64Array(n);
    this.riseSecond = new Float64Array(n);
    this.emission = new Float64Array(n);
    // Blowdown lasts an absolute time, whatever the RPM: each decay rate is constant.
    const rates = sound.pulseDecaySeconds.map((seconds) => 1 / (seconds * rate));
    const distinct = [...new Set(rates)];
    this.cylinderGroup = Int32Array.from(rates, (decay) => distinct.indexOf(decay));
    this.decayRates = Float64Array.from(distinct);
    this.decayAverages = Float64Array.from(distinct, (decay) => -Math.expm1(-decay) / decay);
    this.decaySteps = new Float64Array(distinct.length);
    this.firstCouplings = new Float64Array(distinct.length);
    this.secondCouplings = new Float64Array(distinct.length);
    this.openNormalization = Math.sqrt(pipes.filter(({ to }) => to === null).length);
    this.smoothing = 1 - Math.exp(-1 / (control.observationSeconds * rate));
    this.dcCoefficient = 1 - Math.exp((-2 * Math.PI * sound.dcHz) / rate);
    this.toneCoefficient = 1 - Math.exp((-2 * Math.PI * sound.outputCutoffHz) / rate);
  }

  /** One seeded xorshift32 draw in [-1, 1); called only at firing events. */
  private draw(): number {
    this.pulseSeed ^= this.pulseSeed << 13;
    this.pulseSeed ^= this.pulseSeed >>> 17;
    this.pulseSeed ^= this.pulseSeed << 5;
    return this.pulseSeed / 2147483648;
  }

  /**
   * Advance one pulse state by a sample, emitting the sample average of r2. Integrating each stage equation gives
   * the exact average: mean(r2) = mean(p) - (delta r1 + delta r2) / riseRate.
   */
  private advancePulse(
    pulse: Float64Array,
    rise: Float64Array,
    riseSecond: Float64Array,
    emission: Float64Array,
    i: number,
    group: number,
  ): void {
    const p = pulse[i]!;
    const r1 = rise[i]!;
    const r2 = riseSecond[i]!;
    const nextFirst = this.stageStep * r1 + this.firstCouplings[group]! * p;
    const nextSecond = this.stageStep * r2 + this.stageLink * r1 + this.secondCouplings[group]! * p;
    emission[i] = this.decayAverages[group]! * p - (nextFirst - r1 + nextSecond - r2) / this.riseRate;
    rise[i] = nextFirst;
    riseSecond[i] = nextSecond;
    pulse[i] = p * this.decaySteps[group]!;
  }

  /** Fire an advanced pulse state `elapsed` samples before the sample end; both rise stages stay continuous. */
  private firePulse(
    pulse: Float64Array,
    rise: Float64Array,
    riseSecond: Float64Array,
    emission: Float64Array,
    i: number,
    group: number,
    strength: number,
    elapsed: number,
  ): void {
    const weights = this.weights;
    const decayRate = this.decayRates[group]!;
    pulseCascade(decayRate, this.riseRate, elapsed, weights);
    const decay = weights[0]!;
    const jump = strength - pulse[i]! / decay;
    rise[i]! += jump * weights[1]!;
    riseSecond[i]! += jump * weights[2]!;
    emission[i]! +=
      jump * (-Math.expm1(-decayRate * elapsed) / decayRate - (weights[1]! + weights[2]!) / this.riseRate);
    pulse[i] = strength * decay;
  }

  /** The rise weights and each decay group's one-sample cascade weights for `excitation`. */
  private prepareRise(excitation: number): void {
    const riseTime = ((this.settings.pulseRiseMs / 1000) * this.rate) / excitation;
    // Two stages of riseTime / 2 each keep the one-stage mean delay riseTime while the onset slope starts at zero.
    const riseRate = 2 / riseTime;
    this.riseRate = riseRate;
    this.stageStep = Math.exp(-riseRate);
    this.stageLink = riseRate * this.stageStep;
    for (let group = 0; group < this.decayRates.length; group++) {
      pulseCascade(this.decayRates[group]!, riseRate, 1, this.weights);
      this.decaySteps[group] = this.weights[0]!;
      this.firstCouplings[group] = this.weights[1]!;
      this.secondCouplings[group] = this.weights[2]!;
    }
  }

  /** Sample `b` of the block's sources: the control's smoothing, the phase, each cylinder's pulse and valve end. */
  private sources(b: number, targetRpm: number, targetLoad: number, fuelCut: boolean): void {
    this.rpm += this.smoothing * (targetRpm - this.rpm);
    this.load += this.smoothing * (targetLoad - this.load);
    const step = this.rpm / this.cycleSamples;
    const previous = this.phase;
    const phase = (previous + step) % 1;
    this.phase = phase;
    // One excitation control: stronger pulses also rise faster. No load-dependent output EQ/drive.
    // Fuel cut is a boolean observation, never smoothed: firings pump without combustion.
    const excitation = fuelCut
      ? this.settings.pumpingExcitation
      : this.settings.closedExcitation + (1 - this.settings.closedExcitation) * this.load;
    if (excitation !== this.excitation) {
      this.excitation = excitation;
      this.prepareRise(excitation);
    }
    const { block, valveOpen: open, firingPhases, emission, emissions, reflections } = this;
    for (let i = 0; i < firingPhases.length; i++) {
      const offset = firingPhases[i]!;
      const crossed = phase >= previous ? offset > previous && offset <= phase : offset > previous || offset <= phase;
      const group = this.cylinderGroup[i]!;
      this.advancePulse(this.pulse, this.rise, this.riseSecond, emission, i, group);
      if (crossed) {
        let strength = excitation;
        // Variation is combustion spread, so pumping pulses have none.
        // Random draws occur only at firing events, never as a continuous noise generator or a timing perturbation.
        if (!fuelCut && this.settings.pulseVariation > 0)
          strength = Math.max(0, excitation + this.settings.pulseVariation * this.draw());
        // Resolve the event inside this sample; preserve the continuous rise states at the reset.
        const elapsed = (phase >= offset ? phase - offset : phase - offset + 1) / step;
        this.firePulse(this.pulse, this.rise, this.riseSecond, emission, i, group, strength, elapsed);
      }
      emissions[i * block + b] = emission[i]!;
      // The valve opens at the firing phase and is open for `open` of the cycle; closed, it reflects +1.
      let since = phase - offset + 1;
      if (since >= 1) since -= 1;
      if (since >= open) {
        reflections[i * block + b] = 1;
        continue;
      }
      const position = since / open;
      const lift = position < 1 ? position * (1 - position) : 0;
      // Unit-height quartic aperture: zero value and slope at both ends, without a trig call.
      const area = this.valveRatio[i]! * 16 * lift * lift;
      // The valve end reflects by the open valve's area against the primary's: closed, +1; open, the wave passes on.
      reflections[i * block + b] = (1 - area) / (1 + area);
    }
  }

  /**
   * Render `count` samples into `out` from `offset`, without allocation: the exhaust's pressure at the pickup, DC
   * removed and kept below the widest outlet's first transverse mode. `rpm[k]` and `load[k]` are sample k's targets;
   * `fuelCut` holds for the whole call.
   */
  render(
    out: Float64Array,
    offset: number,
    count: number,
    rpm: ArrayLike<number>,
    load: ArrayLike<number>,
    fuelCut: boolean,
  ): void {
    for (let done = 0; done < count;) {
      const samples = Math.min(this.block, count - done);
      this.renderBlock(out, offset + done, samples, rpm, load, done, fuelCut);
      done += samples;
    }
  }

  private renderBlock(
    out: Float64Array,
    offset: number,
    samples: number,
    rpm: ArrayLike<number>,
    load: ArrayLike<number>,
    target: number,
    fuelCut: boolean,
  ): void {
    const block = this.block;
    for (let b = 0; b < samples; b++) this.sources(b, rpm[target + b]!, load[target + b]!, fuelCut);
    const { buffer, lineStart, lineLength, linePosition, arriving, leaving, pressure, exhaust } = this;
    const lines = lineLength.length;
    // Every line's arrivals, all written before this block.
    for (let line = 0; line < lines; line++) {
      const start = lineStart[line]!,
        size = lineLength[line]!;
      let index = linePosition[line]!;
      for (let b = 0; b < samples; b++) {
        arriving[line * block + b] = buffer[start + index]!;
        if (++index === size) index = 0;
      }
    }
    // Area-weighted scattering at every junction: p = 2 sum(area * incoming) / sum(area).
    const { portStart, portLine, portShare } = this;
    for (let junction = 0; junction + 1 < portStart.length; junction++)
      for (let b = 0; b < samples; b++) {
        let sum = 0;
        for (let port = portStart[junction]!; port < portStart[junction + 1]!; port++)
          sum += portShare[port]! * arriving[portLine[port]! * block + b]!;
        pressure[junction * block + b] = 2 * sum;
      }
    // Leaving waves: each pipe's downstream and upstream (or open end), then each primary's forward and backward.
    const n = this.pulse.length,
      pipes = this.pipeFrom.length;
    exhaust.fill(0, 0, samples);
    for (let j = 0; j < pipes; j++) {
      const down = (2 * n + j) * block,
        up = (2 * n + pipes + j) * block;
      const from = this.pipeFrom[j]! * block,
        to = this.pipeTo[j]!;
      for (let b = 0; b < samples; b++) leaving[down + b] = pressure[from + b]! - arriving[up + b]!;
      if (to >= 0) {
        for (let b = 0; b < samples; b++) leaving[up + b] = pressure[to * block + b]! - arriving[down + b]!;
        continue;
      }
      // Open end: low-passed negative reflection; the pickup hears the outgoing and low-passed waves.
      const follow = this.outletFollow[j]!;
      let outlet = this.outlet[j]!;
      for (let b = 0; b < samples; b++) {
        const outgoing = arriving[down + b]!;
        outlet += follow * (outgoing - outlet);
        leaving[up + b] = OUTLET_REFLECTION * outlet;
        exhaust[b]! += outgoing + outlet;
      }
      this.outlet[j] = outlet;
    }
    const { emissions, reflections } = this;
    for (let i = 0; i < n; i++) {
      const forward = i * block,
        backward = (n + i) * block,
        bank = this.banks[i]! * block;
      for (let b = 0; b < samples; b++) {
        leaving[forward + b] = emissions[forward + b]! + reflections[forward + b]! * arriving[backward + b]!;
        leaving[backward + b] = pressure[bank + b]! - arriving[forward + b]!;
      }
    }
    // Every line's leaving waves through its wall loss, `u_k = x - a_k*u_k` and `C*x + sum R_k*u_k`, then written.
    const { lossWeights, lossStates } = this;
    const a0 = this.poles[0]!,
      a1 = this.poles[1]!,
      a2 = this.poles[2]!,
      a3 = this.poles[3]!;
    for (let line = 0; line < lines; line++) {
      const c = lossWeights[5 * line]!,
        r0 = lossWeights[5 * line + 1]!,
        r1 = lossWeights[5 * line + 2]!,
        r2 = lossWeights[5 * line + 3]!,
        r3 = lossWeights[5 * line + 4]!;
      let u0 = lossStates[4 * line]!,
        u1 = lossStates[4 * line + 1]!,
        u2 = lossStates[4 * line + 2]!,
        u3 = lossStates[4 * line + 3]!;
      const start = lineStart[line]!,
        size = lineLength[line]!;
      let index = linePosition[line]!;
      for (let b = 0; b < samples; b++) {
        const x = leaving[line * block + b]!;
        u0 = x - a0 * u0;
        u1 = x - a1 * u1;
        u2 = x - a2 * u2;
        u3 = x - a3 * u3;
        buffer[start + index] = c * x + r0 * u0 + r1 * u1 + r2 * u2 + r3 * u3;
        if (++index === size) index = 0;
      }
      lossStates[4 * line] = u0;
      lossStates[4 * line + 1] = u1;
      lossStates[4 * line + 2] = u2;
      lossStates[4 * line + 3] = u3;
      linePosition[line] = index;
    }
    for (let b = 0; b < samples; b++) {
      const raw = exhaust[b]! / this.openNormalization;
      this.dc += this.dcCoefficient * (raw - this.dc);
      // The pipes' one-dimensional model holds below the widest outlet's first transverse mode: keep that band.
      this.tone += this.toneCoefficient * (raw - this.dc - this.tone);
      out[offset + b] = this.tone;
    }
  }
}
