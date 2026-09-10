# Common vehicle physics

CAR and BIKE use one two-station arcade solver. The model is a game approximation, not a complete real vehicle or motorcycle simulator. Mass, geometry, inertia, suspension, wheel, brakes, drag, fixed drive split and powertrain are compiled profile data. Browser calibration and torque-protection policy are explicit instance/composition inputs. There is no vehicle-ID branch inside the tire or wheel solver.

The mechanics and control laws in this document are frozen; parameter calibration remains open. A future structural defect must be corrected with its causal regression and an explicit specification revision, never hidden by tuning. Compiled profiles own immutable snapshots, including nested actuator rates, ratios and torque points. Equal authored settings mean equal values; sharing the original authoring object's identity is not a mechanics invariant.

## State and integration

[Arcade vehicle physics](../src/physics/arcade-vehicle-physics.ts) owns world position and velocity, yaw/pitch and their rates, wheel angular speeds, rack angle, three normalized actuators and automatic gear state. Course coordinate, contact loads, accelerations and HUD values are observations; they do not become alternate physical state. There is no physical roll or rider model.

The browser uses 1/60 s fixed updates; each update has 12 substeps. Forces update velocities, then pose (semi-implicit Euler). Yaw and pitch wrap as angles, not course coordinates. Gravity is 9.80665 m/s². Derived body basis uses:

```
forward = (sin(yaw) cos(pitch), sin(pitch), cos(yaw) cos(pitch))
right   = (cos(yaw), 0, -sin(yaw))
up      = normalized forward × right
omega   = worldUp*yawRate - right*pitchRate
```

The compiler validates positive finite physical quantities and feasible profile geometry. The model has finite suspension travel and a local heightfield contact approximation; parameter tuning does not make those assumptions globally valid.

## Surface and contact

