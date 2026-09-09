# SUPER OUTRIDE — Documentation Authority Index

Repository source, tests and current Git/PR/CI state are authoritative over conversation history.
Numbered milestone documents are chronological records; later documents supersede only the scope
they explicitly name. Validation files are immutable release evidence, never design authority.

## Restart navigation

The single active restart map is [M9.22 continuation](SUPER_OUTRIDE_CODEX_HANDOFF_2026-09-06_M9_22.md).
It preserves checked publication evidence, the task-to-source/test map, completed/open/paused work,
and commands that need no past conversation or session download. Read it after AGENTS and the root
README; re-fetch actual main/PR/CI/Pages before using any historical SHA.

[Research index](research/README.md) separates hypotheses, primary inventories, runnable diagnostics
and preservation limits. Do not read archived experiments as current specifications.

[Simplification audit queue](maintenance/SIMPLIFICATION_AUDIT_STATUS.md) tracks the current cleanup
work, explicit retained/held findings and the evidence needed for closure. It does not declare
vehicle handling or the Core complete.

## Current frozen core

```text
00_core_design_freeze.md
00a_core_design_freeze_addendum_m5_2.md
00b_core_design_freeze_addendum_m6_44.md
00c_core_design_freeze_addendum_m6_45.md
```

These own the frozen pseudo-3D renderer, metric and open-runtime invariants. Do not weaken them from
vehicle handling work.

## Current HUD / vehicle / handling authority

[M9.24 restoration119](119_m9_24_restore_friction_ellipse.md) withdraws118 in full and restores
114's fixed ellipse, five-coefficient schema and five selectors. LP no longer exists in source,
UI or diagnostic tooling. The M9.23 [document118](118_m9_23_combined_slip_superellipse.md),
[research](research/M9_23_COMBINED_SLIP_FALSIFICATION.md) and
[released validation](validation/M9_23_COMBINED_SLIP_SUPERELLIPSE_VALIDATION.txt) remain
historical evidence, not active features or instructions to resume the experiment.

Read newest first for the requested scope:

```text
121_m9_26_steering_input_limiter.md
120_m9_25_handling_calibration_unscaled_engine.md
119_m9_24_restore_friction_ellipse.md
116_m9_22_pedal_torque_hud.md
115_m9_21_torque_protection.md
114_m9_20_five_axis_tire.md
113_m9_19_progressive_drift_calibration.md
112_m9_18_load_proportional_one_k_tire.md
111_m9_17_direct_robotized_mt.md
110_m9_16_engine_power_diagnostic_selector.md
109_m9_15_absolute_slide_one_k_tire.md
108_m9_14_compact_touch_expanded_diagnostic_ranges.md
107_m9_13_full_screen_analog_touch.md
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

M9.22 owns only read-only pedal HUD semantics: exact canonical input percentages, delivered F/R
torque-equivalent bars, authored capacity ticks and red requested-minus-delivered reductions.
It supersedes the pedal portion of88, not115 protection or114 tire/handling. No brake-capacity
retuning, additional controller, input change or physics correction is part of this milestone.

M9.21 is current for independent station TCS/ABS, bike-only support-loss prevention and protected
product composition. AWD distributes requests before independent reductions; actual split may
change without reallocation. All browser actors and replacement paths pass explicit catalog policy.
Raw mechanics remains unprotected by default for historical control-free diagnostics.

M9.25 document120 owns the current browser defaults/ranges and removes M9.16 engine calibration.
M9.20 remains current for tire constitutive law. It replaces production
G/P/S and the additional lateral post-peak multiplier with one load-proportional, state-free,
monotone two-axis capacity ellipse. Browser characteristics are:

```text
GX 2.00..6.00 step .05   default 4.00   H forward-cycle
PX 2..20% step 1 point  default 8%     J forward-cycle
GY 1.00..4.00 step .05   default 2.50   G forward-cycle
PY 2..20% step 1 point  default 8%    L forward-cycle
KN .10.. .95 step .01   default .74   N forward-cycle
```

Each axis also has explicit minus/value/plus UI controls. Authoring compiles atomically to resolved
`muX / muY / kX / kY / rhoKnee`, with `k=(2-knee)*G/P`; P and selector IDs are derived, not duplicate
physics state. `kX=kY` is not imposed. Front/rear equality is provisional composition; station data
slots and the lower tire law permit explicit future differences without a drive-layout branch.

M9.20 removes S, P-to-2P post-peak reduction and `lateralPostPeakScale` from production. It retains
M9.18 current-load homogeneity and zero-contact release. M9.21 activates TCS/ABS outside the retained tire law. Support control does not
change contact loads or clamp body states. Power-over drift is no longer a product acceptance goal.
Handling remains `DEV_UNCALIBRATED`.

M9.11 remains the requested steering law;121 limits only its driver offset:

```text
A = M - D
automatic = clamp(betaTravel, -A, +A)
requestedTarget = clamp(automatic + u*D, -M, +M)
actualTarget = automatic + limitedDriverOffset  //121: same-sign reduction of u*D only
```

M9.14/M9.13 retain D/M/ACT and full-viewport touch semantics. M9.17 owns direct wheel-derived RPM,
instantaneous robotized-MT ratio selection and one rev limiter. M9.25 removes ENG calibration.
M9.9 retains the product rule: **uncontrollable slide is forbidden; controllable drift is allowed**.

Current circuit authoring remains:

```text
93_m9_3_tsukuba_circuit.md
96_m9_6_fisco_circuit.md
```

## Numbered milestone history

`01_...` through `121_...` remain chronological records. Do not rewrite older milestone prose merely
to use current terminology. M9.20 explicitly supersedes old-law force/selector contracts listed in
114; those older files remain historical evidence for the implementation that existed then.

For topology/runtime history, the M6.44–M6.54 sequence remains current within its scope. M9.20
changes none of those boundaries.

[117 — Session configuration boundary](117_session_configuration_boundary.md) supersedes only
document 61's placement of opponent count on the course profile. Separate session configuration
now owns cardinality; route structure, physical progress, public counts and branch policy remain.

## Current takeover context

```text
SUPER_OUTRIDE_CODEX_HANDOFF_2026-09-06_M9_22.md
```

This remains navigation, not a second normative parameter ledger. Its post-release status distinguishes
published HUD/protection from unverified interactive display, provisional brake capacity/bias,
combined-input handling and the later120 resumption of player tire tuning. Its source/test map and research index avoid reliance
on older conversations. Resolve live release identity from Git/PR and exact-SHA CI/Pages.
Older M9.21/M9.20/M9.19/M9.18/M9.12C/M9.6 handoffs remain unchanged historical context.

The handling-research decision chain, including corrected and rejected hypotheses, is:

```text
research/M9_20_TIRE_DESIGN_DECISION_HISTORY.md
```

Research context never overrides numbered authority, current source/tests or Git.

The history links all eight byte-preserved [source reports](research/m9_20_source_reports/)
and their [SHA-256 manifest](research/m9_20_source_reports/manifest.json).
Read the [snapshot scope](research/m9_20_source_reports/README.md) before reusing a result.
The [preservation repair](research/M9_20_PRESERVATION_REPAIR_2026-09-06.md) records the missing
archive incident and its causal tests. Report preservation does not mean every historical
script/JSON/ZIP is in Git or every experiment was rerun. This is not a verbatim chat archive.

## Immutable validation evidence

Files under `validation/` record exact milestone evidence and must not be rewritten after release.
Read `validation/README.md` for the standalone-record and exact-head self-reference rules.

Current HUD/handling/powertrain validation lineage includes:

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
validation/M9_20_FIVE_AXIS_TIRE_VALIDATION.txt
validation/M9_21_TORQUE_PROTECTION_VALIDATION.txt
validation/M9_22_PEDAL_TORQUE_HUD_VALIDATION.txt
validation/M9_24_FRICTION_ELLIPSE_RESTORATION_VALIDATION.txt
validation/M9_25_HANDLING_CALIBRATION_UNSCALED_ENGINE_VALIDATION.txt
validation/M9_26_STEERING_INPUT_LIMITER_VALIDATION.txt
```

M9.22's record names the green implementation/doc/test-inclusive head `c8c5cca` and PR #142 CI #852.
Its record-inclusive #853 and same-SHA main #854 also passed 828/828; Pages published `628b3bed`.
That implementation is already released. The current handoff retains the full SHA and run/artifact
identities; do not interpret the record's future-tense release gate as unfinished HUD work.

A validation file cannot name the CI run that validates its own newly created bytes without creating
another commit. Final release identity therefore comes from Git/PR and exact-head workflow evidence,
not self-rewriting the record. M9.21 and all earlier immutable evidence remain unchanged. Ordinary
navigation/test cleanup under unchanged numbered authority uses its own PR's exact-head CI and does
not create another milestone or retrospective validation file.

## Conflict handling

If documentation, source and tests appear inconsistent:

1. identify the layer that owns the concept;
2. follow the newest explicit scoped supersession;
3. do not create compatibility state merely to satisfy historical wording;
4. preserve frozen renderer/metric/topology invariants;
5. update current entry/index documents, not historical milestone prose;
6. require executable regression evidence for the resolved current behavior.
