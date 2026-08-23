# SUPER OUTRIDE — M5.2 Fixed Metric Sprite Scale

M5 connects the Core `SurfaceMap(s,l)` boundary to an actual world-space car simulation while preserving the M0–M4 pseudo-3D renderer unchanged in principle.

## Current milestone state

- M0 Browser Shell — complete
- M1 Core Geometry — complete
- M2 Road Running — complete / GO
- M3 Visual Core — complete
- M4 Super Scaler — complete
- **M5 Driving — complete (Car + Motorcycle Physics)**
- **M5.1 visibility/recovery bugfix — complete**
- **M5.2 fixed metric sprite scale — complete**

## Run

```bash
npm install
npm run build
python3 -m http.server 8000
```

Open `http://localhost:8000/`.

## Controls

Desktop:

- Left / Right: analogized steering input
- Up: throttle ON/OFF
- Down: brake ON/OFF
- V: Car / Motorcycle
- R: manual recovery

Touch layout remains the M0 specification:

- landscape: steering in left margin, pedals in right margin
- portrait: controls below the 320x240 display
- no gyro

## M5 simulation path

```text
Keyboard / Touch
      ↓
DrivingInput
      ↓
M5 car physics (world X/Y/Z + yaw + body velocities)
      ↓
Guide Curve local continuity query
      ↓
(s,l)
      ↓
SurfaceMap(s,l)
      ↓
ASPHALT / SHOULDER / GRASS / DIRT / SAND / VOID
      ↓
Camera
      ↓
existing chainage pseudo-3D renderer
```

Physics never snaps the car to the road centerline. The Guide Curve is only used to recover the continuous local chart coordinate needed by SurfaceMap / camera / renderer.

## SurfaceMap

Runtime SurfaceMap is a compact piecewise-constant `s` section + lateral-band table. It does **not** sample GroundMap pixels.

DEV materials currently define different:

- friction coefficient
- rolling resistance
- drive-force scale
- support / no-support state

`VOID` means no supporting ground. M5 includes a deliberately simple gravity/fall state. M5.1 now adds a **gameplay-side DEV recovery** before the player can fall completely out of the viewport. Final crash/damage rules remain a later gameplay decision.

GroundBase transparency and SurfaceMap support remain independent data paths.

## Car physics

M5 car physics is a **DEV gameplay/physics model**, not part of the Core Design Freeze.

Current model:

- world-space authoritative state
- grip-limited single-track / dynamic-bicycle tire forces
- body longitudinal + lateral velocity
- yaw rate
- steering actuator with high-speed steering-travel reduction
- combined longitudinal/lateral axle friction limits
- AWD-biased DEV drive split
- front-biased braking
- aerodynamic drag
- surface-dependent rolling resistance and grip
- simple unsupported/airborne gravity state on `VOID`

The model is intentionally isolated so its parameters can later be replaced or tuned without changing renderer mathematics.

## Camera change

M5 adds the Core §38 bounded vertical framing path. The player is pulled toward a target screen Y in normal play, but is **not perfectly screen-locked**; correction is LPF-limited and clamped.

The DEV base camera height was retuned so the player home position is near the lower portion of the 320x240 view instead of around mid-screen.

M5.1 also adds a separate **extreme-spin player safety camera**. Normal Core §36 camera behavior remains active inside the intended presentation envelope. If the projected player would leave X=48..272, camera yaw temporarily points toward the player world position. The whole renderer uses that yaw; the player sprite itself is never screen-space clamped.

## Renderer invariants retained

- pseudo-depth = signed cyclic chainage difference
- `d_car = D_cam`
- no camera-space Z correction
- no lateral depth correction
- same d => same sprite scale
- TerrainLine + world sprite far-to-near Painter merge
- no z-buffer
- no polygon road
- 0/1 sprite transparency

## Validation

```bash
npm test
```

Current result:

```text
58 tests
58 pass
0 fail
```

See `M5_1_VALIDATION.txt` and `docs/09_m5_1_player_visibility_recovery.md`.

## Preview

`M5_CAR_FRAME.png` and `M5_BIKE_FRAME.png` are direct 320x240 outputs of the M5 software renderer after live Car/Bike physics updates.

## Core authority

`docs/00_core_design_freeze.md` remains byte-identical to the supplied Core Design Freeze.

## Motorcycle physics

Motorcycle dynamics are a separate DEV model using the same world/SurfaceMap boundary:

- steering input maps to a physical bank target
- bank is limited by surface grip
- bank-derived lateral acceleration drives yaw response
- loose surfaces allow additional sideslip
- longitudinal acceleration/braking uses the same surface material query
- physical bank feeds the existing yaw x bank sprite variant table
- no runtime bitmap rotation

`V` switches between car and motorcycle while transferring current world kinematics instead of teleporting to another course position.

## M5.1 player visibility fix

The original M5 could lose the player in two reproducible cases: prolonged `VOID` falling and extreme-spin camera framing. M5.1 fixes both without changing Core pseudo-depth or world physics. A 2400-frame full-steering + throttle stress test keeps the player anchor inside X=48.0..207.6 and Y=148.4..212.5.

## Next

Post-M5 implementation order:

- compiler-side Surface Region generation
- GroundMap anisotropic prefilter pipeline
- asset compiler / sprite metadata validation
- terrain + sprite budget instrumentation and performance validation
- special visual cases (tunnel/portal etc.)
- M6 gameplay layer

## M5.2 fixed sprite-size authority

M5.2 makes one presentation relation non-negotiable:

```text
2.0 m car width = 80 screen pixels at player depth
1.0 m = 40 screen pixels at player depth
```

`pseudoProject.scale = f/d` is now interpreted as **pixels per world meter**. Sprite bitmaps own a physical `worldWidthMeters`; the blitter derives source-texel scale from physical width. There is no arbitrary sprite display-scale multiplier.

Current camera values are `f=200 px`, `D_cam=5.0 m`, so `f/D_cam=40 px/m`. If FOV changes later, `D_cam` must move according to `D_cam=f/40`; the player car remains exactly 80 px wide.

The M5.2 programmer car is authored at 80 source pixels across its 2.0 m physical width, so it is 1:1 at player depth. With the current `d_min=2.5 m`, an equally wide object can grow to at most 160 px (2x) before the near plane.

See `docs/10_m5_2_metric_sprite_scale.md` and `M5_2_VALIDATION.txt`.
