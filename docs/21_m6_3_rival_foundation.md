# M6.3 — Independent Moving Rival Foundation

## 1. Purpose

M6.3 introduces the first moving competitor without creating a second vehicle architecture.

The rival follows the same authority chain as the player:

```text
DrivingInput
→ world-space M5 car physics
→ world→Guide chart
→ own validated race progress
→ shared ranking consumer
→ existing CourseSprite / Painter renderer
```

The rival is therefore not a sprite that slides along `s`, and it is not snapped to the road center.

---

## 2. Independent world state

The runtime creates a second `M5CarState` at a separate starting chainage.

It owns its own:

```text
world position / velocity / yaw
SurfaceMap contact
recovery state
RaceProgressState
RaceSessionState
```

Player camera state remains player-owned.

No player/rival collision response is part of M6.3.

---

## 3. Rival driver authority

`sampleRivalDrivingInput()` returns only the canonical input structure:

```text
steering ∈ [-1,+1]
throttle ∈ {false,true}
brake    ∈ {false,true}
```

The AI never writes:

```text
vehicle.x / z / y
vehicle.yaw
vehicle.course.s / l
velocity
renderer coordinates
```

This preserves the rule that physics is world-space and authoritative.

Guide coordinates are observations/controllers only.

---

## 4. Steering

The driver targets a point on the Guide ahead of the current geometric chainage.

The steering controller combines:

```text
heading error to lookahead point
+ course.l center feedback
+ lateral velocity damping
```

`course.l` is used only to choose an input command. It does not constrain or overwrite the vehicle's world position.

---

## 5. Curvature-aware speed

The first M6.3 test run revealed an important physical consequence of the DEV course.

The rival initially attempted to retain a ~200 km/h straight target into the 60m-radius stadium bend. Because M5 car physics is real world-space dynamics, that speed is not physically compatible with the available lateral acceleration and the car left the supported SurfaceMap.

The fix was not to weaken physics or snap the rival back to the road.

Instead, the AI samples Guide heading ahead and estimates upcoming curvature:

```text
kappa ≈ |wrapAngle(psi_b - psi_a)| / delta_s
```

It derives a conservative curve target from lateral acceleration:

```text
v_curve = sqrt(a_lat_target / kappa)
```

Current DEV values:

```text
straight target       56 m/s = 201.6 km/h
lateral target        0.72 g
minimum curve target  18 m/s
```

The AI then produces ordinary throttle/brake input around that target.

Thus straights retain the intended 200+ km/h character while physically tighter debug curves demand braking.

---

## 6. Rendering

The rival's current physical anchor is adapted into the existing `CourseSprite` structure:

```text
x       = rival.x
y       = rival.y
z       = rival.z
sRender = rival.course.s
```

The camera-relative physical yaw selects one of the existing discrete car yaw bitmaps.

There is:

- no runtime bitmap rotation;
- no special rival scale;
- no separate vehicle 3D renderer;
- no alternate depth rule.

The resulting sprite enters the same far→near Painter list as every other World Sprite.

---

## 7. Ranking

Player and rival each maintain an independent validated progress state.

Shared ranking receives only:

```text
sProgress
validatedProgressFloor
```

from each vehicle, using the M6.2 ranking consumer.

Raw geometry and screen position remain excluded from ranking authority.

---

## 8. Runtime HUD

M6.3 exposes:

```text
POS <player rank>/2
YOU <player sProgress>
RIVAL <rival sProgress>
```

This is debugging presentation only. The renderer itself still does not own ranking logic.

---

## 9. Stress validation

The final rival integration test runs:

```text
360 fixed ticks
6 seconds at 60 Hz
start s=95m
```

This crosses the long-straight / first 60m-radius bend transition using:

- ordinary `M5CarState`;
- ordinary `updateM5Car()`;
- ordinary world→Guide relocalization;
- no recovery helper.

The test requires the rival to remain finite and `supported=true` on every tick and remain inside the authored supported lateral envelope.

The first attempt failed this test because constant high speed was physically invalid. The curvature-aware input controller fixed the actual problem; the test was not weakened to permit unsupported driving.

---

## 10. Validation

Validated feature head:

```text
dc01525aca7dad16b375aa43e16ff1390fa349ec
```

GitHub Actions:

```text
run 32614337231
job 97132454621
```

Result:

```text
137 tests
137 pass
0 fail
```

---

## 11. Next

The next rival/gameplay work should add vehicle interaction only if it can remain world-space and independent from rendering.

A minimal collision foundation should resolve player/rival contact in the horizontal world plane, then let both existing physics states continue normally. It must not derive collision from sprite pixels or pseudo-depth.
