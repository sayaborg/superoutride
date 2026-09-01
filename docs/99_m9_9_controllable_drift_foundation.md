# M9.9 — Controllable Drift Foundation

Status: current normative common tire-balance and deep-sideslip acceptance authority.

Vehicle handling remains `DEV_UNCALIBRATED`.

## 1. Scope and supersession

M9.9 is a deliberately small handling correction. It does not add a drift mode, drift assist,
handbrake, clutch, alternate tire law, vehicle-kind branch or new dynamic state.

It supersedes only:

1. M9.8's preset-1 common normalized tire stiffness pair
   `front=9.0 / rear=10.5`, replacing it with an axle-neutral common pair
   `front=9.75 / rear=9.75`.
2. M9.7's dynamic deep-beta release criterion to the extent that it required a prescribed deep
   sideslip seed to return inside the automatic-steering allocation under *either* held full
   steering sign. M9.9 instead requires recovery under the explicit recovery input and does not
   require neutral, wrong or intentionally sustaining input to self-recover.
3. M9.5's preset-1 reference stiffness and preset-2/3 linear multiplier only as needed to preserve
   the existing preset-2/3 effective `10.3` reference slope and exact `12 deg / 15 deg` plateau
   targets after the new preset-1 base stiffness is adopted.

Everything else remains current:

- M9.7's exact unit travel-direction coefficient and bounded zero-DC washout steering law;
- `M=31 deg`, CAR `D=9.5 deg`, BIKE `D=9 deg`, `A=M-D`, rack response and Y/U/T selectors;
- M9.8's nine production vehicle identities and all vehicle-specific mechanics other than the
  shared normalized tire seed changed here;
- M9.5's one-k radial combined-slip law, `muRef=1.35`, `rhoKnee=0.74`, low-speed regularization,
  three debug tire preset identities and preset-2/3 comparison targets;
- the common two-station solver, wheel solve, SurfaceMap, suspension, powertrain, input, camera,
  renderer, route and topology authorities.

## 2. Architecture Decision Gate

1. **Owner:** axle-neutral reference tire balance belongs to the existing compiled common tire
   seed. Deep-slide controllability belongs to the existing steering-envelope acceptance layer.
2. **Existing primitives:** normalized corner stiffness, combined-slip tire capacity, drive torque
   distribution, physical CG velocity/yaw and the existing travel-direction steering law already
   express the required behavior.
3. **No duplicate authority:** no drift state, target sideslip, stability mode, steering gain or
   second tire package is introduced.
4. **No lower-layer branch:** the solver still has no CAR/BIKE, FR/FF/AWD, course, route, stage,
   camera or product-mode branch.
5. **Simpler rule:** one equal normalized stiffness value removes the prior common axle bias and
   lets geometry, load transfer, inertia and longitudinal tire demand create vehicle-specific axle
   behavior through existing physics.
6. **Frozen invariants:** world-space physics, two-station contact, one-k tire law, renderer depth,
   metric scale, open runtime and topology rules are unchanged.
7. **Proof:** regressions cover the exact common tire seed, preserved M9.5 comparison semantics,
   exact unit travel-direction steering, all-nine calm envelopes, all-nine deep-beta recovery under
   the explicit recovery input and the retained known-bad uncontrollable control.

## 3. Steering principle: preserve travel-direction coefficient 1

M9.9 explicitly preserves M9.7's structural steering law:

```text
betaTravel = atan2(Vlat, sqrt(Vlong^2 + v0s^2))
automaticRaw = betaTravel - Tw*transientYawRate
automaticSteer = clamp(automaticRaw, -A, +A)
driverOffset = steeringActuator*D
roadWheelTarget = clamp(automaticSteer + driverOffset, -M, +M)
```

The coefficient on `betaTravel` remains exactly `1`.

This is not treated as a hidden drift-cancel mode. In the ordinary small-angle tire relation,
adding `betaTravel` to the road-wheel angle approximately removes body sideslip from the driver's
front-tire command, so the normalized digital request behaves as an additional road-wheel angle
relative to travel direction. This is valuable for a digital-input game because a large body
sideslip does not require the player to reproduce the entire geometric countersteer angle manually.

Therefore M9.9 adds no `travelDirectionGain`, no assist-disable selector and no drift-specific
steering branch. Yaw washout remains zero-DC transient damping and keeps its existing selectors.

## 4. Controllable-slide acceptance

The previous release gate was intentionally conservative: a prescribed deep-beta seed had to
return inside the automatic-steering allocation even when either full steering sign was held. That
criterion conflated two different hazards:

- an **uncontrollable outer attractor**, where the correct recovery input cannot return the car;
- a **controllable or intentionally sustained slide**, where another input may keep sideslip large.

M9.9 separates them.

The normative product rule is:

> **Uncontrollable slide is forbidden. Controllable drift is allowed.**

For the current deep-beta falsification protocol:

```text
initial beta = +/-43 deg
speed        = 12 / 15 / 16 / 20 / 25 m/s
surface      = wide flat ASPHALT
```

