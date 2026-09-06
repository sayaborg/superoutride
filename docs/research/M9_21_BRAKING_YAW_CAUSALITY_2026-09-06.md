# M9.21 — Matched-state braking-yaw causality

2026-09-06. Research/evidence, not new normative authority. Control authority remains document115;
tire authority remains114. Handling is DEV_UNCALIBRATED. Tire calibration and front/rear differences
remain paused. No ESC, yaw target, support calibration or production behavior is changed here.

## Source and question

Re-fetched main: `2341bc0d25ec9bbc91a7da06176bf8325addd791`, open PRs empty, same-SHA main CI#849
and Pages successful. Read the current contract, indexes, M9.21 handoff/115, retained114, current
control/wrench/contact/wheel code and existing diagnostics/tests. This follows the terrain report
[M9_21_TERRAIN_FALSIFICATION_2026-09-06.md](M9_21_TERRAIN_FALSIFICATION_2026-09-06.md), not a new
independent handling target. Direct container Git/raw networking still failed DNS.

Local experiments executed the actual published production ESM in Pages artifact9987244635.
The mounted ZIP hash was independently verified as
`9cb4f4ff1b0d1c70164c9ca8384e348ad982c97f193134e3edb44fdcf98b470c`, with matching versioned SHA.
Node24.20.0 was reused from the earlier exported toolchain; that old source snapshot was NOT used
as the current physics implementation. The existing drift tool was reconstructed locally and its
Git blob hash verified against current `9aa13754c0550dda7e24711710aa3856b69ffb78` before the small
world-reader retention change. The existing terrain tool matched blob
`fce338ac6a39340ea326b98d586e5eb0a0f913b4`. Full current-source build validation belongs to exact-head
PR CI, not to this artifact-based local workspace. No fresh public-CDN or human browser test is claimed.

Question: does the large moving sideslip require power-over, wheel lock, mechanical rack saturation,
or the support controller, and how does changing ONLY the post-prefix driver input affect it?

## Matched input experiment

`tools/braking-yaw-probe.mjs` reuses the existing terrain constructor and fork helper. Each vehicle
starts at30m/s on the same flat asphalt plane, grip multiplier1 or.25, current browser tire default,
ENG1, D12/M60/ACT.25 and its actual catalog protection. First0.5s are neutral; next1s request steering
+.35 with zero pedals. At1.5s, the normally reached state is copied, including real wheel speed,
suspension/body motion, steering actuator and gearbox. There is no equilibrium seed or reset.

Each fork then runs4.5s under one explicit schedule:

| Action | Driver steering request after fork | Brake request |
|---|---|---:|
| holdCoast |+.35|0|
| holdBrake25 /50 /100 |+.35|.25 /.50 /1.00|
| releaseCoast |0|0|
| releaseBrake |0|1|
| delayedReleaseBrake |+.35 for0.3s, then0|1|
| counterPulseBrake |-.35 for0.3s, then0|1|
| reverseCoast |-.35|0|
| reverseBrake |-.35|1|

Throttle is zero throughout all primary trajectories: this phenomenon is NOT power-over drifting.
The primary paths use existing RATE_LIMITED actuators, including the normal brake ramp. Steering.35
is an analog normalized request through that rate path, not a full keyboard key or a road-wheel angle.
It requests4.2degrees of the existing driver offset. Request0 removes that offset but RETAINS the
existing automatic travel-direction steering; it does not force the actual road-wheel angle to zero.

All ten actions for each profile/material pair start with an identical mechanical-state fingerprint.
Parent immutability is checked after every branch. The fork now retains the original world readers:
the earlier flat-only helper created new flat readers, which would invalidate a terrain/grip fork.
Only that diagnostic helper is generalized; no production constructor/integrator is changed.

## Primary results: 180 mechanical completions, not180 handling passes

All9 profiles x2 grips x10 actions were measured at120Hz. All180 finish the observation window with
no exception/overturn, no sampled geometric lift or support infeasibility, no torque-budget violation,
and no wheel-lock sample while speed>15m/s AND abs(beta)<45degrees. Maximum re-observed ellipse is
1.0000000000000009 (roundoff); positive slip power is zero. This does not prove that no substep
violation occurred or that wheel lock never occurs once a vehicle spins sideways/backward.

All180 compact outcomes are preserved in [M9_21_BRAKING_YAW_120HZ.csv](M9_21_BRAKING_YAW_120HZ.csv).
The CSV retains8 significant digits; speeds are m/s, distances metres, and times are seconds AFTER
fork, excluding the1.5s prefix. `completed` means no mechanical error, not human control success.
`max_beta_deg_above15` includes the initial reached state and ONLY samples with speed>15m/s (54km/h).
Missing first-beta15 time means no such threshold crossing while speed>15m/s. Distance is trajectory
length on a wide plane, not useful authored-course distance. Low-grip cases need not stop within4.5s.

At grip1, maximum abs(beta) above54km/h:

| Profile | Coast, steer held |25% brake, held|50% brake, held|100% brake, held|100% brake, request0|
|---|---:|---:|---:|---:|---:|
|TESTAROSSA|1.94|2.65|4.81|22.66|2.24|
|911_TURBO_3_3|2.14|2.94|5.46|28.02|2.41|
|CORVETTE_C4|1.88|2.61|5.66|29.18|2.41|
|GOLF_GTI_16V|1.73|3.14|15.17|50.08|2.48|
|DELTA_HF_INTEGRALE|1.80|3.05|13.91|47.80|2.39|
|VFR750R|2.93|21.07|62.43|108.15|3.07|
|R80_GS_PARIS_DAKAR|2.78|25.80|63.34|107.87|3.11|
|FXRT_SPORT_GLIDE|2.68|26.47|69.38|119.23|2.94|
|PX200E_ARCOBALENO|2.89|23.34|62.61|105.73|2.99|

At grip.25, held-brake25/50/100 have nearly the same moving-beta maximum (within.001degrees across
this inventory). This is NOT equality of entire trajectories: some final speeds differ materially.
For example VFR held25/50/100 maxima are59.14105/59.14150/59.14150degrees, but final speeds are
13.66306/13.12341/13.07622m/s. Requested brake reduction need not alter an already ABS-limited early
phase; it can matter later. Do not interpret25% pedal as25% of available road braking.

## Early VFR mechanism: rear load loss, not rear lock

The grip1 VFR full-brake-held branch begins at27.84518m/s, beta=-2.93115degrees and yawRate=.56616rad/s.
Fresh post-update force observations (N and N*m):

| Since fork | Front load | Rear load | Front Fy | Rear Fy | Front yaw from Fx | Front yaw from Fy | Rear yaw from Fy |
|---|---:|---:|---:|---:|---:|---:|---:|
|0s|1369.83|1338.06|2220.62|2401.50|-.12|1590.51|-1665.58|
|.2s|2322.34|348.39|3004.13|724.86|12.71|2054.74|-525.04|
|.3s|2546.36|183.03|2486.51|383.41|190.08|1639.26|-283.80|
|.5s|2304.12|455.69|1584.06|998.93|911.97|820.29|-741.84|

At.2s, rear Fy per unit load has INCREASED from about1.795 to2.081, while absolute rear Fy fell about70%.
Rear sx=-.0378 is below the .08 magnitude boundary and the wheel is not locked. Thus the early loss
of rear yaw-restoring force is primarily loss of load in this observed episode, not a collapsed
per-load rear tire law or rear lock. Front load increases; with driver offset held, its turning
force rises while rear restoring force falls. Later countersteered front braking contributes a
substantial turn-in yaw moment as well. All these forces are from existing contact geometry/law.

An exact descriptive accounting uses M_i=N_i*m_i at the two endpoints:

```
Delta M_i = (N1-N0)*(m1+m0)/2 + (m1-m0)*(N1+N0)/2
```

Here m_i includes force-per-load AND moment-arm/frame geometry; it is not another tire coefficient.
From0 to.2s, summed contact yaw moment changes from-75.187 to+1542.411N*m, delta+1617.598.
The load term is+2338.593N*m and response/geometry term-720.995N*m (residual<1e-9).
No replacement loads are fed to the integrator. This exact algebra is attribution, NOT an experiment
independently changing only load, nor proof that one mechanism dominates every vehicle/phase.

The first moving beta15 crossing occurs.31667s after braking at25.65361m/s. The automatic steering
reserve first saturates only at.51667s, beta about-48.11degrees. Therefore the early amplification
precedes the rack/self-steer boundary. Raising M alone is not an explanation or a demonstrated fix.
No drive torque is requested. No wheel lock is observed before abs(beta) reaches45degrees.

## Support-controller exclusion and operator margin

The same VFR prefix was compared with the ordinary TWO_WHEEL policy, slip-only ROAD policy and raw
unprotected policy, with the policy chosen explicitly at construction only for this research.
Their pre-brake observed states are identical. In the first.5s of full braking, moving beta maxima
are44.86 /56.80 /56.93degrees. Slip-only and raw cases acquire about.258 /.267s of rear lift, while
TWO_WHEEL has none. At.2s their rear loads are348.39 /0 /0N. Removing support protection does not
remove the yaw growth in this example; it adds support loss. No product OFF selector was introduced.

Immediate steering-request release is a successful comparison, NOT a finished handling solution.
VFR with full brake and the original rate path, varying only the release delay:

| Delay after fork | Grip1 max beta above54km/h | Grip.25 max beta above54km/h |
|---|---:|---:|
|0s|3.07|14.39|
|.05s|4.64|16.44|
|.10s|26.50|18.83|
|.15s|61.28|27.18|
|.20s|65.57|46.07|
|.30s|75.28|60.01|
|.40s|96.88|61.44|

This samples one correction family, not every recoverable input or a universal reaction-time limit.
A fixed strong counter-pulse is not universally better either: at grip1 it gives VFR67.76degrees,
but at grip.25 it gives10.95 versus14.39 for immediate request release. Do not generalize either.

Release also changes the intended path: it does not prove the original corner can still be followed.
For VFR grip1, post-fork path length is29.86m with held full brake versus49.40m with immediate request
release, both ending below.5m/s. Avoiding the spin is not free braking-performance improvement.
No road-width, target-curvature, human steering or same-corner acceptance is closed by this plane test.

