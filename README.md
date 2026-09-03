# SUPER OUTRIDE — M9.12B Upward Tire Range Expansion

Browser-based 320×240 raster pseudo-3D high-speed driving game inspired by Out Run,
Super Hang-On, OutRunners and the Super Scaler era.

> Physics is world-space. Renderer depth is chainage. Topology stays above Core. Open is the
> general runtime model.

`README.md` is the repository entry point and current-state index. Normative decisions belong to
the numbered authority documents; executable behavior belongs to source, compilers and regression
tests.

## Current release

M9.12B keeps the existing M9.11 steering law and M9.12 tire calibration architecture. Hands-on
handling evaluation reached the upper edge of the previous GRIP/PEAK comparison window, so only the
tire exploration range moves upward:

| Control | Choices | Browser default | Keyboard |
|---|---|---:|---|
| `GRIP` peak force height | `2.00 / 2.20 / 2.40 / 2.60 / 2.80 / 3.00` effective mu | `2.00` | `H` cycles |
| `PEAK` common peak slip | `20 / 22 / 24 / 26 / 28 / 30 %` | `20% / 11.3°` lateral equivalent | `J` cycles |
| `SLIDE` large-lateral-slip plateau | `70 / 75 / 80 / 85 / 90 %` | `80%` | `G` cycles |
| `D` Driver travel-relative offset | `10 / 11 / 12 / 13 / 14 deg` | `12 deg` | `Y` cycles |
| `M` maximum road-wheel steer | `50 / 55 / 60 / 65 / 70 deg` | `60 deg` | `U` cycles |
| `ACT` symmetric steering traversal | `0.20 / 0.225 / 0.25 / 0.275 / 0.30 s` | `0.25 s` | `T` cycles |

The compiled production-profile steering seeds remain unchanged. Browser DEV steering calibration
applies `D=12 / M=60 / ACT=0.25` to the player instance when the selector adapter is mounted.
M9.12B does not alter steering.

The browser tire default remains `GRIP=2.00 / PEAK=20% / SLIDE=80%`, preserving the previous working
point as a stable A/B reference. Lower GRIP/PEAK choices are removed and the exposed range extends
to `GRIP=3.00 / PEAK=30%` so monotonic improvement can be tested rather than mistaken for an
optimum at the old boundary.

Changing one tire axis still preserves the other two displayed characteristics exactly as in M9.12.
GRIP co-scales the existing stiffness multiplier so PEAK does not move; PEAK changes the stiffness
required to reach the requested slip at the current GRIP; SLIDE changes only the existing post-peak
ratio. No new persistent tire state is added.

M9.10 remains the constitutive authority for the stateless C1 large-lateral-slip falloff and the
monotone scalar implicit wheel solve. M9.12/M9.12A/M9.12B do **not** yet split longitudinal and
lateral tire profiles: GRIP and PEAK are common one-k characteristics, while SLIDE remains the
M9.10 lateral-only post-peak plateau so pure longitudinal wheel solving stays unchanged.

The 6 x 6 x 5 selector product exposes 180 tire calibrations. The upper values are diagnostic
exploration values, not frozen claims about production-real tire coefficients.

M9.11 remains the current steering law:

```text
A = M - D
automatic = clamp(betaTravel, -A, +A)
deltaTarget = clamp(automatic + u*D, -M, +M)
```

The current M/D selector product has `A >= 36 deg`. `A` remains derived only. No D limiter,
speed-dependent D, tire-dependent steering authority, yaw feedback, washout or drift mode is
introduced.

`M`, `D`, `ACT`, GRIP, PEAK and SLIDE remain current DEV tuning axes, not frozen final handling
values. If GRIP=3.00 and PEAK=30% again become the preferred boundary, that result is evidence for
another architecture-level diagnosis before freezing or extending the tire values again.

M9.9 remains the common axle-balance and slide-controllability authority. The shared compiled tire
seed is `front=9.75 / rear=9.75`; geometry, load transfer, inertia, combined slip and drive-torque
distribution remain the causes of axle behavior. The product rule remains:

> **Uncontrollable slide is forbidden; controllable drift is allowed.**

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
4. `docs/105_m9_12b_upward_tire_range_expansion.md` — current scoped GRIP/PEAK browser range.
5. `docs/104_m9_12a_centered_handling_comparison_ranges.md` — current steering comparison range and
   browser starting calibration; prior tire range superseded by 105 only for GRIP/PEAK scope.
6. `docs/103_m9_12_independent_tire_calibration_axes.md` — GRIP/PEAK/SLIDE independence authority.
7. `docs/102_m9_11a_steering_selector_test_range.md` — historical prior M/D/T comparison domain,
   superseded by 104 only for range/default scope.
8. `docs/101_m9_11_simplified_travel_direction_steering.md` — current steering law and underlying
   M/D/T ownership authority.
9. `docs/100_m9_10_post_peak_sliding_tire.md` — retained tire post-peak constitutive authority.
10. `docs/99_m9_9_controllable_drift_foundation.md` — common tire balance and deep-sideslip
    controllability authority.
11. `docs/98_m9_8_selectable_production_vehicle_catalog.md` — vehicle catalog and profile-selection
    authority.
12. `docs/87_m9_0_two_station_arcade_vehicle_dynamics.md` — retained common vehicle mechanics.
13. `docs/78_m8_0_phase9_vehicle_physics_architecture_freeze.md` and
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
- Browser calibration applies the current DEV center without rewriting compiled production-profile
  seeds.
- `A=M-D` is derived only; there is no automatic-authority state or selector.
- `src/physics/arcade-vehicle-physics.ts` owns the unit-coefficient travel-direction transform and
  the sole physical front road-wheel angle.
- `src/physics/driving-actuator.ts` owns finite steering/throttle/brake response.
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

The selector zone is visible on desktop and touch layouts. The existing TIRE selector area contains
three compact cycle buttons (`G`, `P`, `S`) rather than expanding the selector zone vertically.
Large steering/throttle/brake buttons remain touch-gated. Keyboard, touch and HUD all mutate/read
the same vehicle-owned calibration.

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
src/browser/steering-calibration-selection.ts M/D/ACT choice/default/format authority
src/browser/steering-calibration-controls.ts  keyboard/touch M/D/ACT vehicle adapter
src/browser/tire-friction-selection.ts        GRIP/PEAK/SLIDE choice/default/format authority
src/browser/tire-friction-controls.ts         keyboard/touch tire-calibration adapter
src/browser/mobile-selector-controls.ts       authority-derived selector presentation
src/input/steering-input-arbiter.ts           shared steering-source authority
src/input/pedal-input-arbiter.ts              shared pedal-source authority
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

M9.9, M9.10, M9.11, M9.12, M9.12A and M9.12B standalone validation records remain under
`docs/validation/`. Exact release identity is established by the record-inclusive PR head, pure
fast-forward main, same-SHA main-push CI and GitHub Pages deployment under `AGENTS.md`.