all nine selectable production profiles must enter the inner region and finish inside their
compiled automatic-steering authority when the explicit recovery steering sign is held. The
mirrored positive/negative cases must remain symmetric.

Neutral, wrong or intentionally sustaining steering is not required to self-recover. Such inputs
must remain finite and deterministic under the ordinary solver, but a persistent controllable
slide is no longer classified as a failure merely because the Driver does not override the user's
intent.

The known `D=15 deg / A=16 deg` controlled mutation remains a negative fixture so long as the
explicit recovery input itself cannot escape its outer state. If a later tire or vehicle change
invalidates that particular historical mutation, the negative fixture must be replaced by another
causal uncontrollable case rather than restoring the old both-sign release criterion.

## 5. Axle-neutral common tire seed

M9.8 used:

```text
frontNormalizedStiffness = 9.0
rearNormalizedStiffness  = 10.5
```

Because absolute corner stiffness is compiled as:

```text
C_front = k_front * N_front_static
C_rear  = k_rear  * N_rear_static
```

that pair embeds a common rear-to-front normalized stiffness advantage in every vehicle before
vehicle-specific geometry, inertia or drive layout acts.

M9.9 removes only that common axle bias. The new preset-1 reference is:

```text
muRef                     = 1.35
rhoKnee                   = 0.74
lowSpeedRegularization    = 1.0 m/s
frontNormalizedStiffness  = 9.75
rearNormalizedStiffness   = 9.75
```

`9.75` is the arithmetic mean of the previous `9.0` and `10.5`. This preserves the previous mean
normalized stiffness level while removing front/rear bias; it is not claimed as a final real-tire
calibration.

The intended causal consequence is that axle behavior comes from existing mechanics:

- RWD consumes rear combined-slip capacity under power;
- FWD consumes front combined-slip capacity under power;
- AWD consumes both according to its existing fixed torque split;
- weight distribution, pitch/load transfer, yaw inertia, wheel torque and brake distribution remain
  vehicle-specific inputs to the same common solver.

No drive-layout handling branch is added.

## 6. Preserved M9.5 comparison presets

M9.5 presets 2 and 3 are comparison instruments, not product tire identities. Their current useful
meaning is an effective normalized initial slope of `10.3` and exact reference plateau starts at
`12 deg` and `15 deg`.

Changing the preset-1 compiled base from `9.0` to `9.75` would accidentally change those meanings
if the old `10.3/9` multiplier were retained. M9.9 therefore derives:

```text
preset 2/3 linearStiffnessMultiplier = 10.3 / 9.75
```

The reference-friction multipliers remain unchanged because they are already derived from the
`10.3` effective slope and the `12 deg / 15 deg` plateau targets.

The resulting reference behavior is:

| Preset | Effective normalized slope | Reference plateau start |
|---|---:|---:|
| `1` | `9.75` | `9.8963079524 deg` |
| `2` | `10.3` | `12 deg` |
| `3` | `10.3` | `15 deg` |

This intentionally changes preset 1 while preserving presets 2 and 3 as controlled comparison
points.

## 7. Explicit non-goals

M9.9 does not add or change:

- a post-peak tire-force drop;
- tire memory, temperature, pressure, wear or load sensitivity;
- left/right wheel or roll DOFs;
- handbrake, clutch, simultaneous canonical throttle+brake or drift initiation command;
- TCS/ABS or hidden stability intervention;
- steering travel-direction gain or a drift-mode switch;
- M/D/A steering allocation, yaw washout defaults or selector tables;
- SurfaceMap absolute friction;
- vehicle-specific tire branches;
- renderer, camera, route, topology or world-coordinate behavior.

Those remain separate questions. M9.9 deliberately tests whether removing the common axle bias and
correcting the release criterion are sufficient before adding any new model concept.

## 8. Executable acceptance

Release requires all of the following:

1. The common preset-1 tire is exactly `1.35 / 0.74 / 1.0 / 9.75 / 9.75`.
2. Every one of the nine catalog profiles compiles both stations with normalized stiffness `9.75`.
3. The common solver and profile compiler contain no vehicle-kind or drive-layout handling branch.
4. M9.5 presets 2 and 3 retain effective normalized slope `10.3` and exact `12 deg / 15 deg`
   reference plateau starts.
5. The travel-direction coefficient remains structurally exactly `1`; no `travelDirectionGain`,
   `driftMode` or `driftAssist` authority exists.
6. Calm full-input steady probes cover all nine catalog profiles and remain finite, symmetric and
   inside the accepted automatic-steering envelope.
7. Deep `+/-43 deg` beta seeds at `12/15/16/20/25 m/s` cover all nine profiles and recover under
   the explicit recovery input with mirrored symmetry.
8. Neutral/wrong deep-slide inputs are not release-required to self-recover; the explicit recovery
   input remains effective and finite.
9. The known uncontrollable-control negative fixture remains rejected or is replaced by an equally
   causal negative fixture if falsified by this change.
10. Full repository CI, architecture boundaries and Pages build remain green on the exact release
    head.

Because M9.9 changes current normative tire balance and steering-envelope acceptance, it requires a
new standalone validation record before release.
