# SUPER OUTRIDE — M9.19 Progressive Drift Calibration

Browser-based 320×240 raster pseudo-3D high-speed driving game inspired by Out Run,
Super Hang-On, OutRunners and the Super Scaler era.

> Physics is world-space. Renderer depth is chainage. Topology stays above Core. Open is the
> general runtime model.

`README.md` is the repository entry point and current-state index. Normative decisions belong to
the numbered authority documents; executable behavior belongs to source, compilers and regression
tests.

## Current release

M9.19 changes the browser starting calibration to **G1.20/P8/S1.00**, retaining ENG1, D12/M60 and
ACT0.25. Small-slip stiffness stays equal to the former G3/P20 default (18.9), while peak capacity
is lower and absolute deep-slide S remains 1. No tire, steering, powertrain or vehicle-profile law
changes. Handling remains `DEV_UNCALIBRATED`.

Ordinary-input regression now covers shallow cornering, partial-brake drift entry, an approximately
54 km/h **10 -> 15 -> 10 degree** round trip and neutral exit, in both directions at 60/120/240 Hz.
No imposed drift seed, gear hold, speed reset or beta-feedback controller is used. Six sampled entry
pulses and nine small control-offset cases check a neighborhood, not just one successful input.
Human touch/keyboard feel, broader speed/gear margins and useful distance on actual courses remain
unproven. Lower peak grip also changes high-speed cornering limits; this is not free extra grip.

Current scope is `docs/113_m9_19_progressive_drift_calibration.md`. G choices extend downward to 1.20
and P to 8%; S stays 1..2. G/S cycles skip S>G pairs while preserving other axes. Explicit invalid
selection APIs still reject them. All previous valid comparison settings remain available.

### Retained M9.18 load law and permitted wheel lift

Both one-k demands use C=k*Nactual; current load scales force without moving normalized peak slip.
The P-to-2P post-peak law and scalar wheel solve are retained. The older G3/P24/S1 ENG3 seeded
25 -> 30 -> 25 degree regression remains required and is not the browser default.

Wheelies/stoppies remain allowed pending later ABS/TCS/control work. Inverted suspension support
is rejected and overturned bodies use ordinary gameplay recovery. No torque suppression, pitch
clamp or suspension-guard relaxation is added. See `docs/112_m9_18_load_proportional_one_k_tire.md`.

### Retained M9.17 direct robotized MT

M9.17 replaces artificial launch slip, independent engine-RPM lag and timed drive-cut shifts with
one ideal direct-drive robotized MT. RPM derives from driven-wheel speed and the selected ratio;
automatic up/down shifts are instantaneous and deliver the new-ratio torque in the same substep.
Gear is the only dynamic powertrain memory. Separate RPM thresholds are checked against every
adjacent gear-ratio gap so a threshold shift cannot immediately reverse at unchanged wheel speed.

The nine profiles retain their positive torque samples and ratios. Artificial zero-torque redline
endpoints are removed. A single C1 averaged rev limiter reduces positive drive from upshift RPM to
zero at redline; there is no second curve collapse, shift cutoff or wheel-speed clamp. At rest,
derived RPM is zero while torque sampling uses an explicit idle floor for no-stall launch.

Current powertrain authority is `docs/111_m9_17_direct_robotized_mt.md`. The 20-second regression
targets the reproduced low-speed gear hunting; it does not certify sustained circular drifting.
Extreme multiplied-power reversals can still exceed the existing suspension model and are not
hidden by this change.

### Retained M9.16 engine selector

`ENG` cycles `1.0 / 1.5 / 2.0 / 3.0 / 4.0`, starting at `1.0`.
Use `K` or tap the `ENG xN` button in the existing tire/engine calibration group.

One instance-owned `powertrain.engineTorqueMultiplier` scales the sampled engine torque curve.
Throttle, selected gear ratio, drive efficiency and the M9.17 single rev limiter then apply.
It is not a vehicle-speed multiplier or a guaranteed constant-power source. Recovery and
safe-spawn vehicle replacement retain the multiplier; rivals and page/course reloads remain at 1.0.
No tire calibration value, domain or default is changed. This selector tests the power-shortage
hypothesis; it does not claim that hypothesis is proven or that drift controllability is solved.

