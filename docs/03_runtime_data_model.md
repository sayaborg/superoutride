# SUPER OUTRIDE — Runtime Data Model v0.5

Status: **historical M5 implementation boundary document**.  
Authority: mathematical meanings remain exclusively in `00_core_design_freeze.md` and its explicit addenda.  
Current topology note: later M6.44/M6.45 authority makes the general geometry/source model open; do not treat M5-era cyclic/course-length details in this snapshot as current general runtime authority. See `README.md` in this directory.

## 1. Canonical input

```ts
interface DrivingInput {
  steering: number;
  throttle: boolean;
  brake: boolean;
}
```

Browser/device input terminates at this type. Physics does not import keyboard, pointer, touch, orientation, or gyro APIs.

## 2. Geometry ownership

```text
RasterCourse
  ├─ level-0 straight segments
  ├─ global plan chainage
  └─ raster heading

GuideCurve
  ├─ same global chainage
  ├─ straight pieces
  └─ local circular fillets
```

RasterCourse is the drawing-road geometry. GuideCurve is coordinate/camera support only.

## 3. Course coordinate

```ts
interface CourseCoordinate {
  s: number;
  l: number;
  segmentIndex: number;
  distanceSquared: number;
}
```

Normal runtime uses local-neighborhood search from `segmentIndex`. Global search remains an explicit initialization/reset operation.

## 4. Vehicle ownership

M5 car state is world-authoritative:

```text
X / Y / Z
yaw
longitudinal velocity
lateral velocity
vertical velocity
yaw rate
steer angle
sprung state
```

`(s,l)` is a derived local chart coordinate and never replaces world physics.

## 5. Height channels

```text
Y_render : piecewise-linear raster terrain
Y_phys   : smooth support-height channel
Y_camera : smooth camera guide
```

M5 DEV uses a shared smooth interpolation implementation for `Y_phys` and `Y_camera`, but the APIs and ownership are separate.

## 6. SurfaceMap

```text
SurfaceMap(s,l)
  -> material / support state
```

Current material labels:

```text
ASPHALT SHOULDER GRASS DIRT SAND VOID
```

SurfaceMap is compiled physical data. It does not sample GroundMap pixels and is independent from GroundBase transparency.

## 7. Camera

Camera state contains world X/Y/Z, yaw, pitch, `s_cam`, `l_cam`, focal length, screen center, course length and DEV framing diagnostics.

Projection never derives pseudo-depth from camera-space Z.

## 8. Terrain / sprite

TerrainLine remains the scanline handoff. World sprites and TerrainLines share the same chainage pseudo-depth and merge far-to-near. Player is drawn afterward.

M5.2 fixes sprite metric scale: `pseudoProject.scale=f/d` is pixels per world meter. `SpriteAsset.worldWidthMeters` is physical metadata, not a presentation tuning multiplier. Player reference is permanently 2.0 m = 80 px (40 px/m), so camera distance obeys `D_cam=f/40`.

## 9. Dependency rule

Allowed:

```text
DOM/device -> input adapters -> DrivingInput -> vehicle physics
vehicle world state -> Guide local query -> SurfaceMap
compiled course -> simulation + renderer
camera state -> projection / Road Generator
TerrainLine + World Sprite -> Painter merge
```

Forbidden:

```text
Vehicle physics -> KeyboardEvent / PointerEvent
Vehicle world state -> road-center snap
Surface physics -> GroundMap pixel sampling
Pseudo depth -> camera-space Z
Pseudo depth -> Euclidean distance
Pseudo depth -> lateral-position correction
Core Renderer -> DOM layout
```
