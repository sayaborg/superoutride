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

A Section's authored straight/circular primitive sequence is the planar authority. `s` is true arc length
along that centerline and positive `l` is distance along its right normal. With centerline `C(s)`,
normal `N(s)` and signed curvature `kappa`, planar coordinates are `C(s) + l*N(s)`; physical
distance along an offset or sloping path is different.

`PlanCoordinateReader` is the planar query interface for both a compiled Section and its mapped
occurrences. `CompiledSection.coordinates` and `VehicleWorld.coordinates` expose this same type:

- `domain.start` and `domain.end` bound the admitted s interval; `domain.lateralAt(s,out)` gives its
  closed asymmetric `[left,right]` bounds. An occurrence subtracts its mapped lateral origin from both
  edges. Coordinate bounds do not define material support.
- `toWorld(s,l,out)` reads world X/Z, heading and a `PlanProjectionSeed`. `metricsAt(s,l,seed,out)`
  reads `kappa`, centerline metric 1 and offset metric `J = 1-kappa*l`. Native and mapped readers use
  their own frame.
- `locateLocal(world,seed,searchRadius,out,workspace)` projects within a finite local neighborhood,
  without lateral clamping or a global-search fallback. The seed must have been issued by the same Reader
  and remain admitted by its Window. Invalid seeds, radii or retained coverage fail explicitly.

`PlanCoordinateSample` and `PlanCoordinateProjection` are borrowed observations in caller-owned outputs.
`PlanProjectionWorkspace` holds reusable numerical scratch, separate from vehicle state.
`SectionPlanCoordinateReader` adds `seedCount` and `projectionCandidates(start,end)` for mapped
composition. The requested interval must lie inside the Section domain. Candidate queries return
source-ordered positive-length coverage of that interval; candidate projection remains inside its interval
and returns native s/l/seed without lateral clamping. Invalid intervals or incomplete retained search
coverage fail explicitly. Geometry construction and its geometric proofs inspect compiled primitives.
Terrain and rendering use `RasterGeometry`: finite length, segment stations/headings and point mapping.

Vec2/Vec3 are readonly values. Sampling APIs with caller-owned outputs return borrowed observations
valid until those outputs are reused. Compiled sources are immutable; actors and consumers own live state.
RasterPath, HeightProfile, VisualProfile and ground appearance have finite domain `[0,L]`.
Profile endpoints normalize within 1e-9 m; plan/Raster sampling uses 1e-8 m. Nonfinite source values fail.
At a primitive or Raster boundary, the successor owns the interior station; the terminal endpoint uses
the final primitive/segment.

## Numerical conventions

Euclidean norms use `Math.hypot`. Nonfinite inputs and extreme magnitudes follow the
runtime's standard `Math.hypot` behavior.

[Core tolerances](../src/core/tolerances.ts) defines shared endpoint, geometric, lateral-boundary,
pixel-edge and texel-spacing tolerances. Other thresholds belong to their dimensional algorithms:
plan projection, depth inversion, world crossings, event ordering, solver residuals and control response.
A sampling tolerance changes neither point ownership nor earned progress.

## Plan authority and Raster

Each compiled plan primitive retains its author record, exact s interval, starting pose and signed curvature.
A straight has `kappa=0`. A circular arc of radius `R` and signed turn has
`kappa=sign(turn)/R`; its length is `R*abs(turnRadians)`. Primitive-anchor fractions therefore advance
linearly in true arc length. Section projection onto a straight or circular arc uses closed-form geometry.

At each s, the Section lateral domain runs from the leftmost active Region edge minus
`PLAN_COORDINATE_MARGIN_METERS` to the rightmost active Region edge plus that margin; the margin is 4 m.
The map from `(s,l)` in the entire closed Section coordinate domain to world XZ is injective:
different coordinate pairs occupy different points. The local part of this condition is
`J = 1-kappa*l > 0` throughout the domain. Compilation checks every circular primitive at
incident domain stations and checks separated longitudinal cells against one another using
conservative plan envelopes. `plan_coordinate_inversion` reports a local metric failure;
`plan_coordinate_overlap` reports the Section and two overlapping s intervals. An overpass
uses separate Sections for its two passages.

