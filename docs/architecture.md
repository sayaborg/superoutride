# Core architecture and rendering contract

This is the current normative coordinate/rendering specification. [Vehicle physics](vehicle-physics.md) and [content and gameplay](content-and-gameplay.md) own their respective layers.

## Coordinates and open geometry

World X/Y/Z is authoritative. +Y is up, yaw 0 faces +Z; positive yaw rotates toward +X. Positive lateral `l` is right. For heading ψ:

```
t = (sin ψ, cos ψ)      n = (cos ψ, -sin ψ)
```

Course `(s,l)` is a derived observation. `s` is the shared plan chainage of Raster and Guide, not physical travel distance along a sloping/offset path. Local projection uses a known previous segment and a finite clipped neighborhood. Known spawn/recovery coordinates seed that same local search; a global nearest-point search cannot distinguish overlapping circuit copies. Invalid seeds fail explicitly rather than silently selecting another copy.

The general domain of RasterPath, GuidePath, HeightProfile, VisualProfile, logical/baked GroundMap and SurfaceMap is `[0,L]`. Sampling outside it is invalid. Constructors reject nonfinite authoring before endpoint normalization. Raster/Guide geometry, height, visual, logical-material and physical-surface profiles own immutable copies so later authoring edits cannot change a compiled source. Consecutive authored vertices form the path; no final-to-first segment is manufactured. At endpoints the adjacent segment supplies the basis and there is no synthetic turn or fillet. Terrain visibility clips to the finite domain. Author enough run-in/runout for camera, drawing and handoff.

CIRCUIT unfolds authored topology into a finite ordinary open window before constructing the same open source profiles. General profile classes provide no cyclic alternate implementation. Renderer and physics do not infer topology.

## Raster and Guide

Raster is a polyline with `|Δheading| <= 10°` at every interior vertex. Left/right road and ground widths are independent. Edge continuity uses the exact miter basis; constant-width miter ratio is `1/cos(Δ/2)`. Road/ground bands must have finite joins and no local inversion or unintended intersections/overlaps. Validation must inspect the actual band geometry. Do not replace this with an approximate rule comparing width to corner radius.

Current automated compilation covers finite Raster vertices/miters, the turn limit, Guide metrics, fillet overlap and supported lateral envelopes. General nonadjacent road-band intersection classification is not implemented; this remains a content-validation gap, not a relaxation of the preceding requirement. Intentional coincident circuit copies cannot be rejected as ordinary authoring collisions.

Guide lookup retains the adjacent segment at a roundoff-size fillet join, using the existing endpoint tolerance. It must never fall through to an unrelated end segment.

Geometry breaks at the union of heading, render-height, road-width and ground-width changes. Surface/texture/GroundBase changes are paint/material lookups and do not require geometry splits. Interpolate geometry linearly inside a segment.

Guide rounds only the coordinate curve with straight/circular fillets; the rendered road stays Raster. For a turn Δ and radius R:

```
μ = |Δ| / (2 tan(|Δ|/2))     (μ=1 at zero turn)
κ = sign(Δ)/R
J = μ(1 - κl)
Rmin = lMax / (1 - mMin/μ)
trim = R tan(|Δ|/2)
max Guide/Raster deviation = R(sec(|Δ|/2) - 1)
```

Require `0 < mMin < μ`, `J >= mMin` throughout the supported chart, and adjacent trims not to overlap. Opposite-curvature fillets retain the compiler's required intervening straight. Guide is G¹ (continuous position and tangent direction); parameter speed changes between 1 and μ, so it is not generally C¹ in global s.

The compiler derives R from the chart margin or explicit circular authoring provenance; R is not another artist slider. Supported SurfaceMap widths must fit the Guide chart. Visual GroundMap may extend beyond it. See [guide compiler](../src/core/guide-curve.ts) and [geometry validation](../src/compiler/course-validation.ts).

## Height and projection

Terrain height is `Y(s,l)=Y(s)`: no lateral camber/bank in raster geometry. The height reader provides piecewise-linear render height and smooth physical/camera height. [Render height mapping](../src/render/render-height-space.ts) translates an actor's physical clearance above local ground into render height; it does not alter the actor's physical Y.

The complete pseudo projection is:

```
d = s_object - s_camera                  d > 0
xr = (X-Xcam) cos ψcam - (Z-Zcam) sin ψcam
scale = f/d
screenX = cx + scale*xr
screenY = cy - f*sin φ - scale*(Y-Ycam)*cos φ
horizonY = cy - f*sin φ
```

