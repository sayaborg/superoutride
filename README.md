# SUPER OUTRIDE — M9.10 Post-Peak Sliding Tire

Browser-based 320×240 raster pseudo-3D high-speed driving game inspired by Out Run,
Super Hang-On, OutRunners and the Super Scaler era.

> Physics is world-space. Renderer depth is chainage. Topology stays above Core. Open is the
> general runtime model.

`README.md` is the repository entry point and current-state index. Normative decisions belong to
the authority documents below; executable behavior belongs to types, compilers and regression
tests.

## Current release

M9.10 adds one stateless post-peak sliding characteristic to the retained one-k combined-slip tire.
Every browser comparison uses the exact former M9.9 `TIRE 2` peak characteristic: effective
normalized initial slope `10.3`, pure-lateral peak at `12 deg`, and the same peak magnitude. Only
the large-lateral-slip plateau changes through `SLIDE 100 / 85 / 80 / 75 / 70 %`, defaulting to
`100%`. The post-peak falloff is C1, reaches the selected plateau at about `16.7 deg` pure lateral
slip, and is derived from lateral demand so it remains independent of wheel angular speed inside
the retained scalar implicit wheel solve. Pure longitudinal tire behavior is unchanged.

M9.10 adds no drift mode, drift assist, target sideslip, yaw/beta feedback, tire memory,
vehicle-kind branch or drive-layout handling branch. It preserves M9.9's axle-neutral compiled tire
seed and controllable-slide acceptance and preserves M9.7's exact unit-coefficient travel-direction
steering and zero-DC washout. Handling remains `DEV_UNCALIBRATED`.

M9.9 changed the handling acceptance rule from “every deep-beta held-input sign must self-recover”
to “the explicit recovery input must recover.” The product rule remains **uncontrollable slide is
forbidden; controllable drift is allowed**. M9.9 also removed the common axle stiffness bias by
changing the shared normalized tire seed from `front=9.0 / rear=10.5` to the arithmetic-mean neutral
pair `front=9.75 / rear=9.75`. Geometry, load transfer, inertia, combined slip and drive-torque
distribution remain the causes of front/rear behavior. M9.10 supersedes only M9.9's post-peak-drop
non-goal and the old browser tire comparison table.

M9.8 replaces the six abstract FR/MR/RR/AWD/BIKE debug identities with nine selectable production
vehicle profiles. One structured catalog keeps manufacturer/model, identifier, selected
specification and period in separate fields, then derives keyboard/touch selection and the active
HUD line. Every profile owns distinct mass, CG geometry, inertia, suspension, wheel, braking,
drag, drive split and automatic-shifted engine/gearing data. The normalized reference tire package
is common under the later M9.9 axle-neutral seed. Ferrari Testarossa is the player and fixed rival
default; generic CAR/BIKE programmer art remains under the frozen metric. Handling and derived
engineering seeds remain `DEV_UNCALIBRATED`.

M9.7 replaced the former selectable travel-direction gain and absolute-yaw preview with one bounded
zero-DC washout steering law. The travel-direction coefficient is structurally `1`; it has no
state, key, touch button or HUD row. The Driver filters authoritative yaw rate through one scalar
low-frequency baseline, combines only its transient remainder with `betaTravel`, clamps that
automatic term before adding the reserved driver offset, and follows the result through the same
single physical rack. Tire force, acceleration telemetry, Guide, camera, route and topology remain
outside Driver control. M9.9 supersedes only M9.7's both-sign deep-beta release criterion; the law
and calibration structure remain unchanged.

The five CAR catalog profiles currently use provisional `D=9.5 deg`; the four BIKE profiles use
`D=9 deg`, all through the same compiled fields and common solver. M9.9 calm steady and explicit-
recovery deep-beta probes cover all nine catalog profiles. Product rivals are intentionally fixed
to the Testarossa profile pending later rival-roster design. The steering travel-direction
regularizer remains independent of tire regularization.

M9.6 adds the current Fuji Speedway main racing course (FISCO) as browser course `4`. It preserves
the published 4563 m clockwise lap, 1475 m home straight, 17-corner sequence, 15–25 m width range
and 40 m elevation envelope. The exact unpublished centerline, arc angles and connectors are an
original simplified reconstruction rather than survey geometry. Course `3` remains Tsukuba.

