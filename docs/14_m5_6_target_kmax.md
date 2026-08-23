# M5.6 — Target GroundMap kMax proof

## Purpose

M5.5 instrumented actual TerrainLine source footprints but deliberately did not promote the observed `k_s=6` to a final target-profile value. M5.6 closes that gap.

The result for the current target is:

```text
GroundMap shared anisotropic pyramid k_max = 6
```

This is not chosen by visual tuning and is not inferred only from a coarse camera sweep.

## Explicit thin-span rule

Core §64 defines a degenerate projected segment by

```text
Delta_y < epsilon_span
```

M5.6 makes the current target rule explicit:

```text
epsilon_span = 1 destination scanline
```

The previous implementation only used a tiny `|bY|` numerical test. That was a numerical degeneracy test, not the actual screen-space rule.

For a clipped segment with depths `d0 < d1` and vertical projection

```text
y = aY + bY/d
```

the exact projected vertical span is

```text
Delta_y = |bY| * |1/d0 - 1/d1|
```

If `Delta_y < 1`, the segment is represented by one TerrainLine. The representative sample is taken at the midpoint in `u=1/d`, because screen Y is affine in `u`. Its entire clipped chainage interval is retained as `Delta_s_collapse`.

## Absolute chainage-footprint bound

For an ordinary TerrainLine, both pixel-boundary depths used to form `Delta_s` are clipped to the current forward interval:

```text
dMin <= d <= dMax
```

Therefore:

```text
Delta_s <= dMax - dMin
```

A collapsed thin span is itself a subset of the same visible interval, so:

```text
Delta_s_collapse <= dMax - dMin
```

Since:

```text
Delta_s_eff = max(Delta_s, Delta_s_collapse)
```

we obtain the camera/grade/yaw-independent target bound:

```text
Delta_s_eff,max <= dMax - dMin
```

For the current target:

```text
dMin = 2.5 m
dMax = 150 m

Delta_s_eff,max <= 147.5 m
```

This proof remains valid across current camera height correction, pitch, grade and forward-heading variation because those parameters change where scanlines land, but not the final near/far clipping interval.

## Deriving k_max

M5.4 fixed the current base chainage footprint at:

```text
q_s = 0.051106653147800385 m/texel
```

The shared anisotropic pyramid grows chainage footprint by x4 per level:

```text
q_s(k) = q_s * 4^k
```

Thus:

```text
level 5 capacity ~= 52.3332 m
level 6 capacity ~= 209.3329 m
```

Level 6 covers the absolute target bound of 147.5 m, so level 6 is sufficient.

M5.5 already observed `Delta_s_eff ~= 93.67 m`, which exceeds level 5 capacity. M5.6 also re-runs an actual Road Generator sweep after the explicit screen-space thin-span rule is enabled. If that measured output still requires level 6, necessity and sufficiency coincide:

```text
k_max = 6
```

## Lateral footprint remains diagnostic

Nothing in M5.6 changes the Core authority rule:

```text
shared pyramid level <- chainage footprint only
```

`Delta_l` and `k_l` remain diagnostics. A large yaw-induced lateral footprint never promotes the shared pyramid level because doing so would over-blur chainage by x4 per extra level.

## Runtime state

M5.6 does not yet switch GroundMap rendering to baked assets. It establishes:

- explicit thin-span collapse semantics
- a provable target chainage-footprint upper bound
- a compiler-derived final `k_max`
- validation that measured TerrainLine telemetry remains inside that target

Baked GroundMap chunk generation and runtime pyramid sampling remain the next block.
