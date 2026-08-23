# M5.9 — Tunnel / Portal Stress Content

## Purpose

M5.9 adds the Core-required tunnel/portal case without introducing a second renderer architecture. It also closes the M5.8 performance-budget loop by measuring a close portal/interior scene through the real Painter and sprite-scaler path.

## Tunnel interval

The current debug course uses:

```text
player tunnel interval = s 130 .. 180 m
D_cam                  = 5 m
```

The Far Background transition is therefore camera-chainage aligned to:

```text
camera transition = s 125 .. 175 m
```

At the instant the player reaches either portal, the camera is 5m behind it and the portal is large enough to cover the screen exterior. This hides the discrete background table change behind the portal frame while preserving the transparent aperture.

## Existing renderer path only

The tunnel is represented by exactly the Core building blocks:

```text
Far tunnel interior
    -> tunnel Far Background

Entry / exit structure
    -> ordinary CourseSprite / World Sprite

Near interior structure
    -> ordinary CourseSprite / World Sprite

Portal opening
    -> 0/1 transparent pixels in the sprite
```

The current near structures are:

```text
s=130  entry portal
s=142  near rib A
s=168  near rib B
s=180  exit portal
```

There is no tunnel polygon pass, tunnel depth buffer, tunnel camera-space geometry system, or special projection scale.

## Metric portal

The entry/exit portal asset has:

```text
physical width = 12 m
source size     = 64 x 48 texels
```

At the current player depth:

```text
f / D_cam = 40 px/m
12 m -> 480 px wide
48/64 * 480 -> 360 px high
```

Thus it becomes screen-filling through the same physical pseudo-depth scale used by every other sprite. The central roadway aperture remains transparent rather than being composited in a special tunnel pass.

## Far Background substitution

The tunnel interior background is a normal full Far Background bitmap with a `sourceHorizonY` and effective `pixelsPerRadian`. Distant wall, ceiling, road and lighting impression is therefore represented without consuming a long list of world sprites.

This is important for the Core performance model: only near structural features need scaled-sprite work.

## Required close-up stress result

The M5.9 sweep covers 51 frames around entry, interior ribs and exit with yaw offsets `-20° / 0° / +20°`.

Observed maxima:

```text
TerrainLine count / frame             160
TerrainLine count / screen row          6
terrain output samples / frame      51,200
terrain output samples / screen row   1,920
visible world sprites / frame           13
sprite output samples incl player   83,655 / frame
sprite output samples / scanline        605
sprite written pixels incl player   33,017 / frame
sprite written pixels / scanline        275
GroundMap max level used                  6
```

The M5.8 provisional budget was intentionally not enlarged in advance. The tunnel sweep proved it was insufficient specifically for:

```text
sprite output samples / frame
sprite output samples / scanline
```

It did not exceed the stronger M5.8 normal-content maxima for terrain work or visible world-sprite count.

## Combined M5.x evidence envelope

Combining independent normal-content and tunnel stress suites by taking the maximum of each budget metric gives:

```text
frames represented                    121
TerrainLine count / frame             171
TerrainLine count / screen row          9
terrain output samples / frame      54,720
terrain output samples / screen row   2,880
visible world sprites / frame           17
sprite output samples / frame        83,655
sprite output samples / scanline        605
sprite written pixels / frame        33,017
sprite written pixels / scanline        275
GroundMap max level used                  6
```

The maxima are combined as an envelope; they are not falsely represented as having occurred in one frame.

## Current content-validation budget

M5.9 retains the same explicit M5.8 policy:

```text
headroom = 1.25
budget   = ceil(observed maximum x 1.25)
```

Current target:

```text
TerrainLine count max / frame         214
TerrainLine count max / screen row     12
terrain output samples max / frame 68,400
terrain output samples max / row     3,600
visible world sprites max / frame      22
sprite output samples max / frame 104,569
sprite output samples max / scanline  757
```

This is a renderer-work **content validation budget**. It is not a CPU-cycle proof for any named historical machine. Runtime telemetry does not gain permission to discard required terrain or otherwise change semantics when a counter is exceeded.

## Preserved boundaries

M5.9 does not add:

- a dedicated tunnel 3D pass
- polygon road or tunnel geometry
- z-buffering
- arbitrary alpha blending
- runtime sprite rotation
- a second projection model
- runtime GroundMap anisotropic filtering
- a 2D GroundMap LOD table

With the required special visual stress case now included, the next main block can move from renderer/compiler completion toward M6 gameplay state such as validated race progress, checkpoints and lap handling.