## Refinement and input-path checks

At grip1, positive-direction full-brake-held / immediate-release maxima:

| Hz | TESTAROSSA held / release | VFR held / release |
|---|---:|---:|
|60|22.5718 /2.2363|107.7339 /3.0517|
|120|22.6645 /2.2443|108.1501 /3.0684|
|240|22.7121 /2.2489|108.3690 /3.0771|

Both directions were replayed at each rate. Mirroring preserves magnitude and reverses signed beta
and yaw within1e-7. These are finite timestep comparisons, not a formal convergence proof.
With both input channels DIRECT, grip1 values are TESTAROSSA22.8155 /2.4078 and VFR108.3574 /3.2885;
grip.25 values are60.2366 /4.8762 and59.0529 /12.7142. Thus the main contrast does not depend solely
on the rate-limited input path. This is programmatic input, not a browser gesture measurement.
Additional stock-reference comparisons and all recorded configurations can be regenerated with the
exported runBrakingComparison; no tire was tuned to improve a result.

## Decision and implementation boundary

The evidence supports a braking/held-steering interaction mediated by dynamic load and contact
moments, especially clearly in the initial VFR episode. It rejects explanations based solely on
power-over, rear lock, exhausted countersteer range, or an artifact created by support protection.
It does NOT establish a new correct brake allocation, certify controller optimality, or show that
no other input can recover. Low-grip coast reversal itself can also generate large sideslip.

Do not patch this by increasing rear G, enlarging M, adding yaw damping, raising the bike reserve
until it secretly becomes a lateral-control target, or silently changing ABS to a combined-slip
strategy. Any new braking/steering feasibility policy needs its own Decision Gate and evidence
that it preserves useful braking AND requested course curvature. Those choices remain open.
Current TCS/ABS/support law is retained unchanged; tire calibration stays paused.

Architecture Decision Gate for THIS diagnostic change:
1. Tools/tests own fixtures and observation; existing mechanics own forces and motion.
2. Reuse terrain fixtures, forkProbe, evaluateTireForce and momentAboutCg; no controller abstraction.
3. State is copied only to branch a reached trajectory; observations never feed back.
4. No product/vehicle/route branch is introduced below composition.
5. Independent input schedules and immutable shared reader references express the comparison.
6. Preserve torques, tire law, signed roots, suspension/recovery, state ownership and all Core invariants.
7. Regress world-reader retention, parent nonmutation, force attribution, replay identity, symmetry,
   early load/moment sequence and finite signed torque budgets; retain earlier raw/terrain tests.

No src/**, numbered authority, tire/steering/engine/profile/calibration or existing regression is
changed. The fork tool now preserves its input world; current handoff gains navigation links only.
This ordinary diagnostic/test extension under unchanged authority requires exact-head complete CI,
not a new standalone validation record (`../validation/README.md`). New causal comparison assertions
record this current uncalibrated behavior; a later authorized handling change may explicitly
supersede them. They are not a perpetual requirement that the game spin under braking.

## Reproduce and preserve

```
npm ci
npm test
node tools/braking-yaw-probe.mjs --hz 120 --out braking-primary.json
node tools/braking-yaw-probe.mjs --id VFR750R --capture --out vfr-traces.json
node tools/braking-yaw-probe.mjs --apply-mode DIRECT --out braking-direct.json
node tools/braking-yaw-probe.mjs --calibration stock --out braking-stock.json
node --test tests/m9-21-braking-yaw.test.mjs
```

Examples for supplementary comparisons:

```js
runBrakingComparison(entry, {hz:240, direction:-1, actions:['holdCoast','holdBrake100','releaseBrake']});
runBrakingComparison(entry, {grip:1, correctionSeconds:.1, actions:['delayedReleaseBrake']});
runBrakingComparison({...entry, torqueProtection:ROAD_TORQUE_POLICY}, {seconds:.5, actions:['holdBrake100']});
```

Primary inventory:180 forks. Supplementary inventory:37 comparisons containing69 forks, some
repeating primary cases. Targeted tests also replay configurations. Do not sum these as unique
conditions. Complete primary/follow-up JSON, run logs and the supplementary driver are in the
session evidence ZIP; repository CSV/report retain all primary compact outcomes and selected force/
delay/refinement results, not every full-precision trace. Primary JSON SHA256:
`2cce90cf0f49e76a6afdb93d3e207ba7851fb2b82b05c0e0f0574edfee5b3ca5`.
Follow-up JSON SHA256:
`12709051cd601e751a4f759cb047d9e79a3419e2cdc36ef52995779b409d4320`.

Observations are outer-tick samples after integration; control telemetry is the final substep.
Contact yaw excludes wheel-inertia reaction; these are not an exact integrated body-wrench or
whole-vehicle energy ledger. Optional traces are20Hz, while maxima/thresholds inspect every outer
tick. Aborted timeout attempts are not green runs. Final exact-head full CI, main/PR/Pages identity
and local test counts are recorded in the release PR, not by rewriting historical validation evidence.
