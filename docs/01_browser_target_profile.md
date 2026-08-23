# SUPER OUTRIDE — Browser Target Profile v0.1

Status: M0 implementation profile
Authority: `00_core_design_freeze.md` remains the renderer/geometry source of truth.

## 1. Platform

- Runtime: modern browser
- Game logical resolution: **320 × 240**
- Aspect ratio: **4:3**
- Target update/render rate: **60 fps**
- Game pixels are never reflowed; the browser only scales the 320 × 240 presentation surface.
- Canvas scaling uses nearest-neighbor presentation (`image-rendering: pixelated`).

This matches Core §68 / §77.1. No renderer formula is duplicated here.

## 2. Display separation

Two sizes are deliberately separated:

1. **Logical game surface**: always 320 × 240.
2. **Browser presentation size**: responsive to the available viewport.

The browser shell may use CSS layout around the game surface, but the game coordinate system never changes with device orientation or CSS size.

## 3. Desktop profile

- Primary input: keyboard.
- Touch controls are hidden when no touch-capable/coarse-pointer environment is detected.
- The game surface is centered and scaled as large as possible while preserving 4:3.

## 4. Mobile / tablet profile

Gyroscope control is not used.

### Landscape

```text
left margin       320×240 game       right margin

steering pad                         brake
                                     throttle
```

- Left/right outside areas are used as control margins where practical.
- Steering is a one-axis analog pad.
- Throttle and brake are independent on/off buttons.

### Portrait

```text
320×240 game

steering pad            brake
                        throttle
```

- Controls are placed below the game surface.
- The game surface itself remains 320 × 240 logical pixels.

## 5. Frame loop

M0 uses `requestAnimationFrame` and an accumulator with a 60 Hz simulation step.

```text
SIM_DT = 1 / 60 s
```

This prevents input smoothing from depending directly on display refresh rate. Rendering may occur once per animation frame; simulation advances in fixed 60 Hz steps.

## 6. M0 acceptance criteria

Desktop:

- 320 × 240 logical surface is visible.
- Arrow Left/Right produce analog `steering` in `[-1, +1]` by ramping, not an instantaneous game-state dependency on raw keys.
- Arrow Up maps to throttle.
- Arrow Down maps to brake.

Touch:

- Steering changes continuously from touch X position.
- Throttle is on only while its touch/pointer is held.
- Brake is on only while its touch/pointer is held.
- Portrait/landscape layout changes without changing logical game coordinates.

Debug readout:

```text
STEER  +0.37
ACCEL  ON
BRAKE  OFF
```

## 7. Explicit non-goals for M0

M0 does not implement:

- course geometry
- Guide Curve
- pseudo-depth
- road renderer
- GroundMap
- Far Background
- sprites
- vehicle physics

Those begin at M1 and later. M0 only establishes the browser/input boundary that those systems will consume.
