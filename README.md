# SUPER OUTRIDE — M9.1 Four-Profile Debug HUD Candidate

Browser-based 320×240 raster pseudo-3D high-speed driving game inspired by Out Run, Super Hang-On, OutRunners and the Super Scaler era.

> **Physics is world-space. Renderer is chainage-driven raster pseudo-3D. Topology stays above Core. Open is the general runtime model.**

`README.md` is an entry point and current-state index. It is not a second normative design document.

The historical takeover procedure that preserved the M8.2-M8.7 candidate and began
the common vehicle architecture is
`docs/SUPER_OUTRIDE_CODEX_HANDOFF_2026-08-31_M9_VEHICLE_UNIFICATION.md`. It is implementation
handoff context, not current design authority; the normative M9 authority is the numbered document linked below.

## Current milestone status

M9.1 adds provisional FR, MR, RR and BIKE compiled profiles and one common compact debug HUD for all
three course compositions. The HUD is limited to course/profile selection, speed/RPM/gear, requested
and actual controls, body yaw and a top-down body-axis G sensor. It adds no physics state or
vehicle-kind mechanics branch. The authority is `docs/88_m9_1_four_profile_debug_hud.md`.

M9.0 freezes one Two-Station Arcade Vehicle Dynamics solver shared by every compiled profile. It
owns three finite normalized actuator channels, wheel-torque-only drive/braking, no baseline
ABS/TCS and presentation-only BIKE lean. The authority is
`docs/87_m9_0_two_station_arcade_vehicle_dynamics.md`; the common-solver migration is complete on
PR #100, while release status remains candidate pending validation-inclusive exact-head CI and the
explicit release procedure.

M8.7 replaces only the CIRCUIT course with an approximately 12.076 km lap mixing 190, 320, 380,
520 and 680 m-radius corners throughout. Its smooth physical elevation spans approximately 96 m
and owns two straight-line crests that naturally produce brief jumps and normal recontact through
unchanged vehicle physics. BRANCHING remains on its existing parent geometry. The authority is
`docs/86_m8_7_varied_elevation_circuit.md`.

M8.6 extends the shared camera-relative render interval from 150 m to 200 m (195 m ahead of the
player). The geometric infinite horizon remains the exact projection limit and the Far Background
tracks it dynamically. GroundMap depth and renderer workloads are recompiled and re-observed for
the wider interval. The authority is `docs/85_m8_6_two_hundred_meter_render_distance.md`.

M8.5 raises the shared base downward camera pitch from 8 to 12 degrees and derives the matching
2.851878849 m flat-road camera height so player `Y=190` remains exact. LINEAR, BRANCHING and
CIRCUIT consume one current camera profile. GroundMap density and renderer workload evidence are
recompiled for the new presentation. The authority is `docs/84_m8_5_downward_camera_presentation.md`.

M8.4 historically expanded the CIRCUIT lap from one to two separated 90 m-radius compound low-speed
sections. The new lap is approximately 10.133 km; ordinary car physics and the existing rival
driver braked for and cleared both sections without course-specific lower-layer behavior. Its
historical authority is `docs/83_m8_4_dual_low_speed_circuit_complex.md`; M8.7 now supersedes its
current CIRCUIT geometry.

M8.3 exposes all three course forms through one browser boot authority:

```text
[1] LINEAR  [2] BRANCHING  [3] CIRCUIT
```

LINEAR is one finite open 8 km debug highway. BRANCHING course debug has no leading rival, so the
player's own first physical crossing selects either child without rival-locked wrong-branch
recovery. CIRCUIT retains its explicit finite-window lap authority. The current course-debug
authority is `docs/82_m8_3_three_mode_course_debug.md`.

M8.2 remains the current camera architecture authority and M8.5 owns its pitch/height tuning.
M9.0 supersedes the scoped M8.0 CAR/BIKE mechanical split and M8.1 input-response decisions while
retaining their stated world/contact/tire and travel-direction steering foundations. Vehicle feel
parameters remain `DEV_UNCALIBRATED`.

M8.0 / Phase 9 vehicle-physics implementation and regression migration are complete on:

```text
branch: feature/phase9-vehicle-physics-freeze
PR:     #88 — M8.0 Phase 9 vehicle physics architecture freeze
status: final exact-head release procedure recorded by Git / PR / workflow history
```

The current normative vehicle-physics architecture is, in supersession order:

```text
docs/88_m9_1_four_profile_debug_hud.md
docs/87_m9_0_two_station_arcade_vehicle_dynamics.md
docs/78_m8_0_phase9_vehicle_physics_architecture_freeze.md
docs/80_m8_1_car_self_steering_control.md
```

The M8.0 implementation/finalization checkpoint is:

```text
docs/SUPER_OUTRIDE_CODEX_HANDOFF_2026-08-28_M8_0.md
```

That handoff records the audited baseline, migration history and release procedure. PR #88 is
released history; the handoff is historical navigation context, not current work or a second design authority.

The self-reference-safe M8.0 release evidence is `docs/validation/M8_0_PHASE9_VEHICLE_PHYSICS_VALIDATION.txt`. Exact release identity is the validation-inclusive PR #88 commit for which GitHub records PR head = PR merge = `main`, with successful exact-head PR CI and main-push build/Pages deployment. Do not infer the SHA from this file.

## Development entry point

For current vehicle work, read in this order:

1. `AGENTS.md` — persistent coding-agent/development/release contract.
2. `docs/README.md` — documentation authority, supersession and validation-evidence policy.
3. `docs/00_core_design_freeze.md` plus addenda `00a`, `00b`, `00c` — frozen renderer/metric/open-model authority.
4. `docs/88_m9_1_four_profile_debug_hud.md` — current profile-selection and shared debug-HUD authority.
5. `docs/87_m9_0_two_station_arcade_vehicle_dynamics.md` — current shared vehicle-mechanics authority.
6. `docs/78_m8_0_phase9_vehicle_physics_architecture_freeze.md` and
   `docs/80_m8_1_car_self_steering_control.md` — retained foundations and explicitly superseded history.
7. `docs/81_m8_2_body_pitch_movement_yaw_camera.md` through
   `docs/86_m8_7_varied_elevation_circuit.md` — current camera/composition/render/course authorities.
8. Relevant source/types/compilers and regression tests — executable implementation contract.

The 2026-08-28 M8.0 and 2026-08-31 M9 handoffs remain historical checkpoint/navigation records.

Historical migration context remains in `docs/SUPER_OUTRIDE_CODEX_HANDOFF_2026-08-25.md`; it does not supersede current M8.0 authority or release evidence.

At and after the validated FINAL CODEX MIGRATION POINT, the repository—not a previous ChatGPT/Codex transcript—is the continuing project memory.

## Codex migration freeze lineage

PR-C completed at this exact baseline:

```text
main SHA after PR-C:
3956c23c7209ec271b42ee4a98e5c9510919f19d

package:
super-outride-m6-51@0.6.51

tests:
433 / 433 pass / 0 fail / 0 skipped

PR-C:
#75 Freeze Codex migration authority
```

That SHA is the **PR-C completion baseline**, not the FINAL CODEX MIGRATION POINT. The later final clean-room audit, final validation-inclusive CI, pure fast-forward release and main-push Pages verification establish the final migration point.

The exact released final migration SHA belongs to:

```text
docs/validation/REPOSITORY_FINAL_CODEX_MIGRATION_VALIDATION.txt
Git / PR / main-ref identity
main-push Pages workflow identity
```

rather than a self-referential README edit.

The last pre-M7 runtime-changing baseline recorded by the migration sequence remains:

```text
6e15c374ba6679eec16b589c68941154c67665fd
PR #70 M6.51 Pages branching continuation hotfix
431 / 431 tests
```

PRs #71–#75 changed takeover documentation, repository organization, documentation/evidence authority, behavior-preserving source placement and migration authority. They did not intentionally change gameplay/runtime algorithms or tuning.

## Current milestone state

