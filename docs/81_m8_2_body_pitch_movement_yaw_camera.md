# M8.2 Body-Pitch / Movement-Yaw Chase Camera and Input Lifecycle Hardening

Status: current normative player-camera authority above the unchanged frozen renderer and M8.0
vehicle mechanics.

This milestone implements the M8.1 deferred velocity-direction camera. It supersedes the earlier
M5 camera's Guide-lateral follow, yaw lag, lateral-G offset and horizontal safety-camera authority.
It does not change renderer pseudo-depth, fixed metric presentation, vehicle physics, route,
topology, camera roll or sprite rotation authority. M8.1 remains the current CAR steering-control
authority.

The same milestone hardens browser input lifecycle cleanup after a reproduced touch-button latch.
That fix changes no canonical `DrivingInput` meaning.

## 1. Architecture decision gate

1. The chase-camera layer owns camera pose. It consumes authoritative vehicle world pose, velocity
   and body pitch; it does not create a second movement or vehicle-attitude state.
2. Existing world velocity, vehicle yaw/pitch, fixed `D_cam`, focal length and chainage projection
   express the result without a new coordinate system.
3. Guide lateral, camera lateral, yaw lag, lateral-G framing and screen-edge safety offsets are
   removed because they would duplicate the new movement-facing world-space authority.
4. The rule contains no vehicle-, route-, stage-, topology- or product-specific lower-layer branch.
5. Route handoff changes chart/content authority only. No camera coordinate rebase is required
   because camera X/Z derives directly from the unchanged vehicle world pose every frame.
6. Chainage depth, 40 px/m player scale, zero roll, raster projection and discrete sprite authority
   remain unchanged.
7. Causal regressions cover pitched-plane movement yaw, reverse/full-quadrant direction, low-speed
   hold, physical pitch follow, exact horizontal centering, debug-arrow orientation, input terminal
   events and page-lifecycle cleanup.

## 2. Camera pitch authority

Vehicle body pitch is nose-up-positive. Pseudo-camera pitch is downward-positive. With authored
base downward pitch `theta_base`, camera pitch is:

```text
theta_camera = theta_base - theta_body
```

The initial base value remains `8 degrees`. This keeps the authored view angle constant relative to
the body pitch. A nose dive therefore changes the horizon/world presentation through camera pitch,
without requiring pitch variants in the player sprite set. Camera roll remains exactly zero.

## 3. Movement yaw in the body-pitch plane

Let vehicle yaw be `psi`, body pitch be `theta`, and authoritative world CG velocity be `V`.
The pitched body-forward and body-right axes are:

```text
F = (sin(psi) cos(theta), sin(theta), cos(psi) cos(theta))
R = (cos(psi),            0,         -sin(psi))

V_forward = dot(V, F)
V_right   = dot(V, R)
delta_psi = atan2(V_right, V_forward)
psi_camera = wrap(psi + delta_psi)
```

`atan2` is full-quadrant. Reverse travel therefore faces the camera in the reverse movement
direction instead of being clamped to a forward hemisphere. Velocity normal to the body-pitch
plane contributes to neither yaw component.

When `hypot(V_forward, V_right) < 0.25 m/s`, movement direction is not stable enough to own yaw;
the rig holds its last valid camera yaw. This is presentation state only and is never consumed by
physics or route progress.

## 4. Camera placement and player framing

The camera lies `D_cam` behind the vehicle on the camera-yaw ray:

```text
X_camera = X_vehicle - D_cam sin(psi_camera)
Z_camera = Z_vehicle - D_cam cos(psi_camera)
```

The vehicle therefore has zero camera-right displacement by construction and its horizontal screen
coordinate is always `centerX = 160`. No screen-edge safety override is permitted.

Renderer depth remains independently and exactly:

```text
s_camera = s_vehicle - D_cam
d_player = s_vehicle - s_camera = D_cam = 5 m
```

Thus the fixed player-depth scale remains `200 / 5 = 40 px/m`. Lateral Euclidean movement never
modifies renderer depth.

The existing bounded vertical camera response continues to target player screen `Y = 190`; it may
converge over its authored vertical time constant to avoid terrain-step discontinuities. FOV,
base pitch and vertical response calibration remain deferred presentation tuning.

## 5. Debug player-yaw overlay

Until finer yaw sprites are authored, both browser compositions draw a DEV diagnostic arrow above
the actual rendered player anchor. It displays body yaw relative to movement-facing camera yaw:

```text
psi_relative = wrap(psi_vehicle - psi_camera)
screen_direction = (sin(psi_relative), -cos(psi_relative))
```

The overlay is HUD vector geometry drawn after the player sprite. It does not rotate a sprite,
modify renderer order authority, or feed any value back into camera or physics.

## 6. Touch and keyboard lifecycle cleanup

The reproduced failure was an input-layer latch: a right touch pointer remained in the active set
after its terminal event was lost. Pressing left then algebraically produced neutral; releasing left
revealed the stale right request again.

Each touch pointer terminal event now clears that pointer from every button set, including when the
event reaches the window rather than its original element. `blur`, `pagehide`, and hidden-document
transitions clear all touch and keyboard state. Pointer capture remains an optimization, not the
sole release mechanism. Canonical input continues to publish only left, neutral or right intent.
