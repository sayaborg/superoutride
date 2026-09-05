# M9.19 — Progressive Drift Calibration

Status: current scoped browser tire calibration and handling-diagnostic acceptance authority.
Handling remains `DEV_UNCALIBRATED`.

## 1. Decision and scoped supersession

Change the browser player starting calibration from G3.00/P20/S1.00 to **G1.20/P8/S1.00**.
Retain ENG1, D12, M60 and ACT0.25. Extend G downward to 1.20 and P downward to 8%; retain all
previous choices. Only physically valid pairs S<=G may be selected. Cycling skips invalid choices
without changing another axis; direct invalid requests still throw before mutating calibration.

This supersedes M9.15's starting G/P, M9.14's lower G/P bounds and the later statements that
preserved those exact browser values. The absolute-S meaning and three-scalar calibration remain.
M9.18 C=k*N, M9.15 P-to-2P smoothstep, M9.11 CG-travel steering, M9.17 wheel-RPM automatic shifts,
M9.13/M9.14 touch and all physical profile values remain unchanged. There is no new force law.

M9.18's seeded G3/P24/S1 ENG3 regression remains required. Its numerical seed is not the browser
default, and its 25-to-30-to-25-degree evidence is not replaced by the new input-only diagnostic.

## 2. Architecture Decision Gate

1. Owner: `src/browser/tire-friction-selection.ts` owns the browser calibration choices/defaults
   and their mapping to the existing vehicle calibration. Tests and `tools/` own diagnostics.
2. Existing primitives: the same three scalar tire calibration, ordinary canonical inputs and
   production solver express the improvement. No controller or tire-shape parameter is needed.
3. Authority: G/P/S remain derived meanings; no second stored G, P, S, slip target, force or gear
   truth is introduced. Invalid selection filtering reads current calibration, not browser state.
4. Branches: no vehicle, drive-layout, drift, course or device-specific mechanics branch is added.
   The nine immutable production profiles and rivals' construction defaults remain unchanged.
5. Simpler composition: improve the browser calibration before changing constitutive laws,
   steering geometry, shift logic, engine output, input devices or body degrees of freedom.
6. Invariants: retain load homogeneity, force passivity, friction bound, unique wheel root,
   suspension guard, permitted wheel lift, world coordinates, frozen renderer and topology.
7. Evidence: exact small-slip equivalence, valid selector traversal, old-default negative control,
   unseeded input-only entry/angle round trip/exit, sampled input margins and complete regressions.

## 3. Calibration meaning

For the common normalized tire, with browser P expressed as a fraction:

```text
K = (2-rhoKnee)*G/P
small-slip demand = N*K*(sx,sy)

old: (2-0.74)*3.00/0.20 = 18.9
new: (2-0.74)*1.20/0.08 = 18.9
```

Thus both longitudinal and lateral infinitesimal response remain unchanged at equal load and
material. The peak capacity is reduced to 40% of the old default, while absolute deep-slide S=1
is unchanged. Post-peak ratio rises from 1/3 to 5/6. Peak slip moves from 20% to 8%; the fixed
post-peak interval moves with it from 20-40% to 8-16%. No independent transition-width knob is added.

This is not equal handling at all slips, a real-tire measurement claim, or free cornering capacity.
Large-input response, acceleration traction and high-speed cornering limits change. Lower peak G
can require slower entry into existing corners. Keeping initial slope is not keeping maximum grip.
Human evaluation must include ordinary driving and high-speed courses, not only the flat probe.

## 4. Browser domain and selection behavior

```text
G: 1.20..4.00 in 0.20 steps  (15 choices), default 1.20
P: 8..60% in 2% steps       (27 choices), default 8%
S: 1.00..2.00 in 0.20 steps (6 choices), default 1.00
valid pair: 0 < S <= G
```

There are 80 valid G/S pairs and **2,160** valid G/P/S combinations. The 270 pairs-with-P having
S>G are invalid; this is no longer a full Cartesian product. All 1,386 previously exposed valid
combinations remain available.

G cycling preserves current absolute S and P and visits only G>=S. S cycling preserves current G
and P and visits only S<=G. P cycling is independent. For example G4/S2 cycles to G2/S2, not G1.2;
G1.2/S1.2 cycles S to 1.0. To reach G1.2 from S2, first lower S. Do not silently lower S when G
changes, raise G when S changes, or let the keyboard/touch cycling path throw on a known invalid
next item. Direct APIs retain their rejection contract. Equality within existing 1e-12 browser
roundoff tolerance is accepted, and only its computed ratio is normalized to at most one.

The existing shared keyboard/touch adapter consumes the same filtered next-choice functions.
Calibration changes still cannot change world motion at the instant of selection. Recovery and
vehicle replacement retain the same calibration object-lifecycle contract; no second selection
state is added. Keys remain H=G, J=P, G=S and K=ENG.

## 5. Executable handling diagnostic

