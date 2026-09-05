# SUPER OUTRIDE — Agent Development Contract

This file is the persistent working contract for coding agents operating in this repository.

It is intentionally **not** a second design document. Normative game/rendering mathematics live in the Core Freeze documents and their explicit addenda. Milestone-specific decisions live in the corresponding milestone documents and regression tests.

Before changing code, read this file, the repository entry/authority documents listed below, and the current active handoff checkpoint when takeover context is relevant.

---

## 1. Project identity

SUPER OUTRIDE is a browser-based 320×240 raster pseudo-3D high-speed driving game inspired by Out Run, Super Hang-On, OutRunners and the Super Scaler era.

Product route forms are:

```text
LINEAR
BRANCHING
CIRCUIT
```

Cars and motorcycles share the same world-space driving architecture. Vehicle handling is currently `DEV_UNCALIBRATED` unless a later normative document explicitly changes that status.

---

## 2. Authority map

Use each source only for the authority it owns.

### Frozen design authority

```text
docs/00_core_design_freeze.md
docs/00a_core_design_freeze_addendum_m5_2.md
docs/00b_core_design_freeze_addendum_m6_44.md
docs/00c_core_design_freeze_addendum_m6_45.md
```

The addenda supersede only the specific earlier assumptions they explicitly replace.

The current touch-driving calibration/input/presentation authority is:

```text
docs/108_m9_14_compact_touch_expanded_diagnostic_ranges.md
docs/107_m9_13_full_screen_analog_touch.md
```

M9.14 supersedes M9.13 only for the full-scale touch displacement calibration. Current touch full
scale is exactly `64 CSS px`; 32 CSS px is 50% and 64 CSS px is 100%. The value no longer changes
with viewport dimensions or orientation and is independent of native backing-store/device pixel
density, but it is not claimed to equal an exact physical millimeter on every device.

M9.13 remains authoritative for the full-screen relative analog touch architecture. Pointer-down
selects a fixed left-half STEERING or right-half ACCEL/BRAKE role and the pointer-down coordinate is
that pointer's neutral origin. Canonical pedal requests remain mutually exclusive but accept boolean
digital shorthand or a finite normalized magnitude in `[0,1]`. An active analog touch may use the
generic `DIRECT` apply mode so displacement is the current amount of the existing vehicle actuator
state; release/cancel returns to ordinary neutral and the existing actuator release rate owns decay.
Keyboard remains digital/rate-limited. M9.13/M9.14 add no touch-specific vehicle state, rack, pedal
state, steering law, tire law, vehicle/course branch or renderer authority.

The current vehicle-physics architecture authority is:

```text
docs/113_m9_19_progressive_drift_calibration.md
docs/112_m9_18_load_proportional_one_k_tire.md
docs/111_m9_17_direct_robotized_mt.md
docs/110_m9_16_engine_power_diagnostic_selector.md
docs/109_m9_15_absolute_slide_one_k_tire.md
docs/108_m9_14_compact_touch_expanded_diagnostic_ranges.md
docs/106_m9_12c_extended_peak_diagnostic.md
docs/105_m9_12b_upward_tire_range_expansion.md
docs/104_m9_12a_centered_handling_comparison_ranges.md
docs/103_m9_12_independent_tire_calibration_axes.md
docs/102_m9_11a_steering_selector_test_range.md
docs/101_m9_11_simplified_travel_direction_steering.md
docs/100_m9_10_post_peak_sliding_tire.md
docs/99_m9_9_controllable_drift_foundation.md
docs/98_m9_8_selectable_production_vehicle_catalog.md
docs/87_m9_0_two_station_arcade_vehicle_dynamics.md
docs/78_m8_0_phase9_vehicle_physics_architecture_freeze.md
docs/80_m8_1_car_self_steering_control.md
docs/81_m8_2_body_pitch_movement_yaw_camera.md
docs/84_m8_5_downward_camera_presentation.md
docs/85_m8_6_two_hundred_meter_render_distance.md
docs/91_m9_1_dual_yaw_camera_modes.md
```

M9.11 is the current steering-control law authority. It removes M9.7 yaw-transient feedback,
zero-DC yaw-washout state and both old steering selectors. The common law is now only the
unit-coefficient travel-direction transform plus Driver offset and one physical rack:

```text
A = M - D
automatic = clamp(betaTravel, -A, +A)
deltaTarget = clamp(automatic + u*D, -M, +M)
```

