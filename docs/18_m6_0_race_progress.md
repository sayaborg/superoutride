# M6.0 — Validated Race Progress Foundation

## 1. Purpose

M6.0 implements the first gameplay/race-rule layer required by Core §61 without changing renderer authority.

The separation is explicit:

```text
world vehicle state
    ↓
world→Guide chart
    ↓
s_car / GeometricCoursePosition      geometry authority

world movement segment
    ↓
ordered physical race gates
    ↓
s_progress                           gameplay/race authority
```

`raw s_car` never directly increments lap or validated race progress.

---

## 2. GeometricCoursePosition

Core §5 permits a closed-course geometry representation:

```text
GeometricCoursePosition {
    lap
    sLocal
}
```

M6.0 provides a geometry-only tracker for this representation.

It observes seam crossing from ordinary frame-to-frame `sLocal` continuity:

- high `s` → low `s`: geometric lap +1
- low `s` → high `s`: geometric lap -1

This tracker is not ranking/lap race authority.

Recovery and teleport use explicit resynchronization rather than pretending the discontinuity was driven motion.

---

## 3. Race gates

The gameplay race rule uses physical world-space transverse gates.

For a gate authored at chainage `s_gate`:

1. sample the Guide center and heading at `s_gate`;
2. construct its forward tangent `t`;
3. construct its right normal `n`;
4. use the Guide `lMax` envelope as the gate half-width.

No independent runtime checkpoint-width tuning parameter is introduced.

The current DEV course uses:

```text
CP1    L/4
CP2    L/2
CP3    3L/4
FINISH 0
```

where:

```text
L = 776.5128086698837 m
```

The quarter-lap positions are DEV authoring, not renderer rules.

---

## 4. Physical crossing test

Let a vehicle world movement during one physics update be:

```text
P0 → P1
```

and gate center be `G`.

Signed forward-side distances are:

```text
a0 = dot(P0-G, t)
a1 = dot(P1-G, t)
```

A forward crossing requires the movement to pass from the rear side to the forward side. A reverse crossing uses the opposite sign transition.

The exact segment/gate-plane intersection parameter is:

```text
u = -a0 / (a1-a0)
```

At the intersection point, the lateral displacement is tested against the gate envelope using `n`.

Therefore a world→course projection jump alone cannot score a checkpoint: the actual world movement segment must intersect the authored gate inside its valid lateral span.

---

## 5. Ordered validation

Race state contains:

```text
lapIndex
nextGateIndex
sProgress
direction
acceptedGateCount
reverseCrossingCount
shortcutViolationCount
```

Only the expected gate can advance race state.

```text
CP1 → CP2 → CP3 → FINISH
```

An out-of-order forward crossing is rejected as a shortcut attempt.

A reverse crossing is recorded but awards no progress.

`FINISH` increments `lapIndex` only after the complete ordered sequence has been accepted.

---

## 6. Teleport / recovery protection

At most one forward gate may be accepted in one physics update.

This is intentionally conservative. A legitimate vehicle at the current speed/timestep cannot traverse the spacing between multiple race gates in one tick, while a teleport or recovery discontinuity could geometrically intersect multiple gate planes.

Recovery therefore uses explicit race-observation resync:

```text
resyncRaceProgressPosition(...)
```

This changes only the observation origin. It does not:

- award a checkpoint;
- increment a lap;
- erase already validated progress.

The geometry tracker is resynchronized independently.

---

## 7. s_progress semantics in M6.0

M6.0 deliberately uses a conservative gate-validated progress value.

```text
accepted CPn
→ s_progress = lap*L + CPn.s

accepted FINISH
→ lap += 1
→ s_progress = lap*L
```

Between accepted gates, raw geometric `s_car` does not directly move `s_progress`.

This makes the authority boundary unambiguous first. A later gameplay milestone may add continuous within-sector ranking interpolation, but that interpolation must remain bounded by the validated gate sequence and must not restore raw `s_car` as race authority.

---

## 8. Runtime integration

The driving loop now performs:

```text
world physics update
→ recovery check
→ if recovery:
       geometry resync
       race observation resync
  else:
       geometry tracker update
       race-gate validation
→ camera update
→ existing renderer
```

The renderer does not receive race progress and has no checkpoint-specific draw path.

The HUD exposes the separation for debugging:

```text
RACE ...  validated gameplay state
GEO  ...  geometric lap + local chainage
```

M5.9 tunnel selection continues to use geometric camera chainage exactly as before.

---

## 9. Validation

Validated feature head:

```text
312d2e4dbcb7ef200e26734052b477078bed76a0
```

GitHub Actions:

```text
run 32613581718
job 97130437060
```

Result:

```text
118 tests
118 pass
0 fail
```

The M6.0 tests prove:

- race-rule compilation and authoring validation;
- independent GeometricCoursePosition seam tracking;
- expected physical checkpoint acceptance;
- raw chainage alone cannot advance `s_progress`;
- reverse crossing rejection;
- out-of-order shortcut rejection;
- gate lateral-envelope enforcement;
- ordered full-lap validation;
- one-gate-per-tick teleport protection;
- recovery resync without progress mutation.

---

## 10. Next gameplay step

M6.1 should add continuous race ranking/progress within the currently validated sector while preserving the M6.0 hard boundary:

> **checkpoint sequence remains race authority; raw geometry can at most provide bounded interpolation inside the currently validated sector.**

This keeps ranking smooth without allowing shortcut geometry to become lap authority.
