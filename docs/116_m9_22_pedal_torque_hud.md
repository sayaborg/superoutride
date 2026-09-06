# M9.22 — Read-only Pedal Torque HUD

Status: current scoped DEV pedal-display authority. Handling remains DEV_UNCALIBRATED.

## 1. Scope and explicit supersession

This replaces document88's ON/OFF pedal indicators and single actuator-only actual pedal meters
with exact normalized INPUT and separate FRONT/REAR delivered-torque percentages. It permits compact
percent labels inside pedal meters; it does not restore absolute torque/slip/route text overlays.
Steering request/actual graphics, handwheel, G sensor, all selectors and all three course-root HUD
calls remain. Document115 owns protection;114 owns tires;98 owns provisional vehicle brake data.

No tire calibration, brake capacity/bias, drive split, engine, input response, TCS/ABS, bike support,
suspension, vehicle state, time step, course, camera, physical renderer or gameplay change is allowed
by this HUD milestone. Power-over remains outside product acceptance; tire tuning remains paused.

## 2. One read-only owner and measurement stage

`src/browser/vehicle-debug-hud.ts` maps canonical DrivingInput, compiled profile and existing control
telemetry into presentation. INPUT uses normalizedPedalRequest, preserving boolean0/1 and numeric
[0,1] without truthiness rounding. Canonical pedals remain mutually exclusive; their effective
actuator values and resulting drive/brake torques may overlap during ordinary release/apply.

F/R torques come from the same final internal-substep control observation:
requestedFrontDriveTorque, requestedRearDriveTorque, frontDriveTorque, rearDriveTorque,
requestedFrontBrakeTorque, requestedRearBrakeTorque, frontBrakeTorque, rearBrakeTorque.
The drive normalization additionally reads throttleActuator from that same observation. Never rerun
powertrain/traction/support physics from a HUD draw, use post-update wheel speed for a mismatched
normalizer, feed displayed values back, or create a second persistent controller/torque state.

These are torque-equivalent percentages, NOT physical throttle-valve angles, hydraulic pressure,
road force, acceleration or available-grip percentages. At rest a brake can hold without implying
nonzero friction work. During flight delivered wheel torque does not imply a road force.

## 3. Shared accelerator100% scale

Let a be observed throttleActuator, Dreq=DFreq+DRreq. Current M9.17 drive is linear in a at fixed
current RPM/gear/ENG/engine-limiter state. Therefore the requested/delivered full-throttle-equivalent
station percentages are (multiply by100 only for text):

```
F.requested = a * (DFreq / Dreq)
F.delivered = a * (DFdel / Dreq)
R.requested = a * (DRreq / Dreq)
R.delivered = a * (DRdel / Dreq)
```

This is division by the available unprotected full-throttle torque Dreq/a, evaluated without dividing
by small/zero a. Both stations use ONE denominator. No delivered-total renormalization. Capacity ticks
are the authored drive share f and1-f. RWD has F0/R1; FWD F1/R0; AWD keeps its explicit requested split.
No vehicle-name or drivetrain branch is necessary. Front and rear wheel radii do not enter this
torque display. If the powertrain's linear-throttle contract changes, revisit this derivation.

When Dreq=0, both requested/delivered bars and their reductions are zero. This includes coast/spawn/
recovery and a full upstream engine rev cut. The static share ticks remain. Positive input with no
engine request is NOT colored as traction/support reduction. Partial engine rev limiting is part of
the available full-throttle reference; this is not an absolute engine-power or limiter-activity gauge.

Illustrative45:55: full input/no intervention shows45/55%; half input after actuator response shows
22.5/27.5%; full input with front torque halved shows22.5/55%, with22.5% red on F only. Removed torque
is neither transferred to R nor used to rescale its visual bar. The actual Delta default remains47:53.

## 4. Shared brake100% scale

Let C=BFmax+BRmax from the compiled profile (fixed until vehicle replacement):

