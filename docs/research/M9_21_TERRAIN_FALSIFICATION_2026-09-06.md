# M9.21 — Terrain / grip / combined-input falsification

2026-09-06. Research and measured evidence, NOT new normative authority. Current authority is
`../115_m9_21_torque_protection.md`; handling remains DEV_UNCALIBRATED.

## Baseline and method

Current main was re-fetched as `7489f6fcc9eacdc94b751c2982295f7c111362fe`; open PRs were empty.
Main CI #847 / run 34023251094 had successful build and Pages deployment. Direct container Git
networking failed DNS. Instead the actual same-SHA Pages artifact 9986234220 was downloaded through
the GitHub connector. Its ZIP SHA256 was
`724f598d7f964b1f8de3488831bcd84835481442f9eb0980142ef12c8c8e9a1a`, and its version.txt named that
exact main SHA. Production ESM from this artifact, not an older source snapshot, executed the probes.
The Node24.20.0 executable came from the previously exported toolchain. Public Pages HTTP reads
were unavailable in this session; artifact identity and successful deployment are distinct from a
fresh CDN fetch or interactive browser test.

`tools/torque-protection-terrain-probe.mjs` constructs an ordinary open straight Guide, a broad
supported plane and the real production vehicle. Exact constant-grade readers isolate +10%/-10%
slopes; the crest uses the existing HeightProfile cosine interpolation. Material grip alone changes,
with asphalt rolling resistance .014 retained. This is NOT a wet-asphalt measurement or a SAND preset.
The factor .25 is surface grip, not the final longitudinal tire coefficient (.25*2.50=.625 for the
browser default). All inputs are elapsed-time schedules. No body/ wheel state correction, seed after
spawn, gear lock, recovery, course-following controller or tire retuning is used.

Browser calibration is explicitly the retained GX2.50/PX8%/GY2.20/PY10%/KN.74; stock comparisons use
the catalog's separate construction reference. D12/M60/ACT.25 and ENG1 stay unchanged. The turning
probes are free motion on a wide plane, not validation of useful distance on an authored course.
Steering .35 is a normalized actuator request, not a prescribed road-wheel angle or full keyboard key.
Pedals are digital and use the existing actuator response; steering also uses the existing rate path.

Post-update contacts are sampled at the outer tick rate; control telemetry describes the last
internal substep. Constitutive ellipse/passivity observations are re-evaluated at that sampled
state, not a claim of an exact whole-vehicle energy ledger. Flight duration and support-infeasible
duration are sampled durations, not continuous-time proofs. Captured traces are downsampled to20Hz.
`maxAbsMovingBeta` excludes speeds <=5m/s; `maxAbsBetaAbove15` excludes speeds <=15m/s (54km/h).
The time/speed of the maximum moving beta is also retained. Angle maxima at almost zero speed must
not be confused with a moving spin. On an exception, summary time is the last fully observed tick;
the partially advanced failing update is not labeled a completed step.

## Architecture Decision Gate and change scope

1. Ownership: diagnostics/tests own fixtures, input schedules and evidence; existing production
   torque-protection, tire-wheel and contact/wrench layers retain all mechanical decisions.
2. Reuse: ordinary constructors/update, SurfaceMap/HeightProfile, contact observations and
   evaluateTireForce. The exact-grade test reader isolates slope without changing production height.
3. No duplicated physical state or control authority. Added maxima/durations are diagnostic outputs.
4. No vehicle, course or drivetrain branch is added to any production module.
5. Fixture differences are explicit diagnostic composition data; browser defaults are unchanged.
6. Preserve torque reduction only, station independence, zero unloaded force, dissipative capacity
   ellipse, natural airborne motion, physical qTravel and overturn boundaries, frozen renderer/Core.
7. Regress all-nine finite mechanical cases, neutral-flight A/B identity, truthful infeasible zero
   torque, stress failure reporting, material/grade isolation and diagnostic-domain validation.

