# Core Design Freeze Addendum — M5.2 Sprite Metric Authority

This addendum is normative and supersedes only the source-texel interpretation of Core §§55–56. All chainage-depth, anchor, uniform-scale, no-rotation, 0/1-transparency and Painter rules remain unchanged.

## Fixed authority

```text
player car physical width = 2.0 m
player car screen width = 80 px
player-depth scale = 40 px/m
```

The projection quantity remains:

```text
scale_world = f / d   [screen px / world m]
```

A sprite bitmap is not measured in world meters per source texel. Instead:

```text
texelScale = scale_world * worldWidthMeters / sourceWidthTexels
```

There is no arbitrary visual scale parameter. Physical size plus chainage depth fully determine screen size.

For the player:

```text
f / D_cam = 40
D_cam = f / 40
```

Changing FOV therefore changes camera distance, never the 2m=80px player reference.

At current `f=200 px`, `D_cam=5.0 m`.

Current world near plane is `d_min=2.5 m`, so ordinary sprites can reach at most 2x the player-depth magnification before near clipping.
