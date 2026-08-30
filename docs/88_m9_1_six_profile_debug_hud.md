# M9.1 Six-Profile Common Debug HUD

Status: current browser vehicle-profile and debug-HUD authority. Handling values remain
`DEV_UNCALIBRATED`.

## 1. Scope and supersession

M9.1 preserves the M9.0 Two-Station Arcade Vehicle Dynamics solver, contact/tire/wheel chain,
three finite actuators and travel-direction steering law. The corrected selector/profile scope
supersedes only:

- the M9.0 initial two-profile `CAR`/`BIKE` composition identity and the earlier provisional
  four-profile M9.1 selector;
- the per-course accumulation of unrelated browser diagnostic text;
- the temporary `V` two-vehicle toggle and `R` recovery binding.

M8.3 remains the course-selector authority. M9.1 adds one parallel vehicle-selector authority and
one shared presentation-only HUD. No selector or HUD value is consumed by mechanics.

## 2. Vehicle selection

The browser mapping is exact:

```text
Q = FR
W = MR
E = RR
R = AWD
A = BIKE1
S = BIKE2
```

Selection reconstructs the requested profile at the current safe supported spawn. It does not
convert live mechanical state, manufacture route/race progress or introduce a vehicle-kind branch
inside the common solver.

FR, MR and RR mean front-engine/rear-drive, mid-engine/rear-drive and rear-engine/rear-drive.
All four car profiles share exactly one mass, engine/powertrain, tire, wheel, suspension, brake,
drag, steering and actuator package. FR/MR/RR differ only in CG-relative axle distances (static
weight distribution) and yaw/pitch inertia. AWD uses the FR distribution/inertia and changes only
the compiled front/rear drive-torque fraction.

The shared suspension and tire package is the common authored input. Station spring rates and
cornering stiffness remain ordinary compiled values derived from each axle's static load, so their
front/rear values follow the authored weight distribution without becoming additional profile
authorities.

The common solver always sends total powertrain torque through one normalized station split. FR,
MR, RR, BIKE1 and BIKE2 use rear drive (`front=0`); AWD uses the provisional fixed 50:50 split.
The same ordinary front/rear wheel solve then produces combined longitudinal/lateral tire demand,
so AWD changes handling without a vehicle-identity branch, hidden grip multiplier or second solver.

BIKE1 preserves the M9.0 motorcycle seed. BIKE2 is a provisional lighter bike using the same bike
engine/tire package with distinct weight distribution and body inertia. Both retain the common
solver and presentation-only lean.

## 3. Common overlay

All LINEAR, BRANCHING and CIRCUIT compositions call one HUD renderer. The visible overlay contains
only:

```text
course selector: 1 / 2 / 3 and active course
vehicle selector: Q / W / E / R / A / S and active profile
speed / RPM / selected gear
requested steering / throttle / brake
actual road-wheel angle / throttle actuator % / brake actuator %
body-yaw vector over the player sprite
top-down body-axis G sensor
```

Requested input comes only from canonical `DrivingInput`. Actual values come only from the common
vehicle control telemetry. The G sensor reads existing body-frame longitudinal and lateral
acceleration caches, divides by standard gravity and clamps only the drawn dot to a +/-2 g display
range; numeric values remain unclamped.

Keyboard pedal aliases publish the same canonical request:

```text
ArrowUp or X   = throttle
ArrowDown or Z = brake
```

Equivalent keys are independent held inputs: releasing one alias does not cancel the request while
the other remains held. Blur, page hide and hidden-document lifecycle resets clear all held keys.

The G diagram is a plan view: vehicle nose is screen-up and vehicle right is screen-right. Positive
longitudinal G moves the dot forward; positive lateral G moves it right.

The former suspension, contact, slip, torque, route, chart, package, checkpoint, lap, topology,
depth and scale diagnostics are not part of this common overlay.

## 4. Architecture boundary

```text
DrivingInput + common vehicle telemetry + route/profile identity
                         |
                         v
              read-only HUD model/drawing
```

M9.1 adds no coordinate authority, renderer depth path, runtime sprite rotation, route branch or
course-specific lower-layer behavior. Drive distribution is one compiled scalar consumed by the
ordinary wheel-torque chain; profile identity remains presentation/composition data only.

## 5. Executable acceptance

Regression coverage must prove:

- exact `1/2/3` and `Q/W/E/R/A/S` mapping from one authority each;
- six compiled profiles share the same two-station and actuator contract;
- all four cars share one engine/tire/chassis package outside weight distribution, inertia and the
  AWD drive split;
- FR is front-biased, MR is slightly rear-biased and RR is more rear-biased than MR by authored
  axle data;
- AWD distributes torque to both stations and changes tire utilization/trajectory through the
  ordinary wheel/tire force path;
- all six profiles integrate ordinarily on the finite LINEAR course;
- all three browser roots call the same common HUD;
- requested and actual controls remain distinct;
- G values are derived from the existing acceleration observations;
- retired diagnostic categories do not re-enter the common HUD.
