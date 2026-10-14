# Browser operation

This document owns display, scheduling, keyboard/touch/gamepad input, URL settings, race status, HUD and DEV controls.
[Content and gameplay](content-and-gameplay.md) owns run rules and loading,
[Audio](audio.md) owns audio lifetime, and [Calibration](calibration.md) owns numeric settings.

## Display and scheduling

The logical canvas is 320×240 with image smoothing disabled. `LOGICAL_WIDTH` and `LOGICAL_HEIGHT` are
the frame size's only authority: every frame is made by `createLogicalFrame`, and the camera's
projection centre is the frame centre. The frame stores RGB555; each presented frame is expanded to the
canvas's RGBA through one 32,768-entry table. A shared driving scene supplies the game and headless
previews. All selected course, image, ground and run inputs are ready before driving starts. A
failed run assembly shows LOAD FAILED in the frame without reloading the page; an incomplete run stays inactive.

The page is laid out by CSS alone. The frame keeps 4:3 without interpolation: in landscape it fills the height of the
safe area and is centered; in portrait it spans the width at the top. The touch area is the whole viewport wherever
the frame is.

The browser accumulates nonnegative elapsed time capped at 0.25 s per animation callback. Simulation
uses fixed 1/60 s steps (`SIM_DT`): the frame loop runs one race `advance(input)` per whole step in the accumulated
time, passing no step length, and the fractional remainder carries forward. One render follows the completed
steps, including callbacks with no simulation step; it reads the race's competitor observations, which
hold the values of the latest completed step. There is one frame loop; it runs while the page is visible and
advances and draws the current screen. Each start begins a fresh clock, so stopped real time never enters the
simulation. Loading leaves the race clock stopped; an assembled run starts after the PRE-RACE card and the black transition.
Loading never stops the frame loop: a run's course compiles in [slices](architecture.md#course-loading) of 8 ms of
work (`LOADING_SLICE_MILLISECONDS`), each followed by a yield to the event loop through a message channel, so the frame
loop and input run between them and TITLE, the attract demo and the PRE-RACE card keep drawing while a course loads. The
page's own startup (delivered content and catalogs, before the first screen) is not sliced and happens once, over the
page's black.
Every run assembly, a DEV tuning rebuild included, picks a new run seed from `crypto.getRandomValues`;
the composition root is the only place that draws randomness.

The driving composition root owns two lifetimes. The page lifetime is created once: delivered content and
catalogs (materials, surface sounds, vehicle and driving definitions, series, text tiles, audio settings), the
player record, the text layer, race sprites, the browser devices (canvas, framebuffer, input,
audio), the screen host with its frame loop and, with `dev=1`, the performance HUD and the page's DEV
controls (sound, camera, RESULT delay). The run lifetime holds the selected course, its run
settings, the field's run vehicles, racing lines, time budgets and pace schedule, the run, scene and race,
the player's sprites, the camera rig and lifecycle and, with `dev=1`, the course's performance-HUD
values and the run's DEV controls (driving tuning, export, RECOVER). Page devices hold no run: each frame passes the
run's observations to them.

The page is loaded once. A URL that names a course, the selection screens and RETRY request a run, and every request
passes the one assembly, after which the run starts once the PRE-RACE card leaves; a DEV tuning rebuild replaces the run inside its run. Assembly is
asynchronous and one runs at a time: a request made during an assembly is ignored. The page holds one course: a
request first disposes of the current run, removing the listeners and DOM it added, then loads the next. A new run
starts from delivered content, so DEV driving tuning and its displayed values return to the delivered definition.
Sound, input, fullscreen, the DEV sound settings, the DEV camera adjustment and the
RESULT delay belong to the page and persist. A failed assembly leaves no run and shows LOAD FAILED; its reason goes to
the console and, with `dev=1`, outside the frame with Retry.

## Screens