```text
M0–M5      browser / geometry / visual / driving foundations      complete
M6.0–43    race progress / route / runtime / rival foundations    complete
M6.44      Open Path Core                                          complete
M6.45      Open Source Profiles                                    complete
M6.46      Branch Violation Recovery                               complete
M6.47      Open Parent Stage Integration                           complete
M6.48      Explicit Circuit Topology Foundation                    complete
M6.49      Circuit Runtime Window Integration                      complete
M6.50      Circuit Race Progress                                   complete
M6.51      Circuit Live Runtime Integration                        complete
M6.51      Pages branching continuation hotfix                     complete
M6.52      Shared Field Route Progress                              complete
M6.53      BRANCHING Session Authority Normalization                complete
M6.54      CIRCUIT Multi-Actor Integration                          complete
M7.0       Vehicle Dynamics Architecture Freeze                     historical / superseded in scoped physics by M9.0
M7.1       Highway Calibration Course Authoring                     complete
M7.2       Default BRANCHING Highway Integration                    complete
M7.3       Grip Calibration Pass 1 + Instrument HUD                 historical / scoped physics superseded by M9.0
M7.4       Transient Tire Response                                  historical / scoped physics superseded by M9.0
M8.0       Phase 9 Ideal Vehicle Physics Architecture               retained contact/tire foundation; solver split superseded by M9.0
M8.0       CIRCUIT Low-Speed Corner Authoring                        historical public course follow-on
M8.1       CAR Predictive Travel-Direction Steering Assist            retained travel-direction concept; response boundary superseded by M9.0
M8.2       Body-Pitch / Movement-Yaw Chase Camera                      current player-camera authority
M8.3       Three-Mode Course Debug                                      current browser composition authority
M8.4       Dual Low-Speed Circuit Complex                               historical CIRCUIT course-authoring authority
M8.5       Downward Camera Presentation                                  current camera pitch/height authority
M8.6       200 m Render Distance + Horizon Audit                          current render-distance authority
M8.7       Varied-Elevation Medium/High-Speed Circuit                     current CIRCUIT course-authoring authority
M9.0       Two-Station Arcade Vehicle Dynamics                             current vehicle architecture; implementation candidate
M9.1       Four-Profile Common Debug HUD                                    current profile/debug composition candidate
```

Current topology/runtime/physics design sequence:

```text
docs/62_m6_44_open_path_core.md
docs/63_m6_45_open_source_profiles.md
docs/64_m6_46_branch_violation_recovery.md
docs/65_m6_47_open_parent_stage_integration.md
docs/66_m6_48_explicit_circuit_topology.md
docs/67_m6_49_circuit_runtime_window.md
docs/68_m6_50_circuit_race_progress.md
docs/69_m6_51_circuit_live_runtime.md
docs/70_m6_52_field_route_progress.md
docs/71_m6_53_branching_session_normalization.md
docs/72_m6_54_circuit_multi_actor_integration.md
docs/73_m7_0_vehicle_dynamics_architecture_freeze.md
docs/74_m7_1_highway_calibration_course_authoring.md
docs/75_m7_2_default_branching_highway_integration.md
docs/76_m7_3_grip_and_instrument_hud.md
docs/77_m7_4_transient_tire_response.md
docs/78_m8_0_phase9_vehicle_physics_architecture_freeze.md
docs/79_m8_0_circuit_low_speed_corner_authoring.md
docs/80_m8_1_car_self_steering_control.md
docs/81_m8_2_body_pitch_movement_yaw_camera.md
docs/82_m8_3_three_mode_course_debug.md
docs/83_m8_4_dual_low_speed_circuit_complex.md
docs/84_m8_5_downward_camera_presentation.md
```

Historical validation evidence under `docs/validation/` is evidence, not current design authority.

## M8.0 validation checkpoint

The audited `main` baseline for PR #88 is:

```text
dd2b35c6e2187770ba71d0a8a29a5ae65a9298b1
```

The pre-validation implementation candidate is:

```text
b36ab494585d36eac58712d3e200297c4f46694e
GitHub Actions run 33164042964
```

That exact PR run verified its checkout, compiled successfully and completed:

```text
483 tests
483 pass
0 fail
0 skipped
```

Adding the validation record changes the head, so the final validation-inclusive SHA and its PR/main-push runs are intentionally completed by GitHub history rather than embedded self-reference. See the validation record for the exact release contract and covered mechanics.

Always inspect the current PR head and latest CI on takeover; the embedded tested SHA above is evidence for the checkpoint, not a self-referential current-head declaration.

## Final migration state

The original one-time takeover audit and cleanup PR-A/PR-B/PR-C are historical predecessors to the final repository migration freeze. They must not be confused with current M8.0 development.

The clean-room manifest is:

```text
docs/validation/REPOSITORY_FINAL_CLEAN_ROOM_AUDIT_MANIFEST.txt
```

The final migration release evidence is:

```text
docs/validation/REPOSITORY_FINAL_CODEX_MIGRATION_VALIDATION.txt
```

Normal development proceeds under `AGENTS.md`; previous ChatGPT threads are not authority.

## Run / test

```bash
npm install
npm run build
npm test
python3 -m http.server 8000
```

LINEAR debug fixture:

```text
http://localhost:8000/?mode=linear
```

