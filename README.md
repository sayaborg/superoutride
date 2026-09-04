# SUPER OUTRIDE — M9.14 Compact Touch + Expanded Diagnostic Ranges

Browser-based 320×240 raster pseudo-3D high-speed driving game inspired by Out Run,
Super Hang-On, OutRunners and the Super Scaler era.

> Physics is world-space. Renderer depth is chainage. Topology stays above Core. Open is the
> general runtime model.

`README.md` is the repository entry point and current-state index. Normative decisions belong to
the numbered authority documents; executable behavior belongs to source, compilers and regression
tests.

## Current release candidate

M9.14 changes only scoped DEV touch-feel and browser handling-comparison ranges. The M9.13
full-screen relative analog touch architecture remains unchanged, but 100% input now uses one
compact fixed travel:

```text
L = 64 CSS px
```

Therefore 32 CSS px is 50% input and 64 CSS px is 100%. The value no longer changes with viewport
size or portrait/landscape orientation and is independent of native backing-store pixel density.
It is not claimed to be an exact physical millimeter across all devices.

Real touch pointers still use the entire viewport:

```text
pointer-down in left half  -> STEERING
pointer-down in right half -> ACCEL / BRAKE
```

Pointer-down remains the neutral origin; steering uses horizontal relative displacement and
ACCEL/BRAKE use one vertical signed axis. Pointer role remains fixed for the lifetime of the touch.
Held analog displacement remains DIRECT and pointer release/cancel returns to neutral through the
existing actuator `releaseRate`.

Handling remains:

```text
DEV_UNCALIBRATED
```

Current browser comparison ranges are:

| Control | Choices | Browser default | Keyboard |
|---|---|---:|---|
| `GRIP` peak force height | `2.00` through `4.00` in `0.20` steps | `2.00` | `H` cycles |
| `PEAK` common peak slip | `20` through `60 %` in `2%` steps | `20% / 11.3°` lateral equivalent | `J` cycles |
| `SLIDE` large-lateral-slip plateau | `60` through `100 %` in `5%` steps | `80%` | `G` cycles |
| `D` Driver travel-relative offset | `10` through `20 deg` in `1°` steps | `12 deg` | `Y` cycles |
| `M` maximum road-wheel steer | `50 / 55 / 60 / 65 / 70 deg` | `60 deg` | `U` cycles |
| `ACT` symmetric steering traversal | `0.20 / 0.225 / 0.25 / 0.275 / 0.30 s` | `0.25 s` | `T` cycles |

The browser tire default remains `GRIP=2.00 / PEAK=20% / SLIDE=80%`. The complete current tire
product is `11 x 21 x 9 = 2,079` diagnostic calibrations. High GRIP, late PEAK and SLIDE=100 are
explicit diagnostic probes rather than frozen production-tire realism.

M9.11 remains the steering law:

```text
A = M - D
automatic = clamp(betaTravel, -A, +A)
deltaTarget = clamp(automatic + u*D, -M, +M)
```

`A` remains derived only. The current expanded M/D selector product preserves `A >= 30 deg` at the
extreme `M=50 / D=20`. No D limiter, speed-dependent D, tire-dependent steering authority, yaw
feedback, washout or drift mode is introduced.

M9.10 remains the constitutive authority for the stateless C1 large-lateral-slip falloff and the
monotone scalar implicit wheel solve. M9.12 still owns the independent GRIP/PEAK/SLIDE mapping onto
the same three vehicle calibration scalars; M9.14 expands only their browser diagnostic ranges.

M9.9 remains the common axle-balance and slide-controllability authority. The shared compiled tire
seed is `front=9.75 / rear=9.75`; the product rule remains:

> **Uncontrollable slide is forbidden; controllable drift is allowed.**

All nine production profiles still use one common two-station mechanics architecture. Ferrari
Testarossa remains the default player and fixed product rival profile.

## Authority entry order

Read these before changing current behavior:

1. `AGENTS.md` — persistent development, architecture and release contract.
2. `docs/README.md` — document classes, supersession and evidence index.
3. `docs/00_core_design_freeze.md` plus addenda `00a`, `00b`, `00c` — frozen renderer, metric and
   open-model authority.
4. `docs/108_m9_14_compact_touch_expanded_diagnostic_ranges.md` — current compact touch travel and
   DEV D/GRIP/PEAK/SLIDE browser range authority.
5. `docs/107_m9_13_full_screen_analog_touch.md` — retained touch ownership, relative-origin,
   DIRECT/release and presentation authority.
6. `docs/106_m9_12c_extended_peak_diagnostic.md` — retained diagnostic interpretation below the
   M9.14 range supersession.
7. `docs/105_m9_12b_upward_tire_range_expansion.md` — historical/current lineage for GRIP range.
8. `docs/104_m9_12a_centered_handling_comparison_ranges.md` — retained steering/tire centered
   defaults below M9.14 range supersession.
9. `docs/103_m9_12_independent_tire_calibration_axes.md` — GRIP/PEAK/SLIDE independence authority.
10. `docs/101_m9_11_simplified_travel_direction_steering.md` — current steering law and M/D/T
    ownership authority.
11. `docs/100_m9_10_post_peak_sliding_tire.md` — retained tire post-peak constitutive authority.
12. `docs/99_m9_9_controllable_drift_foundation.md` — common tire balance and deep-sideslip
    controllability authority.
