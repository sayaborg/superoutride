# M5.2 — Fixed metric sprite scale

## Decision

The player presentation reference is fixed and is no longer a tuning parameter:

```text
car physical width = 2.0 m
player screen width reference = 80 px
player-depth scale = 40 px/m
```

Therefore:

```text
f / D_cam = 40 px/m
D_cam = f / 40
```

For the current focal length `f = 200 px`:

```text
D_cam = 5.0 m
```

If FOV is changed later by changing `f`, the camera distance must change with it. The
player-depth metric scale remains exactly 40 px/m and the 2.0 m car remains exactly 80 px wide.
There is no per-player or per-sprite visual scale multiplier.

## Sprite metric rule

`pseudoProject().scale = f / d` is interpreted as pixels per world meter.
A SpriteAsset owns a physical `worldWidthMeters`; the blitter derives source-texel scale from:

```text
screen pixels / source texel
    = (f / d) * (worldWidthMeters / sourceWidthTexels)
```

This removes the old accidental assumption that one source texel was one world meter.

The M5.2 programmer-art rear car is authored at 80 source pixels across 2.0 m. It therefore
renders 1:1 at player depth. The bike is 32 source pixels across 0.80 m, also 40 source px/m.
These are reference-resolution programmer assets; production asset detail can change without
changing physical/display size.

## Near-object enlargement

Current values:

```text
D_cam = 5.0 m
d_min = 2.5 m
```

Thus the largest ordinary world-sprite magnification before the near plane is:

```text
D_cam / d_min = 2.0x
```

For a 2.0 m wide object:

```text
d = 5.0 m ->  80 px
d = 4.0 m -> 100 px
d = 3.0 m -> 133.3 px
d = 2.5 m -> 160 px
```

A 2x nearest-neighbor enlargement at the near plane is deliberately compatible with the
Super Scaler aesthetic. What was too coarse was the previous 9-pixel-wide placeholder being
expanded to roughly 80 pixels at player depth; M5.2 removes that mismatch for the vehicle asset.

## Camera height

For the current `f=200`, `D_cam=5`, pitch 8 degrees and target player screen Y=190, the flat-road
base camera height is set to approximately `2.4699 m`. Vertical framing remains bounded; this
value is not part of the fixed sprite-size rule.