Retained selector authority is `docs/110_m9_16_engine_power_diagnostic_selector.md`, with its
transmission-preservation clauses explicitly superseded by M9.17.

### Retained M9.15 tire law beneath M9.18 load normalization

M9.15 is a deliberately small tire-law change derived from M9.14 hands-on falsification. The
released M9.14 percentage-SLIDE range could make rear breakaway easy or make ordinary cornering
slow, but no setting produced prompt response, progressive breakaway, controllable sideslip and
useful drift distance together.

M9.15 retains the state-free one-k vector tire, friction-circle bound, scalar implicit wheel solve,
common two-station vehicle mechanics and travel-direction steering. It changes only:

1. browser `S` from a percentage of peak grip to an **absolute deep-slide friction coefficient**;
2. the C1 post-peak transition from its former short shoulder to one broad `P -> 2P` interval.

The three browser tire characteristics are now:

```text
G = absolute peak friction coefficient at gripFactor=1
P = common normalized slip at peak
S = absolute deep-slide friction coefficient at gripFactor=1
```

Tire physics still stores exactly the same three calibration scalars. The existing internal
`slidingFrictionRatio` is derived as:

```text
slidingFrictionRatio = S / G
```

Changing G preserves displayed P and absolute S; changing P preserves G and S; changing S preserves
G and P. No fourth tire scalar, tire memory, drift mode, target sideslip, yaw feedback, vehicle-specific
tire branch or drive-layout branch is introduced.

The current explicit hands-on tire starting candidate is:

```text
G=1.20 / P=8% / S=1.00
```

Its internal ratio is `5/6`. This is a diagnostic handling calibration, not measured production-
tire data. Only S<=G is selectable. G cycling skips values below current S; S cycling skips values
above current G. Other displayed axes are preserved rather than silently clamped.

For pure lateral slip, force reaches peak G at P and reaches the absolute sliding plateau S at 2P
through one C1 smoothstep. In deep combined slide, resultant force magnitude is `S*N` and its
direction remains the one-k slip-vector direction. Increasing driven-wheel slip at fixed lateral
slip therefore rotates the same resultant continuously from lateral toward longitudinal force:
`|Fx|` rises while `|Fy|` falls.

Handling remains:

```text
DEV_UNCALIBRATED
```

Current browser comparison ranges are:

| Control | Choices | Browser default | Keyboard |
|---|---|---:|---|
| `G` peak friction | `1.20` through `4.00` in `0.20` steps | `1.20` | `H` cycles |
| `P` common peak slip | `8` through `60%` in `2%` steps | `8% / 4.6°` lateral equivalent | `J` cycles |
| `S` absolute deep-slide friction | `1.00` through `2.00` in `0.20` steps | `1.00` | `G` cycles |
| `ENG` engine torque multiplier | `1.0 / 1.5 / 2.0 / 3.0 / 4.0` | `1.0` | `K` cycles |
| `D` Driver travel-relative offset | `10` through `20 deg` in `1°` steps | `12 deg` | `Y` cycles |
| `M` maximum road-wheel steer | `50 / 55 / 60 / 65 / 70 deg` | `60 deg` | `U` cycles |
| `ACT` symmetric steering traversal | `0.20 / 0.225 / 0.25 / 0.275 / 0.30 s` | `0.25 s` | `T` cycles |

There are `15 x 27 x 6` raw choices and **2,160 valid S<=G calibrations**. The 270 invalid
combinations cannot be selected; all 1,386 old valid calibrations remain available.

M9.11 remains the steering law:

```text
A = M - D
automatic = clamp(betaTravel, -A, +A)
deltaTarget = clamp(automatic + u*D, -M, +M)
```

