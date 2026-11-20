import type { VehicleEngineSound } from './vehicle-engine-sound.js';
import { ACOUSTICS, GAS, openEndCutoffHz, wallLossPoles, wallLossWeights } from './exhaust-acoustics.js';

/**
 * The kernel's two values chosen by listening (K, 2026-11-20), not DEV settings: each firing's charge varies by up to
 * `chargeVariation` of a full charge, and an afterfire's charge burns over `afterfireSeconds`.
 */
export const EXHAUST_LISTENING = Object.freeze({ chargeVariation: 0.03, afterfireSeconds: 0.0015 });

/** How near its pressure a space's search stops (pressures are over rho c^2; a loud wave is 0.1). */
const TOLERANCE = 1e-9;
/** The most rounds a space's search takes. */
const ROUNDS = 60;

/**
 * The one law of a tube's end. The end opens, through a throat of `a` of the tube's cross-section, into a space whose
 * width is 1 / `sigma` of the tube's (a cylinder or the outside: sigma = 0). A narrowing stream keeps its total
 * pressure; a widening one keeps its momentum and so loses the head of (u_throat - u_after). With m the flow from the
 * tube into the space (a Mach number) and pressures over rho c^2:
 *   tube -> space:  p_end - P =  m^2 / 2 * ((1/a - sigma)^2 + sigma^2 - 1)
 *   space -> tube:  p_end - P = -m^2 / 2 * (1 + (1/a - 1)^2 - sigma^2) / q
 * `q` weighs the space's gas against the tube's (1 where they are the same gas; a cylinder's is in its valve's flow).
 */
function endHead(a: number, sigma: number, q: number, outward: boolean): number {
  return outward ? (1 / a - sigma) ** 2 + sigma * sigma - 1 : (1 + (1 / a - 1) ** 2 - sigma * sigma) / q;
}

/** The size of the flow of an end of head `K` whose stopped pressure stands `size` from its space's: m + K m^2 / 2. */
function flowSize(K: number, size: number): number {
  return K > 1e-9 || K < -1e-9 ? (-1 + Math.sqrt(Math.max(0, 1 + 2 * K * size))) / K : size;
}

/** The heads of a mouth, the law with no throat into the outside: out of the tube, and into it. */
const MOUTH_OUT = endHead(1, 0, 1, true);
const MOUTH_IN = endHead(1, 0, 1, false);

/** One seeded xorshift32 step. */
function xorshift(seed: number): number {
  seed ^= seed << 13;
  seed ^= seed >>> 17;
  seed ^= seed << 5;
  return seed;
}

/**
 * The exhaust: tubes and the spaces their ends open into, cylinders, junctions and the outside. Engine RPM and opening
 * are observations; no torque or crank dynamics. One law holds at every end (`endHead`), and every space (a junction
 * is a cylinder with no volume) finds its pressure within the sample. Waves are w = p / (rho c^2); a flow's Mach number
 * is the difference of the two waves at a tube's end. Each sample's arithmetic is the same however the calls divide
 * the samples.
 *
 * A line is one direction of one tube: its wall loss, then N samples in which a value w travels at
 * c (1 + steepening w), later values overtaking earlier ones into shocks that keep the wave's area. The value arriving
 * now is the one sent at the t that makes -k S(t) + (t - (now - N))^2 / 2 least (S the running sum of w,
 * k = steepening N: Lax and Oleinik). Each t is a straight line in (now - N), so the least is the lower envelope of
 * the lines: sent in order and asked in order, each line enters and leaves the envelope once.
 *
 * A space holds gas G, counted as the volume the gas would fill at the outside's pressure, in a volume V, and its
 * pressure is (G / V)^gamma. A junction has no volume and so holds nothing; a cylinder is a junction with a volume,
 * which its piston moves, and one end, its valve the end's throat.
 */