`A` is derived only and must never become a stored state, profile field or selector. Document 108
(M9.14) is the current scoped browser steering comparison-range authority; it supersedes document
104 only for the current DEV `D` range while preserving the centered default and retaining `M`/ACT:

```text
D   = 10 / 11 / 12 / 13 / 14 / 15 / 16 / 17 / 18 / 19 / 20 deg  browser default 12 deg
M   = 50 / 55 / 60 / 65 / 70 deg                                browser default 60 deg
ACT = 0.20 / 0.225 / 0.25 / 0.275 / 0.30 s                      browser default 0.25 s
```

The complete current browser M/D product preserves `A>=30 deg`. Compiled production-profile
construction seeds remain separate and unchanged (`M=45 deg`; CAR `D=9.5 deg`; BIKE `D=9 deg`;
base symmetric steering traversal `0.25 s`). Browser DEV calibration applies the current comparison
starting point to the player instance without redefining production vehicle identity. M/D/ACT remain
tunable `DEV_UNCALIBRATED` values. Common mechanics contains no yaw steering assist, yaw baseline,
drift mode, target beta, vehicle-kind branch or drive-layout handling branch.

M9.19 owns browser tire defaults/domain, M9.18 owns load-proportional stiffness C=k*N,
and M9.15 retains the scoped post-peak law and absolute-S meaning. It retains
the state-free one-k demand vector, radial C1 saturation, friction-circle bound, force direction,
the existing three-scalar vehicle calibration and the monotone scalar implicit wheel solve.
Browser characteristics are now:

```text
G = absolute peak friction coefficient at gripFactor=1
P = common normalized slip at peak
S = absolute deep-slide friction coefficient at gripFactor=1
```

Physics still stores only positive finite `referenceFrictionMultiplier`,
`linearStiffnessMultiplier` and `slidingFrictionRatio`. Absolute S is derived browser meaning rather
than a fourth scalar:

```text
slidingFrictionRatio = S / G
```

Changing G preserves displayed P and absolute S; changing P preserves G and S; changing S preserves
G and P. The lateral post-peak C1 transition starts at P and reaches the selected S plateau at
exactly 2P. Because the post-peak scale remains independent of wheel angular speed during one wheel
solve, the retained finite bracket, monotone residual and unique bisection root remain valid.

M9.19 supersedes browser G/P lower bounds and starting calibration, without changing any tire,
steering, powertrain, profile, actuator, camera or renderer law. Current tire selector domain is:

```text
G = 1.20..4.00 step 0.20, default 1.20
P = 8..60% step 2%, default 8%
S = 1.00..2.00 step 0.20, default 1.00
S<=G, 2160 valid combinations
```

Small-slip stiffness remains 18.9, equal to old G3/P20, while peak capacity falls and absolute S
stays 1. G cycles skip G<S preserving P/S; S cycles skip S>G preserving G/P. Explicit invalid
setter requests still reject. There is no fourth scalar or silent adjustment of another axis.
These are diagnostic values, not real-tire measurements. Human control and high-speed cornering
still need evaluation; lower peak G cannot preserve the former maximum cornering capacity.

M9.19 ordinary-input regressions cover entry, about 54 km/h 10-15-10-degree control and exit in both
directions at 60/120/240 Hz, with sampled entry/input margins. M9.18 seeded 25-30-25 ENG3 evidence
remains required. Neither test suite certifies complete human keyboard/touch feel. No drift mode,
target beta, hidden force, new tire state or vehicle-specific branch is added. Handling remains
`DEV_UNCALIBRATED`. M9.17 direct robotized MT and M9.18 permitted wheel lift/recovery stay current.

M9.9 remains the common tire-balance and deep-sideslip acceptance authority. Its product rule is
**uncontrollable slide is forbidden; controllable drift is allowed**. The explicit recovery input
must recover; neutral, wrong or intentionally sustaining input is not required to self-recover.
The shared compiled normalized tire seed is axle-neutral at `9.75 / 9.75`, the arithmetic mean of
the previous `9.0 / 10.5`; geometry, load transfer, inertia, combined slip and drive torque remain
the axle-behavior causes. M9.10 supersedes only M9.9's post-peak-drop non-goal and former browser
tire comparison table. M9.11 supersedes statements that retained M9.7 washout only for steering
control; M9.9 tire balance and controllability acceptance remain current.

