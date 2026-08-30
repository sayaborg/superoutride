# M9.1 Four-Profile Common Debug HUD

Status: current browser vehicle-profile and debug-HUD authority. Handling values remain
`DEV_UNCALIBRATED`.

## 1. Scope and supersession

M9.1 preserves the M9.0 Two-Station Arcade Vehicle Dynamics solver, contact/tire/wheel chain,
three finite actuators and travel-direction steering law. It supersedes only:

- the M9.0 initial two-profile `CAR`/`BIKE` composition identity;
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
R = BIKE
```

Selection reconstructs the requested profile at the current safe supported spawn. It does not
convert live mechanical state, manufacture route/race progress or introduce a vehicle-kind branch
inside the common solver.

FR, MR and RR mean front-engine/rear-drive, mid-engine/rear-drive and rear-engine/rear-drive.
The current reduced solver retains rear drive for all three car profiles. Their provisional
differences are compiled data: mass, CG-relative axle distances, yaw/pitch inertia, suspension,
tire stiffness, brake capacity, drag and powertrain curve. BIKE remains the M9.0 motorcycle seed.

## 3. Common overlay

All LINEAR, BRANCHING and CIRCUIT compositions call one HUD renderer. The visible overlay contains
only:

```text
course selector: 1 / 2 / 3 and active course
vehicle selector: Q / W / E / R and active profile
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

M9.1 adds no physics state, coordinate authority, renderer depth path, runtime sprite rotation,
route branch or course-specific lower-layer behavior. FR/MR/RR/BIKE differences remain compiled
profiles consumed by the unchanged common solver.

## 5. Executable acceptance

Regression coverage must prove:

- exact `1/2/3` and `Q/W/E/R` mapping from one authority each;
- four compiled profiles share the same two-station and actuator contract;
- FR is front-biased, MR is rear-biased and RR is more rear-biased than MR by authored axle data;
- all four profiles integrate ordinarily on the finite LINEAR course;
- all three browser roots call the same common HUD;
- requested and actual controls remain distinct;
- G values are derived from the existing acceleration observations;
- retired diagnostic categories do not re-enter the common HUD.
