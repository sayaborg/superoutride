# SUPER OUTRIDE — M9.11 Simplified Travel-Direction Steering

Browser-based 320×240 raster pseudo-3D high-speed driving game inspired by Out Run,
Super Hang-On, OutRunners and the Super Scaler era.

> Physics is world-space. Renderer depth is chainage. Topology stays above Core. Open is the
> general runtime model.

`README.md` is the repository entry point and current-state index. Normative decisions belong to
the numbered authority documents; executable behavior belongs to source, compilers and regression
tests.

## Current release

M9.11 simplifies the steering architecture to one geometric travel-direction transform, one Driver
offset and one physical rack. The steering target is:

```text
A = M - D
automatic = clamp(betaTravel, -A, +A)
deltaTarget = clamp(automatic + u*D, -M, +M)
```

Within automatic authority, `deltaTarget - betaTravel = u*D` exactly. The coefficient on
`betaTravel` is structurally `1`.

M9.11 removes the M9.7 yaw-transient / yaw-washout correction completely: no yaw-rate steering
feedback, no washout time constant, no yaw baseline state, and no `YAW`/`WASH` selector. Physical
yaw rate remains ordinary body state produced by tire/contact moments; it simply does not feed the
steering target.

Automatic authority `A` is never stored. It is always derived from the two current vehicle-instance
calibration values `M` and `D`.

Current adjustable player calibration is:

| Control | Choices | Default | Keyboard |
|---|---|---:|---|
| `D` Driver travel-relative offset | `9 / 9.5 / 11 / 12.5 / 14 deg` | CAR `9.5`, BIKE `9` | `Y` cycles |
| `M` maximum road-wheel steer | `37 / 41 / 45 / 49 / 53 deg` | `45 deg` | `U` cycles |
| `T` symmetric steering traversal | `0.25 / 0.375 / 0.5 / 0.625 s` | `0.25 s` | `T` cycles |
| `SLIDE` sliding plateau / peak | `100 / 85 / 80 / 75 / 70 %` | `100%` | `G` cycles |

`M`, `D` and `T` are current DEV tuning axes, not frozen final handling values. The exposed M/D
product guarantees `A >= 23 deg`; the lower M choice is therefore 37 degrees rather than recreating
the previously identified low-automatic-authority neighborhood near `M=31, D=15, A=16`.

M9.10 remains the current tire-law authority. Every browser `SLIDE` choice uses the same retained
M9.5/M9.9 `TIRE 2` peak characteristic: effective normalized initial slope `10.3`, pure-lateral
peak at `12 deg`, and identical peak magnitude. Only the stateless C1 large-lateral-slip plateau
changes. `SLIDE 100%` is the no-drop baseline.

M9.9 remains the common axle-balance and slide-controllability authority. The shared compiled tire
seed is `front=9.75 / rear=9.75`; geometry, load transfer, inertia, combined slip and drive-torque
distribution remain the causes of axle behavior. The product rule remains:

> **Uncontrollable slide is forbidden; controllable drift is allowed.**

The explicit recovery input must recover a deep-beta state; neutral, wrong or intentionally
sustaining input is not required to self-recover.

All nine production profiles still use one common two-station mechanics architecture. Ferrari
Testarossa remains the default player and fixed product rival profile. Handling remains:

```text
DEV_UNCALIBRATED
```

## Authority entry order

Read these before changing current behavior:

1. `AGENTS.md` — persistent development, architecture and release contract.
2. `docs/README.md` — document classes, supersession and evidence index.
3. `docs/00_core_design_freeze.md` plus addenda `00a`, `00b`, `00c` — frozen renderer, metric and
   open-model authority.
4. `docs/101_m9_11_simplified_travel_direction_steering.md` — current steering law and M/D/T
   selector authority.
5. `docs/100_m9_10_post_peak_sliding_tire.md` — current tire post-peak and SLIDE selector authority.
6. `docs/99_m9_9_controllable_drift_foundation.md` — common tire balance and deep-sideslip
   controllability authority.
7. `docs/98_m9_8_selectable_production_vehicle_catalog.md` — vehicle catalog and profile-selection
   authority.
8. `docs/97_m9_7_bounded_washout_steering_assist.md` — historical steering predecessor superseded
   by M9.11 for washout/control calibration.
9. `docs/96_m9_6_fisco_circuit.md` and `docs/93_m9_3_tsukuba_circuit.md` — current course-4/course-3
   circuit authoring.
10. `docs/87_m9_0_two_station_arcade_vehicle_dynamics.md` — retained common vehicle mechanics.
11. `docs/78_m8_0_phase9_vehicle_physics_architecture_freeze.md` and
    `docs/80_m8_1_car_self_steering_control.md` — retained contact/tire and unit travel-direction
    foundations inside later supersession.

Earlier numbered milestones remain chronological records. Do not rewrite historical milestone
prose merely to use current terminology.

## Current architecture snapshot

### Vehicle and input

- Nine production profiles use one Two-Station Arcade Vehicle Dynamics solver.
- Canonical steering is one normalized digital request from the shared steering arbiter.
- Canonical ACCEL/BRAKE is exclusive and resolved before finite actuator response.
- `src/physics/vehicle-calibration.ts` is the sole mutable M/D/T vehicle-instance calibration
  authority.
- `A=M-D` is derived only; there is no automatic-authority state or selector.
- `src/physics/arcade-vehicle-physics.ts` owns the unit-coefficient travel-direction transform and
  the sole physical front road-wheel angle.
- `src/physics/driving-actuator.ts` owns finite steering/throttle/brake response.
- `src/physics/tire-friction-calibration.ts` owns the independent vehicle-instance tire calibration.
- `src/physics/tire-wheel.ts` owns the one-k combined-slip and M9.10 post-peak tire law.
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
| Steering traversal T | `T` cycles |
| Sliding plateau | `G` cycles |
| Recovery | `Backspace` |

The selector zone is visible on desktop and touch layouts. Large steering/throttle/brake buttons
remain touch-gated. The same M/D/T and tire authorities drive keyboard, touch and HUD presentation.

## Current takeover checkpoint

For fresh-thread navigation, read
`docs/SUPER_OUTRIDE_CODEX_HANDOFF_2026-09-01_M9_6.md` after this entry document and
`docs/README.md`. It is historical navigation context, not current project authority. Always
re-fetch current `main`, PR and workflow state before work.

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
src/browser/steering-calibration-selection.ts M/D/T choice/default/format authority
src/browser/steering-calibration-controls.ts  keyboard/touch M/D/T vehicle adapter
src/browser/tire-friction-selection.ts        SLIDE choice/default/format authority
src/browser/mobile-selector-controls.ts       authority-derived selector presentation
src/input/steering-input-arbiter.ts           shared steering-source authority
src/input/pedal-input-arbiter.ts              shared pedal-source authority
src/physics/vehicle-calibration.ts            M/D/T calibration state and DEV status
src/physics/driving-actuator.ts               finite response primitive
src/physics/arcade-vehicle-physics.ts         common two-station solver and steering transform
src/physics/tire-friction-calibration.ts      vehicle-owned tire calibration rules
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

M9.11 requires a standalone validation record under `docs/validation/` after an implementation-
inclusive exact-head full CI succeeds. That validation-inclusive head must then receive another
complete green CI before a pure fast-forward release to `main`, followed by same-SHA main-push CI
and Pages verification under `AGENTS.md`.