M9.8 supersedes M9.1's six abstract selectable identities, shared four-car package, six-entry
selector, player default and rival-profile identity. One structured catalog owns nine production
identities and references nine distinct compiled profiles. Manufacturer/model, identifier,
selected specification and period remain separate. The normalized reference tire package remains
common, with its current axle balance superseded by M9.9; mass, CG geometry, inertia, suspension,
wheel, brake, drag, fixed drive split and automatic-shifted powertrain data are profile-owned.
Keyboard/touch/HUD derive from the catalog, Testarossa is the default and fixed rival profile, and
generic CAR/BIKE presentation uses explicit metadata instead of ID/name parsing. Handling remains
`DEV_UNCALIBRATED`.

M9.7 is now a historical steering predecessor. M9.11 supersedes its yaw-transient/washout law,
filter state, `YAW`/`WASH` selectors, fixed 31-degree M and 0.375-second default T. M9.7's retained
unit-coefficient travel-direction idea and rival-driver decisions remain historical lineage where
not superseded. Do not recreate a washout state, setter, selector, source module or compatibility
shim.

M9.5 historically superseded M9.4's exact browser choices and its prohibition on calibrating linear
tire demand. Its numbered `1 / 2 / 3` browser comparison table is superseded by later M9.10/M9.12
selector authority. The retained M9.5/M9.9 `TIRE 2` reference values still supply historical/common
calibration anchors: effective normalized slope `10.3` and pure-lateral peak start `12 deg`. The
existing vehicle-owned tire-calibration authority atomically owns positive finite
reference-friction, linear-stiffness and sliding-friction-ratio values. `rhoKnee`, the common wheel
solve and relative SurfaceMap materials remain separate authorities.

M9.4 historically superseded only M9.0's prohibition on a control path changing `mu`. One explicit
common vehicle-instance tire-calibration state owns a positive finite reference-friction multiplier.
Its old browser comparison table is historical; later M9.10/M9.12/M9.14/M9.15 documents own
current tire comparison behavior.

M9.2 is a historical predecessor superseded first by M9.7 and now by M9.11 for steering
calibration. Do not recreate its gain or absolute-yaw-preview compatibility state, setter, key path
or presentation row.

M9.1 historically introduced FR/MR/RR/AWD/BIKE1/BIKE2 selection and a shared four-car package;
those identities and package are superseded by M9.8. Its retained scope includes the normalized
station drive-torque primitive, shared presentation-only HUD boundary and exclusive simultaneous-
pedal rule. The common `18:1` steering ratio is a HUD-only handwheel conversion and must never be
consumed by steering mechanics. Canonical ACCEL/BRAKE requests are exclusive; one input-layer
arbiter gives priority to the latest source that remains held across keyboard aliases and touch
pointers. Actuators own finite response only and must not own pedal order or arbitration. M9.13
supersedes M9.1 only for real-touch fixed digital driving controls, boolean-only touch request
interpretation and the held-touch apply path; M9.1 selector/HUD and pedal-exclusivity decisions
remain retained where not otherwise superseded. M9.14 changes the retained touch travel and
browser DEV comparison ranges; M9.15 changes only the current tire law and tire selector meaning.

M9.0 supersedes the separate M8.0 CAR/BIKE solver architecture and the scoped M8.1 immediate
steering-release rule. It preserves the M8.0 contact/tire/wheel chain and M8.1 travel-direction
steering concept inside one Two-Station Arcade Vehicle Dynamics solver with compiled profiles and
three finite normalized actuators. The M8 documents remain historical authority for retained and
superseded details within the exact boundary stated by M9.0.

It explicitly supersedes conflicting vehicle-physics architecture decisions in M7.0/M7.3/M7.4 within its stated scope. Earlier milestone documents remain historical records and must not be rewritten merely to use current terminology.
Historically, M8.1 superseded only the M8.0 CAR Driver raw-angle/useful-steer/no-countersteer
decisions. M9.0 now owns the shared CAR/BIKE mechanics and input-response boundary while M9.11 owns
the current steering-control calibration built on the retained M8.1 travel-direction concept.
M8.2 supersedes the M5 Guide-lateral/yaw-lag camera decisions within its stated scope; frozen
renderer depth/metric authority and current vehicle authority remain unchanged.
M8.5 supersedes only the M8.2 initial base-pitch/camera-height tuning. M9.1 dual-yaw-camera mode
authority supersedes M8.2's mandatory movement-yaw default while retaining its movement-yaw
derivation as an alternate; M8.2 body-pitch follow and centering architecture remain authoritative.
M8.6 supersedes only the M8.5 150 m far-depth value; frozen chainage depth and the M8.2/M8.5 camera
architecture and pitch/height tuning remain authoritative.