Default BRANCHING debug fixture:

```text
http://localhost:8000/?mode=branching
```

CIRCUIT DEV fixture:

```text
http://localhost:8000/?mode=circuit
```

The `1` / `2` / `3` keys switch these same URL modes. Selection changes only the top-level browser
composition; lower engine layers remain topology-neutral ordinary consumers.

Keyboard driving controls are `Left/Right` steering, `Up` or `X` throttle, and `Down` or `Z`
brake. Equivalent pedal keys feed the same canonical input and may be held independently.

Package and visible milestone metadata are synchronized at `super-outride-m9-1@0.9.1`. Exact release status still comes from Git/PR/main/workflow identity, not a package string alone.

Vehicle handling remains:

```text
DEV_UNCALIBRATED
```

M8.1 release evidence remains in `docs/validation/M8_1_CAR_SELF_STEERING_VALIDATION.txt`. The
ordered M8.2–M8.7 candidate is preserved independently at `c241698`; M9.0 candidate evidence is
recorded in `docs/validation/M9_0_VEHICLE_UNIFICATION_VALIDATION.txt`; M9.1 candidate evidence is
recorded in `docs/validation/M9_1_FOUR_PROFILE_DEBUG_HUD_VALIDATION.txt`.

## Current composition and source-placement landmarks

```text
src/boot.ts          1/2/3 and URL course-mode selection authority
src/main-linear.ts   LINEAR composition root
src/main.ts          BRANCHING composition root
src/main-circuit.ts  CIRCUIT composition root
src/browser/vehicle-profile-selection.ts Q/W/E/R profile-selection authority
src/browser/vehicle-debug-hud.ts          one shared compact vehicle HUD

src/camera/m5-camera.ts            M8.2 body-pitch / movement-yaw camera authority
src/camera/current-camera-profile.ts M8.5 shared pitch/height tuning authority
src/core/presentation-scale.ts       M8.6 shared near/far render-distance authority
src/dev/m8-7-varied-elevation-circuit.ts M8.7 CIRCUIT geometry/elevation authority
src/render/vehicle-yaw-debug.ts    DEV body-yaw overlay
src/render/vehicle-presentation.ts derived sprite/handwheel/BIKE-lean presentation
src/input/touch-input.ts           pointer + page lifecycle authority
src/physics/driving-actuator.ts    one finite steering/throttle/brake response authority
src/physics/automatic-powertrain.ts wheel-torque powertrain boundary
src/physics/tire-wheel.ts           M8.0 tire/wheel primitives
src/physics/vehicle-math3.ts        minimal vector/3D math
src/physics/vehicle-dynamics.ts     common contact/surface/suspension observations
src/physics/vehicle-profiles.ts     compiled FR/MR/RR/BIKE parameter authority
src/physics/arcade-vehicle-physics.ts one Two-Station Arcade Vehicle Dynamics solver
src/physics/vehicle-contract.ts     read-only consumer contracts
src/physics/surface-map.ts         general SurfaceMap authority
```

`src/dev` is not a general runtime authority. General layers must not import it. The only non-DEV TypeScript files allowed to assemble DEV fixtures are the explicit top-level browser composition roots:

```text
src/main.ts
src/main-linear.ts
src/main-circuit.ts
```

`src/dev/**` may depend on ordinary general layers; that dependency direction must not be reversed. `tests/source-boundary-normalization.test.mjs` enforces the boundary.

Retired authority paths must not be recreated as compatibility shims merely to satisfy superseded tests.

## Core orientation

The minimum renderer/topology orientation remains:

```text
world X/Y/Z = vehicle physics authority

d = s_render - s_camera
  = renderer pseudo-depth authority

Open   = general data/runtime model
Cyclic = explicit upper-level topology choice
Renderer = topology-blind

player-depth presentation:
2.0 m = 80 px
1.0 m = 40 px
f = 200 px
D_cam = 5.0 m = f / 40
```

Do not use this summary to replace the Core Freeze/addenda or executable tests.

## Release discipline

The full release contract is in `AGENTS.md`:

```text
exact main
-> dedicated branch
-> PR exact-head full green CI
-> validation-inclusive exact-head full green CI
-> pure fast-forward check
-> force=false main update to validated SHA
-> verify main == PR head == validated SHA as required by the repository contract
-> verify main-push build/deploy on the same SHA
```

Do not release an unvalidated SHA, do not force `main`, and do not create compatibility authority merely to make an obsolete regression green.
