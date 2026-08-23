# SUPER OUTRIDE — M5 Driving / Car + Motorcycle Physics

Status: implemented DEV Car + Motorcycle physics layer.  
Core authority remains `00_core_design_freeze.md`.

## 1. Boundary

M5 implements the physics/gameplay side of the already-frozen Core interface:

```text
world vehicle state
  -> Guide Curve local continuity query
  -> (s,l)
  -> SurfaceMap(s,l)
  -> vehicle dynamics / support decision
```

No renderer equation is changed by car physics.

## 2. SurfaceMap runtime form

`src/physics/surface-map.ts` contains a compact cyclic section table. Each section has lateral bands and a default implicit `VOID` outside those bands.

Current types:

```text
ASPHALT
SHOULDER
GRASS
DIRT
SAND
VOID
```

The runtime query returns a material record containing support state, friction, rolling resistance, and drive scale.

This data is not derived by sampling the GroundMap bitmap. GroundMap/GroundBase remain visual data.

## 3. DEV car state

`M5CarState` adds to the former M2 transport state:

```text
world Y
vertical speed
body longitudinal speed
body lateral speed
yaw rate
steer angle
support state
surface type
lateral acceleration
```

World X/Y/Z and yaw remain authoritative.

## 4. DEV car dynamics

This is not a frozen specification. It is the first replaceable gameplay model.

The supported-ground path uses a single-track force model with:

- front/rear axle cornering stiffness
- surface friction limit
- combined longitudinal/lateral axle friction circles
- AWD-biased DEV drive allocation
- front-biased braking
- drag and rolling resistance
- low-speed stabilization

High-speed steering travel is reduced at the steering/rack layer. This does not clamp vehicle yaw; it only maps canonical analog steering input to a plausible road-wheel steering range.

## 5. VOID

When SurfaceMap returns `VOID`:

- no tire/support forces are produced
- planar momentum continues with drag
- vertical speed integrates gravity
- the renderer uses physical vehicle Y for the player anchor

Landing is intentionally primitive in M5 and will remain gameplay/physics-side. Damage and respawn are not added to the Core renderer.

## 6. Height channels

The runtime now exposes semantically distinct:

```text
Y_render
Y_phys
Y_camera
```

M5 DEV currently uses the same C1 cosine-smoothed interpolation for `Y_phys` and `Y_camera`, while `Y_render` remains piecewise linear. The semantic channels are separate so later physics tuning does not alter raster terrain geometry.

## 7. Camera framing

M5 implements the bounded vertical framing form from Core §38:

```text
Y_base
  + clamp(LPF(frame correction))
```

The player is not perfectly fixed on screen. Normal movement is centered around the chosen target screen Y; large crest/dip/airborne excursions can exceed the bounded correction.

## 8. Acceptance tests

M5 adds tests for:

- every SurfaceMap material
- SurfaceMap / visual-data independence
- distinct Y_phys semantic channel
- free world-space lateral traversal
- material-dependent acceleration
- lower sand turning authority
- VOID falling without planar snap
- exact `D_cam` chainage depth under M5 camera
- bounded vertical framing
- physical player Y feeding the renderer
- chainage-only player scale retained

All M0–M4 regression tests remain active.


## 9. Motorcycle DEV dynamics

`src/physics/motorcycle-physics.ts` implements a separate replaceable motorcycle model. Canonical steering controls a physical bank target rather than rotating the sprite. Surface friction limits the available bank angle and lateral acceleration. Bank-derived lateral acceleration produces the yaw-rate target; loose surfaces also permit a small sideslip component.

The rendered bank remains asset-driven: physical bank is normalized into the existing M4 `yawVariant × bankVariant` table. Runtime sprite rotation is still absent.

## 10. Car / motorcycle switch

The browser DEV key `V` changes the active physics model. World X/Y/Z, yaw, body velocity, course chart state, support state and vertical state are transferred to the new model. The switch therefore does not teleport the vehicle or reset chainage.
