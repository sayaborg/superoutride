import { SPECTRAL_SETTINGS, SPECTRAL_TEXTURES } from './tire-spectral-acoustics.js';

/** Material following for the retained SPECTRAL reference. */
export class SpectralMaterial {
  readonly value = { ...SPECTRAL_TEXTURES[0]! };
  private target = SPECTRAL_TEXTURES[0]!;
  setSurface(index: number): void {
    this.target = SPECTRAL_TEXTURES[index]!;
  }
  follow(tone: number): void {
    const material = this.value,
      target = this.target;
    material.roadLow += tone * (target.roadLow - material.roadLow);
    material.roadHigh += tone * (target.roadHigh - material.roadHigh);
    material.scrubLow += tone * (target.scrubLow - material.scrubLow);
    material.scrubHigh += tone * (target.scrubHigh - material.scrubHigh);
    material.squeal += tone * (target.squeal - material.squeal);
    material.scaleMeters += tone * (target.scaleMeters - material.scaleMeters);
    material.depth += tone * (target.depth - material.depth);
  }
}

export function spectralSquealBandwidth(slip: number, wheelSpeed: number): number {
  return (
    SPECTRAL_SETTINGS.squealBaseBandwidthHz +
    SPECTRAL_SETTINGS.squealSlipBandwidthHz * (slip / (slip + SPECTRAL_SETTINGS.squealBandwidthSlipHalfSpeed)) +
    SPECTRAL_SETTINGS.squealWheelBandwidthHz *
      (Math.abs(wheelSpeed) / (Math.abs(wheelSpeed) + SPECTRAL_SETTINGS.squealBandwidthWheelHalfSpeed))
  );
}
