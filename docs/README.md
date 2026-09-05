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

### Current five-parameter tire, browser calibration and diagnostic acceptance

```text
114_m9_20_five_axis_tire.md
```

M9.20 replaces old G/P/S and the extra postpeak multiplier with a monotone two-axis capacity
ellipse. Gx/Px/Gy/Py/common knee compile to five resolved coefficients; P and UI IDs are derived.
Defaults: Gx2.50/Px8%/Gy2.20/Py10%/knee.74, ENG1, D12/M60/ACT.25. H/J/G/L/N increase,
Keys cycle forward; each axis also has explicit minus/plus buttons. Front/rear are temporarily linked but
have distinct effective slots. TCS is NOT active, and no unused controller state is added.

Old force/selector/steady-trace assertions explicitly retired by document 114 are replaced with
new constitutive, atomic calibration, interface, lifecycle and transient diagnostics. Core,
contact/recovery, engine, steering, non-tire profiles and input mechanics remain unchanged.
This is a calibrated-physics research interface, not certification of human drift handling.
Read `research/M9_20_TIRE_DESIGN_DECISION_HISTORY.md` for the reasoning and corrections.

### Current tire load normalization and permitted wheel lift

```text
112_m9_18_load_proportional_one_k_tire.md
```

M9.18 replaces static-load tire stiffness with `C=k*Nactual` in both slip directions and removes
compiled `cornerStiffness`. M9.20 replaces the old normalized curve and G/P/S API, while retaining load homogeneity.
Positive load scales force without moving the normalized peak. Seeded sustained-drift regressions
do not certify easy entry/exit or human control feel.

Wheelies/stoppies are allowed pending later ABS/TCS/control work. No torque/pitch suppression or
profile retuning is introduced. One-sided contact rejects inverted suspension support; gameplay
uses ordinary recovery after overturn, with existing calibration and target semantics. Section 8
explicitly defines the updated course-integration and extreme-input test contract. Held full
throttle can still repeatedly overturn a vehicle; recovery-safe is not stable upright riding.

### Current powertrain and engine-output diagnostic calibration

```text
111_m9_17_direct_robotized_mt.md
110_m9_16_engine_power_diagnostic_selector.md
```

M9.17 owns direct wheel-derived RPM, instantaneous no-cut automatic ratio selection, ratio-aware
up/down hysteresis and one C1 rev limiter. It removes launch coupling slip, RPM lag, shift timing
and synthetic zero-torque redline samples from all nine profiles. Gear is the only dynamic
powertrain memory; RPM/torque fields are derived observation caches. Below idle, the torque lookup
uses an explicit no-stall floor while actual RPM is allowed to be zero. The limiter alone reduces
positive drive to zero at redline and never clamps wheel speed or invents an engine rotor state.

M9.16 retains one instance-owned `powertrain.engineTorqueMultiplier`, default 1.0, to scale only the
sampled engine torque curve. Browser ENG choices are `1.0 / 1.5 / 2.0 / 3.0 / 4.0`; K and the
compact ENG button use one shared adapter. Recovery and vehicle replacement preserve the value.
Rivals and page/course reloads remain at 1.0. M9.17 explicitly supersedes M9.16's preservation of
the old transmission/RPM/redline laws; drive split, tires, steering, camera and renderer remain
unchanged. No direct body force, speed preservation, drift controller or duplicate selection
is added. Removal of the reproduced hunting does not certify sustained circular drifting.

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
114_m9_20_five_axis_tire.md
113_m9_19_progressive_drift_calibration.md
112_m9_18_load_proportional_one_k_tire.md
111_m9_17_direct_robotized_mt.md
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

M9.20 supersedes the old one-kazero equality, postpeak scale and three-multiplier calibration.
M9.15/19 remain historical records, not the current browser law. M9.14 retains D10..20 default12,
M50..70 default60, ACT .20...30 default.25 and compact touch travel. M9.11 retains steering.

