# M9.19 — Drift Entry and Angle-Roundtrip Calibration

Status: current scoped browser tire-calibration and diagnostic acceptance authority.
Handling remains `DEV_UNCALIBRATED`; this is not a claim of completed human drift handling.

## 1. Decision and supersession

Use `G1.50 / P8% / S1.20` as the browser player's initial tire calibration, with the retained
`D12 / M60 / ACT0.25 / ENG1` starting values. Extend the existing G and P selectors downward so the
candidate and nearby comparisons are actually selectable. Retain every former comparison value.

This supersedes M9.15 only for browser tire defaults and the selectable domain, and M9.12/M9.15
only for cycling across combinations that would violate `S <= G`. It does not change a tire law.
M9.18 `C=k*Nactual`, M9.15 P-to-2P falloff, radial saturation and force direction, M9.11 CG-based
steering, M9.17 actual-wheel-RPM automatic shifting, all profiles and all input-response laws remain
unchanged. No file under `src/physics` changes. Rivals retain compiled profile defaults.

The earlier G1.50/P10/S1.20 diagnostic could enter and increase drift angle but did not preserve
its shallow branch during a 15-to-10-degree return. A narrower peak-slip calibration is the smallest
candidate that passes the ordinary-input roundtrip below. No gearbox, front-axle steering transform,
yaw assist, drift mode, state injection or new tire parameter is required for that tested case.

The older navigation lists in AGENTS.md and the M9.18 handoff predate this scoped decision. Their
process and retained architecture contracts remain binding; this document, current source/tests and
the current documentation index own the new browser calibration. Do not rewrite historical records.

## 2. Architecture Decision Gate

1. Owner: browser calibration/defaults/cycling belong to `src/browser/tire-friction-selection.ts`.
   The experiment is a read-only `tools` consumer; regression acceptance belongs to tests.
2. Existing primitives: the three vehicle-owned tire scalars already express the complete change.
3. No duplicate authority: G/P/S labels remain derived. No extra vehicle, tire, wheel or input state
   is added; recovery and replacement retain the existing calibration object semantics.
4. No product branch: mechanics stays common across vehicle, drive layout, course and input device.
5. Simpler solution: recalibrate an existing constitutive law before replacing it or adding control.
   Cycling selects an admissible value of the requested axis, rather than silently changing another.
6. Invariants: world-state dynamics, contact and wheel-root properties, scalar count, frozen renderer,
   metric presentation, open geometry and explicit topology are unchanged.
7. Evidence: ordinary rolling-start entry/angle-roundtrip/exit, signed step refinement, a finite
   entry rectangle, temporary input errors, selector domain/atomicity and all-nine moderate-input
   probes are executable. All retained repository tests remain required.

## 3. Calibration meaning and tradeoffs

At material gripFactor=1 the effective normalized small-slip stiffness is
`K = (2-rhoKnee)*G/P`. The common rhoKnee is 0.74.

```text
old browser G3/P20/S1:       K = 18.9,   S/G = 1/3
preceding G1.5/P10/S1.2:     K = 18.9,   S/G = 0.8
new browser G1.5/P8/S1.2:    K = 23.625, S/G = 0.8
```

The chosen candidate is therefore 25% stiffer near zero than the old browser default, not identical
in initial slope. Peak capacity is halved; the deep-slide coefficient increases from 1 to 1.2. None
of these changes is described as universally more realistic or as free speed preservation.

The pure-lateral peak occurs at slip 0.08 and the sliding plateau starts at 0.16 (about 4.57 and
9.09 degrees using the ordinary-speed atan conversion). Body sideslip is a different observation:
axle position, yaw rate, steering and combined slip determine actual tire slips. Moving the plateau
below the tested shallow-drift rear-slip region leaves more room for the angle return, without
changing the force function or adding a falloff-width scalar.

Lower peak grip also reduces the available high-speed cornering envelope. Existing course/profile
regressions remain required, but a finite numerical regression is not a full human playtest of all
courses at all speeds. This remains a diagnostic calibration, not a final vehicle-performance freeze.

## 4. Selectable domain and independence

```text
G = 1.20 / 1.40 / 1.50 / 1.60 / 1.80, then 2.00..4.00 in 0.20 steps
P = 6..60% in 2% steps
S = 1.00..2.00 in 0.20 steps
```

Only combinations with `0 < S <= G` are selectable. There are 16 G choices, 28 P choices and 6 S
choices, giving 2,324 admissible calibrations and 364 rejected combinations in the rectangular grid.

H/click-G cycles through G choices compatible with the *current absolute S*. G/click-S cycles
through S choices compatible with the *current G*. J/click-P cycles all P choices. Values remain in
ascending order with ordinary wrap. For example, G4/S2 wraps G to G2, not to an invalid G1.2; G1.5/S1.4
wraps S to S1.0. No second browser selection state is introduced.

