# M9.17 Direct Robotized MT

Status: normative scoped powertrain authority. Handling remains `DEV_UNCALIBRATED`.

## 1. Purpose and supersession

The product uses an ideal robotized MT: automatic selection of forward ratios, instantaneous
shifts, no clutch simulation and no deliberate interruption of drive. This replaces M9.0/M9.8
and the transmission-preservation clauses of M9.16 only for RPM, shift timing, torque-curve
endpoints and rev limiting. M9.16 engine multiplier ownership, choices, controls and lifecycle
remain current. M9.15 tires, M9.11 steering, touch, camera, renderer and topology are unchanged.

The predecessor contained no fluid torque-converter model. Remove its artificial launch RPM slip,
independent RPM response lag, shift timer/direction and shift-drive cutoff rather than retaining
converter/clutch substitutes under new names.

## 2. Architecture decision gate

1. `src/physics/automatic-powertrain.ts` owns ratio selection, curve sampling and wheel torque.
2. Reuse the existing driven-wheel observation, profile ratios, ENG multiplier and wheel/contact
   force route. No second longitudinal force or vehicle-speed authority is permitted.
3. Gear is the only dynamic powertrain memory. ENG remains calibration. RPM and sampled/delivered
   torque are derived output caches; the next solve does not read them as inputs.
4. No vehicle-ID, CAR/BIKE, drive-layout, route, camera or drift-dependent control branch is added.
5. Retain positive authored torque samples and all ratios. Delete synthetic zero-torque redline
   endpoints. A single generic limiter replaces overlapping curve/cutoff mechanisms.
6. No body/wheel speed clamp, engine rotor, clutch, cooldown, slip detector or hidden assist is added.
7. Unit tests cover direct RPM, no-stall launch, ratio-aware hysteresis, no shift cut and limiter
   continuity. A 20-second low-speed full-input integration reproduces the actual former hunting
   condition, without speed resets. Complete repository regression and exact-head CI remain required.

## 3. Direct drive

At each ordinary substep, with the retained magnitude convention for the forward-only driveline:

```text
n = abs(drivenWheelOmega) * gearRatio[gear] * finalDriveRatio * 60 / (2*pi)
```

Shift at most one adjacent gear per substep from this RPM. Recompute RPM with the selected ratio
in the same call. Do not interpolate ratios, wait, blank drive or modify wheel angular speed.
The existing dt argument validates the mechanics step contract; there is no time integration in
this powertrain. Engine inertia and shift-synchronization impulses are deliberately not modeled.

At rest, derived RPM is zero. The curve lookup uses `max(idleRpm,n)` so finite low-speed torque
can launch the car without a stall or clutch operation. This explicit game approximation is not
an idling engine connected through simulated slip. Throttle zero still delivers zero torque.

## 4. Automatic gear selection

```text
n >= upshiftRpm and a higher gear exists -> gear + 1
n <= downshiftRpm and a lower gear exists -> gear - 1
otherwise -> retain gear
```

The same rule applies during wheelspin. No gear-hold drift mode is introduced.
Compilation requires positive strictly decreasing forward ratios and:

```text
0 < idleRpm < downshiftRpm < upshiftRpm < redlineRpm
for each adjacent pair q = nextRatio/currentRatio:
  downshiftRpm < upshiftRpm*q
```

The second inequality prevents an upshift/downshift at a threshold from immediately requesting
its inverse at unchanged wheel speed. It does not claim to prevent every possible physical gear
oscillation under changing wheel load. Current nine-profile RPM thresholds already satisfy this
stronger condition and are retained, rather than tuned to hide the former drive interruption.
Testarossa retains upshift 6450 rpm, downshift 2700 rpm, redline 6800 rpm.

## 5. Positive engine characteristic and one limiter

All nine production profiles retain their positive piecewise-linear torque samples. Remove the
artificial last redline sample with torque zero. Below idle, use idle torque; above the last
positive sample, hold that sample. This short endpoint extension is an explicit approximation,
not new measured engine data. Do not invent horsepower to make a drift test pass.

The only rev-limiter law is an averaged, state-free C1 fuel cut:

```text
t = clamp((n - upshiftRpm)/(redlineRpm - upshiftRpm), 0, 1)
limiter = 1 - t*t*(3 - 2*t)
baseTorque = samplePositiveCurve(max(idleRpm,n)) * ENG
wheelTorque = throttle * baseTorque * currentTotalRatio * efficiency * limiter
```

Full output remains available through upshift RPM. Limiting approaches zero smoothly at redline,
is zero above it, and recovers immediately as RPM falls. Thus the curve itself stays positive at
redline, while delivered positive drive is zero there due to exactly one limiter. No separate
linear redline scale, zero curve tail, pulsing timer or limiter state survives. Normal threshold
shifts move RPM below the limiting interval and deliver torque in the same substep.

The limiter removes positive engine drive; it does not actively brake a mechanically overrun
wheel or clamp the RPM display. External motion may therefore exceed redline. This is an ideal
power-delivery model, not a full engine-inertia or overrev-damage simulation.

## 6. Retention and exclusions

ENG choices remain 1 / 1.5 / 2 / 3 / 4, initially 1, with K/touch/HUD unchanged. Recovery and vehicle
replacement preserve ENG; fresh page/course instances and rivals retain their existing defaults.
No G/P/S range, tire force, steering transform, input response, suspension, camera or rendering
rule changes. G3/S3 remains a test-only calibration; browser S still ends at 2.00.

Removing drive interruption can expose more of the configured engine output. Extreme multiplied
power with sustained full steering and reversal can exceed the existing suspension travel model;
that guard must not be weakened or silently converted into a drift assist. Finite-response tests
only certify their stated input envelope. Neither this release nor its hunting test certifies
pleasant sustained circular drifting or a wider high-power suspension envelope.

## 7. Validation contract

The historical M7.0/M9.16 assertions that demand shift-drive zero or independent RPM memory are
superseded by sections 3-5. Replace those expectations with causal no-cut/direct-RPM checks; retain
all other valid regressions. New tests must include positive curve endpoints, C1 limiter, adjacent
ratio hysteresis, launch, ENG isolation/lifecycle, all-nine-profile drive checks and the actual
Testarossa G2/P24/S2 ENG3 D12/M60, 10 m/s, full DIRECT steering/throttle, 20-second hunting probe.
No velocity normalization, forced wheel speed or recovery is allowed in that probe.

A standalone validation record is required because this milestone changes normative dynamics.
Add it only after complete implementation/documentation exact-head CI passes. Then obtain a
fresh complete validation-inclusive CI and release that exact SHA by pure fast-forward main,
followed by same-SHA main-push build and Pages deployment under AGENTS.md.
