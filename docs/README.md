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

### Current touch-driving calibration and input/presentation

```text
108_m9_14_compact_touch_expanded_diagnostic_ranges.md
107_m9_13_full_screen_analog_touch.md
```

M9.14 supersedes M9.13 only for the full-scale touch displacement calibration. The current 100%
travel is one fixed compact value:

```text
L = 64 CSS px
```

M9.13 remains authoritative for full-viewport pointer ownership, pointer-down neutral origin,
horizontal steering, exclusive vertical ACCEL/BRAKE axis, fixed pointer role, two-thumb use, DIRECT
held response, existing release-rate decay and presentation-only origin/vector indicators.

CSS px avoids dependence on native backing-store/device pixel density and M9.14 no longer changes
travel with viewport size or orientation. It does not claim exact physical-millimeter equivalence
across all devices.

### Current vehicle physics / steering / tire / catalog

```text
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

M9.14 is the current scoped browser comparison-range authority. Defaults remain unchanged while the
DEV diagnostic envelope is expanded to:

```text
D     = 10 / 11 / 12 / 13 / 14 / 15 / 16 / 17 / 18 / 19 / 20 deg  default 12
M     = 50 / 55 / 60 / 65 / 70 deg                                default 60
ACT   = 0.20 / 0.225 / 0.25 / 0.275 / 0.30 s                      default 0.25

GRIP  = 2.00 / 2.20 / 2.40 / 2.60 / 2.80 / 3.00 /
        3.20 / 3.40 / 3.60 / 3.80 / 4.00                          default 2.00
PEAK  = 20 / 22 / 24 / 26 / 28 / 30 / 32 / 34 / 36 / 38 / 40 /
        42 / 44 / 46 / 48 / 50 / 52 / 54 / 56 / 58 / 60 %        default 20
SLIDE = 60 / 65 / 70 / 75 / 80 / 85 / 90 / 95 / 100 %           default 80
```

The complete tire product is `11 x 21 x 9 = 2,079` diagnostic calibrations. Extreme values such as
GRIP=4.00, PEAK=60% and SLIDE=100% are diagnostic probes, not claims of ordinary production-tire
realism.

M9.12 remains the independent tire-calibration-axis authority. It keeps the existing vehicle-owned
three-scalar calibration and interprets it as:

```text
GRIP  = peak force height
PEAK  = common normalized slip at peak
SLIDE = large-lateral-slip plateau / peak
```

Changing one browser tire axis preserves the other two displayed characteristics. M9.14 expands the
range only; it adds no persistent tire state and does not split longitudinal and lateral tire
profiles.

M9.10 remains the current tire constitutive-law authority for the stateless C1 lateral post-peak
falloff and the monotone scalar implicit wheel solve.

M9.11 remains the current steering-control law:

```text
A = M - D
automatic = clamp(betaTravel, -A, +A)
deltaTarget = clamp(automatic + u*D, -M, +M)
```

`A` is derived only and is never stored. The expanded M9.14 selector product preserves `A >= 30 deg`
at `M=50 / D=20`. No D limiter and no tire-dependent or speed-dependent steering authority is
introduced. Compiled production-profile steering seeds remain unchanged.

M9.12C/M9.12B/M9.12A remain historical/current lineage for the diagnostic interpretation and centered
defaults that M9.14 does not supersede; their old browser upper/lower range tables are superseded by
M9.14.

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
control by M9.11. Their tire and controllability decisions remain current inside later scoped tire
selector supersession.

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

`01_...` through `108_...` are chronological milestone records. A later milestone can supersede a
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
```

For topology/runtime history, the retained M6.44–M6.54 sequence remains authoritative within its
scope; M9.14 changes none of those boundaries.

## 3. Takeover context

The latest named handling takeover checkpoint remains:

```text
SUPER_OUTRIDE_CODEX_HANDOFF_2026-09-04_M9_12C.md
```

It records the released M9.12C handling state and the `GRIP=2.00 / PEAK=30%` diagnostic observation.
It is navigation context only and predates M9.13/M9.14 touch/range authority; documents 107/108 and
current source/tests supersede it for those topics.

The prior:

```text
SUPER_OUTRIDE_CODEX_HANDOFF_2026-09-01_M9_6.md
```

is historical M9.6 takeover context. Older handoffs are also resolved historical context and not
active authority.

## 4. Validation evidence

Files under `validation/` are immutable release evidence for the exact milestone/head they record.
They do not become design authority and should not be rewritten after release.

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
```

M9.14 changes current normative touch-feel and browser comparison-range authority, so its release
requires a new standalone validation record under `validation/README.md` after the
implementation/documentation head is fully green.

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
