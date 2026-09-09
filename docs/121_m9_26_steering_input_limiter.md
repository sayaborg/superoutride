# M9.26 — Steering Input Limiter and Steering HUD Attribution

Status: normative scoped control/HUD change. Handling remains DEV_UNCALIBRATED.
Base release:088013d4c6bb665c9cd4b5d8937de6f376f99b15. User requests implementation after audit.

## Decision and name

Use “操舵入力リミッター / Steering Input Limiter”. It reduces requested driver offset; it is
not a mechanical rack stop, force optimizer, tire-force clamp or guarantee of vehicle stability.
D remains input sensitivity and maximum requested offset. M remains mechanical stop. A=M-D remains
unchanged automatic allocation. Tire defaults/ranges and unscaled engines from120 remain unchanged.

Reject the earlier instantaneous travel-normal-force maximum as a limiter objective. A spinning/
braking wheel can shift that maximum to much larger angles; a locked isotropic tire can make it
undefined. Preserve the [user audit](research/M9_26_STEERING_LIMITER_USER_AUDIT.txt) verbatim.
The [assessment](research/M9_26_STEERING_LIMITER_AUDIT_RESPONSE.md) distinguishes accepted findings,
conditions on its formulas and the actual published browser defaults.

Use the front tire's **pure-lateral capacity-onset slip**, not total combined-slip utilization:

```
s0 = m*(2-a)*muY/kY = m*PY
```

This is an explicit input policy, not a proof of maximum turning force or remaining combined grip.
Using total rho as an absolute gate would exhaust the steering budget under longitudinal slip;
this policy deliberately avoids freezing countersteer when braking/locked. Wheel Omega, throttle,
brake and sampled tire forces do not enter this limiter. The ordinary combined-slip tire and
TCS/ABS continue to own actual forces and torques.

## Exact control law and neutral preservation

Let u be the existing normalized actuator, beta the retained CG travel direction, D/M calibration:

```
b = clamp(beta, -(M-D), M-D)
d = u*D
sAllowed = max(s0, abs(sy(b)))
I = connected component containing b of {delta in [-M,M] : abs(sy(delta)) <= sAllowed}
t = clamp(b+d, I.lower, I.upper)
e = clamp(t-b, min(0,d), max(0,d))
deltaTarget = b+e
```

Only e replaces the old driver offset in the ordinary target/rack path. Exactly e=0 when d=0;
e never changes sign or exceeds d. No automatic baseline is reduced or increased. The explicit
baseline allowance means that when automatic alignment already exceeds s0, driver input may not
worsen its absolute front slip along the permitted connected path. It does NOT force the car back
inside s0 or guarantee global recovery. This avoids an empty admissible set forcing unsolicited
steering. It can permit the same absolute slip on the opposite side of the baseline's lower-slip
region; that is a stated consequence of this symmetric slip budget, not hidden yaw control.

A remains M-D, not M-|e|: recomputing automatic authority from a changing reduction would itself
move automatic steering and mix input restriction with self-steering. Existing rack exponential
response and normalized actuator remain the only steering dynamic states. The target is bounded;
actual rack lag can temporarily leave a newly changed slip envelope and is not directly clamped.

No force transmission, zero friction or invalid tire frame passes d unchanged. A nearly singular
body-plane/contact-plane projection (dot(body.up,normal)<=1e-8) also bypasses. At exact rest sy=0
for all headings, so the complete requested mechanical range passes without a speed table. Low
speed enlarges the available range through the existing hypot regularization;45deg is not a
mandatory stop. A locked wheel does not create a separate case or a new undefined optimization.

## Surface projection and closed-form interval

The existing contact observer supplies surface normal n and reach velocity v, including body
angular motion. Front contact position, velocity and normal load do not depend on steer angle in
this model. Derive them once before steering; reorient the same observation for actual tire solve.
The extracted contact-frame function is the sole orientation authority and is tested against full
contact observation at multiple steer angles. No second geometry/load sample is introduced.

Let f/r be body forward/right and P=I-n*n^T. Define a=P*f, b=P*r. The unnormalized projected
wheel direction is h(delta)=a*cos(delta)+b*sin(delta); actual tire forward is h/|h|. Let

```
ax=v·a; bx=v·b
ay=v·(n×a); by=v·(n×b)
aa=a·a; ab=a·b; bb=b·b
S=sAllowed; z=v0^2
A=ay^2-S^2*(ax^2+z*aa)
B=by^2-S^2*(bx^2+z*bb)
C=ay*by-S^2*(ax*bx+z*ab)
```

The exact regularized slip inequality, after multiplying by its positive denominator, is

