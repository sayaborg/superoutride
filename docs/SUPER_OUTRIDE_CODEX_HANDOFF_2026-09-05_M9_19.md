# SUPER OUTRIDE — M9.19 Continuation Handoff

Date: 2026-09-05. Navigation context only; the repository is the sole project authority.

## Start here

Re-fetch main, open PRs, exact-head CI and Pages before work. Read AGENTS.md, README.md,
docs/README.md and newest relevant numbered authority. This work started from
`c03dee6a94e2a9009781d98d4758de657eab16da` (M9.18/PR #132); that is a historical base, not a
self-referential final release SHA. Resolve release identity from Git/PR/workflow evidence.

Current handling order: 113 -> 112 -> 111 -> 110 -> 109 -> 108 -> 107 -> 103 -> 101 -> 100 ->
99 -> 98 -> 87, plus retained 78/80 foundations. Read their source, compilers and regression tests.
Read the four frozen Core files before any renderer/metric/topology-affecting proposal.

## M9.19 scope

`docs/113_m9_19_progressive_drift_calibration.md` changes browser calibration only:

```text
G1.20 / P8 / S1.00; ENG1, D12, M60, ACT0.25 unchanged
G1.20..4.00 step 0.20; P8..60 step 2; S1.00..2.00 step 0.20
S<=G, 2160 valid combinations
G/S cycles skip invalid pairs while preserving the other displayed axes
```

Small-slip normalized stiffness remains 18.9, equal to old G3/P20. Peak capacity is lower; deep
S remains 1. The constitutive tire law, CG-travel steering, actual-RPM automatic gearbox, all
nine immutable profiles, actuation, input gestures, suspension, recovery, camera and renderer
are unchanged. Do not describe this as a new tire model, drift controller or vehicle-specific fix.

## Evidence to preserve

`tools/drift-control-probe.mjs` and `tests/m9-19-progressive-drift-calibration.test.mjs` use the
ordinary production solver and a time-only schedule, not a drift seed or feedback. Initial normal
motion -> partial-brake entry -> about 54 km/h 10deg -> 15 deg -> 10 deg -> neutral exit works in both
directions at 60/120/240 Hz. The original M9.18 seeded 25-30-25 ENG3 regression remains separate and
required. The old browser default does not enter this new input-only drift schedule.

Six sampled partial-brake entries and nine +/-2-percentage-point control-offset cases are tested.
Rate-limited pointer release is tested separately. The all-nine digital finite/recovery check is
not a keyboard-drift certificate. Trace forks copy states reached by normal inputs only.

```bash
npm ci
npm test
node tools/drift-control-probe.mjs --hz 60 --out drift-control.json
```

## Still unresolved

Human touch/keyboard feel; broader speed/gear/state margins; +/-5-degree perturbations; all-nine
vehicle drifting; forward drift distance on actual courses; high-speed cornering with lower peak
G; large-yaw visual perception; strong-brake lock/spin; ABS/TCS and repeated wheelie/stoppie overturn.
The round trip has an entry overshoot near 21.4 deg; it is not an instantaneous 10 deg capture. The
40-second shallow-cornering preparation is diagnostic, not a prescribed player technique or proof
of an exact steady grip circle. Do not infer solved handling from a successful trace.

## Release contract

Follow AGENTS.md exactly: feature branch, full exact-head CI, standalone record per validation
policy, full record-inclusive CI, re-fetch main, pure fast-forward with force=false, identity
main=PR head=merge SHA, same-SHA main CI/Pages. Historical evidence is immutable. Do not release
an unvalidated head or keep temporary transport workflow changes in the final PR diff.
