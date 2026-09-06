# SUPER OUTRIDE — M9.21 Torque Protection Handoff

2026-09-06. Navigation only; repository is sole project authority.

## Read first

AGENTS.md, README.md, docs/README.md, then `docs/115_m9_21_torque_protection.md`, retained tire
`docs/114_m9_20_five_axis_tire.md`, contact/recovery 112 and engine/steering/input authorities.
Re-fetch main, open PRs, exact-head CI and Pages. The historical starting main was
`e03b501e07d7770563a6f58933e202e2e1ccaff1`; it is not the final release's self-reference.

## Implemented scope

Independent TCS on driven stations and independent ABS on both stations. AWD requested front split
is preserved before protection, while actual split can change; removed torque is not redistributed.
No direct front/rear shaft lock. Catalog data enables additional support-loss prevention ONLY on the
four bikes. Controls change actual drive/brake torques, not body state, tire coefficients or loads.

The lower constructor remains unprotected unless explicitly supplied a policy, for raw mechanics
and historical no-TCS research. ALL browser player/rival/replacement constructors pass the catalog
policy. Recovery preserves it, replacement selects the new vehicle's policy. No product OFF UI.

One shared wheel equation provides its inverse torque boundary; the wheel residual remains monotone.
One shared wrench assembly retains tire, normal force, gravity/aero and wheel rotation reactions.
Bike support protection uses signed gap, reach velocity and that wrench with existing suspension
frequency; reserve is explicitly 8% of static compression. A bounded verified-safe search scales
requests, then independently reprojects wheel slips. Infeasible zero-torque states are reported,
not fixed by clamping pitch or creating contact. Read document115's domain and approximation caveats.

New source:
- `src/physics/torque-protection.ts`
- `src/physics/vehicle-wrench.ts`

New diagnostic / regressions:
- `tools/torque-protection-probe.mjs`
- `tests/m9-21-torque-protection.test.mjs`

```sh
npm ci
npm test
node tools/torque-protection-probe.mjs --hz 120 --out protection.json
```

## Retained and deferred

Five-axis tire values, selectors, force law, D/M/ACT, ENG, profile geometry, steering, gear ratios,
physics time steps, camera, renderer and course authoring are unchanged. Tyre calibration and
front/rear tire differentiation are PAUSED, not declared impossible or complete.
Power-over drift is removed as a product goal. Inertia-driven drift and exit remain evaluation goals.
No target beta, yaw correction, fake grip, velocity correction, controller integral or tire memory.
Historical source reports and M9.20 raw positive-reference tests remain, but must not be asserted as
protected product power-drift requirements. Current handling remains DEV_UNCALIBRATED.

All four bikes no longer overturn on the tested full-brake baseline; this is not global spin/handling
certification. Abrupt steering reversal plus braking on low grip/slopes can still spin sideways.
TCS/ABS are not ESC. Check residual pedal overlap, low-speed stop/reverse, airborne/recontact and
inherited infeasible pitch before broader claims. Full diagnostic tire-grid human handling remains open.

## Release identity

Resolve final head and exact-head CI from the active M9.21 PR and workflow. New standalone validation
is mandatory after implementation-inclusive green CI, followed by another full run on its inclusive
head. Main must equal PR head and merge SHA after non-force pure fast-forward, with matching Pages.
No temporary source-export workflow or isolated local experiment scripts belong in the release tree.

Evidence and limits: `docs/research/M9_21_IMPLEMENTATION_EVIDENCE.md`.

Immutable pre-validation evidence: `docs/validation/M9_21_TORQUE_PROTECTION_VALIDATION.txt`.
PR #138 implementation-inclusive head `5992a6a6b9cc833588ec1665b87bd97b2cfe0466` passed
exact-head Node24 CI #840 (run `34013445709`, build `101433090492`), 703/703 with zero
fail/cancel/skip/todo. The record was added only after that success. Resolve record-inclusive
CI and final main/Pages identity from the same PR; do not treat the pre-validation SHA as current.

## Post-release falsification and current continuation

Read `docs/research/M9_21_TERRAIN_FALSIFICATION_2026-09-06.md` for low-grip/grade/crest results
and retained qTravel/overturn counterexamples. Then read
`docs/research/M9_21_BRAKING_YAW_CAUSALITY_2026-09-06.md` and its complete compact180-run inventory
`docs/research/M9_21_BRAKING_YAW_120HZ.csv` for same-reached-state braking/steering comparisons.
These reports are evidence, not new authority. They do not reopen paused tire calibration.

The early VFR braking yaw increase occurs with rear unloading, before wheel lock or automatic
steering saturation. Immediate driver-offset release suppresses that example, but small release
delays leave large sideslip and the requested trajectory changes. Removing support protection adds
rear lift and does not remove the yaw growth. Do not claim a finished handling fix from this.
`tools/braking-yaw-probe.mjs` reproduces the comparison; `forkProbe` now retains original world readers.

Next decision must preserve useful braking AND requested course curvature, rather than hiding yaw
by universally reducing brakes, retuning rear tires, enlarging the rack or adding unauthorized ESC.
Human input and actual-course acceptance remain open. Ordinary diagnostic/test-only additions use
PR exact-head full CI under `docs/validation/README.md`, without manufacturing new authority records.