M9.5 introduced three numbered DEV tire-characteristic presets. Its exact `TIRE 1 / 2 / 3` browser
table is now superseded by M9.10. The former `TIRE 2` values are retained as the one common M9.10
browser peak reference, and the vehicle-owned tire calibration now atomically carries reference-
friction, linear-stiffness and sliding-friction-ratio values. `rhoKnee`, the common wheel solve and
relative SurfaceMap materials remain separate authorities.

M9.3 continues to own CIRCUIT DEV course `3` as a researched functional reconstruction of the
four-wheel Tsukuba Course 2000 layout. It preserves the published 2045 m lap, 282 m home straight,
437 m back straight, clockwise corner sequence, named radius families and near-flat character.
The track uses a 12 m nominal asphalt width inside JAF's published 10–15 m range. Exact unlabelled
connectors and arc angles are original simplified authoring, not survey geometry.

Current adjustable vehicle-instance controls are:

| Control | Choices | Default | Keyboard |
|---|---|---:|---|
| Yaw-transient gain | `0 / 0.06 / 0.12 / 0.18 / 0.24 / 0.30 s` | `0.18 s` | `Y` cycles |
| Yaw-washout time | `0.20 / 0.35 / 0.50 / 0.65 s` | `0.35 s` | `U` cycles |
| Symmetric steering traversal | `0.25 / 0.375 / 0.5 / 0.625 s` | `0.375 s` | `T` cycles |
| Sliding plateau / peak | `100 / 85 / 80 / 75 / 70 %` | `100%` | `G` cycles |

The debug selector zone is visible on desktop and touch layouts; large steering/throttle/brake
buttons remain touch-gated. One vehicle-instance steering calibration survives recovery and DEV
profile switching; the private washout baseline resets to reconstructed physical yaw rate. One
vehicle-instance tire calibration survives the same reconstruction boundary. Steering apply and
release remain equal for every response choice. Digits/numpad `4` through `9` have no steering
meaning, so `4` remains unambiguously FISCO. Input arbitration, tire/contact/wheel mechanics,
final road-wheel response and camera remain separate authorities.

