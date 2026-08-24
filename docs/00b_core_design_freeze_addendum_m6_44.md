# Core Design Freeze Addendum — M6.44 Open Path Authority

This addendum is normative. It supersedes only earlier assumptions that treated geometric chainage as intrinsically cyclic. All other frozen projection, Raster, Guide, sprite, Painter, camera-scale and world-physics rules remain unchanged.

## 1. General geometry primitive is open

The canonical Core path domain is:

```text
0 <= s <= L
```

A `RasterPath` contains only the authored consecutive segments:

```text
v0 -> v1 -> ... -> vN
```

Core does **not** manufacture:

```text
vN -> v0
```

There is therefore no implicit geometric closure, wrap seam, closing turn or closing miter.

A circuit may still be authored, but circuit topology is owned above this general primitive. If a closed path is required, the higher layer must state that topology explicitly rather than relying on hidden Core behavior.

## 2. Raster endpoint authority

Interior Raster vertices keep the frozen hard turn limit and exact miter construction.

```text
|delta heading| <= 10 degrees at every interior Raster vertex
```

At the two endpoints:

```text
turn = 0
basis = adjacent segment basis
```

The first endpoint has no synthetic incoming segment and the last endpoint has no synthetic outgoing segment.

## 3. Guide authority is also open

`GuidePath` follows the same open domain.

Interior Guide corner fillets remain unchanged. The first and last Guide vertices have no wrap fillet because there is no implicit neighbor across an endpoint.

Guide sampling and local world-to-Guide search do not wrap indices or chainage. A local search window is clipped to the actual available Guide segments.

## 4. Renderer depth owns no topology

Pseudo-depth is exactly:

```text
d = s_render - s_camera
```

The renderer receives no course length and performs no modulo operation to determine depth.

Consequences remain the same:

```text
same d -> same scale
same d + same height -> same screen Y
```

Euclidean distance, camera-space Z and lateral displacement remain forbidden as substitutes for pseudo-depth.

## 5. Camera chainage is topology-neutral

The camera relation remains:

```text
s_camera = s_vehicle - D_cam
```

No Core camera function wraps this value.

The course/compiler/authoring layer must provide sufficient run-in and runout around playable regions so ordinary camera and draw-distance operation does not require endpoint exceptions.

The metric presentation authority remains unchanged:

```text
2.0 m = 80 px at player depth
1.0 m = 40 px at player depth
D_cam = f / 40
```

## 6. Terrain traversal clips; it does not wrap

Forward terrain visibility is intersected with the actual open path domain.

At an endpoint, the visible interval naturally becomes shorter. The Road Generator does not jump from the end of a path back to its beginning.

Ordinary product content should author enough runout that this clipping is outside normal play.

## 7. SurfaceMap general form is open

The general runtime `SurfaceMap(s,l)` uses the same open chainage domain:

```text
0 <= s <= L
```

Out-of-range chainage is invalid rather than silently wrapped.

`CyclicSurfaceMap` is retained only as an explicit closed-course adapter for content that intentionally has cyclic topology. Cyclic behavior is therefore a named special case, not a property of the general physical surface primitive.

GroundMap visual data and SurfaceMap physical data remain independent as previously frozen.

## 8. Successor stages must not manufacture closure

A successor stage copies only the authored overlap needed for a validated handoff and then owns ordinary forward open geometry.

A reusable successor must provide enough forward runout for:

```text
handoff overlap
+ normal draw distance
+ a later successor seam when the route continues
```

It must not obtain that envelope by wrapping to the source start.

## 9. Topology belongs above rendering geometry

The product may support:

```text
LINEAR
BRANCHING
CIRCUIT
```

without changing the renderer primitive.

`LINEAR` and `BRANCHING` naturally consume open paths. A future `CIRCUIT` authority may explicitly connect route endpoints or provide a cyclic addressing adapter, but must not reintroduce implicit closure into RasterPath, GuidePath, pseudo-depth or the Painter.

## 10. Preserved Core invariants

M6.44 does not change:

- world X/Y/Z as vehicle-physics authority;
- free lateral/diagonal vehicle motion;
- one chainage mapping to one horizontal scanline;
- Raster Segment road geometry;
- the 10-degree interior Raster turn limit;
- Guide as coordinate/camera support rather than a polygon road;
- Terrain + World Sprite single far-to-near Painter;
- no z-buffer;
- no perspective-correct texture mapping;
- no arbitrary runtime sprite rotation;
- 0/1 transparency and no alpha blending;
- camera roll = 0;
- fixed metric sprite scale;
- physical gate -> PENDING -> seam -> COMMIT route transactions;
- world pose/yaw/velocity continuity through COMMIT.
