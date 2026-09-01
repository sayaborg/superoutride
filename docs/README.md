# SUPER OUTRIDE Documentation Authority

This directory contains current normative authority, chronological milestone records, takeover context, and historical validation evidence. Those are intentionally different document classes.

The current takeover checkpoint is:

```text
SUPER_OUTRIDE_CODEX_HANDOFF_2026-09-01_M9_6.md
```

It records the released M9.6 source/PR/CI/Pages identity, completed-work boundary and fresh-thread
restart procedure. It is navigation context only and does not replace numbered authority, source,
tests or current Git/PR/workflow state.

The historical M9 implementation handoffs are:

```text
SUPER_OUTRIDE_CODEX_HANDOFF_2026-08-31_M9_VEHICLE_UNIFICATION.md
SUPER_OUTRIDE_CODEX_HANDOFF_2026-08-31_STEERING_INPUT_AND_SELF_STEER.md
```

They record the dirty M8.2-M8.7 preservation boundary, staged M9.0 unification procedure and the
later separated steering-input/self-steer investigation. Both are resolved historical context,
not current task state or normative authority.

## 1. Normative frozen authority

The current frozen renderer/core authority is the Core Freeze plus its explicit addenda:

```text
00_core_design_freeze.md
00a_core_design_freeze_addendum_m5_2.md
00b_core_design_freeze_addendum_m6_44.md
00c_core_design_freeze_addendum_m6_45.md
```

The current vehicle-physics, vehicle-debug and player-camera authorities are:

```text
97_m9_7_bounded_washout_steering_assist.md
95_m9_5_debug_tire_characteristic_presets.md
94_m9_4_selectable_tire_friction.md
88_m9_1_six_profile_debug_hud.md
87_m9_0_two_station_arcade_vehicle_dynamics.md
78_m8_0_phase9_vehicle_physics_architecture_freeze.md
80_m8_1_car_self_steering_control.md
81_m8_2_body_pitch_movement_yaw_camera.md
84_m8_5_downward_camera_presentation.md
85_m8_6_two_hundred_meter_render_distance.md
91_m9_1_dual_yaw_camera_modes.md
```

M9.5 supersedes M9.4's exact browser comparison table and its prohibition on calibrating linear
tire demand. The browser exposes numbered DEV presets `1 / 2 / 3`, defaulting to the exact current
tire as `1`. One vehicle-instance state atomically owns reference-friction and linear-stiffness
multipliers. Presets `2` and `3` share the same initial slope and delay the current car front-tire
plateau to `12 deg` and provisional `15 deg`; compiled profiles, `rhoKnee`, the radial law and
relative SurfaceMap materials remain unchanged. Ordinary construction and rivals retain unit/unit
calibration.

M9.7 supersedes M9.2 in full as the current steering-control calibration and browser-selector
authority while restating M9.2's retained symmetric actuator-traversal table. Travel-direction
feedback is structurally unit gain and has no calibration state or selector. One Driver-owned
yaw-rate baseline supplies zero-DC washout damping inside a bounded automatic-steering allocation;
the driver offset is added only after that allocation and then follows the unchanged physical rack.
The automatic bound is derived as mechanical maximum minus compiled driver offset and must pass a
deep-beta bad-attractor exclusion, not merely demonstrate one healthy equilibrium. Exactly three
runtime steering selectors remain: yaw-transient gain, yaw-washout time and symmetric actuator
traversal. Compiled profiles separately own driver offset, rack limits/response and steering-only
low-speed regularization. Tires, acceleration caches, Guide, camera, route and topology remain
outside Driver control. The four CAR profiles currently retain provisional
`D=9.5 deg / A=21.5 deg`; BIKE1/BIKE2 retain `D=9 deg / A=22 deg`. BIKE flat
steady/deep-seed/pulse probes have been measured. The general rival removes
its absolute-yaw request term and uses one contiguous `0.42 g / 4 m/s^2 / 12..56 m/s` braking-
distance envelope over derived `400 m` coverage without a profile, vehicle-kind or course branch.
FR/BIKE1/BIKE2 complete mountain, Tsukuba and FISCO recovery-free inside road width, below `15 deg`
sideslip and with zero unsupported ticks. All handling remains `DEV_UNCALIBRATED`.