The released browser build is [GitHub Pages](https://sayaborg.github.io/superoutride/). Exact
release identity comes from `main`, PR and main-push workflow history; it is not duplicated as a
mutable SHA in this entry document.

Vehicle handling remains:

```text
DEV_UNCALIBRATED
```

## Current takeover checkpoint

For continuation in a fresh thread, read
`docs/SUPER_OUTRIDE_CODEX_HANDOFF_2026-09-01_M9_6.md` after this entry document and
`docs/README.md`. It records the released M9.6 Git/PR/CI/Pages checkpoint and restart procedure.
It is navigation context, not numbered design authority. If `main` is newer, newer repository
state is authoritative and must not be reset to the handoff snapshot.

## Authority entry order

Read these before changing current behavior:

1. `AGENTS.md` — persistent development, architecture and release contract.
2. `docs/README.md` — document classes, supersession and evidence index.
3. `docs/00_core_design_freeze.md` plus addenda `00a`, `00b`, `00c` — frozen renderer, metric and
   open-model authority.
4. `docs/100_m9_10_post_peak_sliding_tire.md` — current post-peak tire law and browser slide-ratio
   selector authority.
5. `docs/99_m9_9_controllable_drift_foundation.md` — retained common tire-balance and deep-sideslip
   controllability authority.
6. `docs/98_m9_8_selectable_production_vehicle_catalog.md` — current vehicle catalog, compiled
   profile identity and vehicle-selection authority.
7. `docs/97_m9_7_bounded_washout_steering_assist.md` — retained steering law and calibration
   selector authority within the M9.9 acceptance supersession.
8. `docs/96_m9_6_fisco_circuit.md` — current FISCO course-4 and browser selection authority.
9. `docs/95_m9_5_debug_tire_characteristic_presets.md` — historical browser tire-preset
   predecessor; its former TIRE 2 peak values are retained by M9.10.
10. `docs/93_m9_3_tsukuba_circuit.md` — current Tsukuba course-3 authority.
11. `docs/88_m9_1_six_profile_debug_hud.md` — historical profile predecessor; retained HUD boundary.
12. `docs/87_m9_0_two_station_arcade_vehicle_dynamics.md` — retained common vehicle mechanics.
13. `docs/92_m9_2_selectable_self_steer_gain.md` — historical predecessor superseded by M9.7.
14. `docs/78_m8_0_phase9_vehicle_physics_architecture_freeze.md` and
   `docs/80_m8_1_car_self_steering_control.md` — retained contact/tire and travel-direction
   foundations within their explicitly superseded scope.
15. `docs/81_m8_2_body_pitch_movement_yaw_camera.md`,
   `docs/84_m8_5_downward_camera_presentation.md`,
   `docs/85_m8_6_two_hundred_meter_render_distance.md` and
   `docs/91_m9_1_dual_yaw_camera_modes.md` — current camera and presentation chain.

Earlier numbered milestones remain chronological records. Historical handoffs and validation files
are navigation/evidence, not current design authority. Do not rewrite them merely to use current
terminology.

## Current architecture snapshot

### Vehicle and input

- All nine production profiles use one Two-Station Arcade Vehicle Dynamics solver.
- The profiles share one provisional axle-neutral normalized tire seed `9.75 / 9.75`; mass,
  geometry, inertia, suspension, wheels, brakes, drag, drive layout and powertrain remain
  vehicle-owned.
- Product identity belongs to `src/vehicle/vehicle-catalog.ts`; mechanics owns no manufacturer,
  drive-layout or model-name handling branch.
- Canonical steering is one digital request from the shared latest-source steering arbiter.
- Canonical ACCEL/BRAKE is exclusive and resolved by the shared latest-held pedal arbiter.
- Finite actuator response belongs only to `src/physics/driving-actuator.ts`.
- Steering calibration state and validation belong only to `src/physics/vehicle-calibration.ts`;
  yaw-transient gain, yaw-washout time and symmetric actuator response are its only selectable
  values.
- Zero-DC filter memory belongs only to `src/physics/steering-assist.ts`. It is not physical yaw,
  HUD telemetry or calibration state.
- Travel-direction steering keeps coefficient exactly `1`; M9.9 adds no gain or drift-mode state.
- Compiled profiles own driver offset, mechanical rack, rack response and steering-only low-speed
  regularization. Automatic steering authority is derived as mechanical maximum minus driver
  offset.
- Tire characteristic calibration belongs only to `src/physics/tire-friction-calibration.ts`; it
  owns reference-friction, linear-stiffness and sliding-friction-ratio values for the current
  vehicle instance.
- M9.10 post-peak force is stateless tire constitutive behavior derived from lateral demand; it has
  no yaw/beta/drift state and leaves pure longitudinal tire behavior unchanged.
- Deep sideslip is accepted when the explicit recovery input can recover it. Neutral/wrong/sustaining
  input is not required to self-recover merely to exclude controllable drift.

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
/?mode=circuit  -> CIRCUIT / TSUKUBA
/?mode=fisco    -> CIRCUIT / FISCO
```

| Function | Keyboard |
|---|---|
| Course | `1 / 2 / 3 / 4` = LINEAR / BRANCHING / TSUKUBA / FISCO |
| Vehicle | `Q/W/E/R/A/S/D/F/V` = F110/930/C4/GTI/Delta/RC30/R80/FXRT/PX200 |
| Camera yaw | `P` = BODY / MOVE |
| Steering | `Left / Right` |
| Throttle | `Up` or `X` |
| Brake | `Down` or `Z` |
| Yaw-transient gain | `Y` cycles |
| Yaw-washout time | `U` cycles |
| Steering traversal | `T` cycles |
| Sliding plateau | `G` cycles `100 / 85 / 80 / 75 / 70 %` |
| Recovery | `Backspace` |

The selector zone exposes the same authority-derived course, vehicle, camera, steering and tire
calibration choices on desktop and touch layouts. Phone/coarse-pointer layouts additionally expose
large touch driving controls. There is no mobile-only mechanics state.

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

The Pages boot imports one commit-versioned complete ESM tree. Do not replace it with an
unversioned cache workaround.

## Source landmarks

```text
src/boot.ts                                  course composition selection
src/main-linear.ts                           LINEAR composition root
src/main.ts                                  BRANCHING composition root
src/main-circuit.ts                          CIRCUIT composition root
src/dev/m9-3-tsukuba-circuit.ts              current Tsukuba Course 2000 DEV authoring
src/dev/m9-6-fisco-circuit.ts                current FISCO DEV authoring
src/browser/steering-calibration-selection.ts three adjustable choice/default/format authority
src/browser/steering-calibration-controls.ts  shared keyboard/touch vehicle adapter
src/browser/tire-friction-selection.ts        SLIDE ratio choice/default/format authority
src/browser/tire-friction-controls.ts         shared keyboard/touch tire adapter
src/browser/mobile-selector-controls.ts       authority-derived selector presentation
src/input/steering-input-arbiter.ts            shared steering-source authority
src/input/pedal-input-arbiter.ts               shared pedal-source authority
src/physics/vehicle-calibration.ts              calibration state rules and DEV status
src/physics/steering-assist.ts                   Driver-owned zero-DC yaw filter memory
src/physics/tire-friction-calibration.ts        vehicle-owned tire calibration rules
src/physics/driving-actuator.ts                 finite response primitive
src/physics/arcade-vehicle-physics.ts           common two-station solver
src/vehicle/vehicle-catalog.ts                  structured product identity/selection authority
src/physics/vehicle-profiles.ts                 compiled nine-profile mechanics authority
src/physics/tire-wheel.ts                       one-k combined-slip + M9.10 post-peak tire law
src/camera/m5-camera.ts                         body-pitch/selectable-yaw camera
src/render/m5-renderer.ts                       shared raster renderer
```

`src/dev` contains composition fixtures, historical regression fixtures and instrumentation. General
layers must not import it. Only `src/main-linear.ts`, `src/main.ts` and `src/main-circuit.ts` may
assemble DEV fixtures as top-level composition roots; regression coverage enforces this boundary.

## Evidence and release discipline

The M9.10 standalone validation record is
`docs/validation/M9_10_POST_PEAK_SLIDING_TIRE_VALIDATION.txt`. It records the implementation-
inclusive exact-head CI and requires a fresh complete run on the validation-inclusive head before
release.

The retained M9.9 standalone validation record is
`docs/validation/M9_9_CONTROLLABLE_DRIFT_FOUNDATION_VALIDATION.txt`. It records the prior
implementation-inclusive exact-head CI and release procedure under its historical authority.

The retained M9.8 standalone validation record is
`docs/validation/M9_8_SELECTABLE_PRODUCTION_VEHICLE_CATALOG_VALIDATION.txt`. It records its
implementation-inclusive exact-head CI and release procedure under its historical authority.

The retained M9.7 standalone validation record is
`docs/validation/M9_7_BOUNDED_WASHOUT_STEERING_ASSIST_VALIDATION.txt`. It records the prior
zero-DC/bounded-allocation steering milestone; M9.9 supersedes only its both-sign deep-beta release
criterion.

The prior completed public release evidence is
`docs/validation/M9_6_FISCO_CIRCUIT_VALIDATION.txt`. The retained M9.5 tire evidence is
`docs/validation/M9_5_DEBUG_TIRE_PRESETS_VALIDATION.txt`. The retained M9.4 tire evidence is
`docs/validation/M9_4_SELECTABLE_TIRE_FRICTION_VALIDATION.txt`. The retained M9.3 circuit evidence
is `docs/validation/M9_3_TSUKUBA_CIRCUIT_VALIDATION.txt`. The retained M9.2 steering-calibration
evidence is `docs/validation/M9_2_SELECTABLE_STEERING_CALIBRATION_VALIDATION.txt`.

Historical validation evidence is immutable. Interpret it through `docs/validation/README.md`; do
not revive old source paths or rewrite evidence to match later terminology.

Every release follows `AGENTS.md`: exact main, dedicated branch, complete exact-head CI,
validation-inclusive exact-head CI when required, pure non-force fast-forward, identical
main/PR/validated SHA, then same-SHA Pages build/deploy verification.