13. `docs/98_m9_8_selectable_production_vehicle_catalog.md` — vehicle catalog/profile authority.
14. `docs/87_m9_0_two_station_arcade_vehicle_dynamics.md` — retained common vehicle mechanics.
15. `docs/78_m8_0_phase9_vehicle_physics_architecture_freeze.md` and
    `docs/80_m8_1_car_self_steering_control.md` — retained contact/tire and travel-direction
    foundations inside later supersession.

Earlier numbered milestones remain chronological records. Do not rewrite historical milestone
prose merely to use current terminology.

## Current architecture snapshot

### Vehicle and input

- Nine production profiles use one Two-Station Arcade Vehicle Dynamics solver.
- Canonical steering is one normalized request from the shared steering arbiter; keyboard publishes
  digital `-1/0/+1`, touch publishes continuous `[-1,+1]`.
- Canonical ACCEL/BRAKE remains mutually exclusive; keyboard publishes boolean digital shorthand and
  touch publishes normalized `[0,1]` magnitude through the same pedal arbiter.
- Real touch pointers use full-viewport relative-origin gestures; left-half start owns steering and
  right-half start owns the shared ACCEL/BRAKE axis for that pointer lifetime.
- `src/physics/driving-actuator.ts` remains the sole finite steering/throttle/brake response state;
  touch adds no separate easing or mechanics state.
- `src/physics/vehicle-calibration.ts` is the sole mutable M/D/T vehicle-instance calibration
  authority.
- Browser calibration applies the current DEV center without rewriting compiled production-profile
  seeds.
- `A=M-D` is derived only; there is no automatic-authority state or selector.
- `src/physics/arcade-vehicle-physics.ts` owns the unit-coefficient travel-direction transform and
  the sole physical front road-wheel angle.
- `src/physics/tire-friction-calibration.ts` remains the sole three-scalar mutable tire calibration
  state; browser GRIP/PEAK/SLIDE IDs are never stored in physics.
- `src/browser/tire-friction-selection.ts` derives the three independent DEV tire axes from those
  existing scalars.
- `src/physics/tire-wheel.ts` owns the one-k combined-slip and M9.10 lateral post-peak tire law.
- No yaw steering assist, drift mode, target beta, vehicle-kind handling branch or drive-layout
  handling branch exists.
- Recovery resets unsafe dynamic state but preserves selected M/D/T and tire calibration.

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
| Tire GRIP | `H` cycles |
| Tire PEAK | `J` cycles |
| Tire SLIDE | `G` cycles |
| Recovery | `Backspace` |

Touch driving uses the entire viewport. Left-half touch start creates a steering-wheel origin; right-
half touch start creates a pedal origin. Horizontal/vertical displacement publishes analog input and
the origin/vector overlay reports the current request. Fixed steering/throttle/brake touch panels are
hidden in touch-capable layouts. Selector buttons remain visible and use their existing authority.

## Current takeover checkpoint

For the ongoing handling investigation, the latest named navigation checkpoint remains
`docs/SUPER_OUTRIDE_CODEX_HANDOFF_2026-09-04_M9_12C.md`. It is navigation context only and predates
M9.13/M9.14 touch/range authority. Always re-fetch current `main`, numbered authority, source, PR and
workflow state before work.

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
boot imports one commit-versioned complete ESM tree. Exact release identity comes from `main`, PR
and workflow history; it is not duplicated as a mutable SHA in this entry document.

## Source landmarks

```text
src/boot.ts                                   course composition selection
src/main-linear.ts                            LINEAR composition root
src/main.ts                                   BRANCHING composition root
src/main-circuit.ts                           CIRCUIT composition root
src/browser/steering-calibration-selection.ts M/D/ACT choice/default/format authority
src/browser/steering-calibration-controls.ts  keyboard/touch M/D/ACT vehicle adapter
src/browser/tire-friction-selection.ts        GRIP/PEAK/SLIDE choice/default/format authority
src/browser/tire-friction-controls.ts         keyboard/touch tire-calibration adapter
src/browser/mobile-selector-controls.ts       authority-derived selector presentation
src/input/touch-input.ts                      full-screen relative analog touch + origin/vector UI
src/input/steering-input-arbiter.ts           shared digital/analog steering-source authority
src/input/pedal-input-arbiter.ts              shared digital/analog pedal-source authority
src/physics/vehicle-calibration.ts            M/D/ACT calibration state and DEV status
src/physics/driving-actuator.ts               finite response primitive
src/physics/arcade-vehicle-physics.ts         common two-station solver and steering transform
src/physics/tire-friction-calibration.ts      vehicle-owned three-scalar tire calibration
src/physics/tire-wheel.ts                     one-k combined-slip + post-peak tire law
src/physics/vehicle-profiles.ts               compiled nine-profile mechanics authority
src/vehicle/vehicle-catalog.ts                structured product identity/selection authority
src/camera/m5-camera.ts                       body-pitch/selectable-yaw camera
src/render/m5-renderer.ts                     shared raster renderer
```

`src/dev` contains composition fixtures, historical regression fixtures and instrumentation.
General layers must not import it. Only the explicit top-level composition roots may assemble DEV
fixtures.

## Release evidence

Prior standalone validation records remain under `docs/validation/`. M9.14 changes current normative
touch-feel and browser comparison-range authority and therefore requires its own standalone
validation record before release. Exact release identity is established by the record-inclusive PR
head, pure fast-forward main, same-SHA main-push CI and GitHub Pages deployment under `AGENTS.md`.
