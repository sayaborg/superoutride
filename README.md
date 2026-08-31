# SUPER OUTRIDE — M9.4 Selectable Tire Friction

Browser-based 320×240 raster pseudo-3D high-speed driving game inspired by Out Run,
Super Hang-On, OutRunners and the Super Scaler era.

> Physics is world-space. Renderer depth is chainage. Topology stays above Core. Open is the
> general runtime model.

`README.md` is the repository entry point and current-state index. Normative decisions belong to
the authority documents below; executable behavior belongs to types, compilers and regression
tests.

## Current release

M9.4 adds one vehicle-instance tire reference-friction multiplier without changing the existing
one-k tire law, compiled tire packages or relative SurfaceMap materials. The browser player can
select `SEMI / 1.5x / 2.0x / 2.5x`; `SEMI` is the previous `1.0x` behavior and remains the default.
Keyboard `G`, touch buttons and the common HUD derive from one browser selection authority.
Selections apply immediately and survive recovery/profile switching. Rivals and ordinary vehicle
construction retain `1.0x`.

M9.3 continues to own the CIRCUIT DEV course as a researched functional reconstruction of the
four-wheel Tsukuba Course 2000 layout. It preserves the published 2045 m lap, 282 m home straight,
437 m back straight, clockwise corner sequence, named radius families and near-flat character.
The track uses a 12 m nominal asphalt width inside JAF's published 10–15 m range. Exact unlabelled
connectors and arc angles are original simplified authoring, not survey geometry.

M9.2's common steering law and three independent browser-player calibration controls remain:

| Control | Choices | Default | Keyboard |
|---|---|---:|---|
| Travel-direction gain | `0 / 0.2 / 0.4 / 0.6 / 0.8 / 1.0` | `0.4` | `4`–`9` |
| Yaw-preview time | `0 / 0.06 / 0.12 / 0.18 / 0.24 / 0.30 s` | `0.12 s` | `Y` cycles |
| Symmetric steering traversal | `0.25 / 0.375 / 0.5 / 0.625 s` | `0.375 s` | `T` cycles |
| Tire reference friction | `SEMI / 1.5x / 2.0x / 2.5x` | `SEMI` | `G` cycles |

Touch layouts expose every value directly. One vehicle-instance calibration state survives recovery
and DEV profile switching. Steering apply and release remain equal for every response choice.
Input arbitration, tire/contact/wheel mechanics, final road-wheel response and camera remain
separate authorities.

