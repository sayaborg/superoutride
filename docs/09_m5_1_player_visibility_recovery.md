# M5.1 Player Visibility / Recovery Bugfix

## Problem

M5 implemented `VOID` as unsupported ground and allowed the vehicle to fall, but did not yet implement the gameplay-side crash / recovery rule that the Core intentionally leaves unspecified.

Two disappearance paths were reproducible:

1. After entering `VOID`, physical Y kept falling while Core §38 vertical camera correction remained bounded. Eventually the player projected below the 320x240 viewport.
2. During a sustained full-steering stress case, the DEV vehicle could enter an extreme-spin state outside the normal Core §36 framing envelope. The normal camera could then project the player beyond the horizontal viewport even while the vehicle was still on a supported surface.

Neither issue is fixed by modifying pseudo-depth, lateral depth, sprite projection, or world physics.

## Fix A — gameplay-side recovery

Added `src/gameplay/recovery.ts`.

The recovery state retains the most recent supported chainage. When the vehicle is unsupported, a DEV recovery triggers before screen disappearance if any of these occur:

- unsupported time exceeds 0.72 s
- fall distance exceeds 3.25 m
- local lateral excursion exceeds 18 m

Recovery places the vehicle back on the road center at a slightly earlier chainage, preserves a reduced forward speed, and clears lateral / yaw / vertical crash motion. Motorcycle bank state is also cleared.

This is explicitly a gameplay-side rule. `SurfaceMap = VOID` still means no supporting ground during the airborne interval.

## Fix B — extreme-spin player safety camera

Normal camera behavior is unchanged while the player anchor remains in the horizontal screen-safe range.

If normal projection would move the player anchor outside X=48..272, the camera enters a separate presentation safety mode and points camera yaw toward the player's world position. Camera XZ position, camera chainage, pseudo-depth, renderer projection, TerrainLine generation, and world physics remain unchanged.

The entire world uses the resulting camera yaw. The player sprite itself is not independently clamped or teleported in screen space.

This implements the Core's separation between the normal framing envelope and an optional special presentation for extreme spin.

## Manual recovery

`R` performs the same gameplay-side recovery manually and reinitializes camera presentation state.

## Validation

Full regression:

```text
58 tests
58 pass
0 fail
```

Additional stress probe:

```text
40 seconds / 2400 frames
input: full steering + throttle continuously
recoveries: 16
player safety camera frames: 344
player anchor X: 48.0008 .. 207.5590
player anchor Y: 148.4344 .. 212.4647
```

The player no longer disappears in this stress case.
