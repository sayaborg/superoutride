# M6.9 — World-space Validated Route Boundary Gates

## Purpose

M6.8 introduced a gameplay-only route DAG but intentionally did not decide routes from steering, screen position or raw chainage. M6.9 adds the missing physical producer for `ValidatedRouteBoundary`.

The rule is simple:

> **A route is selected only when the actual world-space vehicle motion crosses that route's authored physical gate in the valid forward direction and inside its width.**

## Authority flow

```text
previous world XZ ─┐
                   ├─> physical gate crossing validator
current world XZ ──┘              ↓
                         ValidatedRouteBoundary
                                  ↓
                              M6.8 DAG
```

No route decision reads:

- steering input
- screen X
- sprite overlap
- camera state
- raw chainage
- pseudo-depth

## Gate authoring

Every route choice has exactly one `TRANSITION` gate.
Every terminal route stage has exactly one `FINISH` gate.

A gate stores:

```text
center      world XZ
heading     world forward heading
halfWidth   physical lateral half-width
```

The compiler derives the forward tangent and right normal using the same Core heading convention as vehicle/course geometry.

Hard validation rejects:

- duplicate gate IDs
- non-finite geometry
- non-positive widths
- broken route-choice references
- FINISH gates targeting non-terminal stages
- duplicate gates for one choice/terminal
- missing transition gates
- missing terminal finish gates

## Runtime crossing rule

For the current active stage, only legal gates are considered.

Non-terminal stage:

```text
candidate gates = outgoing route-choice gates
```

Terminal stage:

```text
candidate gate = that terminal stage FINISH gate
```

A movement segment is tested against the transverse gate plane. The interpolated crossing point must also lie inside the gate's lateral width.

### Forward crossing

Exactly one legal forward crossing emits a validated route transition or finish event.

### Reverse crossing

A reverse crossing is observable for diagnostics but emits no validated boundary.

### Multiple forward crossings in one physics tick

If one step crosses more than one legal gate, M6.9 returns:

```text
AMBIGUOUS_FORWARD_CROSSING
```

and emits no route selection.

It does **not** resolve ambiguity by:

- first array element
- gate ID
- nearest screen position
- steering direction
- left/right heuristic

This keeps route authority deterministic and physical.

## DEV geometry

`createM6DebugRouteBoundaryGateSet()` supplies detached world-space test geometry for the M6.8 DEV DAG. It exists only to prove the route-gate mechanics.

It does **not** mean the current closed renderer course now has visible or drivable physical branches.

## Renderer / physics impact

None.

Vehicle physics remains `DEV_UNCALIBRATED` and unchanged.
The chainage-driven raster renderer remains unchanged.

## Validation

PR #19, Actions run 32615567512:

```text
166 tests
166 pass
0 fail
```

See `M6_9_VALIDATION.txt`.

## Next

The route foundation now has both sides:

```text
physical world gate crossing
        ↓
validated route event
        ↓
route DAG state
```

The next safe step is to decouple point-to-point run completion/timing from the old closed-course `RaceProgressUpdate` type so a validated terminal route FINISH can become product run completion without introducing lap semantics or touching vehicle handling.
