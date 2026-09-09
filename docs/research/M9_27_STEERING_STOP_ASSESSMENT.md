# M9.27 Steering Input Stop Assessment

This is diagnostic evidence for122, not extra control authority. The predecessor is released
M9.26 SHA05a0f46a13a077b20e25c15e362acd047359ca93. Candidate measurements use the fixed-onset
quadratic source in122; source+tests and exact CI establish the implementation identity.

## Decision

Keep a front-tire input policy, not a new vehicle stability controller. One fixed pure-lateral
criterion and a conservative quadratic interval replace automatic-baseline inflation and periodic
component selection. Including zero permits partial corrective input while retaining neutral.
Do not describe the interval as the exact lateral-force maximum, or as guaranteeing general recovery.

The earlier quadratic prototype retained121's inflated S and only changed its root method; this
candidate additionally removes that policy. A positive quadratic minimum is treated as the unique
best certified correction, not as permission to unlock all input. Local maximum ambiguity permits
zero input rather than an arbitrary left/right branch. Ordinary correction can be conservative.

## Repeatable comparisons

Build M9.26 at its exact SHA in a separate checkout, then from the candidate run:

```
node tools/steering-input-stop-probe.mjs --baseline /path/to/m926/dist --out /tmp/steering-comparison.json
node tools/steering-input-stop-benchmark.mjs /path/to/m926/dist /tmp/steering-benchmark.json
```

Committed [comparison JSON](M9_27_STEERING_STOP_COMPARISON.json) contains252 pairs (9 profiles,
2 grips, D12/20,7 schedules),6 signed/refined high-speed brake cases and3 identical-reached-state
VFR brake comparisons. World readers and initial states are shared through independent forks.
Both builds retain the same tire/wheel/contact/torque law. The baseline's compiled physics and
limiter were from the recorded M9.26 source, not an earlier tire calibration or unprotected model.

Default Testarossa,108km/h,grip1,D12,0.5s neutral then full-steer coast to3s and neutral to6s:

| Metric | M9.26 | M9.27 candidate |
|---|---:|---:|
| Mean travel-normal acceleration during first steering second |21.0785m/s²|21.0793m/s²|
| Speed at3s |75.6757km/h|75.9840km/h|
| Peak absolute body beta while speed>5m/s |17.4172deg|17.3753deg|

These are finite trajectories, not identical-state force comparisons or human control tests.
All252 candidate cases remained finite; total unsupported-body time was zero. Individual station
contact/bypass transitions are not covered by that aggregate and can still cause large target steps.

## Causal discontinuity improvement

Previously a fixed flat state with automatic=-40deg,requested=20deg and contact direction crossing
-130deg changed permitted input from0 to20deg. This was the inflated-baseline periodic-component
rule, not a tire-force discontinuity.122's fixed criterion and quadratic do not make that jump.
The direct geometric regression covers the crossing without relying on rack filtering.

For Testarossa,216km/h,D20,full steering then full brake, the maximum final-substep delivered-input
change per frame is:

| Hz | M9.26 | M9.27 |
|---|---:|---:|
|60|20deg|2.6383deg|
|120|20deg|1.3598deg|
|240|20deg|0.6834deg|

Signed runs are included. This supports the retained-contact continuity claim for this trajectory;
it is not a claim that every contact transition or every state has a small frame-to-frame change.

## Important adverse result: full-brake handling

The new front-only criterion does NOT fix the braking counterexample. Starting from the exact same
M9.26-reached VFR state,grip0.25,D12,hold full steering/full brake1.5s then release both3s:

| Hz | M9.26 peak abs beta at speed>15m/s | M9.27 |
|---|---:|---:|
|60|92.2053deg|110.0490deg|
|120|91.8944deg|109.2605deg|
|240|91.7356deg|108.8681deg|

This is a real adverse dynamic outcome at moving speed, not stopped-angle noise. It remains
explicitly unresolved. The user-requested redesign concerns a simple explainable front input stop;
it does not authorize claiming stability, adding brake/vehicle-specific exceptions, or quietly
retuning the tires/ABS to hide this result. Prior limiter-OFF diagnostics gave about49deg in this
case, so neither limited version should be advertised as solving hard-brake instability.

## Cost

[Raw benchmark](M9_27_STEERING_STOP_BENCHMARK.json): Apple M4,Node24.18.0,500000 calls per batch,
11 alternating-order warmed samples, identical1024 deterministic contact inputs per group.
Both API versions use an adapter to the same calling convention. Median milliseconds:

| Group | M9.26 | M9.27 |
|---|---:|---:|
|Normal moving|56.60|35.65|
|Broad signed slip directions|55.75|35.75|
|Near stopped|33.32|29.28|
|Neutral input|4.00|3.89|

Moving limiter work is about37% lower in this environment. Both remain O(1), without wheel or force
iterations. This is function timing including call overhead, not whole-game FPS or all-device evidence.

## Regression scope

Independent frame projection verifies the fixed physical q against its quadratic upper bound across
1500 tilted/signed cases and complete permitted paths. Tests distinguish already-inside from outside
and the positive-minimum case. Request sweeps prove monotone nonexpansive clipping, with neutral and
one-sided correction. Retained all-nine actual substeps test D12/18/20 at60/120/240Hz. Existing wheel,
straight pinned-reference, torque, recovery and HUD tests remain; only121-specific obsolete angle/
component claims are superseded. Complete-suite and release evidence follow the validation record.

Local final check:859/859 tests passed with pinned b70 reference, no failures/skips/todo. A local
M9.27 browser screenshot confirmed the retained four steering rows and player defaults; browser
error log was empty. This is display/runtime observation, not a human handling acceptance test.
