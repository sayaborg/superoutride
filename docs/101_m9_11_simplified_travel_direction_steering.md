# M9.11 — Simplified Travel-Direction Steering

Status: current normative steering-control calibration and browser-selector authority.

Vehicle handling remains `DEV_UNCALIBRATED`.

## 1. Scope and supersession

M9.11 removes the M9.7 yaw-transient / yaw-washout correction and its persistent Driver filter
state while retaining the useful geometric core of travel-direction steering.

M9.11 supersedes M9.7 only for:

1. yaw-rate transient feedback;
2. zero-DC washout state and time constant;
3. the `YAW` and `WASH` browser selectors;
4. the former fixed 31-degree mechanical road-wheel maximum;
5. the former 0.375-second default steering traversal.

M9.11 retains:

- the M8.1/M9.7 unit-coefficient body-to-CG-travel steering geometry;
- one physical front road-wheel angle and one final rack response;
- M9.9's rule that uncontrollable slide is forbidden while controllable drift is allowed;
- M9.9's axle-neutral common tire seed;
- M9.10's independent stateless post-peak tire law and `SLIDE` selector;
- the common CAR/BIKE two-station solver and all frozen world/render/topology boundaries.

M9.7 remains a historical record. Statements in M9.9/M9.10 that explicitly retained the M9.7
washout are superseded by this document only for steering control. Their tire and controllability
scope remains current.

## 2. Architecture Decision Gate

1. **Owner:** steering geometry belongs to the common vehicle solver; selectable steering values
   belong to the existing vehicle-instance steering calibration.
2. **Existing primitive:** `betaTravel` already expresses authoritative CG travel direction in the
   body frame. No additional yaw observation is required.
3. **One authority:** the calibration stores only `M`, `D` and the symmetric actuator response.
   Automatic authority `A` is always derived as `M-D` and is never stored.
4. **No lower-layer branch:** there is no vehicle ID, drive-layout, drift, course or route branch.
5. **No extra state:** yaw-rate baseline / washout memory is deleted rather than disabled.
6. **Frozen invariants:** world-space physics, one front rack, two-station contact, renderer depth,
   metric presentation and topology boundaries are unchanged.
7. **Proof:** regression covers the complete selector product, exact algebraic reserve, all nine
   profiles, deep-beta explicit recovery and source-level absence of the retired assist.

## 3. Steering law

Definitions:

```text
betaTravel = CG travel direction relative to body forward
u          = normalized steering actuator in [-1,+1]
M          = maximum physical front road-wheel angle
D          = maximum Driver offset relative to travel direction
A          = M - D
```

The target road-wheel angle is exactly:

```text
automatic = clamp(betaTravel, -A, +A)
deltaTarget = clamp(automatic + u*D, -M, +M)
```

or equivalently:

```text
deltaTarget = clamp(clamp(betaTravel, -(M-D), +(M-D)) + u*D, -M, +M)
```

Within automatic authority:

```text
deltaTarget - betaTravel = u*D
```

Therefore the coefficient on `betaTravel` is structurally exactly `1`. There is no selectable
travel-direction gain and no hidden multiplier.

The existing first-order physical rack response then follows `deltaTarget`; the digital request
never writes road-wheel angle directly.

## 4. Why yaw washout is removed

The former M9.7 law added a transient yaw-rate term to the geometric travel-direction transform.
Player evaluation showed that the core transform itself already supplies the useful behavior:
neutral steering aligns the front wheel with CG travel, while Driver offset commands a bounded
front slip direction relative to that travel.

Keeping a second yaw-rate observation required:

- one persistent baseline state;
- one gain;
- one time constant;
- two browser selectors;
- recovery synchronization logic;
- additional saturation interaction.

M9.11 removes that entire causal path. Physical yaw rate still exists as ordinary body state and is
still created by tire/contact moments; it simply no longer feeds the steering target.

## 5. Selectable calibration

The current DEV comparison tables are:

| Parameter | Choices | Default |
|---|---|---|
| `M` maximum road-wheel steer | `37 / 41 / 45 / 49 / 53 deg` | `45 deg` |
| `D` Driver travel-relative offset | `9 / 9.5 / 11 / 12.5 / 14 deg` | profile seed: CAR `9.5`, BIKE `9` |
| `T` symmetric steering traversal | `0.25 / 0.375 / 0.5 / 0.625 s` | `0.25 s` |
| `SLIDE` tire plateau / peak | `100 / 85 / 80 / 75 / 70 %` | `100%` |

Keyboard ownership:

```text
Y -> D
U -> M
T -> T
G -> SLIDE
```

`SLIDE` remains M9.10 tire authority and is not part of steering calibration.

`M`, `D` and `T` are intentionally still tunable. The defaults above are current empirical
candidates, not a declaration that handling calibration is finished.

## 6. M and D domain

Every exposed `M x D` combination must satisfy:

```text
0 < D < M < pi/2
A = M - D > 0
```

The current selector domain has:

```text
minimum A = 37 - 14 = 23 deg
```

The lower M bound is intentionally 37 degrees. It prevents the browser selector from recreating the
previously identified low-automatic-authority neighborhood near `M=31, D=15, A=16` while still
leaving M adjustable for later player evaluation.

There is no independent `A` field, setter, selector or profile value.

## 7. Vehicle-instance ownership

One vehicle instance owns one steering calibration object:

```text
maxRoadWheelSteer
steeringOffsetMax
steeringActuatorResponse
```

Changing a selector changes only that calibration. It does not modify world pose, yaw, velocity,
front road-wheel state, tire state or route progress at the instant of selection.

Recovery reconstructs physical dynamic state but preserves the selected M/D/T calibration. DEV
profile switching reconstructs a new physical vehicle and copies the current calibration into a
new independent calibration object.

Ordinary rivals use profile defaults and do not share the player's mutable calibration object.

## 8. Profile defaults

All nine current profiles use the same default:

```text
M = 45 deg
T = 0.25 s
```

The current provisional D seed remains presentation-family based only as profile data:

```text
CAR  D = 9.5 deg
BIKE D = 9 deg
```

Common mechanics never branches on CAR/BIKE identity. The profile merely supplies the initial
numeric seed when a vehicle instance is constructed.

## 9. Explicit non-goals

M9.11 does not add:

- drift mode, drift assist or drift detection;
- target sideslip;
- yaw-rate feedback or yaw damping in steering;
- tire-force/utilization/acceleration feedback to Driver;
- a second rack or hidden countersteer state;
- vehicle-specific or drive-layout steering branches;
- handbrake, clutch or new canonical inputs;
- roll, left/right tire contacts or additional body DOFs;
- any change to M9.10 tire constitutive behavior;
- any camera, route, topology or renderer change.

## 10. Executable acceptance

Release requires:

1. `steering-assist.ts` and its persistent yaw baseline are absent.
2. Solver/calibration/browser steering code contains no yaw-transient or yaw-washout authority.
3. The complete `M x D` browser product derives `A=M-D` and never stores A.
4. Every exposed M/D combination leaves at least 23 degrees of automatic authority.
5. Within A, `deltaTarget-betaTravel=uD` to numerical precision.
6. Positive/negative saturation reaches the same single mechanical `+/-M` stop.
7. All four T choices remain symmetric apply/release rates.
8. Default M is 45 degrees and default T is 0.25 seconds; profile D seeds remain CAR 9.5 / BIKE 9.
9. All nine production profiles remain finite under the smallest-M/largest-D/slowest-T selector
   corner.
10. Every production profile can return from both signs of a 43-degree deep-beta seed under the
    explicit recovery input in the deterministic constant-speed basin probe.
11. Recovery and profile reconstruction preserve selected calibration without sharing object
    identity.
12. M9.10 tire regressions and the full repository suite remain green.
13. Full exact-head CI, validation-inclusive CI and same-SHA main/Pages release succeed under
    `AGENTS.md`.

Handling remains `DEV_UNCALIBRATED`; M9.11 simplifies the architecture and exposes clean tuning
axes, but does not freeze final handling values.