M9.11 remains the current steering-control law:

```text
A = M - D
automatic = clamp(betaTravel, -A, +A)
deltaTarget = clamp(automatic + u*D, -M, +M)
```

`A` is derived only and is never stored. The expanded selector product preserves `A >= 30 degg at
`M=50 / D=20`. No D limiter and no tire-dependent or speed-dependent steering authority is
introduced. Compiled production-profile steering seeds remain unchanged.

M9.9 remains the current axle-neutral common tire seed and deep-sideslip acceptance authority. Its
product rule remains **uncontrollable slide is forbidden; controllable drift is allowed**. Explicit
recovery input must recover; neutral, wrong or intentionally sustaining input is not required to
self-recover.

M9.8 remains the structured nine-production-vehicle catalog/profile-selection authority. M9.0
remains the common two-station vehicle mechanics authority within later scoped supersession.
M9.17 supersedes scoped powertrain behavior; M9.16 retains the ENG calibration boundary.

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

`01_...` through `114_...` are chronological milestone records. A later milestone can supersede a
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
111_m9_17_direct_robotized_mt.md
112_m9_18_load_proportional_one_k_tire.md
113_m9_19_progressive_drift_calibration.md
114_m9_20_five_axis_tire.md
```

For topology/runtime history, the retained M6.44–v6.54 sequence remains authoritative within its
scope; M9.15 through M9.20 change none of those boundaries.

## 3. Takeover context

The latest named handling takeover checkpoint is:

```text
SUPER_OUTRIDE_CODEX_HANDOFF_2026-09-06_M9_20.md
```

It records M9.20 five-axis calibration, inactive TCS preparation, transient diagnostics and unresolved human/keyboard/speed-domain
work. Resolve actual release identity from current Git/PR and exact-SHA CI/Pages.
It is navigation context only and never overrides newer numbered authority, source, tests, Git/PR
or exact-SHA CI/Pages evidence.

The prior:

```text
SUPER_OUTRIDE_CODEX_HANDOFF_2026-09-05_M9_19.md
SUPER_OUTRIDE_CODEX_HANDOFF_2026-09-05_M9_18.md
SUPER_OUTRIDE_CODEX_HANDOFF_2026-09-04_M9_12C.md
SUPER_OUTRIDE_CODEX_HANDOFF_2026-09-01_M9_6.md
```

are historical takeover checkpoints. M9.18 predates the new browser calibration. M9.12C predates M9.13–M9.18; M9.6 predates the current handling
lineage. Older handoffs are also resolved historical context and not active authority.

## 4. Validation evidence

Files under `validation/` are immutable release evidence for the exact milestone/head they record.
They do not become design authority and must not be rewritten after release.

Current retained handling/powertrain records include:

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
validation/M9_16_ENGINE_POWER_DIAGNOSTIC_SELECTOR_VALIDATION.txt
validation/M9_17_DIRECT_ROBOTIZED_MT_VALIDATION.txt
validation/M9_18_LOAD_PROPORTIONAL_ONE_K_TIRE_VALIDATION.txt
```

M9.17 and M9.18 are fully released evidence, not pending validation work. Future normative authority
changes apply the standalone-record decision rule in `validation/README.md`; ordinary navigation
cleanup under unchanged authority uses normal full CI and does not invent a new immutable record.

New validation evidence is added only after the corresponding implementation/documentation head is
fully green. Final release identity is established by the validation-inclusive PR head, pure
fast-forward main, same-SHA main-push CI and Pages deployment rather than by self-rewriting immutable
evidence files.

## 5. Conflict handling

If documents, source and tests appear inconsistent:

1. identify which layer owns the concept;
2. follow the newest explicit scoped supersession;
3. do not create compatibility state to satisfy historical wording;
4. preserve frozen renderer/metric/topology invariants;
5. update current entry/index documents, not historical milestone prose;
6. require executable regression evidence for the resolved current behavior.