export class ExhaustWaveguide {
  // Lines: forward (cylinder to junction) and backward of each primary, then down and up of each pipe.
  private readonly lineN: Int32Array;
  private readonly lineMask: Int32Array;
  private readonly lineBase: Int32Array;
  private readonly lineK: Float64Array;
  // Each line's envelope's first and next entries, and the earliest t it last read: counts that only grow.
  private readonly lineHead: Float64Array;
  private readonly lineTail: Float64Array;
  private readonly lineLast: Float64Array;
  // Every line's values and their running sum, in rings of `lineMask + 1`, one after another.
  private readonly w: Float64Array;
  private readonly sum: Float64Array;
  /** Each line's envelope, oldest first: a line's t, and the (now - N) from which it lies below the line before it. */
  private readonly at: Float64Array;
  private readonly from: Float64Array;
  // Wall loss: the poles shared by every line, each line's weights [C, R_0..R_3] and its four states.
  private readonly poles: Float64Array;
  private readonly loss: Float64Array;
  private readonly filter: Float64Array;
  private n = 0;
  // Junctions' ends, junction by junction: junction j's are endFirst[j] .. endFirst[j + 1] - 1.
  private readonly endFirst: Int32Array;
  private readonly endArea: Float64Array;
  private readonly endRead: Int32Array;
  private readonly endWrite: Int32Array;
  /** At a junction the law's heads are fixed: into the junction, and out of it. */
  private readonly endHeadIn: Float64Array;
  private readonly endHeadOut: Float64Array;
  private readonly endArriving: Float64Array;
  private readonly endFlow: Float64Array;
  private readonly junctionPressure: Float64Array;
  private readonly swelling: Float64Array;
  // Cylinders: the gas each holds, its density at the outside's pressure over the tubes' gas's, its primary's area.
  private readonly gas: Float64Array;
  private readonly density: Float64Array;
  private readonly valveArea: Float64Array;
  private readonly valveArriving: Float64Array;
  private readonly valveFlow: Float64Array;
  /** The charge (of the tubes' gas, a volume) each cylinder let out unburned for an afterfire, until its valve shuts. */
  private readonly unburned: Float64Array;
  /**
   * Whether each cylinder's valve has opened since the kernel began: until it first opens, a cylinder holds nothing
   * and lets nothing out, and its first opening sets its charge as every opening does.
   */
  private readonly hasOpened: Uint8Array;
  // Afterfires burning, in the order they began: each one's junction, volume and samples elapsed.
  private burnJunction: Int32Array;
  private burnVolume: Float64Array;
  private burnElapsed: Float64Array;
  private burns = 0;
  // Each open end's low-passed outgoing wave, its returning wave and its low-pass coefficient.
  private readonly outlet: Float64Array;
  private readonly mouth: Float64Array;
  private readonly follow: Float64Array;
  private readonly smoothing: number;
  private readonly sweptVolume: number;
  private readonly clearance: number;
  /** The phase of a valve's opening's middle: a four-stroke's exhaust stroke's, a two-stroke's bottom dead centre. */
  private readonly centre: number;
  private readonly turn: number;
  private readonly cycleSamples: number;
  private readonly afterfireSpan: number;
  private readonly perSample: number;
  private afterfiring = false;
  private phase = 0;
  private rpm = 1000;
  private opening = 0;
  private chargeSeed = 123456789;