The page always has one current screen, owned by the screen host. A screen advances one fixed step, draws one
frame (the framebuffer and the [text layer](architecture.md#text-layer)) and says whether it is live: whether the
player's driving input and sound run on it. The host runs the frame loop while the page is visible and stops it
while the document is hidden or after `pagehide`; only the host watches document visibility and page hiding, and a
page restored from the back/forward cache reloads. Driving input and sound are live exactly while the page is
visible and the current screen is live, and the host runs one symmetric procedure when its route changes (driving,
menu or off while hidden): driving clears input suspension; otherwise input is suspended (which resets it). The same
procedure tells audio whether the page is visible and whether a run is driven ([Audio](audio.md#mix-and-lifetime)).

The PRE-RACE card stands while a run is assembled, doubling as its loading screen; `prerace` sounds as it appears. For
a class (RACE and TIME ATTACK) it shows the series image with rows 17–29 (y 136–240) at quarter brightness; FREE PLAY
shows it on black.
Inside x 8–136, y 136–232 it draws the course map, north up by the course's bearing: the route's centreline (one lap of
a circuit, else the route from the entry, each fork taking its first exit) 3 pixels wide in white with a 1-pixel gray
core, scaled to fit and centred, a 1×9-pixel YELLOW bar across the start line (the entry Section's origin) and a 3×3
GREEN dot at each checkpoint gate on that route; the map is drawn into the frame, not as text. From column 17 it writes
the class title (YELLOW; `FREE PLAY` in FREE PLAY) on row 18, a class run's session (WHITE) on row 19, the course's
name on row 20, `<length>KM  <n> LAPS`
on row 21 (the route's length to 0.001 km, laps only on a circuit with a lap count), `<field> CARS|BIKES  START P<slot>`
on row 23 and `BEST <time>` (GREEN) on row 25, the record READY would show, `--'--"--` when there is none (TIME ATTACK
only).
On
row 28, columns 17–37, a progress bar 4 pixels high in the row's middle fills YELLOW over dark gray as the run loads:
the course's files to 70 %, its compilation to 80 % (Section by Section), the run to 90 %, the assembled run
to 100 %. The title, course
name and laps show at once; the map and the run's lines once the course is compiled and the run prepared. The
card stays at least 2.5 s (counted in fixed steps) and until the run is assembled; then the black transition leads to
READY. After a failed assembly the
LOAD FAILED screen shows `LOAD FAILED` in red with RETRY, which requests the same run again, and BACK, which returns to
the screen that requested it: the last selection screen, or TITLE for a run the URL or a DEV control requested. The
reason is not drawn, since it may hold characters without text tiles: it goes to the console and, with `dev=1`, to a
status element outside the frame, which also shows `Loading course…` while a run loads. Without `dev=1` nothing shows
outside the frame, except when the page itself cannot start (its content or text tiles cannot load, so the frame
cannot draw text): then its reason and a Retry that reloads the page show outside the frame. The run screen holds the run and its state: running, paused (manual PAUSE)
or finished (the run reached RESULT). The run runs only while neither holds: paused and finished advance no race,
and driving input and sound stop, so no touch indicator is drawn. Every
frame still draws the scene. While paused, the PAUSE menu is drawn over the stopped frame, which is first halved to
half brightness while the text layer, the HUD included, stays at full brightness: the title `PAUSED` and
RESUME, RETRY and QUIT. RESUME, BACK and PAUSE resume; RETRY requests the same run again, which passes the PRE-RACE card with a
new seed; QUIT ends a running run without a finish (the race's `endable`), which shows RESULT at once, and otherwise
ends the run and shows TITLE.

Every menu screen uses one menu part: a title, information lines and items, centred in the text grid without
shortening; the title and any information lines keep one row each, and a menu taller than the 30 rows is a
`RangeError`. Each item carries what CONFIRM and LEFT/RIGHT do on it, so no action depends on its position; BACK
leaves. Its layout is a carousel or a list:

- **Carousel** (every menu screen but SETTINGS, OPTIONS and LAPS): one item is shown at a time, YELLOW, with WHITE `◀`
  and `▶` four columns either side when there are several; LEFT and RIGHT change it, like steering an arcade wheel,
  and UP and DOWN act as LEFT and RIGHT; the list wraps at both ends. An item that offers nothing is shown DARK, and
  CONFIRM on it denies (`menu-deny`) and does nothing. An item may carry a DARK note two rows under it (SELECT COURSE's
  series title).
- **List** (SETTINGS, OPTIONS and LAPS, whose items hold values): the items on every second row, the current item
  YELLOW, unselectable items DARK and the rest WHITE; UP and DOWN move over the selectable items and wrap around, and
  LEFT and RIGHT change the current item's value.

A change of screen goes through black: the frame darkens to black over 8 fixed steps, with its RGB555 channels scaled
by the remaining eighths, and the next screen brightens from black over 8 more; the page starts from black. During a
transition no screen advances, the route is the menu's, and menu commands are dropped. The screen host owns the
transition and the shell presents each frame at the host's brightness. A screen declares the wallpaper it stands on
(a series' image: SELECT SERIES, SELECT CLASS, SELECT SESSION, SELECT VEHICLE, SELECT MUSIC and the PRE-RACE card); a
change
between two screens standing on the same wallpaper, asked for while no transition runs, is immediate, and the next
frame draws the next screen at full brightness. So inside a series only what is drawn over the image changes, in
either direction, while TITLE ↔ SELECT SERIES, the PRE-RACE card → READY and every other change go through black.

The selection screens follow one flow table ([product](product.md#6-flow-and-screens)). TITLE draws the title logo
(18×7 tiles) centred at y 16 over the attract demo. The [attract demo](../src/shell/attract-demo.ts) is the one owner of
the demo runs and their turns. It runs the RACE sessions of the product classes (never DEV ones) in series and
class order,
looping, one 30 s turn each. It holds at most two runs, the shown class's and the next class's, each assembled as a
run with no player input (the player's run driver drives the class's first vehicle in its first color), with no HUD, no sound and no record, and touches no page state (driving input, DEV displays). Each holds its course's compilation, which held runs of one
course share; a compilation no held run uses is released. A run is stepped in the race's fixed step, through
the frame loop as a run is, only while its turn is shown, from READY. When a turn ends its run is released, so a
class shown again starts a new run from READY with the next seed. Each turn brightens
from black over the transition's 8 steps and darkens over 8 more; the logo and lines stay bright, and while it is fully
shown its series title, class title, vehicle (manufacturer and model) and color display name are written in WHITE on
rows 21, 22, 24 and 25, right-aligned to column 38. When a run ends (the player's GOAL or GAME OVER) it is shown to
the end of its RESULT delay without RESULT and its turn darkens early. The first class loads behind the logo and PRESS
START over black and its turn begins once it is loaded; each turn has the next class's run loaded (loading only,
standing in READY), so no later turn waits on a load. A class that cannot load is passed over; with no product class
TITLE stays over black. Leaving TITLE ends the shown turn and releases its run; returning resumes with the next
class's turn. The runs are released when the page is left. Before the first gesture `PRESS START` blinks in YELLOW, centred on
row 28 (shown 32 fixed steps, hidden 16). CONFIRM there is the user gesture that enables sound and requests fullscreen
of the page where the browser allows them (a refusal is ignored, and a gamepad press is not a gesture the browser
accepts); it sounds `press-start` and replaces the line with TITLE's line for the rest of the page, with no way back
to PRESS START. TITLE's line is a carousel on row 28 over rows 27–29 at half brightness: its item (YELLOW, DARK when
it offers nothing) between WHITE `◀` and `▶` four columns either side, among SERIES, FREE PLAY and SETTINGS; BACK does
nothing. There is no mode: SERIES leads to SELECT SERIES, SELECT CLASS (only for a series with several classes),
SELECT SESSION and SELECT VEHICLE; FREE PLAY, the assembly bench, to SELECT COURSE, SELECT VEHICLE and OPTIONS; both
then to SELECT MUSIC
(only when the run offers a track). BACK returns to the previous screen and does nothing on TITLE; the CONFIRM on the
last screen shown requests the run (`menu-entry`), which shows
the PRE-RACE card and then starts. Each screen starts from the current selection, else the player record's latest
selection for that screen (TITLE's line, SELECT SERIES, SELECT CLASS, SELECT SESSION, SELECT COURSE, SELECT VEHICLE and
SELECT MUSIC under the keys `title`, `series`, `class`, `session`, `course`, `vehicle` and `music`), else its first
selectable item; each CONFIRM on those screens saves its choice as the latest. RETRY keeps the run's request; CHANGE
VEHICLE goes to SELECT VEHICLE and SELECT to the first screen after TITLE (SELECT SERIES or SELECT COURSE), and both
pass the rest of the screens and SELECT MUSIC again.

A menu item can say what happens while the cursor is on it (`focus`): the menu calls it when the cursor comes to the
item and its returned function once when the cursor leaves it or the screen host makes another screen current.
SETTINGS uses it for its audition, the one form of [playing a track](audio.md#music) from its start, looped: the
audition stops when the cursor or the screen leaves, and a track still decoding when the cursor leaves never sounds.
SELECT SERIES uses it to play the title track of the series under the cursor.

SETTINGS lists MASTER, MUSIC and EFFECTS with their volumes, which LEFT and RIGHT change in steps of 5 within 0–100
(to the adjacent multiple of 5), CAR CAMERA and BIKE CAMERA, which LEFT and RIGHT switch between FACING and MOVING
([camera yaw](architecture.md#camera-and-fixed-metric)) for runs with a vehicle of that form, CAR STEERING and BIKE
STEERING, which LEFT and RIGHT switch between FRONT and CENTER, and CAR STEERING USE and BIKE STEERING USE, which LEFT and
RIGHT step through 100%, 95% and 90%, wrapping ([steering rule](vehicle-physics.md#actuators-and-steering)), BRAKE
SIGN, which LEFT and RIGHT switch between ON and OFF ([BRAKE!!](#brake)), CONTROLS, which shows the keyboard, touch and gamepad controls, and CLEAR RECORDS,
which asks CLEAR RECORDS? with NO (selected first) and YES: YES empties the records, saves the player record with its
settings unchanged and returns to SETTINGS, as NO and BACK do; BACK leaves each screen.
The player record is the one owner of every volume. Each change, from SETTINGS or the DEV MASTER stepper, goes through
the audio lifetime's one path (`setVolume`): the record keeps it, the stepper shows MASTER, and every volume applies at
once; LEFT and RIGHT on EFFECTS sound `menu-move` at the new volume, which is its audition. While the cursor is on MUSIC, the player record's latest track (else, and after MUSIC OFF,
the first track) plays as an audition, so its volume is set by ear.

- TITLE: SERIES with no offered series, or FREE PLAY with no selectable course, is DARK.
- SELECT SERIES shows the series image filling the frame, the HUD's 4×4-tile road arrow (ARROW) at columns 0–3
  pointing left and 36–39 pointing right on rows 13–16, and `PRESS START` (YELLOW, meaning CONFIRM) centred on row
  27; the arrows are drawn when there are several series. LEFT and RIGHT (and UP and DOWN) slide the next image in
  horizontally over 16 fixed steps in whole pixels, the arrows and text staying put, wrapping at both ends, and sound
  `series-slide`; commands during a slide do nothing. The series' title track plays from its start when SELECT SERIES
  is entered, and a slide crossfades from the old series' title track to the new one over the slide's 16 steps. A
  series that offers nothing (no class) shows its image at half brightness and denies CONFIRM.
- SELECT CLASS shows the series image with text rows 22–29 at half brightness and no heading: on row 23 the class
  title (YELLOW) between WHITE `◀` and `▶` four columns either side; on row 25 `<COURSE>  <n> LAPS  <field> BIKES|CARS`
  (WHITE; BIKES when the whole field is bikes); on row 26 the vehicle's manufacturer and model in upper case, or
  `<n> BIKES|CARS` when the class lists several vehicles. A class's record is shown only inside the class, not here.
  LEFT and RIGHT change the class;
  choosing another class clears the chosen vehicle. SELECT COURSE (FREE PLAY) lists course display
  names from the course index, grouped by series. Each course is listed once, under the first offered series in
  series order whose classes run it, in its classes' order; courses in no series follow last, with no note.
- SELECT SESSION stands over the series image like SELECT CLASS: on row 23 the session, RACE or TIME ATTACK (YELLOW),
  between WHITE `◀` and `▶`; for RACE on row 25 `<n> LAPS  <field> BIKES|CARS` (WHITE); for TIME ATTACK on row 25
  `BEST LAP <time>` on a circuit, else `RECORD <time>` (GREEN; `--'--"--` without one), and on row 26 the manufacturer
  and model of the vehicle it was set with (WHITE). The record is the class's fastest current TIME ATTACK record at any
  goal (`shownRecord`), counted only while its course and vehicle identities are current (the course index's
  `buildSha256` and the record vehicle's `runVehicleSha256`). Every class offers both sessions.
- SELECT VEHICLE offers the class's vehicles for a class and every catalog vehicle in FREE PLAY, one catalog page per
  vehicle ([SELECT VEHICLE](#select-vehicle)), drawn for a class over the series image at quarter brightness, its panels darker, and
  otherwise on the plain background. LEFT and RIGHT change the vehicle and UP and DOWN its
  color, both wrapping around. Each vehicle shows the color its run would give the player (one rule with the
  race): the player record's color for the vehicle, else the vehicle's default color; in a series with fixed colors,
  its entry's color in the chosen class, with no color choice. CONFIRM saves a chosen color in the player record.
- OPTIONS: RIVALS (0 to the smaller of 15 and the rivals the course's grid holds, from the course index; a course
  change lowers a larger count), POOL (ALL, CARS or BIKES; set to the vehicle's form when a vehicle other than the
  current or latest one is chosen), TRAFFIC (OFF, LOW or HIGH) and, on a course with several laps, LAPS (1 to the
  course's maximum; a course change lowers a larger count); LEFT and RIGHT change the value, and NEXT confirms. RACE
  takes its class's traffic, and TIME ATTACK has none. Every option starts from the player
  record's latest choice (keys `rivals`, `pool`, `traffic` and `laps`), else 0, the first pool, OFF and 1, and each
  change is saved there.
- SELECT MUSIC shows the series image for a class (else the plain background) with text rows 22–29 at half brightness:
  on row 24 the choice's title (YELLOW) between `◀` and `▶`, on row 26 `TRACK n / N` (WHITE), counting MUSIC OFF. It
  offers the run's tracks in their selection order, then `MUSIC OFF`: for a class its series' race tracks,
  otherwise every delivered track. It is shown only when there are two or more choices (one or more tracks); otherwise
  the run takes MUSIC OFF. There is no audition: choosing changes only the name. CONFIRM starts the run with it; the
  player record keeps MUSIC OFF as the latest choice `off`.
- Music on the selection screens: in a series the series' title track plays, from its start and looped, from SELECT
  SERIES (the series under the cursor) through SELECT CLASS, SELECT VEHICLE, SELECT MUSIC and the run's loading, and
  fades out over the black transition into READY; the run's track then starts at READY. Every other menu screen, and
  RESULT, is silent. Leaving a run for a series screen plays the title track from its start again.

DEV series and courses in no series are offered only with `dev=1`, which the composition root reads once.

RESULT follows GOAL or GAME OVER after the RESULT delay, a DEV setting (default 3 s; 0, 1, 2, 3, 5 or 10 s; not
persisted), which the shell counts in fixed simulation steps after the step that ended the run. Until then the loop,
the field, rendering and sound continue and PAUSE stays available; a pause stops the count with the simulation.
At RESULT the run finishes: the race stops and the RESULT menu
is drawn over the stopped frame at half brightness and takes the menu commands. Its title is the outcome in the ornate large font, GOAL in
SUNSET or GAME OVER in RED; its lines are RANK n/m (ornate large, SUNSET) when two or more competitors are ranked (the POS rule), TIME (race time), RECORD (the record before the run) when
a TIME ATTACK run was judged and one existed, NEW RECORD in yellow when the run (on a circuit, one of its laps) beat it
or set the first, and, on a circuit, BEST LAP.
A run without a finish, which QUIT ended, has RESULT (SUNSET) as its title and `LAPS <n>`, its completed laps, instead of
TIME, and BEST LAP once it completed one. The race facts give the rank (by the race's standing) and times; the run's one
record judgement ([Player record](#player-record)) gives the record lines. Its items are RETRY (the same run again, through the PRE-RACE card with
a new seed), CHANGE VEHICLE (SELECT VEHICLE with the run's selection), SELECT (the first selection screen after TITLE
with the run's selection) and TITLE; leaving the run ends it. A run rebuilt by DEV tuning restarts
the run, clearing `paused` and `finished`, so it drives at once. A run's start resets driving input once.

### SELECT VEHICLE

SELECT VEHICLE is a catalog page per vehicle on the 40×30 text grid, its values read from the compiled vehicle and its
listing as the simulation holds them. Rows 0–11 stand on every page; below them two pages, POWERTRAIN and CHASSIS,
take turns. `src/shell/vehicle-page.ts` holds every position, scale and time named here.

| Rows  | Columns | Content                                                                                        |
| ----- | ------- | ---------------------------------------------------------------------------------------------- |
| 0     | 13–26   | `SELECT VEHICLE` (WHITE)                                                                       |
| 0     | 32–38   | `◀ n/N ▶`, the vehicle among the offered vehicles (DARK)                                       |
| 2     | 1–      | manufacturer and model (YELLOW)                                                                |
| 3     | 1–      | `physicsAnchor.modelYear`, two spaces and the identifier's official label in upper case (DARK) |
| 3     | 22–39   | the page's headings over its diagram                                                           |
| 4–10  | 0–19    | the turning picture                                                                            |
| 4–11  | 22–39   | the page's diagram                                                                             |
| 11    | 1–21    | the color's display name, `▲ GUARDS RED 3/4 ▼` (WHITE); with fixed colors its name only        |
| 12    | 1–      | the page tabs                                                                                  |
| 12    | 30–37   | `PAGE n/2` (DARK)                                                                              |
| 14–29 | 0–39    | the page's values                                                                              |

The picture turns through the yaw images, one every six fixed steps, in the shown color. Each vehicle has one scale,
the largest from the player depth down (in steps of 1 %) at which every yaw image, standing at one anchor, fits columns
0–19 by rows 4–10 (160×56 pixels), and that anchor centres the images in the box.

Each page stays 480 fixed steps (8 s), then the next follows, POWERTRAIN after CHASSIS; no key turns the pages and no
black stands between them. A change of vehicle keeps the page and starts its time again; a change of color does not.
The tabs on row 12 name the pages from column 1, two columns apart, the shown page WHITE and the other DARK. Under the
shown page's name, on y 103, its time line runs DIM across the name's width, YELLOW from the left over the share of
the page's time gone; a DIM rule crosses the frame on y 106. Over a wallpaper the frame stands at quarter brightness,
the graph's box (x 172–319, y 22–97) and the tabs (y 96–111) at an eighth and the values (y 112–239) at a sixteenth, so
the text reads over the picture.

Values are written with labels DARK and values WHITE: the left column's labels at column 0 and values at column 8, the
right column's at columns 20 and 28. Power and torque are integers from 10 up and have one decimal below (`8.8kW`);
RPM, millimetres, kilograms, inertias and brake torques are integers; ratios have three decimals below 10 and two from 10 up (`14.47`), wheel inertias one,
and ride frequency, damping and drag two. A left value ends by column 18 and a right value by column 39.

#### POWERTRAIN

Row 3 heads the graph with `TORQUE` (YELLOW) at column 22 and `POWER` (RED) at column 31. The graph is drawn in pixels
under the text, in x 176–319 and y 32–95. Its horizontal axis runs from 20 % to 110 % of redline, 16 pixels for each
10 %, with a grid line every 10 % (the last clipped at x 319); its vertical axis from 0 on row 95 to the top grid line
on row 35, with grid lines at 25, 50, 75 and 100 %. The grid is DARK, the axes (x 176, y 95) a lighter grey, and the
redline a RED line dashed every second pixel. The
torque curve (YELLOW) and the power curve (RED) are each scaled so its maximum touches the top grid line; they are a
pixel wide, joined vertically between columns, and run from the larger of idle and 20 % of redline to the fuel-cut
entry, `fuelCutEnterRedlineRatio` times redline, following the curve above redline
([Vehicle physics](vehicle-physics.md#wheel-and-powertrain)). The graph has no axis numbers.

| Rows 14–20, left  | Example      | Source                                                    |
| ----------------- | ------------ | --------------------------------------------------------- |
| `ENGINE`          | `F12 4943cc` | listing `metadata.engine`, `displacementCc`               |
| `CYCLE`           | `4-STROKE`   | `cycle`                                                   |
| `POWER`           | `287kW/6300` | the curve's maximum of `rpm*torque` (point D) and its RPM |
| `TORQUE`          | `490Nm/4500` | the curve's maximum (point C) and its RPM                 |
| `IDLE`, `REDLINE` | `1000rpm`    | `idleRpm`, `redlineRpm`                                   |
| `CUT`             | `7140rpm`    | the fuel-cut entry, `fuelCutEnterRedlineRatio` × redline  |

The firing and the exhaust move in slow motion, 30 times slower than real: the engine turns at `idleRpm`, a cycle
taking `cycleRevolutions` × 60 × 30 / `idleRpm` seconds, and the exhaust's pulses travel at `ACOUSTICS.waveSpeed`, the
speed the exhaust's sound uses, slowed alike, so their timing keeps its real ratio. Their time is counted in fixed steps
since the vehicle was shown, from the cycle's start. A cylinder fires at its `firingPhases` entry and stays lit for
4 % of a cycle after it. Its bank is its cylinder-side junction (`exhaust.banks`), colored by junction number YELLOW,
RED, GREEN and WHITE in turn.

FIRING: row 22 has `FIRING` (DARK) and, at column 8, the crank degrees between firings in firing order as their
shortest repeating run: `EVEN 120` when all are equal, the cycle's degrees for a single cylinder (`360`), otherwise the
run joined by `-` (`90-270`). Under it one cycle (`cycleRevolutions` × 360°) runs across x 8–151 on a grey baseline on
y 199, with a grey tick 3 pixels deep every 90°. Each cylinder has a tick two pixels wide at its phase, in its bank's
color from y 192, and WHITE from y 188 while lit. The engine's place is a dotted grey cursor from y 186. Row 26 has `0`,
`CRANK DEG` at column 5 and the cycle's degrees right-aligned in columns 16–18 (DARK), and row 28 has `IDLE x1/30`
(DARK).

EXHAUST: row 14 has `EXHAUST` at column 20 (DARK), the exhaust's form at column 28 (WHITE) and `cm` at column 37
(DARK). The form counts the flows stage by stage: the cylinders, then the junctions at each depth reached from them
along pipes from `from` to `to`, then the open ends leaving the last. Neighbouring stages with equal counts are one
stage, and a single stage is written twice, so the vehicles read `12-2`, `6-2-1`, `8-2-1-2`, `4-1`, `4-2-1`, `2-1` and
`1-1`. Row 29 has `PIPE` at column 20 (DARK) and each pipe's length in centimetres, joined by `/`, at column 25 (WHITE).

The exhaust is drawn at the player depth's 40 px/m, true to its lengths
(`src/view/exhaust-diagram.ts`; the screen makes it once for each engine sound):

- Primaries take a text row each from row 16, grouped by junction in junction order with an empty row between groups,
  in cylinder order, each running along its row's middle. Each primary's length in centimetres stands right-aligned in
  columns 20–22 (WHITE).
- Every cylinder-side junction stands where the longest primary ends (x 192 plus that primary's length), at the middle
  of its primaries' rows. Each primary starts its own length before it, so unequal primaries show as staggered starts.
- A pipe runs level from its `from` junction, then upright to its `to` junction. A downstream junction stands at the
  farthest end of the pipes into it, at the mean height of the junctions they come from. A junction is placed once
  every pipe into it from a placed junction has been, or, in a loop, once any has. Junctions the cylinders do not
  reach this way are not drawn.
- Open ends run level for their length, those leaving one junction 6 pixels apart about its height, each ending in a
  grey outlet 5 pixels wide.
- Pipes are tubes 3 pixels thick: the middle in the pipe's color, the side above or left halfway to white, the side
  below or right at half brightness. Primaries are in their bank's color and the other pipes grey.
- Each cylinder is a block of 6×7 pixels just before its primary, DIM edged in its bank's color, WHITE while lit.
- Each firing sends a pulse, a WHITE dot with a grey trail, from the primary's start along every way to an open end,
  splitting at each branch, never through a junction twice. It is gone past the end.

#### CHASSIS

Row 3 heads the side view with `SIDE` (WHITE) at column 22, and `CG` and `W/BASE` (YELLOW) at columns 27 and 30. The
side view is drawn in the graph's box at 30 px/m, the vehicle facing right with its wheelbase centred on x
248 and the ground a grey line across x 176–319 on y 80:

- each wheel a disc of its rolling radius standing on the ground at its axle, a WHITE ring a pixel wide filled DIM,
  with a WHITE hub;
- the wheelbase a YELLOW dimension line 3 pixels under the ground, with ticks 5 pixels deep at the axles;
- the centre of mass, `frontAxle` behind the front axle at `desiredCgHeight`, a disc of radius 3.5 quartered YELLOW
  and black on a dotted YELLOW plumb line to the ground;
- the overall length and height a dotted DARK box from the ground. The listing holds no overhangs, so the length is
  centred on the wheelbase.

Under each wheel on row 11 its static load share is written, `R60%` and `F40%` (WHITE; the front share is
`rearAxle / wheelbase`), each label's four columns centred under its wheel, moved apart evenly to keep a column between
them, and kept within columns 22–39.

The left column starts with `GEAR` at column 0, `RATIO` at column 5 and `KMH` at column 16 on row 14, then one row per
gear: its label (`1ST` …) at column 0, its ratio at column 4, a bar and its road speed at redline in km/h right-aligned
in columns 16–18. The road speed is `redlineRpm` turning the driven wheels' rolling radius through the gear and the final
drive; the driven wheels are the front if `frontDriveTorqueFraction` exceeds one half, otherwise the rear. The bars share
one scale for every vehicle, 0 to 320 km/h across x 72–127, on y 2–5 of the gear's row: DIM up to the previous gear's
speed and YELLOW from there to the gear's own, a saw tooth over the gears; a speed beyond 320 km/h stops at x 127. `FINAL` (`finalDriveRatio`) and `DRIVE` (`RWD`, `FWD`, or `AWD 47/53`
from `frontDriveTorqueFraction` 0, 1 or otherwise its front/rear percent) follow as values, then one empty row and the
listing's `ERA` (`period`), `MKT` (`physicsAnchor.market`) and `SPEC` (each `selectedSpecification` entry in turn), with
labels at column 0 and values at column 5, in upper case. Each is wrapped to lines of at most 14 characters by words:
the text breaks at spaces and after each slash, a line takes words while they fit, a space between them except after a
slash, and further lines have no label. Lines past row 29 are not shown.

| Rows 14–28, right           | Example       | Source                            |
| --------------------------- | ------------- | --------------------------------- |
| `LENGTH`, `WIDTH`, `HEIGHT` | `4485mm`      | overall dimensions                |
| `W/BASE`                    | `2550mm`      | `frontAxle + rearAxle`            |
| `MASS`                      | `1625kg`      | `mass`                            |
| `CG HT`                     | `478mm`       | `desiredCgHeight`                 |
| `YAW I`, `PITCH I`          | `3100kgm2`    | inertias                          |
| `TIRE`                      | `632/662mm`   | twice the front/rear wheel radius |
| `WHL I`                     | `2.7/3.4kgm2` | front/rear wheel inertia          |
| `RIDE`                      | `1.75/1.85Hz` | front/rear ride frequency         |
| `DAMPING`                   | `0.38/0.40`   | front/rear damping ratio          |
| `TRAVEL`                    | `290/290mm`   | front/rear `qTravel`              |
| `BRAKE`                     | `4800/3000Nm` | front/rear brake torque maxima    |
| `DRAG`                      | `0.44kg/m`    | `quadraticDrag`                   |

## Selection and URL parameters

The composition root reads the delivered [course index](content-and-gameplay.md#course-index) once and passes it to
the selection screens, in its order and with its display names.

A run is requested as a typed run request ([`run-request.ts`](../src/shell/run-request.ts)): a class run names a series,
one of its classes and its session (RACE or TIME ATTACK), and the class names the course and gives the laps, field and
traffic; a FREE PLAY run names the course and its rival count, rival pool, traffic and laps. Both carry the vehicle,
the player's color and the track. There is no front-end mode: the one translation of a run request into the rules it is requested with
(`rulesRequest`) gives a class run the rules its session names and FREE PLAY its options. No class setting is looked
up from a course. The run's assembly admits those rules against the course, its class and the vehicle catalog
and derives its run configuration (`compileRunConfiguration`); a request from the URL, the selection
screens or RETRY passes the same admission, and a DEV rebuild's request too.

The URL is read once at startup, as a DEV and test entry point; selections inside the page never rewrite it. A URL
with `series` and `class`, or with `course`, builds that run's request and starts the run directly: its PRE-RACE card leaves as soon as the run is assembled, with no minimum stay and no black before READY, so a headless check reaches its first frame; a URL with
neither starts at TITLE. The player's color is the player record's color for the vehicle. A URL request that cannot be built fails
like an assembly.

Run parameters are case-sensitive:

| Parameter | Meaning                                                                                                               |
| --------- | --------------------------------------------------------------------------------------------------------------------- |
| `series`  | Series ID; with `class`, names a run of that class                                                                    |
| `class`   | Class ID within `series`                                                                                              |
| `session` | A class run's session: `race` (RACE, the default) or `attack` (TIME ATTACK); other values, or one with `course`, fail |
| `course`  | Lowercase delivered course ID; names a FREE PLAY run on it                                                            |
| `vehicle` | Exact catalog vehicle ID for FREE PLAY, such as `TESTAROSSA`; absent uses preset                                      |
| `rivals`  | FREE PLAY count parsed with `Number`; integer 0–15 within grid capacity; absent uses preset                           |
| `laps`    | FREE PLAY count parsed with `Number`; positive integer within course limit                                            |
| `pool`    | FREE PLAY rival pool: `ALL`, `CARS` or `BIKES`; absent uses the player vehicle's form; other values fail              |
| `traffic` | FREE PLAY traffic: `OFF`, `LOW` or `HIGH`; absent is `OFF`; other values fail                                         |

RACE runs the named [class](content-and-gameplay.md#series-documents): the class's first vehicle, its entries and
laps and its course, with the checkpoint clock, ignoring individual query overrides; TIME ATTACK runs the class's first
vehicle alone on its course. A URL naming a course runs FREE PLAY: `session` with `course` is an error, as are
`course` together with `series` or `class`, `series` without `class` or the reverse, and an unknown class, course or
session. FREE PLAY exposes those settings and has no clock. There is no `mode` or `clock` parameter, so an old value
of either is other URL data and ignored. Invalid vehicle, numeric or course/run
combinations produce an error. FREE PLAY's defaults are the first vehicle in selection order, no rivals and one lap. A class whose course's reference times are missing from delivery
fails to load.

```text
?series=trial&class=a
?series=tsukuba-clubman&class=911-cup&session=attack
?course=tsukuba&vehicle=TESTAROSSA&rivals=15&laps=1
```

A run started from the URL drives without a gesture; sound still requires an eligible browser gesture.

`workbench=<commit>` is the workbench's run ([Development](development.md#workbench)). The page loader imports that
commit's build instead of `version.txt`'s, and the page takes its delivery from the workbench page that opened it
(`window.opener`, same origin) instead of fetching `../delivery/`. That delivery passes the same manifest admission and
digest checks; only the transport differs. Without that workbench page, or without its answer within 10 s, the page
fails to start and says why. With `dev=1`, the DEV toggle reads `WORKBENCH BUILD`. A delivery without measured
products admits only runs that need none: no time limit and no pace schedule, its drivers driving the centre lane
for the racing line.

## Driving input

Left/right arrows steer, Up or Z accelerates, and Down or X brakes. These are the only keyboard
controls; DEV selections and manual recovery use DEV buttons. A standard-mapping gamepad steers with the
left stick X axis or the D-pad, accelerates with RT or A and brakes with LT or B; other gamepad mappings are
ignored.

`InputManager` is the one driving-input authority. It owns the steering and pedal arbiters, suspension,
the lifecycle resets and the final sample; the window and document it listens to are passed in. Adapters
publish through it and keep only their local held state.

Every publisher is an owner: an object whose identity is its reference and which carries its apply method.
Each driving key is one `RATE_LIMITED` owner; each touch role's pointer is a `DIRECT` owner created on press.
Each connected gamepad has one owner per control: the stick X axis, RT and LT are `DIRECT`; D-pad left,
D-pad right, A and B are `RATE_LIMITED`. Owners of one gamepad arbitrate like any others.
An owner publishes with `set` and ends its publication with `release`; an owner that sets zero remains held
as a neutral authority. Keys set on keydown and release on keyup. The pedal arbiter's winner is the most
recently activated held owner: a held owner keeps its activation order when it sets again, a new owner takes
the next order, and releasing the winner reveals the next-most-recent held owner. Steering follows the latest
owner to set; releasing it returns to neutral and never revives a superseded owner. Boolean pedal requests
and numeric requests in `[0,1]` have the same canonical meaning.

Each fixed step, `sample()` takes the step's gamepad reading and then builds one `DrivingInput` from the
arbiters: each apply method is the winning owner's, or `RATE_LIMITED` without an owner. The latest final
sample is a published read-only observation (`lastSample`). The screen host
suspends input whenever driving stops; suspension resets the arbiters, the adapters' held state and the final
sample to neutral, and while suspended the manager accepts no publication. Window blur, which stops no screen, resets input the same way without suspending it.

The page reads each device once and shares the reading: one touch-pointer reader listens to the window's pointer
events and passes touch pointers to its consumers, and one gamepad reader (`GamepadReading`) reads the connected
standard-mapping gamepads once per fixed step, as the screen host takes the step's menu commands; menu commands and
driving input both use that step's reading.
A press on a UI element marked `data-driving-input="ignore"` starts no touch pointer.
Because the whole viewport is the touch area, the page keeps no browser touch gesture of its own outside those
elements (the DEV panel, the corner buttons and the DEV status line with its Retry). The style sheet turns off text
selection, the long-press callout, tap highlights, panning and zooming on `html`, `body` and `#app`; next to the
touch-pointer reader, one capturing non-passive listener prevents `selectstart`, `contextmenu`, `gesturestart`,
`touchstart` and `touchmove`, which stops long-press selection and menus where CSS alone does not (iOS Safari). The
DEV panel's scroll body pans vertically. Touch pointers starting inside
the touch area control driving. The shell supplies the touch area as a client rectangle; it is currently the whole
viewport. The area's left half selects steering; the midpoint and right half select pedals. Each pointer's
role and origin are fixed until release, with at most one steering and one pedal pointer at once.

Invariant: while no finger touches the screen, no touch pointer is active and no touch input owner exists. The
touch-pointer reader alone ends pointers, and every consumer (driving and menu touch) receives the same end, once per
pointer. A pointer begins on its press with pointer capture (UI marked `ignore` takes none), so its `pointerup`
(lifted) or `pointercancel` reaches the page; `lostpointercapture` also cancels it. Facts that do not depend on a lost
event end every active pointer: a `touchend` whose `touches` is empty (lifted), and a `touchcancel` whose `touches` is
empty, window blur and a hidden page (cancelled). A lifted menu touch commands by its path; a cancelled one commands nothing. Moves of
untracked pointers and a second finger on a role already held are ignored, as before.

Horizontal displacement maps steering to `[-1,1]`. Upward displacement supplies throttle and downward
displacement supplies brake. Full scale is 64 CSS pixels, with larger displacement saturated.
Touching the origin owns neutral input. Held touch supplies direct analog displacement; release uses
the ordinary actuator release behavior.

The touch adapter publishes each role's observation (origin in client CSS pixels, current request and
vector length), or null while the role is inactive. The shell draws the origin/vector indicators and their
labels from it every presented frame, so release, cancellation, suspension and blur clear them at the next frame.

Stick X magnitude and RT/LT values at or below 0.15 are rest; above it they rescale linearly from 0.15..1
to 0..1, keeping the stick's sign. Gamepad owners publish only on change, since the latest steering owner
wins: a button sets when pressed and releases when released; an analog control sets when it leaves rest,
sets again only when its rescaled value differs from its last publication, and releases at rest. After a
manager reset or a new connection, each control publishes nothing until it has been seen at rest, as a held
key is ignored until pressed again. A disconnected gamepad, or one no longer returned by polling, releases
all its owners. Without the Gamepad API, polling does nothing.

## Menu input

Menu commands are UP, DOWN, LEFT, RIGHT, CONFIRM, BACK and PAUSE. They have one authority, separate from driving
input; it shares the page's touch-pointer reader and gamepad reading. The screen host sets the input route: while
driving, driving input takes the devices and only PAUSE reaches the current screen; in a menu (any screen that is not
live, a paused or finished run included) driving input is suspended and every command arrives; while the page is
hidden nothing does. Commands arrive at the current screen before each fixed step.

Each screen says what a command did: moved the cursor or changed a value, confirmed something, or went back; a command
that does nothing (CONFIRM on an item without an action, BACK on TITLE, a value at its end, a single-item move) says
nothing. The screen host is the one place that turns that into a sound: `menu-move`, `menu-confirm`, `menu-entry` (the
CONFIRM that starts the run, SELECT MUSIC's), `menu-deny` (CONFIRM on a DARK item) or `menu-back`
([Audio](audio.md#sound-effects)). Every list screen answers through the menu part, and SELECT VEHICLE (a vehicle or
color change moves) and the run screen too: PAUSE that opens the PAUSE menu confirms, and PAUSE or BACK that closes it
goes back. The CONFIRM on TITLE that starts the audio is not heard, since the audio is not yet running.

- **Keyboard:** the arrows give the directions, Enter and Z CONFIRM and X BACK; Escape is BACK in a menu and PAUSE while
  driving. Z and X command only on the menu route; while driving they stay the accelerator and the brake.
  Keys follow the operating system's repeat, except that a repeated Escape does not pause.
- **Gamepad** (standard mapping): the D-pad and the left stick beyond half deflection give the directions, A CONFIRM
  and B BACK; Start is PAUSE while driving and CONFIRM in a menu. A control commands once, on its press, and never
  repeats; one held while the route changes, or when its gamepad connects or reconnects, commands nothing until
  released and pressed again.
- **Touch:** in a menu, a touch in the left half of the touch area that moves at least `TOUCH_FLICK_DISTANCE_PX`
  (24 CSS px) is a flick in its larger axis's direction, and a touch in the right half that moves less is a tap,
  CONFIRM, decided when the finger lifts; a cancelled touch commands nothing. Touches never repeat. Two small buttons sit in the screen's corners, inside the safe area: BACK top left in
  a menu and PAUSE top right while driving. They appear once touch has been used, and a press on them starts no
  driving or menu touch.

The same press never reaches both authorities. Suspension resets driving input, and a gamepad control needs rest and
a key needs a new press before driving input accepts it, so the Enter, A or touch that resumes a run drives nothing.
While a run screen runs, PAUSE pauses; while it is paused, PAUSE or BACK resumes.

## HUD

The run screen writes the product HUD into the text layer after the scene is drawn and before the text layer is
drawn ([product](product.md#9-hud)). The HUD and RESULT read only race facts ([race time and
events](content-and-gameplay.md#race-time-and-events)), typed as the race's `RaceFacts`, which carry no controls or
mechanics, and the HUD the player's competitor observation and the camera's observation of its yaw limit; the race
gives the STAGE and the LAP. It is one table of
independent elements, each with its condition and what it writes; the table alone decides which show, from the
Run's rules (the clock, the course type) and race facts (two or more competitors ranked, the next gate's rank limit, the stage
rival ahead). Traffic is not counted: POS and every other count read the competitors only. The run's sound effects read
the same race facts, their crossing events included ([Audio](audio.md#sound-effects)), and nothing else of the race. Another table holds every element's place in the 40×30 grid, so moving one changes only its numbers.

| Rows  | Elements                                                                                                                                                                    |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1–2   | Ornate large: TIME and the remaining seconds (rounded up) beside it, race time, POS n/m, STAGE n                                                                            |
| 4–5   | Ornate small: LAP x/y (LAP x without a lap count) and the lap's time, BEST and the best lap (`-'--"---` before one), PASS n until the ending, TARGET nM                     |
| 7     | Ornate small: `EXTEND +12"0` (seconds and tenths), SUNSET, while TIME is SUNSET after an extension                                                                          |
| 7     | Ornate small: TIME ATTACK with a record, the difference from the record run for 2 s after each compared crossing                                                            |
| 8–9   | Ornate large RED, columns 16–22: `BRAKE!!` while the race shows it and BRAKE SIGN is ON, blinking ([BRAKE!!](#brake))                                                       |
| 10–12 | Ornate small WHITE, before GO: the course's display name, the session (or FREE PLAY) and, in TIME ATTACK when one exists, `RECORD 1'23"456 <VEHICLE>` (its vehicle's model) |
| 13–14 | Three 2×2-tile signal lamps: before GO the race's lamps lit are LAMP_RED and the rest LAMP_OFF; all LAMP_GREEN for 1 s after GO                                             |
| 16–19 | Ornate large, from the ending until RESULT: GOAL (SUNSET), or GAME OVER (RED) with TIME UP or RANK OUT (RED) below it                                                       |
| 13–16 | While the camera is held at its yaw limit: the 4×4-tile road arrow, a triple chevron, steady, in columns 0–3 or 36–39                                                       |
| 26–28 | Columns 1–6: the speed, three 2×3-tile italic segment digits; columns 7–10 of row 28: `km/h` (normal font)                                                                  |
| 23–28 | Columns 17–22: the steering picture (6×6 tiles)                                                                                                                             |
| 26–28 | Columns 26–35: the tachometer; columns 37–38: the gear, a segment digit                                                                                                     |
| 29    | Meters 6 tiles (48 pixels) long: steering in columns 17–22, throttle in 26–31 and brake in 33–38                                                                            |

Rows 1–2 hold each label with its value beside it: TIME in columns 1–4 with the seconds right-aligned to column 8,
race time from column 11, POS from column 21 with its value from column 25, and STAGE from column 31 with its number
right-aligned to column 38. Their styles: TIME and the seconds WHITE, the seconds RED under 10 s and SUNSET after an
extension; race time, POS and STAGE SUNSET. LAP and its time are SUNSET; BEST, PASS and TARGET WHITE; the difference
from the record run GREEN or RED. A two-row line keeps its anchor and first row, and the line under it moves down a
row: GAME OVER's cause stands on rows 18–19. RESULT's title (GOAL or GAME OVER) and its RANK line are the ornate
large font in the race's styles (the rank SUNSET); its other lines, its items, the menus and the other screens keep
the normal font.

The steering picture, in the middle of the frame's width, is the one the player vehicle's listing names
([Image assets](image-assets.md#text-tiles)) and shows where the front wheel actually points: the player
observation's front road-wheel angle to the body times the HUD's steering ratio for the vehicle's form, 18 for a car
(its steering wheel) and 1 for a bike (its top bridge), one value per form. The HUD draws the picture's upright frame
plus `round(angle/step)`, so turning right turns it clockwise: a steering wheel's 32 frames make a full turn and a
turn past it repeats them; a top bridge's 33 frames stop at ±22.5°. The picture is never rotated at run time and may
lie over the player's vehicle.

The three meters read the player's observation and are 4 pixels high, 2 pixels clear of their tiles' top and bottom,
without labels, end caps or marks; a meter of `f` fills `round(f*48)` pixels. The steering meter, under the picture,
grows from its centre (between columns 19 and 20) toward the steering actuator's side, `round(|steering|*24)` of its 24
pixels a side, white, so a key's rate-limited input grows to full and an analog input follows it. The throttle meter
fills to the throttle actuator in green and the brake meter to the brake actuator in yellow; the part the protections
take away shows red at the fill's end: the throttle beyond the powertrain's effective opening, and the brake beyond its
share applied at the station whose share is smaller (`frontBrakeApplied`, `rearBrakeApplied`).

The speed shows `round(speed*3.6)` km/h, held at 999, in three italic segment digits right-aligned in SEG_VFD; a
leading digit the speed does not reach shows all its segments unlit. The gear is one segment digit in SEG_VFD, and in
SEG_YELLOW after a shift; unlit segments are a dark trace of the lit color. The tachometer's 26 italic bars, 2 pixels wide
with a pixel's gap, stand on row 28's bottom ([Image assets](image-assets.md#text-tiles)); bar `i` (from 0) lights once
the engine speed reaches `(i+1)/26 * 1.10 * redlineRpm`, the full scale being 110 % of the player vehicle's redline,
and is unlit (its color's unlit shades) otherwise. Every bar from the first at or above redline is red, the 4 before
it yellow and the rest green; every bar is red while the limiter cuts fuel. A tile's bars take at most two colors, so a
tile where green meets yellow or yellow meets red takes the TACH_GREEN_YELLOW or TACH_YELLOW_RED palette and the
pattern that splits its bars there; the others take TACH_GREEN, TACH_YELLOW or TACH_RED.

Rows 8 to 22, the road and the player's vehicle, hold only these passing notices and the road arrow. The road arrow
reads only the camera's `heldAtLimit` (1 when its yaw source has turned right beyond the limit, -1 left, 0 within
it), for FACING and MOVING alike: held on the right, the road goes on to the left, so the left arrow stands in columns
0–3, and held on the left the right arrow stands in columns 36–39. Its row is fixed, clear of the road and the player's vehicle,
and does not follow the DEV horizon row. While the PAUSE menu or RESULT is
over the frame, the notices in rows 7 to 19 are not drawn; the upper and lower rows stay.

Durations come from race facts, never from wall-clock time or HUD timers, so a pause stops them: TIME is SUNSET
while race time is at most 2 s after an extension's race time, and RED otherwise under 10 s remaining; a finished
lap's time holds for 2 s of race time after the lap, in the lap time's SUNSET; the gear is SEG_YELLOW for 0.3 s of the
race's simulation time (every advanced step, READY and after the ending included) after the shift the race stamped.
The signal lamps are green for 1 s of race time after GO. The difference from the record run shows for 2 s of race
time after each crossing, GREEN when faster (`-0"312`) and RED otherwise (`+0"312`; `-1'02"312` from one minute on).
These lengths sit in one constant.

### BRAKE!!

The race publishes `brakeSign` ([`src/race/brake-sign.ts`](../src/race/brake-sign.ts)): the player's vehicle planned
as a driver ([Drivers](content-and-gameplay.md#drivers)) at utilization 0.9 with its own mechanics, without a vehicle
ahead or a capacity correction, along the path that keeps its route lateral (read in steps of 0.25 m; at a fork before
the lock, that lateral lies in the exit interval holding it, whose road the plan reads). After each step the sign shows
once the player's speed exceeds the plan's speed at the station `0.5 s × speed` ahead, and hides once the speed falls
below 97 % of that. It is off unless the player's own input drives the vehicle while the run is RUNNING (so never
before GO, after the ending or in the attract demo) and off while neither tire is loaded (in flight). The plan costs one
more driver per step. The HUD writes `BRAKE!!` centred on rows 8–9 (columns 16–22) in the ornate large font, RED,
shown for 8 fixed steps and hidden for 8 (`floor(step / 8)` even), while BRAKE SIGN is ON.

## Performance HUD

The DEV performance HUD (with `dev=1`), a line at the top of the page, displays FPS, maximum CPU frame time, maximum fixed-step time and maximum frame interval.
The first frame reports immediately, then approximately every half second.

The ground detail shows the reporting window's maximum visible active Strip count,
the compiled course maximum and active limit, the latest frame's scene-render CPU milliseconds,
and the maximum over the most recent 120 rendered frames (`max120`), then the pixels the latest frame's walls painted. The renderer reads no clock: its
caller times the scene render. The active count includes
hidden declarations in each contributing source slab; it is a maximum, not a sum over pixels or
Sections. These observations are measurements, not device-capacity verdicts.

CPU time adds fixed-step work since the preceding render to rendering/display work. Frame
interval is elapsed time between completed frames. FPS and frame/step/interval maxima reset each
reporting window.

With `dev=1` a second line under the performance line at the top of the page, the audio timing HUD
([`audio-timing-hud.ts`](../src/shell/audio-timing-hud.ts)), shows the AudioContext's timing every half second, to
find when engine sound starts to lag: its state and sample rate, `baseLatency`, `outputLatency`, the stamp lag
(`currentTime` less `getOutputTimestamp().contextTime`), the stamp's age, the clock deficit (wall time less context
time since the context last started running), the state changes to suspended and to running it has seen, and the
worklets' render blocks with those that took longer than their own duration and the longest, and the recordings that
could not be decoded ([Audio](audio.md#recording-playback)). The worklets time their
blocks only after this HUD asks them to ([Audio](audio.md#mix-and-lifetime)). The latest reading is also the element's
`data-reading` JSON. These are observations, not device verdicts.

## Player record

[`src/shell/player-record.ts`](../src/shell/player-record.ts) owns the browser's one player record: a
localStorage entry `super-outride-player` holding `{ "version": 7, "settings": { … }, "records": { … } }`. The
composition root opens it once at page load; shell controls read the admitted settings and records and change them only
through the record.

| Setting            | Shape and default                                                                                                                                                                               |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `vehicleColors`    | Selected color by vehicle ID, the player's run color; default `{}`                                                                                                                              |
| `volumes`          | `master`, `music` and `effects` as integer percentages 0–100; default 35, 100 and 100                                                                                                           |
| `latestSelections` | Latest selection by selection-screen key; default `{}`                                                                                                                                          |
| `cameras`          | `car` and `bike`, each `FACING` or `MOVING`: what the camera yaw follows for that form; default `FACING` and `MOVING` (`DEFAULT_CAMERAS`)                                                       |
| `steering`         | `car` and `bike`, each `{ "reference": "front" or "center", "utilization": 1, 0.95 or 0.9 }`: the player's steering rule for that form; default `center` and 0.95 for both (`DEFAULT_STEERING`) |
| `brakeSign`        | Whether the HUD shows BRAKE!!; default `true` (ON)                                                                                                                                              |

`records` holds `timeAttack`, an object of TIME ATTACK records by key, one table per class. A key is the JSON array
`[series ID, class ID, goal]`, made in one place, the goal being the FINISH gate the run reached (a circuit has one);
JSON array keys cannot collide however IDs are spelled. A record's value is `timeMs` (on a CIRCUIT the fastest lap,
else the fastest completion time), `splitsMs` (the record run's times at its gates in crossing order: from GO, or on a
CIRCUIT from the start of the record lap, its last the lap's own time), `vehicleId` (the vehicle it was set with),
`courseSha256` and `vehicleSha256`.

Times are whole milliseconds by the one rule displays use (`raceMilliseconds`: floored after the display tolerance).
`courseSha256` is the course's build identity and `vehicleSha256` the identity of the record's vehicle's delivered
definitions (`runVehicleSha256`), the identities time budgets carry; a record counts only while both are current,
the latter checked against the identity of `vehicleId` whichever vehicle the run drives. The player record publishes
its records read-only down to every record and its splits, loaded or set alike.

[`src/shell/run-records.ts`](../src/shell/run-records.ts) alone decides what a run compares with and records. Only a
TIME ATTACK run records (`createRunRecords`); RACE, FREE PLAY, the attract demo and a DEV-tuned rebuilt
Run record and compare nothing, and a run requested by URL records as one requested from the menus. On a CIRCUIT
each completed lap is judged against the class's record when it completes: a faster lap is saved at once, with its
gate times within the lap, and `new-record` sounds then, so ending the run, or leaving it any other way, never loses
it. On a LINEAR or BRANCH course the run is judged once, at its finish, against the record of the goal reached, and a
faster time is saved with its gate times. An equal time keeps the earlier record; a stored record whose identities are
not current counts as none and is replaced. While driven, each of the player's crossings is compared with the record
run's crossing of the same index (within the lap on a CIRCUIT) against the record as it stands, once the goal the run
can reach is known: from the start on a course with one goal, else once the race has decided the route
(`routeLinks`), whose last FINISH is the goal; the records read that goal only at a crossing of the player's on a course
with several goals. READY, the PRE-RACE card and RESULT show the record as it stood before
the run: SELECT SESSION, READY and the PRE-RACE card the class's fastest at any goal (`shownRecord`, the one record
of a course with one goal), RESULT the record at the goal the run was judged at. The judgement and the HUD's record belong to the run they were made for.

Loading admits version 7 alone, with exactly these keys and value types; there are no migration readers. An absent,
unreadable, unparsable or other-version
record, or one whose settings are malformed, starts from the defaults and is replaced by the next save. A record
entry whose key or value is malformed is dropped alone. Each settings or records change saves the whole record at
once. Where localStorage is missing or reading or writing it throws, the record lives in memory for the page and the
game continues. SETTINGS and the DEV volume stepper ([Sound controls](#sound-controls)) save volumes, SETTINGS saves
the cameras, steering and BRAKE SIGN, and a run reads its vehicle form's camera and steering rule and BRAKE SIGN when it
is assembled. The race
applies the player's steering rule only while the player's own input reaches the player's vehicle; whenever a driver
drives it (the run driver on request, the takeover after GOAL) it drives by that driver's rule, switching at once.
Steering is no record condition: it changes no record key or identity, and a run with any steering choice is a
product run that records; SELECT VEHICLE
saves colors, the selection screens save their latest selections, a run reaching GOAL saves records and CLEAR RECORDS
empties them. A run reads the player's vehicle color from `vehicleColors`, falling back to the vehicle's default
color when the record has none or names a color its sprite set lacks. DEV tuning and DEV sound settings are not
stored.

## DEV controls

Only a URL with `dev=1` builds DEV: the composition root reads it once and then builds the DEV panel from its
template in the page, its controls (sound, camera, RESULT delay and each run's
driving tuning, export and RECOVER), the performance and audio timing HUDs, and the bike lean indicator drawn
over the frame. Without it
none of these exist, in the DOM or as listeners, and DEV series and courses in no series are not offered. The touch
indicators and the corner buttons are not DEV. The DEV toggle sits left of the PAUSE corner button.

DEV is an initially closed disclosure overlay. Its body scrolls within the safe viewport without
resizing the game. UI pointer starts stay outside driving input. Keydown is isolated, so keys typed
in DEV controls never reach driving input, while keyup can release an already-held driving key.
Escape closes the panel and returns focus to its summary. DEV has no keyboard shortcuts.
The vehicle is chosen on SELECT VEHICLE; there is no vehicle selection during a run. Driving tuning, camera, sound and recovery controls remain available. The camera controls choose the
camera definition's horizon row and height frequency for the session, unsaved
([Calibration](calibration.md#camera-settings)). RECOVER requests the race's manual recovery of the player vehicle when the active composition
permits it: in a course run, only while it is running and the race clock is RUNNING. The shell supplies
the player's input only; it reads the run vehicle for HUD and export and each competitor's vehicle for sound, and the race owns all mechanics.

Driving tuning is grouped as STEERING, PEDALS, TIRES F/R, POWERTRAIN, RIVAL PACE, BODY CONTACT and ASSISTS. Each value uses a
minus/value/plus control in the driving definition's units, wrapping at range endpoints; STEERING holds the rack bound
(M) and the traversal time (ACT), and ASSISTS toggles wheel slip protection. RIVAL PACE drives no vehicle in a tuned run, which has no rivals: it takes effect once the exported definition
is adopted as content. BODY CONTACT is the rebuilt run's own: its walls, course limits and objects push with the
tuned values at once. An admitted adjustment rebuilds the
Run through the same assembly as startup: a new run vehicle with the same vehicle definition and materials
drives the tuned definition, in a FREE PLAY run with no rivals, the current lap count, no time limit, start speed 0
and no time budgets, on a new Route runtime from the grid. It enters READY → GO at once, the HUD naming its own rules (FREE PLAY). The shell, its input, audio, camera device and DEV controls persist, and the shell keeps the
tuned definition for further adjustments and export. Reloading the page restores the product run. EXPORT saves the tuned
driving definition (`default.json`) and the run vehicle's definition (`<vehicle id>.json`) as browser downloads in the saved layout;
its `audio/default.json` button (titled Export sound settings) saves the DEV sound panels' current values as the
[audio document](audio.md#audio-document) (`default.json`);
[Calibration](calibration.md#vehicle-settings) describes adopting them as content. There is one camera; what its yaw
follows is the player's setting, not a DEV selection.
[Calibration](calibration.md#vehicle-settings) lists values, units and ranges.

### Sound controls

A mouse press, touch/pen release, touchend or eligible keyboard gesture resumes sound, and starts it during a run the
URL started ([Audio](audio.md#mix-and-lifetime)).
Touch pointerdown alone does not activate it. SOUND START starts or resumes; SOUND ON/OFF then mutes
or unmutes. SOUND RETRY offers a new initialization after failure. SOUND UNAVAILABLE indicates that
the browser lacks the required audio support while gameplay remains usable.

MASTER, ENG and TIRE independently control the complete output, engine output and tire output.
MASTER is the player record's MASTER volume, which the stepper shows and changes through the one volume path;
ENG and TIRE are DEV mix values.
A zero gain silences that output while DSP continues. R and Q buttons (`tire-component-rolling`, `tire-component-friction`) independently switch rolling
and friction output for both axles. Their labels and pressed states show ON/OFF, and unavailable audio
disables them. [Tire audio](tire-audio.md#settings-replacement) owns faded output and replacement semantics.

The shell's reusable DOM controls ([`src/shell/controls/`](../src/shell/controls/)) build these sound controls
(`mountSoundControls`); the audio lifecycle only syncs their values to the scene and owns the AudioContext.
DEV sound settings come in groups, each with its own reset to the audio document's values; a page reload
restores those values and new runs preserve them:

- **ENGINE** (`engine-sound-settings`): fifteen minus/plus controls for the exhaust settings; buttons stop at limits.
- **MIX** (`mix-sound-settings`): the master compressor.
- **TIMING** (`timing-sound-settings`): the control time constants.
- **RIVAL** (`rival-sound-settings`): rival audible distance, reference distance, pan floor and reassignment time.
- **UNIFIED** (`tire-sound-settings`): the friction-model settings.
- **SCRAPE** (`scrape-sound-settings`): the walls' scraping, the same items and panel as UNIFIED.
- **IMPACT** (`impact-sound-settings`): each counterpart's impact reference work.
- **ROLLING** (`rolling-sound-settings`): the rolling-model settings.

MIX, TIMING, RIVAL, UNIFIED, SCRAPE, IMPACT and ROLLING use sliders with the acoustic ranges. Engine sound rows show cycle, cylinder count, idle/redline, firing phases,
collector grouping and path lengths. [Calibration](calibration.md) lists the numeric settings.
