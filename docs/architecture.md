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
RasterPath, GuidePath, HeightProfile, VisualProfile and saved paint have finite domain `[0,L]`.
Profile endpoints normalize within 1e-9 m; Raster/Guide sampling uses 1e-8 m. Nonfinite source values fail.
The adjacent segment supplies an endpoint basis; interior vertices own turns and fillets.

## Numerical conventions

Core's `hypot2` and `hypot3` return bit-identical results to the supported Node runtime's `Math.hypot`
for their fixed-arity physics/gameplay uses. Compilation and authored rulers use `Math.hypot`;
camera and audio use their own numerical owners.

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
Course geometry derives the bound from active Band edges plus an explicit positive margin, using both
incident cells at transitions. Complete fillets include clipped endpoints, interior knots and extrema.
Each query uses its local bound. The envelope is a coordinate domain; physical support comes from material bindings.

## Boundary geometry and local windows

Boundary profiles are piecewise linear on the Raster ruler. Width and center are derived from their
edges. Shape partitions include Raster vertices, height/boundary knots and activation changes.
Varying edges under the interpolated miter map are quadratic. Closed-cell Jacobian extrema establish
local non-inversion; paint changes alone do not divide geometry.

`compileCourseGeometryWindow` accepts canonical Raster, Guide and Band-partition readers and a
positive closed source interval. It returns an immutable `local-geometry` result for those references
and that interval. Mismatched readers or out-of-domain intervals fail. Nonadjacent Raster/Guide
construction hulls must separate within geometric sampling tolerance; otherwise `ambiguous_geometry`
identifies the mapping and both source intervals. The limit is 1024 cells per mapping;
`resource_limit` reports an excess. These are conservative bounded-window results.

Point regions are half-open laterally: `[left(s),right(s))`. A shared edge belongs to the region on
its right; the outer left edge is included and the outer right edge is outside. Zero-width endpoints
own no area. Gaps use the consumer's outside result: physical VOID, environment ground fill or no
eligible lock region. Closed bounds used for geometric containment and clipped areas used by image
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
alternate. Horizontal centering follows projection. Vertical follow is bounded and smoothed, body
pitch offsets downward base pitch, and camera roll is zero. Current presentation values are 12 degrees
base pitch, player anchor row 190, 0.22 s vertical-follow time constant and 4 m correction bound.

## Ground and background

The renderer samples synchronous completed resident RGB555 ground inside a finite painted strip.
Outside that strip, left/right environment GroundBase values supply a color or transparency.
Transparent ground reveals BG below as well as above the horizon. Physical support is independent.
[Image assets](image-assets.md#resident-ground) owns the saved composition, lattice and filter.

BG is one infinite tiled plane. Yaw and pitch change its view; translation does not.
An occurrence frame change transforms the background yaw origin with the camera frame.
[Image assets](image-assets.md#infinite-tiled-background) owns its format and angular mapping.

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

For master footprint `rho=1/g`, select the nearest integer `log2(rho)` exponent within the available
levels; geometric-mean ties select the coarser level. Display extent and anchor remain continuous;
texels and palette coverage are discrete. Builds supply full direct-master LOD for shipped sprites.
[Image assets](image-assets.md#completed-sprite-images) owns the level/mixture encoding.

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

## Layer boundaries

Core owns finite geometry, height, transforms and shared numeric/color-independent primitives.
Course owns saved course values and boundary geometry. Graphics owns colors, indexed images, the
framebuffer and blitting. Visual owns visual profiles and image presentation data; Terrain projects
bounds; Render assembles drawing. Groundmap owns source-paint composition, completed-ground compilation
and resident readers.

Physics owns mechanics and surface interpretation and currently imports Core, Course and Input.
Input owns normalized driver requests. Camera consumes Core and Physics. Gameplay consumes Core,
Input and Physics for drivers, crossings, progress and recovery. Audio depends on Core; Vehicle binds
Physics profiles and Audio profiles.

Compiler consumes Core, Course, Graphics, Groundmap, Physics and Visual to publish the immutable
course reference graph. Authoring consumes Course and Compiler for project transactions. Runtime
composes occurrences and the shared scene from compiled readers and the geometry, mechanics, gameplay
and rendering layers. Browser adapts input, scheduling and presentation; product roots compose course
and vehicle choices. Dev contains graphics-only preview fixtures.

Dependencies are acyclic, including type imports, under the
[layer contract](../tests/infrastructure/layer-dependencies.test.mjs). Core, mechanics and pixel loops
receive narrow readers/data. The compiler has no dependency on Runtime, Authoring, Vehicle, Render or Gameplay.
