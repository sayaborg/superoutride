import {
  CONTACT_INPUTS,
  CONTACT_TEXTURES,
  CONTACT_TRIAL,
  type ContactFrictionParameters,
  type ContactModeParameters,
} from './tire-contact-settings.js';

/** One acoustic mode, never a vehicle contact/tire solver. State is displacement and velocity. */
export class ContactMode {
  private x = 0;
  private v = 0;
  readonly stiffness: number;
  readonly damping: number;
  private readonly dt: number;
  private readonly inertia: number;
  private readonly denominator: number;
  private readonly mode: ContactModeParameters;
  private readonly friction: ContactFrictionParameters;
  // Last-step observations are available to energy/convergence tests, not fed back into the solve.
  lastForce = 0;
  lastMidpointVelocity = 0;
  lastIterations = 0;
  lastResidual = 0;
  constructor(rate: number, mode: ContactModeParameters, friction: ContactFrictionParameters = CONTACT_TRIAL.friction) {
    if (!Number.isFinite(rate) || rate < CONTACT_TRIAL.minRate || rate > CONTACT_TRIAL.maxRate)
      throw new RangeError('unsupported contact-audio rate');
    for (const value of [mode.massKg, mode.frequencyHz, mode.dampingRatio])
      if (!Number.isFinite(value) || value <= 0) throw new RangeError('invalid contact mode');
    for (const value of [friction.dynamic, friction.drop, friction.weakeningSpeed, friction.regularizationSpeed])
      if (!Number.isFinite(value) || value < 0) throw new RangeError('invalid contact friction');
    if (!(friction.weakeningSpeed > 0 && friction.regularizationSpeed > 0))
      throw new RangeError('positive friction speed scales required');
    this.mode = Object.freeze({ ...mode });
    this.friction = Object.freeze({ ...friction });
    this.dt = 1 / rate;
    this.stiffness = mode.massKg * (2 * Math.PI * mode.frequencyHz) ** 2;
    this.damping = 2 * mode.dampingRatio * mode.massKg * (2 * Math.PI * mode.frequencyHz);
    this.inertia = (2 * mode.massKg) / this.dt;
    this.denominator = this.inertia + this.damping + (this.stiffness * this.dt) / 2;
    // F'(u) >= -N*9*drop/(8*sqrt(3)*weakeningSpeed), so the midpoint root is unique.
    const negativeSlope = (CONTACT_INPUTS.load.max * 9 * friction.drop) / (8 * Math.sqrt(3) * friction.weakeningSpeed);
    if (!Number.isFinite(this.denominator) || !(this.denominator > negativeSlope))
      throw new RangeError('contact mode outside unique-root domain');
  }
  get displacement(): number {
    return this.x;
  }
  get velocity(): number {
    return this.v;
  }
  get energy(): number {
    return (this.mode.massKg * this.v ** 2 + this.stiffness * this.x ** 2) / 2;
  }

  /** Implicit midpoint with a bounded friction bracket and safeguarded Newton iteration. No allocation. */
  step(slip: number, load: number, roughForce = 0): number {
    if (
      !Number.isFinite(slip) ||
      !Number.isFinite(load) ||
      load < 0 ||
      load > CONTACT_INPUTS.load.max ||
      !Number.isFinite(roughForce)
    )
      throw new RangeError('invalid representative contact input');
    const rhs = this.inertia * this.v - this.stiffness * this.x + roughForce;
    const f = this.friction;
    const bound = load * (f.dynamic + f.drop);
    let lo = (rhs - bound) / this.denominator;
    let hi = (rhs + bound) / this.denominator;
    let w = Math.max(lo, Math.min(hi, this.v));
    let force = 0;
    let residual = 0;
    let iterations = 0;
    if (bound === 0) w = rhs / this.denominator;
    else {
      const tolerance = CONTACT_TRIAL.relativeForceTolerance * (1 + Math.abs(rhs) + bound);
      for (; iterations < CONTACT_TRIAL.maxSolveIterations; iterations++) {
        const u = slip - w;
        const q = u / f.weakeningSpeed;
        const q2 = 1 + q * q;
        const norm = Math.sqrt(u * u + f.regularizationSpeed ** 2);
        const mu = f.dynamic + f.drop / q2;
        force = load * mu * (u / norm);
        residual = this.denominator * w - force - rhs;
        if (Math.abs(residual) <= tolerance) break;
        if (residual > 0) hi = w;
        else lo = w;
        const derivative =
          load *
          ((mu * f.regularizationSpeed ** 2) / norm ** 3 -
            ((u / norm) * 2 * f.drop * u) / (f.weakeningSpeed ** 2 * q2 ** 2));
        const next = w - residual / (this.denominator + derivative);
        w = next > lo && next < hi ? next : (lo + hi) / 2;
      }
      if (iterations === CONTACT_TRIAL.maxSolveIterations) throw new Error('contact midpoint failed to converge');
    }
    const nextX = this.x + this.dt * w;
    const nextV = 2 * w - this.v;
    if (!Number.isFinite(nextX) || !Number.isFinite(nextV)) throw new Error('nonfinite contact state');
    this.x = nextX;
    this.v = nextV;
    this.lastMidpointVelocity = w;
    this.lastForce = force;
    this.lastIterations = bound === 0 ? 0 : iterations + 1;
    this.lastResidual = residual;
    return nextV;
  }
}

