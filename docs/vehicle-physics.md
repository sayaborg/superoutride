# Common vehicle physics

CAR and BIKE use one two-station vehicle solver with yaw and pitch. Contact and control constraints
use a local heightfield approximation. The model separates these inputs:

| Boundary           | Parameters                                                                                           |
| ------------------ | ---------------------------------------------------------------------------------------------------- |
| Compiled vehicle   | Mass, geometry, inertia, suspension, wheel/brake data, drag, fixed drive split, powertrain           |
| Driving definition | Travel-direction steering, M/D/ACT, pedal actuators, TCS/ABS and shared dimensionless per-load tires |
| Composition policy | Fixed update step and form-specific two-wheel support protection                                     |

[Driving definition](../src/vehicle/driving-definition.ts) is the sole authority for game-wide driving
values; these are design values, not difficulty settings. Its immutable, nested plain data contains
travel-direction steering, M=65 degrees, D=20 degrees, ACT=0.3 seconds, throttle/brake traversal times,
`wheelSlip=true` and one common front/rear tire (GX=5, PX=0.2, GY=2.5, PY=0.1, KN=0.74).
[Calibration](calibration.md) describes units, pedal values and the shell-owned DEV grids.

Every vehicle creation receives this definition and an explicit form-specific support reserve.
Admission converts degrees and traversal times to runtime angles/rates and compiles the tire law.
Browser, race, reference/envelope tools, scenarios, startup smoke and image generation use the same
input. The wheel solver receives one required tire-characteristics field from the runtime tire calibration.
DEV can still replace live M/D/ACT and linked tire settings, preserving them on vehicle switches.
The front/rear runtime slots remain for now; both start with the same tire coefficients.

`SessionVehicle` includes the entire driving definition in `vehicleSha256`, invalidating reference
caches and rejecting stale browser envelopes and time budgets when any driving value changes.
The model source list also includes the driving module instead of shell selector modules.