  constructor(
    private readonly sound: VehicleEngineSound,
    rate: number,
    observationSeconds: number,
  ) {
    const { primaries, pipes } = sound.exhaust;
    const cylinders = primaries.length;
    const tubes = [...primaries, ...primaries, ...pipes, ...pipes];
    const lines = tubes.length;
    this.poles = wallLossPoles(rate);
    this.lineN = new Int32Array(lines);
    this.lineMask = new Int32Array(lines);
    this.lineBase = new Int32Array(lines);
    this.lineK = new Float64Array(lines);
    this.lineHead = new Float64Array(lines);
    this.lineTail = new Float64Array(lines);
    this.lineLast = new Float64Array(lines).fill(-1);
    this.filter = new Float64Array(4 * lines);
    this.loss = new Float64Array(5 * lines);
    let cells = 0;
    tubes.forEach(({ length, diameter }, l) => {
      const N = Math.max(1, Math.round((length * rate) / ACOUSTICS.waveSpeed));
      // A ring holds the envelope's entries for as long as a value can take to arrive, a shock's included.
      let size = 4;
      while (size < 4 * N + 8) size *= 2;
      this.lineN[l] = N;
      this.lineMask[l] = size - 1;
      this.lineBase[l] = cells;
      this.lineK[l] = GAS.steepening * N;
      this.loss.set(wallLossWeights(length, diameter, rate), 5 * l);
      cells += size;
    });
    this.w = new Float64Array(cells);
    this.sum = new Float64Array(cells);
    this.at = new Float64Array(cells);
    this.from = new Float64Array(cells);
    // Each junction's ends: its primaries in cylinder order, then each pipe's `from` and `to` ends in pipe order.
    const junctions: { area: number; read: number; write: number }[][] = [];
    const ends = (junction: number) => {
      while (junctions.length <= junction) junctions.push([]);
      return junctions[junction]!;
    };
    primaries.forEach(({ diameter, to }, i) =>
      ends(to).push({ area: diameter * diameter, read: i, write: cylinders + i }),
    );
    pipes.forEach(({ diameter, from, to }, j) => {
      const down = 2 * cylinders + j,
        up = 2 * cylinders + pipes.length + j;
      ends(from).push({ area: diameter * diameter, read: up, write: down });
      if (to !== null) ends(to).push({ area: diameter * diameter, read: down, write: up });
    });
    const count = junctions.reduce((total, junction) => total + junction.length, 0);
    this.endFirst = new Int32Array(junctions.length + 1);
    this.endArea = new Float64Array(count);
    this.endRead = new Int32Array(count);
    this.endWrite = new Int32Array(count);
    this.endHeadIn = new Float64Array(count);
    this.endHeadOut = new Float64Array(count);
    this.endArriving = new Float64Array(count);
    this.endFlow = new Float64Array(count);
    let e = 0;
    junctions.forEach((junction, j) => {
      this.endFirst[j] = e;
      for (const one of junction) {
        let others = 0;
        for (const other of junction) if (other !== one) others += other.area;
        // The tube's cross-section over its space's (the other ends' sum), at most 1.
        const sigma = Math.min(1, one.area / others);
        this.endArea[e] = one.area;
        this.endRead[e] = one.read;
        this.endWrite[e] = one.write;
        this.endHeadIn[e] = endHead(1, sigma, 1, true);
        this.endHeadOut[e] = endHead(1, sigma, 1, false);
        e++;
      }
    });
    this.endFirst[junctions.length] = e;
    this.junctionPressure = new Float64Array(junctions.length);
    this.swelling = new Float64Array(junctions.length);
    this.sweptVolume = sound.sweptVolume;
    this.clearance = sound.sweptVolume / (sound.compressionRatio - 1);
    this.gas = new Float64Array(cylinders);
    this.density = new Float64Array(cylinders);
    this.hasOpened = new Uint8Array(cylinders);
    this.valveArea = Float64Array.from(primaries, ({ diameter }) => diameter * diameter);
    this.valveArriving = new Float64Array(cylinders);
    this.valveFlow = new Float64Array(cylinders);
    this.unburned = new Float64Array(cylinders);
    this.burnJunction = new Int32Array(2 * cylinders);
    this.burnVolume = new Float64Array(2 * cylinders);
    this.burnElapsed = new Float64Array(2 * cylinders);
    this.outlet = new Float64Array(pipes.length);
    this.mouth = new Float64Array(pipes.length);
    this.follow = Float64Array.from(
      pipes,
      ({ diameter }) => 1 - Math.exp((-2 * Math.PI * openEndCutoffHz(diameter)) / rate),
    );
    this.smoothing = 1 - Math.exp(-1 / (observationSeconds * rate));
    this.centre = sound.cycleRevolutions === 2 ? 1.5 * Math.PI : Math.PI;
    this.turn = sound.cycleRevolutions * 2 * Math.PI;
    this.cycleSamples = 60 * sound.cycleRevolutions * rate;
    this.afterfireSpan = EXHAUST_LISTENING.afterfireSeconds * rate;
    this.perSample = (Math.PI * ACOUSTICS.waveSpeed) / (4 * rate);
  }

