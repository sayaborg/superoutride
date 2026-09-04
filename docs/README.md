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

### Current engine-output diagnostic calibration

```text
110_m9_16_engine_power_diagnostic_selector.md
```

M9.16 adds one instance-owned `powertrain.engineTorqueMultiplier`, default 1.0, to scale only the
sampled engine torque curve. Browser ENG choices are `1.0 / 1.5 / 2.0 / 3.0 / 4.0`; K and the
compact ENG button use one shared adapter. Recovery and vehicle replacement preserve the value.
Rivals and page/course reloads remain at 1.0. Engine RPM, shift strategy, redline reduction, drive
split, tires, steering, camera and renderer are unchanged. No direct body force, speed preservation,
drift controller or duplicate current-selection authority is added. This is a diagnostic axis, not
proof that insufficient engine output caused the reported drift speed loss.

### Current touch-driving calibration and input/presentation

```text
108_m9_14_compact_touch_expanded_diagnostic_ranges.md
107_m9_13_full_screen_analog_touch.md
```

M9.14 supersedes M9.13 only for the full-scale touch displacement calibration. Current 100% travel
is one fixed compact value:

```text
L = 64 CSS px
```

M9.13 remains authoritative for full-viewport pointer ownership, pointer-down neutral origin,
horizontal steering, exclusive vertical ACCEL/BRAKE axis, fixed pointer role, two-thumb use, DIRECT
held response, existing release-rate decay and presentation-only origin/vector indicators.

CSS px avoids dependence on native backing-store/device pixel density and does not change with
viewport size or orientation. It is not claimed to equal a fixed physical millimeter across every
device.

### Current vehicle physics / steering / tire / catalog

```text
110_m9_16_engine_power_diagnostic_selector.md
109_m9_15_absolute_slide_one_k_tire.md
108_m9_14_compact_touch_expanded_diagnostic_ranges.md
106_m9_12c_extended_peak_diagnostic.md
105_m9_12b_upward_tire_range_expansion.md
104_m9_12a_centered_handling_comparison_ranges.md
103_m9_12_independent_tire_calibration_axes.md
102_m9_11a_steering_selector_test_range.md
101_m9_11_simplified_travel_direction_steering.md
100_m9_10_post_peak_sliding_tire.md
99_m9_9_controllable_drift_foundation.md
98_m9_8_selectable_production_vehicle_catalog.md
87_m9_0_two_station_arcade_vehicle_dynamics.md
78_m8_0_phase9_vehicle_physics_architecture_freeze.md
80_m8_1_car_self_steering_control.md
```

M9.15 is the current scoped tire-law and browser tire-calibration authority. It follows M9.14
hands-on falsification of percentage-SLIDE tuning as a complete route to prompt, progressive and
sustained drift.

The state-free one-k demand, radial C1 saturation, force-vector direction, scalar implicit wheel
solve and three-scalar vehicle tire calibration are retained. M9.15 changes only:

```text
S browser meaning:
  old = deep-slide / peak percentage
  new = absolute deep-slide friction coefficient at gripFactor=1

post-peak width:
  old plateau = short M9.10 shoulder
  new plateau = exactly 2P after post-peak begins at P
```

The internal physics scalar remains `slidingFrictionRatio`; the browser derives it as:

```text
slidingFrictionRatio = S / G
```

Therefore G, P and absolute S remain independently visible without adding a fourth tire scalar or
second tire-force authority.

Current tire comparison scope is:

```text
G = 2.00 / 2.20 / 2.40 / 2.60 / 2.80 / 3.00 /
    3.20 / 3.40 / 3.60 / 3.80 / 4.00

P = 20 / 22 / 24 / 26 / 28 / 30 / 32 / 34 / 36 / 38 / 40 /
    42 / 44 / 46 / 48 / 50 / 52 / 54 / 56 / 58 / 60 %

S = 1.00 / 1.20 / 1.40 / 1.60 / 1.80 / 2.00
```

The explicit hands-on starting candidate is:

```text
G=3.00 / P=20% / S=1.00
```

Its `S/G=1/3` ratio is an intentionally strong diagnostic probe, not a production-tire realism
claim. The complete browser tire product is `11 x 21 x 6 = 1,386` calibrations.

At pure lateral slip, force reaches G at P and reaches absolute S at 2P through one C1 smoothstep. In
deep combined slide, resultant magnitude is `S*N` and force direction stays parallel to the one-k
demand vector. Increasing driven-wheel slip at fixed lateral slip therefore increases `|Fx|` and
decreases `|Fy|` without a drift detector or injected yaw moment.

M9.14 remains current for the browser D range, retained G/P comparison ranges and compact touch
travel:

```text
D   = 10 / 11 / 12 / 13 / 14 / 15 / 16 / 17 / 18 / 19 / 20 deg  default 12
M   = 50 / 55 / 60 / 65 / 70 deg                                default 60
ACT = 0.20 / 0.225 / 0.25 / 0.275 / 0.30 s                      default 0.25
```

M9.12 remains the three-characteristic browser-mapping foundation beneath M9.15 scoped
supersession. Tire physics still stores only positive finite reference-friction, linear-stiffness
and sliding-friction-ratio values; browser IDs and absolute S are derived.

M9.10 remains historical/current foundation for the stateless lateral-demand-driven post-peak scale
and monotone scalar wheel solve. M9.15 supersedes only its transition width and percentage-S browser
interpretation. The scale remains independent of wheel Omega during one solve, so the unique
backward-Euler root proof remains intact.

M9.11 remains the current steering-control law:

```text
A = M - D
automatic = clamp(betaTravel, -A, +A)
deltaTarget = clamp(automatic + u*D, -M, +M)
```

`A` is derived only and is never stored. The expanded selector product preserves `A >= 30 deg` at
`M=50 / D=20`. No D limiter and no tire-dependent or speed-dependent steering authority is
introduced. Compiled production-profile steering seeds remain unchanged.

M9.9 remains the current axle-neutral common tire seed and deep-sideslip acceptance authority. Its
product rule remains **uncontrollable slide is forbidden; controllable drift is allowed**. Explicit
recovery input must recover; neutral, wrong or intentionally sustaining input is not required to
self-recover.

M9.8 remains the structured nine-production-vehicle catalog/profile-selection authority. M9.0
remains the common two-station vehicle mechanics authority within later scoped supersession.
M9.16 extends powertrain calibration only; profile torque curves remain immutable base authority.

### Historical steering predecessors

```text
97_m9_7_bounded_washout_steering_assist.md
92_m9_2_selectable_self_steer_gain.md
```

M9.7 is no longer current steering authority. M9.11 supersedes its yaw-transient/washout law,
filter state, browser selectors, fixed 31-degree M and 0.375-second default T. M9.7 remains
historical evidence for the unit-coefficient travel-direction idea and rival-driver decisions that
M9.11 does not supersede.

Statements in M9.9/M9.10 that said M9.7 washout was retained are superseded only for steering
control by M9.11. Their tire and controllability decisions remain current inside later scoped tire
supersession.

### Current camera and presentation

```text
81_m8_2_body_pitch_movement_yaw_camera.md
84_m8_5_downward_camera_presentation.md
85_m8_6_two_hundred_meter_render_distance.md
91_m9_1_dual_yaw_camera_modes.md
```

`BODY_FIXED` remains default camera yaw; `MOVEMENT_FOLLOW` remains the derived travel-direction
alternate; camera pitch follows body pitch; camera roll remains zero.

### Current circuit authoring

```text
93_m9_3_tsukuba_circuit.md
96_m9_6_fisco_circuit.md
```

Browser course `3` is Tsukuba and course `4` is FISCO through the same CIRCUIT composition root.

## 2. Numbered milestone sequence

`01_...` through `110_...` are chronological milestone records. A later milestone can supersede a
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
102_m9_11a_steering_selector_test_range.md
103_m9_12_independent_tire_calibration_axes.md
104_m9_12a_centered_handling_comparison_ranges.md
105_m9_12b_upward_tire_range_expansion.md
106_m9_12c_extended_peak_diagnostic.md
107_m9_13_full_screen_analog_touch.md
108_m9_14_compact_touch_expanded_diagnostic_ranges.md
109_m9_15_absolute_slide_one_k_tire.md
110_m9_16_engine_power_diagnostic_selector.md
```

For topology/runtime history, the retained M6.44–M6.54 sequence remains authoritative within its
scope; M9.15/M9.16 change none of those boundaries.

## 3. Takeover context

The latest named handling takeover checkpoint remains:

```text
SUPER_OUTRIDE_CODEX_HANDOFF_2026-09-04_M9_12C.md
```

It records the released M9.12C handling state and an earlier PEAK diagnostic observation. It is
navigation context only and predates M9.13–M9.16. Documents 107–110 plus current source/tests
supersede it for the current touch/tire/engine investigation.

The prior:

```text
SUPER_OUTRIDE_CODEX_HANDOFF_2026-09-01_M9_6.md
```

is historical M9.6 takeover context. Older handoffs are also resolved historical context and not
active authority.

## 4. Validation evidence

Files under `validation/` are immutable release evidence for the exact milestone/head they record.
They do not become design authority and must not be rewritten after release.

Current retained records include:

```text
validation/M9_9_CONTROLLABLE_DRIFT_FOUNDATION_VALIDATION.txt
validation/M9_10_POST_PEAK_SLIDING_TIRE_VALIDATION.txt
validation/M9_11_SIMPLIFIED_TRAVEL_DIRECTION_STEERING_VALIDATION.txt
validation/M9_12_INDEPENDENT_TIRE_CALIBRATION_AXES_VALIDATION.txt
validation/M9_12A_CENTERED_HANDLING_COMPARISON_RANGES_VALIDATION.txt
validation/M9_12B_UPWARD_TIRE_RANGE_EXPANSION_VALIDATION.txt
validation/M9_12C_EXTENDED_PEAK_DIAGNOSTIC_VALIDATION.txt
validation/M9_13_FULL_SCREEN_ANALOG_TOUCH_VALIDATION.txt
validation/M9_14_COMPACT_TOUCH_EXPANDED_DIAGNOSTIC_RANGES_VALIDATION.txt
validation/M9_15_ABSOLUTE_SLIDE_ONE_K_TIRE_VALIDATION.txt
```

M9.16 adds a normative engine calibration boundary, so its release requires a new standalone
validation record after the implementation/documentation head is fully green.

New validation evidence is added only after the corresponding implementation/documentation head is
fully green. Final release identity is established by Git/PR/main/workflow history rather than by
self-rewriting immutable evidence files.

## 5. Conflict handling

If documents, source and tests appear inconsistent:

1. identify which layer owns the concept;
2. follow the newest explicit scoped supersession;
3. do not create compatibility state to satisfy historical wording;
4. preserve frozen renderer/metric/topology invariants;
5. update current entry/index documents, not historical milestone prose;
6. require executable regression evidence for the resolved current behavior.