The current browser course-debug composition authority is:

```text
docs/82_m8_3_three_mode_course_debug.md
docs/88_m9_1_six_profile_debug_hud.md
docs/90_m9_1_mobile_touch_selectors.md
docs/91_m9_1_dual_yaw_camera_modes.md
docs/96_m9_6_fisco_circuit.md
docs/98_m9_8_selectable_production_vehicle_catalog.md
docs/99_m9_9_controllable_drift_foundation.md
docs/100_m9_10_post_peak_sliding_tire.md
docs/101_m9_11_simplified_travel_direction_steering.md
docs/103_m9_12_independent_tire_calibration_axes.md
docs/104_m9_12a_centered_handling_comparison_ranges.md
docs/105_m9_12b_upward_tire_range_expansion.md
docs/106_m9_12c_extended_peak_diagnostic.md
docs/107_m9_13_full_screen_analog_touch.md
docs/108_m9_14_compact_touch_expanded_diagnostic_ranges.md
docs/109_m9_15_absolute_slide_one_k_tire.md
```

The current CIRCUIT DEV course-authoring authority is:

```text
docs/93_m9_3_tsukuba_circuit.md
docs/96_m9_6_fisco_circuit.md
```

M9.6 adds the current Fuji Speedway main racing course as browser course `4` while retaining
M9.3 Tsukuba as course `3`. Both selections remain route kind `CIRCUIT` and use the existing
`src/main-circuit.ts` composition root. FISCO uses published 4563 m lap, 1475 m home straight,
direction, width/elevation ranges and 17-corner sequence; exact unpublished connectors and arc
angles are original simplified authoring. It adds no handling, grip, input, physics, camera,
recovery, race-progress, topology-compiler or renderer branch.

M9.3 Tsukuba authoring supersedes only the M9.1 public CIRCUIT geometry, elevation and track
cross-section. It selects a functional four-wheel Course 2000 reconstruction using published
2045 m lap, straight lengths, direction, width range, corner sequence/radius families and near-flat
profile. Exact unlabelled connectors and arc angles are original simplified authoring. It adds no
handling, grip, input, physics, camera, recovery, race-progress or renderer branch. M9.1 remains the
historical predecessor.

### Milestone design authority

Detailed post-freeze decisions live in the numbered milestone documents under `docs/`.

