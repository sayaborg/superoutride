# M9.27 — One-Sided Steering Input Stop

Status: normative scoped replacement of121's input policy. Handling remains DEV_UNCALIBRATED.
Base:05a0f46a13a077b20e25c15e362acd047359ca93 (released M9.26).

## Concept

**切り過ぎる入力は止め、既に外れているときは戻す入力だけ通す。**

One fixed tire onset defines excess. A conservative quadratic supplies one interval. Include the
current automatic angle in that interval so zero input stays zero and partial correction passes.
This changes only driver-offset delivery. It is not a maximum-turning-force or stability controller.
The existing INPUT/USER(red cut)/AUTO/RACK HUD and D/M/ACT remain unchanged.

Do not grow the physical onset to match automatic steering. Do not select a component of a periodic
angle set. Do not add spin/speed/brake/profile branches, thresholds, lookup tables, state or filters.

## Fixed physical criterion and coordinate authority

Retain121's exact projected body/contact geometry. Tire characteristics supply one pure-lateral
onset S=gripFactor*(2-rhoKnee)*muY/kY. For projected wheel direction h(delta), tire-frame velocities
vx/vy and retained regularization v0, the fixed excess is

```
q(delta) = |h(delta)|² * (vy(delta)² - S²*(vx(delta)²+v0²))
         = c0 + cc*cos(2delta) + cs*sin(2delta)
```

q<=0 is exactly the pure-lateral slip inequality in valid contact geometry. Coefficients are the
same A/B/C projection from121, now with fixed S rather than max(S,abs(sy(automatic))). Coefficient
normalization is positive and does not change the result. Actual force still follows the unchanged
combined-slip ellipse and wheel/torque solver. No force, wheel Omega or pedal enters this criterion.

Outside the fixed criterion, q is a specific velocity-squared constraint residual, not tire force
and not slip-ratio magnitude. Do not claim that decreasing q always decreases |sy| on a tilted plane.
The front-only criterion deliberately makes no statement about rear force, load transfer or yaw
stability. Ordinary handling comparisons cannot establish a force maximum.

## One conservative interval, including the infeasible case

Let b be retained automatic steering and d be requested driver offset, R=hypot(cc,cs).
For a valid projection and positive friction, R=0 implies a strictly negative constant q: there
exists a wheel direction of zero lateral velocity, and v0>0. Thus all inputs pass at R=0.
For R>0, the global curvature bound |q''|<=4R gives the exact certificate

```
q(b+e) <= Q(e) = v + g*e + 2R*e²
v = q(b)
g = q'(b)
c = -g/(4R)
w = sqrt(max(0, c²-v/(2R)))
I = [c-w, c+w]
e = clamp(d, min(0,c-w), max(0,c+w))
target = b+e
```

I is precisely the set minimizing max(0,Q). If Q can be nonpositive, I is its zero-excess interval.
If it cannot, I is its unique vertex (w=0), the best certified correction. Clamping the discriminant
to zero therefore solves the same convex objective; it is not a tuned fallback or a state detector.
Including zero lets the driver move partway toward I without manufacturing input at neutral.

When v<=0, every permitted point has Q<=0, hence q<=0. When v>0, convexity gives Q(e)<=Q(0)=v
throughout the permitted correction path, hence actual q(b+e)<=v. At a local maximum of q with
g=0 and v>0, this conservative rule allows zero input; it does not choose an arbitrary escape side.
It can deny an improvement that the exact nonconvex set would permit. That conservatism is explicit.
It is NOT the old opposite-side allowance of equal baseline |sy|.

The request-to-output map is monotone and1-Lipschitz, includes zero, never reverses or amplifies
input, and preserves b. Under continuous valid positive-friction contact data it is continuous in
state. At R→0 the negative constant term makes the interval cover any finite request. It is not
necessarily differentiable at interval/vertex transitions. This is a conservative interval, not an
exact maximum useful angle. On flat standstill it passes the full request; a severely tilted static
projection may be conservatively restricted by the same quadratic.

## Boundaries and implementation cost

The retained no-force-transmission, invalid-frame, zero-friction and nearly singular projection
bypasses remain121's physical-domain boundary. The dot(up,normal)>1e-8 condition is retained
floating-point conditioning, not a handling threshold. No claim of global continuity spans those
contact/bypass switches. Full-step telemetry may also hide intermediate substep changes.

Automatic allocation remains A=M-D. Mechanical M remains the caller's authority: |e|<=|d| and
|b|<=M-D retain the final mechanical bound without passing M into the limiter. One actual rack and
its existing lag remain; no target writes actual rack directly. No extra contact sample is added.
Both policies are O(1). New code uses the already computed sin/cos of b, one hypot and one square
root; it removes baseline-slip normalization, atan2/acos and angular root enumeration. It performs
no force evaluation or wheel root. Actual timing is recorded separately, not inferred as device FPS.

## Architecture gate and supersession

1. Owner: existing common steering-input function; same contact and tire compiler authorities.
2. Primitive: fixed tire excess plus its analytic curvature bound; ordinary clamp.
3. No duplicate geometry, tire coefficients, dynamic state, filters or mechanical maximum.
4. No vehicle, mode, route, drive-layout, braking or speed schedule branch.
5. One shared mathematical rule is simpler than extending component selection with exceptions.
6. Tire/wheel/torque/contact force, world dynamics, renderer, metric and topology laws remain.
7. Regressions verify the independent geometric excess, certified paths, one-sided input, the
   former tangent discontinuity, all-nine actual substeps, neutral, projection and HUD attribution.

This supersedes121's baseline inflation, connected-component selection, exact pure-axis stop
location and no-worse-|sy| claim. Its source-pattern assertions for acos/atan2 and exact old-law
angle tests are replaced explicitly. Retain its frame equivalence, all-nine target identity and
HUD tests. No other physical regression is weakened. Historical documents/evidence stay unchanged.

## Evidence and limits

The research report in research/M9_27_STEERING_STOP_ASSESSMENT.md records comparisons, including
adverse braking results. The change implements a simpler input rule; it is not a claim that all
handling improves. M9.26's low-grip full-brake instability is not solved and can become larger.
Neutral recovery laws remain unchanged; no empirical run is a proof of general recovery.

Run tools/steering-input-stop-probe.mjs with --baseline pointing to a compiled M9.26 dist and
--out for JSON. It preserves identical initial states,7 input schedules across9 profiles,2 grips,
D12/20, signed/refined high-speed braking, and identical reached-state VFR braking forks.

This normative change requires implementation/doc/test green exact-head CI, a new immutable
validation record, record-inclusive green CI, non-force fast-forward main and matching Pages.