  /** The next charge leaves its cylinder unburned and burns in the pipe: an afterfire. When is the game's to say. */
  afterfire(): void {
    this.afterfiring = true;
  }

  /** The value arriving now at a line's far end. */
  private read(l: number): number {
    const { w, at, from } = this;
    const mask = this.lineMask[l]!;
    const base = this.lineBase[l]!;
    const k = this.lineK[l]!;
    const n = this.n;
    const linear = n - this.lineN[l]!;
    const tail = this.lineTail[l]!;
    let head = this.lineHead[l]!;
    if (linear < 0 || head === tail) return 0;
    while (tail - head > 1 && (from[base + ((head + 1) & mask)]! <= linear || at[base + (head & mask)]! < n - mask))
      head++;
    this.lineHead[l] = head;
    const best = at[base + (head & mask)]!;
    const earliest = this.lineLast[l]!;
    this.lineLast[l] = best;
    // residual(t) = t - linear - k w(t): where it crosses nothing between two samples, the value arriving lies between.
    const value = w[base + (best & mask)]!;
    const here = best - linear - k * value;
    if (here > 0 && best > earliest && best > 0) {
      const earlier = w[base + ((best - 1) & mask)]!;
      const before = best - 1 - linear - k * earlier;
      if (before < 0) return earlier + (before / (before - here)) * (value - earlier);
    } else if (here < 0 && best < n - 1) {
      const later = w[base + ((best + 1) & mask)]!;
      const after = best + 1 - linear - k * later;
      if (after > 0) return value + (here / (here - after)) * (later - value);
    }
    return value;
  }

  /** Sends a value into a line: through the wall loss, then onto the envelope's end; lines it leaves no room for go. */
  private write(l: number, x: number): void {
    const { w, sum, at, from, filter, loss, poles } = this;
    const mask = this.lineMask[l]!;
    const base = this.lineBase[l]!;
    const k = this.lineK[l]!;
    const f = 4 * l;
    const c = 5 * l;
    let y = loss[c]! * x;
    for (let s = 0; s < 4; s++) {
      filter[f + s] = x - poles[s]! * filter[f + s]!;
      y += loss[c + s + 1]! * filter[f + s]!;
    }
    const n = this.n;
    const i = base + (n & mask);
    const previous = base + ((n - 1) & mask);
    w[i] = y;
    const total = n === 0 ? 0 : sum[previous]! + 0.5 * (w[previous]! + y);
    sum[i] = total;
    let head = this.lineHead[l]!;
    let tail = this.lineTail[l]!;
    let enters = -Infinity;
    while (tail > head) {
      const last = base + ((tail - 1) & mask);
      const b = at[last]!;
      const apart = n - b;
      const fallen = -k * (total - sum[base + (b & mask)]!);
      enters = (apart === 1 ? fallen : fallen / apart) + 0.5 * (n + b);
      if (tail - head > 1 && enters <= from[last]!) tail--;
      else break;
    }
    if (tail - head > mask) head++;
    at[base + (tail & mask)] = n;
    from[base + (tail & mask)] = enters;
    this.lineHead[l] = head;
    this.lineTail[l] = tail + 1;
  }