M9.4 historically superseded only M9.0's prohibition on a control path changing `mu`: one explicit
vehicle-instance tire calibration now multiplies compiled tire `muRef` before the unchanged
relative SurfaceMap factor and normal load. The browser player selects `SEMI / 1.5x / 2.0x /
2.5x`, defaulting to the retained `SEMI=1.0x`; rivals and ordinary construction remain `1.0x`.
The one-k demand, stiffness, `rhoKnee`, combined-slip transition, wheel solve and all SurfaceMap
materials remain unchanged.

M9.2 historically superseded the implicit unit gain on M9.0 travel-direction steering feedback and
the M9.0 asymmetric steering-actuator rates. Its gain and absolute-yaw-preview calibration are now
superseded and removed by M9.7. Its symmetric actuator comparison survives only because M9.7
restates it; M9.2 is no longer a partially current browser authority.

M9.1 preserves M9.0 common mechanics and owns current FR/MR/RR/AWD/BIKE1/BIKE2 browser profile
selection, normalized front/rear drive-torque distribution and the shared presentation-only debug
HUD. M9.1 supersedes M9.0 simultaneous pedal requests: one input-layer arbiter resolves keyboard
aliases and touch pointers to an exclusive latest-held-source ACCEL/BRAKE request before ordinary
finite actuators. The HUD shows that request as blue/red/uncolored indicators, alongside actual
response meters, one common `18:1` presentation-only handwheel conversion and a minimal
inertial-load G cross/dot. The four cars share one engine/tire/chassis package; handling values
remain provisional.

M9.0 is the current common vehicle-mechanics authority. It supersedes the separate M8.0 CAR/BIKE
solver architecture and the M8.1 immediate steering-release rule within its explicit scope while
retaining the M8.0 contact/tire/wheel chain and M8.1 travel-direction steering concept.

It explicitly supersedes conflicting vehicle-physics architecture decisions in M7.0/M7.3/M7.4 while leaving those earlier milestone documents intact as historical records.
Historically, M8.1 superseded only the M8.0 CAR Driver raw-angle/useful-steer/no-countersteer
decisions. M9.0 now owns shared CAR/BIKE mechanics and finite input response while retaining the
M8.0 contact/tire/wheel chain and M8.1 travel-direction steering concept within its stated scope.
M8.2 supersedes the earlier M5 Guide-lateral/yaw-lag camera authority while preserving the frozen
renderer, metric presentation and current M9.0 vehicle authority.
M8.5 supersedes only the M8.2 initial 8-degree base-pitch and matching camera-height tuning.
M8.6 supersedes only the M8.5 150 m far-depth value and records the geometric-horizon audit.
M9.1 dual-yaw-camera mode supersedes only M8.2's mandatory movement-yaw default. It retains the
same derived movement yaw as an alternate and preserves body-pitch follow and exact centering.

The current browser course-debug composition authority is:

```text
82_m8_3_three_mode_course_debug.md
88_m9_1_six_profile_debug_hud.md
90_m9_1_mobile_touch_selectors.md
91_m9_1_dual_yaw_camera_modes.md
94_m9_4_selectable_tire_friction.md
95_m9_5_debug_tire_characteristic_presets.md
96_m9_6_fisco_circuit.md
97_m9_7_bounded_washout_steering_assist.md
```

The current CIRCUIT DEV course-authoring authority is:

```text
93_m9_3_tsukuba_circuit.md
96_m9_6_fisco_circuit.md
```

## 2. Numbered milestone documents

`01_...` through `97_...` are chronological milestone records. They describe the authority and implementation boundary that existed at each milestone.

They are historical snapshots, not a flat set of simultaneously current specifications. A later milestone/addendum may supersede a scoped assumption in an earlier document without making the earlier document incorrect as history.

Do not rewrite historical milestone prose merely to use current terminology. Resolve apparent conflicts by following the later explicit authority.

The most important current topology/runtime/physics sequence is:

```text
62_m6_44_open_path_core.md
63_m6_45_open_source_profiles.md
64_m6_46_branch_violation_recovery.md
65_m6_47_open_parent_stage_integration.md
66_m6_48_explicit_circuit_topology.md
67_m6_49_circuit_runtime_window.md
68_m6_50_circuit_race_progress.md
69_m6_51_circuit_live_runtime.md
70_m6_52_field_route_progress.md
71_m6_53_branching_session_normalization.md
72_m6_54_circuit_multi_actor_integration.md
73_m7_0_vehicle_dynamics_architecture_freeze.md
74_m7_1_highway_calibration_course_authoring.md
75_m7_2_default_branching_highway_integration.md
76_m7_3_grip_and_instrument_hud.md
77_m7_4_transient_tire_response.md
78_m8_0_phase9_vehicle_physics_architecture_freeze.md
79_m8_0_circuit_low_speed_corner_authoring.md
80_m8_1_car_self_steering_control.md
81_m8_2_body_pitch_movement_yaw_camera.md
82_m8_3_three_mode_course_debug.md
83_m8_4_dual_low_speed_circuit_complex.md
84_m8_5_downward_camera_presentation.md
85_m8_6_two_hundred_meter_render_distance.md
86_m8_7_varied_elevation_circuit.md
87_m9_0_two_station_arcade_vehicle_dynamics.md
88_m9_1_six_profile_debug_hud.md
89_m9_1_low_mid_speed_mountain_circuit.md
90_m9_1_mobile_touch_selectors.md
91_m9_1_dual_yaw_camera_modes.md
92_m9_2_selectable_self_steer_gain.md
93_m9_3_tsukuba_circuit.md
94_m9_4_selectable_tire_friction.md
95_m9_5_debug_tire_characteristic_presets.md
96_m9_6_fisco_circuit.md
97_m9_7_bounded_washout_steering_assist.md
```

The current browser touch-selection authority is
`90_m9_1_mobile_touch_selectors.md`. It derives tappable course and vehicle buttons from the same
arrays used by keyboard selection, keeps URL navigation in `boot.ts`, and keeps profile
reconstruction in the three composition roots. It adds no mobile-only selection or mechanics
state.

The current camera-yaw mode authority is `91_m9_1_dual_yaw_camera_modes.md`. It makes exact
body-yaw lock the default, retains M8.2 movement-yaw follow as the alternate, and makes the DEV
arrow show travel direction while body lock is active. Body-pitch follow and all frozen
renderer/metric rules remain unchanged.

The current selectable steering calibration authority is
`97_m9_7_bounded_washout_steering_assist.md`. It removes travel-direction gain as a value entirely
and gives `Y`, `U`, `T` plus shared touch controls one common authority for yaw-transient gain,
yaw-washout time and symmetric actuator traversal. Digits/numpad `4` through `9` have no steering
meaning. One vehicle-instance calibration owns those three values; one separate Driver filter
state owns only the yaw-rate baseline.

The current debug tire-preset authority is
`95_m9_5_debug_tire_characteristic_presets.md`. It gives keyboard `G`, shared touch buttons and the
HUD one numbered browser table while common tire calibration owns one atomic two-value state.
Preset `1` is the exact prior tire; presets `2` and `3` share a higher initial slope and delay the
current car front-reference plateau to `12 deg` and provisional `15 deg`. Compiled profiles,
`rhoKnee`, the radial law and SurfaceMap authority remain unchanged. M9.4 is its historical
reference-friction-only predecessor.

The current public CIRCUIT course-authoring authorities are `93_m9_3_tsukuba_circuit.md` and
`96_m9_6_fisco_circuit.md`. Course `3` retains M9.3's functional four-wheel Tsukuba Course 2000
reconstruction. Course `4` adds M9.6's functional current Fuji Speedway main-course reconstruction
using published lap/home-straight dimensions, direction, width/elevation ranges and corner
sequence. Both are CIRCUIT DEV authoring only; they do not change vehicle physics, input, the M7.2
BRANCHING parent, or frozen renderer/topology authority.

Current governing topology rule:

> Open is the general data model. Cyclic is an explicit upper-level topology choice. The renderer is neither.

Current governing vehicle-physics rule:

> World state is authoritative; Guide/contact/tire observations are derived; FR, MR, RR, AWD, BIKE1 and BIKE2 produce handling through the same minimum ordinary mechanical chain rather than modes, hidden assists or duplicate state.

Current governing steering rule:

> Steering input is a normalized driver request; one finite actuator value makes digital press
> duration controllable and returns monotonically to exact neutral. Unit-coefficient travel
> direction and zero-DC yaw washout form one bounded automatic term; the driver offset is added
> afterward with reserved rack authority, and one fast rack remains the sole road-wheel response.
> Browser calibration selects only yaw-transient gain, washout time and symmetric actuator
> traversal. Front slip, tire force and acceleration telemetry remain outside steering feedback.

Current governing player-camera rule:

> Camera pitch follows physical body pitch. Camera yaw defaults to exact body-yaw lock and can
> switch to authoritative world-movement yaw measured in that body-pitch plane. Player X is
> centered by world-space camera placement while chainage remains the sole renderer-depth
> authority.

## 3. Known historical-value supersession

M6.17 records the first DEV route gate at approximately `s=545 m`, which was correct for that milestone. The M6.51 Pages branching-continuation hotfix later moved the live first physical route gate to `570 m`; the handoff seam remains `600 m`.

The historical M6.17 value is intentionally retained in its original sequence and annotated there. Incident evidence is:

```text
validation/M6_51_PAGES_BRANCH_HOTFIX_VALIDATION.txt
```

## 4. Validation evidence

Historical CI/release evidence lives under:

```text
validation/
```

Validation files are immutable historical evidence, not current design authority. See `validation/README.md` before interpreting them.

Repository-cleanup validation records follow the same rule: they prove exact-head CI/release facts but do not become design authority.

The final Codex migration has two dedicated evidence records:

```text
validation/REPOSITORY_FINAL_CLEAN_ROOM_AUDIT_MANIFEST.txt
validation/REPOSITORY_FINAL_CODEX_MIGRATION_VALIDATION.txt
```

The first records the Step 7 repository-only audit findings before correction. The second records the self-reference-safe Step 8 final candidate and release contract. Exact final SHA/run identity is completed by Git/PR/main-ref and workflow history without rewriting an already-validated artifact.

The historical Codex-transfer audit for the M8.0 candidate is:

```text
validation/M8_0_CODEX_TRANSFER_AUDIT_2026_08_28.txt
```

It records repository-only authority/navigation, structure/dependency, workflow/CI and temporary-ref hygiene findings for takeover. It is transfer evidence only: it is not design authority, not M8.0 completion evidence, and not release validation.

M8.0 completion/release evidence is:

```text
validation/M8_0_PHASE9_VEHICLE_PHYSICS_VALIDATION.txt
```

It records the green pre-validation candidate, executable Phase 9 acceptance matrix and self-reference-safe exact-head release procedure. Final SHA/run identity is supplied by Git/PR/main-ref/workflow history.

M8.1 CAR predictive travel-direction steering implementation evidence is:

```text
validation/M8_1_CAR_SELF_STEERING_VALIDATION.txt
```

It records the validation-inclusive local candidate, the executable result, browser
checks for both public compositions, and the self-reference-safe exact-head CI procedure.

M9.0 common vehicle-dynamics candidate evidence is:

```text
validation/M9_0_VEHICLE_UNIFICATION_VALIDATION.txt
```

It records the independent M8.2-M8.7 preservation commit, the common-solver migration, causal and
architecture acceptance, three-mode browser checks and the self-reference-safe exact-head CI
procedure.

The original M9.1 four-profile checkpoint remains immutable historical evidence:

```text
validation/M9_1_FOUR_PROFILE_DEBUG_HUD_VALIDATION.txt
```

It records the four compiled provisional profiles, compact shared HUD boundary, executable
acceptance, three-mode browser checks and self-reference-safe exact-head CI procedure.

The corrected M9.1 six-profile/drive-distribution candidate evidence is:

```text
validation/M9_1_SIX_PROFILE_DEBUG_HUD_VALIDATION.txt
```

It records the corrected six-profile selector, common car-package invariant, normalized AWD
drive-torque distribution, causal handling regression, complete suite and three-mode browser checks.

The current M9.1 control-graphics and inertial-G correction evidence is:

```text
validation/M9_1_CONTROL_GRAPHICS_G_SENSOR_VALIDATION.txt
```

