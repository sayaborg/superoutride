# M9.0 Two-Station Arcade Vehicle Dynamics

Status: normative vehicle architecture freeze. CAR and BIKE handling values remain
`DEV_UNCALIBRATED`.

This milestone intentionally replaces the separate M8.0 CAR and BIKE mechanical solvers with one
reduced **Two-Station Arcade Vehicle Dynamics** model. It also supersedes the scoped M8.1 rule that
cleared the steering-offset command immediately on release. Frozen renderer, metric, open-source,
RouteDag, circuit-window and camera authorities remain unchanged.

## 1. Architecture decision gate

1. Keyboard, touch, AI and trace publishers own only canonical `DrivingInput` request.
2. One vehicle-neutral actuator primitive owns finite steering, throttle and brake response. Each
   vehicle owns exactly one normalized persistent value per channel.
3. Common Driver control owns the mapping from steering actuator to one physical front road-wheel
   angle. It consumes authoritative body velocity and yaw rate, never Guide heading, route, camera
   or screen position.
4. Automatic powertrain and wheel solves own drive/brake torque. Contact/tire force is the only
   route from those torques to body force.
5. A compiled vehicle profile owns CAR/BIKE mechanical differences. A presentation adapter owns
   sprite family, handwheel conversion and BIKE visual lean.
6. Common mechanics contain no CAR/BIKE, route-kind, course-mode, stage or camera branch.
7. Source-boundary and causal regressions reject retired solvers, compatibility paths, duplicate
   actuator state and force-producing presentation.

## 2. Supersession boundary

M9.0 retains these M8.0 authorities:

- world X/Y/Z pose and velocity;
- derived Guide/contact observations;
- front and rear contact stations;
- state-free unilateral suspension;
- one-k radial combined-slip tire force;
- implicit wheel-Omega solve;
- wheel torque as the only drive/brake route to longitudinal body force;
- finite/open runtime composition;
- no stored contact phase, tire-force memory or direct body drive/brake force;
- fixed 60 Hz outer update and 12 uniform substeps.

M9.0 supersedes and deletes:

- separate CAR and BIKE integration paths;
- BIKE quaternion orientation and independent roll angular momentum;
- crown-radius contact migration and crown-owned effective rolling radius;
- wheel-axis gyroscopic mechanics required only by the former full BIKE solver;
- the force-producing Rider lean/roll controller;
- running or compatibility adapters that preserve the retired solver authority;
- M8.1 instantaneous steering-offset release.

M8.1 travel-direction steering and stateless yaw preview remain the common initial Driver law. The
new steering actuator gives that law finite application and finite, faster neutral return.

## 3. Canonical request and actuator authority

Canonical browser input remains:

```ts
interface DrivingInput {
  steering: number;  // normalized [-1,+1]
  throttle: boolean;
  brake: boolean;
}
```

Persistent response state is exactly:

```ts
interface DrivingActuatorState {
  steering: number;  // [-1,+1]
  throttle: number;  // [0,1]
  brake: number;     // [0,1]
}
```

Every channel uses one bounded asymmetric rate primitive at each physics substep:

```text
target = normalized canonical request
rate   = releaseRate when target is neutral
         applyRate otherwise
next   = move_toward(current, target, rate*h)
```

An opposite nonzero steering request uses the apply rate continuously through neutral. Release is
finite, monotone and snaps only the final floating-point remainder to exact neutral. Input lifecycle
events clear canonical request only. Vehicle construction and recovery reconstruct neutral actuator
state.

Initial `DEV_UNCALIBRATED` response seeds are profile authority:

```text
steering apply   24 degrees/second over a 15-degree offset
steering release 60 degrees/second; <=0.25 second full return
throttle apply   0.25 second 0->1
throttle release 0.125 second 1->0
brake apply      0.15 second 0->1
brake release    0.10 second 1->0
```

Throttle and brake remain independent. Simultaneous requests are resolved by the ordinary
powertrain/wheel equation, not by an input interlock.

## 4. Common mechanical state

Authoritative persistent state is:

```text
CG world position xyz
CG world velocity xyz
yaw / pitch
yawRate / pitchRate
frontSteerAngle
frontWheelOmega / rearWheelOmega
steering / throttle / brake actuator state
automatic-powertrain rotational/gear state
```