  /**
   * A junction finds its pressure P within the sample: the one at which what `entering` (a volume) and its ends'
   * flows, each by the law, bring in over the sample is nothing, for it holds nothing.
   */
  private settleJunction(j: number, entering: number): void {
    const { endArea, endArriving, endFlow, endHeadIn, endHeadOut, perSample } = this;
    const first = this.endFirst[j]!;
    const beyond = this.endFirst[j + 1]!;
    if (entering === 0 && beyond - first === 2) {
      // Two ends: what one end brings the other takes, and the two laws make one quadratic.
      const forth = endArriving[first]! >= endArriving[first + 1]!;
      const from = forth ? first : first + 1;
      const to = forth ? first + 1 : first;
      const ratio = endArea[from]! / endArea[to]!;
      const K = endHeadIn[from]! + ratio * ratio * endHeadOut[to]!;
      const b = 1 + ratio;
      const d = 2 * (endArriving[from]! - endArriving[to]!);
      const m = Math.abs(K) > 1e-9 ? (-b + Math.sqrt(Math.max(0, b * b + 2 * K * d))) / K : d / b;
      endFlow[from] = m;
      endFlow[to] = -ratio * m;
      return;
    }
    // What is left over falls as P rises, so Newton's step, kept between the pressures already known to be too low
    // and too high, finds it.
    let P = this.junctionPressure[j]!;
    let low = -Infinity;
    let high = Infinity;
    for (let round = 0; round < ROUNDS; round++) {
      let brought = 0;
      let slope = 0;
      for (let e = first; e < beyond; e++) {
        const d = 2 * endArriving[e]! - P;
        const size = d >= 0 ? d : -d;
        const K = d >= 0 ? endHeadIn[e]! : endHeadOut[e]!;
        const m = flowSize(K, size);
        const give = 1 / Math.max(1e-3, 1 + K * m);
        const flow = d >= 0 ? m : -m;
        endFlow[e] = flow;
        brought += perSample * endArea[e]! * flow;
        slope += perSample * endArea[e]! * give;
      }
      const left = entering + brought;
      if (left > 0) low = P;
      else high = P;
      let next = P + left / slope;
      if (!(next > low && next < high)) {
        const reach = Math.max(1e-6, 2 * Math.abs(left / slope));
        next = low === -Infinity ? P - reach : high === Infinity ? P + reach : 0.5 * (low + high);
      }
      const moved = Math.abs(next - P);
      P = next;
      // Within TOLERANCE of the pressure, the flows just found are the flows.
      if (moved < TOLERANCE) break;
    }
    this.junctionPressure[j] = P;
  }

  /**
   * A cylinder finds its pressure within the sample the same way, with one end, its valve of `throat`, and the gas it
   * holds: within the sample the gas fills the volume along the tangent of fill = (1 + gamma P)^(1 / gamma) at the
   * pressure it starts from. Its gas is density * fill as dense as its tube's, and `density` as dense once it is out:
   * the law is one of mass, and what the tube carries is volume. It returns the flow from the tube into the cylinder.
   */
  private settleCylinder(i: number, volume: number, throat: number, arriving: number): number {
    const { gamma, choked } = GAS;
    const density = this.density[i]!;
    const area = this.valveArea[i]!;
    const { perSample } = this;
    const held = this.gas[i]!;
    const fillStart = held / volume;
    const full = fillStart ** gamma;
    const fillSlope = fillStart / full;
    const pressureStart = (full - 1) / gamma;
    let P = pressureStart;
    let low = pressureStart - (0.5 / fillSlope) * fillStart;
    let high = Infinity;
    let brought = 0;
    let flow = 0;
    for (let round = 0; round < ROUNDS; round++) {
      const fill = fillStart + fillSlope * (P - pressureStart);
      const q = fill / density;
      const d = 2 * arriving - P;
      const size = d >= 0 ? d : -d;
      const K = endHead(throat, 0, q, d >= 0);
      let m = flowSize(K, size);
      let give = 1 / Math.max(1e-3, 1 + K * m);
      // A valve's flow is not faster than sound in its throat.
      const most = d >= 0 ? choked * throat : choked * throat * Math.sqrt((fill * (1 + gamma * P)) / density);
      if (m > most) {
        m = most;
        give = 0;
      }
      flow = d >= 0 ? m : -m;
      brought = perSample * area * flow;
      const slope = volume * fillSlope + perSample * area * give;
      const left = held + brought - volume * fill;
      if (left > 0) low = P;
      else high = P;
      let next = P + left / slope;
      if (!(next > low && next < high)) {
        const reach = Math.max(1e-6, 2 * Math.abs(left / slope));
        next = high === Infinity ? P + reach : 0.5 * (low + high);
      }
      const moved = Math.abs(next - P);
      P = next;
      if (moved < TOLERANCE) break;
    }
    // A cylinder keeps what it held and what its valve brought.
    this.gas[i] = Math.max(held + brought, 1e-9 * volume);
    return flow;
  }

