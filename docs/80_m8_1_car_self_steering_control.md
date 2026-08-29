# M8.1 CAR Self-Steering Control

Status: current normative CAR control authority above the unchanged M8.0 mechanical model.

This milestone supersedes only the M8.0 CAR Driver decisions that map steering input to a raw
road-wheel angle, cap that angle through the useful-steer calculation, and prohibit neutral-input
countersteer. The five-DOF/two-station CAR, one-k tire law, implicit wheel solve, suspension,
powertrain, world-state authority, renderer, camera, route and topology contracts remain unchanged.
BIKE Rider authority is unchanged.

Vehicle handling parameters remain `DEV_UNCALIBRATED`. This milestone establishes control
semantics and observability before tire, mass, inertia, self-steer response or other feel calibration.

## 1. Architecture decision gate

1. CAR Driver owns the interpretation of canonical steering intent. Input devices remain digital
   publishers and do not own actuator state.
2. The existing authoritative front road-wheel angle, derived front contact velocity and tire
   observation express self-steering without a new vehicle coordinate or tire-force authority.
3. No target-slip state, contact phase, countersteer mode, steering-assist mode or duplicate rack
   state is introduced.
4. The control law contains no course-, route-, topology-, stage- or camera-specific branch.
5. Guide geometry remains a derived surface/contact observation. Self-steering uses the front
   contact's actual road-plane velocity, never Guide heading or screen position.
6. M8.0 world mechanics, tire saturation, finite/open composition and frozen renderer invariants
   are preserved.
7. Dedicated causal regressions prove digital tap response, full-effort equilibrium, neutral
   self-countersteer, mechanical rack limits, telemetry derivation and the absence of the retired
   useful-steer authority.

## 2. Canonical input meaning

For CAR only, canonical `DrivingInput.steering` is normalized driver steering effort:

```text
u in [-1, +1]
u = -1  maximum left handwheel effort
u =  0  hands-off / no driver steering torque
u = +1  maximum right handwheel effort
```

Keyboard and touch adapters publish only `-1`, `0` or `+1`. Analog traces remain legal because
the canonical contract stays continuous over `[-1,+1]`. CAR Driver interprets that value as effort;
BIKE Rider retains its existing lean-intent interpretation.

Input effort changes immediately. There is no input low-pass, press ramp or second target-slip
buffer. A brief digital press is a brief torque impulse and therefore produces a proportionally
small road-wheel response through the one steering dynamic below.

## 3. Derived regularized front slip angle

The self-steer observation is the front tire's signed lateral slip relative to its actual contact
velocity projected into the road plane. It is not an angle relative to Guide heading.

Using the M8.0 tire-frame velocities and the same low-speed regularizer `v0`:

```text
Vref        = sqrt(Vx_front^2 + v0^2)
alpha_front = atan(-Vy_front / Vref)
```

At ordinary speed this approaches the geometric front slip angle. At zero speed it is finite and
zero; no start/stop control mode is introduced.

## 4. Overdamped virtual steering-torque balance

CAR retains one authoritative front road-wheel angle `delta`. Driver effort and self-aligning
response are represented by one overdamped balance:

```text
alpha_equilibrium = u * alpha_assist_max
delta_dot          = (alpha_equilibrium - alpha_front) / tau_self_steer
delta_next         = clamp(delta + delta_dot * h, -delta_mechanical_max, +delta_mechanical_max)
```

This is the normalized first-order form of:

```text
C_delta * delta_dot = T_driver - K_alpha * alpha_front
alpha_assist_max     = T_driver_max / K_alpha
tau_self_steer       = C_delta / K_alpha
```

There is no separately filtered target slip angle. The equilibrium expression is derived from the
torque balance and is not stored as vehicle state.

Consequences:

- a short press moves the road wheel only for the press duration;
- held effort approaches a finite front-slip equilibrium rather than mechanical lock at speed;
- releasing to `u=0` aligns the front tire with its actual contact velocity;
- if body sideslip requires opposite road-wheel angle for zero front slip, neutral input produces
  ordinary self-countersteer;
- loss of front contact removes front-slip feedback, so effort can still move the unloaded rack
  while neutral input holds it; recontact restores ordinary self-alignment;
- the mechanical rack stop remains explicit and does not manufacture tire force.

The initial uncalibrated authoring values are:

```text
alpha_assist_max   = 6.5 degrees
tau_self_steer     = 0.12 seconds
delta_mechanical_max = 31 degrees
```

These are calibration seeds, not a frozen final-feel target.

## 5. Retired CAR Driver authority

The M8.0 useful-steer cap and hypothetical front-utilization comparison are retired for CAR:

```text
raw requested road-wheel angle
-> front/rear combined-slip useful-angle cap
-> countersteer escape comparison
```

They must not remain underneath the new self-steer law. Tire combined-slip saturation remains
fully authoritative in the unchanged tire force solve. Rear saturation may therefore produce
physical oversteer, and neutral front self-steer may physically countersteer in response. No grip,
yaw moment, body force or hidden recovery is added by Driver.

## 6. Handwheel presentation and control telemetry

The authored CAR steering ratio is:

```text
handwheel-to-road-wheel ratio = 15:1
handwheel angle = road-wheel angle * 15
```

At the 31-degree mechanical road-wheel limit this yields `+/-465 degrees`, or approximately
`2.58` handwheel turns lock-to-lock. The ratio is one CAR profile/presentation conversion; it is
not a second rack-angle authority.

The live CAR HUD must show:

- digital left/neutral/right input state;
- a steering-wheel outline, spokes and visible top-center marker at the derived handwheel angle;
- signed handwheel angle;
- signed road-wheel angle;
- signed regularized front slip angle;
- signed body sideslip angle.

HUD values are derived telemetry only and are never consumed by physics. A `COUNTERSTEER` mode or
assist-state flag is prohibited; countersteer is observed directly when road-wheel angle opposes
body heading/sideslip while driver effort is neutral or points elsewhere.

## 7. Ordinary DEV rival integration

The DEV rival remains an upper-level publisher of canonical `DrivingInput`. Its path feedback is
therefore converted to normalized driver effort rather than a road-wheel target. It owns no rack,
front-slip or vehicle-coordinate state and cannot bypass the ordinary CAR solve.

The current uncalibrated rival uses a longer `36 m` lookahead, at most `0.65` steering effort, a
`0.47 g` speed-planning envelope and a `0.25 m/s` pedal deadband. These are DEV driver settings,
not tire or player-control authority. They keep the existing physical fork, low-speed-course and
post-handoff regressions causal after the canonical input meaning changes.

## 8. Deferred velocity-direction camera

A future presentation milestone may align camera yaw to planar world velocity so the displayed
vehicle relative yaw exposes body sideslip. That change is not part of M8.1 CAR control.

The renderer remains topology-blind, camera roll remains zero, and arbitrary runtime sprite
rotation remains prohibited. The current programmer-art vehicle set contains 24 yaw directions
at 15-degree spacing; a future velocity-direction camera requires explicitly authored finer
discrete variants if small body-slip angles must be visible.
