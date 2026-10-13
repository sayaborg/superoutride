# Next task checkpoint

## Current state

- One compiled graph scene serves TSUKUBA and the trial courses OUTRUN TRIAL A and A STEEP with ARCADE/FREE PLAY
  Sessions.
- TSUKUBA, the first product course, is timed by TSUKUBA CLUBMAN, the first product series, with its PRODUCTION 750,
  GTI CUP and 911 CUP classes ([Product courses](content-and-gameplay.md#product-courses)).
- Course documents use plans of straights and arcs, positions measured from joints, lanes, Lateral values, Strips
  and gates.
  Circuits are closed cycles of two or more Sections.
- One manifest verifies all delivered content, including vehicle and game-wide driving definitions and surface materials.
  The content build compiles every delivered file from authored documents in one pass.
- Surface color and material are authored with Strips, with LEVEL-POINT as the default of three display methods; sprites are indexed.
  BG is one infinite tiled plane with a linear vertical row mapping.
- The measurement tool (`npm run measure`) saves each course's racing lines and, for each course a class runs, its
  vehicles' reference times and pace schedules under `content/`, with the vehicle, course and procedure identities they were
  measured for; the build admits and delivers them and runs no driving, and a Session applies its series' margin. Vehicle and course identities derive from delivered
  document SHA-256, procedure identities from each procedure's record. Tire audio uses UNIFIED.
- Engine sound load is the powertrain's effective opening.
- Stage 10 is complete: the race owns competitor mechanics in fixed steps and publishes facts (time-ordered events,
  Route with its fork choices, borrowed competitor observations); drivers intend lanes and target exits, rival exits
  derive from the Session seed; loading coverage, recovery policy and reference identities each have one owner.
- Stage 11 is complete: the audio scene and sound graph are separate from the browser; engine sounds, surface sounds
  and the game-wide sound settings are content documents; every sound value is derived from physics or a DEV setting;
  exhausts are collector graphs.
- The [product specification](product.md) is the target for Stages GS and 16. Series documents own ARCADE settings:
  each class of a series is one ARCADE race (course, laps, vehicles, field and traffic), and a course may be run by
  several classes and series; measured products belong to course and vehicle, and a Session applies its series' margin;
  FREE PLAY rivals are drawn from vehicle pools; TIME TRIAL runs alone. Stage GS replaces MODE with SERIES, CLASS and
  SESSION (RACE / TIME ATTACK).
- Stage 12 is complete: the front end runs inside the frame from TITLE through RESULT, with SETTINGS and `dev=1`; the
  product HUD is drawn with the text layer from race facts and the player's observation, and DEV measurements stay with
  `dev=1`; the player record keeps settings and the TIME TRIAL and ARCADE records shown at READY, at TIME TRIAL
  crossings and on RESULT; all UI is English.
- Engine sound can lag on some devices and stay late. With `dev=1` the audio timing line measures the AudioContext's
  latency, clock and worklet overruns; headless Chromium did not reproduce the lag, so its fix waits on a reading
  from an affected device ([Browser](browser.md#performance-hud)).
- Stage 13 is complete: vehicles have overall dimensions and road-aligned footprints that contact vehicles, walls,
  course limits and roadside objects through one external force on the ordinary mechanics; Carriageways have lanes,
  drivers follow lane centres, change lanes past slower vehicles or follow them and merge where their lane ends; traffic
  appears at seeded Route positions from the series or FREE PLAY's TRAFFIC option.
- Stage 14 is complete: the AudioContext runs while the page is visible and the vehicle sounds only while a run is
  driven; recordings (AAC in MP4) and music documents are delivered and admitted; SELECT MUSIC chooses the run's track,
  which starts at READY, loops, pauses with the run and fades under the GOAL or GAME OVER jingle; countdown, crossing,
  extension and menu effects sound from race facts and menu commands; the player's wall scraping runs the tire's
  friction synthesis on the wall's sound, and its impacts are recordings at a volume from their work; the player record
  owns the MASTER, MUSIC and EFFECTS volumes. Its recordings are placeholders until K's files replace them
  ([placeholder recordings](#placeholder-recordings)).
- Stage 15 is complete: one authoring core compiles the authored documents for the build, the CLI and the workbench,
  reusing unchanged stages; measured products (racing lines, reference times and pace schedules) are generated
  by `npm run measure` and saved under `content/`; the workbench (`workbench.html` at the site root) edits a build's
  documents through the core in a worker, with its documents, changes, measure, run, music, sprite and course modules,
  and its changes leave as one archive; the course editor shows a course's form in four views (plan, profile, cross
  section, game frame) and edits it, changes its form, cleans it and lists its findings through core functions the
  course command shares, with an underlay to trace from.
- Course documents are written in their final Stage 15 form: a plan of straights and arcs by length from each Section's
  origin, Positions measured from the nearest joint, lanes as widths left to right from a centre lane (roads, edges and
  centres derived), and images named by file.

- The camera and pictures follow K's CAM decisions: the camera stands 6 m behind and 2 m above the player's base point
  and holds it on one row whatever the body's pitch, follows the player's FACING or MOVING setting and shows the road
  arrow at its yaw limit; every picture stands at its base point and casts its own shadow picture; vehicle pictures are picture sets of
  six sizes ([Picture contract](image-assets.md#picture-contract)). TESTAROSSA's, 911 TURBO 3.3's and GOLF GTI 16V's pictures and shadows are finished sets generated
  from four views of the vehicle ([Vehicle picture generator](image-assets.md#vehicle-picture-generator)), and VFR750R's
  a generated prototype with its rider and seven banks, kept until a 3D model's pictures replace it; the other
  vehicles keep their converted provisional pictures until their views are made.
- Stage PT is complete: every torque curve has five points (idle, knee, maximum torque, maximum power, redline); fuel
  cut enters at 105 % of redline and clears at 103 %, the curve continuing its D–E line above redline; the tachometer
  reads to 110 % of redline; the ground continues behind a closed course limit; a locked engine's inertia joins the
  wheel solve; SELECT VEHICLE is a catalog page per vehicle with its curves and physical values.
- Stage FE is complete: one tile picture format
  serves the sky, the series images and the title logo, which `npm run screen-pictures` draws from K's sources; TITLE
  shows the logo, PRESS START and then the mode line; menus are carousels (SETTINGS, OPTIONS and LAPS lists) with Z/X,
  DARK items that deny, and a black transition between screens; ARCADE's screens stand over the series image, SELECT
  SERIES slides between them and the series' title track plays until READY; SELECT MUSIC offers a series' race tracks
  and MUSIC OFF; the PRE-RACE card, with the course map north up by the course's bearing, is every run's loading
  screen; 17 effects sound, `final-lap` and `new-record` among them. Behind TITLE the attract demo shows each
  product ARCADE class's race from READY (K's decision replacing a fast-forward to mid-race, which cost tens of seconds
  behind black). The screens smoke saves every screen to
  `dist/screens/`. FE-1, FE-6, FE-8 and FE-9 were split (FE-1a rename / FE-1b format; FE-6a color names / FE-6b SELECT
  SERIES / FE-6c CLASS, VEHICLE, MUSIC; FE-8a TITLE / FE-8b attract demo; FE-9a LOADING removed / FE-9b
  specifications), and a defect FE-4 left (a transition asked for from black never finished) was fixed with a host
  test. FE-10: inside an ARCADE series the series image stays on screen; only TITLE ↔ SELECT SERIES and the PRE-RACE
  card → READY go through black.
- Stage OT is complete. RIBBON is deleted and `npm test` (Node 24) takes about 2.5 minutes. OUTRUN TEST
  ([Test course](content-and-gameplay.md#test-course)) is offered without DEV in every mode and the attract demo:
  - 15 generated stages over 16 routes, each measured at 80–100 s for TESTAROSSA.
  - Drawn pictures and skies.
  - `WET_ASPHALT`, `DIRT` and `SAND` on the carriageway.
  - `wipe`, `rise` and `cut` background transitions owned by the environment.
    Forks, merges, closed roads, rank limits, ahead entries, movable objects, reversing beyond the entry and departures have no driving scenario since OT-1 (K's decision).
- Stage LD is complete: a course compiles in work slices the browser runs 8 ms at a time, so loading never stops the
  frame loop (the longest gap loading OUTRUN TEST fell from about 14 s to under 100 ms in headless Chromium); the
  preblend averages finer cells and the color ground is packed, so OUTRUN TEST holds about 150 MB instead of 465 MB;
  the attract demo holds only the shown and the next class's Sessions.
- Stage HD is complete: the HUD tiles command writes every text-tile pattern from the HUD design sources and rules
  ([Image assets](image-assets.md#hud-design-sources)): the normal font with ▲ ▼ ◀ ▶, the ornate small and large
  fonts in four styles, italic segment digits, a 26-bar italic tachometer, the signal lamp and the triple-chevron road
  arrow; the HUD and RESULT use the fonts by the mapping in [Browser](browser.md#hud).

Next PR: [AI-4](#ai-4--path-offsets) of [Stage AI](#stage-ai--the-model-planned-driver) and, beside it,
[GS-2](#gs-2--series-rules-move-to-classes) of [Stage GS](#stage-gs--series-class-and-session-replace-mode); then
[Stage 16](#stage-16--produce-product-courses).

Implement the stages in order. Each PR's restart instructions supply its detailed requirements.
Topic contracts belong to the topic specifications; development and release procedure belongs to AGENTS.
PRs hold rationale and verification evidence. Each stage first consolidates the structure its later PRs consume.

## Stage AI — The model-planned driver

AI vehicles are opponents whose speed tunes cleanly. They operate throttle, brake and steering smoothly and in analog
form; they are not bound to the player's digital inputs. Their limits come from the vehicle's own definitions through a
model, not from a separately measured envelope. Speed is one number, the utilization: the fraction of the tire
friction ellipse used, and it acts on cornering, braking and acceleration alike. The same driver serves rivals,
traffic, reference runs, the attract demo and the player's takeover after GOAL. Pedal inputs are already analog
(`PedalRequest` accepts [0,1]); the player's devices are unchanged.

Unchanged: rival pace, pace schedules and their formats; the utilization values (reference 0.9, unpaced 0.75, rival
bounds 0.55–0.95); fork locking and rival exits; traffic's lanes and lane rules. Tests stay lean: the standing checks
and existing scenarios pass, only the checks named below are added, an existing scenario changes only where this stage
intentionally changes the behaviour it observes (said in the PR), and no unit tests for internals. Racing lines are a
measured product of every course (AI-1, [Racing lines](content-and-gameplay.md#racing-lines)), and the planned driver
drives every driver, rivals and the player's Session driver on the racing line and traffic in its lane (AI-2,
[Drivers](content-and-gameplay.md#drivers)).

| PR   | Purpose                                         |
| ---- | ----------------------------------------------- |
| AI-4 | Path offsets: passing, giving room and yielding |
| AI-5 | BRAKE!! for the player                          |

### AI-4 — Path offsets

Owning document: content-and-gameplay (Drivers). Rivals, reference runs aside, change their offset from the racing line
by three rules, in this order; the first that applies sets the target offset, otherwise 0:

1. Yielding: a competitor closing from behind that leads the race by a lap or more: move to the side of the path away
   from that competitor's path, until it has passed.
2. Giving room: a vehicle alongside, its footprint overlapping the driver's lengthwise, on either side: keep the
   driver's path at least half the two widths plus 0.5 m from that vehicle's lateral, moving away, never toward it. Of
   two vehicles alongside, the one that came alongside first keeps its line.
3. Passing: when the vehicle ahead constrains the plan, evaluate the left and right offsets that clear it by half the
   two widths plus 0.5 m within the road's edge margin; take the one whose plan is faster by more than
   `passingMargin`, the left on a tie.

A change of target offset moves the path by a smooth cosine blend over `max(30 m, v × 1.5 s)`; the plan reads the
blended path's curvature, so a move never asks for more than the plan allows; there is no blocking. These rules
replace the rivals' lane passing; traffic keeps lanes. Remove [Rival racing line](#rival-racing-line) when AI-4 lands.

Evidence: a short video or frame strip of one pass, one give-room and one yield on TSUKUBA. No new test.

### AI-5 — BRAKE!!

Owning documents: browser (HUD and SETTINGS) and product (one sentence).

- The player's vehicle is planned like a driver at utilization 0.9 along the path that keeps its current lateral; at a
  fork before the lock line it takes the exit whose fork interval holds its lateral; the plan costs one more driver.
- `BRAKE!!` shows while the player's speed exceeds the plan's speed at the station `0.5 s × speed` ahead, and hides
  once the speed falls below 97 % of that; not in flight, before GO, after GOAL or in the attract demo.
- Text tiles at row 8, columns 16–22, in RED, blinking every 8 fixed steps.
- Draw BRAKE!! in the large ornate font, RED style, rows 8–9, centred.
- `SETTINGS → BRAKE SIGN ON/OFF`, default ON, kept in the player record's settings.

Evidence: frames showing it before a TSUKUBA hairpin. No new test.

### Decision rules for LD and AI

Used instead of asking, each use recorded in its PR:

1. A choice of algorithm inside a stated law (line solver, worker vs slices, root finding) is the implementer's,
   stated in the owning document.
2. The model check fails for a vehicle: improve the plan's model (load transfer, an axle's load share, drag) rather
   than relax the 5 %; if one vehicle still fails, report it, keep the check for the others and continue.
3. Reference times change by more than 10 % for a class: report it and continue.
4. Driver cost above 2× the old driver per step: report the profile, optimise the plan's caching, and continue when it
   is under 3×; at or above 3×, stop.
5. A scenario's observed behaviour changes by design: update its expectation and say why in the PR; never relax a
   scenario that checks safety (no recovery, no penetration, no collision).
6. A name is not given: follow the vocabulary in the documentation index.
7. A PR grows too large to review: split it within its item (AI-2a, AI-2b …), keep the game playable after each, and
   report the split.

### Stop conditions for LD and AI

Stop and report, without merging the current PR, only when a product course's reference run recovers or fails to
finish with the new driver and the cause is not in the plan's model; driver cost per step stays at or above 3× the
old driver; or CI or Pages fails for a reason outside these stages. When AI-5 lands, report each PR's head commit, the
LD frame-gap and heap tables, reference times before LD-1 and after AI-4 per class, the model check table, driver cost,
every use of a decision rule and anything left open.

## Stage GS — SERIES, CLASS and SESSION replace MODE

The game has no MODE level ([Product](product.md#2-structure)). A SERIES is a named set of classes and holds no rule
values; a CLASS is one complete race definition; a SESSION is how a class is driven, RACE or TIME ATTACK, and every
class offers both; FREE PLAY is not a series but the assembly bench. ARCADE and TIME TRIAL cease to exist: RACE is
today's ARCADE run of a class, unchanged, and TIME ATTACK replaces TIME TRIAL. Records are TIME ATTACK's, one table
per class. SETTINGS stays the one owner of steering and camera. Vehicles as compositions of parts and per-vehicle
tires are not in this stage.

Stage AI (on main) and Stage HD run beside this stage, which must neither block nor rewrite them. GS-1 to GS-4 stay in
content, the series catalog, run admission, records and the shell's flow; they do not edit drivers, racing lines,
reference runs, measurement, the text layer's fonts or HUD drawing. The one expected exception is GS-3's run without a
finish, which may touch how the race owns its end; that change stays with the race's end and lap facts, and the
takeover driver stays with Stage AI. Rebase on main before each PR and resolve conflicts in favour of the other
stream's logic. GS-5 waits for both streams, then runs alone.

| PR   | Purpose                                                                       | Kind             |
| ---- | ----------------------------------------------------------------------------- | ---------------- |
| GS-2 | Series rule values move to classes                                            | format + logic   |
| GS-3 | TIME ATTACK session replaces TIME TRIAL; records become TIME ATTACK per class | logic + deletion |
| GS-4 | MODE is removed from the flow: TITLE line, SELECT SESSION, URL                | logic + deletion |
| GS-5 | Rename `Session` → Run across code and documents                              | rename only      |

Split any PR that exceeds one review and report the split. If GS-3 and GS-4 need old and new paths side by side, GS-4
removes the old one and says so here.

### GS-2 — Series rules move to classes

`timeMargin`, `fixedColors` and every other rule value move from the series document into each class; the series
keeps `dev`, which is visibility. Bump the series document version and migrate the delivered series documents with
identical values per class. Run admission reads the class's values and nothing reads a series rule. Measured products
are unaffected. Behaviour is unchanged: the PR lists the admitted values before and after.

### GS-3 — TIME ATTACK

The run request names a class and a session. TIME ATTACK's admission takes the class's course, laps and vehicles and
derives no rivals, no traffic and no clock. The player record's TIME TRIAL and ARCADE records are replaced by TIME
ATTACK records ([Product](product.md#10-records-and-settings)); bump the record version and discard old records. RESULT,
READY and the in-drive comparison read the one TIME ATTACK record. On a CIRCUIT the run is open-ended: the race
publishes each completed lap, the record is judged and saved per lap, PAUSE's QUIT ends the run into RESULT, and RESULT
shows the best lap and no total time. "A run without a finish" has one owner rather than a circuit special case in the
shell; the PR reports the design. The TIME TRIAL request, its LAPS screen and its record code are deleted; driving
scenarios that used TIME TRIAL move to TIME ATTACK of the same course where a class runs it.

### GS-4 — MODE removed

TITLE's line becomes SERIES / FREE PLAY / SETTINGS and SELECT SESSION is added. `MODE_NAMES` and every mode branch in
the shell are removed; FREE PLAY is identified as FREE PLAY, not as a mode. URL parameters become `series` + `class`
(+ `session=race|attack`) and `course`; `mode` disappears. The screens smoke saves the new screen.

### GS-5 — Rename Session → Run

Rename only, in code, types, files and documents, so that "Session" survives only as the product term RACE / TIME
ATTACK: today's `Session` (one driven attempt) becomes Run, with one name for its one-record setup that fits the
existing `RunRequest` and run-assembly vocabulary. Runs after Stages AI and HD are on main.

### Stop conditions for GS

Stop and report rather than decide when a class would need a value that differs from its series' others in a way the
documents cannot express; a delivered behaviour other than records and flow would change; or a rule value is found
that belongs neither to a class nor to FREE PLAY.

## Audit 2 leftovers

Requirements left from the second design audit, by when they are taken up:

- **Not addressed, with reasons:**
  - P7a-01 (content digest): `contentDigest` and `SHA256_TEXT` stay in core. The course layer, below content, derives
    the course build identity and verifies its image digests while compiling; moving the digest to content needs those
    two duties moved to content or the digest passed into the course compiler.
  - D8e-05: the surface sounds and the material catalog must match exactly at startup too, as the documented contract
    says.
  - S12-02: pitch protection guarantees what its documentation states, excluding the road line's own acceleration,
    bump-stop impulses and discretization error.

## Stage 16 — Produce product courses

Create the selected courses using the Strip schema and file/CLI authoring workflow. Review appearance,
driving experience and time margins on real devices. The first product series is TSUKUBA CLUBMAN: the TSUKUBA circuit
and its three classes ([Series](product.md#5-series)). The OUTRUN, SUPER HANG-ON and CHASE H.Q. series follow, which
together use every Session rule component. The following production and authoring goals
are collected from the topic specifications; their order within this stage is not yet scheduled.

- TSUKUBA's remaining work: the bike's driving at the limit. At the reference driver's 0.9 utilization VFR750R weaved
  at full steering input from the final corner's entry and overturned on its exit, recovering 16 times in 30 laps;
  with the five-point torque curves (PT-1) its reference run completes without recovery. Bike handling at the limit
  is reviewed again once bike handling or the AI driving changes. The GSX-R750 joins the class once it is in the
  catalog. Solid barriers in place of the course limits at the verges; review of the scenery on real devices; signboard
  walls, which today are sprites standing in a row.

### Course format follow-ups

- Circuit closure: a circuit written in round lengths does not close. Before the first product circuit, decide how
  the tool solves the closing elements (the last arc's length and the last two straights' lengths) so that authors do
  not write the residual.
- Conditional solid objects: a sprite shown by a fork's choice (`unselectedLink`) may also have a body in the format;
  the race does not place such objects yet (cones lining the closed exit once a fork is decided).
- Wall Strips keep knots of their own because heights have no named lines; revisit with the first product walls.
- Oncoming lanes: a lane direction, when oncoming traffic is decided.

### Rival racing line

The [product specification](product.md#12-interaction) states the target: traffic keeps its lane and the
traffic speed, and rivals take the shortest line and thread between vehicles regardless of lanes. Until this
work, rivals follow lane centres and change lanes past slower vehicles. The algorithm and its tuning start
once product circuits are being produced.

A racing line within the road width (the minimum-curvature line, compiled with the course), whether reference runs drive
it, and passing off that line are designed once product courses exist to evaluate it on.

### Placeholder recordings

The music and impact recordings delivered today are placeholders (electronic tones) for building Stage 14; the 17
effects are K's provisional two-operator FM recordings (Stage FE). Before the product, K's files replace them under
the same names, with no code change ([Audio](audio.md#recordings-and-music-documents)):

- Music (`content/music/`): `placeholder-one.m4a` and `placeholder-two.m4a`, each with its music document; the product
  tracks bring their own names and documents. TSUKUBA CLUBMAN's title track is `placeholder-one` until K delivers one.
- Impacts (`content/impacts/`): `vehicle`, `wall`, `object` and `movable` (`.m4a`).

### Reference and remaster goals

Provenance lives in authoring project data (observations), not in the runtime course document.

Record exact edition, cabinet/region or circuit layout, supporting material, deliberate approximations
and remaster departures. Preserve topology, characteristic turn order, elevation sequence and visual
identity within the pseudo-projection and mechanics. Checkpoints and sprites/music changes may be
independent of Section boundaries. Use schematic route maps rather than require one geographic embedding.
Suzuka's lower crossing is represented as a tunnel with one road surface drawn at a time.

### Series values

Each class sets its rule values from playtests on the produced course: rank limits, ahead distances,
pace ratios, time margin, grid spacing and entry colors.

### Series production starting points

Candidates and reference observations gathered while specifying the product. They are starting points for
production, not decisions: the [product specification](product.md#5-series) owns what is decided, and
series documents and authoring project data replace these rows as each series is produced. Exact vehicle
specifications follow [Era](product.md#era): one consistent model year, market and grade per vehicle.

| Series         | Starting points                                                                                                                                                                                                                                                                                                                                                                      |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| SUPER HANG-ON  | The reference courses have 6, 10, 14 and 18 stages (AFRICA, ASIA, AMERICA, EUROPE); which cabinet's roads to use is open. VFR750R keeps the existing 1988 full-power definition; GSX-R750 is the 1988 standard export model, not the 1989 GSX-R750R; 851 is a 1988 road model.                                                                                                       |
| OUTRUN         | COUNTACH candidate: 25th Anniversary, 1988–1989. TESTAROSSA keeps the existing 1989 definition.                                                                                                                                                                                                                                                                                      |
| TURBO OUTRUN   | Stage order: New York, Washington D.C., Pittsburgh, Indianapolis, Chicago, St. Louis, Memphis, Atlanta, Miami, New Orleans, San Antonio, Dallas, Oklahoma City, Denver, Grand Canyon, Los Angeles. F40 and 959 are period road specifications.                                                                                                                                       |
| CHASE H.Q.     | 928 candidate: S4. ESPRIT TURBO generation is open. 911 TURBO (930) relates to the existing 3.3 L definition.                                                                                                                                                                                                                                                                        |
| CISCO HEAT     | Reference stages: Golden Gate Bridge → Fisherman's Wharf, Fisherman's Wharf → Union Square, Union Square → Moscone Center, Moscone Center → Twin Peaks, Twin Peaks → Treasure Island; internal forks are unverified. BROUGHAM TUNED starts from the 1989 Brougham. 300ZX candidate: 1989–early 1990 Z32 Twin Turbo, without mixing US and Japanese outputs or two-seat and 2+2 data. |
| OUTRUNNERS     | The reference has 30 stages and 10 goals over both courses; connections are to be confirmed. Candidates: 911 SPEEDSTER 1989, RX-7 (FC3S) 1989, COBRA 427 (year open), ELDORADO (Biarritz; generation open), MINI (1967 Cooper S 1275), QUATTRO (1989 20V).                                                                                                                           |
| COOL RIDERS    | Stage nodes: prestage 1, stages 1–4 with 3, 9, 15 and 21, final NEW YORK 1 (fifty); each of three main routes runs 1, 3, 5, 7 with shared and merging nodes. The full exit table is open. VMAX 1200: 1989 export; RG500 Γ: 1985 road model; GL1500: 1988–1989; SUPER CUB 90: a late-1980s model.                                                                                     |
| FINAL LAP      | 1987 car candidates: Williams-Honda FW11B, Lotus-Honda 99T, McLaren-TAG Porsche MP4/3, March-Cosworth 871. Whether SUZUKA follows the reference game's layout or the real 1987 or 1989 circuit is open.                                                                                                                                                                              |
| WEC LE MANS 24 | 962C and C9 in their 1989 Le Mans specifications; reference cars Joest #9 and #63 are candidates. Qualifying and race outputs are not mixed.                                                                                                                                                                                                                                         |
| BIG RUN        | Reference route toward Dakar: Tunis, Tozeur, Tumu, Agadez, Bamako, Saint-Louis; the mapping to stages is unverified. A rally-raid 959 is a different vehicle from the road 959; 205 T16 is not the 205 GTI; PAJERO generation is open.                                                                                                                                               |
| RALLY STAGE    | Provisional courses: FOREST (tarmac, gravel, tarmac, gravel), MOUNTAIN (narrow tarmac, gravel climb, mountain tarmac), COAST (fast tarmac, dirt, wet tarmac), WINTER (tarmac, snow, packed snow, tarmac). Vehicle years, valve variants and Group A references are open.                                                                                                             |

### Time-based authoring

Implement a timeline-based fitting workflow. For the selected vehicle, observations contain interval
start/duration, turn direction, speed ratio to maximum speed, and relaxed/fast/limit headroom.
Hills, environments, sprites and checkpoints use timestamped landmarks.

Use the vehicle limits model ([Drivers](content-and-gameplay.md#drivers)) and explicit authoring defaults, initially:

```text
u(relaxed, fast, limit) = (0.55, 0.75, 0.95)
v = speedRatio*maximumSpeed
R = v²/(u*lateralLimit(v))
arcLength = v*duration
```

Fit a new CourseDocument without requiring a template. Keep fitting and iteration outside compiler/runtime.
Initial pacing goals are ±10% per interval and ±3% overall. Compare continuous reference driving with
observations, revise explicit speed ratio, utilization and interval lengths, and record geometric or
vehicle-infeasible intervals as remaster departures. Footage and vehicle choices remain content inputs.

### Inspection and art

The course editor is the human inspection and adjustment view over the file/CLI workflow. Decide the default rounding
steps and joining tolerances of its cleaning operations while producing the first product courses, and which findings
become build rules once those defaults hold. Show anchor displacement after geometry changes if producing courses
needs it. Before master-course production, document/compiler versions can advance without migration readers; replace
development inputs with the corresponding version.

Develop production sprites, BG and tunnel artwork. Inspect distant sprites, source-camera/variant
sampling, palettes and braking lamps on real devices. Preserve the authoring goals of dimensioned
markings, boundary treatments and seeded visual variation through the Strip model; ground
appearance and physical bindings stay independent. Saved generated artwork and recipes are inputs,
with descriptive provenance and reproducible builds; an embedded image-generation service is optional.

The workbench opens and saves a local checkout's `content/` folder directly where the browser allows it, once an author
works from a checkout; until then its changes leave as an archive.

### Calibration, time margins and forks

If a later course admits both a cycle and branches (for example a pit lane), generalize the
cycle-closure check from walking the single circuit cycle to every directed cycle.

Tune physical parameters, tire sound and driver difficulty, including vehicle-specific tire settings;
reintroduce per-vehicle or per-axle tire parameters only when this tuning needs them. Add asymmetric
(rebound-only) suspension damping only if landings bounce. Size terminal runouts for paced rivals at the minimum pace
utilization; runout admission still checks the fixed 0.75.
Use continuous tool reference runs that complete reproducibly and use different vehicles' capabilities
comparably; review proposed checkpoint margins against the resulting driving experience. FREE PLAY and
TIME TRIAL have no time limit. Reference driving stays outside builds. Review the complete 32-vehicle
scene (sixteen competitors and sixteen traffic vehicles) with graphics and audio on named devices. Establish device capacity/performance budgets from the whole
application. Measure color-table preblend memory per km on the product courses (a two-lane road was about 0.3 MB per km;
a dense 21 km probe used about 121 MiB). If it exceeds the device budget, build preblend levels only
for the route window instead of the whole Section.

Review fork transfer over vehicle, speed, initial-state and material ranges, including three-way
outer-to-outer travel, response time, bike attitude, combined tire demand, yaw/slip, width and median
transitions. Review pre-lock query coverage and parent-specific exit visibility separately from transfer
space. Record margins and remaster departures with the content.

Add surface materials to the one game-wide material catalog as product courses need them (courses reference material IDs; there are no per-course material documents), with physical and sound values tuned on those courses: kerbs (circuits), gravel traps, concrete (streets, run-offs, pits), packed snow, mud and shallow water (off-road), and cobblestones. Kerbs and cobblestones rely on sound for their vibration unless a material roughness is added later.

Section lighting for vehicles: lighting is an attribute of environment intervals, so Sections may switch vehicle
palettes (for example a night section), adding a lighting axis beside color in the set's palettes, each recoloring
slots 1–14 of every picture, lit headlamps included, with the brake lamp's off and on colors per lighting. Each vehicle uses the lighting at its own chainage,
and switching is a cut.

### Pending product decisions

- Vehicle sprite resolution: generated picture sets have 64 yaw images (5.625° apart; the provisional ones 48); the
  two-wheeler bank count (currently 5) is still to decide before producing final bike art. The sprite set format
  declares both as data.

| Area             | Decision or future capability                                                                                                                                                                                |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| References       | Exact editions/layout evidence, tolerances and remaster departures                                                                                                                                           |
| Series values    | Rank limits, ahead distances, pace ratios, laps, grid spacing, colors and margins per class (Stage 16 playtests)                                                                                             |
| Series values    | TSUKUBA CLUBMAN's pace ratios (1.02 at the pole to 0.88), margin 1.35 and 5 laps on real devices; a rival reaches its 95% ceiling at about 1.02, so the pole has no room above it                            |
| Grids            | Whether grid slots take a free lateral: TSUKUBA's bike slots stand at lane centres, about 5.7 m apart, wider than the real grid's about 4 m                                                                  |
| Rivals           | Whether one-make rivals' pace ratios are shuffled each run (today each slot keeps its own)                                                                                                                   |
| Series content   | SUPER HANG-ON reference layouts; CISCO HEAT course type; COOL RIDERS connections, rivals and traffic; FINAL LAP layout and cars                                                                              |
| Series content   | WEC LE MANS 24 layout and field; BIG RUN vehicles and field; RALLY STAGE title and course set                                                                                                                |
| Vehicles         | Exact specifications of adopted vehicles (year, market, grade); BROUGHAM TUNED values                                                                                                                        |
| Circuits         | Series or FREE PLAY placement of the selected circuits below                                                                                                                                                 |
| Tunnels          | Whether tunnel sides and ceilings are drawn by the renderer like walls (a ceiling is a second surface above the road), replacing sprite frames                                                               |
| Walls            | Whether walls take the ground's arrow, text and curb constructs as well as strip and repeat (when a product course needs them)                                                                               |
| Walls            | Whether wall friction varies by wall rather than being one game-wide `barrierFriction`                                                                                                                       |
| Walls            | Whether walls' preblend memory (about 1.3–2.5 MB per km of cliff, about 0.3 MB per km of road, as measured on a development course) fits the device budget                                                   |
| Rivals           | Whether rivals follow closer than traffic (in dense traffic they keep the 1.5 s following time and queue)                                                                                                    |
| Rivals           | Whether an ahead entry's lane is checked where it appears rather than against the course's fewest lanes (Stage 16)                                                                                           |
| Drivers          | Whether steering lookahead and response change: a lane change at about 47 m/s overshoots by about 1.7 m (with the rival racing line)                                                                         |
| Traffic          | Whether traffic speeds vary or density changes: one speed lets it fill both lanes of a two-lane road; lane drivers never pass                                                                                |
| Interaction      | Whether a slight front-face overlap with a solid object deflects the vehicle instead of stopping it (real devices)                                                                                           |
| Interaction      | How far a vehicle rebounds from a solid object (about 7 m/s back from 40 m/s today; real devices)                                                                                                            |
| Grade separation | Occurrence/neighborhood/height selection of surfaces, landmarks and contacts at nearby crossings                                                                                                             |
| Front end        | Stage FE "Decisions for K" ([below](#stage-fe-decisions-for-k))                                                                                                                                              |
| Test course      | Stage OT "Decisions for K" ([below](#stage-ot-decisions-for-k))                                                                                                                                              |
| Front end        | FREE PLAY wallpaper and title music (black and silent today; its SELECT MUSIC offers every track and MUSIC OFF)                                                                                              |
| HUD              | Whether the steering picture's ratio to the front wheel's angle is per vehicle (one per form today)                                                                                                          |
| HUD              | Whether the top bridge picture follows each bike's own, and a steering wheel picture for formula cars                                                                                                        |
| HUD              | Whether the upper rows (TIME, POS, LAP) take the lower row's look                                                                                                                                            |
| HUD              | Whether HUD text has a backing (none today)                                                                                                                                                                  |
| Steering         | Whether the default steering rule keeps a 7 m lane change at 240 km/h from overshooting: the cone-row scenario approaching from 120 m knocks 7 of its 10 objects, so it approaches from 160 m (real devices) |
| Steering         | Which one front tire use at full steering the product keeps (real devices); SETTINGS then drops the choice. Until then the three choices move a player's cornering speed by about ±2.6% against the AI       |
| Steering         | Whether the steering lever takes other lengths (such as the wheelbase, a rear-wheel reference) or is fixed at one design value                                                                               |
| Steering         | Future, not built now: if a DRIFT series is made, series-level rules for scoring, steering and camera open then, by which the series guarantees its experience; until then SETTINGS alone owns them          |
| Camera           | The horizon row (DEV 60–120 rows; 120 today)                                                                                                                                                                 |
| Bank             | How the displayed vehicle bank follows lean (real-device evaluation)                                                                                                                                         |
| Art              | Production assets, new physical materials and tunnel/background content                                                                                                                                      |
| Vehicle art      | Two-wheeler pictures: whether the rider is part of the generated solid, and the bank axis and base point                                                                                                     |
| Vehicle art      | Whether cones and barricades are also generated from solids                                                                                                                                                  |
| Vehicle art      | Pictures of a stopped vehicle's wheels (generated pictures always show them turning)                                                                                                                         |
| Vehicle art      | Whether mirroring halves the direction pictures a set stores                                                                                                                                                 |
| Vehicle art      | VFR750R's four colors once its pictures are generated: the real tricolour and three fictional racing schemes                                                                                                 |
| Weather          | Falling rain over wet sections (WET_ASPHALT lies under an overcast sky without rain today)                                                                                                                   |
| Ground           | Which of LEVEL-POINT and LEVEL2-POINT is the product default (real devices); the other and its cells are then removed                                                                                        |
| Audio            | Whether a decoded track (about 63 MB for three minutes of stereo at 44.1 kHz) fits the devices' memory budget                                                                                                |
| Audio            | Whether the music, passing the master compressor with the engines, pumps with them (real devices)                                                                                                            |
| Audio            | Whether impacts need finer recordings than one per counterpart (by wall sound, by object or by strength)                                                                                                     |
| Audio            | Whether other vehicles' contacts sound, and how many other vehicles have voices (after measuring the 32-vehicle scene on devices)                                                                            |

### Stage FE decisions for K

Choices made where Stage FE left them open, each recorded in its PR:

- Pictures: the area filter weights color by alpha; median cut runs on RGB555 channels; the course image recipe keeps
  its version (skies unchanged, no re-measure).
- Effects: `new-record` sounds as RESULT appears (after the 1.3 s outcome effect at the default delay; DEV delays of 0
  and 1 s overlap them).
- Menus: OPTIONS and LAPS keep vertical lists; PAUSE, RESULT, LOAD FAILED and CLEAR RECORDS? are carousels; a single
  item draws no arrows; no screen advances during a transition (READY's countdown starts fully bright); SELECT
  SERIES draws no arrows with one series.
- Music: MUSIC OFF is saved as the latest music choice `off` with no player record version change; the SETTINGS
  audition plays the first track after MUSIC OFF.
- Color display names (13 characters at most, for SELECT VEHICLE's unchanged color line): 911 TURBO 3.3 SILVER,
  BLACK, GUARDS RED, GP WHITE; TESTAROSSA ROSSO CORSA, GIALLO MODENA, BIANCO, NERO; GOLF GTI 16V TORNADO RED, ALPINE
  WHITE, BLACK, SILVER; DELTA HF INTEGRALE BIANCO, ROSSO MONZA, BLU LANCIA, NERO; CORVETTE C4 BRIGHT RED; FXRT SPORT
  GLIDE VIVID BLACK; every other color its plain name. To confirm or replace.
- SELECT CLASS: BIKES when the whole field is bikes; with several vehicles row 26 counts them; BEST is the class's best
  at any goal, counted only while its identities are current (course index version 3 carries each course's build
  identity); `--'--"--` as specified although times show thousandths.
- PRE-RACE: the start bar stands at the entry Section's origin; a BRANCH map takes each fork's first exit; FREE PLAY has
  no BEST line; RETRY passes the card too; the course format change changed every course identity, so records saved
  in browsers no longer count (reference times were re-measured, unchanged).
- TITLE: the mode line starts on the latest mode. Attract demo (FE-8b): the demo picture brightens and darkens over
  the transition's steps while the logo and lines stay; a turn's 30 s include its brightening and darkening; the
  classes of one course share one compiled course; every class's Session stays alive (about 6 MB of heap for the
  three TSUKUBA CLUBMAN classes together, 71 MB with the first alone). Stage LD replaced this: the demo holds only
  the shown and the next class's Sessions.

### Stage OT decisions for K

Choices made where Stage OT left them open, each recorded in its PR:

- FE-10: a wallpaper change asked for while a black transition runs still finishes through black; only a steady screen
  cuts.
- Tests (OT-1, OT-2): the TSUKUBA ARCADE scenario's player is 911 TURBO 3.3 against GOLF GTI 16V rivals at pace 1; the
  scenarios are split in two files, neither over about 30 s. The images only RIBBON used (cones, barricade, fork signs,
  tree, hill sky) stay for OUTRUN TEST.
- Structure (OT-3):
  - The course document is generated from a stage table.
  - Every stage starts with two 3.6 m lanes, level at height 0. Forking stages end at 0 and goals at their own height.
  - The fork's lock is 600 m before the stage end, because route loading needs 484 m past it. The two roads run side
    by side with a 4 m median before they part.
  - The checkpoint is the seam.
  - The startup smoke compiles OUTRUN TEST (about 5 s), and no test drives it.
  - Traffic is GOLF GTI 16V, DELTA HF INTEGRALE and 911 TURBO 3.3.
- Reference driving (OT-3b): no scenario was added for the right-exit defect. The measured report shows that class of
  defect, a right exit far slower than its left.
- `WET_ASPHALT` (OT-4): grip 0.7 and rolling resistance as ASPHALT. Its sound has a +6 dB high band and susceptibility
  0.7, to tune on real devices.
- Transitions (OT-5):
  - A wipe lays both maps on the incoming map's scroll. The generator keeps yaw origins along each stage's left-most
    predecessor, so a seam join from the other predecessor arrives turned by the difference of their headings.
  - A rise keeps each map's own scroll.
  - A wipe's direction comes from the road's turn over the 150 m ahead (threshold 0.05 rad).
  - A transition takes 1 s. A new crossing during one starts from the map being brought in.
- Pictures (OT-6 to OT-10):
  - Fixed scenery carries a flat contact shadow in its picture. Outlines are 2 px, lit from the upper left.
  - Verge scenery, stone gates, overpasses and gantries are pass-through. Guardrails, rock faces, barriers and building
    fronts are solid walls.
  - Sea stacks stand 38 m below the road.
  - The tunnel portal stands only at the entrance, because sprites face the camera.
  - The mesa is 35 m wide, drawn at half scale under the 1,048,576-texel sprite limit.
  - LAKESIDE reuses the existing `sail` picture.
- Wet stretches (OT-7 to OT-10):
  - The overcast sky arrives by wipe 150 m before the wet road and clears 100 m after it.
  - Tunnel exits arrive by cut and clear by wipe.
  - ALPINE PASS's storm arrives and leaves by rise.
- Timing: GATEWAY, CLIFF ROAD, TUNNEL RUN, ALPINE PASS and FOREST were shortened to bring every award within 80–100 s;
  OT-last gave FOREST one bend back (79.1 to 82.3 s).
- INTERCHANGE's heavy traffic: traffic density is a series setting, so INTERCHANGE's extra lanes carry the series'
  traffic rather than a denser stream.

### Selected circuits

These real circuits remain production selections, using their 1989 layout with the identifying notes below.
Series courses are listed in the [product specification](product.md#5-series).

| ID  | Course                                  | Reference / identifying note                                                          |
| --- | --------------------------------------- | ------------------------------------------------------------------------------------- |
| C01 | Nürburgring Nordschleife                | Germany, 1989                                                                         |
| C02 | Spa-Francorchamps                       | Belgium, 1989; 1983–93 layout                                                         |
| C03 | Circuit de la Sarthe / Le Mans          | France, 1989; before Mulsanne chicanes                                                |
| C04 | Autodromo Nazionale Monza               | Italy, 1989 GP road course                                                            |
| C05 | Silverstone Grand Prix Circuit          | UK, 1989; 1987–90 layout                                                              |
| C06 | Laguna Seca                             | USA, 1989; 1988–89 layout                                                             |
| C07 | Mount Panorama / Bathurst               | Australia, 1989                                                                       |
| C08 | Interlagos / Autódromo José Carlos Pace | Brazil, 1989 long layout                                                              |
| C09 | Monte Carlo / Monaco                    | Monaco, 1989                                                                          |
| C10 | Phillip Island Grand Prix Circuit       | Australia, 1989                                                                       |
| C11 | Mugello Circuit                         | Italy, 1989; 1974–90 family                                                           |
| C12 | TT Circuit Assen                        | Netherlands, 1989 long GP layout                                                      |
| C13 | Road America                            | USA, 1989                                                                             |
| C14 | Brands Hatch Grand Prix Circuit         | UK, 1989; 1988–98 family                                                              |
| C15 | Suzuka Circuit                          | Japan, 1989; figure eight with lower tunnel                                           |
| C16 | Tsukuba Circuit                         | Japan, 1989; four-wheel layout, 2,045 m, without the motorcycle chicane added in 1990 |