Raster is a rendering-only polyline derived from that authority. Straights use at most 50 m per segment
and arcs at most 5 authored degrees per segment. Every Raster vertex is sampled on the authoritative
centerline at an authoritative s station. Raster and plan therefore share the same ruler and Section length;
inside one Raster segment X/Z is interpolated linearly in s. Its miter basis supplies rendered lateral
positions. Raster geometry is not subjected to coordinate-domain injectivity: Bands are drawn by row.
Occurrences, local seeds and height identify passages through compiled Sections.

## Boundary geometry and point ownership

Boundary profiles are piecewise linear on the authoritative s ruler. Width and center are derived from
their edges. Region validation divides at boundary knots and activation changes; paint changes do not
divide physical geometry.

The compilation check divides the authoritative straight and circular plan at primitive ends,
domain knots and at most five degrees per arc cell. Adjacent cells share their endpoint and are
locally covered by the positive Jacobian; separated cells must have disjoint conservative
envelopes. A chord envelope is padded by `max|F''| * deltaS² / 8` for each linearly varying
lateral edge, bounding the exact curve between its endpoints. The envelope comparison uses
the geometric sampling tolerance of `1e-8` m for floating-point separation near shared
coordinates; this tolerance does not replace the curvature bound. Its cells do not depend on
Raster vertices.

Point regions are half-open laterally: `[left(s),right(s))`. A shared edge belongs to the region on
its right; the outer left edge is included and the outer right edge is outside. Zero-width endpoints
own no area. Gaps use the consumer's outside result: physical VOID or no eligible lock region.
Visual Bands do not use Region membership and can cover the entire lateral plane. Closed bounds used for geometric containment and clipped areas used by image
filters do not change point ownership.

## Height and projection

Ground height is `Y(s,l)=Y(s)`. Rendering uses piecewise-linear height; physics and camera use the
same smooth HeightProfile. `mapToRenderSpace` in `src/view/render-height-space.ts` maps every drawn
position from road-relative `(s,l,physicalY)`: its XZ comes from the view Raster Reader and its Y
preserves physical clearance above local ground against rendering height. Ground rows, Band and
Region positions use the same Raster ruler as vehicles and course sprites. Orientation remains the
physical yaw; Raster segment headings do not replace vehicle or camera yaw.

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
`f/D_cam=40 px/m`, `D_cam=f/40`. `f=200 px`, `D_cam=5 m` and near/far depths are 2.5/200 m.
FOV changes preserve this metric. Ground and sprites share this depth interval.

Camera chainage is `s_vehicle-D_cam`; its drawn XZ is the mapped player's XZ minus `D_cam` along
body yaw by default or movement yaw as the alternate. The camera rig retains its physical XZ and
vertical follow; only the renderer uses the mapped camera. The observer's shell owns the camera rig;
rivals have no camera. After a committed
frame change the shell applies the reported yaw rotation to yaw and movementYaw before the next
camera update. Camera vertical state is unchanged by the frame transform. Horizontal centering follows projection. Vertical follow is bounded and smoothed, body
pitch offsets downward base pitch, and camera roll is zero. Camera values are 12 degrees
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
starting at one metre. Lateral fields store premultiplied linear-sRGB channels and coverage as piecewise-linear
functions of fixed source-l coordinates. An edge that moves across an interval becomes a ramp rather
than a relocated hard edge. Equal complete lateral fields share private coefficient storage and per-level
indices. Resolved records and public metadata are deeply immutable; mutable numeric buffers remain
behind the compiled product's read boundary.