The engine owns tire and steering low-speed regularization (both 1.0 m/s) in
`physics/numerical-constants.ts`. They are numerical constants, not vehicle or driving design values.
[Content and gameplay](content-and-gameplay.md#recovery) owns recovery outside the mechanical domain.

## State and integration

[Vehicle physics](../src/vehicle/physics/vehicle-physics.ts) owns world position/velocity,
yaw/pitch and their rates, wheel angular speeds, rack angle, three normalized actuators and automatic
gear state. Course coordinates, contact loads, accelerations and HUD quantities are observations.
Compiled vehicles and their nested data are immutable snapshots.

Each fixed update has 12 substeps. Semi-implicit Euler updates velocity before pose; yaw and pitch
wrap as angles. Gravity is 9.80665 m/s2. The body basis is:

```text
forward = (sin(yaw)*cos(pitch), sin(pitch), cos(yaw)*cos(pitch))
right = (cos(yaw), 0, -sin(yaw))
up = normalized(forward cross right)
omega = worldUp*yawRate-right*pitchRate
```

Vehicle compilation requires positive finite quantities and feasible geometry.
[Browser](browser.md#display-and-scheduling) owns the fixed-step schedule.

## Surface and contact

For curvature `kappa`, lateral coordinate `l` and height derivative `h'=dY/ds`,
require `J=1-kappa*l > 0`. Surface normal is proportional to
`worldUp*J-horizontalTangent*h'`; grade is `atan2(h',J)`.
The vehicle keeps its last observed s for the next center and contact projection. Spawn and
recovery supply their known route s. Each contact projects its free suspension reach point first.
If `inDomain:false`, it reads no surface position, metric, normal, grade or material. Its support,
compression, load and tire force are zero; its tire frame is invalid. Borrowed observations are
cleared so a preceding supported substep cannot contribute stale contact forces. Wheel and body
motion continue under the ordinary unsupported mechanics. Within the admitted coordinate domain,
compilation guarantees J>0, so contact sampling needs no second metric-domain check.

The free suspension reach offset is `forward*axleOffset-up*freeReach`, with velocity
`v+omega cross offset`. Supported material and an upright body permit unilateral contact:

```text
q = max(-gap,0)
qDot = -reachVelocity dot surfaceNormal
N = max(0,spring*q+damping*qDot+smoothBumpStop(q))
```

At `q >= qTravel`, the solver raises `VehicleOutsideModelError`. Degenerate projection of the steered
wheel direction onto the surface plane transmits zero tire force. The shared wrench combines contact,
wheel reaction, gravity and planar quadratic drag for protection and integration.

## Coordinate-domain recovery

The vehicle center's projected `inDomain` controls the coordinate-domain recovery condition.
A continuous 0.72 seconds outside triggers `outside-domain` recovery; returning inside resets the
outside timer. The same condition covers lateral exits and either end of the retained Route.
The interval matches the existing unsupported-time allowance: a short excursion can return, and
an unsupported vehicle can visibly fall (about 2.54 m from rest under gravity) before reconstruction.
Outside the domain, recovery does not query a fictitious surface normal or penetration plane.
Inside it, the existing support, penetration, fall-distance, overturn and suspension-travel rules
continue to apply; their broader airborne revision belongs to stage 8-7.

Recovery clamps the farther of current and last-safe route s to the retained extent, then backs up
8 m within it. Race composition resolves a Carriageway center at that final station, respecting
locked forks. Manual recovery uses the same target resolver. Explicit recovery targets are admitted
only inside the coordinate domain and on supported material. Reset steps award no crossing credit.

## Tire law

Positive GX/PX/GY/PY and `0 < KN < 1` define:

```text
muX = GX                  kX = (2-KN)*GX/PX
muY = GY                  kY = (2-KN)*GY/PY
```

PX/PY are dimensionless longitudinal/lateral slips. With wheel radius `r`, angular speed `Omega`,
contact velocities `vx,vy` and low-speed regularization `v0`:

```text
U = hypot(vx,v0)
sx = (r*Omega-vx)/U         sy = -vy/U
x = kX*sx/muX              y = kY*sy/muY
rho = hypot(x,y)/gripFactor
```

For `a=KN`, the smooth radial knee is:

```text
H(rho) = rho                              rho <= a
       = rho-(rho-a)^2/(4*(1-a))          a < rho < 2-a
       = 1                                rho >= 2-a
```

For nonzero demand, `(Fx,Fy)=N*gripFactor*H*(muX*x,muY*y)/hypot(x,y)`.
The linear region returns linear demand; zero load/grip returns zero force. For positive load/grip,
`(Fx/(N*grip*muX))^2+(Fy/(N*grip*muY))^2 <= 1`. Slip work is dissipative.
Pure-axis plateaus begin at `gripFactor*PX/PY`; simultaneous slip shares the ellipse and changes force direction.

## Wheel and powertrain

Each wheel solves the implicit signed torque balance using that same tire law:

```text
I*(Omega-OmegaOld)/dt+r*Fx(Omega)+rollingTorque(Omega)
  = driveTorque-signedBrakeTorque
rollingTorque = Cr*N*r*(r*Omega)/hypot(r*Omega,v0)
```

Zero wheel speed is the solution when it satisfies the static brake interval. Otherwise a finite
bracket and at most 60 bisections solve the monotone residual, with early return below 1e-10 N m
absolute torque residual. Contact reference speed stays fixed during the scalar solve.

The automatic powertrain derives RPM from drive-split wheel speed and current ratio, interpolates
powertrain torque, shifts using adjacent-ratio hysteresis and tapers torque to zero at redline.
Wheel torque uses the chosen ratio and efficiency; engine torque comes directly from the powertrain definition.

## Torque protection

TCS and ABS reduce requested torques independently at each station by inverting the wheel residual
at longitudinal slip boundary `grip*(2-KN)*muX/kX`. Low-speed ABS yields to the signed static brake solve.

Two-wheel support protection reserves 8% of static suspension compression against pedal-induced lift:

```text
qAcceleration+2*w*qVelocity+w^2*(q-reserve*qStatic) >= 0
w = sqrt(g/qStatic)
```

The acceleration uses the integration wrench and current angular motion. Drive checks front support;
brake checks rear support, each with an opposite loaded station. A feasible requested torque is delivered.
If the request fails but zero is feasible, 12 bounded bisections select a feasible sampled lower endpoint.
If zero also fails, pedal torque is zero and `supportFeasible=false`; ordinary contact, gravity and inertia continue.
The constraint applies to the current local support state.

## Actuators and steering

The solver consumes normalized steering and exclusive throttle/brake inputs. Keyboard and AI requests
use finite-rate actuators; active analog touch supplies direct displacement, then uses normal release.
Input arbitration is specified in [Browser](browser.md#driving-input).

For driver offset D and rack bound M, require `0 < D < M < pi/2`:

```text
beta = atan2(bodyLateralSpeed,hypot(bodyForwardSpeed,steeringV0))
automatic = clamp(beta,-(M-D),M-D)
requestedOffset = D*steeringActuator
```

The front-slip limiter reduces the requested offset around this automatic baseline. With pure-lateral
plateau onset `S=grip*(2-KN)*muY/kY`, projected front contact gives:

```text
q(delta) = c0+cc*cos(2*delta)+cs*sin(2*delta) <= 0
R = hypot(cc,cs)
Q(e) = q(automatic)+q'(automatic)*e+2*R*e^2
```

Since `abs(q'') <= 4R`, `q(automatic+e) <= Q(e)`. The offset interval is:

```text
center = -q'(automatic)/(4*R)
width = sqrt(max(0,center^2-q(automatic)/(2*R)))
allowedOffset = [min(0,center-width),max(0,center+width)]
deliveredOffset = clamp(requestedOffset,allowedOffset)
```

Including zero preserves neutral and permits partial corrective input. Degenerate, unsupported or
zero-grip contacts return the request. Finally clamp `automatic+deliveredOffset` to +/-M; the front
road-wheel angle equals this target each substep. The previous angle remains in state for the next
pre-steer contact observation and input limit, and for observations and the recovery reset to zero.
The target is computed from the pre-steer state before reorienting the front contact; the integration
order is unchanged. This is a conservative current-contact slip constraint.

## Observations

HUD observations include input, actuators, automatic steering, requested/delivered offsets, target/actual
rack and requested/delivered torques. Handwheel conversion is display-only. Bike lean presentation is
`atan2(lateralAcceleration,g)` with discrete bank images; physical state contains yaw and pitch.

Optional read-only tire telemetry publishes completed wheel-solve rolling/slip speeds, dissipated work,
loads and surfaces to audio. Recovery resets those observations. Graphics, HUD and sound consume
mechanical observations without contributing forces or alternate mechanical state.

## Vehicle and driving documents

`content/vehicles/<id>.json` stores one `superoutride.vehicle-definition` version 1 per vehicle.
`content/driving/default.json` stores the sole `superoutride.driving-definition` version 1.
[Calibration](calibration.md) owns tuning meanings and units. Document admission in
`vehicle/definition-document.ts` publishes detached, deeply immutable source and compiled products.

| Vehicle field       | Contract                                                                                                                                                                          |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `format`, `version` | `superoutride.vehicle-definition`, `1`                                                                                                                                            |
| `id`                | Nonempty filename-safe identity; equal to its manifest ID                                                                                                                         |
| `form`              | `car` or `bike`; one shared physical/display form vocabulary                                                                                                                      |
| `selectionOrder`    | Positive safe integer, unique across the catalog; ascending selection order independent of filenames and manifest order                                                           |
| `mechanics`         | All `VehicleDefinition` mechanical fields except `id`, including powertrain and the temporary HUD `steeringRatio`                                                                 |
| `sound`             | Existing ID in `VEHICLE_SOUND_PROFILES`; sound definitions remain TypeScript                                                                                                      |
| `metadata`          | Required manufacturer, model, period and mobileLabel strings; identifier (null or officialLabel/shortLabel); selectedSpecification string array; physicsAnchor (modelYear/market) |

Vehicle numerical domains and cross-field relationships are those of vehicle, suspension and
powertrain compilation: positive mass/inertia/geometry, finite nonnegative brakes/drag/damping,
front drive fraction in [0,1], feasible static suspension compression and ordered shift/gear/torque data.
No dimensions, sprite/palette references or support reserve are saved in this format.

The driving document has `format`, `version`, `id:"default"` and the current `DrivingDefinition`
fields: `automaticSteering:"travel-direction"`, `maxRoadWheelSteerDegrees`, `steeringOffsetDegrees`,
`steeringTraversalSeconds`, `throttle` and `brake` (each applySeconds/releaseSeconds), boolean
`wheelSlip`, and `tire` (gripX/peakSlipX/gripY/peakSlipY/knee). Angles are degrees, traversal times
are seconds, and tire values are dimensionless. Require 0 < offset < maximum < 90 degrees,
positive finite actuator rates after conversion, positive finite tire capacities/stiffness and
0 < knee < 1. Later game-wide launch/shift and pitch rules extend this same document rather than
creating separate assist configuration files.

Both readers reject missing required fields, unknown fields, wrong shapes, unsupported formats/versions,
invalid domains and unresolved sound IDs. Expected errors return `{ok:false,diagnostics}` containing
`kind:"input"`, `code`, the supplied `document` filename, JSON Pointer `path` and causal `message`.
Only explicit authored-domain failures become diagnostics; unexpected internal errors propagate.
Success returns `{ok:true,value}`; no partial product is published. Nested arrays and records are
copied and frozen, including powertrain gears/curve points, metadata and the driving tire/pedals.
The shared loader verifies manifest SHA-256 before decoding and admission, checks manifest/document
identity and selection-order uniqueness, then exposes the sorted immutable collection.
