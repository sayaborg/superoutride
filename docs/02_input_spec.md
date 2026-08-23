# SUPER OUTRIDE — Input Specification v0.1

Status: M0 implementation specification

## 1. Canonical game input

All physical input devices are converted into exactly this runtime shape:

```ts
export interface DrivingInput {
  steering: number;   // -1.0 = full left, +1.0 = full right
  throttle: boolean;
  brake: boolean;
}
```

`steering` is always clamped to `[-1, +1]`.

Vehicle physics must consume `DrivingInput` only. It must not query DOM keyboard state, pointer state, device orientation, or browser APIs.

## 2. Input ownership

```text
Keyboard ─┐
          ├─> InputManager ─> DrivingInput ─> Vehicle Physics
Touch ────┘

future Gamepad ──────────────┘
```

M0 implements Keyboard and Touch. Gamepad is intentionally left as a future adapter without changing `DrivingInput`.

## 3. Keyboard mapping

Canonical mapping:

```text
ArrowLeft   steering target = -1
ArrowRight  steering target = +1
ArrowUp     throttle = ON
ArrowDown   brake = ON
```

If both left and right are pressed, steering target is 0.

### Steering ramp

Keyboard is digital, but game steering is analog. Therefore raw key state only selects a target.

M0 constants:

```text
press rate    4.0 units / second
release rate  6.0 units / second
```

Rules:

- While one steering key is held, move current steering toward its target at `press rate`.
- With neither or both held, move steering toward 0 at `release rate`.
- Never overshoot the target.

These are M0 feel values, not frozen vehicle-physics parameters.

## 4. Touch steering

Touch steering is a one-axis analog pad, not two buttons.

For steering pad bounds `[left, right]` and active pointer X:

```text
normalized = (pointerX - left) / width
steering   = normalized * 2 - 1
```

Then clamp to `[-1, +1]`.

Behavior:

- pointer down: pad becomes active and steering updates immediately.
- pointer move: steering follows pointer X continuously.
- pointer up/cancel: steering returns immediately to 0 at the device adapter level.

No gyroscope input is read.

## 5. Touch throttle / brake

Throttle and brake are independent momentary controls.

```text
pointer held on THROTTLE -> throttle = true
release/cancel           -> throttle = false

pointer held on BRAKE    -> brake = true
release/cancel           -> brake = false
```

Simultaneous throttle + brake is representable and is not filtered by the input layer. Vehicle physics/game rules will decide what that means.

## 6. Multi-pointer rule

Each touch control tracks its own pointer ID.

This permits, for example:

- left thumb steering
- right thumb throttle
- right second finger brake

without one control stealing another control's pointer.

## 7. Device merge rule

M0 chooses input source by activity:

- a touch steering interaction sets steering from touch while active;
- otherwise keyboard steering is used;
- throttle is `keyboard OR touch`;
- brake is `keyboard OR touch`.

This allows desktop browser testing with a touchscreen without changing the canonical input shape.

## 8. Browser behavior

For the game keys and touch controls:

- prevent page scrolling/zoom gestures originating on controls;
- disable text selection on controls;
- use Pointer Events so mouse/touch/pen share one adapter path where applicable.

## 9. Debug contract

M0 must expose the canonical `DrivingInput` after device merging, not raw device state.

The on-screen debug values are therefore the exact values a future physics system will receive.