Only a reusable tool, new tests and research evidence are added. No src/**, numbered authority,
calibration, powertrain, control gains, Pages workflow, renderer or existing test is modified.
Ordinary test additions under unchanged authority use PR exact-head full CI: no new standalone
validation record is required by `../validation/README.md`. Final release still requires pure
non-force fast-forward and same-SHA main CI/Pages evidence.

## Primary 90-case survey: do not call all 90 successful

The complete compact result inventory is [M9_21_TERRAIN_120HZ.csv](M9_21_TERRAIN_120HZ.csv).
Numeric summaries use six significant digits; error strings are retained. Speed units are m/s,
angles degrees, time seconds. Empty speedAtMaxMovingBeta means no nonzero moving-beta maximum.
`completed=True` means the finite observation window ended without exception/overturn, NOT that
human handling, spin avoidance, support feasibility in all circumstances or course progress passed.
The corresponding CLI regenerates the full-precision JSON, including additional budget observations.

All nine profiles at120Hz, browser tire default, explicit catalog protection, ENG1:

| Case | Inputs/domain | Observed result |
|---|---|---|
| lowGripDrive | grip .25;15m/s;0.5s coast then full throttle;6s total | 9/9 complete, useful acceleration |
| lowGripBrake | grip .25;30m/s;0.5s coast then full brake;10s total | 9/9 complete and <.5m/s at end |
| uphillDrive | +10%;15m/s;full throttle after0.5s;6s | 9/9 complete, useful acceleration |
| downhillBrake | -10%;30m/s;full brake after0.5s;8s | 9/9 complete and <.5m/s at end |
| gripDropBrake | grip1 -> .25 at s=1035;30m/s;brake;10s | 9/9 actually cross the grip boundary and stop |
| turnDrive |30m/s;steer .35 after0.5s;throttle after1.5s;6s | 9/9 complete; moving beta <=4.25 degrees |
| turnBrake |30m/s;steer .35 after0.5s;brake after1.5s;6s | 9/9 mechanically complete; serious yaw excursions remain |
| lowGripReversal |grip .25;30m/s;+.35 steer then -.35 + brake at1.5s;6s | 9/9 mechanically complete; large moving sideslip remains |
| crestCoast |70m/s;2m crest;5s neutral window | 0/9 complete:8 qTravel exceptions,1 VFR overturn |
| crestDrive |70m/s;same crest;throttle after0.5s;5s | 0/9 complete:8 qTravel exceptions,1 VFR overturn |

The72 non-crest rows have no sampled support infeasibility, no overturn/exception and no sampled
geometric lift on the four bikes. This is a finite local envelope, not a new all-terrain promise.
All90 observed prefixes preserve requested/delivered torque bounds, zero unloaded tire force and
nonpositive slip work; the largest re-observed normalized ellipse value is1.0000000000000007
(roundoff above1). Successful stopping alone is not an acceptable yaw-handling certificate.

The8/10s brake windows are diagnostic observation windows, not vehicle performance specifications.
Low-grip reversal does NOT necessarily stop within6s; no stopping-success claim is made for it.

## Moving yaw is the next material handling issue

The following maxima use ONLY samples above15m/s, so they are not near-stop angle artifacts.
At the same input schedule, stock-reference comparisons leave the symptom present. This does not
identify a unique root cause, establish optimal calibration or prove an operator cannot recover.

| Profile | Browser turn+brake | Browser low-grip reversal+brake | Stock turn+brake | Stock low-grip reversal+brake |
|---|---:|---:|---:|---:|
| TESTAROSSA |22.66|78.63|20.21|77.49|
|911_TURBO_3_3|28.02|83.71|34.04|82.64|
|CORVETTE_C4|29.18|76.86|33.23|80.43|
|GOLF_GTI_16V|50.08|76.62|57.39|83.10|
|DELTA_HF_INTEGRALE|47.80|79.50|56.58|83.89|
|VFR750R|108.15|112.02|134.61|113.99|
|R80_GS_PARIS_DAKAR|107.87|118.47|128.01|111.44|
|FXRT_SPORT_GLIDE|119.23|117.80|137.40|111.36|
|PX200E_ARCOBALENO|105.73|134.22|121.72|118.52|

For example, VFR browser low-grip reversal peaks near112.02degrees at18.374m/s (~66.15km/h),
with no sampled wheel lift or support infeasibility. Longitudinal protection is not yaw protection.
This is not repaired here by adding ESC, increasing rear tire grip, reducing all braking, forcing
beta or weakening a valid test. Product controllability remains OPEN rather than reclassified as done.

Next causal comparison should branch a normally reached pre-brake state into coast / partial brake /
full brake / steering release and correction, then compare front/rear slip allocation, load and yaw
moment. Continue through canonical input only. Do not retune paused tires or authorize a new yaw
controller from this report. Actual authored-course and human-input acceptance remain separate.

## Natural crest: a survivable example and a retained counterexample

Crest height nodes are (s,y)=(0,0),(1030,0),(1070,2),(1110,0),(10000,0), on a straight Guide.
Each80m hump uses the existing cosine segments; maximum slope is about7.85%. The70m/s start
(252km/h) is a deliberate stress point, including beyond some catalog vehicles' powered speed range.
Initial speed is diagnostic initialization, not a claim that every engine can attain it.

A separate45m/s (162km/h) comparison on the SAME geometry completes all18 coast/drive runs,
all9 profiles, with actual airborne time followed by recontact. It does not replace or erase the
failed70m/s rows in the primary inventory.

| Profile | Coast airborne s | Drive airborne s | Drive support-infeasible s |
|---|---:|---:|---:|
|TESTAROSSA|.658|.792|0|
|911_TURBO_3_3|.642|.775|0|
|CORVETTE_C4|.683|.775|0|
|GOLF_GTI_16V|.683|.758|0|
|DELTA_HF_INTEGRALE|.675|.725|0|
|VFR750R|.517|.733|.192|
|R80_GS_PARIS_DAKAR|.442|.567|.283|
|FXRT_SPORT_GLIDE|.483|.617|.258|
|PX200E_ARCOBALENO|.267|.267|0|

All18 recontact once without recovery. Powered VFR/R80/FXRT nevertheless leave the local support
margin temporarily. At observed infeasible samples all delivered drive/brake torque is zero;
physical motion is retained. Surviving the maneuver does NOT mean supportFeasible stayed true.
Zero torque cannot necessarily cancel already acquired vertical/pitch motion or surface curvature.

TESTAROSSA and VFR neutral45m/s crest runs are byte-identical with raw/protected policy at each
of60/120/240Hz, after excluding the policy label from diagnostics. Thus neutral-flight motion is
not being secretly held to the road by the protection layer.

Powered VFR45m/s refinement:

| Hz | Final speed m/s | Airborne s | Infeasible s | Recontacts |
|---|---:|---:|---:|---:|
|60|49.294655|.733333|.183333|1|
|120|49.289967|.733333|.191667|1|
|240|49.287045|.733333|.191667|1|

The70m/s TESTAROSSA qTravel failure and VFR overturn both recur at60/120/240Hz, with and without
throttle. Refinement does not make them disappear. These are retained counterexamples, NOT silently
accepted supported states. A separate35/40/45/50/55/60m/s exploratory sweep found a surviving
TESTAROSSA45m/s case and qTravel failures from50m/s for this geometry; that is a sampled boundary,
not a universal safe-speed limit or a full terrain certification.

## Reproduction and evidence limits

```sh
npm ci
npm test
node tools/torque-protection-terrain-probe.mjs --hz 120 --out terrain-browser.json
node tools/torque-protection-terrain-probe.mjs --hz 120 --calibration stock --out terrain-stock.json
node --test tests/m9-21-terrain-protection.test.mjs
```

Programmatic comparisons use exported runTerrainProbe and TERRAIN_CASES, e.g.:

```js
runTerrainProbe(entry, { terrain:'crest', speed:45, kind:'drive', seconds:5, hz:120, capture:true });
runTerrainProbe(entry, { ...TERRAIN_CASES.turnBrake, calibration:'stock' });
```

Local evidence comprised the90-case browser survey (rerun after adding speed-qualified metrics),
36 exploratory/refinement executions and51 crest/stock/A-B executions, with overlapping configurations.
Do not add these together as independent unique conditions. The new targeted suite passed87/87
on Node24.20.0 and the verified published ESM, with0 fail/cancel/skip/todo. This is not a claim that a
local complete source npm build ran: full current-source build/suite must be established by PR CI.
The CSV preserves all90 primary summaries; this report preserves selected additional comparison
summaries and reproduction definitions, not every20Hz trace. Full diagnostic JSON/logs are separate
session artifacts. No historical report, existing regression or immutable validation file was rewritten.

Final release SHA, exact-head full-suite counts and main/Pages outcome belong to Git/PR/workflows,
not a self-updating claim inside this measured baseline report.