  /** An afterfire begins at `junction`, after those already burning. */
  private beginBurn(junction: number, volume: number): void {
    if (this.burns === this.burnJunction.length) {
      const grow = <T extends Int32Array | Float64Array>(old: T, made: T): T => (made.set(old), made);
      this.burnJunction = grow(this.burnJunction, new Int32Array(2 * this.burns));
      this.burnVolume = grow(this.burnVolume, new Float64Array(2 * this.burns));
      this.burnElapsed = grow(this.burnElapsed, new Float64Array(2 * this.burns));
    }
    this.burnJunction[this.burns] = junction;
    this.burnVolume[this.burns] = volume;
    this.burnElapsed[this.burns] = 0;
    this.burns++;
  }

  /**
   * Each burning afterfire's swelling this sample, summed at its junction from the latest to the earliest; those
   * burnt out go, the others keeping their order.
   */
  private burn(): void {
    const { swelling, burnJunction, burnVolume, burnElapsed, afterfireSpan: span } = this;
    swelling.fill(0);
    for (let b = this.burns - 1; b >= 0; b--) {
      swelling[burnJunction[b]!]! +=
        (burnVolume[b]! * (1 - Math.cos((2 * Math.PI * (burnElapsed[b]! + 0.5)) / span))) / span;
      if (++burnElapsed[b]! >= span) {
        burnJunction.copyWithin(b, b + 1, this.burns);
        burnVolume.copyWithin(b, b + 1, this.burns);
        burnElapsed.copyWithin(b, b + 1, this.burns);
        this.burns--;
      }
    }
  }