The released browser build is [GitHub Pages](https://sayaborg.github.io/superoutride/). Exact
release identity comes from `main`, PR and main-push workflow history; it is not duplicated as a
mutable SHA in this entry document.

Vehicle handling remains:

```text
DEV_UNCALIBRATED
```

## Authority entry order

Read these before changing current behavior:

1. `AGENTS.md` — persistent development, architecture and release contract.
2. `docs/README.md` — document classes, supersession and evidence index.
3. `docs/00_core_design_freeze.md` plus addenda `00a`, `00b`, `00c` — frozen renderer, metric and
   open-model authority.
4. `docs/94_m9_4_selectable_tire_friction.md` — current selectable tire-friction authority.
5. `docs/93_m9_3_tsukuba_circuit.md` — current CIRCUIT DEV course-authoring authority.
6. `docs/92_m9_2_selectable_self_steer_gain.md` — current steering calibration authority.
7. `docs/88_m9_1_six_profile_debug_hud.md` — current six-profile and HUD authority.
8. `docs/87_m9_0_two_station_arcade_vehicle_dynamics.md` — common vehicle mechanics.
9. `docs/78_m8_0_phase9_vehicle_physics_architecture_freeze.md` and
   `docs/80_m8_1_car_self_steering_control.md` — retained contact/tire and travel-direction
   foundations within their explicitly superseded scope.
10. `docs/81_m8_2_body_pitch_movement_yaw_camera.md`,
   `docs/84_m8_5_downward_camera_presentation.md`,
   `docs/85_m8_6_two_hundred_meter_render_distance.md` and
   `docs/91_m9_1_dual_yaw_camera_modes.md` — current camera and presentation chain.

Earlier numbered milestones remain chronological records. Historical handoffs and validation files
are navigation/evidence, not current design authority. Do not rewrite them merely to use current
terminology.

## Current architecture snapshot

### Vehicle and input

- FR, MR, RR, AWD, BIKE1 and BIKE2 use one Two-Station Arcade Vehicle Dynamics solver.
- The four cars share one engine/tire/chassis package; distribution, inertia and AWD drive split
  produce their ordinary differences.
- Canonical steering is one digital request from the shared latest-source steering arbiter.
- Canonical ACCEL/BRAKE is exclusive and resolved by the shared latest-held pedal arbiter.
- Finite actuator response belongs only to `src/physics/driving-actuator.ts`.
- Steering calibration state and validation belong only to `src/physics/vehicle-calibration.ts`.
- Tire reference-friction calibration belongs only to
  `src/physics/tire-friction-calibration.ts`; the tire law consumes its multiplier explicitly.

### Camera and presentation

- `BODY_FIXED` is the default camera-yaw mode; `MOVEMENT_FOLLOW` retains velocity-direction yaw.
- Camera pitch follows physical body pitch; camera roll remains zero.
- The common `18:1` steering ratio is HUD-only handwheel presentation.
- BIKE lean and sprite selection are derived presentation; they do not feed physics.

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

Do not use this summary instead of the Core Freeze and addenda.

## Browser composition and controls

One top-level boot selects one explicit composition root:

```text
/               -> BRANCHING
/?mode=linear   -> LINEAR
/?mode=branching -> BRANCHING
/?mode=circuit  -> CIRCUIT
```

| Function | Keyboard |
|---|---|
| Course | `1 / 2 / 3` |
| Vehicle | `Q / W / E / R / A / S` = FR / MR / RR / AWD / BIKE1 / BIKE2 |
| Camera yaw | `P` = BODY / MOVE |
| Steering | `Left / Right` |
| Throttle | `Up` or `X` |
| Brake | `Down` or `Z` |
| Tire friction | `G` cycles `SEMI / 1.5x / 2.0x / 2.5x` |
| Recovery | `Backspace` |

Phone/coarse-pointer layouts expose the same authority-derived course, vehicle, camera, steering
and tire-calibration selectors plus touch driving controls. There is no mobile-only mechanics state.

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
```

The Pages boot imports one commit-versioned complete ESM tree. Do not replace it with an
unversioned cache workaround.

## Source landmarks

```text
src/boot.ts                                  course composition selection
src/main-linear.ts                           LINEAR composition root
src/main.ts                                  BRANCHING composition root
src/main-circuit.ts                          CIRCUIT composition root
src/dev/m9-3-tsukuba-circuit.ts              current Tsukuba Course 2000 DEV authoring
src/browser/steering-calibration-selection.ts choice/default/format authority
src/browser/steering-calibration-controls.ts  shared keyboard/touch vehicle adapter
src/browser/tire-friction-selection.ts        tire choice/default/format authority
src/browser/tire-friction-controls.ts         shared keyboard/touch tire adapter
src/browser/mobile-selector-controls.ts       authority-derived touch presentation
src/input/steering-input-arbiter.ts            shared steering-source authority
src/input/pedal-input-arbiter.ts               shared pedal-source authority
src/physics/vehicle-calibration.ts              calibration state rules and DEV status
src/physics/tire-friction-calibration.ts        vehicle-owned tire multiplier rules
src/physics/driving-actuator.ts                 finite response primitive
src/physics/arcade-vehicle-physics.ts           common two-station solver
src/physics/vehicle-profiles.ts                 compiled six-profile authority
src/physics/tire-wheel.ts                       retained tire/wheel primitives
src/camera/m5-camera.ts                         body-pitch/selectable-yaw camera
src/render/m5-renderer.ts                       shared raster renderer
```

`src/dev` contains composition fixtures, historical regression fixtures and instrumentation. General
layers must not import it. Only `src/main-linear.ts`, `src/main.ts` and `src/main-circuit.ts` may
assemble DEV fixtures as top-level composition roots; regression coverage enforces this boundary.

## Evidence and release discipline

Current M9.3 circuit evidence is `docs/validation/M9_3_TSUKUBA_CIRCUIT_VALIDATION.txt`. The retained
M9.2 steering-calibration
evidence is `docs/validation/M9_2_SELECTABLE_STEERING_CALIBRATION_VALIDATION.txt`.

Historical validation evidence is immutable. Interpret it through `docs/validation/README.md`; do
not revive old source paths or rewrite evidence to match later terminology.

Every release follows `AGENTS.md`: exact main, dedicated branch, complete exact-head CI,
validation-inclusive exact-head CI when required, pure non-force fast-forward, identical
main/PR/validated SHA, then same-SHA Pages build/deploy verification.
