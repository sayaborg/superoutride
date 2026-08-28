# M8.0 Phase 9 Ideal Vehicle Physics Architecture Freeze

Status: **architecture frozen**. Vehicle handling/content values remain `DEV_UNCALIBRATED` unless a later milestone explicitly calibrates them.

This milestone supersedes the vehicle-physics architecture decisions of M7.0, M7.3 and M7.4 where they conflict with this document. Those earlier milestone documents remain immutable historical records.

The Phase 9 design was independently falsified and hostile-audited before implementation. The final audit reopened one narrow mechanics boundary: wheel spin angular-momentum magnitude change had to react on the body in addition to wheel-axis gyroscopic reorientation. M8.0 closes that defect without adding persistent state or tuning parameters.

## 1. Architecture decision gate

1. World X/Y/Z and physical body orientation are physics authority. Guide `(s,l)` remains derived observation/cache only.
2. CAR and BIKE share one ordinary surface/contact/tire/wheel causal chain; they differ only where their rigid-body mechanics genuinely differ.
3. No stored `CONTACT/AIRBORNE`, tire-force memory, target attitude, hidden assist or behavior mode is authoritative.
4. Powertrain and brake act through wheel torque. Tire contact is the only route from wheel torque to body longitudinal force.
5. SurfaceMap owns support geography, relative grip and rolling resistance. Tire profiles own reference friction and stiffness.
6. Course/profile compilation rejects configurations outside the model envelope instead of installing runtime clamps or mode branches.
7. Mechanizable invariants are regression-tested.

## 2. Authoritative state

### CAR

```text
CG world position xyz
CG world velocity xyz
yaw / pitch
yawRate / pitchRate
frontSteerAngle
frontWheelOmega / rearWheelOmega
powertrain-owned rotational/gear state
```

CAR is a five-DOF body: translation xyz + yaw + pitch. There is no CAR roll DOF and no four-independent-wheel baseline.

### BIKE

```text
CG world position xyz
CG world velocity xyz
body quaternion
body angular velocity xyz
frontSteerAngle
frontWheelOmega / rearWheelOmega
powertrain-owned rotational/gear state
```

There is no stored lean Euler angle. Lean and lean rate are derived from the quaternion, body angular velocity and current surface normal.

### Derived only

Guide coordinate/cache, body-frame speed, support availability, gap, compression, normal load, force-transmitting/load-free/geometric-separation observations, tire frame, slip, utilization, wheel angular momentum, HUD state and presentation anchor are derived.

## 3. Bankless surface and Guide geometry

Frozen Core remains bankless:

```text
Y(s,l) = Y(s)
```

The same HeightProfile authority returns smooth `H` and analytic `dH/ds`; no second physics height source exists.

For Guide metric `mu`, signed planar curvature `kappa`, and actual lateral offset `l`:

```text
Hsigma = (dH/ds) / mu
A      = 1 - kappa*l
S_sigma = A*t + Hsigma*up
S_l     = right
```

The upward surface normal is derived from those tangents. The compiler/runtime geometry contract requires `A > 0` everywhere in the normal drivable envelope.

Guide local location may explicitly fall back to global reacquisition when its cache is invalid. Reacquisition never changes world pose.

## 4. Two contact stations and suspension

Both models use only `FRONT` and `REAR` stations. CAR stations are axle resultants; BIKE stations are physical wheels.

Each station has body-fixed free-reach geometry and a unilateral Kelvin-Voigt suspension:

```text
g = dot(P_reach - P_surface, n)
withinReach = supportAvailable && g <= 0
q = withinReach ? -g : 0
qDot = withinReach ? -dot(vReach,n) : 0
N = withinReach ? max(0, k*q + c*qDot + Fbump) : 0
```

Surface normal is frozen within one numerical substep. Body/steer motion of BIKE crown reach geometry is differentiated analytically. Exact nonlinear normal-foot solving and finite-difference history state are not used.

`q >= qTravel` is `OUTSIDE MODEL`; physics does not position-clamp the body. Gameplay may later recover/crash explicitly.

Suspension source authority is ride frequency, damping ratio, bump/travel/bump-force data and desired static pose. Static-load compilation derives:

```text
mEff = Nstatic/g
k    = (2*pi*f)^2*mEff
c    = 2*zeta*sqrt(k*mEff)
qStatic = g/(2*pi*f)^2
```

and requires `0 < qStatic < qBump < qTravel`.

## 5. Tire law

Every station has one normalized stiffness `k_i`; compiler output is:

```text
C_i = k_i*Nstatic_i
```

