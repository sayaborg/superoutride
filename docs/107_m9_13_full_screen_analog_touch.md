# M9.13 — Full-Screen Relative Analog Touch

Status: current normative touch-driving input and touch-driving presentation authority.

Vehicle handling remains `DEV_UNCALIBRATED`.

## 1. Scope and supersession

M9.13 replaces the previous fixed digital steering/throttle/brake touch-button driving path for real
touch pointers. It does not change keyboard driving semantics, steering law, tire law, vehicle
physics, actuator rates, camera, course, route, topology or renderer authority.

M9.13 supersedes M9.1 mobile-touch statements only where they retained fixed digital steering and
exclusive fixed throttle/brake driving buttons. Course/vehicle/camera/calibration selectors remain
ordinary browser selectors.

The canonical pedal request boundary is generalized so a device may publish either:

```text
boolean shorthand: false / true == 0 / 1
normalized analog:  finite value in [0,1]
```

Throttle and brake remain mutually exclusive. Keyboard still publishes digital shorthand; touch
publishes normalized analog values. Both forms converge before the existing finite vehicle actuator.

## 2. Architecture Decision Gate

1. Touch gesture interpretation belongs to the input adapter; its origin/vector indicator belongs to
   browser presentation.
2. Existing steering and pedal arbiters remain the single cross-device source authority.
3. Existing vehicle actuator state remains the single response state; no touch-specific vehicle
   state, rack, pedal state or handling mode is added.
4. Canonical steering remains one normalized request in `[-1,+1]`; canonical throttle/brake remain
   one mutually-exclusive request pair, now permitting magnitudes in `[0,1]`.
5. No vehicle/profile/drive-layout/course/route branch is introduced into mechanics.
6. Frozen world-space physics, renderer depth, metric presentation and topology invariants remain
   unchanged.
7. Regression covers geometry, role ownership, simultaneous two-thumb use, saturation, release,
   actuator decay and origin/vector presentation.

## 3. Full-screen ownership

For a real touch pointer, the entire viewport is one driving input surface, including the rendered
game area and browser UI area.

At pointer-down only, viewport X selects the pointer role:

```text
clientX < viewportWidth / 2  -> STEERING
clientX >= viewportWidth / 2 -> ACCEL / BRAKE
```

The role is fixed for the lifetime of that pointer. Crossing the centerline later never changes the
pointer from steering to pedal or vice versa.

At most one active steering touch and one active pedal touch are accepted at a time. This preserves
the ordinary two-thumb model while preventing same-side pointer ambiguity.

## 4. Relative steering gesture

The steering pointer-down coordinate is the neutral origin:

```text
x0 = pointer-down clientX
x  = current clientX

steeringRequest = clamp((x - x0) / L, -1, +1)
```

Therefore:

```text
x == x0 -> 0
left     -> negative steering
right    -> positive steering
```

Perpendicular Y motion has no steering meaning.

## 5. Relative pedal gesture

The pedal pointer-down coordinate is the neutral origin:

```text
y0 = pointer-down clientY
y  = current clientY
axis = clamp((y0 - y) / L, -1, +1)
```

The single signed axis publishes an exclusive pair:

```text
axis > 0 -> throttle = axis, brake = 0
axis < 0 -> throttle = 0,    brake = -axis
axis = 0 -> throttle = 0,    brake = 0
```

Thus upward displacement is ACCEL and downward displacement is BRAKE. There is no touch state in
which both canonical pedals are positive.

## 6. Initial full-scale displacement

The first calibration uses one portrait/landscape invariant rule based on the viewport short side:

```text
L = clamp(0.25 * min(viewportWidth, viewportHeight), 72 px, 120 px)
```

This is a DEV touch-feel calibration value, not a frozen physical metric. It may be tuned later
without changing the relative-origin architecture.

## 7. Release and actuator ownership

Pointer release/cancel publishes exact neutral for that touch source and removes its origin/vector
presentation.

M9.13 does not add input-layer easing. The existing vehicle actuator remains authoritative for
finite apply/release response:

```text
steering -> current selected ACT apply/release rate
throttle -> existing throttle apply/release rate
brake    -> existing brake apply/release rate
```

Therefore touch displacement is an analog target request, while release decay remains the existing
vehicle `releaseRate` behavior.

## 8. Origin/vector presentation

Touch-down creates one transient origin indicator at the actual touch origin:

```text
left half  -> steering-wheel icon
right half -> pedal icon
```

The indicator remains at the origin. A direction arrow grows from that origin only along the
controlled axis:

```text
steering -> horizontal left/right arrow
pedal    -> vertical up/down arrow
```

The displayed label reports signed steering percentage or ACCEL/BRAKE percentage. Indicator vector
length saturates at the same `L` that produces a 100% request.

The origin/vector overlay is pointer-transparent and is never mechanics authority.

## 9. Legacy fixed touch driving controls

The old steering and pedal button elements remain temporarily in the DOM for non-touch fallback and
historical regression compatibility, but touch-capable layout no longer displays those fixed driving
panels. Real touch pointers ignore their old digital event path and use the full-screen analog path.

Selectors remain visible and tappable. Because the entire viewport is also the driving surface, a
selector tap may establish a zero-displacement touch origin during the tap; without displacement it
publishes no steering or pedal magnitude.

## 10. Executable acceptance

Release requires:

1. portrait and landscape use the same left/right viewport-half ownership rule;
2. steering is relative to pointer-down X and clamps exactly to `[-1,+1]`;
3. pedal input is relative to pointer-down Y and clamps to exclusive `[0,1]` throttle/brake;
4. the pointer role remains fixed after crossing the centerline;
5. steering and pedal touches work simultaneously;
6. initial `L` is exactly the 25%-short-side rule clamped to 72–120 CSS px;
7. pointer release/cancel publishes neutral and existing actuator `releaseRate` owns decay;
8. touch origin icons and axis arrows are presentation only and disappear on release/reset;
9. touch-capable layout hides the old fixed driving panels;
10. keyboard remains digital and continues through the same steering/pedal arbitration boundary;
11. no touch-specific vehicle state, tire state, steering law or vehicle-kind branch is added;
12. full exact-head CI passes before release.

Because M9.13 changes the canonical input boundary and current touch-driving authority, it requires a
standalone validation record under `docs/validation/README.md` before release.
