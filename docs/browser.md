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

The browser accumulates nonnegative elapsed time capped at 0.25 s per animation callback (an author value bounding the
catch-up after a suspended tab to 15 steps). Simulation
uses fixed 1/60 s steps (`SIM_DT`): the frame loop runs one race `advance(input)` per whole step in the accumulated
time, passing no step length, and the fractional remainder carries forward. One render follows the completed
steps, including callbacks with no simulation step; it reads the race's competitor observations, which
hold the values of the latest completed step. There is one frame loop; it runs while the page is visible and
advances and draws the current screen. Each start begins a fresh clock, so stopped real time never enters the
simulation. Loading leaves the race clock stopped; an assembled run starts after the PRE-RACE card and the black transition.
Loading never stops the frame loop: a run's course compiles in [slices](architecture.md#course-loading) of 8 ms of
work (`LOADING_SLICE_MILLISECONDS`), each followed by a yield to the event loop through a message channel, so the frame
loop and input run between them and TITLE, the attract demo and the PRE-RACE card keep drawing while a course loads. The
page's own startup reads once the files decided from the manifest before reading starts
([startup files](../src/shell/startup-files.ts)): the text tiles, then every file of the kinds the page reads whole
(materials, engine sounds, vehicle sprite sets, vehicle and driving documents, the course index, screen pictures, music
documents, series, FREE PLAY rules, the front end, the contact explosion and the puffs with their pictures, audio
settings, surface sounds and engine loudness); courses, their products and recordings are read after it and are not
among them. Its progress is the share of those files' bytes read (K, 2026-11-13): the sizes the manifest gives of the
files read, fetched, verified against their digests, decoded and admitted, over the sizes of them all. A file counts
once read whole; nothing counts within one. Once the frame stands, every file left is fetched at once in reading order, and the startup's work runs in
the same 8 ms slices: each file's decoding and its admission are units of work, and a vehicle sprite set's admission
pauses between its pictures. The frame stands as soon as the text tiles are read, and the startup stands on LOADING
([Screens](#screens)).
Every run assembly, a DEV tuning rebuild included, picks a new run seed from `crypto.getRandomValues`;
the composition root is the only place that draws randomness.

The driving composition root owns two lifetimes. The page lifetime is created once: delivered content and
catalogs (materials, surface sounds, vehicle and driving definitions, series, text tiles, audio settings), the
player record, the text layer, race sprites, the browser devices (canvas, framebuffer, input,
audio), the screen host with its frame loop and, with `dev=1`, the performance HUD and the page's DEV
controls (sound, camera, RESULT delay, SLOW DOWN). The frame, its presentation, the input and the screen host stand as
soon as the text tiles are read and need no vehicle or sound catalog; the audio lifetime, the one owner of sound, is
assembled once its catalogs are read and joins the devices, taking the route the host last set. The run lifetime holds the selected course, its run
settings, the field's run vehicles, racing lines, time budgets and pace schedule, the run, scene and race,
the player's sprites, the camera rig and lifecycle and, with `dev=1`, the course's performance-HUD
values and the run's DEV controls (driving tuning, export, RECOVER). Page devices hold no run: each frame passes the
run's observations to them.

The page is loaded once. A URL that names a course, the selection screens and RETRY request a run, and every request
passes the one assembly, after which the run starts once the PRE-RACE card leaves; a DEV tuning rebuild replaces the run inside its run. Assembly is
asynchronous and one runs at a time: a request made during an assembly is ignored. The page holds one course: a
request first disposes of the current run, removing the listeners and DOM it added, then loads the next. A new run
starts from delivered content, so DEV driving tuning and its displayed values return to the delivered definition.
Sound, input, fullscreen, the DEV sound settings, the DEV camera adjustment, the
RESULT delay and the SLOW DOWN utilizations belong to the page and persist. A failed assembly leaves no run and shows LOAD FAILED; its reason goes to
the console and, with `dev=1`, outside the frame with Retry.

## Screens

LOADING is the page's first screen: it stands once the text tiles and the picture of the controls
([`controls`](image-assets.md#screen-pictures)) are read. It appears at full brightness at once, from the page's black.
Over the picture it writes `LOADING <n>%` centred in YELLOW on row 29, the last (y 232–239), which the picture leaves
free (K, 2026-11-13: its own row, not PRESS START's 28, which the picture's divider reaches), and nothing else,
without blinking: `<n>` is the share of the startup's bytes read
([Display and scheduling](#display-and-scheduling)), whole and never falling. It has no minimum time. While it stands,
menu commands do nothing and nothing sounds. Once it has drawn 100% it gives way by line thinning to TITLE, or to the
PRE-RACE card of a run the URL names. A startup that fails once the frame can write text shows LOAD FAILED in the frame,
its RETRY and BACK reloading the page; its reason goes to the console.

The page always has one current screen, owned by the screen host. A screen advances one fixed step, draws one
frame (the framebuffer and the [text layer](architecture.md#text-layer)) and says whether it is live: whether the
player's driving input and sound run on it. A screen may also say that it drives a vehicle the player does not drive:
SELECT VEHICLE's ENGINE page revving its engine, which no row shows until the vehicle's card is designed. The host runs the frame loop while the page is visible and stops it
while the document is hidden or after `pagehide`; only the host watches document visibility and page hiding, and a
page restored from the back/forward cache reloads. Driving input is live exactly while the page is
visible, no transition runs and the current screen is live; a vehicle is driven while the page is visible, no
transition runs and the current screen is live or drives a vehicle, and the host reads both after every fixed step.
It runs one symmetric procedure when either changes (the route: driving, menu or off while hidden): driving clears
input suspension; otherwise input is suspended (which resets it). The same procedure tells audio whether the page is
visible and whether a vehicle is driven ([Audio](audio.md#mix-and-lifetime)).

The PRE-RACE card stands while a run is assembled, doubling as its loading screen; `prerace` sounds as it appears. For
a class (RACE and TIME ATTACK) it shows the series image with rows 16–29 (y 128–240) at quarter brightness; FREE PLAY
shows it on black. On row 16, above the map, it writes the course's display name from the course index (the [course
texts'](content-and-gameplay.md#course-texts)) centred in WHITE.
Inside x 8–136, y 136–232 it draws the course map the [course index](content-and-gameplay.md#course-index) delivers,
north up by the course's bearing: the route's centreline (one lap of a circuit, else the route from the entry, each fork
taking its first exit) 3 pixels wide in white with a 1-pixel gray core, scaled to fit and centred, a 1×9-pixel YELLOW
bar across the start line (the entry Section's origin), a 3×3 GREEN dot at each checkpoint gate on that route and a
YELLOW arrowhead outlined in black, 14 pixels along the path from the start, pointing the way the route runs; the map is
drawn into the frame, not as text. From column 17 it writes
the class title (YELLOW; `FREE PLAY` in FREE PLAY) on row 18, in full: longer than its 23 columns it breaks at the
last space that fits onto row 19; a class run's session (WHITE) on row 20,
`<length>KM  <n> LAPS`
on row 21 (the route's length to 0.001 km, laps only on a circuit with a lap count), `<field> CARS|BIKES  START P<slot>`
on row 23 and `BEST <time>` (GREEN) on row 25, the record READY would show, `--'--"--` when there is none (TIME ATTACK
only).
On
row 28, columns 17–37, a progress bar 4 pixels high in the row's middle fills YELLOW over dark gray as the run loads:
the course's files to 70 % (by their bytes, each counted once fetched whole), its compilation to 80 % (Section by Section), the run to 90 %, the assembled run
to 100 %. The title, course
name, map, length and laps show at once; the field, start slot and record once the run is prepared. The
card stays at least 2.5 s (counted in fixed steps) and until the run is assembled; then the black transition leads to
READY. After a failed assembly the
LOAD FAILED screen shows `LOAD FAILED` in red with RETRY, which requests the same run again, and BACK, which returns to
the row that requested it: SELECT VEHICLE, or TITLE for a run the URL or a DEV control requested. The
reason is not drawn, since it may hold characters without text tiles: it goes to the console and, with `dev=1`, to a
status element outside the frame, which also shows `Loading course…` while a run loads. Without `dev=1` nothing shows
outside the frame, except when the page cannot start before the frame can write text (its manifest or text tiles
cannot be read): then its reason and a Retry that reloads the page show outside the frame. The run screen holds the run and its state: running, paused (manual PAUSE)
or finished (the run reached RESULT). The run runs only while neither holds: paused and finished advance no race,
and driving input and sound stop, so no touch indicator is drawn. Every
frame still draws the scene. While paused, the PAUSE menu is drawn over the stopped frame, which is first halved to
half brightness while the text layer, the HUD included, stays at full brightness: the title `PAUSED` and
RESUME, RETRY and QUIT. RESUME, BACK and PAUSE resume; RETRY requests the same run again, which passes the PRE-RACE card with a
new seed; QUIT ends a running run without a finish (the race's `endable`), which shows RESULT at once, and otherwise
ends the run and shows TITLE.

The screens outside the rows use one menu part, a carousel: PAUSE, RESULT and LOAD FAILED. It writes a title,
information lines and one item, centred in the text grid without shortening; the title and any information lines keep
one row each, and a menu taller than the 30 rows is a `RangeError`. The item is YELLOW, with WHITE `◀` and `▶` four
columns either side when there are several, or, for an item longer than 32 characters, at the first and last columns
of the row under it; LEFT and RIGHT change it, wrapping at both ends, CONFIRM does its action and BACK leaves.

A change of screen outside the rows goes through black: the frame darkens to black over 8 fixed steps, with its RGB555
channels scaled by the remaining eighths, and the next screen brightens from black over 8 more; the page starts from
black. A screen may declare that it thins away (LOADING): a change from it goes instead by line thinning over 16 fixed
steps ([Image assets](image-assets.md#background-transitions)), the next screen current at once and presented on a
growing share of lines, the frame the screen presented last held on the rest. During a transition no screen advances,
the route is the menu's, and menu commands are dropped. The screen host owns the transition and the shell presents each
frame at the host's brightness and share of lines; the lines' order and their merging are
[line thinning's](../src/view/line-thinning.ts), which the rows and every other change by thinning use. A screen declares the wallpaper it
stands on (a series' picture: the rows of a series' world and the PRE-RACE card); a change between two screens standing
on the same wallpaper, asked for while no transition runs, is immediate, and the next frame draws the next screen at
full brightness. So a series' SELECT VEHICLE gives way to its PRE-RACE card at once, while FREE PLAY's SELECT VEHICLE →
PRE-RACE card, the PRE-RACE card → READY and RESULT → a row go through black, until they are redesigned (K,
2026-11-08: line thinning alone; [NEXT](NEXT.md#card-ui)).

### Card rows

The selection is rows of cards on one screen ([product](product.md#6-flow-and-screens);
[card rows](../src/shell/card-rows.ts)), which owns every change between rows; the screen host's black serves only
the changes outside them. The rows ([selection flow](../src/shell/selection-flow.ts)):

- **TITLE:** `PRESS START` blinks in YELLOW, centred on row 28 (shown 32 fixed steps, hidden 16). CONFIRM goes to MAIN
  MENU; the first is the user gesture that enables sound and requests fullscreen of the page where the browser allows
  them (a refusal is ignored, and a gamepad press is not a gesture the browser accepts), and it sounds `press-start`.
  BACK does nothing.
- **MAIN MENU:** SERIES, FREE PLAY and SETTINGS. SERIES with no series shown, or FREE PLAY with no course offered, is
  dimmed. BACK returns to TITLE.
- **SERIES:** SELECT SERIES, then in the series' world SELECT CLASS (the series' classes) and SELECT VEHICLE (the
  class's vehicles). Choosing another class clears the chosen vehicle.
- **FREE PLAY:** RULES, one list card of RIVALS, POOL, TRAFFIC and LAPS at the place of a series (its rules), whose
  CONFIRM on any entry goes on; SELECT COURSE, every course offered in the
  [course index's](content-and-gameplay.md#course-index) order, as courses apart from any series (K, 2026-11-11); and
  SELECT VEHICLE (every catalog vehicle), in the main world.
- **SETTINGS:** one list card of the settings (below); CONTROLS opens a row of its one card, and CLEAR RECORDS a row of
  NO and YES.

A row is shown even with one card. BACK returns to the row before, CONFIRM on SELECT VEHICLE requests the run
(`menu-entry`), which shows the PRE-RACE card and then starts. Each row starts from the current choice, else the player
record's latest choice (keys `menu`, `series`, `class`, `course` and `vehicle`), else its first card; each CONFIRM saves
its choice as the latest. The courses FREE PLAY offers are those the offered series run, and with `dev=1` every
delivered course.

A card is 28×21 tiles (224×168 pixels) at 1:1. At rest the card in focus stands at x 48 (column 6) and y 32 (row 4),
four rows clear above and below it over the path's row, which balances it in the frame (K, 2026-11-11), its
neighbours 29 tiles (232 pixels) away on either side, the tile between and everything outside the cards showing the
world behind them; cards cast no shadow (K, 2026-11-08). SELECT CLASS, SELECT COURSE and SELECT VEHICLE show page
cards (below). Every other row's card shows, on its style's ground ([card styles](#card-styles)), its name in the
ornate large font, in two lines when it is longer than 26 characters, and one line in WHITE (K, 2026-11-09):

| Row            | Name                        | Line                                                              |
| -------------- | --------------------------- | ----------------------------------------------------------------- |
| MAIN MENU      | SERIES, FREE PLAY, SETTINGS | none                                                              |
| RULES          | RULES, a list card          | RIVALS, POOL, TRAFFIC and LAPS with their values                  |
| SETTINGS       | SETTINGS, a list card       | each setting with its value (none for CONTROLS and CLEAR RECORDS) |
| CONTROLS       | CONTROLS                    | none                                                              |
| CLEAR RECORDS? | NO, YES                     | `CLEAR RECORDS?`                                                  |

A list card (K, 2026-11-11: settings are completed within one card) writes its name centred on rows 1–2 and an entry
a row from row 5: the label from column 1 in DARK and the value centred between columns 18 and 26 in WHITE, the chosen
entry's label and value in YELLOW with WHITE `◀` and `▶` at those columns. UP and DOWN choose the entry, stopping at
either end, LEFT and RIGHT change its value (RIGHT the next or more), CONFIRM does the entry's action or else the
card's, and BACK the row's; the chosen entry, not the card, rests in focus, and its path names it.

A page card is read before it is chosen: a course on SELECT CLASS and SELECT COURSE, a vehicle on SELECT VEHICLE (K,
2026-11-11: the card UI as before; [card face](../src/shell/card-face.ts)). It is packed with what it is about and
draws no box around its parts (K, 2026-11-12), and it says its subject alone: a course's card and a vehicle's card are
the same card in every series and in FREE PLAY, with nothing of a series' rules, its laps, field, traffic, clock or
vehicles (K, 2026-11-12). A page gives its style its parts ([card styles](../src/shell/card-styles.ts)): a title and a
tag, up to eight facts and up to eight more, each a label, a value with its unit and a note, a line for a choice, a
picture, a chart and words; the style lays them out and leaves room for the picture and the chart, each on a flat
ground.

A course's page ([course page](../src/shell/course-page.ts)), from the [course
index](content-and-gameplay.md#course-index):

- **The title and tag:** its name, and `CIRCUIT` or `POINT TO POINT`.
- **The facts:** `LENGTH` (`<km>KM`, to the metre), `CLIMB` (its highest point over its lowest), `GRADE` (the steepest,
  `MAX`), `CORNERS` (with those to the left and right, `L<n> R<n>`), `STRAIGHT` (the longest), `RADIUS` (the tightest,
  `MIN`), `HIGHEST` (over its start) and, on a circuit, `LOWEST` (under its start) or else `STAGES` (one more than the
  checkpoint gates on its route). Heights are whole metres from 100 m and to a tenth below.
- **The picture:** its map, drawn as the PRE-RACE card draws it, its arrowhead outlined in the ground.
- **The chart,** a strip under the name `PROFILE`: the road's height from its start to its end, filled to the strip's
  foot under a WHITE line; a climb of 40 m or more stands as tall as the strip, and a smaller one in proportion.
- **The words:** its description in WHITE, broken at spaces.

A vehicle's page ([vehicle card](../src/shell/vehicle-card.ts)):

- **The title and tag:** its manufacturer and model, and its period.
- **The facts** (`ENGINE`): `ENGINE` with its displacement, `POWER` and `TORQUE` with their engine speeds, their labels
  in their curves' colors as the chart's legend on a dark ground, `REDLINE`, `MASS`, `P/W` (power to mass), `GEARS`
  with the final drive, and `DRIVE` (`RWD`, `FWD`, or `AWD` with its front and rear shares).
- **More** (`BODY`): `YEAR`, `TYPE`, `LENGTH`, `WIDTH`, `HEIGHT`, `W/BASE`, `WEIGHT` (the shares on the front and rear
  wheels) and `TOP` (the road speed at redline in top gear).
- **The choice:** `COLOR` with the color's name in YELLOW, between WHITE `▲` and `▼` where UP and DOWN change it.
- **The picture:** the vehicle in the color shown, its yaw image 40 of 64 (seen from ahead and its right), at the one
  scale, from the player depth down by 1 % at a time, at which every yaw image fits the room less 2 pixels all round.
- **The chart,** a block: the engine's power (RED) and torque (YELLOW) over 20 % to 110 % of its redline, each scaled
  to its maximum, from the larger of idle and 20 % of redline to the fuel cut's entry, over DARK grid lines every 10 %
  of redline and every quarter of the height, lighter axes and the redline dashed RED.

While a vehicle's card rests in focus, its picture turns from the still one, a yaw image every 6 fixed steps (a turn in
6.4 s), and its engine revs as the catalog's ENGINE page revved it: its model, as a run builds it, held and revved from
idle by the free-revving throttle (idle for 1.5 s, full for 1 s, closed for 1.5 s and full to 6 s, again and again;
the second 6 s repeat), its speed a WHITE upright line on the graph with a 3×3 mark on each curve in the curve's color.
Its engine is heard, as the player's in a run, over the series' music (K, 2026-11-12): the rows' screen drives a
vehicle while such a card rests in focus (`vehicleDriven`) and gives the audio the engine's observation each fixed
step.

Words taller than their box rise while their card rests in focus, within it: held at their top for 90 fixed steps, a
pixel every 10 steps until their last line shows, held there for 180, then at their top again (K, 2026-11-12: for
now); every other card shows their top. A board would write the lines' tiles anew at each pixel. A page of several
faces shows each for 360 fixed steps while it rests in focus and turns to the next by line thinning over 16
([Image assets](image-assets.md#background-transitions)); any other card shows its first. Nothing on a card leaves
it: text that would is an error.

### Card styles

While the cards' design is tried (K, 2026-11-12: several designs, built and switched in the game), the cards have
three styles ([card styles](../src/shell/card-styles.ts)), PROGRAM first. SETTINGS' CARD DESIGN steps through them, as
the C key does on any row; the choice lasts for the page and no record keeps it. The one K chooses stays, and the
others, the setting and the key go.

| Style     | Plain cards                                     | Page cards                                                                                                                                                                                                                                                                              |
| --------- | ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PROGRAM   | A navy ground, three racing stripes             | The tag on three stripes under the SUNSET title; the picture and chart on fields a shade lighter; the facts in ranged columns, labels in the small print; a course's words on the lowest six lines; a vehicle's more facts under its facts and its choice on the last row. One face.    |
| PIT BOARD | A black ground under a red band, two stripes    | The title in the ornate WHITE style and the tag on the red band; the facts in black on a signal-yellow board, without the legend's colors; the rest as PROGRAM. One face.                                                                                                               |
| DATA      | A dark ground over a row of cells in two shades | The picture as large as the card allows; the facts on a board of 4×2 cells in two shades, a label and its unit in the small print over each value; faces that turn, named on tabs ranged right of the tag: the facts, the more facts, and `ABOUT` with the words over a course's chart. |

A fact stands on one line, its label in the small print and its value and unit in the normal font with its note in
the small print, or in a cell; a value too long for its room is written in the small print instead. The small print
([small print](../src/shell/small-print.ts)) is 3×5 glyphs in a 4×8 cell, two to a tile's width: capitals, digits and
`. , - / : ' % + ( ) & ! ?` (K, 2026-11-12: a 4×8 font, drawn here). It is painted as pixels for now and becomes a
text-tile font with the chosen design.

Every row but TITLE shows its path on the frame's last row (K, 2026-11-11), as a folder's: from SUPER OUTRIDE, the
names chosen down to the row and the card in focus (a list card's chosen entry), each in full and joined by `>` (`SUPER
OUTRIDE>SERIES>ARCADE TRIBUTE - OUTRUN>OUTRUN A>FERRARI TESTAROSSA`), in WHITE but the card in focus in YELLOW, over a
plain band in the cards' ground. A path longer than the row's 40 columns is cut on its left and begins with `..` in
DARK, the card in focus always whole; a font of 4×8 pixels may hold it all later, two characters to a tile written by
the CPU. A row's path goes with it: it thins in and out with the row and stays through the zoom into a series.

A card that offers nothing is dimmed, painted with its palettes at half brightness, and denies CONFIRM (`menu-deny`).
SELECT SERIES shows the series pictures of the front end selection, 40×30 tiles, on the one scaled plane at 0.7, the
picture in focus covering a card's place exactly, 41 tiles apart on the plane (229.6 pixels on the frame), with no
text over them; a series without a document yet shows its picture and denies CONFIRM, and one that offers no class is
dimmed.

LEFT and RIGHT choose a card: a row of three or more wraps at both ends; in a row of one or two a move past an end
shakes the row, which changes nothing and sounds nothing. UP and DOWN change the value of the card in focus (a vehicle's
color) and do nothing on a card without one; a list card takes them all (above). Moving sounds `menu-move`
(`series-slide` on SELECT SERIES), changing a value `menu-move`, going on `menu-confirm` and going back `menu-back`; a
command that does nothing says nothing. A card may say what happens while it rests in focus (`focus`): the screen calls
it when the card comes to rest and its returned function once the focus or the row leaves it. SETTINGS uses it for its
audition, the one form of [playing a track](audio.md#music) from its start, looped: the audition stops when the focus or
the row leaves, and a track still decoding when it leaves never sounds.

The rows stand in a world. The main world is the attract demo behind the main picture, and until the main picture is
made the title logo (36×14 tiles) centred at y 16 over it: TITLE, MAIN MENU, SELECT SERIES, FREE PLAY's rows and
SETTINGS stand in it. A series' world is its picture, at 1:1 on the scaled plane: its SELECT CLASS and SELECT VEHICLE
stand in it. Within a world one row gives way to the next by line thinning, the
[background transitions'](image-assets.md#background-transitions) one rule and one implementation
([line thinning](../src/view/line-thinning.ts)): at share p, round(240p) of the 240 lines show the next row, taken in
the order of their numbers' 8 bits reversed. Choosing a series zooms its picture on the scaled plane from 0.7 to 1,
about the one fixed point that keeps it on the card's place at 0.7 and on the frame at 1 (x 160, y 106⅔), then shows
the picture alone, then thins in SELECT CLASS; BACK from SELECT CLASS thins it away to the picture, which shrinks back
into SELECT SERIES. Only the series pictures are scaled, each frame pixel taking the plane's point nearest its centre;
the cards are drawn at 1:1 and never scaled, no color is mixed or halved but by a palette at half brightness, and the
lines' choice of picture is a per-line table a late-1980s board holds. Motion, in fixed steps (K, 2026-11-09, the demo
K saw, "for now"):

| Motion                   | Steps | Course                                                |
| ------------------------ | ----: | ----------------------------------------------------- |
| A slide to the next card |    10 | cubic ease-out, `1 − (1 − t)³`                        |
| A shake at a row's end   |    12 | the row moves −direction × 0.06 × its pitch × sin(πt) |
| Line thinning            |    16 | share p = t                                           |
| Zoom in or out           |    24 | cubic ease-in-out between 0.7 and 1                   |
| The picture alone        |    30 | after the zoom in, before SELECT CLASS thins in       |

Positions in motion are rounded to whole pixels. A command during a motion waits, the last one alone, and acts when the
motion ends. The attract demo runs from TITLE until a run starts (K, 2026-11-08) and pauses while a series' picture
covers the frame. Its series, class, vehicle and color are written on TITLE alone (K, 2026-11-09), in WHITE on rows 21,
22, 24 and 25, right-aligned to column 38, and its ticker runs on row 27 (below).

The [attract demo](../src/shell/attract-demo.ts) is the one owner of the demo runs and their turns. It runs the RACE
sessions of the product classes (never DEV ones) in series and class order, looping, a turn each. It holds at most two
runs, the shown class's and the next class's, each assembled as a run with no player input (the player's run driver
drives the class's first vehicle in its first color), with no HUD, no sound and no record, and touches no page state
(driving input, DEV displays). Each holds its course's compilation, which held runs of one course share; a compilation
no held run uses is released. A run is stepped in the race's fixed step, through the frame loop as a run is, only while
its turn is shown. A turn lasts until its run ends (the player's GOAL or GAME OVER) and has stood its RESULT delay
without RESULT, or 300 s, whichever comes first; it thins in over the frame the turn before left (the first over black)
over 16 fixed steps. When a turn ends its run is released, so a class shown again starts a new run with the next seed.
The first class loads behind the logo over black and its turn begins once it is loaded; each turn has the next class's
run loaded (loading only, standing in READY), so no later turn waits on a load. A class that cannot load is passed
over; with no product class the main world stays black. A run's start ends the shown turn and releases its run;
returning resumes with the next class's turn. The runs are released when the page is left.

A demo run is filmed as its [director](../src/shell/demo-director.ts) takes it (K, 2026-11-12), its shots cut by line
thinning over 16 fixed steps from the frame the cut left:

| Shot   | Camera                                                                                                                                                          | Ends                                                                                     |
| ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| INTRO  | Travels the road's centre at 100 km/h, 4 m over it, from the front of the grid, over a course scene of its own with no vehicle, each fork taking its first exit | When the course's description has run once on the ticker, or 50 m short of a route's end |
| START  | Stands 10 m behind the rearmost vehicle on the grid, 3 m over the road's centre, through READY and GO                                                           | When the shown vehicle is 150 m away                                                     |
| FIXED  | Stands 30 m ahead of the shown vehicle, 3.5 m toward the road's centre from its line, 1.5 m over the road; the vehicle passes it and goes on                    | At 150 m the next point ahead of it; after 15 s, at its next point                       |
| PASSED | Starts 25 m ahead of it, 2.5 m toward the centre, 1.2 m over the road, travelling at 70 % of its speed; it overtakes the camera                                 | When it is 120 m away, or after 15 s                                                     |
| LEFT   | Starts 6 m right behind it, 2 m over the road, travelling at 80 % of its speed; it draws away                                                                   | At 60 m back right behind it; after 15 s                                                 |
| CHASE  | The player's camera                                                                                                                                             | After 15 s                                                                               |
| GOAL   | Stands 15 m before the line it finishes at, 3.5 m toward the centre, 1.5 m over the road, from when it has 150 m to go and is still 20 m short of the camera    | With the turn                                                                            |

After START the race's shots take turns in the order FIXED, PASSED, LEFT, CHASE; GOAL takes over any of them. A camera
of the director's stands on the route by itself ([route camera](../src/view/route-camera.ts)): over the road's height
at its station, level, looking at the road 40 m ahead along its line (the intro's and START's the road's centre, the
others the shown vehicle's), within 45° of the road's heading where it stands; its sky is its own place's. Every shot
but CHASE draws the player as any other vehicle, seen from where the camera stands. A camera the run's resident route
no longer holds behind it stands at the route's first resident station, and the shot that needs it ends. A run waits
in READY while its intro is shown.

The ticker runs the turn's words along row 27 from the right edge, a character every 3 fixed steps, until their last
has left at the left, then again after four spaces: the course's description over the intro, the series' over the
race (K, 2026-11-12; a vehicle's description joins it once vehicles have one).

Music ([product](product.md#13-music-and-sound-effects)): on SELECT SERIES, once the row has rested 30 fixed steps, the
series in focus plays its title track from its start, looped; a move fades it out over 0.25 s, and so does BACK to MAIN
MENU. Entering the series' world, and returning to SELECT SERIES on the same series, it plays on; it fades out over the
black transition into READY, and CHANGE VEHICLE and SELECT from RESULT play it from its start again in the world.
TITLE, MAIN MENU, FREE PLAY's rows and SETTINGS are silent, but for the SETTINGS audition while the MUSIC card is in
focus. A run from the rows plays its course's first race track ([Course sounds](content-and-gameplay.md#course-sounds)).

SETTINGS' entries are MASTER, MUSIC and EFFECTS with their volumes, which LEFT and RIGHT change in steps of 5 within
0–100 (to the adjacent multiple of 5, stopping at the ends), CAR CAMERA and BIKE CAMERA (FACING or MOVING; [camera
yaw](architecture.md#camera-and-fixed-metric)) for runs with a vehicle of that form, CAR STEERING and BIKE STEERING
(FRONT or CENTER), CAR STEERING USE and BIKE STEERING USE (100%, 95% and 90%; [steering
rule](vehicle-physics.md#actuators-and-steering)), SLOW DOWN (ON or OFF; [SLOW DOWN](#slow-down)) and CARD DESIGN
([card styles](#card-styles)), the choices wrapping, then CONTROLS and CLEAR RECORDS. RIGHT is the next choice or more, LEFT the one before or less; CONFIRM on a
value does nothing. CONTROLS' card is to show the keyboard, touch and gamepad controls once its contents are designed.
CLEAR RECORDS? offers NO (first) and YES: YES empties the records, saves the player record with its settings unchanged
and returns to SETTINGS, as NO and BACK do. The player record is the one owner of every volume. Each change, from
SETTINGS or the DEV MASTER stepper, goes through the audio lifetime's one path (`setVolume`): the record keeps it, the
stepper shows MASTER, and every volume applies at once; LEFT and RIGHT on EFFECTS sound `menu-move` at the new volume,
which is its audition. While the MUSIC entry rests chosen, the player record's latest track (else the first track) plays
as an audition, so its volume is set by ear.

SELECT VEHICLE's color is chosen in its card: UP and DOWN step through the vehicle's four colors, wrapping, from the color
its run would give the player (one rule with the race): the player record's color for the vehicle, else its default;
in a class with fixed colors its entry's color, which UP and DOWN leave. CONFIRM saves a chosen color in the player
record.

RULES' values start from the player record's latest choice (keys `rivals`, `pool`, `traffic` and `laps`), else 0,
ALL, OFF and 1, and each change is saved there: RIVALS 0–15 and LAPS from 1 to the most laps of any course FREE PLAY
offers, both stopping at their ends, and POOL (ALL, CARS or BIKES) and TRAFFIC (OFF, LOW or HIGH), wrapping. Choosing a
course or a vehicle changes no rule (K, 2026-11-09). The run SELECT VEHICLE requests cuts them to its course: as many
rivals as RIVALS and the course's grid holds (`gridRivalCapacity`), and on a CIRCUIT as many laps as LAPS and the
course's `maxLaps` allow, one lap elsewhere; the PRE-RACE card shows what it takes. RACE takes its class's traffic.

DEV series and courses in no series are offered only with `dev=1`, which the composition root reads once.

CREST SPEED, a DEV setting (not persisted), lays each original's course with the [crests rule](original-road-data.md#crests)
at NONE, 170, 200, 230 or 260 km/h as it loads: the course delivered with its crest trials takes their Sections'
profiles at that speed (`withCrestTrial`), its document's identity unchanged; a product course and TSUKUBA have none and
load as saved. NONE, the default, loads every course as saved. A choice applies from the next course loaded.

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
a new seed), CHANGE VEHICLE (SELECT VEHICLE with the run's selection), SELECT (the course's row: SELECT CLASS in the
series' world, or SELECT COURSE in the course's group) and TITLE (K, 2026-11-09); the rows above are rebuilt from the
run's request, for a run the URL or a DEV control requested too, and a request whose rows are not offered leads to
TITLE. Leaving the run ends it. A run rebuilt by DEV tuning restarts
the run, clearing `paused` and `finished`, so it drives at once. Neither a run's start nor a DEV rebuild resets driving
input: it is the page's, neutral until the run screen is live (the screen host suspends it on every other route), and a
rebuilt run, live at once, reads it as it stands, so a key held through the rebuild stays held.

### SELECT VEHICLE

SELECT VEHICLE's catalog pages wait for the vehicle's card ([NEXT](NEXT.md#card-ui)): until its contents are designed
no row shows them, and their [modules](../src/shell/vehicle-screen.ts) stand ready for it. SELECT VEHICLE is a catalog
page per vehicle on the 40×30 text grid, its values read from the compiled vehicle and its listing as the simulation
holds them. Rows 0–11 stand on every page; below them three pages, ENGINE, DRIVETRAIN and
CHASSIS, take turns. `src/shell/vehicle-page.ts` holds every position, scale and time named here.

| Rows  | Columns | Content                                                                                                                                               |
| ----- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0     | 13–26   | `SELECT VEHICLE` (WHITE)                                                                                                                              |
| 0     | –38     | `◀ n/N ▶`, the vehicle among the offered vehicles, ending at column 38 whatever its digits (DARK)                                                     |
| 2     | 1–39    | manufacturer and model (YELLOW)                                                                                                                       |
| 3     | 1–20    | `physicsAnchor.modelYear`, two spaces and the identifier's official label in upper case (DARK)                                                        |
| 3     | 22–39   | the page's headings over its diagram                                                                                                                  |
| 4–10  | 0–19    | the turning picture                                                                                                                                   |
| 4–11  | 22–39   | the page's diagram                                                                                                                                    |
| 11    | 1–21    | the color's display name, `▲ GUARDS RED 3/4 ▼` (WHITE), within 1–21 by the 13-character name and a set's four colors; with fixed colors its name only |
| 12    | 1–      | the page tabs                                                                                                                                         |
| 12    | 30–37   | `PAGE n/3` (DARK)                                                                                                                                     |
| 14–29 | 0–39    | the page's values                                                                                                                                     |

The picture turns through the yaw images, one every six fixed steps, in the shown color. Each vehicle has one scale,
the largest from the player depth down (in steps of 1 %) at which every yaw image, standing at one anchor, fits columns
0–19 by rows 4–10 (160×56 pixels), and that anchor centres the images in the box.

Each page stays 360 fixed steps (6 s), then the next follows, ENGINE after CHASSIS; no key turns the pages and no
black stands between them. A change of vehicle returns to ENGINE at the start of its time; a change of color keeps the page and its time.
The tabs on row 12 name the pages from column 1, two columns apart, the shown page WHITE and the others DARK. Under the
shown page's name, on y 103, its time line runs DIM across the name's width, YELLOW from the left over the share of
the page's time gone; a DIM rule crosses the frame on y 106. Over a wallpaper the frame stands at quarter brightness,
the graph's box (x 172–319, y 22–97) and the tabs (y 96–111) at an eighth and the values (y 112–239) at a sixteenth, so
the text reads over the picture.

Values are written with labels DARK and values WHITE: the left column's labels at column 0 and values at column 8, the
right column's at columns 20 and 28. Power and torque are integers from 10 up and have one decimal below (`8.8kW`);
RPM, millimetres, kilograms, inertias and brake torques are integers; ratios have three decimals below 10 and two from 10 up (`14.47`), wheel inertias one,
and ride frequency, damping and drag two. A left value ends by column 18 and a right value by column 39.

#### ENGINE

Row 3 heads the graph with `TORQUE` (YELLOW) at column 22 and `POWER` (RED) at column 31. The graph is drawn in pixels
under the text, in x 176–319 and y 32–95. Its horizontal axis runs from 20 % to 110 % of redline, 16 pixels for each
10 %, with a grid line every 10 % (the last clipped at x 319); its vertical axis from 0 on row 95 to the top grid line
on row 35, with grid lines at 25, 50, 75 and 100 %. The grid is DARK, the axes (x 176, y 95) a lighter grey, and the
redline a RED line dashed every second pixel. The
torque curve (YELLOW) and the power curve (RED) are each scaled so its maximum touches the top grid line; they are a
pixel wide, joined vertically between columns, and run from the larger of idle and 20 % of redline to the fuel-cut
entry, `fuelCutEnterRedlineRatio` times redline, following the curve above redline
([Vehicle physics](vehicle-physics.md#wheel-and-powertrain)). The graph has no axis numbers.

On ENGINE the shown vehicle's engine revs standing still: its model, as a run builds it, is held as in a race's READY
([Vehicle physics](vehicle-physics.md#wheel-and-powertrain)), so its inertia, friction, fuel cut and throttle actuator are
the run's, and the throttle asked of it follows the page's time, the same for every vehicle:

| Page time | Throttle |
| --------- | -------- |
| 0–1.5 s   | 0 (idle) |
| 1.5–2.5 s | full     |
| 2.5–4 s   | 0        |
| 4–6 s     | full     |

Its sound is the player's engine voice, sounding the vehicle's engine sound from the engine's observation as a run's
player's does, while the title track plays on unchanged; the tires' voice receives the vehicle at rest. The vehicle
sound is live on ENGINE alone ([Audio](audio.md#mix-and-lifetime)): entering it opens the live gate, and leaving it, a
transition or a hidden page closes the gate with the silence fade, so the change to DRIVETRAIN, at the limiter, fades
out. Each time ENGINE is shown, a change of vehicle included, the engine starts again at idle; a change of color
does not touch it, and no other page runs it. While its speed is at or above 20 % of redline a WHITE upright line
stands at that speed on the horizontal axis, from the top grid line to the bottom row, with a mark of 3×3 pixels where
it crosses each curve, in the curve's color; they are drawn over the curves and under the text.

| Rows 14–20, left  | Example      | Source                                                    |
| ----------------- | ------------ | --------------------------------------------------------- |
| `ENGINE`          | `F12 4943cc` | listing `metadata.engine`, `displacementCc`               |
| `CYCLE`           | `4-STROKE`   | `cycle`                                                   |
| `POWER`           | `287kW/6300` | the curve's maximum of `rpm*torque` (point D) and its RPM |
| `TORQUE`          | `490Nm/4500` | the curve's maximum (point C) and its RPM                 |
| `IDLE`, `REDLINE` | `1000rpm`    | `idleRpm`, `redlineRpm`                                   |
| `CUT`             | `7140rpm`    | the fuel-cut entry, `fuelCutEnterRedlineRatio` × redline  |

The firing moves in slow motion, 30 times slower than real: the engine turns at `idleRpm`, a cycle taking
`cycleRevolutions` × 60 × 30 / `idleRpm` seconds, counted in fixed steps since the vehicle was shown, from the cycle's
start. A cylinder fires at its `firingPhases` entry and stays lit for 4 % of a cycle after it. Its bank is its
primary's collector (`exhaustCollectors`: the junction its primary enters, a log manifold's ports one collector),
colored by collector number YELLOW, RED, GREEN and WHITE in turn.

FIRING: row 22 has `FIRING` (DARK) and, at column 8, the crank degrees between firings in firing order as their
shortest repeating run: `EVEN 120` when all are equal, the cycle's degrees for a single cylinder (`360`), otherwise the
run joined by `-` (`90-270`). Under it one cycle (`cycleRevolutions` × 360°) runs across x 8–151 on a grey baseline on
y 199, with a grey tick 3 pixels deep every 90°. Each cylinder has a tick two pixels wide at its phase, in its bank's
color from y 192, and WHITE from y 188 while lit. The engine's place is a dotted grey cursor from y 186. Row 26 has `0`,
`CRANK DEG` at column 5 and the cycle's degrees right-aligned in columns 16–18 (DARK), and row 28 has `IDLE x1/30`
(DARK).

EXHAUST: row 14 has `EXHAUST` at column 20 (DARK) and the exhaust's form at column 28 (WHITE). The form counts the
flows stage by stage: the cylinders, their collectors, then the junctions at each depth reached from them along pipes
from `from` to `to`, then the open ends leaving the last. Neighbouring stages with equal counts are one stage, and a
single stage is written twice, so the vehicles read `12-4-2-4`, `6-2-1`, `8-2-1-2-4`, `4-1`, `4-2-1-2`, `4-2-1`, `2-2`,
`2-1` and `1-1`. Row 15 heads the primaries' values, `cm` at column 21 and `mm` at column 24 (DARK). Row 28 has `VALVE`
at column 20 (DARK) and, at column 26, the valve's diameter to a tenth of a millimetre and its open crank angle,
`open` × `cycleRevolutions` × 360 (`39.6mm 280DEG`, WHITE). Row 29 has the scale marks: `1m` at column 20 (DARK) and a
metre as a WHITE line with end ticks from x 184, and `50mm` at column 28 (DARK) and a 50 mm pipe a metre long from
x 264.

Every vehicle's exhaust is drawn at one length scale and one diameter scale (`src/view/exhaust-diagram.ts`; the
screen makes the diagram once for each engine sound): the largest whole pixels per metre at which the catalog's
farthest-reaching exhaust, from its leftmost valve to its farthest open end, fits between x 216 and x 314 (24 px/m for
GOLF GTI 16V's 4.03 m), and a thickness proportional to the diameter, 100 pixels per metre (a 60 mm pipe 6 pixels,
none under 1):

- Every tube runs level for its own length; junctions' bars join tubes at different heights and carry no length. Along
  pipes between junctions, `to` stands its pipe's length after `from` (a loop's closing pipe as it falls), and each
  group of junctions the cylinders reach shifts so its leftmost valve, junction or open end stands at x 216. Junctions
  the cylinders do not reach are not drawn.
- Primaries take a text row each from row 16, each running along its row's middle from its valve to its junction, so
  unequal primaries show as staggered valves. Their order is that of their junctions going upstream from each last
  junction (one no pipe leaves for another junction), pipes into a junction before its own primaries, so a merge's
  primaries stand together and a log manifold's ports step down along it. Each primary's length in centimetres stands
  right-aligned in columns 20–22 and its diameter in millimetres in columns 23–25 (WHITE).
- A junction stands at the mean height of its primaries, or else of the junctions whose pipes enter it. The pipes
  leaving a junction for open ends, or for junctions that pipe alone enters and no primary, stand side by side about
  its height, each as wide as what it carries, 2 pixels apart; any other pipe runs at its `from` junction's height. An
  open end is the end of its pipe.
- Each junction is one upright bar, as wide as its thickest tube and centred on its x, from the top to the bottom of
  every tube's cross-section where that tube reaches it. A tube `t` pixels thick spans `low = floor((t-1)/2)` pixels
  above or left of its line and `t-1-low` below or right; an end that joins a bar reaches past its point by that side's
  part, ending inside the bar, and a valve or an open end does not. Primaries, and the bars of collectors two or more
  primaries enter, are in their bank's color; the other pipes and bars (a log manifold's ports, a single primary's
  junction) are grey. Collectors' bars are drawn last.
- The tubes and bars are painted flat, then shaded once as one shape whatever their colors: a pixel that tops a
  vertical run of 3 or more drawn pixels, or ends a horizontal run of 3 or more on the left and does not end a vertical
  run at the bottom, is lit halfway to white; one that ends a vertical run at the bottom, or a horizontal run on the
  right and does not top a vertical run, is at half brightness; lit wins over both. Parts under 3 pixels are flat, and
  no line is drawn where colors meet.
- Each cylinder is a block of 6×7 pixels just before its valve, DIM edged in its bank's color, WHITE while lit.
- Each pipe's length and diameter, `315/50` (DARK), stands in the text row above, or else below, the rows of its longest
  level piece, over it and as near its centre as columns 26–39 and rows 15–27 allow, in cells holding nothing drawn or
  written and not just after written text; longest pipes first. A pipe with no such place has no value: the scale marks
  read it.

#### DRIVETRAIN

Row 3 heads the graph with `GEARS` (YELLOW) at column 22. The graph stands where ENGINE's does, on its grid and axes,
and shows each gear's engine speed against road speed: its horizontal axis runs from 0 at x 176 to the top gear's
road speed at redline at x 319, and its vertical axis from 0 on row 95 to redline on the top grid line, where the
redline is a RED line dashed every second pixel. Each gear is a straight line, a pixel wide and joined vertically
between columns, from the origin to its road speed at redline: DIM up to the previous gear's speed at redline and
YELLOW from there. At each gear's speed at redline a YELLOW upright line drops from redline to the next gear's engine
speed, so the gears draw a saw tooth. The graph has no axis numbers.

The left column starts with `GEAR` at column 0, `RATIO` at column 5 and `KMH` at column 16 on row 14, then one row per
gear: its label (`1ST` …) at column 0, its ratio at column 4, a bar and its road speed at redline in km/h right-aligned
in columns 16–18. The road speed is `redlineRpm` turning the driven wheels' rolling radius through the gear and the final
drive; the driven wheels are the front if `frontDriveTorqueFraction` exceeds one half, otherwise the rear. The bars share
one scale for every vehicle, 0 to 320 km/h across x 72–127, on y 2–5 of the gear's row: DIM up to the previous gear's
speed and YELLOW from there to the gear's own, a saw tooth over the gears; a speed beyond 320 km/h stops at x 127. `FINAL` (`finalDriveRatio`) and `DRIVE` (`RWD`, `FWD`, or `AWD 47/53`
from `frontDriveTorqueFraction` 0, 1 or otherwise its front/rear percent) follow as values.

| Rows 14–15, right | Example       | Source                            |
| ----------------- | ------------- | --------------------------------- |
| `TIRE`            | `632/662mm`   | twice the front/rear wheel radius |
| `WHL I`           | `2.7/3.4kgm2` | front/rear wheel inertia          |

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

The left column has the listing's `ERA` (`period`), `MKT` (`physicsAnchor.market`) and `SPEC` (each `selectedSpecification` entry in turn), with
labels at column 0 and values at column 5, in upper case. Each is wrapped to lines of at most 14 characters by words:
the text breaks at spaces and after each slash, a line takes words while they fit, a space between them except after a
slash, and further lines have no label. Lines past row 29 are not shown.

| Rows 14–27, right           | Example       | Source                         |
| --------------------------- | ------------- | ------------------------------ |
| `LENGTH`, `WIDTH`, `HEIGHT` | `4485mm`      | overall dimensions             |
| `W/BASE`                    | `2550mm`      | `frontAxle + rearAxle`         |
| `MASS`                      | `1625kg`      | `mass`                         |
| `CG HT`                     | `478mm`       | `desiredCgHeight`              |
| `YAW I`, `PITCH I`          | `3100kgm2`    | inertias                       |
| `RIDE`                      | `1.50/1.50Hz` | front/rear ride frequency      |
| `DAMPING`                   | `0.40/0.40`   | front/rear damping ratio       |
| `TRAVEL`                    | `300/300mm`   | front/rear `qTravel`           |
| `BRAKE`                     | `4800/3000Nm` | front/rear brake torque maxima |
| `DRAG`                      | `0.44kg/m`    | `quadraticDrag`                |
| `TRACK` (four-wheelers)     | `1518/1660mm` | front/rear track               |

## Selection and URL parameters

The composition root reads the delivered [course index](content-and-gameplay.md#course-index) and the
[front end selection](content-and-gameplay.md#front-end-selection-document) once and passes them to the rows, the
index with its display names.

A run is requested as a typed run request ([`run-request.ts`](../src/shell/run-request.ts)): a class run names a series,
one of its classes and its session (RACE from the rows, TIME ATTACK only from a URL; K, 2026-11-09), and the class
names the course and gives the laps, field and traffic; a FREE PLAY run names the course and its rival count, rival
pool, traffic and laps, which the rows cut to the course from RULES ([Card rows](#card-rows)). Both carry the vehicle,
the player's color and the track, which every request leaves at MUSIC OFF until it is decided which of a course's
tracks plays (K, 2026-11-08). There is no front-end mode: the one translation of a run request into the rules it is requested with
(`rulesRequest`) gives a class run the rules its session names and FREE PLAY its options. No class setting is looked
up from a course. The run's assembly admits those rules against the course, its class and the vehicle catalog
and derives its run configuration (`compileRunConfiguration`); a request from the URL, the selection
screens or RETRY passes the same admission, and a DEV rebuild's request too.

The URL is read once at startup, as a DEV and test entry point; selections inside the page never rewrite it. A URL
with `series` and `class`, or with `course`, builds that run's request and starts the run directly: its PRE-RACE card leaves as soon as the run is assembled, with no minimum stay and no black before READY, so a headless check reaches its first frame; a URL with
neither starts at TITLE. The player's color is the player record's color for the vehicle, and its track MUSIC OFF. A
URL request that cannot be built fails like an assembly.

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
?series=tsukuba-clubman&class=gti-cup
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
This and the other input thresholds below (the gamepad's rest 0.15, the stick's menu direction at half deflection,
the 24 CSS px flick) are author values, neither derived nor DEV settings.
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

In the rows LEFT and RIGHT choose a card and UP and DOWN change a value in it; they never act as each other (K,
2026-11-09). In a list card UP and DOWN choose an entry and LEFT and RIGHT change its value (K, 2026-11-11). Each screen
says what a command did: moved the focus or changed a value, confirmed something, or went back; a command that does
nothing (CONFIRM on a card without an action, BACK on TITLE, a value at its end, a shake at a row's end) says nothing. A
command the rows hold over a motion is answered when it acts, as the screen advances. The screen host is the one place
that turns that into a sound: `menu-move`, `series-slide`, `menu-confirm`, `menu-entry` (the CONFIRM on SELECT VEHICLE
that requests the run), `menu-deny` (CONFIRM on a dimmed card or a series without a document) or `menu-back`
([Audio](audio.md#sound-effects)). The rows and the carousels answer so, and the run screen too: PAUSE that opens the
PAUSE menu confirms, and PAUSE or BACK that closes it goes back. The CONFIRM on TITLE that starts the audio is not
heard, since the audio is not yet running.

- **Keyboard:** the arrows give the directions, Enter and Z CONFIRM and X BACK; Escape is BACK in a menu and PAUSE while
  driving. Z and X command only on the menu route; while driving they stay the accelerator and the brake.
  Keys follow the operating system's repeat, except that a repeated Escape does not pause.
- **Gamepad** (standard mapping): the D-pad and the left stick beyond half deflection give the directions, A and RT
  (the accelerator) CONFIRM and B and LT (the brake) BACK (K, 2026-11-09); Start is PAUSE while driving and CONFIRM in a
  menu. A control commands once, on its press, and never
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
The course's display name before GO is the course index's, centred on row 10, which holds the course texts' 40
characters.

| Rows  | Elements                                                                                                                                                                    |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1–2   | Ornate large: TIME and the remaining seconds (rounded up) beside it, race time, POS n/m, STAGE n                                                                            |
| 3–6   | Columns 18–21: the 4×4-tile road arrow, steady, pointing the side of the next parting while no gate comes before it                                                         |
| 4–5   | Ornate small: LAP x/y (LAP x without a lap count) and the lap's time, BEST and the best lap (`-'--"---` before one), PASS n until the ending, TARGET nM                     |
| 7     | Ornate small: `EXTEND +12"0` (seconds and tenths), SUNSET, while TIME is SUNSET after an extension                                                                          |
| 7     | Ornate small: TIME ATTACK with a record, the difference from the record run for 2 s after each compared crossing                                                            |
| 8–9   | Ornate large, columns 15–23: `SLOW DOWN` while the race shows a stage and SLOW DOWN is ON: YELLOW, ORANGE, or RED blinking ([SLOW DOWN](#slow-down))                        |
| 10–12 | Ornate small WHITE, before GO: the course's display name, the session (or FREE PLAY) and, in TIME ATTACK when one exists, `RECORD 1'23"456 <VEHICLE>` (its vehicle's model) |
| 13–14 | Three 2×2-tile signal lamps: before GO the race's lamps lit are LAMP_RED and the rest LAMP_OFF; all LAMP_GREEN for 1 s after GO                                             |
| 16–19 | Ornate large, from the ending until RESULT: GOAL (SUNSET), or GAME OVER (RED) with TIME UP or RANK OUT (RED) below it                                                       |
| 13–16 | While the camera is held at its yaw limit: the 4×4-tile road arrow, a triple chevron, steady, in columns 0–3 or 36–39                                                       |
| 22–24 | Columns 1–2: the tire gauge, 2×3 tiles                                                                                                                                      |
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

The tire gauge, above the speed, draws the player vehicle's axles from above in the
[tire gauge](image-assets.md#text-tiles)'s pattern for its form: a car's front and rear axles as an H, each a line between
its two tires, and a bike's two tires joined by one line. Each axle's tires take one palette of the gauge from the
player observation's tire on that axle (`tires.front`, `tires.rear`); the vehicle physics solves one tire per axle, so
a car's left and right tires always share a color. A loaded tire's `utilization`, the fraction of its friction ellipse
the braking or driving and cornering force together use before the force's fall past the peak (clamped to 0–1, and 1
at and past the peak, [Vehicle physics](vehicle-physics.md#observations)), picks the nearest of the gauge's tire
colors: green at 0, yellow at the tire's knee and red at 1, the step `utilization / knee` of the way from green to
yellow up to the knee and `(utilization - knee) / (1 - knee)` of the way from yellow to red beyond it. The knee is the
player vehicle's tire `rhoKnee`, where the tire's force stops growing in proportion to its slip; up to the knee the
force's fraction equals the tire's radial demand `rho`, so the knee in force is the knee in `rho`. A tire without load (`load` 0), in
flight, is grey. A tile holds one palette, so the front tires lie in the gauge's top row of tiles and the rear in its
bottom row; its middle row holds only the line, which every palette draws alike.

The speed shows `round(speed*3.6)` km/h, held at 999, in three italic segment digits right-aligned in SEG_VFD; a
leading digit the speed does not reach shows all its segments unlit. The gear is one segment digit in SEG_VFD, and in
SEG_YELLOW after a shift; unlit segments are a dark trace of the lit color. The tachometer's 26 italic bars, 2 pixels wide
with a pixel's gap, stand on row 28's bottom ([Image assets](image-assets.md#text-tiles)); bar `i` (from 0) lights once
the engine speed reaches `(i+1)/26 * 1.10 * redlineRpm`, the full scale being 110 % of the player vehicle's redline,
and is unlit (its color's unlit shades) otherwise. Every bar from the first at or above redline is red, the 4 before
it yellow and the rest green; every bar is red while the limiter cuts fuel. A tile's bars take at most two colors, so a
tile where green meets yellow or yellow meets red takes the TACH_GREEN_YELLOW or TACH_YELLOW_RED palette and the
pattern that splits its bars there; the others take TACH_GREEN, TACH_YELLOW or TACH_RED.

Rows 8 to 21, the road and the player's vehicle, hold only these passing notices and the road arrow. The road arrow
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

### SLOW DOWN

The race publishes `slowDown`, a stage from 0 to 3 ([`src/race/slow-down.ts`](../src/race/slow-down.ts)): the
player's vehicle planned as a driver ([Drivers](content-and-gameplay.md#drivers)) at three utilizations, 0.85, 0.90
and 0.95 (`SLOW_DOWN.utilizations`), with its own mechanics, without a vehicle ahead, along the
path that keeps its route lateral (at a fork before the lock, that lateral lies in the exit interval holding it, whose
road the plan reads). After each step its raw stage is the highest whose plan's speed at the station `0.5 s × speed`
ahead the player's speed exceeds (1 for 0.85, 2 for 0.90, 3 for 0.95), or 0 when it exceeds none. A higher raw stage
shows at once; a lower one, 0 included, shows only once the shown stage has held for one blink period, 16 fixed steps.
The stage is 0 unless the player's own input drives the vehicle while the run is RUNNING (so never before GO, after
the ending or in the attract demo) and 0 while neither tire is loaded (in flight).

The three plans read the road once: they share one workspace's cells (the path's geometry, curvature and grip) and
keep their own cornering speeds, and a plan is read only while no higher stage is exceeded. The lateral is read in
steps of 0.25 m (`lateralResolution`) so that the cells are reused while it holds; it is an author value, and reading
the road up to 0.125 m from the vehicle's lateral moves a cornering speed by about `0.125 / (2 R)`, 0.3 % in TSUKUBA's
24 m hairpin, well within the about 3 % between two stages' speeds.

The HUD writes `SLOW DOWN` centred on rows 8–9 (columns 15–23) in the ornate large font while the SLOW DOWN setting is
ON: stage 1 YELLOW and stage 2 ORANGE, steady, and stage 3 RED, shown for 8 fixed steps and hidden for 8
(`floor(step / 8)` even; `SLOW_DOWN.blinkSteps`). The blink period is the hold's.

The three utilizations are the owner's values, decided on real devices. With `dev=1` the SLOW DOWN panel changes them
in hundredths, keeping them ascending (a change that would break the order is refused); they apply from the next run,
are not saved, and a reload restores 0.85, 0.90 and 0.95. They belong to the page, not to any document, so changing
them changes no measured product's identity.

## Performance HUD

The DEV performance HUD (with `dev=1`), a line at the top of the page, displays FPS, maximum CPU frame time, maximum fixed-step time and maximum frame interval.
The first frame reports immediately, then approximately every half second.

The ground detail shows the reporting window's maximum visible active Strip count,
the compiled course maximum and active limit, the latest frame's scene-render CPU milliseconds,
and the maximum over the most recent 120 rendered frames (`max120`), then the pixels the latest frame's walls painted and the [tire puffs](tire-puffs.md) alive (`puffs`). The renderer reads no clock: its
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
localStorage entry `super-outride-player` holding `{ "version": 8, "settings": { … }, "records": { … } }`. The
composition root opens it once at page load; shell controls read the admitted settings and records and change them only
through the record.

| Setting            | Shape and default                                                                                                                                                                               |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `vehicleColors`    | Selected color by vehicle ID, the player's run color; default `{}`                                                                                                                              |
| `volumes`          | `master`, `music` and `effects` as integer percentages 0–100; default 35, 100 and 100                                                                                                           |
| `latestSelections` | Latest choice by row key (`menu`, `series`, `class`, `course`, `vehicle`, `rivals`, `pool`, `traffic`, `laps`; `music` for the SETTINGS audition); default `{}`                                 |
| `cameras`          | `car` and `bike`, each `FACING` or `MOVING`: what the camera yaw follows for that form; default `FACING` and `MOVING` (`DEFAULT_CAMERAS`)                                                       |
| `steering`         | `car` and `bike`, each `{ "reference": "front" or "center", "utilization": 1, 0.95 or 0.9 }`: the player's steering rule for that form; default `center` and 0.95 for both (`DEFAULT_STEERING`) |
| `slowDown`         | Whether the HUD shows SLOW DOWN; default `true` (ON)                                                                                                                                            |

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
the run: READY and the PRE-RACE card the class's fastest at any goal (`shownRecord`, the one record
of a course with one goal), RESULT the record at the goal the run was judged at. The judgement and the HUD's record belong to the run they were made for.

Loading admits version 8 alone, with exactly these keys and value types; there are no migration readers. An absent,
unreadable, unparsable or other-version
record, or one whose settings are malformed, starts from the defaults and is replaced by the next save. A record
entry whose key or value is malformed is dropped alone. Each settings or records change saves the whole record at
once. Where localStorage is missing or reading or writing it throws, the record lives in memory for the page and the
game continues. SETTINGS and the DEV volume stepper ([Sound controls](#sound-controls)) save volumes, SETTINGS saves
the cameras, steering and SLOW DOWN, and a run reads its vehicle form's camera and steering rule and SLOW DOWN when it
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
minus/value/plus control in its document's units, wrapping at range endpoints; STEERING holds the rack bound
(M) and the traversal time (ACT), and ASSISTS toggles each side of wheel slip protection, TCS/MSR and ABS. TIRES F/R
and ASSISTS tune the run vehicle's own tire and wheel slip where its mechanics document gives them, as its model uses
them, and the driving definition's game-wide defaults otherwise; each group's label names which (the vehicle ID or
`game-wide`). Every other
group tunes the driving definition. RIVAL PACE drives no vehicle in a tuned run, which has no rivals: it takes effect once the exported definition
is adopted as content. BODY CONTACT is the rebuilt run's own: its walls, course limits and objects push with the
tuned values at once. Each adjustment is admitted by the
compiler of the document it changed, the driving document's or the vehicle mechanics document's; a rejected one changes
nothing. An admitted adjustment rebuilds the
Run through the same assembly as startup: a new run vehicle of the tuned definitions, with the same listing and
materials, in a FREE PLAY run with no rivals, the current lap count, no time limit, start speed 0
and no time budgets, on a new Route runtime from the grid. It enters READY → GO at once, the HUD naming its own rules (FREE PLAY). The shell, its input, audio, camera device and DEV controls persist, and the shell keeps the
tuned definitions for further adjustments and export. Reloading the page restores the product run. EXPORT saves the tuned
driving definition (`default.json`) and the run vehicle's tuned mechanics document (`<vehicle id>.json`) as browser
downloads in the saved layout;
its `audio/default.json` button (titled Export sound settings) saves the DEV sound panels' current values as the
[audio document](audio.md#audio-document) (`default.json`), its `surface-sounds/default.json` button the SURFACES
panel's records as that document, and its
`engine-sounds/…json` button the ENGINE SOUNDS panel's chosen sound as its document (`<sound id>.json`, its `metadata`
as written), and its `puffs/default.json` button the PUFFS group's records as the [puff document](tire-puffs.md#puff-document), in the saved layout;
[Calibration](calibration.md#vehicle-settings) describes adopting them as content. There is one camera; what its yaw
follows is the player's setting, not a DEV selection.
[Calibration](calibration.md#vehicle-settings) lists values, units and ranges.

DEV's PUFFS group (`puff-settings`) changes the [tire puffs](tire-puffs.md)' records for the page's lifetime: a chosen
kind's six values, and a chosen surface's kind, palette (one every picture of that kind has; choosing a kind whose
pictures lack the surface's palette takes their first) and its rolling and sliding amounts, as number fields where an
empty amount is null. Each value is the document's one value check's (`checkPuffMotion`, `checkPuffAmounts`); a value
it refuses leaves the previous one. A change applies to the puffs thrown after it, in the run and in new runs; its
reset returns to the delivered document's records and a page reload restores them.

### Sound controls

A mouse press, touch/pen release, touchend or eligible keyboard gesture resumes sound, and starts it during a run the
URL started ([Audio](audio.md#mix-and-lifetime)).
Touch pointerdown alone does not activate it. SOUND START starts or resumes; SOUND ON/OFF then mutes
or unmutes. SOUND RETRY offers a new initialization after failure. SOUND UNAVAILABLE indicates that
the browser lacks the required audio support, or its output rate is outside the synthesis's, while gameplay remains
usable.

MASTER, ENG and TIRE independently control the complete output, engine output and tire output.
MASTER is the player record's MASTER volume, which the stepper shows and changes through the one volume path;
ENG and TIRE are DEV mix values.
A zero gain silences that output while DSP continues. R and Q buttons (`tire-component-rolling`, `tire-component-friction`) independently switch rolling
and friction output for both axles. Their labels and pressed states show ON/OFF, and unavailable audio
disables them. [Tire audio](tire-audio.md#settings-replacement) owns faded output and replacement semantics.

The shell's reusable DOM controls ([`src/shell/controls/`](../src/shell/controls/)) build these sound controls
(`mountSoundControls`); the audio lifecycle only syncs their values to the scene and owns the AudioContext.
DEV sound settings come in groups, each with its own reset to the delivered document's values (the audio document's,
or for SURFACES and ENGINE SOUNDS the surface-sound and engine-sound documents'); a page reload restores those values and new
runs preserve them:

- **ENGINE** (`engine-sound-settings`): seven minus/plus controls for the exhaust settings; buttons stop at limits. A
  line above them (`engine-loudness-state`) says whether the measured engine loudness describes the current ENGINE,
  TIMING and ENGINE SOUNDS values, is stale for them (measured for the delivered values; adopt them and run
  `npm run measure -- generate`), or is not measured in this build.
- **MIX** (`mix-sound-settings`): the master compressor and `engineDriveLufs`, the engines' loudness into the soft clip.
- **TIMING** (`timing-sound-settings`): the control time constants.
- **RIVAL** (`rival-sound-settings`): rival audible distance, reference distance, pan floor and reassignment time.
- **UNIFIED** (`tire-sound-settings`): the friction-model settings.
- **IMPACT** (`impact-sound-settings`): each counterpart's impact reference work.
- **ROLLING** (`rolling-sound-settings`): the rolling-model settings.
- **SURFACES** (`surface-sound-settings`): a chosen material's surface sound, its rolling palette and friction input.
- **ENGINE SOUNDS** (`engine-sound-records`): a chosen engine sound's valve diameter and open share, and its primary and
  pipe lengths and diameters.

MIX, TIMING, RIVAL, UNIFIED, IMPACT and ROLLING use sliders with the acoustic ranges. SURFACES and ENGINE SOUNDS use
number fields: each value is the record's one value check's ([Tire audio](tire-audio.md#surface-sounds),
[Audio](audio.md#observations-and-engine-sounds)), and a value it refuses leaves the previous one. A changed record fades
and replaces the tire or engine kernels, as a settings change does. Engine sound rows show cycle, cylinder count, idle/redline, firing phases,
collector grouping and path lengths. [Calibration](calibration.md) lists the numeric settings.
