# Architecture and rendering

This document owns coordinate and geometry contracts, projection, camera metric, rendering and layers.
[Content and gameplay](content-and-gameplay.md) owns course data and game rules;
[Image assets](image-assets.md) owns image formats and compilation.

## Admission boundary

Course documents and assets are checked when read and compiled; delivered manifests, vehicle
definitions, envelopes, time budgets and external Session selections are checked at their intake. Cross-object
Session admission relates the requested settings, course and vehicle before actors exist.
Inside those boundaries, course/race constructors, readers and updates trust admitted data and
internal arguments: they do not repeat shape/domain checks or retain impossible failure branches.
Outside-route sampling and live gameplay decisions remain ordinary behavior. Vehicle-domain
failure propagation belongs to the vehicle layer, not course/race input validation.

### Content admission toolkit

[`core/admission.ts`](../src/core/admission.ts) is the one admission toolkit for authored formats and for the
generated products (the content manifest, rival envelopes, time budgets and pace schedules the game reads, and the
reference reports the tools read), which carry format/version headers and are admitted with the same rules, unknown
fields included.
Its shape readers check a JSON value and throw one `AdmissionError` addressed by a JSON Pointer:
`readDocument` (format, then version, then the exact field set), `readRecord` (a JSON object
with exactly the named fields; unknown fields first, then missing ones), `readDictionary` (a JSON object of
named entries), `readString` (nonempty, no surrounding whitespace, optional length ceiling and pattern), `readBoolean`,
`readNumber` (finite, optional closed or half-open range and integer; negative zero reads as zero),
`readEnum`, `readArray` (optional floor, ceiling or exact length), `readIdentified` (unique
`id` values) and `deepFreeze`, the one recursive freeze in the product: it ends at cycles and does not walk
again what it has already frozen. A JSON object is a non-array object whose prototype is the plain object
prototype or none, for records and dictionaries alike. A wrong type is `invalid_shape`; a string outside
its declared pattern, such as an ID or a SHA-256 digest (`SHA256_TEXT`), is `invalid_value`. Formats keep their semantic checks and report them through the same
error, with `requireAdmission` or a format subclass carrying its own codes. Readers of one format's values belong to
that format's owner, such as `readRgb555` in [`image/rgb555.ts`](../src/image/rgb555.ts).

Every expected admission failure is one diagnostic:

```text
{ kind: "input", code, document, path, message }
```

`document` is the delivered manifest path or authoring file (empty when a caller supplies none),
`path` is an RFC 6901 JSON Pointer into it (empty for the root), and `code` is a shape code shared by
all formats (`invalid_shape` for a wrong type or missing field, `unsupported_feature` for an unknown
field or construct, `invalid_numeric_domain` for a number outside its domain, `invalid_value`,
`resource_limit`, `duplicate_id`, `unresolved_reference`, `unsupported_format`, `unsupported_version`)
or a format's semantic code. `admit(document, read)` returns `{ok:true,value}` or `{ok:false,diagnostics}`
with the first failure; admission stops there and never publishes a partial product. Only admission
errors become diagnostics; other exceptions are internal faults and propagate.
`readEmbedded(base, read)` reads a document embedded in another, such as a sprite image inside the
vehicle sprite library, relocating its pointers under `base`.

The content layer owns catalogs of documents. A catalog admits `DocumentSource` records (`id`, `path`, `value`, `sha256`); `id` is the document's only
identifier, which the documents themselves do not repeat, and `sha256` is the digest of its delivered
bytes. The build makes them from file names and delivery from manifest entries, so both reach the same catalog admission and diagnostics.
`admitSingleDocument(sources, id, kind)` is the single-document rule: exactly one source, named `id`;
a failure is addressed to the extra or misnamed source's document (empty when there is none) at the root.

Compilers below a document boundary raise `DefinitionDomainError` with a slash-separated path relative
to the record they received. `withDefinitionPath` maps nested or derived fields back to the caller's
record, and `admitDomain` converts the result at the document boundary into an `invalid_value`
admission error at the JSON Pointer (`relativePointer` escapes each field).

## Coordinates and readers

World X/Y/Z is authoritative: +Y is up, yaw zero faces +Z and positive yaw turns toward +X.
Positive lateral `l` points right. For heading `psi`, the planar tangent and right normal are:

```text
t = (sin(psi), cos(psi))
n = (cos(psi), -sin(psi))
```

A Section is authored as straights and arcs by length. Its native frame starts the plan at the origin facing +Z
(heading 0). The entry Section's native frame is the world frame.
The straight/circular plan is the planar authority; derived arc turns are stored in radians. `s` is true arc length
along that centerline and positive `l` is distance along its right normal. With centerline `C(s)`,
normal `N(s)` and signed curvature `kappa`, planar coordinates are `C(s) + l*N(s)`; physical
distance along an offset or sloping path is different.

The shared `CourseRoute` is the selected Route: an append-only sequence of `RouteOccurrence` records that
never discards one. Its entry starts at route s=0, lateral origin=0 and an identity world transform. Each
successor begins at the previous Section's end: its Section chainage begins at zero, its lateral origin
accumulates the cut offset and its world transform composes the Link transform. Thus a repeated circuit Section
has a new route interval without changing earlier route coordinates; a circuit adds a few occurrences per lap.
Only two writers append: the fork decider selects a successor at a fork, and the Route's owner extends through
unambiguous Links. Consumers receive the read-only Route (`occurrences`, `start`, `end`, `terminal`, `at`).

A seam station belongs to the successor when the successor exists. Until a successor is appended, the tail
occurrence answers for its end station as an endpoint. When a successor is appended, ownership of the seam station
passes to it; existing stations and poses do not change.
`routeSectionS` and `routeS` own the chainage conversion; readers select an occurrence by binary
search, read the Section, subtract the lateral origin and map X/Z and heading into route world space.
The preparation layer supplies plan, authoritative height, ground-row height polyline, material,
Strip, sprites, visual labels and background readers. It indexes visual lists only when route
occurrences change. All actors, physics, race, rendering and reference driving read these
single-layer Readers directly and retain their state in route coordinates. The same reader set
supplies the authoritative coordinates to physics and rendering. These readers read the resident window below,
not the whole Route.

Outside the resident window, the Readers use the following values. Here `P`, `T` and `N` are
its endpoint position at route l=0, unit tangent and right normal, and `e` is that endpoint's s.

