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
- the temporary `V` two-vehicle toggle and `R` recovery binding;
- the M8.1 provisional `15:1` handwheel-presentation conversion, replaced by the HUD-only `18:1`
  conversion below;
- the M9.0 independent/simultaneous throttle-and-brake request rule, replaced by the canonical
  exclusive last-pressed-pedal rule below.

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
graphical requested steering meter
exclusive requested ACCEL blue / BRAKE red / neutral uncolored indicators
graphical actual steering / throttle-actuator / brake-actuator meters
actual handwheel graphic
body-yaw vector over the player sprite
body-axis inertial-load G cross and dot
```

Requested input comes only from canonical `DrivingInput`. Actual values come only from the common
vehicle control telemetry. Requested steering remains a graphical signed meter. Requested ACCEL
and BRAKE are mutually exclusive indicators: ACCEL is blue, BRAKE is red, and neutral has no active
color. Actual steering/throttle/brake remain three independent graphical response meters. None are
formatted as textual direction, on/off state, degree or percentage rows. The handwheel graphic
reads the existing derived presentation observation:

```text
handwheel-to-road-wheel ratio = 18:1
handwheel angle = actual road-wheel angle * 18
```

This ratio is HUD-only. It does not change steering input, the normalized actuator, driver offset,
rack target/response, mechanical road-wheel limit, contact geometry or tire force. The same
presentation conversion is used for every selected profile so the common overlay has no vehicle
branch.

The G sensor reads existing body-frame longitudinal and lateral acceleration caches and divides by
standard gravity. It draws only one cross and one dot; there is no panel, circle, vehicle outline,
axis label or numeric G text. The dot is the inertial load felt by the driver, opposite the vehicle
acceleration vector, and clamps only its drawn position to a +/-2 g range:

```text
screen_x = center_x - lateral_acceleration_g * scale
screen_y = center_y + longitudinal_acceleration_g * scale
```

Keyboard pedal aliases publish the same canonical request:

```text
ArrowUp or X   = throttle
ArrowDown or Z = brake
```

Equivalent keys are independent held inputs: releasing one alias does not cancel the request while
the other remains held. Keyboard aliases and touch pointers all publish source-level press/release
events to one device-independent pedal arbiter. Among sources that remain held, the most recently
pressed source wins:

```text
hold ACCEL -> press BRAKE -> ACCEL=false, BRAKE=true
release BRAKE while ACCEL remains held -> ACCEL=true, BRAKE=false
hold BRAKE -> press ACCEL -> ACCEL=true, BRAKE=false
release ACCEL while BRAKE remains held -> ACCEL=false, BRAKE=true
```

Repeated keydown for an already-held source does not manufacture newer priority. Releasing a
non-winning source does not disturb the winner. Blur, page hide and hidden-document lifecycle
resets clear every held source and priority observation.

Canonical `DrivingInput` never contains `throttle=true` and `brake=true` together. Traces and the
vehicle boundary reject that contradictory state rather than guessing an order after event history
has been lost. This validation does not move arbitration into physics.

The three physical actuator values remain independent finite response states. On an ACCEL-to-BRAKE
handoff, the throttle actuator follows its ordinary release rate while the brake actuator follows
its ordinary apply rate, so their derived actual values may overlap briefly. No immediate torque
cut, brake override, pedal interlock force or actuator-side winner state is introduced.

Vehicle nose is screen-up and vehicle right is screen-right. Forward acceleration therefore moves
the dot rearward; acceleration to vehicle right moves it left. Braking and leftward acceleration
move it forward and right respectively.

The former suspension, contact, slip, torque, route, chart, package, checkpoint, lap, topology,
depth and scale diagnostics are not part of this common overlay.

## 4. Architecture boundary

```text
keyboard/touch held-source events
              |
              v
last-pressed pedal arbiter -> exclusive DrivingInput -> ordinary finite actuators
                                      |
common vehicle telemetry + route/profile identity
                                      |
                                      v
                           read-only HUD model/drawing
```

M9.1 adds no coordinate authority, renderer depth path, runtime sprite rotation, route branch or
course-specific lower-layer behavior. Drive distribution is one compiled scalar consumed by the
ordinary wheel-torque chain; profile identity remains presentation/composition data only. The
pedal winner exists only in input, while mechanics accepts only the resolved one-hot request. The
18:1 ratio and every HUD graphic remain read-only presentation observations.

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
- requested and actual controls remain distinct numerical observations rather than textual state
  rows;
- requested ACCEL/BRAKE draws exactly blue/red/uncolored exclusive indicator states while actual
  actuator values remain graphical response meters;
- the latest held keyboard alias or touch pointer wins across devices, and releasing it resumes the
  next-most-recent source that remains held;
- canonical input, trace and vehicle boundaries reject contradictory simultaneous pedals instead
  of recreating event-order authority downstream;
- actuator response stays finite and owns no pedal winner/history state;
- every profile derives the HUD handwheel graphic at `18:1` without changing physical steering;
- G values derive from existing acceleration observations, while the drawn dot uses the opposite
  inertial-load direction;
- the G sensor draws exactly one cross and one dot;
- retired diagnostic categories do not re-enter the common HUD.