For current topology/runtime architecture, read this sequence:

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
```

For vehicle-physics lineage/current authority, read:

```text
docs/73_m7_0_vehicle_dynamics_architecture_freeze.md
docs/74_m7_1_highway_calibration_course_authoring.md
docs/75_m7_2_default_branching_highway_integration.md
docs/76_m7_3_grip_and_instrument_hud.md
docs/77_m7_4_transient_tire_response.md
docs/78_m8_0_phase9_vehicle_physics_architecture_freeze.md
docs/80_m8_1_car_self_steering_control.md
docs/81_m8_2_body_pitch_movement_yaw_camera.md
docs/82_m8_3_three_mode_course_debug.md
docs/83_m8_4_dual_low_speed_circuit_complex.md
docs/84_m8_5_downward_camera_presentation.md
docs/85_m8_6_two_hundred_meter_render_distance.md
docs/86_m8_7_varied_elevation_circuit.md
docs/89_m9_1_low_mid_speed_mountain_circuit.md
docs/90_m9_1_mobile_touch_selectors.md
docs/91_m9_1_dual_yaw_camera_modes.md
docs/92_m9_2_selectable_self_steer_gain.md
docs/93_m9_3_tsukuba_circuit.md
docs/94_m9_4_selectable_tire_friction.md
docs/95_m9_5_debug_tire_characteristic_presets.md
docs/96_m9_6_fisco_circuit.md
docs/97_m9_7_bounded_washout_steering_assist.md
docs/98_m9_8_selectable_production_vehicle_catalog.md
docs/99_m9_9_controllable_drift_foundation.md
docs/100_m9_10_post_peak_sliding_tire.md
docs/101_m9_11_simplified_travel_direction_steering.md
docs/102_m9_11a_steering_selector_test_range.md
docs/103_m9_12_independent_tire_calibration_axes.md
docs/104_m9_12a_centered_handling_comparison_ranges.md
docs/105_m9_12b_upward_tire_range_expansion.md
docs/106_m9_12c_extended_peak_diagnostic.md
docs/107_m9_13_full_screen_analog_touch.md
docs/108_m9_14_compact_touch_expanded_diagnostic_ranges.md
docs/109_m9_15_absolute_slide_one_k_tire.md
docs/110_m9_16_engine_power_diagnostic_selector.md
docs/111_m9_17_direct_robotized_mt.md
docs/112_m9_18_load_proportional_one_k_tire.md
docs/113_m9_19_progressive_drift_calibration.md
```

### Executable implementation contract

Types, compilers and regression tests are the executable contract. If documentation and implementation appear inconsistent, do not silently choose one. Identify the conflict, determine which authority owns the topic, and resolve it explicitly.

### Documentation authority index

`docs/README.md` distinguishes normative authority, chronological milestone history, active takeover context and immutable validation evidence. Use it when interpreting historical statements or supersession.

### Current takeover handoff state

The latest navigation/continuation checkpoint is:

```text
docs/SUPER_OUTRIDE_CODEX_HANDOFF_2026-09-05_M9_19.md
```

It records current calibration, reproducible handling diagnostics and remaining human-control,
keyboard, speed-domain and perception work. It is navigation only: read newest numbered authority,
source/types/compilers, regression tests and exact Git/PR/CI/Pages evidence before changes.

The M9.18, M9.12C and M9.6 handoffs remain historical navigation. Do not treat their browser
calibration tables or embedded SHAs as current authority.

### M8.0 finalization handoff state

The implementation/finalization checkpoint for M8.0 PR #88 is:

```text
docs/SUPER_OUTRIDE_CODEX_HANDOFF_2026-08-28_M8_0.md
```

That file is navigation/finalization context only. After release it is historical. It does not replace the Core Freeze/addenda, `docs/78_m8_0_phase9_vehicle_physics_architecture_freeze.md`, source/types/compilers, regression tests, or `docs/validation/M8_0_PHASE9_VEHICLE_PHYSICS_VALIDATION.txt` as release evidence.

The older:

```text
docs/SUPER_OUTRIDE_CODEX_HANDOFF_2026-08-25.md
```

is historical repository-migration handoff context. It records the PR-C/final-migration lineage and must not be mistaken for the active current takeover checkpoint.

The original mandatory first read-only Codex takeover audit was completed before PR-C. That one-time audit is distinct from the later final clean-room audit and final exact-head migration freeze. The released FINAL CODEX MIGRATION POINT is established by `docs/validation/REPOSITORY_FINAL_CODEX_MIGRATION_VALIDATION.txt` together with Git/PR/main-ref and Pages workflow identity. Do not infer the final migration SHA from an embedded self-reference in an entry document.

At and after that released final migration point, do not repeat the migration cleanup ceremony merely because a fresh session reads historical migration context. For active work, resolve current status from `README.md`, `docs/README.md`, the active handoff, Git/PR state, and exact-head CI.

### README

`README.md` is an entry point and current-state index. It is informative and must not override a freeze/addendum, milestone authority or executable regression contract.

---

## 3. Design priority

When several implementations are possible, optimize in this order:

1. architectural simplicity;
2. one clear authority per concept;
3. mathematical consistency with the frozen pseudo-3D model;
4. implementation simplicity and period-plausible computation;
5. feature convenience.

Do not preserve a complicated feature interpretation if a simpler product/design rule keeps the architecture clean.

Prefer deleting duplicate authority, generalizing an existing primitive, or changing an upper-level composition over introducing a lower-level special case.

Do not apply an ad hoc patch merely because it makes a visible symptom disappear.

### Mandatory architecture decision gate

Before implementing any non-trivial feature, bug fix, refactor, integration change or design-affecting maintenance change, answer all of the following from the current repository evidence:

1. Which existing layer owns this decision?
2. Is there already a primitive or authority that can express it without a new abstraction?
3. Would the proposed solution create duplicate state, duplicate coordinate truth or a second authority for one concept?
4. Would it add a product-, mode-, vehicle-, route- or stage-specific branch to a lower engine layer?
5. Can the same result be obtained more cleanly through authoring, topology, compilation, runtime composition, or a simpler product rule?
6. Does the solution preserve every applicable frozen renderer, physics, metric and topology invariant?
7. What regression or architecture check proves the real causal behavior and prevents the boundary from drifting later?

This gate is mandatory. A feature request is not implicit permission to weaken frozen invariants or bypass current authority boundaries. If the requested behavior conflicts with them, identify the conflict and prefer an upper-level or explicit normative design change rather than silently inserting a lower-level exception.

If a proposed solution requires a lower-layer special case, duplicated state, duplicated coordinate authority, hidden wrapping, compatibility authority, or an ad hoc exception, do not implement it merely because it is locally convenient. Reconsider the design first.

The preferred transformation is:

```text
complex product requirement
-> explicit upper-level authoring / topology / compilation / composition
-> simple ordinary runtime representation
-> unchanged or more-general lower engine primitives
```

When a stable architectural boundary or invariant can reasonably be checked mechanically, add or extend a regression/architecture test so CI enforces it. Do not rely on prose alone for a rule that can be made executable. Purely procedural or non-mechanizable rules may remain contract-only.

---

## 4. Frozen renderer and geometry invariants

The following are not negotiable unless a new explicit normative addendum is authored and validated.

- World X/Y/Z is authoritative for vehicle physics.
- Vehicle movement is free in world space; it is not snapped to the road centerline.
- Renderer depth is chainage pseudo-depth, exactly:

```text
d = s_render - s_camera
```

- Renderer depth contains no course-length modulo, winding, route identity or topology decision.
- Euclidean distance is not renderer depth.
- Camera-space Z is not introduced as a replacement depth authority.
- Lateral displacement does not modify renderer depth.
- Same `d` means same scale.
- Same `d` plus same height means same screen Y.
- One chainage corresponds to one horizontal raster scanline.
- Road geometry remains Raster Segment geometry.
- Absolute turn at every interior Raster vertex remains `<= 10 degrees`.
- Guide geometry is coordinate/camera support; it is not a polygon-road renderer.
- Terrain and World Sprites share one far-to-near Painter.
- Do not add a z-buffer.
- Do not convert the road renderer into a normal polygon/perspective road renderer.
- Do not add perspective-correct texture mapping.
- Do not add arbitrary runtime sprite rotation.
- Transparency remains 0/1; no alpha blending.
- Camera roll remains zero.
- GroundMap visual semantics and SurfaceMap physical semantics remain independent.
- GroundBase `TRANSPARENT` and SurfaceMap `VOID` remain independent.
- Far Background is a full image, including meaningful pixels below the horizon.

Final renderer order remains:

```text
Optional Clear
-> Full Far Background
-> Terrain + World Sprite far-to-near
-> Player Sprite
-> HUD
```

---

## 5. Fixed metric presentation authority

The canonical sprite/world scale is fixed at player pseudo-depth:

```text
player car physical width = 2.0 m
player car source width   = 80 px
player-depth scale        = 40 px/m
```

Current camera values are:

```text
f     = 200 px
D_cam = 5.0 m
```

The invariant is:

```text
D_cam = f / 40
```

If focal length/FOV changes in the future, change `D_cam` so the 40 px/m player-depth reference is preserved.

There is no arbitrary `visualScale` authority.

---

## 6. Open geometry and source model

The general runtime model is open:

```text
0 <= s <= L
```

Core does not manufacture a last-to-first segment.

General forms are open:

```text
RasterPath
GuidePath
HeightProfile
VisualProfile
GroundMapLogicalProfile
BakedGroundMapAsset
SurfaceMap
```

Out-of-range chainage must not silently wrap into another endpoint.

The governing rule is:

> **Open is the general data model. Cyclic is an explicit upper-level topology choice. The renderer is neither.**

Explicit `Cyclic*` adapters may exist for a deliberate upper-level topology, but ordinary LINEAR/BRANCHING runtime consumers must not select them for historical convenience.

---

## 7. Point-to-point route authority

The acyclic RouteDag is the point-to-point authority for LINEAR/BRANCHING.

Route choice is physical. AI steering intent, screen X, desired branch, visual proximity or guessed road center must never manufacture route progress.

A legal stage transition is:

```text
physical route-gate crossing
-> validated RouteDag transition
-> PENDING
-> old chart/content remain authoritative
-> forward physical handoff-seam crossing
-> COMMIT target chart/content
```

COMMIT changes chart/content authority only.

It must not teleport or rewrite:

```text
world X/Y/Z
yaw
world velocity
```

Entering a terminal stage is not FINISH. A validated physical FINISH crossing is still required.

For the current BRANCHING product rule:

```text
sharedRouteChoiceMode = FIRST_PHYSICAL_CROSSING_LOCKS
branchViolationPolicy = RECOVER_TO_LOCKED_BRANCH
```

The first physical vehicle crossing of a sibling route gate locks that choice for the field. A losing sibling crossing creates no illegal progress and uses the explicit recovery policy.

---

## 8. CIRCUIT authority

CIRCUIT must not weaken the open Core or acyclic RouteDag.

One circuit lap is authored explicitly above Core. Runtime topology is unfolded into a finite ordinary open window before lower consumers see it.

Current architecture:

```text
explicit closed-lap authoring
        |
        v