Slip uses one finite low-speed regularization:

```text
Vref = sqrt(Vx^2 + v0^2)
sx = (Reff*Omega - Vx)/Vref
sy = -Vy/Vref
Dx = C*sx
Dy = C*sy
```

Capacity is:

```text
muEff = muRef*gripFactor
Fmax  = muEff*N
rho   = hypot(Dx,Dy)/Fmax
```

The final force uses one radial C1 transition: exactly linear through `rhoKnee`, smoothly approaches the friction-circle magnitude, and remains on the plateau after `2-rhoKnee`. There is no post-peak drop, no `kx/ky` split and no tire-force memory.

Baseline global tire-law values are `rhoKnee=0.80`, `muRef=1.25`, `v0=1.0 m/s`; exact per-vehicle stiffness/content values remain profile calibration.

## 6. Implicit wheel rotational solve

Each station owns one authoritative `Omega`. Backward Euler solves the monotone scalar equation:

```text
Iw/h*(Omega-Omega_n)
- Tdrive
+ Reff*Fx(Omega)
+ Trr(Omega)
+ brake atom
= 0
```

Rolling resistance is one continuous monotone wheel torque using the existing `v0`:

```text
Trr = crr*N*Reff * (Reff*Omega / sqrt((Reff*Omega)^2 + v0^2))
```

Brake is a Coulomb atom. If the no-brake residual at zero lies inside `[-Tb,+Tb]`, the unique next state is `Omega=0`; otherwise the appropriate signed branch is solved by bounded bisection. Standing start and lock-through-zero require no separate physics mode.

## 7. Powertrain, brakes and drive topology

Powertrain output authority is **wheel torque**, never direct body force. Engine/gear/coupling state may persist, but world/body linear speed remains external to the powertrain.

M8.0 baseline drive topology is deliberately simple:

```text
CAR  rear-drive
BIKE rear-drive
```

FRONT and REAR station brake-torque maxima are explicit vehicle-profile authority. There is no automatic ABS or traction-control physics baseline. Wheel lock, slip and utilization are derived telemetry.

## 8. CAR Virtual Driver

The old M7/M9 front-only limiter and speed-dependent rack map are retired.

When both stations are force-transmitting and tire frames are valid, each axle useful lateral capacity is:

```text
FyUseful_i = sqrt(max(0,(rhoKnee*Fmax_i)^2 - Dx_i^2))
```

Steady yaw-moment feasibility gives:

```text
ayUseful = min(
  FyUsefulFront*L/(m*b),
  FyUsefulRear *L/(m*a)
)
```

Required axle slips and bicycle curvature then produce one closed-form useful steering magnitude. Raw steering is capped to that magnitude unless evaluating the frozen current state shows raw input immediately reduces front utilization relative to the capped target; that physical countersteer escape returns full raw rack authority. There is no automatic countersteer.

CAR profiles must have positive baseline understeer gradient; for the normalized one-k model this is enforced as:

```text
kFront < kRear
```

Power-oversteer/drift still arises naturally when rear longitudinal demand consumes rear combined-slip capacity.

## 9. BIKE crown geometry and Rider

Each BIKE wheel has one physical crown radius `rho` in addition to rolling radius `R`.

```text
nCrossRaw = n - dot(n,fWheel)*fWheel
nCross    = normalize(nCrossRaw)
P_reach   = P_free + rho*(uBody-nCross)
Reff      = (R-rho) + rho*dot(uBody,nCross)
```

The same `R/rho` authority therefore owns contact migration and effective rolling radius. Compiler invariants require, per wheel:

```text
qStatic < crownRadius < rollingRadius
```

No camber-thrust stiffness parameter is added.

Player steering input means lean intent. Rider capacity uses the **same front/rear moment-feasible rule as CAR**, not a sum-only capacity:

```text
ayUseful = min(
  FyUsefulFront*L/(m*b),
  FyUsefulRear *L/(m*a)
)
phiCapacity = atan(ayUseful/g)
```

Then:

```text
phiUseful = clamp(phiIntent,-phiCapacity,+phiCapacity)
kappaIntent = g*tan(phiUseful)/(V^2+v0^2)
deltaFF = atan(L*kappaIntent)
deltaTarget = deltaFF - Kphi*(phiUseful-phi) + Kd*phiDot
```

Rider applies steer only. There is no direct roll/yaw torque and no `bankTarget` physics.

## 10. Wheel angular momentum — final hostile-audit closure

Wheel spin angular momentum is:

```text
H_i = Iw_i*Omega_i*bWheel_i
```

Because `Omega` and wheel-axis orientation both change, body reaction must include both pieces of `-dH/dt`:

```text
Mwheel_i = -Iw_i*OmegaDot_i*bWheel_i
           - omegaAxis_i cross H_i
```

Rear axis:

```text
omegaAxisRear = omegaWorld
```

Front axis:

```text
omegaAxisFront = omegaWorld + deltaDot*uBody
```

This closes the final audit defect. It introduces no persistent state: `OmegaDot` is derived from the solved current/previous wheel state. BIKE integrates the full vector. CAR has no roll DOF, so only the allowed pitch/yaw projections enter its reduced body; constrained components are reaction forces of the reduced model.

Natural gyro response remains active airborne. No airborne steering return, bank return, yaw damping or wheel damping is added.

## 11. Rigid-body integration and numerical contract

Outer simulation remains fixed 60 Hz. Every vehicle update uses uniform:

```text
Nsub = 12
h = 1/720 s
```

Offline falsification reference is `Nref=80`; it is not runtime cost.

CAR updates force/moment to velocity/rates and then pose. BIKE forms temporary world angular momentum `R*I*omegaBody`, adds external/contact/wheel moments, derives next body angular velocity and updates its quaternion by exponential map. World angular momentum is not persistent state.

BIKE principal inertias are positive and satisfy rigid-body triangle inequalities.

## 12. Aero and speed envelope

Baseline aerodynamic force is planar quadratic drag at the CG:

```text
Fdrag = -cD*|vPlanar|*vPlanar
```

Baseline wind is zero. There is no aero CP moment and no vertical aero when omission materiality remains within the profile gate. If measured vertical aero exceeds roughly `0.10 mg` at maximum normally attainable speed, the first extension is one quadratic vertical force at the CG only.

No runtime top-speed clamp exists. Profile and finite-course compilation must keep normal attainable speed within the validated envelope; 100 m/s is a finiteness stress, not normal authoring.

## 13. Surface authority

SurfaceMap material owns only:

```text
supported
gripFactor
rollingResistance
```

There is no `driveScale` and no absolute surface `mu` competing with tire `muRef`. Banking, `bankGripBonus`, corner/runtime grip boosts and course-dependent hidden force modifiers are forbidden.

## 14. Recovery and model switching

Recovery is an explicit gameplay discontinuity which reconstructs one valid authoritative state at an authored supported location. It is not a physics mode.

Running CAR↔BIKE state adoption is retired because the bodies own different attitude state. DEV switching performs a safe-spawn reconstruction of the selected model instead.

## 15. Explicitly retired M7 authorities

The following must not reappear without a new falsification and architecture decision:

```text
stored CONTACT/AIRBORNE phase
maxFallSpeed / maxYawRate / maxLateralSpeed / top-speed clamps
supported body-y snapping / pitchTarget
CAR halfWidth/supportFraction probes
CAR tire-force memory / relaxation-length state
BIKE bankTarget or low-speed upright torque
speed-dependent steering lookup/rack envelope
direct body drive/brake force
automatic ABS/TCS intervention authority
SurfaceMap driveScale or absolute mu authority
running CAR-BIKE adoption
behavior-specific jump/landing/drift/wheelie/stoppie modes
airborne damping/return corrections
```

## 16. Validation contract

M8.0 regression coverage must mechanize at least:

- world velocity/pose authority and Guide-derived observation;
- absence of stored contact phase and direct body drive/brake path;
- CAR 5DOF/no-roll and positive-understeer compiler gate;
- BIKE quaternion/omegaBody, inertia triangles and crown invariants;
- analytic HeightProfile differential and `A>0` surface-domain gate;
- one-k radial C1 tire continuity, standing start and wheel lock through zero;
- monotone rolling-resistance/brake-root behavior;
- full wheel angular-momentum reaction including `Iw*OmegaDot`;
- no tire memory, hidden ABS/TC, `driveScale`, bankTarget or running model adoption;
- OYS/recovery, lean pulse/steady lean, load transfer, wheelie/stoppie/crest/recontact and numerical convergence families as implementation validation grows.

## 17. Handling calibration boundary

Architecture Freeze is not Handling Calibration Freeze. Mass, geometry/inertia within compiler bounds, ride parameters, crown radius, tire stiffness, engine/gear/brake values, drag, Rider/Driver actuator calibration, surface grip factors and course authoring margins remain content/calibration authority. Human driving evaluation may change them without reopening architecture so long as all compiler and regression invariants remain satisfied.