  /**
   * Render `count` samples into `out` from `offset`, without allocation: the sound heard at the open ends. `rpm[k]` and
   * `opening[k]` are sample k's targets; `burns`, for the whole call, is false while the fuel is cut, and the cylinders
   * let out the air they drew.
   */
  render(
    out: Float64Array,
    offset: number,
    count: number,
    rpm: ArrayLike<number>,
    opening: ArrayLike<number>,
    burns: boolean,
  ): void {
    const { sound, mouth, outlet, follow, swelling, endRead, endWrite, endArriving, endFlow } = this;
    const { valveArriving, valveFlow, gas, density, unburned, sweptVolume, clearance, centre, turn } = this;
    const { primaries, pipes, valve } = sound.exhaust;
    const { gamma } = GAS;
    const cylinders = primaries.length;
    const junctions = swelling.length;
    const ends = endRead.length;
    for (let k = 0; k < count; k++) {
      this.rpm += this.smoothing * (rpm[k]! - this.rpm);
      this.opening += this.smoothing * (opening[k]! - this.opening);
      const step = this.rpm / this.cycleSamples;
      const previous = this.phase;
      const phase = (previous + step) % 1;
      this.phase = phase;
      const charge = GAS.closedCharge + (1 - GAS.closedCharge) * this.opening;

      // 1. Junctions: spaces with no volume. Gas burning at one (an afterfire) enters it as that gas's swelling.
      const burning = this.burns > 0;
      if (burning) this.burn();
      for (let e = 0; e < ends; e++) endArriving[e] = this.read(endRead[e]!);
      for (let j = 0; j < junctions; j++) this.settleJunction(j, burning ? swelling[j]! : 0);

      // 2. Mouths. The outside is a space of sigma = 0 whose pressure at the mouth is P = w_in - lowpass(w_in), the
      //    corner at ka = 1 (c / (2 pi a)). What is heard is that pressure, times the mouth's diameter.
      let heard = 0;
      for (let j = 0; j < pipes.length; j++) {
        const pipe = pipes[j]!;
        if (pipe.to !== null) continue;
        const outgoing = this.read(2 * cylinders + j);
        outlet[j]! += follow[j]! * (outgoing - outlet[j]!);
        const d = outgoing + outlet[j]!;
        const m = flowSize(d >= 0 ? MOUTH_OUT : MOUTH_IN, d >= 0 ? d : -d);
        mouth[j] = outgoing - (d >= 0 ? m : -m);
        heard += pipe.diameter * (outgoing - outlet[j]!);
      }

      // 3. Cylinders: spaces whose volume the piston moves, each with one end, its valve the end's throat.
      for (let i = 0; i < cylinders; i++) {
        const opens = sound.firingPhases[i]!;
        const crossed = phase >= previous ? opens > previous && opens <= phase : opens > previous || opens <= phase;
        let since = phase - opens + 1;
        if (since >= 1) since -= 1;
        const angle = centre + (since - valve.open / 2) * turn;
        // The volume matters only as the valve opens and while it is open.
        const volume = crossed || since < valve.open ? clearance + (sweptVolume * (1 - Math.cos(angle))) / 2 : 0;
        if (crossed) {
          this.hasOpened[i] = 1;
          let varied = charge;
          this.chargeSeed = xorshift(this.chargeSeed);
          varied += EXHAUST_LISTENING.chargeVariation * (this.chargeSeed / 2147483648);
          varied = Math.max(1e-3, varied);
          // The charge burns in its cylinder; or, an afterfire, in the pipe; or, its fuel cut, nowhere.
          const inPipe = burns && this.afterfiring;
          this.afterfiring = false;
          // Burning, the charge would have stood at burnedKelvin at this opening, having cooled as it swelled from the
          // clearance: so much hotter it was at top dead centre. The same heat, given at the junction's steady
          // pressure, warms it 1 / gamma as much, and it swells by that over its own temperature.
          if (inPipe)
            unburned[i] =
              (varied * sweptVolume * (GAS.burnedKelvin - GAS.intakeKelvin) * (volume / clearance) ** (gamma - 1)) /
              (gamma * GAS.intakeKelvin);
          // A charge that does not burn in its cylinder leaves at the intake's temperature.
          const kelvin = burns && !inPipe ? GAS.burnedKelvin : GAS.intakeKelvin;
          const opened = (varied * (kelvin / GAS.intakeKelvin) * sweptVolume) / volume;
          gas[i] = volume * opened ** (1 / gamma);
          density[i] = (GAS.pipeKelvin / kelvin) * opened ** ((gamma - 1) / gamma);
        }
        const arriving = this.read(cylinders + i);
        valveArriving[i] = arriving;
        valveFlow[i] = 0;
        // A valve open since before the kernel began lets nothing out: its cylinder has no charge yet.
        if (since < valve.open && this.hasOpened[i]) {
          const position = since / valve.open;
          const lift = position * (1 - position);
          // The valve's effective area over its primary's, a lift curve of zero value and slope at both ends.
          const throat = Math.min(1, GAS.discharge * (valve.diameter / primaries[i]!.diameter) ** 2 * 16 * lift * lift);
          if (throat > 0) valveFlow[i] = this.settleCylinder(i, volume, throat, arriving);
        } else if (unburned[i]! > 0) {
          this.beginBurn(primaries[i]!.to, unburned[i]!);
          unburned[i] = 0;
        }
      }

      // 4. Send every wave.
      for (let i = 0; i < cylinders; i++) this.write(i, valveArriving[i]! - valveFlow[i]!);
      for (let e = 0; e < ends; e++) this.write(endWrite[e]!, endArriving[e]! - endFlow[e]!);
      for (let j = 0; j < pipes.length; j++)
        if (pipes[j]!.to === null) this.write(2 * cylinders + pipes.length + j, mouth[j]!);
      this.n++;
      out[offset + k] = heard;
    }
  }
}