Depth contains no Euclidean distance, camera-space Z, lateral correction, course-length modulo, winding or route state. Same d gives the same scale; same d and height gives the same screen Y. Every terrain chainage maps to one horizontal line. This intentional pseudo-3D distortion must not be “corrected” into normal perspective.

[Projection](../src/core/projection.ts) owns the formula. [Terrain generation](../src/road/terrain-line.ts) uses it, with forward visibility limited by road heading and camera direction. Horizontal mapping along each line is affine; texture mapping is not perspective-correct. Terrain is emitted globally far-to-near, including hills/dips that overdraw the same row. Nearly horizontal/degenerate projected spans collapse to one destination row while preserving their complete source footprint.

## Camera and fixed metric

The player reference is physical width 2 m, source width 80 texels, screen width 80 px at player depth. Therefore `f/D_cam = 40 px/m`, `D_cam=f/40`; current f=200 px and D_cam=5 m. Current near/far depths are 2.5/200 m. Changing FOV changes D_cam to preserve this metric. No arbitrary visual scale is permitted.

[Current camera](../src/camera/m5-camera.ts) keeps `s_camera=s_vehicle-D_cam` with no wrap. Its XZ offset follows the selected yaw; body yaw is the default, movement yaw the alternate. Player horizontal centering is derived from the projection, and vertical follow is bounded and smoothed. Physical body pitch is subtracted from the downward base pitch. Camera roll is always zero. Current composition derives height from base pitch 12°, player anchor row 190 and the fixed metric; vertical-follow τ=0.22 s and correction bound=4 m. These presentation parameters do not feed physics.

## Ground and background

GroundMap visual appearance and SurfaceMap physical support/friction are independent. TRANSPARENT visual GroundBase can coexist with a supported surface; VOID can coexist with visible terrain.

GroundBase fills outside the finite GroundMap strip on each emitted terrain line. It is not a separate depth layer. Each side independently selects solid color or transparency; transparent pixels leave already-drawn farther content visible. Far Background is a full image with meaningful pixels below its horizon, aligned by a source-horizon anchor. Yaw scrolls the background; no camera roll or alpha blending is introduced.

GroundMap uses authored logical data and a compiled finite baked representation. `roadMarkings` owns ordinary road paint; `junctionMarkings` owns paint relative to each junction carriageway center. Omitted paint means no marking. Source and stage samplers use the same paint primitive. Logical left/right materials select outer textures; GroundBase transparency never implies rock. Palette/RGB555 encoding and chunk addressing live in [visual assets](../src/visual/baked-ground-map.ts). Source texel density at reference depth d0 follows:

```
qL = d0/f
qS = d0²/(f*h*cos φ)
```

The shared anisotropic pyramid downsamples lateral by 2^k and chainage by 4^k. Runtime chooses k from actual chainage footprint `Δs_eff`, not lateral footprint: `ceil(log4(Δs_eff/qS))`, bounded by the compiled pyramid. Lateral footprint is diagnostic. Collapsed spans include the entire source interval. `Δs_eff <= dMax-dMin` bounds required pyramid coverage. See [footprint contract](../src/compiler/ground-map-lod.ts) and [target envelope](../src/compiler/ground-map-target-envelope.ts).

## Sprites and Painter

Sprites have a source bitmap, physical width and a texel-center ground anchor. Uniform texel magnification is `(f/d)*worldWidth/sourceWidth`; identical d and size must produce identical scale. Course-attached anchors use render ground height and their known s. Dynamic actor anchors use observed course s and mapped physical height.

Yaw/bank variants are discrete authored assets. No arbitrary runtime bitmap rotation, z-buffer, alpha blending or extra visualScale. Current assets use at most 15 opaque colors plus transparent; 0 pixels are transparent. Scaling uses nearest-neighbor samples. Bank selection is presentation only; see [vehicle physics](vehicle-physics.md).

Order is optional clear -> full Far Background -> single far-to-near Terrain + World Sprite Painter -> player -> HUD. Equal-depth terrain is painted before sprites. Player is last among world visuals even where pseudo geometry distorts physical distance. [Current renderer](../src/render/m5-renderer.ts) owns this pipeline. Detailed workload arrays are allocated only when instrumentation is requested.

## Layer and computation rules

General engine modules never import `src/dev`; only the three browser composition roots assemble concrete DEV content. Route/mode choices happen there. Runtime content provides ordinary reader contracts to physics, camera and renderer. Compilers own topology expansion, validation, static geometry and asset preparation; avoid per-pixel geometry, trigonometry or per-object alternative depth rules.

Keep painter, metric, physical-gate and local-coordinate regressions executable. Build-time asset cost, steady-state rendering cost and optional diagnostics are different measurements. Host timings are not target-device certification.