```
F.requested = BFreq/C; F.delivered = BFdel/C; F.limit = BFmax/C
R.requested = BRreq/C; R.delivered = BRdel/C; R.limit = BRmax/C
```

A zero total configured capacity draws empty finite meters/ticks, not NaN/Infinity. Do not substitute
current load, material grip, tire capacity, current requested total or wheel radius for C. The bars
measure the authored wheel-side brake torque budget, not road-force balance or stopping capability.

VFR's unchanged700/300N*m setup therefore has70/30% ticks. At full request with delivered500/100N*m,
F is50% cyan+20% red; R is10% cyan+20% red. A half request with no intervention is35/15% cyan, no red.

The authored capacities remain direct provisional engineering seeds (document98), not a newly
validated factory/hydraulic derivation. Cars use aggregate front/rear stations, not four independent
wheel channels. Brake sizing/bias revision is explicitly separate from this display change.

## 5. Graphic contract

ACCEL and BRAKE each have three horizontal meters: INPUT, F and R, with the same0..100% track length.
Both output bars use cyan for0..delivered; RED=CUT fills only delivered..requested; requested..100%
stays empty. The authored maximum/share has a thin marker. Percent text reports INPUT or delivered
output, not post-intervention front/rear distribution renormalized to100%. Values are rounded for
text only; geometric lengths use the continuous normalized values.

INPUT retains blue accelerator/red brake semantic colors but its fill is proportional, including
touch intermediate values. Red in the F/R rows is the TOTAL reduction by document115: TCS/support
on drive and ABS/support on braking. It does not claim to identify the separate intervention cause.
Actuator lag, lower pedal request and upstream engine behavior are not red protection segments.

The current320x240 overlay retains58x7 tracks and extends the pedal columns by one14px row. Outlined
opaque glyphs and ordinary bars only: no alpha-blended/opaque panel, no new render path. It uses the
same shared renderer in LINEAR, BRANCHING, TSUKUBA and FISCO. No new selectors or control gestures.

Display-only finite/unit clamps retain the established HUD boundary and must not change mechanical
telemetry. In supported mechanics,0<=delivered<=requested<=authored share. Missing/zero references
must not manufacture a full bar or a protection event. Recovery/vehicle replacement has no HUD memory
and derives the new profile's capacities on the next draw.

## 6. Architecture Decision Gate

1. Ownership: the existing browser HUD model/drawing, not tire or torque-protection mechanics.
2. Reuse: canonical pedal normalization, recorded before/after torque, actuator and authored capacity.
3. No second physical state, controller history, denominator state, engine evaluation or mutable cache.
4. No vehicle/kind/drive-layout/route branch below composition; equations use existing scalar data.
5. Differences are profile-driven static ticks and observed request/output; no calibration selector.
6. Preserve every current physical invariant, exclusive input, full-viewport touch and frozen Core.
7. Causal regressions cover analog input, common scales, actual reductions, response lag, residual
   pedals, zero request/capacity, all-nine live observations, draw intervals and read-only behavior.

## 7. Regression migration and release

The two legacy HUD test groups in m7-0 and m8-3 are updated only where actuator-only pedal fields
or the old number of labels conflict with this explicit supersession. Their steering, G sensor,
handwheel, exclusive input colors, finite response and no-panel assertions remain. No physics test
is weakened and the braking-yaw/terrain counterexamples remain unchanged.

New tests: `tests/m9-22-pedal-torque-hud.test.mjs`. Full current-source npm ci/npm test on the exact
feature head is required. Because this adds normative HUD authority, create a NEW immutable
validation record only after implementation/doc/test-inclusive green CI, run full CI again on the
record-inclusive head, then release by non-force pure fast-forward and same-SHA main/Pages checks.
Do not overwrite a historical validation file. Version labels match package0.9.22/M9.22.

Continuation: `SUPER_OUTRIDE_CODEX_HANDOFF_2026-09-06_M9_22.md`.
