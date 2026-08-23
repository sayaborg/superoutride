# M6.4 — Vehicle Physics Replaceability Boundary

## Purpose

The current car/motorcycle handling is DEV-only and intentionally uncalibrated. M6.4 prevents that temporary physics implementation from becoming an architectural dependency of presentation and high-level gameplay.

The invariant remains:

```text
DrivingInput
    -> concrete vehicle physics (replaceable)
    -> authoritative world state
        -> camera
        -> race/gameplay consumers
        -> pseudo-3D renderer
```

Camera/render/gameplay may read world state. They must not require the current `M5CarState` implementation or reconstruct physics from screen-space information.

## Read-only contracts

`src/physics/vehicle-contract.ts` defines narrow read-only contracts:

```text
VehicleWorldPoseRead
    x, y, z, yaw, course

VehicleCameraReadState
    VehicleWorldPoseRead
    + longitudinalSpeed
    + lateralSpeed

VehicleRenderReadState
    VehicleWorldPoseRead
    + sprungRoll
```

These are output contracts, not a new physics model.

## Decoupled consumers

The following modules no longer import concrete car physics:

```text
src/dev/m5-camera.ts
src/render/m5-renderer.ts
src/world/dynamic-vehicle-sprite.ts
src/gameplay/rival-driver.ts
```

Current M5 car/bike states satisfy the contracts structurally. A later vehicle model may replace their internal equations and parameterization while exposing the same authoritative world outputs.

## Validation

A regression test constructs a plain structural object containing only the required read state. No `M5CarState` is instantiated. The same object successfully drives:

- chase camera update;
- rival `DrivingInput` generation;
- dynamic vehicle sprite adaptation;
- the existing pseudo-3D renderer.

The consumers do not mutate the object.

Validated result:

```text
139 tests
139 pass
0 fail
```

## Intentional exception: recovery

`gameplay/recovery.ts` remains coupled to mutable concrete vehicle state because respawn deliberately rewrites velocity, steering, support and motorcycle-bank state. This is a gameplay-side reset adapter and may be replaced together with a future physics model.

It is not renderer authority and does not weaken the replaceability boundary above it.

## Consequence for future handling work

Future tuning or replacement may change, among other things:

- tire model / grip;
- steering response and high-speed steering envelope;
- yaw inertia;
- longitudinal drive/brake model;
- drag and top speed;
- sideslip/drift behavior;
- motorcycle bank/yaw model;
- SurfaceMap response.

Such changes must preserve world-space authority and the read contracts consumed above. Renderer pseudo-depth, GroundMap, Painter ordering, race-gate validation and metric sprite scale remain independent.