[Vehicle dynamics](../src/physics/vehicle-dynamics.ts) projects the free suspension reach point into the locally known Guide chart. For centerline metric μ, curvature κ, lateral position l and height derivative h': `A=1-κl` must be positive. Surface normal is proportional to `worldUp*A - horizontalTangent*(h'/μ)`, and grade is `atan2(h'/μ,A)`.

A station's free reach offset is `body.forward*axleOffset - body.up*freeReach`. Reach velocity is `v + omega × offset`. Supported material and an upright body permit unilateral contact:

```
q = max(-gap, 0)
qDot = -reachVelocity · surfaceNormal
N = max(0, spring*q + damping*qDot + smoothBumpStop(q))
```

No tensile ground force is created. `q >= qTravel` raises a typed `VehicleOutsideModelError`; gameplay can recover from that finite-domain exit. Ordinary programmer/reader errors still propagate. The physical solver never clamps position or suspension compression to conceal an invalid state.

The tire frame projects the steered wheel direction onto the surface plane. Degenerate projection transmits no tire force. Loads, wheel torque reaction, gravity and planar quadratic drag are assembled once in [vehicle wrench](../src/physics/vehicle-wrench.ts), shared by protection and integration.

## Tire law: ellipse with a smooth radial knee

[Calibration](../src/physics/tire-friction-calibration.ts) compiles positive GX/PX/GY/PY and `0 < KN < 1` into:

```
muX = GX                  kX = (2-KN)*GX/PX
muY = GY                  kY = (2-KN)*GY/PY
```

PX/PY are dimensionless slips (20% is 0.20), not angles. X means wheel longitudinal and Y wheel lateral. For wheel radius r, angular speed Ω, contact velocities vx/vy and low-speed regularization v0:

```
U  = hypot(vx, v0)
sx = (r*Ω-vx)/U            sy = -vy/U
x  = kX*sx/muX             y = kY*sy/muY
rho = hypot(x,y)/gripFactor
```

With `a=KN`, radial magnitude H is:

```
H(rho) = rho                                      rho <= a
       = rho - (rho-a)^2 / (4*(1-a))              a < rho < 2-a
       = 1                                        rho >= 2-a
```

For nonzero normalized demand, `(Fx,Fy) = N*gripFactor*H*(muX*x,muY*y)/hypot(x,y)`. The linear region returns the exact linear demand. Zero load or grip returns zero force. Thus `(Fx/(N*grip*muX))²+(Fy/(N*grip*muY))² <= 1`.

The law has no post-peak force drop, extra combined-slip exponent or tire-memory state. It opposes contact slip and does not generate positive slip work. Pure-axis plateau starts at `gripFactor*PX/PY`; simultaneous slip shares the ellipse and rotates its force vector. A flat radial plateau therefore does not mean lateral force is unchanged by further steering or throttle. See [tire and wheel solver](../src/physics/tire-wheel.ts).

## Wheel and powertrain

Each wheel solves the implicit signed torque balance with the same tire force:

```
I*(Ω-Ωold)/dt + r*Fx(Ω) + rollingTorque(Ω) = driveTorque - signedBrakeTorque
rollingTorque = Cr*N*r * (r*Ω)/hypot(r*Ω, v0)
```

If Ω=0 satisfies the static brake interval, it is the solution. Otherwise a finite torque/force bracket and up to 60 bisection iterations solve the monotone residual (early return at absolute torque residual below 1e-10 N·m). Rolling resistance is nonnegative. Contact reference speed is constant during this scalar solve and is evaluated once. Each solve owns a private temporary force result reused by its residual trials. The final result escapes only after solving; subsequent solves never mutate it. This is allocation management, not tire memory. No wheel-speed, body-speed or force cap substitutes for the solve.

[Automatic powertrain](../src/physics/automatic-powertrain.ts) derives RPM directly from the fixed drive split's wheel speed and current ratio. It interpolates profile torque, shifts with compiled adjacent-ratio hysteresis, and tapers torque to zero at redline. There is no runtime power multiplier, separate engine inertia, clutch lag or fabricated engine braking. Gear changes are discrete; available wheel torque uses the selected profile's ratio and efficiency.

## Torque protection

[Torque protection](../src/physics/torque-protection.ts) owns delivered drive/brake torques. TCS and ABS invert the same wheel residual at a selected longitudinal-slip boundary `grip*(2-KN)*muX/kX`. This boundary is a control policy, not a universal optimum. They reduce requested torque independently at each station, without force overrides, wheel-speed clipping or AWD redistribution. Low-speed ABS yields to the wheel's signed static brake solve.

The two-wheel composition also reserves 8% of static suspension compression against pedal-induced lift. For each relevant station it evaluates:

```
qAcceleration + 2*w*qVelocity + w²*(q - reserve*qStatic) >= 0
w = sqrt(g/qStatic)
```

The acceleration uses the same force/moment, wheel reaction and current angular motion as integration. Drive checks front support and brake checks rear support only when an opposite loaded station exists. It does not attach an airborne vehicle to a crest or VOID.

Try requested torque; if infeasible, try zero. If zero is feasible, 12 bounded bisections retain a feasible sampled lower endpoint and an infeasible upper endpoint. The algorithm does not establish that unsampled torques between zero and the retained candidate are feasible, nor global monotonicity or optimality. This explicitly corrects the former “connected to release” claim without changing the delivered-torque algorithm. If even zero is infeasible, deliver zero pedal torque and report `supportFeasible=false`. Gravity/inertia/contact still act. This local-plane constraint is not a proof of stability over arbitrary changing terrain.

## Input, automatic steering and limiter

[Input arbiters](../src/input/input-manager.ts) publish normalized steering and exclusive pedals. The latest still-held pedal wins; releasing it exposes the next held pedal. Steering uses the latest source and does not revive a superseded direction after release. Boolean pedal shorthand and numeric 0..1 have the same canonical meaning. Keyboard and AI use finite-rate actuators. An active analog touch applies its displacement directly; release uses the ordinary actuator release rate. Input event order belongs to input, never to physics.

Let D be driver offset and M the mechanical rack bound (`0 < D < M < π/2`). Travel-direction alignment is:

```
beta = atan2(bodyLateralSpeed, hypot(bodyForwardSpeed, steeringV0))
automatic = clamp(beta, -(M-D), M-D)
requestedOffset = D*steeringActuator
```

There is no yaw washout state, gain schedule, tire-derived automatic steering target or vehicle-specific steering branch. The input limiter only reduces the requested offset; automatic alignment is its immutable baseline.

[Steering input limiter](../src/physics/steering-input-limiter.ts) compares the front contact's lateral slip to the fixed pure-lateral plateau onset `S=grip*(2-KN)*muY/kY`. Surface-plane projection expresses the criterion as:

```
q(delta) = c0 + cc*cos(2*delta) + cs*sin(2*delta) <= 0
R = hypot(cc,cs)
Q(e) = q(automatic) + q'(automatic)*e + 2*R*e²
```

Since `|q''| <= 4R`, `q(automatic+e) <= Q(e)`. No search or speed table is needed. The minimizers of `max(0,Q)` form an interval, or a single vertex:

```
center = -q'(automatic)/(4R)
width  = sqrt(max(0, center² - q(automatic)/(2R)))
allowedOffset = [min(0,center-width), max(0,center+width)]
deliveredOffset = clamp(requestedOffset, allowedOffset)
```

Including zero preserves neutral and permits partial corrective input when automatic steering already exceeds the criterion. It does not invent a minimum corrective input or assert that all intermediate offsets are already inside the tire bound. At low speed the v0 term naturally leaves more steering available. Degenerate/unsupported/zero-grip cases return the requested offset because there is no usable constraint. The normalized quadratic has no speed-dependent epsilon or angle schedule.

Finally clamp `automatic+deliveredOffset` to ±M and approach it with the profile's exponential rack response. This is a conservative local front-slip limiter, not a global optimizer of lateral force, whole-vehicle stability or steering response over future time.

## Observation and presentation

HUD reads raw request, actuator, automatic steering, requested/delivered offset, target/actual rack and requested/delivered pedal torques. The 18:1 handwheel conversion is display-only. No HUD value feeds control.

Bike lean is presentation: `atan2(lateralAcceleration,g)`, with discrete bank variants using the normalized angle and a ground-anchored debug line. Bike CG is currently 30% of wheelbase. There is no physical roll, rider shift or tire-camber thrust. New graphics/sound should read observations rather than add a second physics authority.

[Calibration](calibration.md) lists current settings; [NEXT](NEXT.md#remaining-limits) owns open acceptance work. [Recovery](content-and-gameplay.md) defines the explicit gameplay reset boundary.
