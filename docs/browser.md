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

The current course selector maps `ribbon-coast` / RIBBON COAST / 1, `ribbon-ring` / RIBBON RING / 2
and `ribbon-fork` / RIBBON FORK / 3.
Digit-row and numeric-keypad shortcuts work; repeated keydown is ignored. Missing or unknown `mode`
selects the first entry, RIBBON COAST.
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
?mode=ribbon-coast&session=CUSTOM&vehicle=TESTAROSSA&rivals=16&laps=1&clock=off&autostart=1
```

Submitting equal resolved settings starts in place. Changed settings reload with their query values
and `autostart=1`. NEW SESSION preserves settings and removes `autostart`.
Autostart affects gameplay; sound still requires an eligible browser gesture.

## Driving input

Left/right arrows steer, Up or X accelerates, and Down or Z brakes. Backspace requests recovery when
the active composition permits it. The latest still-held pedal wins; releasing it exposes the earlier
held pedal. Steering uses the latest owner and does not revive a superseded direction on release.
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

The HUD displays FPS, maximum CPU frame time, maximum fixed-step time, maximum frame interval and
lifetime maximum seam-commit time. The first frame reports immediately, then approximately every half second.

The ground detail shows the selected method, the reporting window's maximum visible active Band count,
the compiled course maximum and active limit, the latest frame's ground-sampling CPU milliseconds,
and the maximum over the most recent 120 rendered frames (`max120`). Changing method clears this
ground-timing history and reports immediately, including while paused. The active count includes
hidden declarations in each contributing source slab; it is a maximum, not a sum over pixels or
Sections. These observations are measurements, not device-capacity verdicts.

CPU time adds fixed-step work since the preceding render to rendering/display work. Frame
interval is elapsed time between completed frames. FPS and frame/step/interval maxima reset each
reporting window; seam maximum is cumulative.

## DEV controls

DEV is an initially closed disclosure overlay. Its body scrolls within the safe viewport without
resizing the game. UI pointer starts stay outside driving input. Keydown is isolated, while keyup
can release an already-held driving key. Escape closes the panel and returns focus to its summary.
Session-owned vehicle and physics controls are locked; camera and sound controls remain available.

Tire and steering selectors use minus/value/plus controls. Their choices wrap at range endpoints;
ACT selects traversal time in seconds. Y/U/T step D/M/ACT forward. Vehicle replacement carries active
tire calibration. The selectable body-yaw and movement-yaw cameras use the same projection.
[Calibration](calibration.md#vehicle-settings) lists values, units and ranges.

### Ground display setting

`graphics/display-settings.ts` owns the typed product display setting and its LEVEL-POINT default.
The driving composition root creates one settings object; the shared scene reads it when rendering.
The browser control is only an adapter and does not own the value or its lifetime.

DEV's **Ground display** group exposes all three methods defined in
[Architecture](architecture.md#band-rendering), marking the selected button pressed. A click updates
the single setting and redraws immediately, including before START and while paused. Camera, vehicle,
Session and occurrence history are preserved, with no restart or course recompilation. The setting
lasts for the loaded page; page/course reload restores the default. The controls use DEV input isolation.
A player-facing settings screen is future work in [NEXT](NEXT.md).

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