It proves six graphical request/actual controls, the cross-and-dot inertial-load direction, the
HUD-only 18:1 handwheel conversion, mechanical invariance, complete suite and browser layout.

The current M9.1 exclusive pedal-input correction evidence is:

```text
validation/M9_1_EXCLUSIVE_PEDAL_INPUT_VALIDATION.txt
```

It proves one cross-device latest-held-source arbiter, exclusive canonical pedal requests,
finite actuator handoff without actuator-side arbitration, blue/red/uncolored requested-pedal
indicators, complete-suite acceptance and browser layout.

The current M9.1 low/mid-speed mountain CIRCUIT evidence is:

```text
validation/M9_1_LOW_MID_SPEED_MOUNTAIN_CIRCUIT_VALIDATION.txt
```

It proves the 95–240 m corner distribution, curved-length share, repeated smooth mountain
elevation, ordinary FR/BIKE1 completion, CIRCUIT-only composition boundary, complete suite and
browser rendering.

The current M9.1 mobile touch-selector evidence is:

```text
validation/M9_1_MOBILE_TOUCH_SELECTORS_VALIDATION.txt
```

It proves authority-derived course/profile buttons, shared tap/keyboard selection paths,
single-active accessible presentation, complete-suite acceptance and portrait/landscape browser
operation.

The current M9.1 dual yaw-camera evidence is:

```text
validation/M9_1_DUAL_YAW_CAMERA_MODES_VALIDATION.txt
```

It proves exact default body-yaw lock, retained M8.2 movement follow, P/touch selection,
mode-dependent TRAVEL/BODY arrow meaning, complete-suite acceptance and portrait/landscape
browser operation.

The current M9.7 bounded washout steering-assist evidence is:

```text
validation/M9_7_BOUNDED_WASHOUT_STEERING_ASSIST_VALIDATION.txt
```

It records the implementation-inclusive exact-head CI, zero-DC/bounded-allocation architecture,
three-selector authority, Cartesian deep-beta exclusion, recovery ordering, general rival
recalibration and recovery-free fork/course integration. The validation-inclusive final identity
is supplied by Git, PR and workflow history under the archive self-reference rule.

The historical released M9.2 selectable steering-calibration evidence is:

```text
validation/M9_2_SELECTABLE_STEERING_CALIBRATION_VALIDATION.txt
```

It proves the then-current independent gain/yaw-preview/symmetric-response selectors, one vehicle-instance
calibration state, recovery/profile-switch preservation, unchanged additive steering law,
deterministic sweeps, complete-suite acceptance and portrait/landscape browser operation.

The current M9.3 Tsukuba CIRCUIT evidence is:

```text
validation/M9_3_TSUKUBA_CIRCUIT_VALIDATION.txt
```

It proves the published 2045 m lap and straight dimensions, four-wheel corner/radius sequence,
exact non-self-intersecting Raster closure, restrained elevation, circuit cross-section, finite
N+1 runtime, CIRCUIT-only composition boundary, complete suite and browser layout/rendering.

The current M9.6 FISCO CIRCUIT evidence is:

```text
validation/M9_6_FISCO_CIRCUIT_VALIDATION.txt
```

It proves the researched 4563 m current-layout reconstruction, published home-straight/corner/
width/elevation identity, exact non-self-intersecting Raster closure, finite N+1 runtime, course-4
composition boundary, retained course-3 Tsukuba, complete suite and browser operation.

The current M9.5 debug tire-preset evidence is:

```text
validation/M9_5_DEBUG_TIRE_PRESETS_VALIDATION.txt
```

It proves the numbered default/cycle, exact slope and reference-car plateau targets, atomic
vehicle-instance persistence, unchanged compiled tire/SurfaceMap authorities, causal common-wheel
behavior, complete-suite acceptance and browser operation.

The retained M9.4 selectable tire-friction evidence is:

```text
validation/M9_4_SELECTABLE_TIRE_FRICTION_VALIDATION.txt
```

It proves exact browser choices, vehicle-instance persistence, unchanged tire/surface authorities,
causal common-wheel behavior, complete-suite acceptance and browser operation.

The preceding stale steering-source incident evidence is:

```text
validation/M9_2_STEERING_INPUT_STALE_SOURCE_VALIDATION.txt
```