Changing G still preserves displayed P and absolute S. Changing P preserves G and S. Changing S
preserves G and P. Explicit attempts to select an invalid pair still throw before any mutation;
the browser does not clamp S down when G changes or raise G when S changes. At exact S=G only
floating-point roundoff within the existing equality tolerance may normalize the ratio to one.

The M9.10 historical tire anchors and the M9.15 historical curve assertions remain explicit test
fixtures, rather than being silently reinterpreted as the new browser default.

## 5. Ordinary-input diagnostic

`tools/drift-entry-probe.mjs` imports the compiled production solver and the actual browser defaults.
It starts an ordinarily rolling Testarossa at 15 m/s on the retained flat asphalt fixture. It assigns
no initial drift, yaw rate or gear. After construction it never overwrites physical state, fixes
speed, locks gear, invokes recovery or feeds observed beta back to its input schedule.

Rounded diagnostic commands (not product targets) are:

```text
preparation: steering=0.69,  throttle=0.15
low hold:    steering=0.69,  throttle=0.27
high hold:   steering=0.745, throttle=0.36
```

The elapsed-time-only trace is:

```text
0..30 s:       ordinary shallow-circle preparation
30..30.35 s:   steering retained, throttle=0, brake=0.30
30.35..50 s:   low hold
50..52 s:      linear low-to-high input ramp
52..75 s:      high hold
75..77 s:      linear high-to-low input ramp
77..105 s:     low hold again
105..109 s:    release to neutral through the existing actuator release rates
```

Held inputs use DIRECT, as current analog touch does. Final release uses RATE_LIMITED neutral, not
an instantaneous road-wheel or pedal reset. Steering sign is reversed for the symmetric case.
The run happens to remain in first gear; ordinary automatic shifting stays active throughout.

At 60 Hz the observed low/high/returned-low windows are approximately 10.13/14.96/10.15 degrees,
with speed 15.05/14.98/15.05 m/s. One second after release speed is approximately 14.45 m/s, beta is
within one degree and yaw rate is below 0.05 rad/s. These are observations, not injected targets.
The schedule includes long holds for convergence measurement; it does not certify rapid settling
or subjective response at every point during the ramps.

Run after the normal build:

```bash
node tools/drift-entry-probe.mjs
node tools/drift-entry-probe.mjs --trace > drift-entry-trace.json
```

## 6. Executable acceptance

`tests/m9-19-drift-entry-roundtrip.test.mjs` requires:

- both turn signs at 60/120/240 Hz enter from shallow motion, hold near 10 degrees, move to 15,
  return near 10 without unwanted grip exit, then release near straight motion;
- low/high/returned-low mean angle within 0.5 degree, beta window span below 0.35 degree, mean speed
  within 0.25 m/s of 15 and speed span below 0.15 m/s;
- beta remains above 7 degrees in magnitude throughout the angle-roundtrip, with no sampled rear
  lock, finite state and ordinary asphalt support;
- the 12 sampled combinations of brake amount 0.20/0.25/0.30/0.35 and duration 0.20/0.30/0.40 s
  all enter and retain the low branch at 60 Hz; this samples a rectangle, not every point inside it;
- temporary one-second +/-0.02 steering or throttle errors preserve slide and return to the low
  branch under restored input; this is not a guarantee under a sustained offset or arbitrary noise;
- G/S cycling skips incompatible choices, preserves other axes and rejects explicit invalid pairs
  atomically; all 2,324 admissible scalar wheel probes are finite and deterministic;
- all nine profiles consume the new browser calibration through the same solver in a stated
  four-second moderate-input probe, without geometry or model-specific patches;
- the diagnostic remains a consumer and no product solver imports its commands or adds feedback.

M9.18's seeded G3/P24/S1 ENG3 25-to-30-to-25-degree regression stays unchanged, as do its wheel-lift
and recovery rules. Historical force assertions remain unchanged outside explicitly superseded
browser-default/range assertions. No valid test is skipped or weakened to conceal a failure.

## 7. Limits and next falsification

This establishes one useful numerical entry/angle-return/exit envelope. It does not certify human
keyboard or phone control, all-speed entry, all-nine deep drift, G=S power drift, large disturbances,
ABS/TCS, wheelie suppression or renderer perception. The keyboard still has its original digital
actuator path. This release adds no automatic driver and no claim that an analog trace is a keyboard
playtest. Final timing/error thresholds remain provisional handling criteria.

High-speed course acceptance and actual driving feel must not be inferred from the 54 km/h trace.
Further changes must isolate an observed failing cause, rather than modifying gearbox, steering and
tire shape simultaneously or using a drift detector to hide discontinuities.

## 8. Release evidence

This scoped normative calibration/domain change requires a new standalone validation record under
`docs/validation/README.md`. Add that evidence only after complete exact-head implementation/documentation
CI succeeds, then obtain complete green record-inclusive CI. Re-fetch main, require pure fast-forward,
advance with force=false, verify main=PR head=PR merge SHA, and verify same-SHA main CI/Pages.
