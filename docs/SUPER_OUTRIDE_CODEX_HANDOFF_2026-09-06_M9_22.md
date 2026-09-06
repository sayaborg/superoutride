# SUPER OUTRIDE — M9.22 Pedal Torque HUD Handoff

Navigation only. Repository source, numbered authority, tests and current Git/CI are authoritative.
Re-fetch current main/open PR/exact-head CI/Pages. This work began from
8b103201b49abdcaab427cd5c1724351dd81f15d; that is a historical starting SHA, not a release self-reference.

## Read first

AGENTS.md, README.md, docs/README.md; then116_m9_22_pedal_torque_hud.md for presentation,
115_m9_21_torque_protection.md for mechanics and114_m9_20_five_axis_tire.md for the retained tire.
Read actual HUD, input normalization, vehicle control telemetry and new/retained regression tests.

## Current change

Shared DEV HUD: exact canonical pedal INPUT, FRONT and REAR output for both ACCEL/BRAKE.
Cyan=delivered, red=pre-protection request minus delivered, empty=not requested. Static ticks show
profile drive shares/brake-capacity shares. Percentage labels are inside the meters. Steering,
handwheel, G sensor and all course roots remain. No new gesture or selector.

ACCEL uses throttleActuator*(station torque / total pre-protection requested drive torque), all
from the same final substep. This equals a common available full-throttle reference without calling
the powertrain from drawing. Zero request/full rev cut draws zero drive output and no fake cut.
Do not normalize the delivered total back to100% or normalize each station separately to100%.
BRAKE uses the fixed sum of the two authored maximum torques. Front/rear radius or load is not a
brake torque-percentage denominator. Current capacities remain provisional, unchanged seeds.

No mechanics/tire/protection/steering/engine/profile modifications; no controller state or direct
pose/speed/wheel correction. Handling is DEV_UNCALIBRATED. Paused tire calibration and front/rear
specialization remain paused; power-over is not a product acceptance goal.

## Retained work and known bounds

The earlier handoff `SUPER_OUTRIDE_CODEX_HANDOFF_2026-09-06_M9_21.md` remains historical navigation.
Read `research/M9_21_TERRAIN_FALSIFICATION_2026-09-06.md` and
`research/M9_21_BRAKING_YAW_CAUSALITY_2026-09-06.md` plus their CSV inventories. The UI does not fix
braking-induced moving yaw, crest overtravel or every inherited support-loss state. ABS/TCS are not
ESC. Do not use display normalization as evidence of optimal braking, factory brake capacity, tire
force or available road grip. Red indicates combined protection, not individual cause attribution.

## Validation/release

`tests/m9-22-pedal-torque-hud.test.mjs` covers the new presentation boundary. Two old HUD tests
explicitly migrate their superseded pedal fields/label count while retaining other invariants.
Run npm ci and npm test on the full exact source. New116 authority requires a standalone immutable
post-green validation record and another full record-inclusive CI. Resolve final SHA/counts from the
active PR and Git; require main=PR head=merge SHA, matching Pages versioned build and deployment.
Do not claim interactive browser/human handling verification solely from drawing mocks or CI.