It proves that the input-layer arbiter fixes superseded keyboard/touch steering sources without a
camera, tire or physics mask.

## 5. Historical M9 implementation handoffs

The M9 implementation takeover procedure was:

```text
SUPER_OUTRIDE_CODEX_HANDOFF_2026-08-31_M9_VEHICLE_UNIFICATION.md
```

It remains historical navigation and execution-order context only. It does not supersede the
current frozen vehicle authority. Its required normative M9.0 design and executable architecture
boundary are now present in `87_m9_0_two_station_arcade_vehicle_dynamics.md` and the dedicated M9
regressions.

The later steering investigation handoff was:

```text
SUPER_OUTRIDE_CODEX_HANDOFF_2026-08-31_STEERING_INPUT_AND_SELF_STEER.md
```

Its staged input-defect and self-steer work is complete. The causal history remains useful, but
current input authority is executable in `src/input/steering-input-arbiter.ts` and current
calibration authority is `97_m9_7_bounded_washout_steering_assist.md`. M9.2 remains its historical
predecessor only.

## 6. M8.0 implementation/finalization handoff

The M8.0 / Phase 9 implementation and finalization checkpoint is:

```text
SUPER_OUTRIDE_CODEX_HANDOFF_2026-08-28_M8_0.md
```

It records the audited main baseline, active branch/PR, migration history, non-reopen decisions and exact-head release contract. After release it remains historical finalization context, not current design authority.

A fresh Codex session should start from `../AGENTS.md`, then use this finalization handoff only when PR #88 lineage is relevant. The handoff is not a second vehicle-physics authority; `78_m8_0_phase9_vehicle_physics_architecture_freeze.md` owns the M8.0 architecture.

### Temporary handoff-preparation branch refs

The final transfer audit independently verified that these three temporary refs are exactly identical to implementation checkpoint `3adccfc94f2ab05ceaf07f233abe61f00114c3c9` (`ahead_by=0`, `behind_by=0`, no unique commits/files):

```text
feature/phase9-vehicle-physics-freeze-copy
feature/phase9-vehicle-physics-freeze-handoff
feature/phase9-vehicle-physics-freeze-handoff-check
```

A fourth accidental connector ref was created during the final transfer audit:

```text
noop-do-not-create
```

It is only a snapshot of active-branch commit `84dd46bcb4ca764570ce852a3d9803b129d1499b` immediately after the AGENTS navigation correction and contains no independently intended work. The active implementation branch remains exclusively:

```text
feature/phase9-vehicle-physics-freeze
```

All four temporary refs were verified at their recorded identities/ancestry and deleted during PR #88 completion. Their historical SHAs remain recorded in the transfer audit. Do not recreate, merge or continue work from them.

## 7. Codex migration handoff

The historical repository-migration handoff is:

```text
SUPER_OUTRIDE_CODEX_HANDOFF_2026-08-25.md
```

The original long-form takeover snapshot at this path requested a mandatory first read-only Codex audit. That original audit and cleanup PRs #72-#75 were completed before the final clean-room freeze, but they are not themselves proof that the later Step 7-9 finalization completed.

The released FINAL CODEX MIGRATION POINT is established only after the final clean-room manifest is resolved, the final validation-inclusive exact head receives complete green CI, that exact head fast-forwards `main` with `force=false`, SHA identity is verified, and the same `main` SHA receives successful Pages build/deploy. The dedicated final validation record and Git/PR/workflow history are the evidence for that transition.

This migration handoff remains historical migration context. It does not replace M8.0 architecture authority, the PR #88 finalization record, or current task evidence.

Handoff documents are context/navigation snapshots. They do not override the Core Freeze/addenda, later milestone authority, types, compilers, or regression tests.

## 8. Repository-level documents

```text
../AGENTS.md  persistent agent/development/release contract
../README.md  repository entry point and current-state index
```

For current work, start with the working rules in `../AGENTS.md`, this authority index and the
latest relevant milestone authority. Use either implementation handoff only when its historical PR
lineage is relevant.

At and after the validated FINAL CODEX MIGRATION POINT, repository contents/history—not previous ChatGPT threads—are the continuing project memory.

If documents appear inconsistent, do not silently choose one. Identify which authority owns the topic and whether a later explicit authority superseded the older statement.