`A` remains derived only. The current expanded M/D product preserves `A >= 30 deg` at
`M=50 / D=20`. No D limiter, speed-dependent D, tire-dependent steering authority, yaw feedback,
washout or drift mode is introduced.

M9.9 remains the common axle-balance and slide-controllability authority. The shared compiled tire
seed is `front=9.75 / rear=9.75`; the product rule remains:

> **Uncontrollable slide is forbidden; controllable drift is allowed.**

All nine production profiles continue to use one common two-station mechanics architecture.
Ferrari Testarossa remains the default player and fixed product rival profile.

## Touch driving

M9.14 remains the current touch-travel calibration and M9.13 remains the touch ownership/input
architecture. Real touch pointers use the entire viewport:

```text
pointer-down in left half  -> STEERING
pointer-down in right half -> ACCEL / BRAKE
```

Pointer-down is the neutral origin; steering uses horizontal relative displacement and ACCEL/BRAKE
use one vertical signed axis. Pointer role is fixed for the lifetime of the touch. Held analog
displacement remains DIRECT and release/cancel returns to neutral through the existing actuator
`releaseRate`.

Full-scale touch travel remains:

```text
L = 64 CSS px
```

Therefore 32 CSS px is 50% and 64 CSS px is 100%. This is independent of viewport dimensions,
orientation and native backing-store pixel density, but is not claimed to be exact physical
millimeters across all devices.

## Authority entry order

Read these before changing current behavior:

1. `AGENTS.md` — persistent development, architecture and release contract.
2. `docs/README.md` — document classes, supersession and evidence index.
3. `docs/00_core_design_freeze.md` plus addenda `00a`, `00b`, `00c` — frozen renderer, metric and
   open-model authority.
4. `docs/113_m9_19_progressive_drift_calibration.md` — current G/P/S defaults/domain and unseeded
   round-trip diagnostic. Then `docs/112_m9_18_load_proportional_one_k_tire.md` — current tire load law, permitted wheel lift,
   one-sided contact and overturned recovery acceptance.
5. `docs/111_m9_17_direct_robotized_mt.md` — current direct RPM, no-cut shifting, torque curve and
   single limiter; `docs/110_m9_16_engine_power_diagnostic_selector.md` — retained ENG selector/lifecycle.
6. `docs/109_m9_15_absolute_slide_one_k_tire.md` — retained absolute-S, P-to-2P post-peak and
   absolute-S meaning beneath M9.18 load normalization and M9.19 browser defaults.
7. `docs/108_m9_14_compact_touch_expanded_diagnostic_ranges.md` — retained compact touch travel,
   D range; its G/P lower bounds are superseded by M9.19.
8. `docs/107_m9_13_full_screen_analog_touch.md` — retained touch ownership, relative-origin,
   DIRECT/release and presentation authority.
9. `docs/103_m9_12_independent_tire_calibration_axes.md` — retained three-characteristic browser
   mapping within M9.15/M9.19 scoped supersession.
10. `docs/101_m9_11_simplified_travel_direction_steering.md` — current steering law and M/D/T
    ownership authority.
11. `docs/100_m9_10_post_peak_sliding_tire.md` — historical/current post-peak foundation beneath
    M9.15 transition-width and S-meaning supersession.
12. `docs/99_m9_9_controllable_drift_foundation.md` — common tire balance and deep-sideslip
    controllability authority.
13. `docs/98_m9_8_selectable_production_vehicle_catalog.md` — vehicle catalog/profile authority.
14. `docs/87_m9_0_two_station_arcade_vehicle_dynamics.md` — retained common vehicle mechanics.
15. `docs/78_m8_0_phase9_vehicle_physics_architecture_freeze.md` and
    `docs/80_m8_1_car_self_steering_control.md` — retained contact/tire and travel-direction
    foundations inside later supersession.

Earlier numbered milestones remain chronological records. Do not rewrite historical milestone prose
merely to use current terminology.

## Current architecture snapshot

### Vehicle and input

