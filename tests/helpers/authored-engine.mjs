/** Test fixture authoring only; never imported by production or browser tooling. */
export function withEngineCurveScale(profile, scale) {
  return {
    ...profile,
    powertrain: {
      ...profile.powertrain,
      torqueCurve: profile.powertrain.torqueCurve.map((p) => ({
        ...p,
        torqueNewtonMeters: p.torqueNewtonMeters * scale,
      })),
    },
  };
}
