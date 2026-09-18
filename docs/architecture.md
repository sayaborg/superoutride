# Core architecture and rendering contract

Current implementation is described below. The [Course Editor target](#course-editor-target) is a separately scoped future contract. Activate each change only with its executable coverage; this document does not report that the target is already implemented.

This is the current normative coordinate/rendering specification. [Vehicle physics](vehicle-physics.md) and [content and gameplay](content-and-gameplay.md) own their respective layers.

## Coordinates and open geometry

Core owns shared 2D/3D vector arithmetic. Vec2 and Vec3 are readonly value contracts; authoring replaces values instead of mutating coordinate observations.

World X/Y/Z is authoritative. +Y is up, yaw 0 faces +Z; positive yaw rotates toward +X. Positive lateral `l` is right. For heading ψ:

```
t = (sin ψ, cos ψ)      n = (cos ψ, -sin ψ)
```

Course `(s,l)` is a derived observation. `s` is the shared plan chainage of Raster and Guide, not physical travel distance along a sloping/offset path. Local projection uses a known previous segment and a finite clipped neighborhood. Known spawn/recovery coordinates seed that same local search; a global nearest-point search cannot distinguish overlapping circuit copies. Invalid seeds fail explicitly rather than silently selecting another copy. Optional explicit lateral clamping acts in the underlying Guide basis before subtracting a stage's lateral origin; clamping a translated local coordinate against the unshifted limits is invalid. Ordinary physical projection remains unclamped.

The general domain of RasterPath, GuidePath, HeightProfile, VisualProfile, logical/baked GroundMap and SurfaceMap is `[0,L]`. Sampling outside it is invalid. All source readers share a 1e-9 m endpoint normalization through `openProfileChainage`, including SurfaceMap and unfolded circuit adapters. Raster/Guide geometric sampling retains its separately named 1e-8 m tolerance. Shared tolerances live in [Core tolerances](../src/core/tolerances.ts); unrelated numerical cutoffs remain named with their purpose and units at their owning algorithm. Equal numeric values do not establish a common authority. These tolerances never wrap or award progress. Constructors reject nonfinite authoring before endpoint normalization. Raster/Guide geometry, height, visual, logical-material and physical-surface profiles own immutable copies so later authoring edits cannot change a compiled source. Consecutive authored vertices form the path; no final-to-first segment is manufactured. At endpoints the adjacent segment supplies the basis and there is no synthetic turn or fillet. Terrain visibility clips to the finite domain. Author enough run-in/runout for camera, drawing and handoff.

CIRCUIT unfolds authored topology into a finite ordinary open window before constructing the same open source profiles. General profile classes provide no cyclic alternate implementation. Renderer and physics do not infer topology.

## Numerical threshold ownership

Exact values remain in the linked source owners. Equal numbers do not imply interchangeable meanings. The map distinguishes dimensional roundoff tolerances, finite-domain guards and deliberate control/visibility thresholds; only shared boundary semantics belong in Core tolerances.

| Owner / thresholds                                                                                                                                                                                                                                       | Units                                               | Why separate                                                                                                                          |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| [Core tolerances](../src/core/tolerances.ts): source endpoints; geometry sampling; lateral boundaries                                                                                                                                                    | m                                                   | Source normalization, geometric joins and lateral classification have different contracts.                                            |
| [Core tolerances](../src/core/tolerances.ts): pixel edges; texel spacing                                                                                                                                                                                 | screen px; m/texel                                  | Destination coverage and source-sample spacing are different metrics.                                                                 |
| [RasterPath](../src/core/raster-path.ts): minimum segment, miter denominator, vertex turn                                                                                                                                                                | m; dimensionless; rad                               | Reject degenerate geometry without changing the authored turn limit.                                                                  |
| [Guide](../src/core/guide-curve.ts): arc center, compilation, zero turn                                                                                                                                                                                  | m; m; rad                                           | Center agreement and compilation validation are distinct from reader join tolerance; positive readable intervals survive compilation. |
| [Terrain](../src/terrain/terrain-line.ts): visible/depth intervals                                                                                                                                                                                       | m                                                   | Visibility clipping and finite depth interval construction differ from source endpoint normalization.                                 |
| [Terrain](../src/terrain/terrain-line.ts): invertible span, row/boundary denominators, minimum span                                                                                                                                                      | screen px                                           | Projection inversion, row sampling and thin-span collapse have different degeneracies.                                                |
| [Terrain](../src/terrain/terrain-line.ts): flat-height coefficient                                                                                                                                                                                       | px·m                                                | This is the depth-dependent projection coefficient, not a height or pixel distance.                                                   |
| [Renderer](../src/render/renderer.ts): minimum texture span                                                                                                                                                                                              | screen px                                           | Guards affine texture inversion, independently of terrain generation.                                                                 |
| [GroundMap LOD](../src/groundmap/ground-map-lod.ts) and [asset compiler](../src/groundmap/ground-map-asset-compiler.ts): level/texel-count rounding                                                                                                      | dimensionless                                       | Discrete level selection and integer allocation round different quantities.                                                           |
| [Footprints](../src/dev/diagnostics/terrain-footprint-analysis.ts) and [target envelope](../src/groundmap/ground-map-target-envelope.ts): footprint, level capacity, observed footprint                                                                  | m                                                   | Source-footprint accumulation, compiled capacity and observed-bound checks are separate comparisons.                                  |
| [World gate](../src/gameplay/world-crossing-gate.ts), [physical race gate](../src/gameplay/physical-race-gate.ts): width, motion direction                                                                                                               | m                                                   | Gate width classification and directional motion checks do not define a crossing dead band.                                           |
| [Ordered race](../src/gameplay/ordered-race-progress.ts), [field route](../src/gameplay/field-route-progress.ts), [circuit race](../src/gameplay/circuit-race-progress.ts): progress, gate-candidate padding, finish runout                              | m                                                   | Validated progress, candidate search and unscored endpoint clearance are distinct responsibilities.                                   |
| [Route handoff](../src/gameplay/route-stage-handoff.ts), [continuation](../src/runtime/stage-continuation-link.ts), [package](../src/runtime/stage-runtime-content.ts), [circuit window](../src/runtime/circuit-runtime-window.ts): anchors and geometry | m; continuation heading in rad                      | Physical anchor agreement, chart overlap, package agreement and circuit seams validate different compiled relationships.              |
| [Successor](../src/runtime/raster-stage-successor.ts), [traveler](../src/runtime/live-route-traveler.ts): runout turn/length, lateral intent                                                                                                             | degrees; m; m                                       | Authored runout validation and AI lateral intent are not integration corrections.                                                     |
| [Shared route choice](../src/gameplay/shared-route-choice-authority.ts): crossing-fraction ties                                                                                                                                                          | dimensionless                                       | Arbitration compares a fraction within the current tick, not world distance.                                                          |
| [Race session](../src/gameplay/race-session.ts): rank progress, race time, timer rounding                                                                                                                                                                | m; s; ms                                            | Ranking, time comparison and displayed integer time have separate units.                                                              |
| [Wheel](../src/physics/tire-wheel.ts): torque residual                                                                                                                                                                                                   | N·m                                                 | Stops the signed torque solve; cannot replace geometric or control tolerances.                                                        |
| [Contact](../src/physics/vehicle-dynamics.ts), [steering limiter](../src/physics/steering-input-limiter.ts), [actuator](../src/physics/driving-actuator.ts): projected direction, plane determinant, target                                              | dimensionless                                       | Basis degeneracy, plane solvability and normalized actuator arrival are different numerical checks.                                   |
| [Camera](../src/camera/camera.ts), [rival](../src/gameplay/rival-driver.ts), [recovery](../src/gameplay/recovery.ts): response minimum, straight curvature/lookahead interval, penetration                                                               | s; 1/m and m; m                                     | These are presentation, driving and recovery policies, not shared source precision.                                                   |
| [Selector values](../src/browser/selector-values.ts), [tire selector](../src/browser/tire-friction-selection.ts): value equality, grid rounding                                                                                                          | selector value units; dimensionless grid coordinate | UI matching and grid alignment never change physical solver precision.                                                                |

## Raster and Guide

Raster is a polyline with `|Δheading| <= 10°` at every interior vertex. Left/right road and ground widths are independent. Edge continuity uses the exact miter basis; constant-width miter ratio is `1/cos(Δ/2)`. Road/ground bands must have finite joins and no local inversion or unintended intersections/overlaps. Validation must inspect the actual band geometry. Do not replace this with an approximate rule comparing width to corner radius.

Current automated compilation covers finite Raster vertices/miters, the turn limit, Guide metrics, fillet overlap and supported lateral envelopes. See the [content-validation limit](NEXT.md#remaining-limits) before accepting new courses. Intentional coincident circuit copies cannot be rejected as ordinary authoring collisions.

Guide lookup retains the adjacent segment at a roundoff-size fillet join, using the existing endpoint tolerance. It must never fall through to an unrelated end segment. Compiled coverage and omitted primitive intervals must fit the reader's sampling tolerance even when the author permits a larger dimensional validation tolerance. In particular, a positive straight longer than the sampling tolerance remains a real primitive.

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

The compiler derives R from the chart margin or explicit circular authoring provenance; R is not another artist slider. Supported SurfaceMap envelopes must remain strictly inside the Guide chart: `maxSupportedAbsL + abs(lateralOrigin) < guide.lMax`. The reader owns a conservative bound in its local lateral frame, including junction support and boundary classification tolerance. Compilation checks this in authored packages, runtime registries, circuit windows and linear composition; there is no single stage compiler shared by every course. Visual width is independent. The positive chart margin is an authored content parameter, not a physical force or pose correction. The chart edge is a chosen metric bound (`J >= mMin > 0`), not the singularity `J=0`; physical local projection does not clamp lateral motion. Visual GroundMap may extend beyond it. See [guide compiler](../src/core/guide-curve.ts) and [geometry validation](../src/physics/surface-guide-envelope.ts).

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

[Projection](../src/core/projection.ts) owns the formula. [Terrain generation](../src/terrain/terrain-line.ts) uses it, with forward visibility limited by road heading and camera direction. Horizontal mapping along each line is affine; texture mapping is not perspective-correct. Terrain is emitted globally far-to-near, including hills/dips that overdraw the same row. Nearly horizontal/degenerate projected spans collapse to one destination row while preserving their complete source footprint.

## Camera and fixed metric

The player reference is physical width 2 m, source width 80 texels, screen width 80 px at player depth. Therefore `f/D_cam = 40 px/m`, `D_cam=f/40`; current f=200 px and D_cam=5 m. Current near/far depths are 2.5/200 m. Changing FOV changes D_cam to preserve this metric. No arbitrary visual scale is permitted.

[Current camera](../src/camera/camera.ts) keeps `s_camera=s_vehicle-D_cam` with no wrap. Its XZ offset follows the selected yaw; body yaw is the default, movement yaw the alternate. Player horizontal centering is derived from the projection, and vertical follow is bounded and smoothed. Physical body pitch is subtracted from the downward base pitch. Camera roll is always zero. Current composition derives height from base pitch 12°, player anchor row 190 and the fixed metric; vertical-follow τ=0.22 s and correction bound=4 m. These presentation parameters do not feed physics.

## Ground and background

GroundMap visual appearance and SurfaceMap physical support/friction are independent. TRANSPARENT visual GroundBase can coexist with a supported surface; VOID can coexist with visible terrain.

GroundBase fills outside the finite GroundMap strip on each emitted terrain line. It is not a separate depth layer. Each side independently selects solid color or transparency; transparent pixels leave already-drawn farther content visible. Far Background is a full image with meaningful pixels below its horizon, aligned by a source-horizon anchor. Yaw scrolls the background; no camera roll or alpha blending is introduced. The [background source format](../src/visual/far-background.ts) owns 640×320 pixels, horizon row 126 and yaw density 200 source pixels/radian. Source yaw density and camera focal length have different units and remain independent authoring/presentation quantities despite their equal current numbers.

All shipped courses use precompiled GroundMap pages. Ordinary and stage paint samplers are offline
compiler inputs and explicit diagnostic preview adapters; the product renderer receives one final-color
reader and does not classify or repaint ground. `roadMarkings` owns ordinary paint; `junctionMarkings`
owns paint relative to each junction carriageway center. Omitted paint means no marking. Loaded
assets validate integer payload offsets, encoding, lengths and digests. The monolithic regression
reader copies caller-owned bytes; product page loading transfers exclusive buffer ownership.
Circuit windows use the existing window-to-lap chainage mapping for both page demand and color reads,
sharing one lap directory and payload store. Palette/RGB555 encoding belongs to the
[compiler encoder](../src/groundmap/ground-map-encoding.ts); chunk addressing and decoding belong to
the [baked reader](../src/groundmap/baked-ground-map.ts). Source texel density at reference depth d0 follows:

```
qL = d0/f
qS = d0²/(f*h*cos φ)
```

The shared anisotropic pyramid downsamples lateral by 2^k and chainage by 4^k. Runtime chooses k from actual chainage footprint `Δs_eff`, not lateral footprint: `ceil(log4(Δs_eff/qS))`, bounded by the compiled pyramid. Lateral footprint is diagnostic. Collapsed spans include the entire source interval. `Δs_eff <= dMax-dMin` bounds required pyramid coverage. See [footprint contract](../src/groundmap/ground-map-lod.ts) and [target envelope](../src/groundmap/ground-map-target-envelope.ts).

## Sprites and Painter

Sprites have one logical master frame, physical width, a texel-center anchor in that frame and a
finite ordered array of completed bitmap levels. The common [blitter](../src/graphics/sprite.ts)
owns nearest sampling for single-level and LOD assets. Uniform master-texel magnification is
`g = (f/d)*worldWidth/masterWidth`; identical d and size produce identical projected extent.
Course-attached anchors use render ground height and their known s. Dynamic actor anchors use
observed course s and mapped physical height.

Yaw/bank variants are discrete authored assets. No arbitrary runtime bitmap rotation, z-buffer, alpha blending or extra visualScale. Current assets use at most 15 opaque colors plus transparent; 0 pixels are transparent. Scaling uses nearest-neighbor samples. Bank selection is presentation only; see [vehicle physics](vehicle-physics.md).

Order is optional clear -> full Far Background -> single far-to-near Terrain + World Sprite Painter -> player -> HUD. Equal-depth terrain is painted before sprites. Player is last among world visuals even where pseudo geometry distorts physical distance. [Current renderer](../src/render/renderer.ts) owns this pipeline. Detailed workload arrays are allocated only when instrumentation is requested.

### Sprite LOD metric and read contract

This rendering contract extension selects a top-left aligned, untrimmed octave lattice and
geometric-mean level transitions. It adds completed-LOD support to the product blitter; current
programmer art still supplies one level with unchanged pixels and dimensions. Its provisional
colors/densities and yaw/bank grid are not production source-art requirements. No image generator,
source filter or vehicle-variant sampling decision is implied by this extension.

For logical master extent W by H, level k stores `ceil(W/2^k)` by `ceil(H/2^k)` texels. Each texel
has the same nominal step `2^k` in both master axes. Storage starts at the master's top-left
boundary. A final row/column can extend beyond the logical frame; that partial cell is clipped
by the original W by H drawing bounds, never stretched to fit. A compiler must account for the
partial cell explicitly when its filter/coverage policy is selected. Shrinking continues on the
longer axis when the shorter is already one texel. A finite contiguous prefix is legal; the last
possible level is `ceil(log2(max(W,H)))`, where both storage dimensions are one.

The anchor remains `(aX,aY)` in L0 texel-center coordinates. Its derived coordinate at level k is
`((aX+0.5)/2^k-0.5, (aY+0.5)/2^k-0.5)`, not simply the anchor divided by two. Drawing uses the
original logical bounds and converts each nearest sample to this common lattice. Default
single-image anchors remain `((W-1)/2,H-1)`; fractional and outside-frame reference points are valid.
All levels represent `worldWidth` by `worldWidth*H/W` meters. Neither a storage dimension nor an
opaque bounding box can redefine those dimensions or the physical vehicle profile.

Selection starts at L0 and moves to a coarser level while `g <= 1/(sqrt(2)*2^k)`, clamped to the
available levels. Equality selects the coarser image. Display extent and anchor still follow the
continuous projection; neither is rounded to the selected level. Pixel rasterization and changes
of color/coverage between images can still produce visible steps. No crossfade is introduced.

The completed-image interchange record accepted by `readSpriteLodAsset` is:

```text
{ format: "superoutride.sprite-lod", version: 1, name,
  width: W, height: H, anchorX, anchorY,
  levels: [{ paletteRgb555: [opaque RGB555 integers], indices: [row-major indices] }, ...] }
```

The master is normalized to `SPRITE_SOURCE_TEXELS_PER_METER` (40); physical width is derived once
from W. Each level has at most 15 distinct opaque RGB555 colors, each in 0..32767. Index 0 is
transparent; indices 1..15 address that level's opaque palette. RGB555 zero is opaque black.
Each index array must exactly cover its derived storage lattice. The reader expands through the
shared RGB555 codec and owns its decoded buffers; asset and level metadata are frozen. Consumers
treat the pixel buffers as read-only. Unknown fields, nonfinite anchors, invalid dimensions,
missing/extra levels and out-of-range palette indices fail before rendering. V1 has no crop,
per-level anchor/dimensions, rotation or scale fields. Transparent canvas margin is retained.

Per-level palettes can be represented; the image compiler's palette-sharing policy remains open.
This small completed-image interchange does not settle editor project/ID/version migration or
packed production ROM encoding. The [causal LOD tests](../tests/rendering/sprite-lod.test.mjs)
cover odd/thin storage, transitions, alpha, clipping, workload and the complete Painter. The
[preview](../tools/graphics/sprite-lod.html) reads the same format and calls the same blitter.

### Offline sprite LOD authoring recipe

The [sprite compiler](../src/graphics/sprite-lod-compiler.ts) is the first offline image-processing
core. It accepts exactly one already-normalized indexed master in the completed-image schema and
produces a full octave series in that same schema. The shared `spriteLodLayout` owns every storage
dimension for the reader, compiler and fixtures. It leaves the master's pixels, extent and anchor
unchanged. This is an explicit authored-palette recipe for comparison, not the final production-art
generation policy. External PNG normalization is a separate preceding compiler step below.

The caller must supply both `colorSpace` (`encoded-srgb` or `linear-srgb`) and `coverageThreshold`
in (0,1]; there is no implicit recipe. Each level integrates axis-aligned boxes directly from the
master. Only the intersection with the logical frame contributes to a partial edge cell. Transparent
texels contribute to area coverage, while color averages include only opaque samples. Coverage
equal to the threshold is opaque; zero coverage is always transparent. This scalar threshold does
not preserve total silhouette area or guarantee survival of thin parts.

The shared [area filter](../src/graphics/sprite-area-filter.ts) owns color, coverage and palette selection for both source normalization and LOD generation. The encoded LOD recipe averages the shared RGB555 decoder's 8-bit sRGB channel values. The linear recipe
uses the [sRGB transfer function](https://www.w3.org/TR/css-color-4/#color-conversion-code) before
averaging. Both choose the nearest color from the author's supplied master palette by squared RGB
distance in the selected space; exactly equal errors choose the lower RGB555 integer. The palette
and its ordering are retained in every level. This LOD step does not create palettes, dither, alpha blend, filter progressively quantized levels or
prefilter during play. The optional palette candidate step below precedes normalization.

The [causal compiler tests](../tests/rendering/sprite-lod-compiler.test.mjs) distinguish the color
spaces, prove direct-master averaging and transparent-edge behavior, and exercise odd/thin edges,
tie ordering, repeatability and the file compiler. Build-generated checker/coverage samples provide
an opt-in visual comparison in the shared preview. Its browser only loads completed JSON; the build
owns compilation. Filter/coverage acceptance on real artwork, final palette-reduction policy and
variant palette sharing remain open; these synthetic samples do not establish final image quality.

### External sprite source normalization

The [source compiler](../src/graphics/sprite-source-compiler.ts) accepts decoded straight-alpha
8-bit sRGB pixels and an explicit versioned recipe. This is an offline authoring contract extension;
it does not convert shipped art or change projection, LOD selection, physics or the fixed oracle.
The PNG command supplies decoded pixels through the shared framebuffer color packing primitive.
Prepare sRGB input externally: embedded ICC/gamma metadata is not a color conversion instruction.
JPEG/WebP, animated input and perspective correction remain outside this file workflow. The pinned
PNG dependency serves offline commands and the authoring tool below, never the driving runtime.

```text
{ format: "superoutride.sprite-source", version: 1, name,
  crop: { x, y, width, height }, widthMeters,
  anchor: { x, y }, paletteRgb555, filter: { colorSpace, coverageThreshold } }
```

The crop is an integer source-pixel rectangle inside the decoded image. `widthMeters` calibrates
that entire crop, including transparent margin; it is not necessarily the object's physical width.
The master width is `round(widthMeters*40)` (positive ties upward), which must be at least one.
Its actual canvas width is the rounded result divided by 40. One uniform scale, master width divided
by crop width, applies to both axes. Master height is the ceiling of crop height times that scale;
a fractional final row adds transparent area instead of stretching the image vertically. This source
normalization padding belongs to L0. It differs from the later LOD storage padding outside L0's
logical frame, which the LOD filter clips. Opaque bounds never redefine the frame or vehicle physics.

The anchor is supplied in original-image texel-center coordinates, including the crop offset. Each
axis maps as `(sourceAnchor + 0.5 - cropOrigin)*scale - 0.5`. Fractional and outside-frame anchors
remain valid. Integer overlap units represent rational source footprints without epsilon padding or
opaque edge gaps. Box integration also defines enlargement: source cells have constant color and
coverage. Transparent area contributes only coverage; straight alpha weights opaque color before
binary thresholding. No background color enters through a zero-alpha sample.

The shared explicit filter recipe chooses the encoded/linear color space and threshold. The author
supplies at most 15 distinct RGB555 colors; the shared nearest-palette rule performs assignment.
Normalization never silently infers a palette; the separate authoring generator below is opt-in. An empty palette is legal only when the resulting master
is fully transparent. The output is exactly one normalized level in the completed-image interchange,
ready for review/editing and the existing LOD compiler. Source-normalization and LOD recipes are
separate saved inputs: neither inherits the other's threshold silently. This recipe is not an Editor
project format or an accepted real-art quality policy.

Unknown/missing fields, invalid crop/anchor/metric values and malformed palettes fail before output.
Authoring admission limits are 16,777,216 decoded source pixels and 1,048,576 master texels; the PNG
adapter additionally admits at most 32 MiB encoded input and 8-bit channels. These are local compiler
limits, not runtime format limits or accepted smartphone budgets. [Source regressions](../tests/rendering/sprite-source-compiler.test.mjs)
cover metric projection, fractional footprints, source alpha, crop/anchor mapping, padding, color
space, file preservation and the real PNG -> master -> LOD -> product-reader chain.

### Sprite Tool authoring session

The [Sprite Tool](../tools/graphics/sprite-tool.html) is a declared pre-game image compiler entry.
Graphics owns normalization, palette generation, LOD compilation and drawing. Tool-local code owns
file adapters, editor state and DOM interactions. The driving roots never import these compilers or
the PNG dependency. This is a narrow image/session contract extension; it does not change shipped
art, gameplay, the fixed oracle, source-camera policy or course authoring.

The browser and Node file command share one [PNG adapter](../tools/graphics/sprite-png.mjs) and the
same pinned decoder. Validate signature, dimensions, 8-bit depth, chunk extents, animation rejection
and CRC before accepting pixels. The browser build wraps the dependency's bundled browser codec as
an ESM module and includes its license under the same commit path. No canvas decode, profile
conversion, external CDN or network upload is involved. The example is a generated PNG decoded by
the same path, not a bypass supplying an already indexed image.

The [palette generator](../src/graphics/sprite-palette.ts) provides an explicit comparison candidate:
alpha-weighted median cut in encoded RGB555, independent of the later filter color-space choice.
Only visible samples inside the current integer crop contribute. Quantize each RGB channel through
the shared RGB555 codec and accumulate integer alpha weights. If the histogram fits the requested
1..15 colors, retain its exact codes. Otherwise split the box with the greatest channel range,
then greatest total alpha, then lowest contained RGB555 code. Choose the widest channel, breaking
ties R, G, B; sort by that channel then code. Split at the first cumulative weight reaching half,
clamped to leave both halves nonempty. Continue to the requested number of boxes. Each box's output
is its weighted RGB555-channel mean, rounded to nearest with upward ties. Deduplicate and sort output
codes. Fully transparent crops produce an empty palette; coincident centroids may reduce its size.
There is no dither. The generated palette becomes an ordinary editable recipe value. Subsequent
mask/crop changes do not regenerate it silently. This deterministic candidate is not acceptance of
its visual quality on real artwork, nor a final per-variant palette-sharing policy.

The [editor session](../tools/graphics/sprite-session.mjs) retains original straight-alpha pixels,
a separate binary hidden mask and independent source/LOD recipes. Rectangular hide changes alpha to
zero; restore retrieves the exact original alpha, including semitransparent and invisible RGB.
Undo/redo applies only to mask operations, with at most 32 retained operations and 8 MiB of saved
mask bytes. A new mask edit drops redo; no-op masks consume no history. Source or recipe changes
invalidate compiled products. The GUI disables export and clears the preview until the next build.
Failed imports preserve the current session; only the newest pending import may replace it.

```text
{ format: "superoutride.sprite-session", version: 1,
  source: { width, height, rgbaBase64 }, hiddenBase64, recipe, lodRecipe }
```

`rgbaBase64` encodes original row-major R,G,B,A bytes, independent of host endianness.
`hiddenBase64` encodes one byte per source pixel, strictly 0 or 1. Both use canonical padded base64.
Unknown/missing fields, malformed bytes or invalid recipes fail before installation. Saving and
restoring validate by compiling through the shared image functions. Session files preserve editing
inputs; master and LOD exports contain only completed indexed images. Undo history is not saved.
This small local session is not the final cross-asset/project/ID format. There is no autosave or
implicit overwrite of source or compiled output.

Editor admission is 1,048,576 source pixels, at most 4096 per axis, 32 MiB PNG and 16 MiB session JSON.
The larger Node source admission above remains available. These are authoring limits, not smartphone
budgets. Imported images require a known crop width and explicit source/LOD color spaces. The
bottom-center source anchor and 0.5 threshold are visible starting controls; no vehicle dimensions
or accepted real-art thresholds are inferred. Preview uses the existing scale and product blitter.
The [authoring regressions](../tests/rendering/sprite-authoring.test.mjs) cover palette tie/alpha rules,
mask history and product invalidation, portable session restoration, decoder parity and the complete
PNG -> session -> master/LOD -> product-reader boundary.

## Layer and computation rules

Core owns RasterPath, GuidePath, HeightProfile and open source-domain operations. Graphics owns framebuffer, color codec, sprite blitting and Painter primitives; visual owns background/sprite assets and visual sections; render assembles the drawing pipeline and projected course/dynamic sprites. GroundMap owns logical/baked readers, baking, filtering and footprint contracts. Course owns road/shoulder cross-section geometry. GroundMap and physics independently map that geometry to paint and physical materials; physical surface/Guide containment belongs to physics. Circuit race compilation consumes a gameplay-owned window reader. Vehicle presentation-family metadata belongs to the vehicle catalog.

Audio owns procedural sound and consumer read contracts; vehicle binds authored acoustic profiles and browser adapts physical observations. Audio imports only Core; physics never imports audio. See [audio](audio.md).

Browser owns bounded HTTP delivery and may import GroundMap manifest/residency contracts; GroundMap never imports browser or starts network I/O.

All general directory dependencies, including type imports, follow the acyclic ownership graph enforced by [repository hygiene](../tests/infrastructure/repository-hygiene.test.mjs). A small directory can own a distinct contract; file count alone is not a reason to merge those authorities.

General engine modules never import `src/dev`; only the three browser composition roots assemble concrete DEV content. Route/mode choices happen there. Runtime content provides ordinary reader contracts to physics, camera and renderer. Compilers own topology expansion, validation, static geometry and asset preparation; avoid per-pixel geometry, trigonometry or per-object alternative depth rules.

Keep painter, metric, physical-gate and local-coordinate regressions executable. Build-time asset cost, steady-state rendering cost and optional diagnostics are different measurements. Host timings are not target-device certification.

## Compiled profile and asset boundaries

Surface, logical GroundMap, visual sections and height nodes share immutable ordered construction and binary lookup. SurfaceMap owns physical-band sorting, overlap rejection and material validation. Terrain traversal merges explicit authored boundaries and emits adjacent positive intervals; it never advances coordinates by a nudge. Exact duplicate boundaries are removed, while distinct authored intervals remain represented.

Live envelope checks and `createSpriteAsset` validate consumed content. Sprite construction validates dimensions, buffer length, finite anchors and positive physical width, then freezes metadata so a second scale field cannot be attached. Runtime source reachability establishes production use; declared offline compiler reachability establishes build-time use. A test import alone establishes neither. Regression fixtures and diagnostics have separate DEV directories and must remain consumed by tests or tools.

## Ground authoring boundaries

`RoadCrossSection` owns ordinary road/shoulder dimensions. GroundMap profiles and stage road views
hold this geometry rather than independently authored width fields. Junctions retain a compiled
incoming cross-section and derive their outgoing road widths. Stage compilers derive terrain widths
and physical bands from the same geometry; terrain's flat numeric dimensions are compiled output.
The child-stage content currently explicitly uses 1 m shoulders, independently of the highway
parent's 1.5 m shoulders. Changing this content difference or boundary priority requires a separate
behavioral revision. Display extents and physical support extents remain separate inputs.
Stage registration exposes the applicable junction geometry and its chainage transform to route
intent; the runtime route tick does not inspect GroundMap paint or storage data.

Geometry does not own paint, grip or support. GroundMap materials, GroundBase sections and physical
surface sections retain independent ordered change points, compiled by their native profile types.
Visual types belong to visual/GroundMap, physical types to physics; no combined region table owns them.
The stadium's sand/dirt patches deliberately retain grass-colored diagnostic textures: their
physical materials are independent fixtures, not evidence of visually matched terrain authoring.

`OUTSIDE` interpretation is explicit: visual ground extents delimit drawing, while physical outside
bands delimit support and their absence means VOID. For example, branching-highway ground is drawn
out to 13 m to cover the split, while ordinary physical outside bands end at 12 m. These are separate
purposes, not competing road-width authorities. Existing shared-edge semantics are retained:
ordinary visual classification prefers road, ordered physical bands prefer the left inclusive band,
and junction classification uses its explicit lateral tolerance. Changing those conventions would
be a separate behavioral revision, not a cleanup.

## Accepted authoring target

The [Course Editor target](#course-editor-target) owns the revised future frame/ground contracts.
The completed sprite reader, normalization, authored-palette compiler and Sprite Tool described above
are implemented. Real-art filter/coverage acceptance and source-camera/variant sampling remain open.
Vehicles retain SINGLE presentation. The following residency section describes the current paged
GroundMap implementation, retained until its replacement passes the target gates.

### GroundMap compilation and residency

The file-backed compiler, content-addressed publication, shared residency and browser readiness
lifecycle serve LINEAR, BRANCHING, TSUKUBA and FISCO. The product build includes all eleven branching
stage domains and the three ordinary course/lap domains at the current camera-derived density and
complete target pyramid. GroundMap owns the image lattice, filtering, encoding and resident reader;
runtime owns stage/circuit coordinate adapters; browser composition owns asynchronous loading and
readiness. Topology and physics do not depend on asset availability. Target-device memory and frame
time acceptance remains separate from this implementation.

**Compiler input and domain.** Compile one immutable final-color source over an explicit finite
local rectangle. The source supplies its metric domain and a deterministic color evaluator; concrete
course/stage composition supplies geometry, paint and material inputs through existing owners.
`GroundMapCompileSource` owns the finite rectangle and evaluator; `createGroundMapCompileSource`
adapts ordinary profiles or a StageRoadView through the existing paint samplers. It rejects already
baked inputs and out-of-domain source access. Callers keep the referenced paint inputs immutable
throughout compilation. An absent logical profile retains the current grass fallback.
Its initial evaluator reproduces current point-sampled procedural paint. Exact-area composition,
new material palettes and color-space changes remain separate unresolved image-processing work.

A stage evaluator includes the existing local junction and shoulder precedence, then source
chainage/lateral transforms, exactly once. Its baked reader consumes stage-local coordinates directly;
runtime must not apply those transforms or repaint shoulders a second time. Ordinary source and
stage evaluators are compiler inputs to one baking pipeline, not permanent renderer alternatives.
Circuit repetition remains a runtime-owned mapping to one lap asset.

Keep the currently authored finite domains initially. A route gate or handoff seam is not an image
endpoint: camera lookahead, visible terrain, reverse travel and recovery may still require adjacent
source content. A smaller authored domain requires proof of all supported accesses, including run-in,
runout and transition overlap. Storage paging alone does not trim or rebase an asset's domain.

**Global lattice, bounded generation.** Derive aligned dimensions, actual spacing, texel centers and
all LOD grids once for the complete finite source. Storage pages reference integer row ranges on
those grids. They do not derive a new density or restart marking/material phase. Coarse-level
footprints may cross many fine-level storage pages; page size does not limit a filter footprint.

First preserve existing alignment, sequential 2-by-4 channel averaging/rounding, L0 palette selection,
RGB555 encoding and chunk enumeration. Stream source rows through bounded row buffers at each level,
then encode completed row groups. Never allocate a full L0 plus a copied L0 and all pyramid levels.
The implemented compiler samples L0 once into a temporary file while discovering its global palette.
Palette tracking stops after proving overflow; subsequent encoding reads that spool without
resampling the source. It never chooses a palette independently per chunk.
A compiler output sink spools completed payloads and supports bounded candidate reads for exact
dedup comparison. Keeping every encoded payload in RAM would defeat the memory bound.
Only directory/index metadata grows in RAM with course length; scratch disk and final output grow
with image data and are separate costs. The current compiler caps its owned live pixel/encoded
buffers with `maxWorkingBytes` (64 MiB default) and processes `rowsPerBatch` (256 default, multiples
of four). These are build controls, not smartphone budgets or guarantees about process RSS,
metadata, I/O internals or garbage-collection latency. Oversized chunks fail explicitly rather than
changing output layout. The caller owns a fresh storage workspace and its cleanup on failure.
[File storage](../tools/build/ground-map-files.mjs) supplies this contract without Node imports in
the compiler. Build tools publish the resulting binary only after compilation succeeds.

The first compiler refactor must reproduce current finite-source metadata and binary output,
independent of working-buffer sizes. A later paged transport format may change serialization,
but decoded texels and metric lookup must remain identical to that compiler. Do not combine
alignment optimization, different filtering or earlier quantization with this refactor.

**Asset identity and delivery.** The versioned product manifest is published with a stable source identity,
compiler/target identity, input digest, finite domain, lattice/LOD descriptors, palettes and an ordered
page-to-payload directory. A page identifies its level and row range; a payload identifies immutable
encoded bytes, byte length and digest. Palette interpretation belongs to the manifest, even when
two manifests share identical indexed payload bytes. Package IDs bind to a manifest digest, not
to mutable filenames. All references stay within the selected immutable deployment build.

Publish completed payloads as separately addressable files; do not depend on HTTP range support
or assume that compressed transfer bytes remain compressed in the reader. The monolithic v1 test
asset is a regression input during migration, not a second product loading mode. The build validates the wire schema and transport granularity; the deployment workflow verifies
actual public responses after publication.

The implemented `ground-map-pages` transport manifest (version 1) wraps the existing compiler
directory without redefining its lattice. Directory offsets retain canonical compiler byte ordering;
they are not HTTP range requests. Source, compiler, target and input digest identify the build.
The manifest's SHA-256 is the package binding; payload files are named by their encoded-byte digest.
Build publication checks payload length/hash and writes the manifest after payload completion.
`build:ground` writes a versioned `catalog.json` binding each source ID to its manifest digest and
publishes opaque `.bin.gz` payload files named by the digest of their decoded encoded bytes. Gzip
reduces stored/downloaded bytes without changing the compiler encoding or reader lattice. Product
loading explicitly decompresses these files; it does not rely on Pages adding HTTP compression.
`GroundMapHttpSession` binds URLs to the module's selected `/build/<commit>/` root, or the coherent
`/dist/` development/compatibility build. It rejects redirects, partial responses, foreign-session
assets and mismatched digests. It bounds compressed streams, streams decompressed bytes into exact
payload-sized buffers, serializes manifest reads and enforces request deadlines. Content-Length is
not decoded size. Session disposal aborts transport and invalidates readers; consumer cancellation
alone retains shared admitted loads. Loopback tests validate gzip delivery and the deployment
verifier checks all source bindings, sampled payloads and server headers at the published SHA.
Manifest objects, fetch/decompression internals and renderer buffers are outside payload accounting.

**Resident reads and accounting.** One application-owned immutable payload store shares bytes across
readers, repeated circuit windows and consumers of the same content. Ground render demand determines
residency; a physics actor does not acquire image pages merely by occupying a stage. The frame
preparation step resolves level/row demand from the same terrain lines and selector used for drawing,
loads missing payloads asynchronously, then pins the required set for the whole draw. Sampling stays
synchronous and allocation-free with respect to fetching/decoding; it never starts I/O or filtering.

The loader owns fetched buffers exclusively and exposes no mutable aliases when publishing them to
the store. Preserve defensive copying at APIs that still accept caller-owned mutable bytes. Avoid a
whole-course copy by loading bounded payloads; remove a copy only where exclusive ownership is proven.
Concurrent requests for one payload share one load. Eviction releases only unpinned payloads; stale
requests from an old course selection cannot publish a reader into the new session.

`GroundMapPayloadStore` admits an entire requested set before I/O, sharing in-flight loads by
digest and evicting only unpinned completed entries in least-recently-used order. `reservedBytes`
counts admitted payload capacity (including resident bytes); `residentBytes` counts published bytes,
and `pinnedBytes` counts each required payload once. These overlapping counters are not summed.
`loadingBytes` conservatively reserves two payload lengths per concurrent transport/hash validation.
The transport must return an exact-size ArrayBuffer; ownership transfer detaches its aliases before
hash validation. Network/decompression internals remain transport-owned and separately budgeted.
No application-owned payload array is exposed. Eviction also clears bytes from released lease
objects, so retaining an old released reader cannot retain evicted payload buffers.

Cancellation applies to pending acquisitions: it releases that consumer's pins and cannot return
a stale ready reader. Already admitted loads finish into the bounded shared cache, even if all
consumers cancel; reservations remain charged until they settle. A successful frame lease instead
requires explicit release after drawing. Digest/length/transport failures discard the entry and
allow a new acquisition to retry. A failed multi-payload acquisition releases all its pins.
Manifest-specific palette index validation completes before exposing a ready reader. Shared bytes
never share palette interpretation. The immutable directory is shared across frame readers, and
the existing `BakedGroundMapAsset` owns both monolithic-test and resident-page metric lookup/decoding.
Sampling outside a lease's resident set or after release fails without I/O or fallback.

The integration profile declares limits for compiler pixel/payload working buffers, resident payload
bytes and concurrent load/validation buffers. Count shared payloads once, but include simultaneous
old/new frame pins and incoming data. Metadata, network/decoder buffers and the rest of the application
are separate costs. A request that cannot fit must produce explicit capacity failure, not silently
exceed a limit, drop required pages or select a different LOD. Numeric target-device budgets remain
unapproved; host RSS and gzip measurements cannot establish those limits. The current application
limits are 64 MiB resident encoded payloads, 8 MiB concurrent load/validation reservations, 4 MiB
per manifest/catalog and a 30-second request deadline. These are explicit admission controls, not
whole-browser memory budgets or smartphone acceptance. Compressed input is limited to twice the
decoded payload length (at least 1 KiB); network/decoder internals are not counted as owned buffers.

Unavailable data is an explicit readiness result before presentation, never grass substitution,
procedural fallback or hidden lower-resolution sampling. Browser loading behavior and simulation
scheduling are governed by the [content integration design](content-and-gameplay.md#groundmap-loading-and-handoff).

**Compiled frame rendering contract.** The required `ground` renderer input is a complete scene-local
final-color reader. It never reapplies source offsets, local shoulders or junction paint. Geometry
still supplies projected ground bounds. `collectDrivingGroundSamples` uses the same terrain
preparation and chainage footprints as drawing; page assets resolve levels and rows with the reader's
existing selector and endpoint rule. Scene inputs remain fixed between collection and presentation.
A synchronous resident hit never resets the running scheduler. Missing data enters the explicit
loading lifecycle above before any new frame is presented.

This product cutover explicitly replaces procedural point sampling during drawing with precompiled
point-sampled L0 and the existing 2-by-4 prefiltered pyramid, nearest texel lookup, RGB555 coarse
levels and chainage-footprint LOD selection. Changed ground pixels are intentional; geometry,
projection, physics, source paint and sprite contracts are unchanged. The product build verifies
44 complete baked frames in [the pixel fixture](../tests/fixtures/product-ground-pixels.json) and
independently checks L0 texel centers against source color evaluators. The immutable source-rendering
oracle remains exercised through an input-only [diagnostic adapter](../src/dev/diagnostics/source-ground-render.ts)
into the same renderer; it is not the product pixel contract. Circuit runtime windows no longer
copy image directories: tests require the existing finite window-to-lap mapping and shared reader.

## Course Editor target

This target chapter defines Course Editor frame and image contracts. Existing current-implementation sections remain
in force until the corresponding implementation milestone is validated. This chapter owns frame
mathematics, image/composition rules and completed-ground representation; gameplay transactions and
source-document semantics belong to [content and gameplay](content-and-gameplay.md).

### Frame transform and coordinates

A Link stores `destinationFromSource`: translation `t` and a rotation `R` about +Y. For position `p`
and a vector `v` expressed in the source frame, `p' = R p + t` and `v' = R v`. Identity is a value of
this one transform, irrespective of Link kind. The inverse uses `Rᵀ` and `−Rᵀt`.

The transform preserves metric length, world up and gravity. Transform world-expressed orientation
and angular quantities by the same basis change; body-local components, wheel speeds and control
scalars retain their values. Derived caches are rebuilt or transformed from their documented basis.
This is coordinate re-expression, not a physical impulse. The [commit transaction](content-and-gameplay.md#occurrences-and-frame-commit)
owns which state changes atomically and when. Horizontal seam geometry is a separate authoring condition.

Core continues to expose finite open readers, the existing Raster/Guide geometry, `Y(s,l)=Y(s)` and
chainage-based pseudo-projection. Runtime supplies a derived continuous local view across Links.
Renderer and integration consume that view through ordinary reader contracts. The source Section's
address and a view address have one explicit mapping; neither is awarded race progress.

### Source and completed images

| Representation                  | Colour and alpha                                                             |
| ------------------------------- | ---------------------------------------------------------------------------- |
| Normalized sprite/ground source | RGB555; at most 15 distinct opaque colours; transparent index 0.             |
| Completed sprite LOD            | Existing indexed-image/anchor contract, unchanged.                           |
| Completed ground at every level | Fixed RGB555 colour values, stored as two-byte texels in the initial design. |

RGB555 value zero is opaque black; transparency belongs to the index, not the colour code. A fully
opaque ground swatch still has at most 15 colours. Source density is 40 texels/m in both authoring
axes. Reuse the existing PNG adapter, metric/crop/anchor normalization, explicit palette and coverage
recipes, source admission and RGB555 codec. Ground compilation consumes normalized masters rather
than sprite LODs. The driving runtime receives completed images.

The composed ground strip has opaque coverage. Source transparency reveals a lower layer. GroundBase
retains its independent left/right colour-or-transparent fill outside the strip. Visible unsupported
terrain and transparent outside fill do not alter the physical support map.

### Source lattice and tile dictionary

A source tile covers 64 × 64 source cells, or 1.6 m × 1.6 m in the Section chart. Source origin, phase
and metric extents are explicit. Partial edge cells are clipped; storage never stretches the course.

The following anisotropic output lattice is a **candidate**, pending the image/footprint acceptance
in [development](development.md#image-and-geometry-acceptance):

| Level  | Storage for one near-tile footprint | Density: lateral × chainage, texels/m                        |
| ------ | ----------------------------------- | ------------------------------------------------------------ |
| Source | 64 × 64                             | 40 × 40                                                      |
| L0     | 64 × 16 RGB555                      | 40 × 10                                                      |
| L1     | 32 × 4 RGB555                       | 20 × 2.5                                                     |
| L2     | 16 × 1 RGB555                       | 10 × 0.625                                                   |
| L3+    | Coarse Section RGB555 images        | Lateral density halves; chainage density quarters per level. |

One near-tile record contains all its completed L0–L2 pixels. Exact equality of the complete record
permits deduplication across the course. Equal L0 with unequal lower levels remains two records.
Coarse levels use the composed Section field across tile/material boundaries. They share the same
final-colour read contract as near tiles. Compile enough levels for the declared footprint envelope.

Map rows reference tile records and retain explicit lateral ranges on the source lattice. Source
variants, orientation and phase are resolved during compilation; map entries carry tile references
rather than palette IDs or flip controls. Exact packing and integer limits are to be validated with
the format reader; an illustrative four-byte reference is not a frozen bit layout.

### Ground LOD and filter

The two-axis geometric-mean selector is a **candidate**. For nonnegative actual lateral footprint
`deltaL` and complete effective chainage footprint `deltaS`, start each axis at L0 and advance while:

```text
lateral:   deltaL >= sqrt(2) * qL0 * 2^k
chainage:  deltaS >= 2       * qS0 * 4^k
selected level = max(lateral level, chainage level), within the available range
```

Here `qL0` and `qS0` are the metre-per-texel spacings derived from the candidate lattice above.
Equality selects the coarser level, matching the existing sprite boundary convention. Use the same
computed thresholds in implementation and boundary tests. Collapsed rows contribute their entire
source footprint. A chainage-driven coarse level may produce large lateral texels; ordinary-row
pixel-size estimates are conditional, not an all-terrain guarantee.

Generate every level directly from the composed source by deterministic area integration with an
explicit colour-space recipe, then quantize through the common RGB555 codec. Storage boundaries
read the required neighbouring source footprint. Link/loop overlap supplies boundary context; true
finite source edges use the declared clipped footprint. A storage tile is not a filter boundary.
Sprite and ground reuse colour/area primitives but retain different output quantization and lattices.

Runtime uses nearest completed-texel sampling. Palette interpolation, crossfades and progressive
requantization of already filtered levels are outside this pipeline. The filter recipe and selector
are frozen only after real-art comparisons; synthetic level colours establish addressing, not quality.

### Ground composition and stamp placement

The saved composition order is:

1. Material fills, static A/B patterns and seeded repair scatter from authored boundary geometry.
2. Boundary treatments and dimensioned paint/markings.
3. Ordered stamps, with later opaque source pixels covering earlier pixels.

Recipes retain phase origins, seeds, width and ordering. Geometry regenerates procedural content;
independent stamps remain saved placements. Boundary treatment is offline rasterization along an
authored curve. Runtime receives one final colour field, not layers or deformed ground sprites.

A stamp's resolved top-left edge is quantized independently in each source axis by
`gridIndex = floor(40 * coordinateMeters + 0.5)`, with half-cell ties towards the positive axis.
The displayed/compiled edge is `gridIndex/40` metres. Show this resolved location in the editor.
The saved anchor retains its meaning after geometry edits. This image-placement rule does not round
road geometry, vehicle coordinates, physical boundaries or rule landmarks. Bitmap shape supplies
orientation and extent; ground placement adds no runtime rotation, scaling, skew or stretch.

### Static A/B recipe

A normalized indexed base image A and one saved colour-mapping recipe are the only A/B authoring
inputs. The recipe maps each of A's opaque slots to an explicit RGB555 value; transparency and the
index-pattern geometry remain unchanged. The derived B image is reproducible output. Repeated target
colours can be compacted when exporting B through the shared image validator. B is not another edited
source. Shape-changing patch variants remain ordinary separate source images, not A/B colour variants.

Pattern phase chooses static A/B colour during composition. Mixed-material or inside-tile stripe
boundaries resolve to completed colours before filtering. Ground runtime needs neither palette banks
nor animation, nor a 15-colour restriction on completed mixed tiles. The source-image restriction
remains unchanged. Saved recipes and bytes, not AI regeneration, establish reproducibility.

### Bounded compilation and resident data

Flattening defines one logical source field. The compiler evaluates bounded tiles/strips and all
required filter support, rather than allocating a whole-Section source bitmap. Final-colour output
is independent of batch size and traversal order. Working pixel buffers are bounded; dictionary and
directory metadata, temporary storage and final output have separately measured growth.

The completed manifest binds format/compiler/input identity, domains, grids, tile records, coarse
images and byte lengths/digests. Validate content identity and payloads before exposing immutable
readers. Count shared records once; exact equality, not digest equality alone, establishes compiler
deduplication. Source geometry and SurfaceMap remain independent of image storage.

A ready course has all ground assets, including all branches and one lap source, resident. Sampling
is synchronous and performs no acquisition or prefiltering. Row/span setup resolves addresses before
the inner pixel loop. The [loading transaction](content-and-gameplay.md#course-loading) owns activation,
retry and replacement; [development](development.md#capacity-model) owns accounting and measurements.

### Remaining technical gates

The output lattice/selector, real-art colour-space/coverage recipes and exact packed format remain
candidates. Existing camera/source conventions are retained; device budgets are established by measured
whole-application acceptance. A candidate may be revised explicitly in this owner and its tests.
Vehicle lamp states remain outside this work: a later design may select immutable SINGLE-sprite
variants from read-only state without introducing shared mutable palettes or a scheduler.
