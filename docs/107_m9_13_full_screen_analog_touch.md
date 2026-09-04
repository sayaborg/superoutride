# M9.13 — Full-Screen Relative Analog Touch

Status: current normative touch-driving input and touch-driving presentation authority.

Vehicle handling remains `DEV_UNCALIBRATED`.

## 1. Scope and supersession

M9.13 replaces the previous fixed digital steering/throttle/brake touch-button driving path for real
touch pointers. It does not change keyboard driving semantics, steering law, tire law, vehicle
profiles, actuator-rate calibration, camera, course, route, topology or renderer authority.

M9.13 supersedes M9.1 mobile-touch statements only where they retained fixed digital steering and
exclusive fixed throttle/brake driving buttons. Course/vehicle/camera/calibration selectors remain
ordinary browser selectors.

The canonical pedal request boundary is generalized so a device may publish either:

```text
boolean shorthand: false / true == 0 / 1
normalized analog:  finite value in [0,1]
```

Throttle and brake remain mutually exclusive. Keyboard still publishes digital shorthand; touch
publishes normalized analog values. The canonical input also carries a generic apply mode so an
active analog touch can mean "this displacement is the current actuator amount" without creating a
second actuator state.

## 2. Architecture Decision Gate

1. Touch gesture interpretation belongs to the input adapter; its origin/vector indicator belongs to
   browser presentation.
2. Existing steering and pedal arbiters remain the single cross-device source authority.
3. Existing vehicle actuator state remains the single response state; no touch-specific vehicle
   state, rack, pedal state or handling mode is added.
4. Canonical steering remains one normalized request in `[-1,+1]`; canonical throttle/brake remain
   one mutually-exclusive request pair, now permitting magnitudes in `[0,1]`.
5. A generic input apply mode distinguishes ordinary rate-limited publishers from a currently-held
   direct analog publisher; it does not duplicate steering/pedal state.
6. No vehicle/profile/drive-layout/course/route branch is introduced into mechanics.
7. Frozen world-space physics, renderer depth, metric presentation and topology invariants remain
   unchanged.
8. Regression covers geometry, role ownership, simultaneous two-thumb use, direct held response,
   release-rate decay and origin/vector presentation.

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

While that touch remains held, the normalized steering actuator amount is exactly this request. ACT
is not an additional lag on the held analog displacement.

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
which both canonical pedals are positive. While the pedal touch remains held, throttle/brake
actuator amounts equal the current displacement request directly; moving back to the origin while
still held means exact zero immediately.

## 6. Initial full-scale displacement

The first calibration uses one portrait/landscape invariant rule based on the viewport short side:

```text
L = clamp(0.25 * min(viewportWidth, viewportHeight), 72 px, 120 px)
```

This is a DEV touch-feel calibration value, not a frozen physical metric. It may be tuned later
without changing the relative-origin architecture.

## 7. Direct hold and release-rate ownership

While a real analog touch pointer is active, its displacement is authoritative immediately:

```text
active steering touch -> steering actuator = steeringRequest
active pedal touch    -> throttle/brake actuator = current exclusive pedal request
```

No touch apply ramp is inserted and the keyboard ACT/apply-rate behavior is not reused while the
finger is held. This is the meaning of analog touch in M9.13: the finger position itself is the
current normalized control amount.

Pointer release/cancel removes that direct source, publishes ordinary neutral and removes its
origin/vector presentation. From that moment onward, the existing vehicle actuator release rate is
again authoritative:

```text
steering release -> current selected ACT release rate
throttle release -> existing throttle releaseRate
brake release    -> existing brake releaseRate
```

Thus M9.13 adds no second physical response state: it changes only how a held analog source applies
to the already-existing actuator state, then reuses the existing release dynamics after release.

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
publishes no steering or pedal magnitude. The full-screen capture path does not cancel the selector's
ordinary pointer/click behavior.

## 10. Executable acceptance

Release requires:

1. portrait and landscape use the same left/right viewport-half ownership rule;
2. steering is relative to pointer-down X and clamps exactly to `[-1,+1]`;
3. pedal input is relative to pointer-down Y and clamps to exclusive `[0,1]` throttle/brake;
4. the pointer role remains fixed after crossing the centerline;
5. steering and pedal touches work simultaneously;
6. initial `L` is exactly the 25%-short-side rule clamped to 72–120 CSS px;
7. while held, touch displacement reaches the existing steering/pedal actuator amount directly on
   the next mechanics update, including exact zero when returned to origin;
8. pointer release/cancel switches back to ordinary neutral and existing actuator `releaseRate`
   owns decay;
9. touch origin icons and axis arrows are presentation only and disappear on release/reset;
10. touch-capable layout hides the old fixed driving panels;
11. selector taps are not suppressed by the full-screen touch capture path;
12. keyboard remains digital and retains its ordinary rate-limited apply/release behavior;
13. no touch-specific vehicle state, tire state, steering law or vehicle-kind branch is added;
14. full exact-head CI passes before release.

Because M9.13 changes the canonical input boundary and current touch-driving authority, it requires a
standalone validation record under `docs/validation/README.md` before release.
