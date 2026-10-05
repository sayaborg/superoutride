import type { ControlSettings } from './audio-control-policy.js';
import { DEFAULT_AUDIO_SETTINGS } from './audio-defaults.js';
import { FrictionSynthesis } from './friction-synthesis.js';
import { TireRollingSynthesis } from './tire-rolling-model.js';
import type { RollingSettings } from './tire-rolling-acoustics.js';
import { UNIFIED_SYNTHESIS as S, type UnifiedSettings } from './tire-unified-acoustics.js';
import type { SurfaceSound } from './surface-sounds.js';
import type { TireSoundObservation } from './tire-sound-transport.js';

/** R plus ONE stochastic friction system Q, from rubbing through self-excited squeal. */
export class TireUnifiedSynthesis {
  private readonly rolling: TireRollingSynthesis;
  private readonly friction: FrictionSynthesis;
  rollingOutput = 0;
  frictionOutput = 0;

  constructor(
    rate: number,
    private readonly surfaces: readonly SurfaceSound[],
    seed: number = S.frontSeed,
    settings: UnifiedSettings = DEFAULT_AUDIO_SETTINGS.unified,
    rolling: RollingSettings = DEFAULT_AUDIO_SETTINGS.rolling,
    control: ControlSettings = DEFAULT_AUDIO_SETTINGS.control,
  ) {
    this.friction = new FrictionSynthesis(rate, settings, control, seed);
    this.rolling = new TireRollingSynthesis(rate, surfaces, seed, rolling);
  }

  /** The tire's accepted work and slip on its surface excite Q; an unsupported tire releases it. */
  update(value: TireSoundObservation, surfaceIndex = 0): void {
    this.rolling.update(value, surfaceIndex);
    const slip = Math.hypot(value.wheelSpeed - value.longitudinalVelocity, value.lateralVelocity);
    const power = value.longitudinalPower + value.lateralPower;
    if (value.load > 0) this.friction.update(power, slip, this.surfaces[surfaceIndex]!.friction);
    else this.friction.release();
  }

  sample(): number {
    this.frictionOutput = this.friction.sample();
    this.rollingOutput = this.rolling.sample();
    return this.rollingOutput + this.frictionOutput;
  }
}
