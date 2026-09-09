# M9.28 Bike CG Assessment

Reference authoring: M9.27 a4d678f00b6c1e83aa1eaa902e64f26f604abd75, rebuilt from git archive.
The user selected30% wheelbase as a cautious first reduction after being offered20/25/30%.
This is a game calibration, not a fitted real-motorcycle CG or a mathematical optimum.

## Reproduce

Build the exact reference in a separate checkout, then run:

```
node tools/bike-cg-probe.mjs /path/to/m927/dist comparison.json
```

[Raw288-case inventory](M9_28_BIKE_CG_COMPARISON.json): four bikes, original CG and30/25/20%
wheelbase, two grip factors, three maneuvers,60/120/240Hz. Every run uses the same current solver,
other authoring and input schedule, with only CG changed and the ordinary compiler constructing
its consistent equilibrium. All288 completed without exception or pitch overturn. This is not
an all-terrain, all-course, human-input or absence-of-wheel-lift guarantee.

## Measured changes

Turn-brake at120Hz,30m/s start,0.35 steering from0.5s and full brake from1.5s through6s.
Peak absolute body sideslip in degrees while speed exceeds15m/s:

| Bike | Grip | Original CG |30%|25%|20%|
|---|---:|---:|---:|---:|---:|
| VFR750R | 1 | 104.72 | 91.18 | 83.32 | 71.28 |
| VFR750R | 0.25 | 109.36 | 100.84 | 99.10 | 96.94 |
| R80_GS_PARIS_DAKAR | 1 | 104.37 | 83.70 | 73.76 | 58.40 |
| R80_GS_PARIS_DAKAR | 0.25 | 135.89 | 103.14 | 101.32 | 97.73 |
| FXRT_SPORT_GLIDE | 1 | 114.31 | 96.28 | 84.84 | 68.80 |
| FXRT_SPORT_GLIDE | 0.25 | 120.81 | 103.89 | 101.91 | 99.00 |
| PX200E_ARCOBALENO | 1 | 103.44 | 84.50 | 73.38 | 57.26 |
| PX200E_ARCOBALENO | 0.25 | 139.04 | 99.27 | 96.65 | 94.89 |

Lower CG reduces this metric for all four bikes at both grips;60/240Hz confirm the direction.
Smaller ratios improve this particular metric further, but do not establish better overall feel.
The selected30% cases still have large yaw excursions, especially at low grip. Straight braking
stays straight in the sampled symmetric flat cases. No brake bias, engine, inertia, tire or input
retuning was used to hide a result. See the JSON for speed, wheel lift, protection, torque and force
metrics rather than treating a single peak angle as complete acceptance.

## Visual scope

Actual world-velocity change projected on body-right now supplies lateral G. The lean expression
uses the flat-road equilibrium atan(lateral G); no actual lean/roll mechanics or rider shift is
introduced. A continuous cyan HUD line rises from the sprite ground anchor, while the existing
sprite banks remain quantized and capped by available art. Vertical-G/banked-surface/airborne
attitude and rider animation remain future presentation decisions.

Historical high-CG wheel-lift, braking-yaw and protection regressions retain explicit test-only
old-CG fixtures and unchanged physical assertions under123. Current low-CG profiles have separate
causal comparison tests. Cars retain exact compiled-profile hashes; common mechanics compare all
nine unchanged reference profiles against pinned b70 without omitting changed physical fields.