- Nine production profiles use one Two-Station Arcade Vehicle Dynamics solver.
- Canonical steering is one normalized request from the shared steering arbiter; keyboard publishes
  digital `-1/0/+1`, touch publishes continuous `[-1,+1]`.
- Canonical ACCEL/BRAKE remains mutually exclusive; keyboard publishes boolean digital shorthand and
  touch publishes normalized `[0,1]` magnitude through the same pedal arbiter.
- Real touch pointers use full-viewport relative-origin gestures; left-half start owns steering and
  right-half start owns the shared ACCEL/BRAKE axis for that pointer lifetime.
- `src/physics/driving-actuator.ts` remains the sole finite steering/throttle/brake response state.
- `src/physics/vehicle-calibration.ts` remains the sole mutable M/D/T vehicle-instance calibration
  authority; `A=M-D` is derived only.
- `src/physics/arcade-vehicle-physics.ts` owns the unit-coefficient travel-direction transform and
  the sole physical front road-wheel angle.
- `src/physics/automatic-powertrain.ts` owns direct RPM, instantaneous ratio selection, the single
  rev limiter and engine multiplier. Only gear is dynamic memory; torque/RPM outputs are caches.
- `src/browser/engine-power-controls.ts` owns the shared keyboard/touch ENG choices and presentation;
  the current value is read from the selected vehicle, not stored again in browser state.
- `src/physics/tire-friction-calibration.ts` remains the sole three-scalar mutable tire calibration
  state; browser G/P/S IDs and absolute S are not stored as additional physics state.
- `src/browser/tire-friction-selection.ts` derives G, P and absolute S from those existing scalars and
  derives the internal ratio as `S/G`.
- `src/physics/tire-wheel.ts` owns the state-free load-proportional one-k vector law, radial C1
  saturation, M9.15 P-to-2P lateral post-peak scale and scalar wheel solve.
- No yaw steering assist, drift mode, target beta, vehicle-kind handling branch or drive-layout
  handling branch exists.
- Recovery resets unsafe dynamic state but preserves selected M/D/T, tire and engine calibration.
  Wheel lift is allowed; overturned orientation uses the same gameplay recovery path.

### Camera and presentation

- `BODY_FIXED` is default camera yaw; `MOVEMENT_FOLLOW` is the retained alternate.
- Camera pitch follows physical body pitch; camera roll remains zero.
- The common `18:1` steering ratio is HUD-only handwheel presentation.
- BIKE lean/sprite selection are derived presentation and never feed mechanics.

### Renderer and topology

```text
world X/Y/Z = vehicle-physics authority
d = s_render - s_camera = renderer-depth authority

Open     = general data/runtime model
Cyclic   = explicit upper-level topology choice
Renderer = topology-blind
```

Player-depth metric presentation remains:

```text
2.0 m = 80 px
1.0 m = 40 px
f = 200 px
D_cam = 5.0 m = f / 40
```

## Browser composition and controls

One top-level boot selects one explicit composition root:

```text
/                -> BRANCHING
/?mode=linear    -> LINEAR
/?mode=branching -> BRANCHING
/?mode=circuit   -> CIRCUIT / TSUKUBA
/?mode=fisco     -> CIRCUIT / FISCO
```

| Function | Keyboard |
|---|---|
| Course | `1 / 2 / 3 / 4` = LINEAR / BRANCHING / TSUKUBA / FISCO |
| Vehicle | `Q/W/E/R/A/S/D/F/V` = F110/930/C4/GTI/Delta/RC30/R80/FXRT/PX200 |
| Camera yaw | `P` = BODY / MOVE |
| Steering | `Left / Right` |
| Throttle | `Up` or `X` |
| Brake | `Down` or `Z` |
| Driver offset D | `Y` cycles |
| Maximum steer M | `U` cycles |
| Steering traversal ACT | `T` cycles |
| Tire peak G | `H` cycles |
| Tire peak position P | `J` cycles |
| Absolute tire slide S | `G` cycles |
| Engine torque multiplier | `K` cycles |
| Recovery | `Backspace` |

