# M9.29 — Common Player Handling Baseline

Status: user-selected diagnostic calibration. Handling remains DEV_UNCALIBRATED.
Base:089d37fac437e45d7c9a6ba1dcdd822a70e8f87b (released M9.28).

The user's car and bike driving tests favor larger PX and the following combination. Adopt it
as the common initial PLAYER comparison baseline for all nine selectable vehicles. This is not
an assertion of universal optimality or a permanent common vehicle-tire specification. Future
vehicle-specific calibration remains a separate authoring decision.

| Control | Default | Range | Step |
|---|---:|---:|---:|
| GX | 5.00 | 2.00..8.00 | .05 |
| PX | 20% | 2..40% | 1 percentage point |
| GY | 2.50 | 1.00..4.00 | .05 |
| PY | 10% | 2..20% | 1 percentage point |
| KN | .74 | .10...95 | .01 |
| D | 20 degrees | 10..30 degrees | 1 degree |
| M | 65 degrees | 50..80 degrees | 5 degrees |
| ACT | .30 seconds | .20...40 seconds | .025 seconds |

Ranges are broad diagnostic choices around the requested defaults. Retain existing tire minus/
value/plus controls, steering choice buttons, keyboard forward cycles and endpoint wrapping.
The common browser shell owns application and preserves chosen values through recovery and
vehicle replacement. Reload/course navigation resets browser calibration. Raw construction and
rival profile seeds remain distinct authored data, unchanged by player selectors.

PX influences the longitudinal force buildup and slip-protection threshold. A prior coasting-only
finding of little PX influence does not establish little effect on powered/braking human handling.
No claim of vibration elimination or all-speed stability follows from the user's preferred values.
PY continues to affect both lateral stiffness and the existing input-stop threshold.

## Architecture decision gate

1. Existing browser tire/steering registries own comparison ranges and defaults.
2. Existing compiler, selector adapters and shared shell express the entire request.
3. No new physical state, coordinate, coefficient authority or stored derived A is added.
4. No vehicle-kind, drive-layout, course, speed or input-device branch enters mechanics.
5. One common player composition baseline is sufficient; no new tire law or controller.
6. Preserve A=M-D, fixed ellipse, dissipativity, wheel solve, protection, contact/world state,
   renderer chainage, fixed metric, open topology and M9.28 CG/presentation.
7. Test full grids, both tire directions, steering wrapping/active buttons, all-nine initial
   application and recovery, shared-shell replacement, and the complete physical regression suite.

## Supersession and regression evidence

Supersedes120's player tire defaults/ranges and108's D/M/ACT ranges/defaults only. All tire,
steering-input-stop, automatic alignment, rack, torque and presentation equations are unchanged.
Historical numbered documents and release evidence stay immutable; current indexes are updated.

The M9.20 research trajectory and M9.21 braking/terrain causal comparisons must explicitly use
historical D12/M60/ACT.25, just as they already pin their historic tire/CG/engine inputs. Their
physical assertions remain unchanged. Generic diagnostic tools accept optional steering calibration
through the ordinary constructor; omission still uses the current browser baseline. The M9.27
8% analytic geometry fixture is made explicit instead of reading mutable browser defaults.
Existing all-nine current-default budget/terrain tests continue to exercise the new combination.
New control integration verifies the user baseline, choices on both sides, PX above20%, wrapping
and recovery across all nine catalog entries. These are regression results, not human handling
certification.

A normative calibration milestone requires a standalone validation record after green
implementation-head CI, then record-inclusive green CI and non-force exact-head main/Pages gates.

Local validation: npm ci and complete867/867 suite passed with the immutable b70 reference.
The local CIRCUIT browser accessibility tree shows M9.29, GX5/PX20%/GY2.5/PY10%/KN.74,
D20/M65/ACT.30 active, and expanded steering choices. This confirms loaded values, not full
mobile layout or human driving acceptance.
