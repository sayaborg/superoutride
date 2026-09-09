# M9.28 — Bike CG Calibration and Lateral-G Lean

Status: scoped game calibration and presentation change. Handling remains DEV_UNCALIBRATED.
Base: a4d678f00b6c1e83aa1eaa902e64f26f604abd75 (M9.27).

The user prioritizes plausible game handling over reproducing real motorcycle dynamics and asks
first to lower the bikes' high CG relative to wheelbase, and make visual lean respond to G.

## CG authoring

All four production bikes use CG height = 0.30 * wheelbase as the user-selected provisional common game calibration:
VFR 0.423 m, R80 0.4395 m, FXRT 0.4458 m, Vespa 0.3705 m. These are explicit resolved authoring
values, not claimed factory measurements or an identified optimal ratio. The horizontal CG,
mass, yaw/pitch inertias, suspension, brakes, engine, tire calibration, steering and protection
remain unchanged. Existing compilation derives free reach and equilibrium placement from this CG.
The ratio introduces no runtime field, selector, bike branch, state clamp or extra force.
Cars retain their exact profiles. Selection and recovery use the ordinary compiled profile.

Lowering h reduces the quasi-static load-transfer fraction (a_long/g)*(h/wheelbase). This motivates
the candidate; it does not prove dynamic yaw stability. A common input need not yield common
response, and lower CG does not eliminate all combined steering/braking problems.

## Visual lean

The single shared player/world-sprite adapter now uses the existing outer-step world-velocity
increment projected onto final body-right: lateralAcceleration. That read-only observation already
feeds the HUD and is reset at construction/recovery. Do not differentiate body-local lateral speed,
which would omit rotating-basis terms; do not reconstruct acceleration from yaw rate and speed.

```
lean = atan2(lateralAcceleration, g)
normalizedBank = clamp(lean / (45 degrees), -1, 1)
```

This is the flat-road lateral equilibrium approximation: tan(lean)=lateral G. It is a visual rule,
not a new roll DOF or rider controller. Zero lateral acceleration gives upright even during yaw;
acceleration sign chooses lean sign even during sideslip. Missing observation on historical static
render fixtures means zero. Remove the old redundant +/-0.70 rad intermediate cap; retain the
existing sprite envelope and authored discrete bank variants. At 1G the equilibrium is45 degrees;
stronger lateral G exceeds that mathematical angle but selects the outermost available sprite.
No arbitrary bitmap rotation, new art, interpolation state or physical feedback is introduced.

Vertical acceleration, banked-road effective gravity, airborne roll and rider body movement are
not modeled by this initial expression. It must not be described as a full three-dimensional
apparent-gravity alignment. The game has no physical roll balance to reconstruct. The physical CG
calibration and visual lean remain separate, each with one authority.

The user additionally requests a line rising from the contact area. The shared browser HUD draws
a cyan, dark-outlined48-pixel line from the player sprite ground anchor at the full mathematical
lean angle, with a white origin marker. This is a cross-sectional angle indicator, not a projected
physical rod or an additional contact/CG observation. Its HUD length is not a world/sprite scale.
It remains continuous beyond the discrete sprite bank envelope and appears for all four selected
bikes on every course through the common browser shell. Existing yaw diagnostics remain separate.

## Architecture decision gate

1. Product vehicle authoring owns CG; existing render presentation adapter owns bank selection.
2. Existing desiredCgHeight, compiler, lateralAcceleration observation and sprite selector suffice.
3. No new dynamic state, force, coordinate system, calibration field or duplicate acceleration.
4. All mechanics stay common; only four product-authored values and the display read change.
5. Explicit authoring plus one atan2 is sufficient; no lower-layer stabilizer or rider simulation.
6. Preserve tire/wheel/contact/protection equations, world state, open topology, renderer chainage,
   fixed presentation scale, zero camera roll and authored sprite variants.
7. Test all-four compiled CG and ordinary load transfer, mirrored G-to-bank including a real
   sideslip trajectory, player/rival shared adapter, immutable car profiles and retained solver
   equivalence on identical reference profiles. Compare all-four old/new CG at60/120/240 Hz.

## Supersession and evidence

This supersedes98's provisional four bike CG heights and87 section7's yawRate*longitudinalSpeed
lean inference only. Other historical documents and immutable validation evidence remain unchanged.
Historical profile-specific causal tests must explicitly retain their old profile fixture when
asserting the historical counterexample; never relax their physical assertions to conceal change.
The b70 exact solver comparison must use identical reference profiles on both builds, since current
bike catalog data deliberately changed. All nine wheel/root and vehicle states still compare exactly.
Current profiles receive separate new-CG regressions and maneuver evidence. The M9.24 source
restoration hash (test m9-24) reverses exactly the four declared CG line edits before checking the
original profile-source hash; all other bytes and all five current car profiles stay protected.

Use tools/bike-cg-probe.mjs BASELINE_DIST OUT_JSON with a compiled exact M9.27 checkout. It changes
only CG in authoring, recompiles through the ordinary compiler and starts each variant at its own
physical equilibrium. It does not copy an old CG world pose into a new geometry. Results are finite
scripted maneuver evidence, not human control or all-course acceptance. Preserve adverse outcomes.

This normative change requires a standalone validation record after green implementation-head CI,
then record-inclusive green CI, non-force fast-forward main and matching Pages evidence.