| Reader                     | Outside value                                                                   |
| -------------------------- | ------------------------------------------------------------------------------- |
| Plan                       | `P + (s-e) T + l N`, endpoint heading, curvature 0 and J=1                      |
| Projection                 | Project onto the endpoint tangent ray; return its s and l with `inDomain:false` |
| Height and render polyline | Respective endpoint height, derivative/grade 0                                  |
| Coordinate domain          | Empty closed interval `[+Infinity,-Infinity]`, defined by `EMPTY_ROUTE_DOMAIN`  |
| Material                   | No material, also outside the lateral coordinate domain                         |
| Strip and sprites          | No content; Strip pixels are transparent                                        |
| Environment/background     | Nearest endpoint value                                                          |

The tangent rays participate in the same previous-s ±50 m projection window as the resident
segments. In-domain feet take precedence; otherwise the candidate nearest the previous s wins. Neither a
world-origin placeholder nor a previous-s/l=0 fallback is used. These outside values do not
create a supporting surface. Contact and recovery rules are owned by
[Vehicle physics](vehicle-physics.md#surface-and-contact).

`createRouteRuntime` owns the Route's extension and one resident window, `RouteWindow`, with one reader set on
it for the entire field. The window is a contiguous suffix of the Route with the same read shape (`occurrences`,
`start`, `end`, `terminal`, and `at`, which is null outside the window). Only the runtime's `refresh` advances the
window, dropping occurrences behind it, and extends the Route as the forward coverage requires. No actor creates a
coordinate wrapper. The fork decider alone receives `selectSuccessor` and calls it once per fork; the ordinary
refresh extends any unambiguous successors. Physical and rendering
readers, the driver's live domain and residency decisions (observable rivals) read the window; race facts
(cross sections, fork field) and reference tools read the Route. The scene shows a state-selected sign from its
own fork occurrence's selected successor on the Route and rebuilds its sprite list when the window or the Route's
occurrences change.

One loading coverage record (`resolveLoadingCoverage`) derives the window's forward and rear extents once
from four inputs: the camera window the scene supplies (`dCam`, near and far depth), the driver lookahead,
recovery backtrack with the projection window and contact reach, and one fixed step at the vehicle speed bound.

```text
maximumStepMeters = MAXIMUM_VEHICLE_SPEED * SIM_DT
forwardMeters     = max(dCam + far, driver lookahead, projection window) + maximumStepMeters
rearMeters        = max(dCam + near, recovery backtrack + projection window + contactReachMeters) + maximumStepMeters
```

`MAXIMUM_VEHICLE_SPEED` is the product's 240 m/s (864 km/h) vehicle speed bound, which vehicle admission
enforces ([Vehicle physics](vehicle-physics.md#material-vehicle-and-driving-documents)); it does not clamp physics.
Contact reach is the ceiling of the largest `hypot(forwardOffset, freeReachDown)` across the catalog's
front/rear contact stations, so pitching or yawing a vehicle cannot enlarge that local reach.
The step allowance retains the rear footprint until the next refresh. With the current camera, driver and
fleet the record is 4 m per step, 484 m forward (`max(dCam + 200, 480, 50) + 4`) and 64 m rear
(`max(dCam + 2.5, 8 + 50 + 2) + 4`). `RouteRuntime`'s window and the scenarios' one-step check read it.
Until its lock decides, a fork's parent Section alone carries the forward coverage: creating the course world
checks every fork Section reachable from the entry for `lock.s + forwardMeters <= Section end` and rejects a
violation with a `RangeError` naming the Section.
Advancing the window never changes existing stations or vehicle poses. A single-successor circuit repeats its
ordered cycle of Sections for successive laps. Derived projection intervals, height knots, Strip
intervals and sprite lists rebuild only when the occurrence list changes.

`PlanCoordinateReader` is the planar query interface for both a compiled Section and its mapped
occurrences. `CompiledSection.coordinates` and `VehicleWorld.coordinates` expose this same type:

- `RouteWindow.start/end` are the single resident route extent. The world composition references that
  same object as `extent`; terrain and driver composition receive it explicitly. Route Readers publish
  no duplicate length or station range. A compiled Section retains its native domain.
- `domain.lateralAt(s,out)` gives the
  closed asymmetric `[left,right]` bounds. An occurrence subtracts its mapped lateral origin from both
  edges. Coordinate bounds do not define material support.
- `toWorld(s,l,out)` reads world X/Z and heading. `metricsAt(s,l,out)` reads `kappa`
  and offset metric `J = 1-kappa*l`. Both are determined by `(s,l)`;
  at a segment boundary the successor owns the station. Native and mapped readers use their own frame.
- `locateLocal(world,previousS,out,workspace)` searches only segment intervals intersecting
  `[previousS-50 m,previousS+50 m]`. A perpendicular foot inside its interval and the closed
  lateral domain wins over a closer centerline foot outside the domain. No endpoint-clamped point
  counts as an inside-domain foot. If none qualifies, the candidate with the smallest absolute change from previous s is returned with
  `inDomain:false`, without lateral clamping or a global search. The two endpoint tangent rays complete the route ruler
  when the window extends beyond resident occurrences.

Outside the domain, both segment feet clamped to the searched interval and endpoint-ray feet
participate in the previous-s comparison. Exact ties retain candidate order (segments first, then
entry and exit rays). In-domain selection retains occurrence ownership and centerline-distance precedence.
This follows a continuous local candidate while it remains preferred, instead of switching branches
merely because centerline distances cross. Endpoint clamping can hold s at a boundary while world
position continues moving. Global continuity is not guaranteed outside the injective domain: a path
through an arc center has no unique foot; angular branch changes, ties between distinct equally near
chainages, or the appearance of an in-domain solution on another branch can still change s discontinuously.
The finite search window also assumes successive observations remain on the local passage. These
singular/ambiguous cases are not resolved by a velocity or coordinate clamp.

`PlanCoordinateSample` and `PlanCoordinateProjection` are borrowed observations in caller-owned outputs.
`PlanProjectionWorkspace` holds reusable numerical scratch, separate from vehicle state.
`SectionPlanCoordinateReader` adds `projectionCandidates(start,end)` for mapped composition.
The requested interval lies inside the Section domain. Candidate queries return station-ordered
segment intervals; each candidate projects a bounded subinterval and reports whether its foot
was inside that subinterval before endpoint clamping. Geometry construction and its geometric
proofs inspect compiled segments.
Terrain reads the same `PlanCoordinateReader` as physics; the Route owns the extent.
`forwardEnd(start,end,yaw)` returns the first non-forward-facing tangent station, or the interval end.

Vec2/Vec3 are readonly values. Sampling APIs with caller-owned outputs return borrowed observations
valid until those outputs are reused. Compiled sources are immutable; actors and consumers own live state.
Plan, Profile, EnvironmentTimeline and ground appearance have finite domain `[0,L]`.
Station-sequence endpoints normalize within their admission budget; plan sampling has a separate geometric budget. Nonfinite source values fail.
At a segment boundary, the successor owns the interior station; the terminal endpoint uses
the final segment.

## Cycle closure

Topology admission first forbids self Links and checks reachability; DFS detects cycles and outgoing
Link counts detect branches. The derived kind admits only an acyclic
LINEAR/BRANCH graph or one unbranched CIRCUIT cycle of at least two Sections. In the latter case,
one incoming and one outgoing Link per Section plus reachability proves there is exactly one cycle.
The compiler follows that cycle from entry once and composes `toFromFrom` transforms in
traversal order. Acyclic merges are never compared for a common world embedding.

For an accumulated transform `(R,t)` followed by a Link, the positional error budget increases by
`edgeToleranceMeters + 2*sin(headingToleranceRadians/2)*|t|`; the chord term accounts for rotating
the accumulated translation with the next Link's angular uncertainty. The angular budget increases
by `headingToleranceRadians` per Link. These constants belong to `COURSE_LINK_RECIPE`: 1e-7 m
translation and 1e-10 rad heading per Link. The latter is a wrapped-heading/composition roundoff
allowance (at most 0.1 mm at a 1,000,000 m lever arm), not a driving allowance.
The final translation norm and absolute wrapped angle `atan2(sine,cosine)` must be within those
accumulated budgets. No correction is applied to authored geometry or Link transforms.

With V Sections and E Links, topology admission uses O(V+E) time and O(V) visited/active storage;
the closure pass uses O(V) time and O(1) additional storage. It does not enumerate cycle combinations.
This bound holds at the admitted 128 Sections / 384 Links. Graphs with branching cycles are rejected
by topology admission; broadening that admitted topology requires revisiting the closure proof.

## Route cross sections

`createRouteCrossSections` maps each occurrence's checkpoints, finish and fork lock to fixed route
stations with `routeS`. It reads the Route, and its ordered lists and closed lateral bounds rebuild only
when the Route appends an occurrence. Bounds come from the coordinate-domain Reader at the line station, with
successor ownership at a seam. A race line retains the canonical landmark identity for time budgets
and its finish-count lap number; line identity is independent of its index in the list.
For a circuit, a forward cursor follows the admitted single-successor sequence from entry and increments
the lap only after a Section's FINISH. It advances through skipped occurrences as needed and caches
lap numbers weakly by occurrence identity. Chainage additions follow the same order as the Route;
no division by lap length or occurrence ordinal supplies lap numbers.

The crossing calculation works entirely in `(s,l)`: forward arrival brackets the line's s, and
linear interpolation between the outer step's end points supplies both the within-step fraction and the
crossing l ([crossing-time contract](content-and-gameplay.md#route-cross-sections-and-progress)). A constant-s line
is the normal cross section of the authoritative plan. There is no Section-world pose conversion or
world-segment intersection in progress or fork selection. Gameplay orders and consumes these
crossings as specified in [Content and gameplay](content-and-gameplay.md#route-cross-sections-and-progress).

## Numerical conventions

Euclidean norms use `Math.hypot`. Nonfinite inputs and extreme magnitudes follow the
runtime's standard `Math.hypot` behavior.

Each numerical tolerance is a named constant owned by its calculation's module. Its definition
states the unit, the absorbed error or conditioning limit, and a quantitative budget or scale estimate.
A shared calculation has one shared constant; equal numeric values with different units or purposes
do not imply shared ownership. Fixed absolute budgets are not universal error bounds for arbitrary
magnitudes. Solver residuals and model/response regularization are distinguished from roundoff.
A sampling tolerance changes neither point ownership nor earned progress.

## Plan authority

The ordered plan elements are the segments, laid in order from the origin facing +Z. An arc of length `L` and radius
`R` turns `delta = L/R` radians, positive to the right. Compiled segments keep internal geometry, exact s interval,
starting pose and signed curvature. A straight has `kappa=0`. An arc has `kappa=sign(delta)/R`.
The temporary joint station table (each element's start, and `"end"`) resolves positions, including Session
landmarks, and is discarded before publication.
Section projection onto a straight or circular arc uses closed-form geometry.
The projection window `W = 50 m` is measured in chainage in both native and mapped Readers.
At the fixed frame step and twelve vehicle substeps, longitudinal travel is a few metres even at
the provisional vehicles' highest speeds. Fifty metres also covers front/rear contact offsets
and amplified chainage motion near a small positive `J`; grade-separated passages must be
authored more than 50 m apart on the route ruler so their other passage stays outside the window.
The projection result's `inDomain` reports geometric membership; physics and recovery consume it
as specified in [Vehicle physics](vehicle-physics.md#surface-and-contact).

At each s, the Section lateral domain runs from the material table's leftmost finite covered edge minus
`MAXIMUM_VEHICLE_REACH` to its rightmost finite covered edge plus that bound. `MAXIMUM_VEHICLE_REACH` is the
product's 4 m bound on vehicle reach, which vehicle admission enforces: while a vehicle's centre lies on covered
material, every point of its footprint, at any yaw, has coordinates in the domain.
The uncovered exterior does not contribute. The same outer covered edges, before the reach bound, are the course limits
that keep vehicles on the course ([Content and gameplay](content-and-gameplay.md#walls)).
The domain uses the material slab's half-open station ownership, including the Section terminal.
It retains the outer span references and reads them by binary slab lookup, without scanning authored Strips.
The map from `(s,l)` in the entire closed Section coordinate domain to world XZ is injective:
different coordinate pairs occupy different points. The local part of this condition is
`J = 1-kappa*l > 0` throughout the domain. Compilation checks every circular segment at
incident domain stations and checks separated longitudinal cells against one another using
conservative plan envelopes. `plan_coordinate_inversion` reports a local metric failure;
`plan_coordinate_overlap` reports the Section and two overlapping s intervals. An overpass
uses separate Sections for its two passages.

Rendering reads the authoritative plan directly. Each ground row maps `l=-1` and `l=+1` through
its coordinate Reader; these two points define the affine lateral mapping for the entire row.
Row boundaries contain only vertical-polyline vertices and the visible ends, not plan or environment boundaries.
Visibility ends at the first station where `abs(wrap(heading-cameraYaw)) >= pi/2`.
On a straight the heading is constant. Within an arc, heading changes linearly with chainage;
from a forward-facing station `a`, the first limiting station is
`a + (sign(kappa)*pi/2 - wrap(heading(a)-cameraYaw))/kappa` when it lies in the arc.
The Route queries successive Sections with the camera yaw rotated into each native frame.
Occurrence rotation is computed once when the occurrence is appended.
Occurrences and height identify passages through compiled Sections; previous s keeps projection
on the local passage.

## Boundary geometry and point ownership

Compiled Boundaries and lane lines remain piecewise linear on the authoritative s ruler. A Section's lane lines (each
lane's edges and centre, and each median's width) have a vertex at every station where any width changes slope, laid
outward from the centre lane, and are compiled before the Boundaries, which may refer to them. A Boundary's vertices
come from its own knot stations and, within each knot interval, both endpoint references' line vertices (a Boundary's
or a lane's), including inherited ones. Compilation evaluates and blends the endpoint Lateral
expressions at those stations as specified in [Content and gameplay](content-and-gameplay.md#lateral-positions).
The published resolved l sequence is the only input to `courseBoundaryAt` and its consumers.
Width and center are derived from
their edges. Strip compilation resolves Lateral edges with the Boundary interval resolver,
then sends each non-null payload to the shared slab resolver. Paint-only changes do not divide
material geometry. A piece stores each finite edge as one affine line, with no duplicate endpoint
coordinates. Boundary-derived lines retain their original interval and endpoint arithmetic when
split; their offsets are added after interpolation. Numeric color lines retain slab-local interpolation.
This preserves Boundary ties without altering unrelated numeric color arithmetic.

The compilation check divides the authoritative straight and circular plan at segment ends,
domain knots and at most five degrees per arc cell. Adjacent cells share their endpoint and are
locally covered by the positive Jacobian; separated cells must have disjoint conservative
envelopes. A chord envelope is padded by `max|F''| * deltaS² / 8` for each linearly varying
lateral edge, bounding the exact curve between its endpoints. The envelope comparison uses
the plan-position roundoff budget for floating-point separation near shared
coordinates; this tolerance does not replace the curvature bound. These cells belong only to coordinate-domain validation.

Point intervals are half-open laterally: `[left(s),right(s))`. A shared edge belongs to the interval on
its right; the outer left edge is included and the outer right edge is outside. Zero-width endpoints
own no area. Gaps use the consumer's outside result: no material or no eligible lock interval.
Visual Strips do not require material coverage and can cover the entire lateral plane. Closed bounds used for geometric containment and clipped areas used by image
filters do not change point ownership.

## Height and projection

Ground height is `Y(s,l)=Y(s)`. Authored Profile Knots are PVIs `(sᵢ,yᵢ,Lᵢ)`.
Between PVIs, tangent grade is `gᵢ=(yᵢ₊₁-yᵢ)/(sᵢ₊₁-sᵢ)`. For a nonzero
curve of length `Lᵢ`, let `x=s-(sᵢ-Lᵢ/2)`, `g₋=gᵢ₋₁`, and `g₊=gᵢ`.
The authoritative parabola is `Y=yᵢ-g₋Lᵢ/2+g₋x+(g₊-g₋)x²/(2Lᵢ)` and
`dY/ds=g₋+(g₊-g₋)x/Lᵢ`. Between curve tangencies,
`Y=yᵢ+gᵢ(s-sᵢ)` and `dY/ds=gᵢ`. A zero-length curve is a grade corner
at its PVI. Endpoint curves have zero length; adjacent curves do not overlap.

`ProfileReader` supplies authoritative Y and dY/ds to physics, vehicles, camera and course sprites.
Vehicles retain their physical XZ and render anchor Y; course sprites use the plan mapping and
`Y(s)+groundOffset`. The physical camera is passed directly to projection.
`ProfilePolylineReader` is used only to generate ground rows, as an internal height approximation.
Its vertices include curve tangencies and zero-length PVIs. Each parabola is divided into
`ceil(L/2 m)` equal intervals (at most 2 m), sampled from the authoritative profile.

For a parabola with grade change `deltaG`, length `L` and polyline interval `h`, the exact
maximum height difference is `abs(deltaG)*h*h/(8*L)`, attained at each interval midpoint.
Straight intervals have zero error. Thus the 2 m interval bound gives `abs(deltaG)/(2*L)` metres;
there is no universal millimetre bound without bounds on grade change and curve length.
Other objects retain authoritative height and are
not shifted to the ground-row approximation.

The pseudo projection is the projection contract. It is the product's definition of the view, not an
approximation of a perspective projection, and Terrain (with the ground rows that Strips color), Sprites and the
player share it (`pseudoProject`); the background reads the same horizon.

```text
d = s_object-s_camera                    d > 0
xr = (X-Xcam)*cos(psiCam)-(Z-Zcam)*sin(psiCam)
scale = f/d
screenX = cx+scale*xr
screenY = cy-f*sin(phi)-scale*(Y-Ycam)*cos(phi)
horizonY = cy-f*sin(phi)
```

Depth is chainage difference. `scale = f/d` does not depend on camera pitch `phi` or height; pitch moves the
horizon by `f*sin(phi)` and scales height differences by `cos(phi)`. Equal depth gives equal scale, and equal
depth/height gives equal screen Y. Each terrain station projects to one horizontal line with affine horizontal texture mapping.
Ground rows are generated per visible interval between consecutive polyline vertices and the visible
ends. Each interval projects with the line of the polyline segment that
contains it, independent of chainage rounding at its ends, so adjacent projected intervals meet.
Forward visibility depends on road heading and camera direction. Terrain draws far to near, allowing
hills to overdraw earlier rows. A degenerate thin span occupies one row with its complete source footprint.

## Camera and fixed metric

The player-depth display scale is fixed at 40 px/m, a display fact independent of vehicle dimensions: a 2 m
player reference is 80 source texels and 80 screen pixels. The camera definition is the one authority for the focal
length and the player depth: `f=200 px` and `D_cam=f/40=5 m`; near/far depths are 2.5/200 m. FOV changes preserve
this metric. The loading window and the renderer read `D_cam` from the camera definition. Ground and sprites share this depth interval.

Camera chainage is `s_vehicle-D_cam`; its drawn XZ is the player's route-world XZ minus `D_cam` along the camera
yaw. There is one camera. Its yaw is the body yaw limited to the camera definition's limit angle (45 degrees) about
the plan heading at the car's chainage; with a response time above zero (the definition's is 0 s) it follows that
limited yaw as a first-order lag at the fixed step. Beyond the limit the camera stays at it, and the player sprite's
yaw variant shows the body turned by the relative yaw, as for every vehicle sprite. A reset places it at the limited
yaw. The observer's shell owns the camera rig;
rivals have no camera. Horizontal centering follows projection: the player's screen position is the renderer's
projection of its reference point, its one authority, and the camera on the player's yaw ray puts it at the centre
column by construction. Camera roll is zero.

The player's depth `D_cam` and the camera pitch relative to the body stay constant, so the player never scales or
changes pitch on screen. Pitch is `phi=phi_0-theta` (base downward pitch `phi_0` = 12 degrees, body pitch `theta`
nose-up positive). The height target is solved from the projection with the player's reference height `Y_p`
(`renderY`) at target row `y_t` = 190:

```text
Ycam = Y_p - (D_cam/(f*cos(phi)))*(cy - f*sin(phi) - y_t)
```

This is the projection's `screenY` solved for the camera height with the player at row `y_t`. Near `|phi|=90` degrees
(an overturning body) the target grows without bound, since `cos(phi)` approaches zero.

The camera height is sprung to that target. Each fixed step (`SIM_DT`, the step of every camera update) it follows
`Y'' = w^2*(Ycam_target - Ycam) + 2*zeta*w*(Ycam_target' - Ycam')`, `w = 2*pi*f`, stepped implicitly with the
target's velocity taken from its previous step, so it is stable at any setting and follows a target moving at
constant vertical speed (a steady grade) without lag: there the player sits at row `y_t`. Faster vertical motion
(bumps, jumps, suspension) moves the player on screen instead of the view. The camera never drops below the rendered
road height at its station `s_vehicle-D_cam` plus the minimum clearance; at that floor its vertical velocity is at
least the floor's. The frequency `f` (2 Hz), damping ratio `zeta` (1.0) and minimum clearance (0.3 m) are camera
definition values ([Calibration](calibration.md#camera-settings)). A new camera, recovery, a Session rebuild and START
place the camera at its target, at rest relative to it; route seams need no reset.

## Ground and background

BG is one infinite tiled plane. Yaw and pitch change its view; translation does not.
Its yaw origin uses the shared route frame across every occurrence. The background is selected
at camera chainage `camera.s`; distant sprites and ground rows do not change that selection.
[Image assets](image-assets.md#infinite-tiled-background) owns its format and angular mapping.
Physical support is independent of all ground colors.

### Material cross sections

`CompiledSection.material` contains an immutable slab table and its point reader; compiled Sections
retain only resolved tables. Material-bearing Strips produce finite affine pieces; color-only Strips
do not enter this table. Color and material use the same payload-independent Strip slab resolver:
activation and edge-crossing splits, declaration-order overwrite, equal-value span coalescing and
binary slab/span lookup. The generic cell payload `value` is RGB555/transparent for color or a material for physics.
The absent-piece value is no material (`null`), which is not a material definition.

Point reads use binary search in s, then binary search in l over ordered spans. Intervals are
`[left,right)` and `[start,end)`; the Section terminal belongs to the last slab. Uncovered cells
read no material. `sampleInChart` subtracts the origin from edges before comparing l, preserving exact
shifted-boundary ties. A point read returns the admitted material or `null` without allocating. Nonfinite queries or
stations outside a finite Section fail; Route readers provide their ordinary outside no-material result.
Gate/grid validation and fork compilation consume the same table. Support-interval construction
is compiler-only; running point reads do not allocate arrays, objects or readers.

### Strip rendering

Compilation expands the [authored constructs](content-and-gameplay.md#strips) to affine Strip
pieces and passes them through the shared material/color slab resolver described above. Resolved spans are disjoint, cover the open lateral plane and coalesce
adjacent equal colors; transparent upper Strips erase lower colors before filtering. The active count
includes hidden declarations, not just the visible resolved spans.

The course compiler averages resolved colors over dyadic s cells starting at one metre, in two phases per level.
The aligned phase of level `n` has `ceil(L/2^n)` cells `[i*2^n, (i+1)*2^n)` for Section length `L`; its last cell
ends at `L` and is averaged over its actual length. The top level has one aligned cell spanning the Section. The
half-shifted phase has cells `[i*2^n - 2^(n-1), (i+1)*2^n - 2^(n-1))` clipped to `[0, L]`: its first cell is
`[0, 2^(n-1))` and its last ends at `L`, each averaged over its actual length. Both phases count toward the
`preblendCells` and `coefficientBytes` ceilings.
Lateral fields store premultiplied linear-sRGB channels and coverage as piecewise-linear
functions of fixed source-l coordinates. An edge that moves across an interval becomes a ramp rather
than a relocated hard edge. Equal lateral fields share private coefficient storage and per-level indices.
Resolved records and public metadata are deeply immutable. The compiled product supplies a Reader that copies
base and node coefficients and active count into view-owned reusable scratch without allocating once the scratch
holds the largest field; compiled numeric buffers stay private.
The view layer owns row sampling and display-method selection.

A row uses the terrain projection's representative s and effective depth footprint `deltaS`.
A projected `[-1,+1]` metre ruler supplies the affine screen-to-l map; it does not clip ground.
The product has one complete method, not independently configurable s/l kernels:

| Method       | Longitudinal read                                                                                  | Lateral read at pixel center x |
| ------------ | -------------------------------------------------------------------------------------------------- | ------------------------------ |
| POINT-POINT  | Instantaneous resolved Strips at the row's s for every footprint                                   | Value at x                     |
| LEVEL-POINT  | One cached dyadic cell, or instantaneous Strips when `rho < 1`                                     | Value at x                     |
| LEVEL2-POINT | One cached dyadic cell of either phase, centered nearest s, or instantaneous Strips when `rho < 1` | Value at x                     |

Every method uses the source owning s and its lateral origin; a seam belongs to its
successor. The instantaneous read follows the ordered resolved slab without preblending or sorting.
LEVEL-POINT and LEVEL2-POINT use `rho = deltaS / 1 m` with the [shared image selector](#shared-image-level-selection).
LEVEL-POINT reads only the containing aligned cell, without cell/level interpolation or mixing neighboring occurrences.
LEVEL2-POINT reads, of that level's aligned cell and half-shifted cell containing s, the one whose center (the
midpoint of its actual, possibly clipped, extent) is nearest s; at an equal distance it reads the aligned cell. Like
LEVEL-POINT it neither interpolates nor mixes occurrences. Its cell centers lie every half cell, so its read moves to
a new cell twice as often and its center lies at most a quarter cell from s, against half a cell for LEVEL-POINT.
A footprint-centred dyadic box with lateral pixel integration (LEVEL-BOX) was designed and not adopted: it needs
per-pixel blending beyond period road hardware.
Every level covers the Section through its truncated last cell. The final closed endpoint uses
that last cell.

Every method reads its native lateral field directly and batches constant spans with fills or transparent skips;
only varying lateral fields need individual evaluation. No pixel loops over authored Strips.

RGB555 decodes through the common linear-sRGB channel table. Contributions stay premultiplied until
final coverage is known. Coverage at least the shared 0.5 threshold is opaque, allowing 64 machine
epsilons of roundoff at equality. Opaque RGB divides by coverage once, encodes
sRGB and rounds to RGB555; transparent pixels leave the existing image unchanged. Hidden colors and
BG do not enter the average. [Browser](browser.md#ground-display-setting) owns live selection and HUD observations.

## Sprites and Painter

Sprites have a logical master frame, physical width, a master texel-center anchor and completed levels.
Magnification is `g=(f/d)*worldWidth/masterWidth`. Course anchors use known chainage and render height;
actors use observed chainage and physical-clearance mapping. Yaw/bank variants are authored images.
Rendering uses nearest sampling, binary alpha and one SINGLE sprite per vehicle; bank is visual.

The product render draws the frame and returns nothing. Measurements of a frame (the Strip ground's metrics, terrain
and sprite counts, the player's screen point and image choice) go only to a measurement sink the caller passes: DEV
(the performance HUD and the bike lean indicator, with `dev=1`), the course tool and tests; the product path passes
none and carries no DEV value.
Painter order is the opaque BG, a far-to-near terrain/wall/world-sprite merge, the player, then, under the PAUSE menu or
RESULT, the whole frame halved to half brightness (`halveRgb555Pixels`: each RGB555 channel halved, flooring, once per
frame over a freshly drawn scene), then HUD and the [text layer](#text-layer).
The BG writes every pixel of every frame, so there is no clear step and no pixel keeps a previous frame.
Transparent ground, including ground rows outside the Route, writes nothing and keeps the Painter image
beneath it, such as BG below the horizon. At equal depth terrain draws before walls and walls before sprites. The player
is last among world visuals.

### Vehicle shadows

Every vehicle, the player included, has a shadow on the ground directly below it, drawn by one rule. Its shape is a
rectangle in route coordinates: from its chainage, half its vehicle definition's `overallLength` back and forth, and
from its lateral, half its `overallWidth` left and right. Yaw, pitch, roll, lean and height do not change it; there is
no light direction. The ground rows project it: each row tests its own chainage footprint (`[sNear, sNear + deltaS]`)
and maps the rectangle's laterals to pixels with its projected metre ruler, so shadows follow slopes and crests with no
projection or height of their own, and a row hidden behind a crest hides its part of a shadow.

A row takes a shadow where they cover at least half of the shorter of the two, with the shared 0.5 coverage
threshold: the row's footprint against the shadow's length and, along the row, a pixel against the shadow's projected
width. A shadow shorter than a row thus darkens the row holding at least half of it, and one narrower than a pixel the
pixel holding its centre, so a distant shadow keeps at least one pixel while its rows are visible. Rows and pixels
outside the frame and the near and far depths clip it.

The ground sampler writes the covered pixels of its row at half brightness (`halveRgb555`, the one half-brightness
operation) as it writes them, for every display method; transparent ground writes nothing and so stays undarkened.
Overlapping shadows form one set of pixels per row, darkened once. Walls and sprites draw over the ground in Painter
order, so no shadow darkens a body, a sprite or a wall, and a vehicle's own body draws over its shadow. Within a fork
Section every road shares the Section's route coordinates, so a shadow lies on the road its vehicle is on.

### Walls

A visible wall is drawn inside the terrain order, with no separate pass: right after each terrain row whose station lies
on the wall, the wall paints that row's column. Its screen x comes from the row's own affine lateral mapping (the one
the ground reads, l = ±1 at the row's two projected points) at the wall's Boundary lateral there; from the row it spans
the height range of the wall's opaque Strips at that depth's vertical scale `f/d × cos(pitch)`. The column fills across from the x
of the previous, farther row on the same wall this frame, so consecutive columns join into one surface, seen from either
side alike. Nearer ground rows drawn later cover what lies behind a hill; transparent ground beyond an open edge keeps a
falling cliff and the BG below it. The column's colors come from the wall's color table through the road's
[Strip sampler](#strip-rendering), unchanged, with height as lateral: one height per pixel row at the pixel's centre,
the row's station and station footprint, so the same preblend along s keeps a pattern finer than a pixel from flickering,
and the DEV Strip render method selects the wall's read as it does the ground's. Transparent heights write nothing.
Columns clip to the frame; a wall beside
the camera clips as any other. Solid or not makes no difference to drawing, and an invisible wall draws nothing. A
measured render counts the painted wall pixels.

Course sprites enter through either a sprite array or a camera/depth observation reader. The reader
contains immutable camera/projection metadata and read-only image workspaces. An upright basis/ruler
change transforms world metadata while preserving its recorded screen projections and depths.
A different physical camera or depth interval rejects that observation. The array path computes its own projections.

### Text layer

The text layer is the one way to draw text in the frame: a 40 by 30 grid of [pattern, palette]
[text tiles](image-assets.md#text-tiles) over the 320 by 240 logical frame. It clears, writes a string from a
cell in one palette, puts one tile, puts one overlay tile, and draws. Each cell holds a tile and an overlay tile, such
as a 1-pixel mark over a HUD bar, so a mark needs no tile per combination with the bar under it. A position, string or
tile outside the grid is a `RangeError`; nothing is clipped. Drawing follows the scene render and precedes RGBA
expansion; it paints the opaque pixels of every tile except the empty pattern, then each overlay tile over its cell,
so index 0 and empty tiles leave the scene visible.

### Vehicle color and brake lamps

Vehicle documents choose a named sprite set and default color. `view/vehicle-sprites.ts` creates a vehicle's
off/on sprite sets, using each image's own named palette and the sprite set's shared off/on colors for reserved slot 15.
Player rendering binds the player's vehicle at startup; `createRaceSprites` draws each rival from the sprite set of
its observed vehicle ID, binding each vehicle once on first use. No per-frame palette evaluation occurs. Every competitor observation, the player's included, publishes boolean
`brakeLampOn`: that competitor's brake request in its latest step input is greater than 0. All vehicles use their definition's default color;
player color selection and rival color assignment are pending product decisions.

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
both sprites and the LEVEL methods. `scale = 1/rho`: destination pixels per master texel for sprites, or
`1 m / deltaS` for Strips. It selects the nearest integer `log2(rho)` exponent, clamped to the available
prefix `0..maxLevel`. There is one level per octave. At the geometric-mean boundary
`scale = 2^(-n)/sqrt(2)`, it selects the coarser exponent `n+1`. No interpolation occurs.
Strip's instantaneous sub-metre read is analogous to sprite master magnification, not a cached 1 m cell.

## Course frames

The Link's named lane centre at `s=L` and the destination's centreline at `s=0` derive the upright transform `toFromFrom`, which maps the `from` Section's frame to the `to` Section's frame. With yaw
rotation `R`:

```text
t = pTo-R*pFrom
p' = R*p+t
v' = R*v
inverse rotation = transpose(R)
inverse translation = -transpose(R)*t
```

The transform preserves world up, gravity and metric length. The `from` and `to` heights agree
at the cut line, as do their longitudinal grades. `CourseRoute` composes the inverse Link transform
into each successor's fixed world transform. Vehicle state remains in the entry-rooted route world
space across the cut. `RouteOccurrence` carries its own Section identity, route
start, lateral origin and transform, including each repeated circuit lap. The route readers convert
route s to Section s by subtracting the occurrence start, add the lateral origin for the Section query, then transform returned X/Z,
heading and lateral positions into route coordinates. The successor owns the exact seam station.
`createCourseRouteReaders` owns authoritative coordinate and height queries; `createCourseRouteVisualReaders` owns
Strip, sprite, visual and background queries. Every actor uses the same physical readers and route.

## Layer boundaries

There are two source roots: `src` for the product and `tools` for authoring and build programs.
Product code never imports tools. Neither root imports executable modules from `dist/`; tools use product source.
Reading or writing generated content under `dist/` is not a module dependency. Both roots share strict compiler
options and lint rules. [Development](development.md#typescript-tools) owns execution and checking commands.

Product source is organized by domain. Shared definitions, product compilation and runtime representation
belong inside that domain; an upper domain depends only on lower domains, and same-domain imports are unrestricted.

| Order | Layer   | Responsibility                                                                                                                                                                                                                                                                                                                                           |
| ----- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1     | core    | General mathematics, vectors, planar transforms, the admission toolkit and content digests                                                                                                                                                                                                                                                               |
| 2     | image   | Indexed images, RGB555/RGBA codecs and the RGB555 reader, palettes, sprite/LOD formats, BG tiles and image filters                                                                                                                                                                                                                                       |
| 3     | audio   | Sound synthesis, voices and the sound graph                                                                                                                                                                                                                                                                                                              |
| 4     | course  | Course documents and compilation, road geometry, lanes, walls, course limits and roadside objects, materials, the coordinate domain, occurrences, environment timelines and shared Route readers                                                                                                                                                         |
| 5     | vehicle | Vehicle mechanics, vehicle and driving document compilation, vehicle sprite sets (library admission, color/lamp variants, yaw/bank selection) and accepted operation requests                                                                                                                                                                            |
| 6     | content | Content manifest format and, separately, delivery (fetch, digest verification, decode); saved JSON layout; document catalogs and their rules; loading courses, materials, the vehicle sprite library and vehicle/driving definitions from delivery; the Session vehicle and its identity; generated envelope and time-budget formats and their admission |
| 7     | input   | Keyboard/touch/gamepad adapters and arbitration producing vehicle operation requests; the published final sample and touch observation                                                                                                                                                                                                                   |
| 8     | race    | Sessions, course worlds, fixed step, progress, gates, timing, drivers with lane following and the fork field, traffic, contacts between vehicles, barrier lines and standing objects, and recovery                                                                                                                                                       |
| 9     | view    | Cameras, projection, ground rows, sprite placement, course scenes, drawing composition and framebuffer                                                                                                                                                                                                                                                   |
| 10    | shell   | DOM, frame loop, screens and the selection flow, run assembly, the player record and records, HUD, DEV, startup and browser composition                                                                                                                                                                                                                  |

The [dependency check](../tests/infrastructure/layer-dependencies.test.mjs) parses imports, type-only
imports, re-exports, inline import types, literal dynamic imports, CommonJS references, worker entries
and worklet modules. It also examines scripts in tool HTML and resolves TypeScript module aliases.
Product source has exactly these ten directories; startup files belong to shell. Every cross-domain
import follows the order and participates in the layer-cycle check, without product-layer exceptions.

Tools use the compositions they share with the browser from race and view. From the shell, every tool may
import only the DOM lookup (`src/shell/dom.ts`) and the reusable DOM controls under `src/shell/controls/`; the
dependency check enforces this one rule.

The authoring core in `tools/authoring` is one function and one edit over a content store. A content store
(`ContentStore`) reads, lists and writes the documents and files under `content/` by relative path; each platform
supplies one, and the build and Node tools use the file-system store in `tools/build`. `compileContent(store)` admits
and compiles every authored document in the build's dependency order, the saved measured products last, and returns
every delivered file (kind, ID and bytes) with the compiled products tools consume, or the admission diagnostics and no
product; `measured: false` stops before the measured products for tools that produce or do not use them. Each stage,
and each course on its own, is keyed by the SHA-256 of what it reads: its documents' bytes and the keys of the earlier
stages it uses. Given a `previous` compilation (succeeded or failed; each carries its completed stages), a stage whose
key is unchanged takes its earlier result instead of running again, so a changed course recompiles only that course,
the course index, the series and the measured products, and the products equal those of a compile without
`previous`. Reused products are shared between compilations; callers read delivered bytes and never modify them. The
build and the CLI compile without `previous`. The one edit,
`replaceDocument(store, path, value)`, replaces a document with an admitted value in the saved JSON layout
(`formatSavedJson`); compiling the store again gives the edited products. Every authored JSON document under
`content/` is kept in that layout, so a replacement changes only the edited values, except the image documents, which
are named by their bytes' digest. Selection, undo and views belong to the
callers. File I/O, workers and exit codes belong to the entries. Nothing the core reaches imports a Node module or the
shell; the dependency check enforces this rule. The workbench (`tools/workbench`) is a browser page over the same core:
a browser content store, a layered store for its changes (`createLayeredStore`) and a worker that runs
`compileContent`.

There are no other dependency exceptions. Course commands and reference
production belong to `tools/course`; the product retains shared course admission, live driving policy,
and envelope/time-budget readers. Sprite normalization, palette generation, LOD compilation and the
sprite operations belong to `tools/graphics`. Shared image formats, filters, codecs and product limits remain
in `src/image`; authoring-only limits stay with the tools.

Vehicle mechanics take dynamic state and an immutable vehicle model as separate inputs; state holds
no definition value, and each race actor pairs its state with its model. The race builds every competitor's
mechanics, the player's included, from its Session entry: one model per entry vehicle, shared by entries with the
same vehicle, and each competitor's state and recovery state at its grid slot with the Session's start speed; each
rival's driver comes from its entry's envelope. The shell and other compositions supply the player's input only;
manual recovery is a race operation, and body contact is a race computation whose force reaches each vehicle as the
mechanics' one external-force input, so physics never sees another vehicle. `SIM_DT` is the only authority for the step length. The race advances in fixed
steps of it: `advance(input)` takes no step length, and the start phase, the checkpoint clock's race time,
recovery timing and event times all use `SIM_DT`. The model carries its fixed step, received when
it is built; vehicle mechanics never import race, so every composition passes `SIM_DT` when it builds a model. The composition shared by
browser, race, tools and scenarios lives below shell: content owns the Session vehicle (vehicle and
driving definitions only: `SessionVehicle`, `createSessionVehicle` and its identity on a material catalog,
`sessionVehicleSha256`) and the
generated product formats with their admission (`rival-envelope.ts`, `course-time-budgets.ts`, and `admitProduct`,
which admits a delivered product with its delivered path as the diagnostic document), shared by the build's
producers and the race and browser that admit them; race owns the fixed simulation step (`SIM_DT`) and the course
world (`createCourseWorld`: the Route runtime loaded for an observer window, the driver lookahead and one
fixed step); view owns the course scene, which adds rendering and supplies the current camera's loading
window. Shell owns the observer's camera, and race actors contain no camera state. Consumers outside vehicle
physics read vehicles through read contracts (`vehicle-contract.ts`) whose fields are all required and read by their
consumers; the plan coordinate projection in them is read-only, and only physics and recovery write it through the
vehicle state. Race owns the camera-independent competitor observations (`competitor-observation.ts`): one per
competitor, the player included, holding only the values display, camera and audio read (identity and form, pose,
render height, chainage and lateral, velocities, speed, body pitch, lateral acceleration, brake lamp, the actual controls (the
delivered driver steering offset as a fraction of its maximum, and the throttle and brake actuators), powertrain
observations including the selected gear, the fuel-cut latch and the race's simulation seconds at the latest shift,
and tire observations)
and never vehicle state or a model. The race copies them at the end of every advance, including held READY steps,
once at creation and after a manual recovery. They are borrowed: the race overwrites the same objects on the next
advance, so consumers read them before then. Display, the camera and audio read only these observations. `observe()` returns the player's observation and those of rivals and,
in a separate list, of traffic on the resident window, the one residency decision; displays draw and voice rivals and
traffic by the same rules. `observe()` also lists the movable objects the race has knocked (Section, placement index,
flying or landed, position and height); the course scene draws every other movable placement standing and each knocked
one at its observed place in its flying or landed picture, so the race owns where an object is and view only how it
looks. View owns rival sprite selection and assembly. Course owns VehicleWorld, surface
readers and the physical driving source. Race consumes that source only. The course world owns the combined pre-lock render/driver query-depth
admission, and the course scene binds physical and appearance products.
RGBA conversion, sprite images and LOD formats belong
to image; framebuffer writes and sprite drawing belong to view. The framebuffer stores RGB555: palettes, BG
tiles and Strip ground write their RGB555 colors (sprite index 0 is transparent), and the shell expands the
frame to RGBA through one 32,768-entry table when presenting it. Compiled Strip color fields
and their scalar coefficient Reader belong to course. View owns Strip row sampling and the
three display methods; shell obtains their names from view.
Environment timelines are course data.

## Definition delivery

Vehicle mechanics, vehicle listing and driving documents are manifest entries like every delivered file;
[Development](development.md#build-outputs) owns the manifest kinds and output layout.
Vehicle and driving document formats and their compilation belong to the vehicle layer; the content layer
assembles their catalog, and the generic manifest only resolves and verifies their bytes. Definition compilation resolves named sprite sets/default colors from the SHA-verified image library and sound IDs through the lower audio layer's
TypeScript sound products and returns deeply immutable records that publish each fact once: the source documents and
what they compile to or name, never a copy of a document field. [Vehicle physics](vehicle-physics.md#material-vehicle-and-driving-documents)
owns the versioned formats and their format-specific admission rules. Composition roots load the collection before scene/Session creation and explicitly pass it to
selection controls, HUD/audio, scene coverage, reference tools and scenarios. `compileVehicleDefinitions` admits the collection from
definition documents and an admitted sprite library: consumers call it through `loadVehicleDefinitions` with delivered content, and the
content build calls it directly with the documents and the library it has just compiled.
