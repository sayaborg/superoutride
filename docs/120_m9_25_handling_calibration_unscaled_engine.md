# M9.25 — Handling Calibration and Unscaled Engines

Status: scoped normative calibration and powertrain simplification. Handling DEV_UNCALIBRATED.

The user's handling test found GX4/GY2.5/PX8%/PY8% useful. Adopt these as player browser defaults
and expose a broad surrounding range after the user requested more room than GX3..5/GY2..3/P4..12.
This is empirical tuning, not certification of physical realism or global stability.

| Axis | Default | Range | Step |
|---|---:|---|---|
| GX | 4.00 | 2.00..6.00 | .05 |
| GY | 2.50 | 1.00..4.00 | .05 |
| PX | 8% | 2..20% | 1 point |
| PY | 8% | 2..20% | 1 point |
| KNEE | .74 | .10...95 | .01 |

Keep the existing five minus/value/plus controls, keys H/J/G/L/N and endpoint wrapping.
Keep linked front/rear selection, compile ownership, lifecycle and stock/rival tire data.
The fixed ellipse of114/119 is unchanged. D12/M60/ACT.25 and all steering equations are unchanged.

Engine output is the authored curve at its sampled RPM, with no instance multiplier. Delete
M9.16's field, constructor parameter, setter/validator, K key, ENG button/HUD row and recovery/
replacement copying. No constant-one compatibility setting remains. Keep original curves,
gear ratios, limiter, throttle, torque split and M9.21 protection. Historical research remains
historical; current diagnostic CLI removes --engine and the old boosted reference mode.

## Authority and architecture decision gate

This supersedes114/119 only for browser defaults/ranges;110 in full for the multiplier feature;
and111's retained multiplier constructor/state/lifecycle assertions. It does not change111's
mechanical drivetrain or115's protection. The user's explicit calibration request resumes player
tire calibration; front/rear differentiation remains deferred.

1. Browser registry owns selectable defaults/ranges. Powertrain owns curve sampling.
2. Existing integer-grid steppers and the original torque sample express the complete request.
3. Delete calibration state and adapters; no replacement multiplier or duplicate tire values.
4. No vehicle, topology, device or drift branch is added to mechanics.
5. Player composition applies new tires; stock/rival data remain authored separately.
6. Preserve force ellipse, dissipativity, wheel roots, world motion, renderer/metric and topology.
7. Test every grid transition/default/lifecycle; unscaled engine equation across all nine profiles,
   actual K no-op/replacement/recovery and retained high-torque protection/gear regressions.

## Regression migration and exact equivalence

M9.16's feature-specific suite is retired and replaced by m9-25-unscaled-engine tests. Retained
gear, protection and reference-trajectory stress cases use explicitly authored test-only curves
with the same historical torque samples. There is no test helper import into src or tools.
Multiplier-specific recovery assertions become unscaled state/schema and actual engine checks.
M9.24's selector/style/probe hashes are superseded only where this document changes them;
its tire/compiler/profile/protection/wrench hashes and LP absence remain enforced.

The pinned b70 mechanical comparison must continue comparing all physical numbers exactly.
Its serializer validates any old engineTorqueMultiplier metadata equals1 before omitting that
retired field. No other value is filtered, rounded or tolerated. This is schema migration, not
permission to hide changed torque or dynamic state. A separate baseline comparison covers all
nine direct powertrains at matched wheel speed, gear and throttle.

## D stopper study — evaluation only

See [mathematical assessment](research/M9_25_STEERING_STOPPER_ASSESSMENT.md).
No steering stopper is installed in this release. The request is to evaluate feasibility; a
tire/contact-aware controller would explicitly supersede101's Driver observation boundary and
require causal handling tests. A simple input stop does not prove vehicle stability.

## Release

This removes normative engine authority and changes calibration: a standalone immutable validation
record is required after green implementation-head CI, then green record-inclusive CI and the
non-force exact-head main/Pages gates in AGENTS. Preserve all prior numbered docs/evidence.

## Observed changed maneuver behavior

At new player tires, the R80 lowGripReversal probe (120Hz, mu-material .25, 30m/s entry,
6 seconds, existing input schedule) completed without overturn but reached about178.8deg beta
and0.117s front lift. This is not acceptable evidence of globally stable handling. The user is
still testing handling; do not label this tuning certified or silently clamp the physical motion.
The new-default suite checks finite dynamics/torque budgets/ellipse/dissipation across72 maneuvers,
explicitly without claiming yaw or no-lift guarantees.

The M9.21 brake-yaw causality and no-lift terrain assertions remain unchanged on their explicit
original GX2.5/GY2.2/PX8%/PY10% fixture. Their source tests already require explicit supersession
for future handling changes. Pinning those test inputs under this authority preserves the actual
causal regression; current diagnostic tools still default to the new browser values. The terrain
probe's existing calibration option additionally accepts authored characteristics through the same
compiler, so historical test conditions require no alternate solver or version branch.

Local complete suite:849/849 pass with immutable b70 reference. Actual browser default values and
K no-op verified. Five controls fit320x568 and844x390 without internal overflow; backing320x240.
