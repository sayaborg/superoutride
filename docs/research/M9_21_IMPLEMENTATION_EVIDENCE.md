# M9.21 — Implementation evidence and scope

2026-09-06. Research/evidence, not a second design authority. Current design: document 115.
Historical implementation base: e03b501e07d7770563a6f58933e202e2e1ccaff1.

The GitHub connector provided exact source because direct container Git networking failed DNS.
A temporary branch-only read-only workflow exported the unchanged base source, installed locked
TypeScript and Node24.20.0. Local git HEAD matched that base. The source-export workflow and any
transfer payload are removed before implementation-inclusive release validation.

The complete Node24 local suite passed 703/703 (no fail/cancel/skip/todo) after implementation.
A foreground tool timeout interrupted earlier whole-suite attempts; those cancelled runs are NOT
counted as green. An isolated current-turn process completed the entire suite. Two initial unit
fixtures incorrectly expected a torque limit despite the finite-step wheel-inertia allowance; they
now start on the slip boundary. The original strict raw requested/delivered equality exposed floating
sum roundoff, corrected by deriving total delivered as requested minus the two actual reductions.
No physics regression was weakened to obtain these results.

## Reproducible raw/protected comparison

Run `node tools/torque-protection-probe.mjs --hz 120 --out protection.json` after the ordinary build.
The recorded 36 summaries are in [M9_21_TORQUE_PROTECTION_BASELINE.json](M9_21_TORQUE_PROTECTION_BASELINE.json).
Nine catalog vehicles, raw/protected, drive/brake, 54 km/h start, ENG1, unchanged browser tire default,
0.5s coast then digital full pedal, maximum6s, brake ends below0.5m/s or at overturn. No gameplay
recovery or mid-run state seed. Distances below INCLUDE the initial0.5s coast. Raw overturn rows are
not stopping-distance measurements. MaxBrakeSlip includes low-speed ABS-bypass/stop samples; it is
not a violation measurement of the moving slip envelope.

| Bike | Protected 6s drive exit (km/h) | Protected brake distance (m) | Brake time including preparation (s) | Protected front/rear lift | Raw full-brake overturn |
|---|---:|---:|---:|---|---|
| VFR750R | 161.39 | 22.76 | 2.400 | 0 / 0 | True |
| R80_GS_PARIS_DAKAR | 111.91 | 24.39 | 2.617 | 0 / 0 | True |
| FXRT_SPORT_GLIDE | 107.22 | 21.65 | 2.250 | 0 / 0 | True |
| PX200E_ARCOBALENO | 76.05 | 24.08 | 2.575 | 0 / 0 | True |

All36 rows had no runtime exception. All18 protected rows avoided overturn. The all-four-bike
regressions additionally ran60/120/240Hz, required zero geometric lift in those specific drive/brake
cases, useful acceleration/stopping and zero support-infeasible time. Raw VFR overturn remains a
causal control, and slip-only protection still permits rear lift. Unit tests independently cover
AWD/ABS station isolation and torque-budget conservation.

Protected current product rival tests completed mountain/Tsukuba/FISCO with their existing lateral,
slip, progress and no-recovery assertions. Raw research power-drift tests remain unprotected and are
not claims about the newly protected product. All9 launch and effective-pedal overlap/recovery tests
pass with explicit catalog policy.

## Counterexamples and remaining work

A supplementary27-case input-error sweep (nine profiles, grades -15%/0/+15%; flat case on SAND,
ENG2, steering reversal plus brake) remained finite, with no bike support loss in those samples,
but produced large lateral spins. A high beta near a stop is not itself a high-speed spin metric;
large-angle cases at nontrivial speed also occurred. TCS/ABS/support protection is NOT ESC and is
not certified to eliminate arbitrary yaw instability. This is retained as a limitation, not hidden
by an angle clamp, forced recovery or tire retuning.

The support barrier is a local tangent approximation and the bounded search certifies only the
selected local margin. Inherited infeasible states, arbitrary crests/terrain, the full five-axis grid
and human handling are not globally certified. Raw tire calibration remains DEV_UNCALIBRATED and
paused. The 8% support reserve is an explicit initial protection calibration, not measured tire data.

Final implementation-inclusive CI, immutable validation record, record-inclusive CI and exact
main/PR/Pages identity must be resolved from Git/PR/workflows; the local results do not replace them.
