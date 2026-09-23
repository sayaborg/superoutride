# Architecture and rendering

This document owns coordinate and geometry contracts, projection, camera metric, rendering and layers.
[Content and gameplay](content-and-gameplay.md) owns course data and game rules;
[Image assets](image-assets.md) owns image formats and compilation.

## Coordinates and readers

World X/Y/Z is authoritative: +Y is up, yaw zero faces +Z and positive yaw turns toward +X.
Positive lateral `l` points right. For heading `psi`, the planar tangent and right normal are:

```text
t = (sin(psi), cos(psi))
n = (cos(psi), -sin(psi))
```

Course `(s,l)` is an observation. Raster and Guide share plan chainage `s`; physical distance along
an offset or sloping path is different. Local projection uses a previous segment and a finite clipped
search neighborhood. Spawn and recovery supply known seeds. Invalid seeds fail explicitly.
Optional lateral clamping acts in the Guide basis before a frame's lateral-origin subtraction;
ordinary physical projection is unclamped.

`GuideCoordinateSource` supports a GuidePath, a constant-origin frame and a `GuideCoordinateReader`.
The common reader exposes a finite domain, point/metric sampling and seeded local projection.
Source-array inspection and global projection belong to source authoring. Terrain and rendering use
`RasterGeometry`: finite length, segment stations/headings and point mapping.

Vec2/Vec3 are readonly values. Sampling APIs with caller-owned outputs return borrowed observations
valid until those outputs are reused. Compiled sources are immutable; actors and consumers own live state.
RasterPath, GuidePath, HeightProfile, VisualProfile and ground appearance have finite domain `[0,L]`.
Profile endpoints normalize within 1e-9 m; Raster/Guide sampling uses 1e-8 m. Nonfinite source values fail.
The adjacent segment supplies an endpoint basis; interior vertices own turns and fillets.

## Numerical conventions

Euclidean norms use `Math.hypot`. Nonfinite inputs and extreme magnitudes follow the
runtime's standard `Math.hypot` behavior.

[Core tolerances](../src/core/tolerances.ts) defines shared endpoint, geometric, lateral-boundary,
pixel-edge and texel-spacing tolerances. Other thresholds belong to their dimensional algorithms:
turn/fillet construction, depth inversion, world crossings, event ordering, solver residuals and control response.
A sampling tolerance changes neither point ownership nor earned progress.

## Raster and Guide

Raster is a polyline with at most 10 degrees of heading change at an interior vertex. Independent
left/right bounds use its exact miter map; a constant-width corner has ratio `1/cos(Delta/2)`.
Mapped strips require finite joins and positive local Jacobians. A Section is a local chart;
different chainages can occupy the same XZ position.

Source compilation establishes local geometry and metrics. A consumer additionally requires complete
query coverage, the root's contact/fixed-step domain and unambiguous mapped geometry over its bounded
window, including occurrence transforms. Occurrence, local seed and height identify a passage.

Guide rounds corners with straight/circular fillets while rendered road geometry stays Raster.
For turn `Delta`, radius `R`, lateral bound `L(s)` and minimum metric `mMin`:

```text
mu = abs(Delta)/(2*tan(abs(Delta)/2))    (mu = 1 at zero turn)
kappa = sign(Delta)/R
J = mu*(1-kappa*l)
Rmin = sup(L(s), over the complete fillet)/(1-mMin/mu)
trim = R*tan(abs(Delta)/2)
maximum Guide/Raster deviation = R*(sec(abs(Delta)/2)-1)
```

Require `0 < mMin < mu`, `J >= mMin`, nonoverlapping adjacent trims and the intervening straight
required for opposite-curvature fillets. Guide is G1; parameter speed changes between 1 and `mu`.
A positive straight longer than sampling tolerance is a real primitive. At roundoff-size joins,
lookup uses the adjacent segment within the reader's sampling tolerance.

`GuidePath.envelope` is one immutable piecewise-linear bound. Constant input becomes two equal knots.
Course geometry derives the bound from active Region edges plus an explicit positive margin, using both
incident cells at transitions. Complete fillets include clipped endpoints, interior knots and extrema.
Each query uses its local bound. The envelope is a coordinate domain; physical support comes from material bindings.

## Boundary geometry and local windows

Boundary profiles are piecewise linear on the Raster ruler. Width and center are derived from their
edges. Shape partitions include Raster vertices, height/boundary knots and activation changes.
Varying edges under the interpolated miter map are quadratic. Closed-cell Jacobian extrema establish
local non-inversion; paint changes alone do not divide geometry.

