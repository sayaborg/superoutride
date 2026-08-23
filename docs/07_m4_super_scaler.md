# SUPER OUTRIDE — M4 Super Scaler Implementation

## Status

**M4 complete.**

This milestone adds the sprite-scaler layer on top of the M3 software framebuffer while preserving the Core Design Freeze as the only renderer authority.

## Implemented Core path

```text
Full Far Background
    -> merge(
           TerrainLine far -> near,
           World Sprite far -> near
       )
       equal d: TerrainLine first, Sprite second
    -> Player Sprite
    -> HUD
```

No z-buffer or per-pixel depth test is introduced.

## World sprites

Course-attached programmer-art objects now include:

- tree
- sign
- guardrail
- building

Authoring uses `(s, l, groundOffset)` and the prototype compile step expands this to:

```text
CourseSprite {
    X
    Y
    Z
    sRender
    asset
}
```

Ground-attached objects are snapped to `Y_render(s) + groundOffset` at compile time.

Runtime visibility uses the same forward interval as terrain. Sprite pseudo-depth is:

```text
d = wrapSigned(sRender - sCam)
```

and the sprite list is sorted far -> near.

## Sprite asset / blitter

`SpriteAsset` uses:

```text
width
height
anchorX
anchorY
pixels
```

The source coordinate convention is texel-center based. Default anchor semantics are bottom center.

Runtime scaling is uniform:

```text
scaleX = scaleY = f / d
```

The blitter performs nearest-neighbor scaled transfer into the 320x240 software framebuffer.

Not implemented by design:

- runtime bitmap rotation
- anisotropic sprite scaling
- perspective warp
- arbitrary alpha

Transparency is 0/1 only. Source pixel value `0` means skip the destination write.

## Painter merge

TerrainLine and world sprite lists remain independent and sorted far -> near.

The merge does not allocate a z-buffer or combined per-pixel depth structure.

Tie rule:

```text
same d:
    terrain
    sprite
```

This lets the sprite appear on its contact terrain while later, nearer TerrainLines naturally overwrite it.

## Player vehicle variants

### Car

Prototype assets:

```text
24 yaw variants
1 bank variant
```

The selected yaw is based on:

```text
vehicleYaw - cameraYaw
```

### Motorcycle

Prototype assets:

```text
24 yaw variants
5 bank variants
```

Selection is:

```text
spriteVariant[yawVariant][bankVariant]
```

The M2 temporary vehicle state now contains a smoothed `sprungRoll`-like value purely so that the M4 sprite-path can exercise bank variants. This is **not** the final motorcycle physics model.

## DEV camera improvement

M4 adds a stateful DEV camera yaw lag so player yaw variants are exercised in live running.

The prototype follows the Core form:

```text
tauPsi = kPsi * D_cam / max(abs(sDot), sDotMin)
```

and clamps only camera lag, not vehicle yaw.

Longitudinal camera position remains exact:

```text
sCam = sCar - D_cam
```

so player pseudo-depth remains exactly `D_cam`.

The M4 numerical camera values are development values and are not a frozen target profile.

## Programmer art

All M4 sprite assets are generated in code and are temporary.

The validation suite confirms every prototype sprite uses no more than 15 opaque colors plus transparent, matching the Core sprite-expression target.

## Deliberately deferred

M4 does **not** add:

- final sprite artwork
- animation system
- final sprite memory budget
- sprite LOD
- collision response
- SurfaceMap-driven vehicle forces
- final car physics
- final motorcycle physics
- AI
- gameplay rules

Those belong to later milestones.
