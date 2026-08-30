# M9.1 Dual Yaw Camera Modes

Status: current player-camera yaw-mode and browser camera-selection authority above unchanged
vehicle physics, renderer, metric presentation, route and topology layers.

This document supersedes only M8.2's rule that movement direction always owns camera yaw. It
preserves the M8.2 body-pitch-plane movement-yaw derivation and low-speed hold as the selectable
`MOVEMENT_FOLLOW` mode. M8.2 body-pitch follow, world-space placement, exact player centering and
all frozen renderer invariants remain authoritative.

## 1. Architecture decision gate

1. Camera yaw mode belongs to the chase-camera rig; `P` and touch controls belong to browser
   composition.
2. Existing vehicle body yaw and M8.2 derived movement yaw express both modes without another
   coordinate system or vehicle state.
3. The rig retains one derived movement-yaw observation separately from output camera yaw so the
   old low-speed hold remains available while `BODY_FIXED` is active. It is presentation memory,
   never physics or progress authority.
4. The rule contains no vehicle-, course-, route-, stage- or topology-specific lower-layer branch.
5. Every browser root uses the same rig modes, `P` mapping and generated touch control.
6. Chainage depth, `D_cam=5 m`, 40 px/m player scale, zero roll, body-pitch follow, centered player
   X and discrete sprite authority remain unchanged.
7. Regression proves exact body-yaw lock, retained movement mode, low-speed hold, recovery
   persistence, key/touch selection and mode-dependent arrow meaning.

## 2. Modes and default

The finite mode authority is:

```text
BODY_FIXED       default
MOVEMENT_FOLLOW  M8.2 behavior
```

`BODY_FIXED` is exact on every camera update:

```text
psi_camera = psi_vehicle
```

No damping, interpolation, safety view or Guide correction is inserted. The camera is placed
`D_cam` behind the vehicle on that body-yaw ray. Large yaw changes may therefore produce an
intentionally unstable view; this is permitted presentation behavior and not corrected by a
second authority.

`MOVEMENT_FOLLOW` uses the unchanged M8.2 body-pitch-plane velocity direction:

```text
psi_movement = wrap(psi_vehicle + atan2(V_right, V_forward))
psi_camera   = psi_movement
```

Below the existing `0.25 m/s` in-plane threshold, the last valid movement yaw remains held.

`resetM5CameraRig` clears derived camera history but preserves the selected mode. Recovery,
profile switching and route/content changes therefore cannot silently change the user's camera
choice.

## 3. Browser selection

```text
P = toggle BODY_FIXED / MOVEMENT_FOLLOW
```

Phone/coarse-pointer layouts expose `BODY` and `MOVE` buttons generated from the same two camera
modes. `P`, touch and visible active state all mutate/read the one camera rig mode; there is no
mobile-only or keyboard-only camera state.

## 4. Yaw-arrow meaning

The overlay always shows the direction that is not already fixed to screen-up by the active
camera mode:

```text
BODY_FIXED      -> TRAVEL YAW arrow = actual derived movement direction relative to body camera
MOVEMENT_FOLLOW -> BODY YAW arrow   = vehicle body direction relative to movement camera
```

Thus a sliding vehicle in the default mode keeps the body fixed to the camera while the arrow
shows its actual travel direction. The vector remains DEV HUD geometry only. It does not rotate a
sprite or feed camera, physics, input, route or progress.
