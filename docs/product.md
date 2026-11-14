# Product specification

SUPER OUTRIDE is a browser driving game with a 320 by 240 raster pseudo-3D view, set in the late 1980s.
The player chooses a car or motorcycle and drives characteristic roads of that era's arcade driving
games, remastered into one shared world, on one shared set of vehicle mechanics.

This document is the product target. [NEXT](NEXT.md) schedules the parts that are not yet implemented;
the topic specifications describe the current implementation. Values that depend on a produced course
(rank limits, spawn distances, time margins, grid spacing) are set during course production
from playtests; [NEXT](NEXT.md#pending-product-decisions) lists every open decision.

## 1. Concept

The pleasure is driving the road: its turn order, elevation, surfaces, forks and scenery, with
distinctly different vehicles. Driving a familiar road with another vehicle is itself a goal, and
modest vehicles (Mini, Beetle, Vespa, Super Cub) are chosen for their character, not only their speed.

The game has no part purchases, tuning progression, upgrade choices during a run, arrests or goals of
stopping another vehicle. Ordinary contact, rivals, traffic, rank and route choice remain.
Every run is single-player; there is no split screen or online play.

A reference game's special controls are not adopted merely because it had them: there is no turbo
button, jump control or siren.

### Era

The world is the late 1980s. Vehicles existing by 1989 are eligible, including older cars; a vehicle's
model year, market, grade, engine, appearance and sound describe one consistent specification, without
later parts or outputs. Reference games released in the 1990s are eligible; their roads are remastered
into this world. A real circuit keeps its 1989 layout; a real mixed-surface course may take its current
one, remastered into this world as those roads are (K, 2026-11-08).

### Vehicle identity

A vehicle behaves identically in every session, series and course. A different specification of the same
model (road and rally-raid, road and Group A) is a different vehicle. Difficulty never changes vehicle
mechanics; it is expressed by run rules and rival driving (§3).

## 2. Structure

| Level   | Meaning                                                                                                             |
| ------- | ------------------------------------------------------------------------------------------------------------------- |
| SERIES  | A named set of classes with its title, image, title track and class order: an ARCADE TRIBUTE or the game's own (§5) |
| CLASS   | One complete race definition: course, laps, eligible vehicles, field, traffic, clock, time margin and colors        |
| SESSION | How a class is driven: RACE in the menus; TIME ATTACK from a URL until records are taken within RACE                |
| COURSE  | One road to drive, with its music and jingles (§13); several classes and series may run a course, or none           |
| VEHICLE | The vehicle the player drives                                                                                       |
| STAGE   | The route interval between consecutive race gates (checkpoints and the finish)                                      |

A series holds no rule values: every rule belongs to its classes, and classes of one series may repeat the same values.
A series' only other setting is whether it appears without DEV, which is visibility, not a rule. Steering and camera
belong to the player's SETTINGS alone; a class does not prescribe them.

**FREE PLAY** is not a series. It is an assembly bench: any product course, any vehicle, rivals from a vehicle pool,
traffic and laps (§4). Every delivered product course is available in FREE PLAY; a course that no class runs is
available only there.

LINEAR means one route without forks or laps (not a straight road), BRANCH a course with forks and
several goals, and CIRCUIT a lapped course. Stages are rule intervals; they need not coincide with
course Sections. Series, courses and vehicles are all available from the start;
there is no unlocking, currency or progression.

## 3. Run rules

A run combines these rule components. Forks, recovery and timing mechanics are common to all
runs ([Content and gameplay](content-and-gameplay.md) owns their definitions).

| Component          | Values                                                                      |
| ------------------ | --------------------------------------------------------------------------- |
| Clock              | On or off. On: the checkpoint clock with per-checkpoint time extensions     |
| Rank limits        | Per race gate: a limit N, or none                                           |
| Competitor entries | Vehicle, color, stage interval and appearance (grid slot or ahead distance) |
| Player slot        | The player's own entry position, or the last grid slot                      |
| Laps               | Circuits only                                                               |
| Traffic            | Off, or a density in vehicles per kilometre, vehicle candidates and a speed |

**Field.** A run has at most sixteen competitors, the player included. The entries of a class list
its whole field in grid order. The player occupies the rearmost entry of the selected vehicle in grid
order, in that entry's color when the class fixes colors and otherwise in the player's chosen color; the
remaining entries are the rivals. With the player slot "own entry position" the player starts where
that entry stands (Turbo OutRun); with "last" the player starts in the last slot and the rivals keep
their order in front. Rivals avoid repeating a vehicle/color pair where the entries allow.
Cars and motorcycles may share a field.

**Grid.** Every course has a grid for cars and one for motorcycles, laid from the start line back (K, 2026-11-05): a
real circuit's or an original's own where it has one, otherwise a general form, cars one a row and motorcycles four a
row. TSUKUBA's car grid is two staggered columns, and its motorcycle grid three a row in steps with the pole at the
front on the left, as in the Tsukuba road racing championship. A field of motorcycles alone starts from the motorcycle
grid, and a field with a car from the car grid, in every run. A grid may hold more slots than sixteen; a field uses
the front sixteen. FREE PLAY and TIME ATTACK fill them from the front, the rivals first and the player behind them.

**Stage interval and appearance.** An entry takes part in a stage interval. An entry starting at the
first stage stands in its grid slot. An entry joining later appears ahead of the player by its ahead
distance when the player enters its first stage, moving at its driver's planned speed there. After its
last stage ends for the player, the entry leaves as soon as it is out of view. Whole-race rivals, one
rival per stage and a final all-rival stage are all entries with different intervals.

**Rank limits.** A gate with rank limit N fails the player at the moment the N-th other competitor
crosses it before the player. An exact tie in event time goes to the player. Rank limits count the
competitors present in the run at that moment.

**Clock.** The clock starts at GO; each newly earned checkpoint extends it once, and expiry ends the
run in GAME OVER. The time allowance derives from the player's selected vehicle: the standard driver's time for
that vehicle on the class's course and route, multiplied by the class's time margin. Only a RACE has a clock.

**Rival pace.** Rivals drive vehicles about as able as the player's, so no rival follows a schedule (K,
2026-11-12). A rival drives a little harder behind the player and a little easier ahead of it, following the player
slowly, within its own vehicle's limits and at its vehicle's whole speed on a straight; RACE and FREE PLAY rivals
drive alike ([Rival utilization](content-and-gameplay.md#rival-utilization)). No vehicle's mechanics change. The
difference is visible driving, not a hidden correction.

**Forks.** The first competitor to cross a fork's lock line selects the route for the whole field;
alone, that is the player. Unselected roads show warnings and closure signs; vehicles remaining there
at closure recover to the selected road. Recovery preserves earned progress.

**Traffic** vehicles are not competitors: they take no rank, never select a route and have no part in records.
Traffic appears only on roads of two or more lanes.
They are ordinary vehicles with ordinary drivers, travelling the player's way. Where each one appears along the
road, its vehicle, color and lane follow from the run's seed. A traffic vehicle appears ahead at the farthest
visible distance, keeps its lane at the traffic speed, the same for every traffic vehicle as on a public road, slowing for
corners as any driver does, and leaves once it
is out of view. A traffic vehicle never changes lanes to pass: behind a slower vehicle it matches that vehicle's speed. Where
its lane ends, it merges into the lane beside it once that lane is free. At most sixteen traffic vehicles are present at once.

## 4. Sessions and FREE PLAY

A class is driven in one of two sessions. The menus offer RACE alone (K, 2026-11-09): records are to be taken within
RACE ([NEXT](NEXT.md#card-ui)), and until then TIME ATTACK runs only from a URL.

**RACE** runs the class: its course, laps, vehicles, field and traffic, with its clock and its other rules. Its
settings are fixed; the player chooses the vehicle among the class's and the color, unless the class fixes colors.

**TIME ATTACK** runs the class's course with one of its vehicles alone: no rivals, no traffic, no clock. The player
starts from the first grid slot. What it competes on depends on the course:

- **CIRCUIT: the best single lap.** The run has no finish and no lap count: the player laps until ending the run, and
  the class's lap count is not used. The standing-start first lap counts like any other. The run's result is its
  fastest completed lap; its total time is neither a result nor recorded. The player ends the run from PAUSE, whose
  QUIT leads to RESULT, showing the completed laps and the best; a run ended before completing a lap has no result.
- **LINEAR and BRANCH: the completion time** to the goal reached, as a run with a finish. On forks the player selects
  the route by driving.

**FREE PLAY** runs any product course with any vehicle. There is no clock. Its RULES, chosen before the course and
kept as chosen (K, 2026-11-09), are the rival count (0–15), the rival vehicle pool (ALL, CARS or BIKES; default ALL),
traffic (OFF, LOW or HIGH; default OFF) and laps (1 to the most any course allows). A run takes as many rivals as the
course's grid holds at most and, on a circuit, as many laps as the course allows at most; the PRE-RACE card shows
what it takes. Rival vehicles and colors are drawn from
the pool by the run's seed. FREE PLAY rivals follow the player as RACE rivals do, each at its own vehicle's limits,
so the choice of vehicles shapes the race; FREE PLAY needs no reference runs. The rivals stand from the first grid slot
and the player behind them, in the first when there are none.
FREE PLAY traffic is the same on every course: LOW is 5 and HIGH 30 vehicles per kilometre, drawn from every
vehicle, at 80 km/h. FREE PLAY records nothing.

## 5. Series

Series are of two kinds: ARCADE TRIBUTE, a series for each reference game, and the game's own series. ARCADE TRIBUTE
comes first, and the game's own series are decided after it (K, 2026-11-05). Rule values marked in §3 are set when a
series is produced. A class names a product course; an original course is in no series ([Words](NEXT.md#words)).

### ARCADE TRIBUTE

An ARCADE TRIBUTE series plays its reference game as it was: its roads, its vehicles, its field and traffic, its clock
and its laps, within this game's rules (§1), and nothing its reference game does not have (K, 2026-10-31). Its name is
ARCADE TRIBUTE, a dash and the reference title, as ARCADE TRIBUTE - OUTRUN. Its classes are the reference game's course
selection: one class for each course, in the reference game's order (K, 2026-10-31). A series' vehicles and rule values
are written here when it is produced, in the order K decides.

The reference games are these eleven. WEC LE MANS 24, among the twelve K chose (2026-11-05), is left out as the only one
whose cars are Group C sports prototypes (K, 2026-11-08); its circuit, the Circuit de la Sarthe, comes as a real course
of its own ([C03](NEXT.md#selected-real-courses); K, 2026-11-09), not as that game. A reference game whose road surface
is drawn with sprites, SUPER MONACO GP among them, waits for a model of its own
([NEXT](NEXT.md#originals-with-a-sprite-road-surface)).

| Series                              | Reference game | MAME parent set | Classes (courses)                                              |
| ----------------------------------- | -------------- | --------------- | -------------------------------------------------------------- |
| ARCADE TRIBUTE - ENDURO RACER       | SEGA, 1986     | `enduror`       | ENDURO RACER                                                   |
| ARCADE TRIBUTE - SUPER HANG-ON      | SEGA, 1987     | `shangon`       | AFRICA, ASIA, AMERICA, EUROPE                                  |
| ARCADE TRIBUTE - OUTRUN             | SEGA, 1986     | `outrun`        | A, B, C LEFT, C RIGHT, D, E                                    |
| ARCADE TRIBUTE - TURBO OUTRUN       | SEGA, 1989     | `toutrun`       | SECTION 1–4                                                    |
| ARCADE TRIBUTE - POLE POSITION II   | NAMCO, 1983    | `polepos2`      | FUJI, TEST, SUZUKA, SEASIDE                                    |
| ARCADE TRIBUTE - FINAL LAP 2        | NAMCO, 1990    | `finalap2`      | JAPAN, MONACO, ITALY, USA                                      |
| ARCADE TRIBUTE - TOP SPEED          | TAITO, 1987    | `topspeed`      | A–G                                                            |
| ARCADE TRIBUTE - CONTINENTAL CIRCUS | TAITO, 1987    | `contcirc`      | BRAZIL, AMERICA, FRANCE, MONACO, GERMANY, SPAIN, MEXICO, JAPAN |
| ARCADE TRIBUTE - CHASE H.Q.         | TAITO, 1988    | `chasehq`       | STAGE 1 RIGHT, 2 LEFT, 3 LEFT, 4 LEFT, 5 LEFT                  |
| ARCADE TRIBUTE - BIG RUN            | JALECO, 1989   | `bigrun`        | STARTING RUN, SPECIAL STAGE 1–4, VICTORY RUN                   |
| ARCADE TRIBUTE - CISCO HEAT         | JALECO, 1990   | `cischeat`      | after Stage CS                                                 |

CONTINENTAL CIRCUS came out in Japan in 1988. OUTRUN's six SHORT roads are not in its tribute; they serve the game's own
series (K, 2026-11-03). TOP SPEED's classes are its seven roads, TOP SPEED A to G ([its
courses](top-speed-road-data.md#its-course-tables)). CHASE H.Q.'s are one a stage, on the road the stage's arrow names
where the original fixes it (stage 1 right, stage 3 left) and on its left road where the original chooses at random
(stages 2, 4 and 5); its other five courses serve the game's own series, as OUTRUN's SHORT roads do (K, 2026-11-05).
BIG RUN's are its six stages ([its conversion](big-run-road-data.md#its-conversion); K, 2026-11-09).

### The game's own series

The game's own series are decided after ARCADE TRIBUTE (K, 2026-11-05; [NEXT](NEXT.md#pending-product-decisions)).
Until then TSUKUBA CLUBMAN stays as it is. The table's rule columns are class values, written once where every class
of the series has the same; each class also has its time margin and whether it fixes colors.

| Series          | Classes and courses                                      | Vehicles                                                                                  | Clock | Rank limits | Field          | Player slot | Traffic |
| --------------- | -------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ----- | ----------- | -------------- | ----------- | ------- |
| TSUKUBA CLUBMAN | PRODUCTION 750, GTI CUP, 911 CUP: each TSUKUBA (CIRCUIT) | PRODUCTION 750: VFR750R (RC30), GSX-R750; GTI CUP: GOLF GTI 16V; 911 CUP: 911 TURBO (930) | on    | none        | 16, whole race | last        | off     |

- **TSUKUBA CLUBMAN** is an original series in the manner of a late-1980s club race meeting at Tsukuba. Each class
  is one race of 5 laps on TSUKUBA (CIRCUIT): PRODUCTION 750 for 750 cc production superbikes (the VFR750R alone until
  the GSX-R750 is in the catalog), GTI CUP for the Golf GTI 16V and 911 CUP for the 911 Turbo. Each class is one-make:
  sixteen of its vehicle, in their four colors, with the player last on the grid. The clock extends at each of the three
  sector lines; colors are not fixed.

## 6. Flow and screens

```text
TITLE: the main picture over the attract demo; PRESS START
MAIN MENU: SERIES / FREE PLAY / SETTINGS
  SERIES:    SELECT SERIES, then in the series' world SELECT CLASS → SELECT VEHICLE
  FREE PLAY: RULES → SELECT COURSE → SELECT VEHICLE
  SETTINGS:  one card of the settings; CONTROLS and CLEAR RECORDS each open a card of their own
→ PRE-RACE card (doubles as loading) → READY → RACE → RESULT
RESULT: RETRY / CHANGE VEHICLE / SELECT / TITLE
PAUSE:  RESUME / RETRY / QUIT
```

All screens are in one page and are drawn inside the 320×240 frame, in 8×8 tiles: text is 8×8 font tiles, every
character sits on the 8×8 grid of the plane it is drawn on, never offset by pixels within it, and pictures (the main
picture, the series pictures, the cards and the sky) are 8×8 tiles too; every choice is made inside the frame. All
text is English. PRESS START is the first user gesture, which enables sound and requests fullscreen where the browser
allows it. There is no continue. DEV controls, DEV displays and development series appear only when the URL has
`dev=1`.

Each selection is a row of cards (K, 2026-11-09). A card is 28×21 tiles (224×168 pixels), shown at 1:1; at rest the
card in focus stands centred across the frame on the frame's tile grid, its neighbours one card and one clear tile away
on either side. LEFT and RIGHT choose a card, like steering an arcade wheel; UP and DOWN change a value inside the card
in focus, a vehicle's color, a rule or a setting, and do nothing elsewhere; CONFIRM, the accelerator, goes on to the
next row and BACK, the brake, returns to the one before (K, 2026-11-09). A row of three or more cards wraps at both
ends; in a row of one or two a move past an end shakes the row and changes nothing. Every row is shown, even with a
single card: a series with one class shows SELECT CLASS, and a class with one vehicle shows SELECT VEHICLE as its
introduction (K, 2026-11-08 and 2026-11-09). A series, class or course that offers nothing is shown dimmed and denies
CONFIRM. Every vehicle comes in four colors, each shown by its period paint name; the first is its default, and a class
may fix the colors.

Only two kinds of picture fill the frame: the main picture, through whose clear parts the attract demo shows, and each
series' picture (K, 2026-11-09). TITLE, MAIN MENU, SELECT SERIES, FREE PLAY's rows and SETTINGS stand on the main
picture; FREE PLAY has no world of its own. SELECT SERIES shows the series pictures at 0.7, the size of a card, with no
text over them; choosing one brings it toward the player until it fills the frame at 1:1, and the player is in that
series' world, whose rows stand on its picture. Within a world one row gives way to the next by line thinning, the rule
of the [background transitions](image-assets.md#background-transitions), and only entering or leaving a series zooms
(K, 2026-11-09). Until the main picture is made, the title logo over the attract demo stands for it.

Behind the main picture the attract demo runs from TITLE until a run starts (K, 2026-11-08): the RACE sessions of the
product classes, each turn's class, vehicle, color and shots different every time (K, 2026-11-14), with no HUD and no
sound, and no fixed text: its one line, on TITLE alone, is a ticker of the series, the course and the machine (K,
2026-11-14). A turn shows a real RACE of its class and field, its vehicle driven by the player's run driver, filmed like
television (K, 2026-11-12): a camera travels the course alone while the ticker introduces the course, a camera behind
the grid watches the start, the race is shown in turns by cameras beside the road, travelling with the vehicle, looking
back at it and the player's own (K, 2026-11-14), and a camera before the line watches it finish, while the ticker
introduces the series and the machine in turn; every cut is line thinning. A turn lasts to the race's end and its RESULT
delay, or five minutes. The demo holds only the shown class's race and the next class's, and every turn starts its race
anew: a class shown again starts a new race. On TITLE, LEFT and RIGHT cut to the shot before or after, and UP and DOWN
make the class before or after the shown one the next, shown as soon as it has loaded (K, 2026-11-14), all in silence.

This game changes screens by line thinning alone, with no black (K, 2026-11-08). The changes outside the rows (from
FREE PLAY's SELECT VEHICLE to the PRE-RACE card, from the PRE-RACE card to READY, and from RESULT back to a row) still
go through black until they are redesigned ([NEXT](NEXT.md#card-ui)); in a series the PRE-RACE card stands on the
series' picture at once.

TITLE, MAIN MENU, FREE PLAY's rows and SETTINGS have no music. On SELECT SERIES the series in focus plays its title
track once the row has rested, and the track plays on in that series' world (K, 2026-11-09; §13).

FREE PLAY's RULES are one card of RIVALS, POOL, TRAFFIC and LAPS, at the place a series takes on the SERIES side (the
rules), chosen before the course and kept as chosen (§4). SELECT COURSE shows every course offered, in the reference
games' order, the game's own courses last: the courses stand as courses, apart from the ARCADE TRIBUTE series, as their
descriptions do (K, 2026-11-11). SELECT SERIES shows, in the front end's order, the
series whose picture exists; one without a series document yet shows its picture and denies CONFIRM (K, 2026-11-09).
A course's and a vehicle's cards are pages to read, packed with what they are about (K, 2026-11-11: the card UI as
before; 2026-11-12). A course's card says the course alone, its map, length, heights, corners and description, and a
vehicle's the vehicle alone: each is the same card in every series and in FREE PLAY, and a series' rules, its laps,
field, traffic and clock, are the series' to say (K, 2026-11-12; [browser](browser.md#card-rows)). The cards' design is
being chosen among styles built into the game, and the other cards' contents follow it ([NEXT](NEXT.md#card-ui)).

RESULT shows the outcome (GOAL or GAME OVER), rank when two or more competitors are ranked, race time, best lap on
circuits and new records; a TIME ATTACK on a CIRCUIT shows its completed laps and its best lap, with no outcome line
and no total time. Its RETRY runs the same race again through the PRE-RACE card, CHANGE VEHICLE returns to SELECT
VEHICLE, SELECT to the course's row (SELECT CLASS in a series, SELECT COURSE in FREE PLAY) and TITLE to TITLE (K,
2026-11-09). TIME ATTACK shows the class's record at READY; there is no records menu, and a class's record is shown
only inside that class. While a run loads, the frame shows the PRE-RACE card (class, session, course map, laps, field,
start slot and, in TIME ATTACK, the record); a failed load shows LOAD FAILED with RETRY and BACK. RESULT and the PAUSE
menu are drawn over the stopped frame, dimmed to half brightness. A URL that names a class or a course starts that run
directly, for development and tests: `series` and `class`, with `session=race` or `session=attack` (RACE when absent),
name a class's run, and `course` names a FREE PLAY run.

## 7. Start and finish

Every run uses a standing start. All vehicles are held for 3 seconds of READY while signal lamps
count down to GO; engines rev freely with the throttle. There are no rolling starts and no jump starts.

When the player finishes, the driver takes over the player's vehicle and brakes it to a stop on the
runout while the rest of the field keeps driving; RESULT follows after 3 seconds. The player's rank is
fixed at the finish: competitors unfinished at that moment rank behind. After GAME OVER the player's
throttle is released and the vehicle coasts, still answering the player's steering and
brake; RESULT follows after the same delay. A TIME ATTACK on a CIRCUIT has no finish and no takeover: it ends only
when the player quits it from PAUSE.

## 8. Camera

The product has one camera, shared by cars and motorcycles: the pseudo projection behind the player at constant
depth. Its pitch is the body's pitch, whatever the body's yaw, so vehicle images need no pitch variants. Its yaw
follows what the player chooses in SETTINGS for each form, CAR CAMERA and BIKE CAMERA: FACING, the way the body points
(a car's default), or MOVING, the way the vehicle travels (a bike's default). Within 45° of the road direction the
camera takes that yaw at once; beyond it the camera stays at the limit and the vehicle is shown turned. It stands 6 m behind the player's base point and 2 m above it with a level body, and holds
that point on one screen row whatever the pitch: only the base point's height is sprung, so on a steady grade the
player keeps its row, while jumps and suspension motion move the vehicle on screen and leave the view calm. The camera
may pass below the road.

## 9. HUD

The product HUD is drawn inside the 320×240 frame. It reads only published observations: race facts,
the player vehicle's observations and the camera's. It is a set of independent
elements, each reading one observation; the active run rules determine which appear.

| Condition                      | Elements                                                                    |
| ------------------------------ | --------------------------------------------------------------------------- |
| Always                         | SPEED (km/h), GEAR, race time, tachometer, steering, throttle, brake, tires |
| READY                          | Signal lamps, course name and session                                       |
| Clock on                       | TIME remaining, EXTEND                                                      |
| Two or more competitors ranked | POS n/m                                                                     |
| Next gate has a rank limit     | PASS n                                                                      |
| LINEAR or BRANCH               | STAGE n                                                                     |
| CIRCUIT                        | LAP x/y (LAP x without a lap count), lap time, BEST lap                     |
| One rival per stage            | TARGET distance while that rival is ahead                                   |
| Ended                          | GOAL, or GAME OVER with TIME UP or RANK OUT, until RESULT                   |
| Camera held at its yaw limit   | An arrow at the screen's edge pointing the way the road goes                |
| A parting ahead, no gate first | The road arrow at the top centre, pointing the side the course takes there  |
| TIME ATTACK record exists      | RECORD at READY; the difference at each gate and lap                        |
| Slowing needed (SETTINGS)      | SLOW DOWN                                                                   |

Race rules sit in the upper rows, the vehicle's state in the lower rows, and passing notices in the
middle; the road stays clear, and the steering picture may lie over the player's vehicle. Times read `1'23"456`. TIME
turns red under ten seconds and yellow for two seconds after an extension, shown as EXTEND with its seconds. A finished
lap's time holds for two seconds. SLOW DOWN shows while the player drives faster than the vehicle could slow for
the road just ahead, unless SETTINGS turns it off: yellow, then orange, then blinking red as the excess grows. Three signal lamps light red one per second and turn green at GO. The upper rows'
race rules and the passing notices are drawn in ornate fonts, a light-topped ramp of color down each glyph: the
upper row and GOAL or GAME OVER large, the rest small; menus and screens keep the plain font.

The lower row, from the left:

- **Tires:** above the speed, the vehicle's axles seen from above, a car's an H and a bike's two tires in a line, each
  axle's tires colored by how much of their grip they use: green, yellow at the tire's knee (where its grip begins to level
  off) and red at its limit, changing smoothly between, and grey in the air.
- **Speed:** three italic seven-segment digits in km/h, right-aligned, in the blue-green of a vacuum fluorescent display;
  an unused leading digit shows all its segments unlit, and unlit segments are a dark trace of the lit color.
- **Steering:** a picture of the vehicle's steering wheel (a bike's top bridge), 48 pixels square, turned as the front
  wheel actually is: its listing names the picture (montecarlo for TESTAROSSA and CORVETTE C4, prototipo for 911
  TURBO 3.3 and DELTA HF INTEGRALE, mod02 for GOLF GTI 16V and the DRIFT TUNED cars, top-bridge for the bikes). Under it a white bar grows from
  its centre toward the side of the steering actuator, so a key's input grows to full and an analog one follows it.
- **Tachometer:** 26 italic bars, 2 pixels wide, rising in a quadratic curve from 4 to 24 pixels, from 0 to 110 % of
  the redline; a bar lights once the engine reaches its speed and stays dark otherwise. Bars are green, yellow for the 4
  just before the redline and red from it, and all red while the limiter cuts fuel; each is shaded from a dark base to
  a light top.
- **Gear:** one italic seven-segment digit in the same blue-green, yellow briefly at a shift.
- **Throttle and brake:** green and yellow bars of the actuators; the part the vehicle's protections take away (beyond
  the effective throttle opening, and of the brake at the axle they reduce most) shows red at the bar's end.

There are no labels and no shift light. Text and HUD parts use one original font of 8×8 tiles (uppercase and lowercase
letters, digits and symbols) in the same indexed format as sprites and backgrounds: 15 colors and transparency per
palette, one palette per tile. Where a course's roads part, its `parting` gate says which side its road takes
([Section gates](content-and-gameplay.md#section-gates-and-run-settings)), and the HUD shows it from the gate before
(the start, before the first) to where the roads part (a proposal K decides on Pages); a course with none shows none.
DEV UI stays separate from the HUD.

## 10. Records and settings

The browser keeps one versioned record of settings and records:

- **Settings:** each vehicle's selected color, the three volumes, the car and bike cameras, the car and bike steering
  and the latest selections, FREE PLAY's options included.
- **TIME ATTACK records:** one table per class, keyed by the class and the goal reached (a circuit has one). The value
  is the best lap on a CIRCUIT and the completion time otherwise, with the record run's gate times (within the record
  lap on a CIRCUIT) and the vehicle it was set with.

Records are TIME ATTACK's alone; RACE and FREE PLAY record nothing. A record keeps the identities of its course and
of its vehicle's definitions and is discarded when either changes. On a LINEAR or BRANCH course only a run that
reaches GOAL records. On a CIRCUIT a lap that beats the record is recorded when it is completed, and NEW RECORD
sounds then, so ending the run, or leaving it any other way, never loses it. READY shows the record and RESULT judges
the run against the reached goal's record, or on a CIRCUIT shows the run's best lap against the record, with NEW
RECORD when it is beaten. While a run is driven, each gate shows the difference from the record run for two seconds,
green when faster and red when slower; on a CIRCUIT each lap is compared with the record lap, and on a course with
several goals the record is compared only once the run can reach one goal. SETTINGS can clear all records.

Steering is a rule of the driver, an aid and not a mechanism of the vehicle: the player and the AI drivers share the
same physics (tires, suspension, and the steering rack's limit and speed). The player chooses the rule on SETTINGS for
cars and for bikes: the reference (FRONT, the front wheel, or CENTER, the centre of mass) and the front tire's use at
full steering (100%, 95% or 90%), CENTER and 95% until chosen. It applies only while the player drives. Every AI
driver (rivals, traffic, reference driving, the attract demo and the driver who takes over after GOAL) steers by one
rule, CENTER and 100%, whatever the player chose and whatever pace it drives at.

An equal time keeps the earlier record. Color, music, camera and steering are not record conditions. Runs rebuilt by
DEV tuning record nothing. There is no name entry, ghost or online ranking.

## 11. Input and display

- **Keyboard:** Left/Right steer, Up or Z accelerates, Down or X brakes; Escape pauses. In menus Left/Right choose a
  card, Up/Down change a value in it, Z or Enter confirms and X or Escape goes back.
- **Touch:** the touch area is the whole screen in both orientations, the frame and the margins around
  it included. While driving, its left half is analog steering and its right half the pedals. In menus, a flick
  left or right in the left half chooses a card and one up or down changes a value, a tap in the right half
  confirms, and the top-left corner goes back. A pause button sits in a corner.
- **Gamepad:** standard mapping: left stick or D-pad steers, RT or A accelerates, LT or B brakes, Start
  pauses. In menus the stick or D-pad chooses and changes, RT, A or Start confirms and LT or B goes back.
- Menus are driven as the vehicle is: the steering chooses, the accelerator confirms and the brake goes back; up and
  down serve only where a value must change (K, 2026-11-09).
- There is no key remapping, gyro control, manual transmission, driving assist or manual recovery.
  Recovery is automatic.

In landscape the 4:3 frame fills the screen's height and is centered; in portrait it spans the width at
the top. The touch area does not depend on where the frame is.

## 12. Interaction

Competitors and traffic have physical extent and contact each other, cars and motorcycles included.
Vehicles that touch push each other apart, ahead-behind or side to side, with equal and opposite forces
that act through the ordinary vehicle mechanics. Each vehicle occupies a box as wide and long as the vehicle is wide,
and as high as it is high, laid along the road whatever way it faces; cones and barricades occupy the square of their
width. Vehicles moving fast never pass through each other or an object between frames. A
vehicle in the air passes over one below it. Contact
never turns a vehicle, never topples a motorcycle, never ends a run by itself and causes no damage.

A road is made of lanes. Every course has at least one lane, and the course's centre line is the centre of one of
them. Lanes begin and end by widening from nothing or narrowing to nothing, and a median may separate them; a road
may have lanes and no painted lines.

Traffic drives as on a public road: each vehicle keeps its lane and the traffic speed, leaves its lane
only where the lane ends or a solid object stands in it, and does not yield to faster vehicles. Rivals
race: they are bound neither to lanes nor to the traffic speed, drive the racing line and thread between other
vehicles to pass them. Neither hits another vehicle or a solid object on purpose.
Drivers read the surface ahead: on a surface with less grip they corner and brake within what it gives.

Walls — guardrails, walls and cliff faces — run along the road. A visible wall stands on its line, rising
above the road, dropping below it, or both, in strips of color that may repeat along the road. A solid
wall cannot be crossed at any height: a vehicle touching it is pushed back across the road, and sliding
along it slows the vehicle. A wall may be invisible, and a wall may be for looks only. The edge of the
course's ground is an invisible solid wall, except where the course opens it: there a vehicle can drive
off, falls, and returns to the road.

A roadside object such as a tree, a sign or a building can be solid; grass, bushes and other scenery are
not. A solid object is solid across a width no wider than its picture and has no depth along the road. A
vehicle that meets one is stopped or pushed aside, and a vehicle held against one returns to the road by
itself. Solid objects are never damaged.

A movable object such as a cone or a barricade has a mass. A vehicle that hits one knocks it away and
loses speed in proportion to that mass: a cone costs almost nothing, a heavy barricade is felt. A knocked
object shows one picture while it flies and another once it has landed, lies where it fell for the rest of
the run and is no longer solid.

## 13. Music and sound effects

Sound has three owners (K, 2026-10-31). Engine, tire and contact sound are physical and the game's own, the same on
every course. A course's music and jingles go with the course, whichever series or FREE PLAY runs it. Menu sounds and a
series' title track belong to the menus.

Engine, tire and contact sound follow physical observations. A hit on a vehicle, a wall or an object sounds
once, at the instant it begins, louder the harder the hit; sliding along a wall or another vehicle makes no
sound of its own. Only contacts of the player's own vehicle sound.

Music is original. Each series has a title track. On SELECT SERIES the series in focus plays its track from its
beginning once the row has rested for half a second, and a move fades it out over a quarter of a second; the track
plays on in the series' world, fades out into READY, and starts again from its beginning when RESULT returns to the
world. TITLE, MAIN MENU, FREE PLAY's rows and SETTINGS have no music (K, 2026-11-09). A course has zero or more race
tracks, which go with the course; there is no SELECT MUSIC (K, 2026-11-08), and no run plays a race track until it is
decided which of its course's tracks plays ([NEXT](NEXT.md#music-and-jingles-with-the-course)). At GOAL and at GAME
OVER the course's jingle plays once. RESULT has no music.

Jingles mark the run: the signal lamps and GO, checkpoint and lap crossings, time extensions, the last lap of a circuit,
GOAL and GAME OVER, and a new record. A course may give its own jingle for each; where it gives none, the game's own
sounds. One crossing gives one sound: GOAL's jingle, else the time extension, else the final lap when the lap just begun
is the last, else the crossing itself. Menu commands have the game's sounds.

Music has its own volume, and jingles and menu sounds share the effects volume; engine, tire and contact sound follow
the master volume alone.
In SETTINGS a track plays while the MUSIC card is in focus, so its volume is set by ear.
Sound starts at PRESS START and runs while the page is visible. While no run is being driven, the vehicle
sounds and the run's track are silent, and only menu sounds, a series' title track and the SETTINGS audition play.

## 14. References and remaster

A course preserves its reference's topology, characteristic turn order, elevation sequence and visual
identity within the pseudo projection and mechanics, and records deliberate departures. Provenance
(editions, layouts, sources, departures) lives in authoring project data, not in runtime documents.

## 15. Rendering and authoring

The view combines a tiled background, road and sprites with the player and HUD. Vehicle brake lamps select a saved
palette. Every picture, a vehicle's, a cone's or a barricade's included, is a flat picture drawn at its base point, the
centre of what it shows, standing above it and lying on the nearer ground below it; the camera keeps the player's
picture at the same place and size. Every vehicle, and every cone or barricade, casts a shadow on the road directly
below it, grounded or in the air, so the height and landing point of a jump read at a glance: a second picture paired
with each picture, drawn at the same size with its base on the road beneath, turning with the vehicle and halving the
road's brightness; it falls on the road alone, never on walls, vehicles or objects. Vehicle pictures and their shadows
are generated, every size of each its own picture, from a solid built from four views of the vehicle (front, side, rear
and top), by the [picture contract](image-assets.md#picture-contract). Tires throw puffs by the surface under them:
smoke when sliding on dry asphalt (more the more they slide); spray on wet asphalt and through water; dust in the colour
of the shoulder, dirt and sand when rolling or sliding there, and of grass and earth when sliding on grass. Every
vehicle in view throws them. Puffs are opaque pictures like the rest, hidden by what stands before them: a front tire's
puffs pass behind the player's body, a rear tire's are drawn over it ([Tire puffs](tire-puffs.md)). Courses and assets
are saved files.
Courses, images and definitions are saved documents. One authoring core compiles them for the build, the CLI and the
workbench. The workbench is a browser page served with each build: it edits documents, previews measured racing lines
and reference times, authors sprites and palettes, and starts the game on its own build. Its changes leave as one
archive of documents. [Development](development.md) owns the commands.

The workbench's course editor shows how a course is written as well as how it looks: repeats and single elements,
references and absolute values, authored points and derived lines are drawn apart. Edits keep that form; changing it
is always a named operation an author chooses. Cleaning operations and a list of findings keep course data tidy.

## 16. Ground

Ground is an ordered list of colored Strips covering the whole plane,
including open outer sides. Later Strips replace earlier colors or erase them to transparency. Transparent
areas reveal the background below as well as above the horizon. Material and color can be authored independently on the same Strip. [Content and gameplay](content-and-gameplay.md#strips)
owns authoring; [Architecture](architecture.md#strip-rendering) owns preblending and pixel filtering.

Ground and walls are drawn by one method, LEVEL-POINT, defined only in the rendering contract linked above; there is
no display setting for it. Ground contains no image assets;
lettering, kerbs and cliff edges expand from saved Strip constructs.