Guide coordinate, body-frame speeds, support flags, gaps, normal loads, contact frames, slip,
utilization, lock/spin, handwheel angle, visual lean and screen position are derived observations or
presentation caches. There is no roll mechanical DOF in the reduced model.

Both vehicle profiles instantiate the same state type and use the same integration function. The
solver consumes only the compiled common profile shape and cannot inspect product identity.

## 5. Two-station mechanics

FRONT and REAR use the retained unilateral suspension observation:

```text
g = dot(P_reach - P_surface, n)
q = supported && g <= 0 ? -g : 0
qDot = supported && g <= 0 ? -dot(vReach,n) : 0
N = supported && g <= 0 ? max(0, k*q + c*qDot + Fbump) : 0
```

The front station uses the sole physical road-wheel angle. Both stations use their authored rolling
radius directly. The same one-k tire demand, radial C1 saturation, rolling resistance and implicit
wheel solve apply to CAR and BIKE profiles. Rear drive remains the baseline for both profiles.

Body translation, yaw and pitch integrate from the sum of gravity, aero and ordinary contact
forces/moments. Wheel-Omega magnitude reaction may project into the supported reduced pitch/yaw
DOFs; no discarded roll/crown/gyro state is reconstructed.

## 6. Common steering control

The normalized steering actuator produces a profile-scaled driver offset:

```text
driverOffset = steeringActuator * steeringOffsetMax
betaTravel = atan2(Vlateral, sqrt(Vlongitudinal^2 + v0^2))
target = clamp(betaTravel - yawRate*previewTime + driverOffset,
               -mechanicalSteerMax,
               +mechanicalSteerMax)
frontSteerAngle = first_order_rack(frontSteerAngle, target, rackTau)
```

Neutral input can therefore generate physical countersteer from authoritative world movement.
Front tire slip remains tire-force and telemetry authority and is not Driver feedback. Handwheel
angle is an optional profile-owned presentation conversion, never a second rack state.

## 7. Profile and presentation authority

Compiled profiles own mass, axle geometry, CG height, yaw/pitch inertia, suspension, wheel radii and
inertias, tire stiffness/grip, steering response, brake maxima, drag, powertrain and actuator rates.
Compilation rejects non-finite/non-positive mass, inertia, geometry, wheel, suspension, tire,
steering, actuator and powertrain values.

CAR and BIKE profile identity is available only to top-level composition/presentation. Common
mechanics cannot branch on it. BIKE visual lean is the clamped coordinated-turn observation
`atan2(yawRate * longitudinalSpeed, g)`. It may select authored bank variants, but it cannot alter
world state, contact, tire force or steering mechanics. Runtime sprite rotation remains prohibited.

## 8. ABS and TCS baseline

M9.0 has no ABS or TCS intervention.

The one-k tire law has a linear region, one C1 transition and a constant radial `mu*N` plateau. It
has no lower post-peak kinetic-friction region. Lock and wheelspin therefore remain derived
telemetry. Excess longitudinal demand can still consume combined-slip direction/allocation, but
that does not justify a hidden baseline modulator. No control path may alter `mu`, inject body force
or create a second tire law.

## 9. Acceptance contract

Executable coverage must prove:

- actuator bounds, one-tick versus held response, authored rise/fall times, deterministic replay,
  finite monotone steering release, explicit reversal rule and recovery reset;
- intermediate throttle/brake torque, repeated taps, physical lock/wheelspin and simultaneous
  drive/brake through wheel torque only;
- travel-direction countersteer, mechanical rack stop and drift release without a mode;
- one-k equal positive/negative longitudinal plateau, no post-peak drop and combined-slip lateral
  allocation;
- both profiles use one state/solver type, the same contact/tire/wheel path and ordinary
  crest/recontact;
- common mechanics contain no vehicle-kind branch and retired solver/quaternion/crown/gyro/Rider
  paths cannot be imported;
- LINEAR, both BRANCHING children and CIRCUIT remain ordinary world-continuous integrations;
- frozen renderer depth, metric, topology, route and camera invariants remain green.
