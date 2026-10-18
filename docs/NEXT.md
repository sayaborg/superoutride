# Next task checkpoint

## Current state

- One compiled graph scene serves TSUKUBA and the trial courses OUTRUN TRIAL A and A STEEP with RACE, TIME ATTACK and
  FREE PLAY runs.
- TSUKUBA, the first product course, is timed by TSUKUBA CLUBMAN, the first product series, with its PRODUCTION 750,
  GTI CUP and 911 CUP classes ([Product courses](content-and-gameplay.md#product-courses)).
- Course documents use plans of straights and arcs, positions measured from joints, lanes, Lateral values, Strips
  and gates.
  Circuits are closed cycles of two or more Sections.
- One manifest verifies all delivered content, including vehicle and game-wide driving definitions and surface materials.
  The content build compiles every delivered file from authored documents in one pass.
- Surface color and material are authored with Strips, and ground and walls are drawn by LEVEL-POINT alone; sprites are indexed.
  BG is one infinite tiled plane with a linear vertical row mapping.
- The measurement tool (`npm run measure`) saves each course's racing lines and, for each course a class runs, its
  vehicles' reference times and pace schedules under `content/`, with the vehicle, course and procedure identities they were
  measured for; the build admits and delivers them and runs no driving, and a run applies its class's margin. Vehicle and course identities derive from delivered
  document SHA-256, procedure identities from each procedure's record. Tire audio uses UNIFIED.
- Engine sound load is the powertrain's effective opening.
- Stage 10 is complete: the race owns competitor mechanics in fixed steps and publishes facts (time-ordered events,
  Route with its fork choices, borrowed competitor observations); drivers intend lanes and target exits, rival exits
  derive from the run's seed; loading coverage, recovery policy and reference identities each have one owner.
- Stage 11 is complete: the audio scene and sound graph are separate from the browser; engine sounds, surface sounds
  and the game-wide sound settings are content documents; every sound value is derived from physics or a DEV setting;
  exhausts are collector graphs.
- The [product specification](product.md) is the target for Stage 16. Series documents hold classes: each class is
  one complete race definition (course, laps, vehicles, field, traffic, time margin and colors), and a course may be
  run by several classes and series; measured products belong to course and vehicle, and a run applies its class's
  margin; FREE PLAY rivals are drawn from vehicle pools.
- Stage GS is complete: there is no MODE. TITLE's line is SERIES / FREE PLAY / SETTINGS; a series holds no rule values
  (series document version 13), and SELECT SESSION drives a class as RACE (the former ARCADE run) or TIME ATTACK
  (alone; on a circuit without a finish, ended by PAUSE's QUIT). Records are TIME ATTACK's alone, one table per class
  (player record version 6). Reference runs are FREE PLAY runs alone. "Session" is only the product term RACE / TIME
  ATTACK: one driven attempt is a run (`RunSetup`, `RunConfiguration`, `RunRulesRequest`, `RunVehicle`), whose rules
  are RACE, TIME ATTACK or FREE PLAY. GS-3 was split into GS-3a (the TIME ATTACK run and the run without a finish) and
  GS-3b (TIME ATTACK records).
- Stage 12 is complete: the front end runs inside the frame from TITLE through RESULT, with SETTINGS and `dev=1`; the
  product HUD is drawn with the text layer from race facts and the player's observation, and DEV measurements stay with
  `dev=1`; the player record keeps settings and the TIME TRIAL and ARCADE records shown at READY, at TIME TRIAL
  crossings and on RESULT; all UI is English.
- Engine sound that lagged and stayed late on some devices no longer does on the owner's device (2026-10-14); its
  cause was not identified. With `dev=1` the audio timing line still measures the AudioContext's latency, clock and
  worklet overruns ([Browser](browser.md#performance-hud)).
- Stage 13 is complete: vehicles have overall dimensions and road-aligned footprints that contact vehicles, walls,
  course limits and roadside objects through one external force on the ordinary mechanics; Carriageways have lanes,
  drivers follow lane centres, change lanes past slower vehicles or follow them and merge where their lane ends; traffic
  appears at seeded Route positions from the series or FREE PLAY's TRAFFIC option.
- Stage 14 is complete: the AudioContext runs while the page is visible and the vehicle sounds only while a run is
  driven; recordings (AAC in MP4) and music documents are delivered and admitted; SELECT MUSIC chooses the run's track,
  which starts at READY, loops, pauses with the run and fades under the GOAL or GAME OVER jingle; countdown, crossing,
  extension and menu effects sound from race facts and menu commands; the player's impacts are recordings at a volume
  from their work; the player record
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
  a prototype rendered from a 3D model with its rider and seven banks, five greys and three paint ramps; the other
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
- Stage OT is complete. RIBBON is deleted. OUTRUN TEST
  ([Test course](content-and-gameplay.md#test-course)) is offered without DEV in every mode and the attract demo:
  - 15 generated stages over 16 routes, each measured at 80–100 s for TESTAROSSA.
  - Drawn pictures and skies.
  - `WET_ASPHALT`, `DIRT` and `SAND` on the carriageway.
  - `wipe`, `rise` and `cut` background transitions owned by the environment.
    Merges, closed roads, rank limits, ahead entries, movable objects, reversing beyond the entry and departures have no driving scenario since OT-1 (K's decision); of the six scenarios, one drives a rival through an OUTRUN TEST fork.
- Stage LD is complete: a course compiles in work slices the browser runs 8 ms at a time, so loading never stops the
  frame loop (the longest gap loading OUTRUN TEST fell from about 14 s to under 100 ms in headless Chromium); the
  preblend averages finer cells and the color ground is packed, so OUTRUN TEST holds about 150 MB instead of 465 MB;
  the attract demo holds only the shown and the next class's runs.
- Stage HD is complete: the HUD tiles command writes every text-tile pattern from the HUD design sources and rules
  ([Image assets](image-assets.md#hud-design-sources)): the normal font with ▲ ▼ ◀ ▶, the ornate small and large
  fonts in six styles, italic segment digits, a 26-bar italic tachometer, the signal lamp and the triple-chevron road
  arrow; the HUD and RESULT use the fonts by the mapping in [Browser](browser.md#hud).
- Stage AI is complete: every course has measured racing lines; one planned driver, from each vehicle's limits model
  at a utilization, drives rivals, traffic, reference runs, the attract demo and the takeover; rivals and the player's
  run driver drive the racing line and pass, give room and yield by path offsets, traffic keeps its lanes;
  envelopes are gone; SLOW DOWN warns the player from the same plan ([Drivers](content-and-gameplay.md#drivers),
  [SLOW DOWN](browser.md#slow-down)).
- Stage VS2 is complete: SELECT VEHICLE turns through ENGINE, DRIVETRAIN and CHASSIS, 6 s each; DRIVETRAIN draws
  each gear's engine speed against road speed; ENGINE revs the shown vehicle's engine standing still through the held
  update READY uses, marks its speed on the curves and sounds it with the player's engine voice, the live gate opening
  while a vehicle is driven ([SELECT VEHICLE](browser.md#select-vehicle), [Audio](audio.md#mix-and-lifetime)).
- Stage EX is complete: each engine sound writes its exhaust from the valves to the tailpipes, every tube by length and
  diameter from references and estimates; pipes lose by their radius (√f), junctions scatter by cross-section and the
  valve end reflects by the valve's open area; the output low-pass, DC removal and pulse decay follow from the vehicle
  (`compressionRatio` joins the mechanics); overrun pops are gone; every engine enters its soft clip at MIX's
  `engineDriveLufs` by a measured loudness, a measured product (EX-5 was split into EX-5a and EX-5b); ENGINE draws the
  exhaust true to length and cross-section at one scale. ENGINE keeps seven DEV values.
- Stage EX2 is complete: the wall loss follows Kirchhoff's `sqrt(f)` through four shelves in parallel form (the
  engine loudness measured again); the exhaust kernel renders in blocks over flat arrays, its output unchanged; ENGINE
  draws tubes in proportion to their diameter, each junction as one bar, shaded once as one shape. EX-10 made the
  owner's DEV ENGINE values the defaults, with MIX's `engineDriveLufs` at −24 so that the engines seldom reach the soft
  clip and `clipCeiling` at 1.
- TN-1 is complete: sliding along a wall makes no sound, only the hit's recording sounds (the walls' sound records and
  the solid wall's `sound` are gone, course version 52); the tire's friction sound Q follows a physical law: its feedback
  depends on the slip speed and the surface alone, its forcing on the friction power per load, its pickup on the
  load's square root, and the vibration's speed stops at the slip speed (audio document version 8).
- Stage TP is complete: every vehicle in view throws tire puffs by the surface under it
  ([Tire puffs](tire-puffs.md)): smoke when sliding on ASPHALT, spray on WET_ASPHALT, dust on SHOULDER, DIRT and SAND
  when rolling and sliding and on GRASS when sliding. Rolling throws one per distance, sliding one per amount of friction
  work beyond the tire law's peak (the tire observation's `slidingPower`, K to confirm this reading of
  "work on the plateau"), so wheel-slip protection holding a tire there throws none. Puffs move by one law with values
  the puff document holds and DEV's PUFFS group changes; they are opaque pictures without shadows, ordered by depth with
  the player among the pictures, at most 256 alive. Vehicle mechanics publish front and rear tracks (CHASSIS shows a
  four-wheeler's). TP-5 was split: TP-5a gave the sprite recipe named palettes, TP-5b drew the pictures.

Next PR: [VC-5e2c](#stage-vc--courses-from-footage) while VC-T waits on K, and [DT-3](#stage-dt--drift-tuned-trial-vehicles)
once K decides, then [Stage 16](#stage-16--produce-product-courses).

Implement the stages in order. Each PR's restart instructions supply its detailed requirements.
Topic contracts belong to the topic specifications; development and release procedure belongs to AGENTS.
PRs hold rationale and verification evidence. Each stage first consolidates the structure its later PRs consume.

## Stage VC — Courses from footage

Stage VC builds the footage tool ([Courses from footage](footage.md)) and proves it on fake footage of OUTRUN TEST
against known truth. Afterwards, each time K supplies videos of an original's course, the implementer raises the course
by the [procedure](footage.md#procedure) alone. It ends before Stage 16 produces the OUTRUN, SUPER HANG-ON and CHASE H.Q.
courses, and it raises none of them itself.

K decided it runs in parallel with other stages, in its own sessions and branches. It touches the tools, the
specifications and, where replay needs it, a generalization of the renderer (a frame size or pose as an argument, never a
branch for an original); never audio, vehicles or physics, so it shares only NEXT, the specification index and
Development with other work: when main moves, the branch is brought up to it and validated again before main is
fast-forwarded.

Rules of the stage: the trial courses (OUTRUN TRIAL A and A STEEP) and the driving scenarios do not change; reference
driving is not fitted to an original's times. The tool is kept simple so that real footage passes early: what a person
sees in frames (color roles, the HUD, masks, the gauge, the pitch rule, the draw distance) is written in the footage
model, and the tool's own judgement of it only checks it and reports a disagreement; thresholds inside the tool are
named defaults (the rule against constants without a basis stays the product code's); the background never shapes the
course. Development checks run on one stage of the fake videos; the full round trip runs once, in VC-9. Each PR
proceeds without waiting for approval and stops at the [stopping conditions](footage.md#stopping-conditions).

- VC-T: a trial on OUTRUN's first stage (COCONUT BEACH), on K's video, before VC-5e2c. Ingest, census, features,
  calibrate and solve (plan, and the profile as far as it then goes), video by video, on the stretch of the stage where
  the player drives, which the implementer marks in the capture values with the start's and checkpoints' times where
  they show. The implementer writes what a person writes (color roles, HUD templates and timing events, masks, the
  gauge TESTAROSSA, the pitch rule, the draw distance, the edition where known) in a provisional footage model, made
  again from every video when a second arrives and not frozen until then. Faults a generalization of the tool fixes are
  fixed; a matter of course is reported with numbers and product-side diagrams, and the work stops.
  - Done on K's video `k1` (1440×1080, 60 fps, 65 s): ingest finds the whole 320×224 frame (VC-T1); the speed is read
    though the HUD is drawn over the picture (VC-T2); the stretch from GO (4.55 s) to the fork's beginning (53.33 s) is
    marked (VC-T3); the provisional footage model and the speed templates are in `reference-media/outrun/`.
  - Stopped at calibration, for K to decide. The video was scaled smoothly (`onGrid` 0.40 on both axes), and the road's
    light and dark colors are one RGB555 step apart (`8c8c8c`, `949494`), so each row where the stripes change is a
    blend of the two and reads as no known color. `K` moved from 748 ± 8 to 1194 ± 19 when the player's column moved
    by 4 px, and the player's picture joins such rows to its mask's edges (its width is the mask's, 100–104 px), so
    `f`, `h` and `D′` are not measured; the plan under `road` does not converge (112 rounds). The ways on: a video
    scaled by nearest pixels; or stripe edges and the player's picture read from luma changes rather than from color
    classes, a generalization of the tool.
- VC-5e2c: the hills in the initial estimate, as far as the footage shows them: `roadTop` as a profile observation
  where a crest cuts the road off: the row of the point where the line of sight touches the road, entered through its
  derivative there (the envelope theorem), only where the ground or background lies above it and no picture or other
  road hides it, and never where the road reaches the draw distance, which a person writes in the footage model
  (checked against `roadTop` on level straights). Its report, on one stage of each fake video: the profile's vertical
  curvature error per 50 m window (median), the crests' and jump's place errors, the pitch rule's check; on `hills`,
  the inconsistency amount rising over the corrupted stretches and nowhere else; the plan no worse than VC-5e's (20 m
  windows' median).
- VC-5e2d: the grades' weight and the pitch check count the readings the fit with every height free counts. The plan
  alone leaves out, as outliers, the readings a level road cannot fit, so it fits the rest at their noise level: under
  `road` the grades take the heaviest weight on COASTLINE and FARMLAND (`a`, `c`) and the profile stays level, and on
  the `level` video's COASTLINE the check finds no grade and takes `road`, while the fit under `level` recovers the
  hills (the hill windows' vertical curvature error 1.7e-5 against the truth's 6.4e-5).
- VC-5h: the course document: widths and lanes, start, fork beginnings, checkpoints and goals, the partition, and several
  videos together: their [alignment](footage.md#several-videos-of-one-course) and one solve over all of them. On fake
  footage, feature sequences are cut to begin and end mid-course (the videos are not made again); with two or more of
  K's videos, the alignment is checked on them too.
- VC-6: appearance: Strips, color changes, materials and environment knots.
- VC-7: sprites: tracking, place and size, kinds and rows, outline boards and their placement, the outline taken from the
  nearest frame that shows the thing unhidden. Refining over several frames, and finding pictures that change with
  distance, animation and mirroring, only where the implementer sees in frames that a kind needs it. The gauge's check on
  traffic pictures stays.
- VC-8: replay and the comparison (`replay`): each video replayed beside the original, and a map of the residuals along
  `s`, per cue (lines, stripe edges, `roadTop`) and octave of depth. The implementer corrects the course with the course
  commands and the partition, until the residuals are within the noise level or explained as the original's lies; no
  optimization through the renderer, no leave one out.
- VC-9: the full round trip (`roundtrip`) once: `a`, `b` and `c` (60 and 30 fps, compressed), `player` and `level`
  pass; `hills` and `background` are reported only. What is no longer used (the background's rules and their record, the
  frame measurement tool `tools/course/measure.ts` and its formats `superoutride.frame-measurement` and
  `superoutride.course-observations`) is deleted in a PR of deletions alone; whether the background's shift leaves the
  features is the implementer's call, weighed against measuring again.

## Stage DT — DRIFT TUNED trial vehicles

Stage DT lets K try on devices whether a DRIFT SERIES ("いかす走り屋チーム天国") can work: S13 and AE86 DRIFT TUNED
are driven in FREE PLAY; FC3S follows once K decides its open points. A series, scoring and series rules for the camera
or steering are not made in this stage (the Steering row of [Pending product decisions](#pending-product-decisions)).

K decided it runs in parallel with Stage VC, in its own sessions and branches. DT touches
vehicles and physics, which VC does not, so it shares only NEXT and the other shared documents with VC: when main moves, the branch is brought up to it and validated
again before main is fast-forwarded.

K's decisions for the stage:

- A vehicle may give its own tire and `wheelSlip` (TCS, MSR and ABS); a vehicle that does not uses the driving
  definition's game-wide defaults, which stay there while the game-wide tuning is unfinished. Neither is a difficulty
  or player choice ([Vehicle identity](product.md#vehicle-identity)).
- A DRIFT TUNED vehicle is a vehicle of its own (another specification of the same model): its pictures are the real
  car's, its tires and engine need not be. DRIFT TUNED vehicles have `wheelSlip` off (one switch for TCS, MSR and ABS).
- Drifting needs a tire of its own: S13 `gripX=gripY=0.8` and AE86 0.7, both with `peakSlipX=peakSlipY=0.1`,
  `knee=0.74`, `loadSensitivity=0.15` and the sliding ratio 0.85 (DT-6; DT-2 started both at 1.1 with no fall), which K
  tunes in DEV; FC3S's is decided with DT-3.
- `AE86_DRIFT_TUNED` (Corolla Levin 3-door GT-APEX, early, May 1983 – May 1985, 4A-GEU, 5MT), `S13_DRIFT_TUNED`
  (Silvia K's, early, May 1988 – January 1991, CA18DET, 5MT) and `FC3S_DRIFT_TUNED` (Savanna RX-7 GT-X, early,
  October 1985 – April 1989, 13B turbo, 5MT).

- Planned drivers always drive with wheel slip protection (TCS, MSR and ABS act on the engine's effective opening and
  the pedal brake alone, so they are an input-side aid like the steering rule); a vehicle's `wheelSlip` holds while the
  player's input reaches it (DT-2b). Physics is the same for the player and the AI. A drifting AI is not made now.
- Shifts are one rule for every vehicle: they decide by the vehicle's speed, the driven wheels' speed rolling without
  slip, so wheels that spin, in a jump too, move no shift and the engine follows them to the fuel cut (DT-4).
- A tire has a sliding ratio, its force sliding far past the peak over the peak's force, held by the driving
  definition's tire and by every vehicle's own tire: 1 (the force holds the peak, as today) on all but the DRIFT TUNED
  tires. The wheel solve takes the force's fall past the peak at the substep's starting wheel speed, so it keeps one
  root at any sliding ratio (K's choice of the DT-5 report's options; DT-5).
- Planned drivers sometimes spin the DRIFT TUNED cars despite wheel slip protection, which K accepts until the drifting
  AI, designed to catch a slide past a falling tire's peak: a planned driver catches none, and with the drift tire
  braking at the limit in a corner takes a wheel past it (K's choice of the DT-6 report's options; DT-6).

S13_DRIFT_TUNED and AE86_DRIFT_TUNED are in the catalog (DT-2) with the drift tire and `wheelSlip` off. K tries them
in FREE PLAY with no rivals on TSUKUBA with the MOVING camera and FRONT steering, S13 first, tuning GX, GY and SR in DEV
and adopting the exported mechanics document. Until their own pictures and exhausts are made, they borrow:

- Pictures: GOLF GTI 16V's set. Their own come from GLB models, with their own exhausts at the same time. The color
  names stand for the real paints, the borrowed pictures' colors do not match them: S13 CRANBERRY RED, WARM WHITE,
  BLUISH SILVER and LIME GREEN (the two-tones named without "two-tone"); AE86 HIGH FLASH, HIGH TECH, HIGH METAL and
  PENDING. AE86's fourth color awaits K: the early GT-APEX may have had only the three two-tones.
- Engine sounds: S13 DELTA HF INTEGRALE's (inline four, turbocharged), AE86 GOLF GTI 16V's (inline four, 16 valves)
  ([exhausts](calibration.md#exhaust-topologies)).
- DT-3, after K decides: FC3S DRIFT TUNED. K decides how 13B is represented (a rotary engine kind: the 2-stroke volume
  rule in physics, ROTARY on screen, one exhaust per rotor per revolution in the engine sound) and whether its pictures
  are shared with OUTRUNNERS' RX-7 (FC3S), whose 1989 candidate would be the late model; its colors are decided then.

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
together use every run rule component. The following production and authoring goals
are collected from the topic specifications; their order within this stage is not yet scheduled.

- TSUKUBA's remaining work: the bike's driving at the limit. At the reference driver's 0.9 utilization VFR750R weaved at
  full steering input from the final corner's entry and overturned on its exit, recovering 16 times in 30 laps; with the
  five-point torque curves (PT-1) its reference run completes without recovery. Bike handling at the limit is reviewed
  again once bike handling or the AI driving changes. Bikes slide 20–55° at the limit (VFR750R 28° on TSUKUBA, up to 55°
  on OUTRUN TEST); turning in while braking hard unloads the rear tire and saturates it: with Stage DV's steering on
  RL-1's lines, FXRT SPORT GLIDE's rear load fell to 480–820 N at TSUKUBA's first corner and hairpin, and it and R80 G/S
  PARIS DAKAR spun there; on RL-2's lines neither spins. The GSX-R750 joins the class once it is in the catalog. Solid
  barriers in place of the course limits at the verges; review of the scenery on real devices; signboard walls, which
  today are sprites standing in a row.

### Course format follow-ups

- Circuit closure: a circuit written in round lengths does not close. Before the first product circuit, decide how
  the tool solves the closing elements (the last arc's length and the last two straights' lengths) so that authors do
  not write the residual.
- Conditional solid objects: a sprite shown by a fork's choice (`unselectedLink`) may also have a body in the format;
  the race does not place such objects yet (cones lining the closed exit once a fork is decided).
- Wall Strips keep knots of their own because heights have no named lines; revisit with the first product walls.
- Oncoming lanes: a lane direction, when oncoming traffic is decided.

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

### Courses from footage

The OUTRUN, SUPER HANG-ON and CHASE H.Q. courses are raised from K's videos by the
[footage procedure](footage.md#procedure), two or more videos per course, once Stage VC is complete. Each course's
footage observations and report go with it; its time limits come from reference driving, as for every course.

### Inspection and art

The course editor is the human inspection and adjustment view over the file/CLI workflow. Decide the default rounding
steps and joining tolerances of its cleaning operations while producing the first product courses, and which findings
become build rules once those defaults hold. The findings are worked out after every change, so their time is the
author's wait (one worker, the default amounts): TSUKUBA 39 s (digits 0.2 s, unneeded knots 13 s, near and referable
27 s, merge kinds 0.3 s), OUTRUN TEST 13 min (digits 2.6 s, unneeded knots 18 s, near and referable 12 min, merge kinds
29 s). Show anchor displacement after geometry changes if producing courses
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

Tune physical parameters, tire sound and driver difficulty, including vehicle-specific tire settings: a vehicle's
mechanics document may give its own tire and `wheelSlip` (Stage DT); introduce per-axle tire parameters only when
this tuning needs them. Add asymmetric
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

- Racing line objective: the lines minimise `Σ m κ² + λ Σ len`, `λ` chosen by the reference driver's planned lap time
  (Stage RL, K's decision 2026-10-14; [Racing lines](content-and-gameplay.md#racing-lines)). Two follow-ups remain:
  - The minimum-lap-time line itself, an optimal control problem over path and speed, which needs a limits model with
    continuous gradients beside the planned driver's.
  - The gap between plan and drive: on TSUKUBA the chosen `λ` plans lap 2 at 54.43 s (911 TURBO 3.3), 58.26 s (GOLF GTI
    16V) and 52.82 s (VFR750R), and the reference driver drives it in 54.45 s, 58.33 s and 53.10 s: within 0.03–0.28 s,
    the most on VFR750R. On OUTRUN TEST and OUTRUN TRIAL A STEEP the chosen lines' planned gain (1.7 s and 0.16 s) is
    lost in the drive (+0.18 s and +0.41 s against the minimum-curvature lines).

- Vehicle sprite resolution: generated picture sets have 64 yaw images (5.625° apart; the provisional ones 48); the
  two-wheeler bank count (VFR750R's provisional set has 7) is still to decide before producing final bike art. The sprite set format
  declares both as data.

| Area             | Decision or future capability                                                                                                                                                                                                                                                                                                                                                            |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| References       | Exact editions/layout evidence, tolerances and remaster departures                                                                                                                                                                                                                                                                                                                       |
| Series values    | Rank limits, ahead distances, pace ratios, laps, grid spacing, colors and margins per class (Stage 16 playtests)                                                                                                                                                                                                                                                                         |
| Series values    | TSUKUBA CLUBMAN's pace ratios (1.02 at the pole to 0.88), margin 1.35 and 5 laps on real devices; a rival reaches its 95% ceiling at about 1.02, so the pole has no room above it                                                                                                                                                                                                        |
| Grids            | Whether grid slots take a free lateral: TSUKUBA's bike slots stand at lane centres, about 5.7 m apart, wider than the real grid's about 4 m                                                                                                                                                                                                                                              |
| Rivals           | Whether one-make rivals' pace ratios are shuffled each run (today each slot keeps its own)                                                                                                                                                                                                                                                                                               |
| Series content   | SUPER HANG-ON reference layouts; CISCO HEAT course type; COOL RIDERS connections, rivals and traffic; FINAL LAP layout and cars                                                                                                                                                                                                                                                          |
| Series content   | WEC LE MANS 24 layout and field; BIG RUN vehicles and field; RALLY STAGE title and course set                                                                                                                                                                                                                                                                                            |
| Vehicles         | Exact specifications of adopted vehicles (year, market, grade); BROUGHAM TUNED values                                                                                                                                                                                                                                                                                                    |
| Circuits         | Series or FREE PLAY placement of the selected circuits below                                                                                                                                                                                                                                                                                                                             |
| Tunnels          | Whether tunnel sides and ceilings are drawn by the renderer like walls (a ceiling is a second surface above the road), replacing sprite frames                                                                                                                                                                                                                                           |
| Walls            | Whether walls take the ground's arrow, text and curb constructs as well as strip and repeat (when a product course needs them)                                                                                                                                                                                                                                                           |
| Walls            | Whether wall friction varies by wall rather than being one game-wide `barrierFriction`                                                                                                                                                                                                                                                                                                   |
| Walls            | Whether walls' preblend memory (about 1.3–2.5 MB per km of cliff, about 0.3 MB per km of road, as measured on a development course) fits the device budget                                                                                                                                                                                                                               |
| Rivals           | Whether rivals follow closer than traffic (in dense traffic they keep the 1.5 s following time and queue)                                                                                                                                                                                                                                                                                |
| Rivals           | Whether an ahead entry's lane is checked where it appears rather than against the course's fewest lanes (Stage 16)                                                                                                                                                                                                                                                                       |
| Drivers          | Whether steering lookahead and response change: a lane change at about 47 m/s overshoots by about 1.7 m (with the rival racing line)                                                                                                                                                                                                                                                     |
| Traffic          | Whether traffic speeds vary or density changes: one speed lets it fill both lanes of a two-lane road; lane drivers never pass                                                                                                                                                                                                                                                            |
| Interaction      | Whether a slight front-face overlap with a solid object deflects the vehicle instead of stopping it (real devices)                                                                                                                                                                                                                                                                       |
| Interaction      | How far a vehicle rebounds from a solid object (about 7 m/s back from 40 m/s today; real devices)                                                                                                                                                                                                                                                                                        |
| Interaction      | Whether a vehicle stopped against a wall or course limit recovers as one held by a fixed object does: a spun S13 DRIFT TUNED came to rest nose-in against TSUKUBA's course limit, its rear wheels spinning on the grass, and no input moved it (no reverse gear; manual recovery is DEV's)                                                                                               |
| Grade separation | Occurrence/neighborhood/height selection of surfaces, landmarks and contacts at nearby crossings                                                                                                                                                                                                                                                                                         |
| Front end        | Stage FE "Decisions for K" ([below](#stage-fe-decisions-for-k))                                                                                                                                                                                                                                                                                                                          |
| Test course      | Stage OT "Decisions for K" ([below](#stage-ot-decisions-for-k))                                                                                                                                                                                                                                                                                                                          |
| Front end        | FREE PLAY wallpaper and title music (black and silent today; its SELECT MUSIC offers every track and MUSIC OFF)                                                                                                                                                                                                                                                                          |
| HUD              | Whether the steering picture's ratio to the front wheel's angle is per vehicle (one per form today)                                                                                                                                                                                                                                                                                      |
| HUD              | Whether the top bridge picture follows each bike's own, and a steering wheel picture for formula cars                                                                                                                                                                                                                                                                                    |
| HUD              | Whether the upper rows (TIME, POS, LAP) take the lower row's look                                                                                                                                                                                                                                                                                                                        |
| HUD              | Whether HUD text has a backing (none today)                                                                                                                                                                                                                                                                                                                                              |
| Steering         | Whether the default steering rule keeps a 7 m lane change at 240 km/h from overshooting: the cone-row scenario approaching from 120 m knocks 7 of its 10 objects, so it approaches from 160 m (real devices)                                                                                                                                                                             |
| Steering         | Which one front tire use at full steering the product keeps (real devices); SETTINGS then drops the choice. Until then the three choices move a player's cornering speed by about ±2.6% against the AI                                                                                                                                                                                   |
| Steering         | Whether the steering lever takes other lengths (such as the wheelbase, a rear-wheel reference) or is fixed at one design value                                                                                                                                                                                                                                                           |
| Steering         | Future, not built now: if a DRIFT series is made, series-level rules for scoring, steering and camera open then, by which the series guarantees its experience; until then SETTINGS alone owns them. A drifting AI is designed with the series' scoring as one stage: a driver whose target sideslip angle and throttle follow from steady-drift equilibrium, steering by the FRONT rule |
| Camera           | The horizon row (DEV 60–120 rows; 120 today)                                                                                                                                                                                                                                                                                                                                             |
| Bank             | How the displayed vehicle bank follows lean (real-device evaluation)                                                                                                                                                                                                                                                                                                                     |
| Art              | Production assets, new physical materials and tunnel/background content                                                                                                                                                                                                                                                                                                                  |
| Vehicle art      | Whether cones and barricades are also generated from solids                                                                                                                                                                                                                                                                                                                              |
| Vehicle art      | Pictures of a stopped vehicle's wheels (generated pictures always show them turning)                                                                                                                                                                                                                                                                                                     |
| Vehicle art      | Whether mirroring halves the direction pictures a set stores                                                                                                                                                                                                                                                                                                                             |
| Vehicle art      | VFR750R's four colors on real devices: the real tricolour and three provisional fictional schemes                                                                                                                                                                                                                                                                                        |
| Weather          | Falling rain over wet sections (WET_ASPHALT lies under an overcast sky without rain today)                                                                                                                                                                                                                                                                                               |
| Audio            | Whether a decoded track (about 63 MB for three minutes of stereo at 44.1 kHz) fits the devices' memory budget                                                                                                                                                                                                                                                                            |
| Audio            | Whether the music, passing the master compressor with the engines, pumps with them (real devices)                                                                                                                                                                                                                                                                                        |
| Audio            | Whether levelling by measured loudness leaves the engines' clipped levels close enough: 1.5 dB apart unweighted after the soft clip (the owner's estimate was 0.7 dB)                                                                                                                                                                                                                    |
| Audio            | Whether impacts need finer recordings than one per counterpart (by kind of wall, by object or by strength)                                                                                                                                                                                                                                                                               |
| Audio            | Whether other vehicles' contacts sound, and how many other vehicles have voices (after measuring the 32-vehicle scene on devices)                                                                                                                                                                                                                                                        |

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
  classes of one course share one compiled course; every class's run stays alive (about 6 MB of heap for the
  three TSUKUBA CLUBMAN classes together, 71 MB with the first alone). Stage LD replaced this: the demo holds only
  the shown and the next class's runs.

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
  - The startup smoke compiles OUTRUN TEST (about 5 s), and a driving scenario drives a rival through its first fork.
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