CircuitTopology
        |
        v
finite ordinary open runtime window
        |
        +--> ordinary car/bike physics
        +--> ordinary camera
        +--> ordinary renderer
        |
        v
ordered physical checkpoints + forward FINISH
        |
        v
validated lap race
```

Topological winding is not race-lap authority.

Race laps are awarded only by the ordered physical checkpoint/FINISH contract.

For `N` scored laps, runtime must provide at least `N + 1` finite lap copies so the final scored FINISH is still an ordinary internal seam with normal runout/lookahead.

Do not add a separate renderer/physics/camera circuit mode branch merely to handle winding.

---

## 9. Recovery rules

Recovery is gameplay/physics reset, not route/race manufacture.

Recovery/resync must not:

- manufacture a route transition;
- award a checkpoint;
- award a lap;
- erase validated progress;
- imply topology through wrapping.

Wrong-branch recovery geography derives from the locked legal physical route gate, not screen coordinates or AI intent.

---

## 10. Browser composition and Pages

Current top-level browser composition is explicit:

```text
src/boot.ts          -> one browser course-mode selector
src/main-linear.ts   -> LINEAR
src/main.ts          -> BRANCHING
src/main-circuit.ts  -> CIRCUIT
```

Boot selection belongs only at the composition root:

```text
/                -> BRANCHING
/?mode=linear    -> LINEAR
/?mode=branching -> BRANCHING
/?mode=circuit   -> CIRCUIT / TSUKUBA
/?mode=fisco     -> CIRCUIT / FISCO
```

Do not distribute `if (CIRCUIT)` / `routeKind` decisions through lower engine layers when composition can select the correct ordinary runtime objects once.

`src/dev` is not a general runtime authority. General layers must not import it. The only current non-DEV TypeScript files allowed to assemble DEV fixtures are the three explicit top-level browser composition roots:

```text
src/main-linear.ts
src/main.ts
src/main-circuit.ts
```

`src/dev/**` may depend on ordinary general layers, but that dependency direction must not be reversed. `src/dev/README.md` defines the DEV fixture categories, and `tests/source-boundary-normalization.test.mjs` enforces the boundary across all `src/**/*.ts` files.

GitHub Pages uses a commit-versioned complete ESM build path. Do not weaken that cache-coherency design.

Visible milestone labels must remain synchronized with package milestone metadata; regression coverage exists for this.

---

## 11. Testing rules

Run the complete suite for every implementation milestone and every release candidate:

```bash
npm install
npm test
```

A bug fix must add a regression that reproduces the real causal failure, not merely assert the desired final screen state.

Do not weaken a valid regression to make a new design pass. If a legacy test encodes an obsolete authority, update it only after identifying and documenting the newer authority that supersedes it.

Prefer real integration sequences for failures involving route transitions, recovery, physics, camera, rendering or deployment boundaries.

When a user reports a Pages/runtime bug, distinguish among:

```text
source defect
build artifact defect
deployment defect
browser/cache display defect
```

Do not attribute a problem to cache without evidence.

---

## 12. Git / PR / release contract

Never implement directly on `main`.

For each milestone or hotfix:

1. Fetch/inspect current `main` and record its exact SHA.
2. Create a feature/hotfix branch from that exact SHA.
3. Inspect existing architecture before adding an abstraction.
4. Implement the smallest coherent change.
5. Add/update regression coverage.
6. Open a PR targeting `main`.
7. Obtain a complete green CI run on the exact feature-head SHA.
8. Apply the standalone-record decision rule in `docs/validation/README.md`; add/update a record
   only when that policy requires one.
9. Run the complete CI suite again on the **validation-inclusive exact head**.
10. Re-fetch `main` before release.
11. Compare `main` to the validated candidate. Release only when the candidate is a pure fast-forward:

```text
ahead_by > 0
behind_by = 0
merge base = current main
```

12. Move `main` to the validated exact SHA with `force=false`.
13. Verify:

```text
main SHA == validated feature SHA
PR head SHA == PR merge SHA == validated feature SHA
```

14. Verify the main-push workflow on the same SHA, including Pages build/deploy when applicable.

Do not use an extra merge commit as the released `main` state.

Do not release a SHA that did not itself receive the required complete green CI.

If `main` moved after validation, do not force the release. Rebase/reconstruct from the new main and revalidate the new exact head.

GitHub Actions exact checkout is authoritative for release evidence.

---

## 13. Working style for coding agents

Before implementing:

- read the relevant source and tests;
- search for existing primitives before creating new ones;
- classify apparent legacy behavior as deliberate authority vs accidental residual assumption;
- identify the smallest layer that actually owns the decision.

During implementation:

- keep topology above Core;
- keep gameplay decisions out of renderer/physics unless they genuinely belong there;
- avoid duplicate state and duplicate coordinate authorities;
- preserve world-state continuity through chart/content changes;
- prefer finite/open composition over implicit wrapping;
- keep DEV fixtures clearly separate from product authority;
- do not introduce dependencies from general `src/*` layers into `src/dev`; only `src/main-linear.ts`, `src/main.ts` and `src/main-circuit.ts` may assemble DEV fixtures as explicit top-level composition roots;
- do not recreate retired authority paths as compatibility re-export shims.

After implementation:

- inspect the final diff for accidental broad rewrites;
- run the complete suite;
- verify the exact SHA in CI logs;
- update only the documentation whose authority actually changed.

Do not claim a public Pages deployment was personally verified unless the deployed artifact/workflow/public endpoint was actually inspected.

---

## 14. Explicit prohibitions

Do **not** do any of the following without a new explicit normative design decision:

- make `RasterPath` or `GuidePath` implicitly cyclic again;
- add course-length modulo to renderer pseudo-depth;
- infer route choice from steering or AI branch intent;
- teleport world pose on route handoff;
- add arbitrary sprite `visualScale`;
- replace raster road rendering with ordinary 3D/polygon projection;
- add a z-buffer;
- add arbitrary runtime sprite rotation;
- couple GroundMap pixels to physical SurfaceMap support;
- make topological winding equal validated race laps;
- make RouteDag cyclic to implement CIRCUIT;
- add a renderer CIRCUIT special path when finite open composition is sufficient;
- introduce a general-layer dependency on `src/dev`;
- recreate a retired authority path as a compatibility shim;
- hide a runtime defect by removing a rival/feature unless the product rule itself is intentionally changed;
- bypass a failing physical-gate regression by widening gates without validating authored road geometry;
- merge an unvalidated SHA;
- force-update `main` as a normal release procedure.

---

## 15. Takeover procedure

When starting from a fresh Codex/agent context:

1. Read this file completely.
2. Read `README.md` for repository entry points and current status.
3. Read `docs/README.md` for authority/supersession and evidence policy.
4. Read `docs/SUPER_OUTRIDE_CODEX_HANDOFF_2026-09-05_M9_19.md` as current handling-navigation
   context, never as authority over newer numbered documents or exact Git/source evidence.
5. Read the four Core freeze/addendum files listed in section 2 when the requested task can affect
   frozen renderer/metric/topology invariants.
6. Identify and read the newest numbered authority documents for the requested topic. For current
   touch-driving work start with M9.14 -> M9.13. For current tire/handling work use M9.19 ->
   M9.18 -> M9.17 -> M9.16 -> M9.15 ->
   M9.14 -> M9.12C -> M9.12B -> M9.12A -> M9.12 -> M9.11 -> M9.10 -> M9.9 as applicable.
7. Read current source/types/compilers and the causal tests relevant to the task.
8. Confirm current `main`, active/open PR state and exact latest CI/Pages state before changing
   anything; never assume the SHA embedded in a dated handoff is still current.
9. Use older handoffs only when their historical lineage is specifically relevant. Do not treat
   M9.18, M9.12C, M9.6, M8.0 or migration handoffs as current instructions after M9.19.
10. Verify the FINAL CODEX MIGRATION POINT against
    `docs/validation/REPOSITORY_FINAL_CODEX_MIGRATION_VALIDATION.txt` and Git/PR history only when
    migration history is relevant; do not repeat the original migration cleanup ceremony.
11. Run/inspect the complete test suite required by the current task and relevant validation
    contract; historical green checkpoints are not release evidence for a new SHA.
12. Only then continue the scoped task under the Mandatory Architecture Decision Gate.

At and after the FINAL CODEX MIGRATION POINT, the repository—not a previous ChatGPT transcript—is the continuing project memory.