```
q(delta)=A*cos(delta)^2+2*C*sin(delta)*cos(delta)+B*sin(delta)^2 <= 0
        = c0+cc*cos(2delta)+cs*sin(2delta) <= 0
c0=(A+B)/2; cc=(A-B)/2; cs=C
R=hypot(cc,cs); phase=atan2(cs,cc)
roots: delta=(phase +/- acos(-c0/R))/2 + k*pi
```

Intersect with [-M,M], where M<pi/2. Enumerating the two root families and three periods is fixed
work, not an iterative tire/angle solve. Crossing slope identifies the connected interval containing
b. Tangencies do not divide that interval. Normalize coefficients before root evaluation;1e-14 is
relative coefficient tolerance,1e-12 radians is boundary classification tolerance. Floating-point
regressions allow only small numerical slip excess and enforce one-sided input reduction exactly.

The limiter adds no wheel-root iteration, tire-force evaluation, speed schedule, lookup table,
front/rear force allocation or iterative optimizer. Live performance must still be measured.

## Supersession and architecture decision gate

This explicitly supersedes101's prohibition on contact/tire observations for this stateless input
reduction only. It retains its CG travel transform, A=M-D, D/M/ACT, actuator and rack. It explicitly
supersedes80 section5's retired useful-steer prohibition only for this new feature. The old M8.0
front-utilization cap, steering-only low-speed path and usefulLateralCapacity feedback are NOT
restored. No old/new mode or compatibility flag exists.120's “study only” status is superseded by
this narrowly defined implementation, not by implementation of the rejected J optimizer.

1. Common steering target owns reduction; tire compiler owns coefficients; contact owns geometry.
2. Reuse existing slip law, body basis, one sampled contact and final rack response.
3. Add only read-only control telemetry, never new physical state or stored limit calibration.
4. One law for every profile, route and input device. No drive-layout or vehicle identity branch.
5. Derive the interval algebraically; do not tune a speed table or add a second controller.
6. Preserve original tire/wheel/torque equations, world dynamics, contact loads, renderer and topology.
7. Verify projection equivalence, dense independent slip oracle, signed interval boundaries,
   zero input/bypass, all-nine refined dynamics, HUD attribution and reference mechanics.

## HUD contract

The existing steering column becomes four signed meters:

- INPUT: canonical raw steering input, normalized [-1,1].
- USER: delivered driver offset / D in cyan; red is requested actuator offset minus delivered / D.
- AUTO: automatic alignment b / M in green, including countersteer direction.
- RACK: actual physical front angle / M in cyan; handwheel remains the existing presentation.

INPUT and USER share the input scale; AUTO and RACK share the mechanical-angle scale. These are
not four additive normalized bars. Target angle equals b+e in radians; rack may lag. Actuator lag
is not red. Neutral canonical input can temporarily coexist with residual USER due to release rate.
Telemetry is captured at the final mechanics substep and consumed only by HUD/diagnostics. No HUD
calculation feeds control. Recovery clears observations through existing control-state reset.

## Regression and release policy

The old exact steered trajectory cannot remain a reference after an explicit steering law change.
The pinned b70 comparison now retains all1152 signed wheel cases and exact unsteered drive/brake
trajectories for all nine profiles and three rates. Only four new zero steering telemetry fields
are omitted after explicit zero validation. No actual physical state/force/torque is dropped or
rounded. New steering behavior is verified separately against an independent geometric slip oracle.

The former M9.21 low-grip assertion of near-identical *whole-run peak beta* at25% vs100% braking
is superseded: state-dependent input limiting can change subsequent steering. Its two actual
trajectories, mechanical budgets and neutral-release comparison remain. This is not removal of
ABS slip/torque tests or relaxation of their wheel-level guarantees. Other tests remain enforced.
HUD count assertions change only for two additional steering meters/labels; pedal red intervals
remain tested exactly. Historical documents/research/evidence are unchanged.

Normative control/HUD change requires green exact implementation CI, new standalone record,
record-inclusive green CI, non-force exact-head main and same-SHA Pages verification under AGENTS.

## Local evidence and remaining handling limits

Initial complete suite856/856 passed with the pinned reference. Independent projection tests cover
500 signed/tilted cases and their connected paths. Integration covers nine profiles, both signs,
D12/18/20 and60/120/240Hz. Actual browser screenshot verifies INPUT/USER/AUTO/RACK layout.
Node24.18.0 macOS/ARM64 microbenchmark:100000 active limiter calls per batch took20.72ms first,
then12.71/12.37/11.82/11.71ms. This excludes rendering and is not a frame-rate certification.

Algebraic boundedness is not a proof of general target continuity when a feasible component merges
at a tangency; the retained rack response does not turn it into such a proof. Human analog feel,
state-dependent permission changes and general recovery/stability remain empirical acceptance
work. Neutral target identity and one-sided reduction are exact, narrower guarantees.