`tools/drift-control-probe.mjs` imports compiled production modules. It does not copy the tire,
contact, powertrain or steering equations. A flat asphalt fixture starts a normal Testarossa at
15 m/s with zero lateral velocity, yaw rate and steering. It uses current browser defaults and
ENG1. The initial speed is fixture initialization, not launch-from-rest evidence.

One elapsed-time schedule supplies canonical DIRECT inputs:

| Time (s) | Steering | Throttle | Brake |
|---|---:|---:|---:|
| 0-40 | 0.63 | 0.20 | 0 |
| 40-40.4 | 0.63 | 0 | 0.20 |
| 40.4-62 | 0.63 | 0.38 | 0 |
| 62-64 | linear 0.63 -> 0.67 | linear 0.38 -> 0.50 | 0 |
| 64-84 | 0.67 | 0.50 | 0 |
| 84-86 | linear 0.67 -> 0.63 | linear 0.50 -> 0.38 | 0 |
| 86-110 | 0.63 | 0.38 | 0 |
| 110-113 | 0 | 0 | 0 |

Mirroring reverses steering only. The 40-second preparation is ordinary shallow cornering, not an
assertion of exact steady-state or a mandatory player technique. After spawn there is no speed,
beta, wheel-speed, gear, load or yaw overwrite, no feedback controller and no gameplay recovery in
this probe. Gear 2 during measured drift is observed, never held. Branching margin experiments
fork an independently copied state reached by these ordinary inputs; they do not invent drift seeds.

At 60 Hz, measured window means are approximately:

```text
55-62 s:   beta=-10.16 deg, speed=14.96 m/s
76-84 s:   beta=-15.02 deg, speed=14.90 m/s
100-110 s: beta=-10.14 deg, speed=14.95 m/s
111-113 s: abs(beta)<1 deg, abs(yawRate)<0.05 rad/s, speed>13.5 m/s
```

The entire trace peaks near 21.44 degrees during entry; it does not stay near its final angle
throughout the transient. Both signs at 60/120/240 Hz must meet the same window bounds. The
15-to-10 reduction must remain beyond 5 degrees rather than inadvertently terminate the slide.
Speed is 14-16 m/s in the three drift windows, rear sx>0.025, and the entire trace must retain
support, avoid rear lock, keep abs(beta)<30 degrees and speed>13.5 m/s.

The identical schedule at the retired G3/P20/S1 default stays below 8 degrees throughout and fails
the requested drift. This negative control attributes the changed outcome to calibration, not an
unrelated new controller or an arbitrary successful initial seed.

The source-level regression additionally checks:

- entry brake magnitudes 0.10/0.20/0.30 crossed with durations 0.30/0.40 seconds (six samples);
- reached low drift under steering and throttle offsets -0.02/0/+0.02 (nine samples);
- ordinary rate-limited neutral after actual pointer release, separately from held DIRECT neutral;
- all nine profiles under a six-second digital input/recovery probe with existing guard behavior;
- all current selector transitions, small-slip equivalence and retained complete repository tests.

The sampled rectangles are not proofs for every point between samples or every starting state.
Telemetry is read-only at 10 Hz, with full-tick extrema/lock/support counts. Tire forces in saved
rows are re-observed at the sampled state; they are not a second integration force authority.
Distance is cumulative trajectory length, not forward drift flight or successful course traversal.

Run after building:

```bash
node tools/drift-control-probe.mjs --hz 60 --out drift-control.json
node tools/drift-control-probe.mjs --hz 120 --mirror
node --test tests/m9-19-progressive-drift-calibration.test.mjs
```

## 6. Explicit limits and next work

This establishes an ordinary-input path that enters, increases angle, decreases angle without
terminating, and exits. It does not establish a globally continuous equilibrium map, all possible
entry/exit techniques, every speed/gear, robust +/-5-degree state perturbations, all-nine-vehicle
drift, or GT2-like human feel. The six-second digital check proves finite/recovery behavior, not
human keyboard drifting or successful execution of the analog schedule through digital inputs.

The existing 64-CSS-px gesture and keyboard actuator response are unchanged. Human tests must
still evaluate control resolution, quick correction, camera perception, curve radius and useful
course distance. Large-yaw raster perception is not repaired by calibration. No renderer invariant
is changed. No measured-beta controller, yaw torque, hidden speed preservation or new state is added.

Strong-brake rear lock/spin and repeated wheelie/stoppie overturn remain separate known work for
later ABS/TCS/control consideration. The successful partial-brake entries do not erase those
limitations. Current overturn recovery and qTravel guards remain unchanged and required.

## 7. Release and evidence

This changes the normative browser calibration domain/default contract, so a standalone validation
record is required under `docs/validation/README.md`. Create it only after complete green
implementation/documentation exact-head CI, then obtain a complete green validation-inclusive
exact-head CI. Release only that exact SHA by force=false pure fast-forward and verify main=PR
head=PR merge SHA plus same-SHA main build and Pages deployment under AGENTS.md.

Historical numbered documents and released validation records are not rewritten. The new handoff
is navigation context only, not an alternative authority. This milestone does not change workflow
or deployment semantics; any temporary feature-branch source-transfer workflow must be restored
before the implementation PR is validated.
