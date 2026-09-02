# SUPER OUTRIDE Documentation Authority

This directory contains four intentionally different document classes:

1. current normative authority;
2. chronological milestone records;
3. takeover/navigation context;
4. immutable validation evidence.

Repository/source/test/Git state remains authoritative over conversation history. Historical files
must not be rewritten merely to use current terminology; later numbered documents explicitly
supersede only their stated scope.

## 1. Current normative authority

### Frozen renderer/core

```text
00_core_design_freeze.md
00a_core_design_freeze_addendum_m5_2.md
00b_core_design_freeze_addendum_m6_44.md
00c_core_design_freeze_addendum_m6_45.md
```

### Current vehicle physics / steering / tire / catalog

```text
101_m9_11_simplified_travel_direction_steering.md
100_m9_10_post_peak_sliding_tire.md
99_m9_9_controllable_drift_foundation.md
98_m9_8_selectable_production_vehicle_catalog.md
87_m9_0_two_station_arcade_vehicle_dynamics.md
78_m8_0_phase9_vehicle_physics_architecture_freeze.md
80_m8_1_car_self_steering_control.md
```

M9.11 is the current steering-control and browser M/D/T authority. It removes M9.7 yaw-transient
feedback, zero-DC washout memory and both `YAW`/`WASH` selectors. The retained geometric law is:

```text
A = M - D
automatic = clamp(betaTravel, -A, +A)
deltaTarget = clamp(automatic + u*D, -M, +M)
```

`A` is derived only and is never stored. Browser steering choices are:

```text
D = 9 / 9.5 / 11 / 12.5 / 14 deg
M = 37 / 41 / 45 / 49 / 53 deg
T = 0.25 / 0.375 / 0.5 / 0.625 s
```

Current defaults are `M=45 deg`, `T=0.25 s`, with profile seed `D=9.5 deg` for CAR and `D=9 deg`
for BIKE. These remain `DEV_UNCALIBRATED` tuning values. The selector product guarantees
`A >= 23 deg`.

M9.10 remains the current tire post-peak / `SLIDE` authority. It keeps the common former `TIRE 2`
peak characteristic and changes only the stateless C1 large-lateral-slip plateau through
`100 / 85 / 80 / 75 / 70 %`.

M9.9 remains the current axle-neutral common tire seed and deep-sideslip acceptance authority. Its
product rule remains **uncontrollable slide is forbidden; controllable drift is allowed**. The
explicit recovery input must recover; neutral/wrong/intentionally sustaining input is not required
to self-recover.

M9.8 remains the structured nine-production-vehicle catalog/profile-selection authority. M9.0
remains the common two-station vehicle mechanics authority within later scoped supersession.

### Historical steering predecessors

```text
97_m9_7_bounded_washout_steering_assist.md
92_m9_2_selectable_self_steer_gain.md
```

M9.7 is no longer current steering authority. M9.11 supersedes its yaw-transient/washout law,
filter state, browser selectors, fixed 31-degree M value and 0.375-second default T. M9.7 remains
historical evidence for the unit-coefficient travel-direction idea and rival-driver decisions that
M9.11 does not supersede.

Statements in M9.9/M9.10 that said the M9.7 washout was retained are superseded only for steering
control by M9.11. Their tire and controllability decisions remain current.

### Current camera and presentation

```text
81_m8_2_body_pitch_movement_yaw_camera.md
84_m8_5_downward_camera_presentation.md
85_m8_6_two_hundred_meter_render_distance.md
91_m9_1_dual_yaw_camera_modes.md
```

`BODY_FIXED` remains default camera yaw, `MOVEMENT_FOLLOW` remains the derived travel-direction
alternate, camera pitch follows body pitch, and camera roll remains zero.

### Current circuit authoring

```text
93_m9_3_tsukuba_circuit.md
96_m9_6_fisco_circuit.md
```

Browser course `3` is Tsukuba and course `4` is FISCO through the same CIRCUIT composition root.

## 2. Numbered milestone sequence

`01_...` through `101_...` are chronological milestone records. A later milestone can supersede a
scoped earlier assumption without invalidating the earlier file as history.

The most relevant current lineage is:

```text
73_m7_0_vehicle_dynamics_architecture_freeze.md
74_m7_1_highway_calibration_course_authoring.md
75_m7_2_default_branching_highway_integration.md
76_m7_3_grip_and_instrument_hud.md
77_m7_4_transient_tire_response.md
78_m8_0_phase9_vehicle_physics_architecture_freeze.md
80_m8_1_car_self_steering_control.md
81_m8_2_body_pitch_movement_yaw_camera.md
82_m8_3_three_mode_course_debug.md
84_m8_5_downward_camera_presentation.md
85_m8_6_two_hundred_meter_render_distance.md
87_m9_0_two_station_arcade_vehicle_dynamics.md
88_m9_1_six_profile_debug_hud.md
90_m9_1_mobile_touch_selectors.md
91_m9_1_dual_yaw_camera_modes.md
92_m9_2_selectable_self_steer_gain.md
93_m9_3_tsukuba_circuit.md
94_m9_4_selectable_tire_friction.md
95_m9_5_debug_tire_characteristic_presets.md
96_m9_6_fisco_circuit.md
97_m9_7_bounded_washout_steering_assist.md
98_m9_8_selectable_production_vehicle_catalog.md
99_m9_9_controllable_drift_foundation.md
100_m9_10_post_peak_sliding_tire.md
101_m9_11_simplified_travel_direction_steering.md
```

For topology/runtime history, the retained M6.44–M6.54 sequence remains authoritative within its
scope; M9.11 changes none of those boundaries.

## 3. Takeover context

The current named takeover checkpoint is:

```text
SUPER_OUTRIDE_CODEX_HANDOFF_2026-09-01_M9_6.md
```

It records the released M9.6 checkpoint and restart procedure. It is navigation context only. If
`main` is newer, current repository state supersedes its snapshot.

Older handoffs, including
`SUPER_OUTRIDE_CODEX_HANDOFF_2026-08-31_M9_VEHICLE_UNIFICATION.md` and
`SUPER_OUTRIDE_CODEX_HANDOFF_2026-08-31_STEERING_INPUT_AND_SELF_STEER.md`, are resolved historical
context and not active authority.

## 4. Validation evidence

Files under `validation/` are immutable release evidence for the exact milestone/head they record.
They do not become design authority and should not be rewritten after release.

Current retained records include:

```text
validation/M9_9_CONTROLLABLE_DRIFT_FOUNDATION_VALIDATION.txt
validation/M9_10_POST_PEAK_SLIDING_TIRE_VALIDATION.txt
validation/M9_11_SIMPLIFIED_TRAVEL_DIRECTION_STEERING_VALIDATION.txt
```

M9.11's standalone record captures the green implementation/documentation-inclusive head and
requires the normal second complete CI on the record-inclusive exact head before release. Final
release identity is established by Git/PR/main/workflow history rather than self-rewriting the
immutable evidence file.

## 5. Conflict handling

If documents, source and tests appear inconsistent:

1. identify which layer owns the concept;
2. follow the newest explicit scoped supersession;
3. do not create compatibility state to satisfy historical wording;
4. preserve frozen renderer/metric/topology invariants;
5. update current entry/index documents, not historical milestone prose;
6. require executable regression evidence for the resolved current behavior.