`compileCourseGeometryWindow` accepts canonical Raster, Guide and Region-partition readers and a
positive closed source interval. It returns an immutable `local-geometry` result for those references
and that interval. Mismatched readers or out-of-domain intervals fail. Nonadjacent Raster/Guide
construction hulls must separate within geometric sampling tolerance; otherwise `ambiguous_geometry`
identifies the mapping and both source intervals. The limit is 1024 cells per mapping;
`resource_limit` reports an excess. These are conservative bounded-window results.

Point regions are half-open laterally: `[left(s),right(s))`. A shared edge belongs to the region on
its right; the outer left edge is included and the outer right edge is outside. Zero-width endpoints
own no area. Gaps use the consumer's outside result: physical VOID or no eligible lock region.
Visual Bands do not use Region membership and can cover the entire lateral plane. Closed bounds used for geometric containment and clipped areas used by image
filters do not change point ownership.

## Height and projection

Ground height is `Y(s,l)=Y(s)`. Rendering uses piecewise-linear height; physics and camera use the
same smooth HeightProfile. Render-height mapping preserves physical clearance above local ground.

```text
d = s_object-s_camera                    d > 0
xr = (X-Xcam)*cos(psiCam)-(Z-Zcam)*sin(psiCam)
scale = f/d
screenX = cx+scale*xr
screenY = cy-f*sin(phi)-scale*(Y-Ycam)*cos(phi)
horizonY = cy-f*sin(phi)
```

Depth is chainage difference. Equal depth gives equal scale, and equal depth/height gives equal
screen Y. Each terrain station projects to one horizontal line with affine horizontal texture mapping.
Forward visibility depends on road heading and camera direction. Terrain draws far to near, allowing
hills to overdraw earlier rows. A degenerate thin span occupies one row with its complete source footprint.

## Camera and fixed metric

The player reference is 2 m wide, 80 source texels and 80 screen pixels:
`f/D_cam=40 px/m`, `D_cam=f/40`. Current `f=200 px`, `D_cam=5 m` and near/far depths are 2.5/200 m.
FOV changes preserve this metric. Ground and sprites share this depth interval.

Camera chainage is `s_vehicle-D_cam`; its XZ offset uses body yaw by default or movement yaw as the
alternate. The observer's shell owns the camera rig; rivals have no camera. After a committed
frame change the shell applies the reported yaw rotation to yaw and movementYaw before the next
camera update. Camera vertical state is unchanged by the frame transform. Horizontal centering follows projection. Vertical follow is bounded and smoothed, body
pitch offsets downward base pitch, and camera roll is zero. Current presentation values are 12 degrees
base pitch, player anchor row 190, 0.22 s vertical-follow time constant and 4 m correction bound.

## Ground and background

