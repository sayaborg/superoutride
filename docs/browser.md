# Browser operation

This document owns display, scheduling, keyboard/touch input, URL settings, HUD and DEV controls.
[Content and gameplay](content-and-gameplay.md) owns Session rules and loading,
[Audio](audio.md) owns audio lifetime, and [Calibration](calibration.md) owns numeric settings.

## Display and scheduling

The logical canvas is 320×240 with image smoothing disabled. A shared driving scene supplies the game
and headless previews. All selected course, image, ground and Session inputs are ready before driving
starts. A failed load displays status and Retry; an incomplete Session stays inactive.

The browser accumulates nonnegative elapsed time capped at 0.25 s per animation callback. Simulation
uses fixed 1/60 s steps; fractional remainder carries forward. One render follows the completed
steps, including callbacks with no simulation step. Starting renders immediately with a fresh clock.
Loading and setup leave the race clock stopped until START.

PAUSE and document hiding suspend scheduling, input and audio. Visibility resumes a READY or RUNNING
Session only when it is not manually paused. RESUME starts a fresh clock with cleared held input.
Completion stops the field, hides PAUSE and displays results. NEW SESSION returns to setup.
A persisted page restored from browser history reloads the page.

## Selection and URL parameters

The current course selector maps `linear` / LINEAR / 1, `seam` / SEAM / 2,
`circuit` / CIRCUIT / 3 and `branch` / BRANCH / 4. Digit-row and numeric-keypad shortcuts work;
repeated keydown is ignored. Missing or unknown `mode` selects the first entry, LINEAR.
Selecting the active course does nothing. Selecting another performs full-page navigation, changes
`mode`, removes `session`, `vehicle`, `rivals`, `laps`, `clock` and `autostart`, and preserves other URL data.

Session parameters are case-sensitive:

| Parameter   | Meaning                                                                                       |
| ----------- | --------------------------------------------------------------------------------------------- |
| `mode`      | Lowercase registered course query; independent of Session mode                                |
| `session`   | `CLASSIC` or `CUSTOM`, default `CLASSIC`; other values fail                                   |
| `vehicle`   | Exact catalog profile ID for CUSTOM, such as `TESTAROSSA`; absent uses preset                 |
| `rivals`    | CUSTOM count parsed with `Number`; integer 0–16 within grid capacity; absent uses preset      |
| `laps`      | CUSTOM count parsed with `Number`; positive integer within course limit; non-circuits use one |
| `clock`     | CUSTOM countdown: exactly `off` disables it, all other values enable it                       |
| `autostart` | Exactly `1` starts after loading; other values show setup                                     |

CLASSIC uses the saved vehicle, rivals and laps with countdown enabled, ignoring their individual
query overrides. CUSTOM exposes those settings. Invalid vehicle, numeric or course/Session combinations
produce an error. Setup locks preset fields in CLASSIC and disables a single-lap course's lap control.

```text
?mode=seam&session=CUSTOM&vehicle=TESTAROSSA&rivals=16&laps=1&clock=off&autostart=1
```

Submitting equal resolved settings starts in place. Changed settings reload with their query values
and `autostart=1`. NEW SESSION preserves settings and removes `autostart`.
Autostart affects gameplay; sound still requires an eligible browser gesture.

## Driving input

Left/right arrows steer, Up or X accelerates, and Down or Z brakes. Backspace requests recovery when
the active composition permits it. The latest still-held pedal wins; releasing it exposes the earlier
held pedal. Steering uses the latest source and does not revive a superseded direction on release.
Boolean pedal input and numeric input in `[0,1]` have the same canonical meaning.

Touch pointers starting outside UI elements marked `data-driving-input="ignore"` control driving.
The viewport's left half selects steering; the midpoint and right half select pedals. Each pointer's
role and origin are fixed until release, with at most one steering and one pedal pointer at once.

Horizontal displacement maps steering to `[-1,1]`. Upward displacement supplies throttle and downward
displacement supplies brake. Full scale is 64 CSS pixels, with larger displacement saturated.
Touching the origin owns neutral input. Held touch supplies direct analog displacement; release uses
the ordinary actuator release behavior. Release, cancellation, suspension, blur and page hiding clear
the corresponding ownership and visible origin/vector indicators.

## Performance HUD

The HUD displays FPS, maximum CPU frame time, maximum fixed-step time, maximum frame interval,
lifetime maximum seam-commit time, resident ground MiB, unique tile count and Section count,
followed by `loaded once`. The first frame reports immediately, then approximately every half second.

CPU time adds fixed-step work since the preceding render to rendering/presentation work. Frame
interval is elapsed time between completed frames. FPS and frame/step/interval maxima reset each
reporting window; seam maximum is cumulative. Ground MiB is resident bytes divided by 1,048,576.

## DEV controls

DEV is an initially closed disclosure overlay. Its body scrolls within the safe viewport without
resizing the game. UI pointer starts stay outside driving input. Keydown is isolated, while keyup
can release an already-held driving key. Escape closes the panel and returns focus to its summary.
Session-owned vehicle and physics controls are locked; camera and sound controls remain available.

Tire and steering selectors use minus/value/plus controls. Their choices wrap at range endpoints;
ACT selects traversal time in seconds. Y/U/T step D/M/ACT forward. Vehicle replacement carries active
tire calibration. The selectable body-yaw and movement-yaw cameras use the same projection.
[Calibration](calibration.md#vehicle-settings) lists values, units and ranges.

### Sound controls

A mouse press, touch/pen release, touchend or eligible keyboard gesture starts/resumes sound.
Touch pointerdown alone does not activate it. SOUND START starts or resumes; SOUND ON/OFF then mutes
or unmutes. SOUND RETRY offers a new initialization after failure. SOUND UNAVAILABLE indicates that
the browser lacks the required audio support while gameplay remains usable.

MASTER, ENG and TIRE independently control the complete output, engine output and tire output.
A zero gain silences that output while DSP continues. R and Q buttons independently switch rolling
and friction output for both axles. Their labels and pressed states show ON/OFF, and unavailable audio
disables them. [Tire audio](tire-audio.md#tuning-replacement) owns faded output and replacement semantics.

Engine tuning exposes eight minus/plus controls and reset. Buttons stop at limits; vehicle changes
preserve settings, and page/course reload restores defaults. UNIFIED controls use the acoustic ranges
and reset that model's defaults. Profile rows show cycle, cylinder count, idle/redline, firing phases,
collector grouping and path lengths. [Calibration](calibration.md) lists the numeric settings.
