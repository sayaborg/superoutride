# D sensitivity and a steering stop — mathematical assessment

Research only, 2026-09-09. Derived from current source101/114/119; no production steering changes.

## Finding

Separating sensitivity from a bounded offset is simple. Deriving a universal *stability* limit
from D or PY alone is not justified. Current D has two roles: slope of input-to-offset and maximum
offset at full input. It also subtracts from automatic alignment authority A=M-D.

The exact current parameter domain is 0<D<M<pi/2. Thus D18 or20 is mathematically valid with M60.
This domain ensures a positive automatic reserve, not a no-spin theorem.

## Minimal algebraic stop

Let u be the existing normalized steering actuator, D its sensitivity in radians per unit input,
and L a separately justified bound on travel-relative offset. Define, without new dynamic state:

```
E = min(D, L)
e = clamp(D*u, -E, E)
A = M-E
deltaTarget = clamp(clamp(betaTravel, -A, A) + e, -M, M)
```

For 0<E<M this reserves the actual reachable offset and one mechanical rack. In the unsaturated
region the input slope stays D. At |u|>=E/D the offset stops increasing. With illustrative L6deg,
D20 reaches the stop at30% stick; D18 at33.3%. L6 is an example, not a derived safe recommendation.
If L>=D this reduces exactly to the current law. Neutral remains travel alignment within A.
Increasing D above L no longer consumes extra automatic alignment reserve.

Hard clamp is continuous, symmetric and 1-Lipschitz in requested offset, with a derivative corner
at the stop. The existing physical rack response remains. A tanh substitute changes the response
before the bound and never reaches a finite hard stop; it is not needed for the stated mechanism.
A moving L/interval can itself move the target, so continuity in vehicle state also needs checking.

## What the tire mathematically supplies

For the current law kY=(2-knee)*GY/PY and rho=hypot(sx/(m*PX),sy/(m*PY))*(2-knee).
Full radial saturation begins at rho=2-knee. Its slip-space onset boundary is therefore

```
(sx/(m*PX))^2 + (sy/(m*PY))^2 = 1
```

This is an onset of force saturation, not a forbidden-slip boundary. At pure lateral slip sx=0,
|sy|=m*PY. With high-speed planar motion, v0 negligible, and local contact travel angle phi,
sy=tan(delta-phi). Hence |delta-phi|=atan(m*PY) at pure-lateral onset.
For m=1/PY=.08 that is4.573921deg. This is NOT D's universal maximum.

Reasons:
- Current betaTravel is CG travel, not front contact travel. On a flat body plane the front
  contact includes yaw velocity: phi=atan2(vLateral + frontAxle*yawRate, vLongitudinal).
  Pitch, support geometry and surface projection further belong to the existing contact observer.
- Exact regularized slip is sy=-Vy/hypot(Vx,v0). With contact speed V and alpha=delta-phi,
  |sy|=V*|sin(alpha)|/sqrt(V^2*cos(alpha)^2+v0^2). The pure-lateral onset instead satisfies
  sin^2(alpha)=(m*PY)^2*(V^2+v0^2)/(V^2*(1+(m*PY)^2)), when the RHS<=1.
  At rest there is no unique angle inferred from zero slip; applying the high-speed value would
  unnecessarily constrain low-speed maneuvering.
- Nonzero sx shares saturation with sy. The above ellipse gives an onset sy=m*PY*sqrt(1-
  (sx/(m*PX))^2), only for |sx|<=m*PX. It says when saturation begins, not the angle that maximizes
  lateral force or yaw correction. Clamping sy to zero when longitudinal slip is at onset could
  remove needed steering during braking/drive.
- Tire-coordinate lateral force, travel-normal force, body-lateral force and yaw moment are
  different objectives. Steering also rotates Fx/Fy. Even pure lateral saturation does not make
  extra steering harmless: when Fx=0, travel-normal force=Fy*cos(alpha), drag=Fy*sin(alpha).
- A front-force maximum alone does not establish rear grip, transient yaw capture or whole-car
  stability. Rear behavior, speed, yaw rate, load/torque and rack delay still matter.

## Decision

A stateless sensitivity-plus-stop is feasible and compact. The limit must be defined by a product
criterion. A fixed L is a transparent empirical input limiter. A tire-derived L approximately
limits front slip use; it needs local contact observation, braking interaction, low-speed/reverse/
airborne policies and an explicit change to101's no-tire/no-yaw-feedback Driver boundary.
Do not sell atan(PY) as a physical safety limit or quietly add it to current steering.

Before a production change, compare unmodified steering against a precisely defined candidate at
D12/18/20, both directions, new tire defaults and range edges, neutral release, countersteer,
braking/drive transitions, all nine profiles and60/120/240Hz. Record entered/corrected/exited beta,
yaw, actual contact slip, speed loss, steering target/actual and local force projections. Keep
ordinary world-state dynamics; no direct body corrections. Human analog-stick testing is required
for the requested feel, separately from algebraic boundedness and finite simulation.