A row uses the terrain projection's representative s and effective depth footprint `deltaS`.
A projected `[-1,+1]` metre ruler supplies the affine screen-to-l map; it does not clip ground.
The product has one complete method, not independently configurable s/l kernels:

| Method      | Longitudinal read                                               | Lateral read at pixel center x and width w |
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

The exact row workspace composes weighted lateral-field events once; the other methods read their native
lateral field directly. All methods batch constant spans with fills or transparent skips. Only varying
lateral fields and box-boundary pixels need individual evaluation. No pixel loops over authored Bands.

RGB555 decodes through the common linear-sRGB channel table. Contributions stay premultiplied until
final coverage is known. Coverage at least the shared 0.5 threshold is opaque, allowing 64 machine
epsilons of relative row-area roundoff at equality. Opaque RGB divides by opaque area once, encodes
sRGB and rounds to RGB555; transparent pixels leave the existing image unchanged. Hidden colors and
BG do not enter the average. [Browser](browser.md#ground-display-setting) owns live selection and HUD observations.

## Sprites and Painter

Sprites have a logical master frame, physical width, a master texel-center anchor and completed levels.
Magnification is `g=(f/d)*worldWidth/masterWidth`. Course anchors use known chainage and render height;
actors use observed chainage and physical-clearance mapping. Yaw/bank variants are authored images.
Rendering uses nearest sampling, binary alpha and one SINGLE sprite per vehicle; bank is visual.

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
local projection seeds identify both occurrence and native primitive.

`createCourseDrivingReaders` owns the physical world, coordinate/height readers and an immutable
mapping of those same occurrence spans. Its motion guard uses the physical pose/step domain.
`createCourseDrivingViewSource` overlays Band, environment, background and scenery readers on that
mapping; it does not select another interval or perform physical projection. It accepts only views
of its canonical physical product and weakly caches rendering readers by mapping identity. Physical
views do not require presentation, and race does not create rendering readers for rivals.

## Layer boundaries

There are two source roots: `src` for the product and `tools` for authoring and build programs.
Product code never imports tools. Neither root imports executable modules from `dist/`; tools use product source.
Reading or writing generated content under `dist/` is not a module dependency. Both roots share strict compiler
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
| 7     | race    | Sessions, progress, gates, timing, drivers, recovery and envelopes                                               |
| 8     | view    | Cameras, projection, ground rows, sprite placement, drawing composition and framebuffer                          |
| 9     | shell   | DOM, frame loop, HUD, DEV, startup and whole-scene composition                                                   |

The [dependency check](../tests/infrastructure/layer-dependencies.test.mjs) parses imports, type-only
imports, re-exports, inline import types, literal dynamic imports, CommonJS references, worker entries
and worklet modules. It also examines scripts in tool HTML and resolves TypeScript module aliases.
Product source has exactly these nine directories; startup files belong to shell. Every cross-domain
import follows the order and participates in the layer-cycle check, without product-layer exceptions.

There are no dependency exceptions. Course project sessions, text parsing/saving and reference
production belong to `tools/course`; the product retains shared course admission, live driving policy,
and envelope/time-budget readers. Sprite normalization, palette generation, LOD compilation and
fixtures belong to `tools/graphics`. Shared image formats, filters, codecs and product limits remain
in `src/image`; authoring-only limits stay with the tools.

Shell owns the observer's camera, and race actors contain no camera state. A committed frame
transform is observed by the camera owner before its next update. Race publishes camera-independent
actor observations; view owns rival sprite selection and assembly. Course owns VehicleWorld, surface
readers and the physical driving source. Race consumes that source only. Shell binds physical and
presentation products and owns the combined pre-lock render/driver query-depth admission.
RGBA conversion, sprite images and LOD formats belong
to image; framebuffer writes and sprite drawing belong to view. Band modes, compiled color fields
and their still-co-located sampler belong to course; view owns display settings and consumes that sampler.
Environment profiles are course data.