/** Quintic spatial roughness, integrated over the travelled interval rather than point-sampled. */
export class DistanceRoughness {
  private phase = 0;
  private left: number;
  private right: number;
  constructor(
    private readonly cellMeters: number,
    private seed: number,
  ) {
    if (!(Number.isFinite(cellMeters) && cellMeters > 0) || !Number.isInteger(seed) || (seed | 0) === 0)
      throw new RangeError('invalid roughness initialization');
    this.seed |= 0;
    this.left = this.random();
    this.right = this.random();
  }
  private random(): number {
    this.seed ^= this.seed << 13;
    this.seed ^= this.seed >>> 17;
    this.seed ^= this.seed << 5;
    return this.seed / 2147483648;
  }
  private mean(a: number, b: number): number {
    const m = (a + b) / 2,
      d2 = (b - a) ** 2;
    // Exact symmetric integral mean of 6u^5-15u^4+10u^3, stable even as b approaches a.
    const shape =
      m ** 3 * (10 + m * (-15 + 6 * m)) + 2.5 * m * (2 * m * m - 3 * m + 1) * d2 + (0.375 * m - 0.1875) * d2 * d2;
    return this.left + (this.right - this.left) * shape;
  }
  sample(distanceMeters: number): number {
    const step = distanceMeters / this.cellMeters;
    if (!Number.isFinite(step) || step < 0 || step > 1) throw new RangeError('roughness step exceeds one cell');
    const end = this.phase + step;
    if (end < 1) {
      const value = this.mean(this.phase, end);
      this.phase = end;
      return value;
    }
    const first = 1 - this.phase;
    const integral = first * this.mean(this.phase, 1);
    this.left = this.right;
    this.right = this.random();
    this.phase = end - 1;
    return (integral + this.phase * this.mean(0, this.phase)) / step;
  }
}

/** Identical front/rear model: two modes, independent histories, no tire-ID or maneuver branches. */
export class TireContactTrial {
  private readonly road: ContactMode;
  private readonly friction: ContactMode;
  private readonly roadTexture: DistanceRoughness;
  private readonly slipTexture: DistanceRoughness;
  private readonly smoothing: number;
  private readonly tone: number;
  private readonly texture: (typeof CONTACT_TEXTURES)[keyof typeof CONTACT_TEXTURES];
  private travel = 0;
  private slip = 0;
  private load = 0;
  private targetTravel = 0;
  private targetSlip = 0;
  private targetLoad = 0;
  roadOutput = 0;
  frictionOutput = 0;
  maxIterations = 0;
  constructor(
    private readonly rate: number,
    seed: number,
    texture: keyof typeof CONTACT_TEXTURES = 'paved',
  ) {
    if (!Object.hasOwn(CONTACT_TEXTURES, texture)) throw new RangeError('unknown contact texture');
    this.texture = CONTACT_TEXTURES[texture];
    this.road = new ContactMode(rate, CONTACT_TRIAL.roadMode);
    this.friction = new ContactMode(rate, CONTACT_TRIAL.frictionMode, {
      ...CONTACT_TRIAL.friction,
      drop: this.texture.frictionDrop,
    });
    this.roadTexture = new DistanceRoughness(CONTACT_TRIAL.roadCellMeters, seed);
    this.slipTexture = new DistanceRoughness(CONTACT_TRIAL.slipCellMeters, seed ^ 0x13579bdf);
    this.smoothing = 1 - Math.exp(-1 / (CONTACT_TRIAL.controlSeconds * rate));
    this.tone = 1 - Math.exp((-2 * Math.PI * CONTACT_TRIAL.outputCutoffHz) / rate);
  }
  update(travel: number, slip: number, load: number): void {
    if (
      !Number.isFinite(travel) ||
      travel < 0 ||
      travel > CONTACT_INPUTS.travelSpeed.max ||
      !Number.isFinite(slip) ||
      slip < 0 ||
      slip > CONTACT_INPUTS.slipSpeed.max ||
      !Number.isFinite(load) ||
      load < 0 ||
      load > CONTACT_INPUTS.load.max
    )
      throw new RangeError('contact audition input outside domain');
    this.targetTravel = travel;
    this.targetSlip = slip;
    this.targetLoad = load;
  }
  sample(): number {
    this.travel += this.smoothing * (this.targetTravel - this.travel);
    this.slip += this.smoothing * (this.targetSlip - this.slip);
    // Loss of support cuts forcing immediately; the existing vibrations then decay freely.
    this.load = this.targetLoad === 0 ? 0 : this.load + this.smoothing * (this.targetLoad - this.load);
    const travel = this.targetTravel === 0 ? 0 : this.travel;
    const slip = this.targetSlip === 0 ? 0 : this.slip;
    const roadNoise = this.roadTexture.sample(this.load > 0 ? travel / this.rate : 0);
    const slipNoise = this.slipTexture.sample(this.load > 0 ? slip / this.rate : 0);
    const roadForce =
      (this.load * this.texture.roadRoughness * roadNoise * travel) / Math.hypot(travel, CONTACT_TRIAL.roadForceSpeed);
    const slipForce =
      (this.load * this.texture.slipRoughness * slipNoise * slip) / Math.hypot(slip, CONTACT_TRIAL.slipForceSpeed);
    const road = this.road.step(0, 0, roadForce) * CONTACT_TRIAL.roadGain;
    const friction = this.friction.step(slip, this.load, slipForce) * CONTACT_TRIAL.frictionGain;
    this.maxIterations = Math.max(this.maxIterations, this.friction.lastIterations);
    this.roadOutput += this.tone * (road - this.roadOutput);
    this.frictionOutput += this.tone * (friction - this.frictionOutput);
    return this.roadOutput + this.frictionOutput;
  }
}
