# M8.1 CAR Predictive Travel-Direction Steering Assist

Status: current normative CAR control authority above the unchanged M8.0 mechanical model.

This milestone supersedes only the M8.0 CAR Driver decisions that map steering input to a raw
road-wheel angle, cap that angle through the useful-steer calculation, and prohibit neutral-input
countersteer. The five-DOF/two-station CAR, one-k tire law, implicit wheel solve, suspension,
powertrain, world-state authority, renderer, camera, route and topology contracts remain unchanged.
BIKE Rider authority is unchanged.

Vehicle handling parameters remain `DEV_UNCALIBRATED`. This milestone establishes control
semantics and observability before tire, mass, inertia, steering response or other feel calibration.

## 1. Architecture decision gate

1. CAR Driver owns the interpretation of canonical steering intent. Input devices remain digital
   publishers and do not own actuator state.
2. The existing authoritative world velocity, yaw rate, body frame and front road-wheel angle
   express the assist without a new vehicle coordinate or tire-force authority.
3. One press-slew steering-offset command separates digital press duration from fast rack response.
   A released digital button clears that command immediately; it is not a second rack response,
   road-wheel angle, contact phase or tire authority.
4. The control law contains no course-, route-, topology-, stage- or camera-specific branch.
5. Guide geometry remains a derived surface/contact observation. Steering uses authoritative CG
   velocity in the body frame, never Guide heading, camera direction or screen position.
6. M8.0 world mechanics, tire saturation, finite/open composition and frozen renderer invariants
   are preserved.
7. Dedicated causal regressions prove digital tap response, immediate command release, shrinking
   held-drift sideslip/yaw envelopes, full-request offset, neutral countersteer, mechanical rack
   limits, telemetry derivation and the absence of the retired useful-steer authority.

## 2. Canonical input meaning

For CAR only, canonical `DrivingInput.steering` is normalized driver steering request:

```text
u in [-1, +1]
u = -1  request maximum left travel-direction offset
u =  0  release the driver offset
u = +1  request maximum right travel-direction offset
```

Keyboard and touch adapters publish only `-1`, `0` or `+1`. Analog traces remain legal because
the canonical contract stays continuous over `[-1,+1]`. CAR Driver interprets that value as a
request; BIKE Rider retains its existing lean-intent interpretation.

While a nonzero digital request is held, the steering-offset command moves toward it at one authored
angular rate. A short press therefore creates a small command instead of forcing the physical rack
response itself to be slow. Releasing the button clears the driver command immediately, as releasing
real steering torque does. The physical rack remains the sole response stage; there is no latched
steering target or input-device angle.

## 3. Derived regularized predictive travel direction

The base assist reference is the CG velocity direction relative to the CAR body frame. A stateless
short yaw preview then predicts that direction in the rotating body frame. Neither term is an angle
relative to Guide heading, and neither contains front-contact or tire-slip feedback.

Using authoritative CG velocity and the same low-speed regularizer `v0`:

```text
Vlong = dot(V_CG, body_forward)
Vlat  = dot(V_CG, body_right)
Vref  = sqrt(Vlong^2 + v0^2)
beta_travel = atan2(Vlat, Vref)
beta_preview = beta_travel - yaw_rate * T_preview
```

At ordinary speed `beta_travel` approaches the geometric body sideslip angle. `beta_preview`
expresses where the same world-velocity direction will lie in the body frame after the short preview
time if current yaw continues. This is the reduced-model equivalent of an RC drift gyro: positive
yaw requests earlier countersteer. It adds no state, force, speed-indexed steering map or behavior
mode. At zero speed the velocity term remains finite and zero.

The ordinary M8.0 front-contact slip angle remains fully authoritative for front tire force and HUD
telemetry. CAR Driver does not consume it. Using CG rather than front-station velocity deliberately
leaves the front-station yaw-velocity term in physical tire slip. The preview supplies explicit
Driver damping for the otherwise underdamped body-sideslip/yaw pair without consuming or cancelling
that tire observation.

## 4. Press slew and predictive travel-direction rack response

CAR retains one authoritative front road-wheel angle `delta`. The input command and physical rack
response are deliberately separate:

```text
offset_requested = u * offset_max
offset_command_next = 0                                      if u == 0
offset_command_next = move_toward(offset_command,
                                  offset_requested,
                                  offset_rate * h)            otherwise

delta_target = clamp(beta_preview + offset_command_next,
                     -delta_mechanical_max, +delta_mechanical_max)
lambda = 1 - exp(-h / tau_steering)
delta_next = delta + (delta_target - delta) * lambda
```

`offset_command` is one control state and `delta` is the sole rack-angle state. `delta_target` is
derived and never stored. The exponential form is the exact discrete response of one first-order
rack and remains stable if a diagnostic caller supplies a larger `h`.

Consequences:

- a short press produces a proportionally small travel-direction offset;
- held request reaches a finite angular offset while body motion supplies the remaining road-wheel
  angle naturally;
- releasing to `u=0` clears residual driver command and aims the rack along the predicted CG travel
  direction;
- body sideslip therefore produces ordinary automatic countersteer;
- the yaw preview arrests return overshoot while front-station yaw motion remains ordinary physical
  tire slip;
- steering remains continuous in flight because it needs no contact-validity branch;
- the mechanical rack stop remains explicit and does not manufacture tire force.

The initial uncalibrated authoring values are:

```text
offset_max            = 15 degrees
offset_rate           = 24 degrees/second
tau_steering          = 0.01 seconds
T_preview             = 0.12 seconds
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

They must not remain underneath the new steering law. Tire combined-slip saturation remains
fully authoritative in the unchanged tire force solve. Rear saturation may therefore produce
physical oversteer, and neutral travel-direction steering may countersteer in response. No grip,
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
body heading/sideslip while the driver request is neutral or points elsewhere.

## 7. Ordinary DEV rival integration

The DEV rival remains an upper-level publisher of canonical `DrivingInput`. Its path feedback is
therefore converted to normalized driver request rather than a road-wheel target. It owns no rack,
front-slip or vehicle-coordinate state and cannot bypass the ordinary CAR solve.

The current uncalibrated rival uses a longer `36 m` lookahead, at most `0.65` steering request, a
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