BG is one infinite tiled plane. Yaw and pitch change its view; translation does not.
An occurrence frame change transforms the background yaw origin with the camera frame.
[Image assets](image-assets.md#infinite-tiled-background) owns its format and angular mapping.
Transparent ground makes no ground write, preserving the underlying Painter image, including BG
below the horizon. Physical support is independent of all ground colors.

### Band rendering

Compilation expands the [authored constructs](content-and-gameplay.md#band-ground) to affine Band
pieces. It divides the s ruler at activations, knots and lateral-edge crossings, then resolves the
last declared covering Band. Resolved spans are disjoint, cover the open lateral plane and coalesce
adjacent equal colors; transparent upper Bands erase lower colors before filtering. The active count
includes hidden declarations, not just the visible resolved spans.

The compiler averages resolved colors over complete dyadic s intervals: `[k*2^n,(k+1)*2^n]` metres,
starting at one metre. Profiles store premultiplied linear-sRGB channels and coverage as piecewise-linear
functions of fixed source-l coordinates. An edge that moves across an interval becomes a ramp rather
than a relocated hard edge. Equal complete profiles share private coefficient storage and per-level
indices. Resolved records and public metadata are deeply immutable; mutable numeric buffers remain
behind the compiled product's read boundary.

A row uses the terrain projection's representative s and effective depth footprint `deltaS`.
A projected `[-1,+1]` metre ruler supplies the affine screen-to-l map; it does not clip ground.
The product has one complete mode, not independently configurable s/l kernels:

| Mode        | Longitudinal read                                               | Lateral read at pixel center x and width w |
| ----------- | --------------------------------------------------------------- | ------------------------------------------ |
| POINT-POINT | Instantaneous resolved Bands at the row's s for every footprint | Value at x                                 |
| LEVEL-POINT | One cached dyadic cell, or instantaneous Bands when `rho < 1`   | Value at x                                 |
| EXACT-BOX   | Exact integral over the row's centered depth interval           | Exact mean over `[x-w/2,x+w/2]`            |

POINT-POINT and LEVEL-POINT use the source owning s and its lateral origin; a seam belongs to its
successor. The instantaneous read follows the ordered resolved slab without preblending or sorting.
LEVEL-POINT uses `rho = deltaS / 1 m` with the [shared image selector](#shared-image-level-selection).
It reads only the containing cell, without cell/level interpolation or mixing neighboring occurrences.
Only complete dyadic cells exist. At Section tails, the available prefix contains levels whose
containing cell exists; selection clamps to that prefix. The final closed endpoint uses the preceding
cell. A fractional-metre tail without a containing cell uses the instantaneous read.

EXACT-BOX clips the centered depth interval to source-owned view spans, maps their lateral origins
and decomposes the ranges into complete cached dyadic intervals. At most two partial one-metre
ends per source range integrate resolved affine edges directly. Sub-metre footprints use the same
rule; zero-length footprints use the instantaneous slab. Unowned overlap guards do not contribute.
Actual source lengths weight all contributions before coverage or color normalization. This is a
separable source-(s,l) row footprint, not a full perspective pixel polygon. Dyadic decomposition
does not change the mathematical integral.

The exact row workspace composes weighted profile events once; the other modes read their source
profile directly. All modes batch constant spans with fills or transparent skips. Only varying
profiles and box-boundary pixels need individual evaluation. No pixel loops over authored Bands.

RGB555 decodes through the common linear-sRGB channel table. Contributions stay premultiplied until
final coverage is known. Coverage at least the shared 0.5 threshold is opaque, allowing 64 machine
epsilons of relative row-area roundoff at equality. Opaque RGB divides by opaque area once, encodes
sRGB and rounds to RGB555; transparent pixels leave the existing image unchanged. Hidden colors and
BG do not enter the average. [Browser](browser.md#ground-display-setting) owns live selection and HUD observations.

## Sprites and Painter

Sprites have a logical master frame, physical width, a master texel-center anchor and completed levels.
Magnification is `g=(f/d)*worldWidth/masterWidth`. Course anchors use known chainage and render height;
actors use observed chainage and physical-clearance mapping. Yaw/bank variants are authored images.
Rendering uses nearest sampling, binary alpha and one SINGLE sprite per vehicle; bank is presentation.

Painter order is clear when requested, full BG, a far-to-near terrain/world-sprite merge, player, then HUD.
At equal depth terrain draws before sprites. The player is last among world visuals.

Course sprites enter through either a sprite array or a camera/depth observation reader. The reader
contains immutable camera/projection metadata and read-only image workspaces. An upright basis/ruler
change transforms world metadata while preserving its recorded screen projections and depths.
A different physical camera or depth interval rejects that observation. The array path computes its own projections.

### Sprite LOD metric and read contract

Master `W` by `H` has untrimmed, top-left-aligned level `k` storage
`ceil(W/2^k)` by `ceil(H/2^k)` and nominal master step `2^k`. Partial edge cells clip to the logical
frame. A contiguous prefix through `ceil(log2(max(W,H)))` is valid; the longer axis keeps shrinking.

The master anchor `(aX,aY)` maps per axis to `(a+0.5)/2^k-0.5`.
Default anchor is `((W-1)/2,H-1)`; fractional and outside-frame anchors are valid.
Every level represents `worldWidth` by `worldWidth*H/W` metres, independent of opaque/storage bounds.

For master footprint `rho=1/g`, sprites use the shared nearest-octave selector below. Display extent
and anchor remain continuous; texels and palette coverage are discrete. Builds supply full direct-master
LOD for shipped sprites.
[Image assets](image-assets.md#completed-sprite-images) owns the level/mixture encoding.

### Shared image level selection

Image's `selectImageLodLevel(scale, maxLevel)` is the single nearest-octave selection rule used by
both sprites and LEVEL-POINT. `scale = 1/rho`: destination pixels per master texel for sprites, or
`1 m / deltaS` for Bands. It selects the nearest integer `log2(rho)` exponent, clamped to the available
prefix `0..maxLevel`. There is one level per octave. At the geometric-mean boundary
`scale = 2^(-n)/sqrt(2)`, it selects the coarser exponent `n+1`. No interpolation occurs.
Band's instantaneous sub-metre read is analogous to sprite master magnification, not a cached 1 m cell.

## Course frames

Oriented Ports derive the upright transform `destinationFromSource`. With yaw rotation `R`:

```text
t = pDestination-R*pSource
p' = R*p+t
v' = R*v
inverse rotation = transpose(R)
inverse translation = -transpose(R)*t
```

The transform preserves world up, gravity and metric length. Source and destination height agree
in the common seam domain. World-expressed state follows the transform; body-local values remain invariant.
[Content and gameplay](content-and-gameplay.md#occurrences-and-frame-commit) owns atomic actor transitions.

A bounded occurrence view maps retained/selected source spans into its active frame. A span pairs
source/view chainage anchors, a Boundary-derived lateral origin and an upright transform. Source
identity, occurrence and frame are distinct, including laps. Successors own seams. Unrepresentable
station collisions fail explicitly. Narrow geometry/height/presentation readers share this mapping;
local projection seeds identify both occurrence and native segment.

`createCourseDrivingSource` owns the physical world, coordinate/height readers and an immutable
mapping of those same occurrence spans. Its motion guard uses the physical pose/step domain.
`createCourseDrivingViewSource` overlays Band, environment, background and scenery readers on that
mapping; it does not select another interval or perform physical projection. It accepts only views
of its canonical physical product and weakly caches rendering readers by mapping identity. Physical
views do not require presentation, and race does not create rendering readers for rivals.

## Layer boundaries

There are two source roots: `src` for the product and `tools` for authoring and build programs.
Product code never imports tools. TypeScript tools import product source, not its `dist/` delivery output;
writing generated artifacts to `dist/` is not a module dependency. Both roots share strict compiler
options and lint rules. [Development](development.md#typescript-tools) owns execution and checking commands.

Product source is organized by domain. Shared definitions, product compilation and runtime representation
belong inside that domain; an upper domain depends only on lower domains, and same-domain imports are unrestricted.

| Order | Layer   | Responsibility                                                                                                   |
| ----- | ------- | ---------------------------------------------------------------------------------------------------------------- |
| 1     | core    | General mathematics, vectors, planar transforms, validation helpers and tolerances                               |
| 2     | image   | Indexed images, RGB555/RGBA codecs, palettes, sprite/LOD formats, BG tiles and image filters                     |
| 3     | audio   | Sound synthesis and audio engines                                                                                |
| 4     | course  | Course documents and compilation, road geometry, materials, occurrences, environment profiles and geometry views |
| 5     | vehicle | Vehicle mechanics, definitions, catalog and accepted operation requests                                          |
| 6     | input   | Keyboard/touch adapters and arbitration producing vehicle operation requests                                     |
| 7     | race    | Sessions, progress, gates, timing, drivers, recovery, reference driving and envelopes                            |
| 8     | view    | Cameras, projection, ground rows, sprite placement, drawing composition and framebuffer                          |
| 9     | shell   | DOM, frame loop, HUD, DEV, startup and whole-scene composition                                                   |

The [dependency check](../tests/infrastructure/layer-dependencies.test.mjs) parses imports, type-only
imports, re-exports, inline import types, literal dynamic imports, CommonJS references, worker entries
and worklet modules. It also examines scripts in tool HTML and resolves TypeScript module aliases.
Product source has exactly these nine directories; startup files belong to shell. Every cross-domain
import follows the order and participates in the layer-cycle check, without product-layer exceptions.

Unmigrated course/graphics/audio JavaScript and HTML have exact importer/target pairs in
[the temporary tool exceptions](../tests/infrastructure/tool-dependency-exceptions.json).
No TypeScript tool or product-to-tool reference is exempt. New pairs fail unless explicitly listed;
unused pairs also fail. These legacy helpers can still introduce transitive delivery dependencies in
build scripts until their scheduled migration. Authoring-only sprite compilers/fixtures, course-project
and course-reference still occupy product domains pending that work in [NEXT](NEXT.md).

Shell owns the observer's camera, and race actors contain no camera state. A committed frame
transform is observed by the camera owner before its next update. Race publishes camera-independent
actor observations; view owns rival sprite selection and assembly. Course owns VehicleWorld, surface
readers and the physical driving source. Race consumes that source only. Shell binds physical and
presentation products and owns the combined pre-lock render/driver query-depth admission.
RGBA conversion, sprite images and LOD formats belong
to image; framebuffer writes and sprite drawing belong to view. Band modes, compiled color fields
and their still-co-located sampler belong to course; view owns display settings and consumes that sampler.
Environment profiles are course data. Authoring-only sprite fixtures currently reside in image.