Touch driving uses the entire viewport. Left-half touch start creates a steering-wheel origin; right-
half touch start creates a pedal origin. Horizontal/vertical displacement publishes analog input and
the origin/vector overlay reports the current request. Fixed steering/throttle/brake touch panels are
hidden in touch-capable layouts. Selector buttons remain visible and use their existing authority.
The tire/engine group also provides the `ENG xN` cycling button in portrait and landscape.

## Current takeover checkpoint

The latest named handling navigation checkpoint is
`docs/SUPER_OUTRIDE_CODEX_HANDOFF_2026-09-05_M9_19.md`. It is navigation context only; current
numbered authority, source, tests, PR and workflow state always supersede it when newer evidence
exists.

## Run and test

```bash
npm install
npm run build
npm test
python3 -m http.server 8000
```

Open one of:

```text
http://localhost:8000/?mode=linear
http://localhost:8000/?mode=branching
http://localhost:8000/?mode=circuit
http://localhost:8000/?mode=fisco
```

The released browser build is [GitHub Pages](https://sayaborg.github.io/superoutride/). The Pages
boot imports one commit-versioned complete ESM tree. Exact release identity comes from `main`, PR and
workflow history; it is not duplicated as a mutable SHA in this entry document.

## Reproducible handling diagnostic

After the ordinary build, run `node tools/drift-control-probe.mjs --hz 60 --out drift-control.json`.
Use `--mirror` for the opposite direction and `--hz 120` or `--hz 240` for step refinement. The tool
records inputs, state, wheel slip/forces, gear/RPM and window statistics through the production
solver. It is not a runtime assist. `tests/m9-19-progressive-drift-calibration.test.mjs` checks the
ordinary-input round trip, partial-brake entry samples, small input errors and pointer release.

## Source landmarks

```text
src/boot.ts                                   course composition selection
src/main-linear.ts                            LINEAR composition root
src/main.ts                                   BRANCHING composition root
src/main-circuit.ts                           CIRCUIT composition root
src/browser/steering-calibration-selection.ts M/D/ACT choice/default/format authority
src/browser/steering-calibration-controls.ts  keyboard/touch M/D/ACT vehicle adapter
src/browser/tire-friction-selection.ts        G/P/absolute-S derivation/default/format authority
src/browser/tire-friction-controls.ts         keyboard/touch tire-calibration adapter
src/browser/engine-power-controls.ts          ENG choices, format and keyboard/touch adapter
src/browser/mobile-selector-controls.ts       authority-derived selector presentation
src/input/touch-input.ts                      full-screen relative analog touch + origin/vector UI
src/input/steering-input-arbiter.ts           shared digital/analog steering-source authority
src/input/pedal-input-arbiter.ts              shared digital/analog pedal-source authority
src/physics/vehicle-calibration.ts            M/D/ACT calibration state and DEV status
src/physics/driving-actuator.ts               finite response primitive
src/physics/automatic-powertrain.ts           direct RPM, ratio selection, rev limiter and wheel torque
src/physics/arcade-vehicle-physics.ts         common two-station solver and steering transform
src/physics/tire-friction-calibration.ts      vehicle-owned three-scalar tire calibration
src/physics/tire-wheel.ts                     load-proportional one-k tire + post-peak + wheel solve
src/physics/vehicle-profiles.ts               compiled nine-profile mechanics authority
src/vehicle/vehicle-catalog.ts                structured product identity/selection authority
src/camera/m5-camera.ts                       body-pitch/selectable-yaw camera
src/render/m5-renderer.ts                     shared raster renderer
```

`src/dev` contains composition fixtures, historical regression fixtures and instrumentation.
General layers must not import it. Only the explicit top-level composition roots may assemble DEV
fixtures.

## Release evidence

Prior standalone validation records remain under `docs/validation/`. M9.17 and M9.18 each have
retained immutable validation evidence. Exact release identity is established by the
validation-inclusive PR head, pure fast-forward main, same-SHA main-push CI and GitHub Pages
deployment under `AGENTS.md`.