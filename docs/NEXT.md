# Next task checkpoint

## Current state

- One compiled graph scene serves TSUKUBA and the courses raised from the originals' ROMs with RACE, TIME ATTACK and
  FREE PLAY runs. Without DEV, FREE PLAY offers TSUKUBA alone; the originals' courses, in no series, are DEV's.
- No course uses these features any more (since PG-2b deleted OUTRUN TEST and OUTRUN TRIAL): BRANCH (forks, seam joins
  and signs shown by a fork's choice), solid walls (TSUKUBA's walls are looks alone), open course limits, movable
  objects (and their knocked pictures), and the `WET_ASPHALT` and `SHOULDER` materials. They stay in the engine; BRANCH
  goes in a later stage ([Courses of the originals](#courses-of-the-originals)).
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
- Stage OT is complete. RIBBON is deleted. OUTRUN TEST, the generated BRANCH course it made, and the OUTRUN TRIAL
  courses were deleted in Stage PG's PG-2b.
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

Next PR: [Stage PG](#stage-pg--pictures-and-the-ground)'s PG-1b and the rest of its evening addendum (PG-9b, PG-4b,
PG-6c, PG-7c, PG-12); then Stage TD, the tidying of the road data tool and the documents after the five Sega originals,
from K's instructions (no new original before it); [RD-6e](#stage-rd--outrun-from-the-originals-road-data) once K's
recordings come; [DT-7](#stage-dt--drift-tuned-trial-vehicles), and [DT-3](#stage-dt--drift-tuned-trial-vehicles) once K
decides; then [Stage 16](#stage-16--produce-product-courses).

Implement the stages in order. Each PR's restart instructions supply its detailed requirements.
Topic contracts belong to the topic specifications; development and release procedure belongs to AGENTS.
PRs hold rationale and verification evidence. Each stage first consolidates the structure its later PRs consume.

## Stage RV — Five racing vehicles

The owner's 2026-10-22 instruction selects Gardner's 1987 NSR500, Lawson's 1988 YZR500 0W98, Senna's 1988
MP4/4, Mansell's 1989 F1-89/640, and Andretti's 1978 Lotus 79 SPECIAL. All five enter FREE PLAY. Existing series
membership and the stopped RACING HERO work stay as they are. The owner clarified the scope during implementation:
**vehicle data, pictures and sound, plus contact explosion and recovery; any other physics addition needs the owner's
prior confirmation.** The proposed axle downforce and timed shifts were discarded before any PR or main change.
Use existing vehicle physics and document its omissions, including downforce and shift interruption.

Remaining reviewable PRs:

- RV-4: sourced specification ledger, five catalogs and sounds, two-speed Lotus tuning to 345–355 km/h,
  driving/contact checks and direction/bank/LOD review.

The Lotus has two actual forward ratios. Its powertrain data and contact explosion are game design, never historical
Lotus specifications. Clutch heat, wear and durability are outside this work. Unknown historical values are explicitly
estimated with their derivation; they do not block a complete, declared vehicle specification.

## Stage VC — Courses from footage

K stopped Stage VC on 2026-10-18: OUTRUN's courses are raised from the original's road data
([Stage RD](#stage-rd--outrun-from-the-originals-road-data)). The footage tool stays as built; its ingest, speed
readout and `drive` serve Stage RD's checks on K's video.

## Stage RD — OUTRUN from the original's road data

OUTRUN's courses are raised from the road data in the original's program ROMs (MAME's `outrun`, Rev. B, every CRC
matching); K's video `k1` of COCONUT BEACH only calibrates and checks. The constants are one set for the game; other
stages need no video. Stage RD2 takes them from the ROMs and K instead of `k1`: a lane is K's 3.6 m over the original's
lane spacing (424/3 road units, the road ROM's lines), and the stripes' period is the original's (6.320988 m). The hills are the original's: the profile matches the road's top on the original's
screen (`c_look`, below), and a car leaving the road at a crest is not suppressed. The course documents and
pictures raised from the ROMs are committed and delivered, the pictures provisionally.

Rules of the stage:

- The ROMs and any raw data taken from them stay out of Git, PR bodies and PR images: K's zip lies in
  `reference-media/outrun/rom/`, the tool's dumps in `reference-media/outrun/rom-data/`.
- No code of Cannonball (non-commercial licence) or LayOut (no licence) is copied or ported; the formats are read by
  this project's own code from this stage's description and the ROMs themselves.
- CI has no ROM, so the conversion's results are committed as course documents and images. The conversion is
  deterministic: a command rebuilds them from the ROMs locally and checks that they equal the committed ones. The
  specification records the ROMs' CRCs and the conversion's version.
- The stage does not stop for decisions (K, 2026-10-18): each PR decides an open point by its default, implements it
  and states the choice, its reason and its numbers in the PR; K reviews afterwards, and no PR waits for a reply. Work
  stops only where it would break the rules above (ROMs, raw data or the original's pixels in Git; Cannonball's or
  LayOut's code), change behaviour outside Stage RD (drawing, physics, vehicles, other courses) or break main's
  history. RD-3b, RD-3c, RD-4 and RD-5 follow one another, main advancing at each green CI.

K's decisions for the conversion (2026-10-18):

- Crossings, grades left by the tables, crests beyond 3 rows and kind 4 are
  [Original road data](original-road-data.md#profile)'s; the road below a crossing may be seen and no bridge is drawn
  yet. For kind 4 (stages 0x3B and 0x20) the original's road top and this game's are reported side by side.
- Kind 3 tables (stages 0x21 and 0x38) are built by the profile's rule and reported.
- Solid scenery (RD-4): a collision mark found in the original's tables decides; failing one, the look does: trees,
  posts, signs, rocks and buildings are solid; bushes, flowers, people, clouds and spray are passed through. The PR
  lists each type.
- Forks (RD-5): by the reading, the left road at a fork leads to the next number in the stage table (stage 2: left
  0x3B, right 0x1E). Where `k1` shows a fork's road beyond, its heading and background confirm which path it follows;
  otherwise the reading is used and reported. Stages are named by [product.md](product.md)'s rules.
- K's video taking the left road every time is not awaited; when it comes, kinds 3 and 4 and the forks' sides are
  checked again.
- The hills keep the current `c_look` (K's choice); their height is not exaggerated in the drawing, and a car leaving
  the road at a crest stays so. The grades the tables leave are returned in full before the next table (RD-5a's rule
  stands).
- K accepted the points left for review: RD-5a's full return of the grades, RD-5c's 2-position straight at a fork's
  lock and the stage names matched by scenery.
- Local originals: run on K's machine, the original's voices and effects, from the PCM ROMs (`opr-10188.71` to
  `opr-10193.66`) where they sound read from the sound ROM's (`epr-10187.88`) tables, replace this game's recordings
  in a local build ([Development](development.md#local-originals)); CI and Pages refuse them. Music comes from K's MAME
  recordings when they come. The sprites' and backgrounds' pictures converted from the ROMs are committed and shown on
  Pages, provisionally (K, 2026-10-19); every car, traffic included, is this game's.
- What the original draws as a sprite is made as a sprite (K, 2026-10-18), never replaced by colors or Strips; where a
  replacement cannot be avoided, the report says so first. Stage PG keeps this: what lies on the ground is a board too
  ([What lies on the ground is a board again](#stage-pg--pictures-and-the-ground)).
- Order (K, 2026-10-18): each piece goes in runnable and to main at green CI, not batched; a report begins
  with one line saying where K can see it (Pages or local, series and class).

What a trial on K's ROMs and `k1` established:

- Distance: one position is 2.003 m. Each 30 Hz tick the original adds the displayed km/h × 0x12F, 16.16 fixed point,
  to its road position: 65536 / (3.6 × 30 × 303) = 2.0027 m. On `k1`, with GO at position 0, the displayed speed's
  integral meets the profile's events within ±3 positions up to about position 600 (scale error under 1 %). Later it
  lags by up to about 55 positions: on curves the original advances its position by `(R + car_x/40) / R`, so `k1` is
  compared after re-timing to the ROM's events.
- COCONUT BEACH (stage number 0x3C): 1948 positions (every stage's, a constant of the program), 19 curve segments, 4
  width points, 5 height points, 89 scenery points (RD-1 confirmed these on K's ROMs). The heading measured on the sub
  CPU's road path changes by 1/R per position on each segment (R 121 measures 122, 115 → 116, 104, 63, 60 exactly); kind
  3 turns left, 2 right, 1 is straight (seen on `k1`). In all 15 stages the heading sums to 0° or ±360° (COCONUT BEACH
  turns 360° left). `k1`'s background scroll turns when the ROM's heading does.
- The hills are built as shapes on the original's screen: the road's top row computed by the original's rule from the
  ROM's height tables, with nothing fitted, falls on `k1`'s (rows 113, 122, 117, 101 and so on; tables 211, 134 and
  213).
- Colors: palette words converted to RGB555 give COCONUT BEACH's road 156/148 grey and its lines 247; `k1`'s colors are
  about 4 % darker from its capture, so the ROM's are used.

The ROMs' format and addresses are [Original road data](original-road-data.md)'s.

The original's hills are [Original road data](original-road-data.md#hills)'s.

The conversion is [Original road data](original-road-data.md#course-documents)'s; OUTRUN's stages are
[OUTRUN's stages](original-road-data.md#outruns-stages)'.

The stage's PRs left:

- RD-4: scenery, done ([Placing scenery](original-road-data.md#placing-scenery)), what moved standing still. The
  ground's spray (the surface effect) is not converted
  ([Strips and patches](original-road-data.md#strips-and-patches)); Stage PG's water material, `WATER`, throws its spray
  instead. The strips' and patches' sizes by depth (flatter far away) would need a drawing change: a board is one
  picture at every depth. Stage PG made the rising strips boards extending sideways, and the sea, lakes and patches
  boards lying on the ground ([Stage PG](#stage-pg--pictures-and-the-ground)).
- RD-6e: music, local originals of the tracks from K's four MAME recordings once they come.

SUPER HANG-ON follows with the same tool in [Stage SH](#stage-sh--super-hang-on-from-the-roms).

## Stage SH — SUPER HANG-ON from the ROMs

Stage SH follows Stage RD2 and raises SUPER HANG-ON's four courses, AFRICA, ASIA, AMERICA and EUROPE, from the
original's ROMs as Stage RD2 raised OUTRUN's, with its tools and rules: the ROMs' pictures converted and published,
backgrounds baked into skies, objects placed along a whole road, crossings kept apart by bumps, and PRs ordered so that
the courses are measured as seldom as possible. Its aim is Stage RD2's: exact, true to the ROMs, fair to look at,
simple, and fitted to this game's physics; the look comes first, and lengthy checks (the reference times' review among
them) are left out. Its PRs are numbered from SH-1, and Stage RD's and RD2's rules hold where this section does not
change them.

K's decisions (2026-10-20):

- **Kept from Stage RD2.** All physics stays as it is; distances come from the original's displayed speed and its
  clock. Pictures are resampled at the best quality there is (backgrounds by area averages in linear light). Everything
  that moves is placed standing still, the ending as its last frame. Each background's near layer is drawn before its
  far layer at the same scale into one picture; the horizon's ground gradient is not made. The bikes are baked from 3D
  models, so the original's bike and rivals are not converted. The sprites' and backgrounds' pictures converted from
  the ROMs are committed and shown on Pages, provisionally (drawn again for the product); sounds (PCM) stay local
  originals alone, and the ROM zip and the raw dumps stay out of Git and PRs. The hills are made again in a later
  stage; crossings keep the 6 m rule.
- **Cabinet.** The cabinets' courses differ: the export sitdown/upright set, MAME's `shangon` (unprotected), is the
  base, not the Japanese one.
- **Product.** The four courses are the reference courses of the SUPER HANG-ON series ([Series](product.md#5-series)),
  one LINEAR course each.
- **No classes until the hills.** Until the hills are made again, the courses have no class: they are driven in
  FREE PLAY alone, untimed, and their racing lines are their only measured products. When classes return, each is the
  player alone on VFR750R from GO (slot 15), no traffic, margin 1.35.
- **Beside Stage RD2 and Stage TO.** The three stages run side by side and share `tools/road-data/` and OUTRUN's written
  products: those are never merged by hand but written again by the tool (and their racing lines by
  `npm run measure -- generate`) after main is taken in; before each PR every original's `--check` on main passes on
  the local ROMs; a PR changing a shared rule states which courses of which original change and by how much.
- **Scale** (K, 2026-10-21). A lane is 4.3 m, not OUTRUN's 3.6 m: at 4.34 m the original's upright rear frame of the
  bike stands as tall as VFR750R's upright rear picture; at 3.6 m lamps and signs looked small beside the bike. The
  camera stays the same for every vehicle (changing it per series would mean baking the vehicles' pictures again); the
  original's camera, higher and nearer, still shows the road and objects at the bike 1/0.847 times as large as this
  game does.
- **Pictures** (K, 2026-10-21). ROM pictures are put on the texel grid as cleanly as possible, by chosen lines
  ([Chosen lines](original-road-data.md#chosen-lines)).

Rules of the stage, beside Stage RD's and RD2's:

- K's zip lies in `reference-media/super-hang-on/rom/`, the tool's dumps in `reference-media/super-hang-on/rom-data/`.
  No code of MAME, Cannonball or LayOut is copied or ported: the formats are read by this project's own code from the
  stage's description and the ROMs themselves.
- The road data tool serves both originals. What they share has one implementation: palette words, chosen lines, area averages in linear light, the front layer's column removal, tile pictures, writing images, course
  documents, `--check` and the crossings' bumps. Each original adds its own ROM set, addresses and formats (sprites,
  tiles, how objects are brought out); OUTRUN's two roads, forks and strips do not enter SUPER HANG-ON.
- The stage stops only where the ROMs disagree with the stage's description, where a rule above would break, or where
  the format cannot make a course's form (the nearest form it can make is then shown); every other open point is
  decided by its default and reported in its PR.

Its PRs, SH-1 to SH-4, are all on main (SH-2a was not made: Stage TO's TO-2a moved what the originals share into
modules of their own); the hills come in a later stage.

Not in this stage: the hills (how the original's vertical heading tables become grades), the SUPER HANG-ON series
itself (sixteen bikes, their colors and pace), sounds and music, the mini ride-on cabinets' courses (their programs are
encrypted), the ending's motion (its last frame alone stands), and the product's pictures drawn again.

## Stage TO — TURBO OUTRUN from the ROMs

Stage TO follows Stages RD2 and SH and raises TURBO OUTRUN's 16 stages, NEW YORK to LOS ANGELES, from the original's
ROMs into one LINEAR course, with the tools and rules those stages made: the ROMs' pictures converted and published,
backgrounds baked into skies, two roads drawn together, objects placed along a whole road, the plan raised from the road
path, crossings kept apart by bumps, and PRs ordered so that the course is measured as seldom as possible. TURBO
OUTRUN runs on OUTRUN's board and its program is OUTRUN's remade, so most of its formats are OUTRUN's, read by OUTRUN's
readers and checked on its ROMs; the main CPU's encryption, the stages' order and ends, how scenery is brought out, and
the start and goal scenes are its own. Its aim is Stage RD2's and SH's: exact, true to the ROMs, fair to look at,
simple, and fitted to this game's physics; the look comes first, and lengthy checks (the reference times' review among
them) are left out. Its PRs are numbered from TO-1, and Stage RD's, RD2's and SH's rules hold where this section does
not change them.

K's decisions (2026-10-20):

- **Kept from Stages RD2 and SH.** All physics stays as it is; distances come from the original's displayed speed and
  its clock, and lanes from the road ROM's lines. Pictures are resampled at the best quality there is (backgrounds by
  area averages in linear light). Everything that moves is placed standing still, the ending as its last frame. Each
  background's near layer is drawn before its far layer at the same scale into one picture; the horizon's ground
  gradient is not made. The cars are baked from 3D models, so the original's car, rival and traffic are not converted.
  The sprites' and backgrounds' pictures converted from the ROMs are committed and shown on Pages, provisionally
  (drawn again for the product); sounds (PCM) stay local originals alone, and the ROM zip and the raw dumps stay out of
  Git and PRs. The hills are made again in a later stage; crossings keep the 6 m rule.
- **Set.** MAME's `toutrun` (Turbo Out Run, the Out Run upgrade, FD1094 317-0118) is the base; the other cabinets'
  sets are only compared.
- **Product.** The course is the reference course of the TURBO OUTRUN series ([Series](product.md#5-series)): one
  LINEAR course of 16 stages, New York to Los Angeles.
- **No class until the hills.** The hills of all three originals are made again later, so no reference times are made
  until then (K, 2026-10-20): the course has no class and is driven in FREE PLAY alone, and only its racing line is
  measured. Its classes are decided by the stage that makes the hills again (K, 2026-10-22). Until then the GOAL gate's
  posts over lanes a and f are shown in drawings; whether a reference run hits them is checked then.

Rules of the stage, beside Stage RD's, RD2's and SH's:

- K's zip lies in `reference-media/turbo-outrun/rom/`, the tool's dumps in `reference-media/turbo-outrun/rom-data/`.
  No code of MAME, Cannonball or LayOut is copied or ported: the formats are read by this project's own code from the
  stage's description and the ROMs themselves.
- **No decryption.** The main CPU's program is encrypted (FD1094). The encryption covers instruction fetches alone, so
  the tables the tool reads are the ROMs' bytes as they are. No decrypting code and no key (the zip's `317-0118.key`)
  enter the repository or are used. What the stage's description says of the program's code (how a stage ends, how
  objects approach, the start's figures, the backgrounds' palette patches) was found by decrypting it for the
  description; the tool cannot check it and takes it as described.
- The road data tool gains TURBO OUTRUN's modules (`turbo-outrun-*.ts`): its ROM set, the stages' order and ends
  (gates, stage ends, legs' ends and the goal), the joins and the straight past the goal, its cross-section and lanes,
  how its scenery is brought out, its kinds' records and routines, its strips' size tables and lateral rules, its
  palettes' place, its start table and start figures, and its backgrounds' palette patches. Where its formats are
  OUTRUN's, the modules the originals share serve it ([Original road data](original-road-data.md)).
- **OUTRUN's results stay.** OUTRUN's and SUPER HANG-ON's `--check` pass unchanged. Objects are brought out and
  approach by the model Stage RD2's RD-10e gives OUTRUN as its ROM has it (the phase advancing three times a tick, the
  road position the car's, an object standing at the road position of the tick its depth first passes the car's line:
  OUTRUN's 0x200, TURBO OUTRUN's 0x180), shared by both; TURBO OUTRUN adds what differs (its tables' addresses, the
  car's line, the depth objects vanish at, its 108 object slots, its control's step and its start table).
- **Side by side** (K, 2026-10-20). Stages RD2, SH and TO run in parallel sessions and touch the same tool and OUTRUN's
  products. What the tools write (course documents, boards, skies, racing lines) is written again by the tools after
  main is taken in, never merged by hand. Before each PR, main is rebased in and every original's `--check` on main
  passes on the local ROMs. A PR that changes OUTRUN's products writes them again in the same PR, one such PR at a time;
  a PR changing a shared rule says which course of which original changes, and by how much. A move whose files another
  session's open work touches waits until that work is on main.
- The stage stops only where the ROMs disagree with the stage's description (an address holding other contents, an
  unknown format, or contents described as OUTRUN's differing), where a rule above would break, or where the format
  cannot make the course's form (the nearest form it can make is then shown); every other open point is decided by its
  default and reported in its PR.

TO-2b came first, as it needs nothing of the other stages: TURBO OUTRUN's ROMs are read, without decryption, into its
dump, and what is described as OUTRUN's is checked against OUTRUN's ROMs
([TURBO OUTRUN](original-road-data.md#turbo-outrun)). TO-2a moved what the three originals share into modules of their
own ([Original road data](original-road-data.md)). TO-2c shared how objects approach the car and places TURBO OUTRUN's
objects by its own control
([Placing TURBO OUTRUN's scenery](original-road-data.md#placing-turbo-outruns-scenery)). TO-2d shared the two roads
drawn together from one road's picture and where a road's cells overlap. TO-3 was split: TO-3a laid the course
`turbo-outrun` (TURBO OUTRUN) from the road paths, without objects: each stage to where the next begins, a join at each
leg's end, a straight past the goal, the widths, lanes, plan, strips, materials, hills and Sections, the skies' names
and yaw origins, the checkpoints, finish and grid, no class, its racing line measured
([TURBO OUTRUN's course](original-road-data.md#turbo-outruns-course)). TO-3b was split: TO-3b1 stood its objects but
the strips, in the ROMs' pictures by SH-3c's chosen lines
([TURBO OUTRUN's objects](original-road-data.md#turbo-outruns-objects)), so no TO-3c is needed; TO-3b2 stood the
strips and the far strip, restored as OUTRUN's strips and clouds are
([TURBO OUTRUN's strips](original-road-data.md#turbo-outruns-strips)); TO-4 baked its 16 skies by SH-4's `sky-baking`
([TURBO OUTRUN's programs](original-road-data.md#turbo-outruns-programs)). Stage TO has no PR left: its hills wait for
the stage that makes the hills again.

Not in this stage: the hills made again (proper grade separation with them), the TURBO OUTRUN series itself (F40 and
959, their colors and sides, the rival and the clock's values), the original's time extensions, turbo, tune-ups and
traffic tables, the objects that fly or break when hit made movable, the ending's picture as a screen picture, sounds
and music, the other cabinets' courses (`toutrun2` among them), and the product's pictures drawn again.

## Stage ER — ENDURO RACER from the ROMs

Stage ER follows Stages RD2, SH and TO and raises ENDURO RACER's five stages (Sega, 1986, on the Space Harrier board)
from the original's ROMs into one LINEAR course, with the tools and rules those stages made: the ROMs' pictures put on
the texel grid by chosen lines, backgrounds baked into skies by `sky-baking`, objects placed along a whole road,
crossings kept apart by bumps, and PRs ordered so that the course is measured as seldom as possible. Its aim is Stage
RD2's, SH's and TO's: exact, true to the ROMs, fair to look at, simple, and fitted to this game's physics; the look
comes first, and lengthy checks (the reference times' review among them) are left out. Its PRs are numbered from ER-1,
and Stage RD's, RD2's, SH's and TO's rules hold where this section does not change them.

K's decisions (2026-10-21):

- **Kept from Stages RD2, SH and TO.** All physics stays as it is; distances come from the original's displayed speed
  and its clock. Pictures are resampled at the best quality there is (ROM pictures by chosen lines, backgrounds by area
  averages in linear light). Everything that moves is placed standing still. Each background's near layer is drawn
  before its far layer at the same scale into one picture; the horizon's ground gradient is not made. The bikes are
  baked from 3D models, so the original's bike and rivals are not converted. The sprites' and backgrounds' pictures
  converted from the ROMs are committed and shown on Pages, provisionally (drawn again for the product); sounds (PCM)
  stay local originals alone, and the ROM zips and the raw dumps stay out of Git and PRs. The hills are made again in a
  later stage; crossings keep the 6 m rule. No class is made until the hills: the course is driven in FREE PLAY alone
  and only its racing line is measured.
- **Sprites stay sprites** (K, 2026-10-18 and 2026-10-21). What the original draws as a sprite is a board, never a
  color or a strip; only what the road layer draws (the surface, the edge bands, the water crossings) and the ground's
  color are strips. Stage PG keeps this: what lies on the ground is a board too
  ([Stage PG](#stage-pg--pictures-and-the-ground)). In ENDURO RACER every sprite but the bikes is a board, each jump
  mound one board. A report names any place where a sprite had to be replaced, on the line after where the course can
  be seen.
- **Set.** Graphics and the sub CPU are read from MAME's `enduror` (Enduro Racer, Rev A, YM2151, FD1089B 317-0013A).
  Its main CPU's program is encrypted (FD1089B encrypts instructions and data), so the main CPU's tables are read from
  the decrypted program in MAME's `endurobl` (bootleg set 1), which is the YM2203 set `enduror1` decrypted; its tables
  are those of Rev A.
- **Scale.** One road position is 1.185185 m (the displayed km/h at 60 Hz). Across the road SUPER HANG-ON's rule
  holds (the original's upright rear frame of the bike as tall as VFR750R's upright rear picture), rounded to a lane,
  half the road surface, of 3.5 m: one lateral unit is 0.018392 m and the road 7.00 m. The original's world does not
  keep one scale across and along the road, so no scale follows from it alone; its objects' ratio (road 7.48 m) and
  its road's look (road about 9.8 m) were the alternatives, and K kept the 3.5 m lane (2026-10-21).
- **Water.** Stage 3's water, stage 5's and the goal's sea (left of P) and the three water crossings' surface are
  `WATER`, shallow water ([Stage PG](#stage-pg--pictures-and-the-ground), replacing K's 2026-10-21 "no water
  material").
- **Product.** The five stages, in running order, are one LINEAR course `enduro-racer` (ENDURO RACER), as the original
  runs them without stopping. It is the reference course of a later ENDURO RACER series
  ([Series](product.md#5-series)).
- **Jumps and objects on the road.** The jump mounds are boards passed through until the hills make them the road's
  form; the rocks, rock pillars, dead trees and jeeps on the road have bodies by the original's hit mark, as every
  object does, unless the racing line's measurement or the drive fails on them: then they are passed through (ER-4:
  every driver stopped behind stage 1's rocks).

Rules of the stage, beside Stage RD's, RD2's, SH's and TO's:

- K's two zips lie in `reference-media/enduro-racer/rom/` (`enduror.zip` and `endurobl.zip`, names an argument may
  change), the tool's dump in `reference-media/enduro-racer/rom-data/`. The tool opens both and finds each ROM by its
  CRC. No code of MAME, Cannonball or LayOut is copied or ported: the formats are read by this project's own code from
  the stage's description and the ROMs themselves.
- **No decryption.** No decrypting code and no key (`enduror.zip`'s `317-0013a.key`) enter the repository or are used.
  The main CPU's tables are read from `endurobl`'s decrypted bytes. That those tables are Rev A's, and what the stage's
  description says of the program's code, was found by decrypting the sets for the description; the tool cannot check
  it and takes it as described.
- The road data tool gains ENDURO RACER's modules (`enduro-racer-*.ts`): its ROM set and addresses, Space Harrier's
  sprites, Hang-On's tiles, its road ROM, its scenery tables and its course. What it shares with the other originals
  (`program-words`, `pixel-grid`'s `chosenLines` and `paletteName`, `sprite-pixels`, `sky-baking`, `crossings`,
  `road-profile`, `--check`, and SUPER HANG-ON's `sectionPlan` and `CoursePath`) serves it unchanged; what it adds to
  a shared module (Space Harrier's sprite banks and row ends among them) leaves every other original's `--check`
  unchanged, and a SUPER HANG-ON function made shared leaves SUPER HANG-ON's `--check` byte for byte. OUTRUN's
  `offset-plan` is not used.
- **Every original's results stay.** Before each PR main is taken in and every original's `--check` on main (OUTRUN's
  `course --check` and `boards --check`, SUPER HANG-ON's, TURBO OUTRUN's and, once it exists, ENDURO RACER's) passes on
  the local ROMs; a PR changing a shared rule says which course of which original changes, and by how much.
- The stage stops only where the ROMs disagree with the stage's description (an address holding other contents, an
  unknown format, a CRC that does not match), where a rule above would break, or where the format cannot make the
  course's form (the nearest form it can make is then shown); every other open point is decided by its default and
  reported in its PR.

ER-2 read ENDURO RACER's ROMs into its dump: both zips' ROMs found by CRC, the main CPU's data and instructions
images with the instructions its tables are found by checked, and Space Harrier's sprites read by `sprite-pixels`
([ENDURO RACER](original-road-data.md#enduro-racer)). ER-3 laid the course `enduro-racer` (ENDURO RACER) without
objects: the stages' paths and the goal's straight, the cross-section, lanes, strips, materials, Sections, skies'
names and yaw origins, checkpoints, finish and grid, and the crossings' bumps, its racing line measured
([ENDURO RACER's course](original-road-data.md#enduro-racers-course)). ER-4 stood its objects in the ROMs' pictures
by chosen lines: the scenery, the start's gate, the CHECK and goal parts and the jumps as boards passed through, bodies
by the original's hit mark but on the road, none on another passage's road
([ENDURO RACER's objects](original-road-data.md#enduro-racers-objects)). ER-5 baked its five skies by `sky-baking`
([ENDURO RACER's course](original-road-data.md#enduro-racers-course)). ER-6 recorded K's decisions on what the
stage's reports left open (2026-10-21: "go on with the recommendations; only playing will tell"): every default stays,
and K drives the course in FREE PLAY on Pages and asks for changes as they show.

- The scale stays (a position 1.185185 m, a lane 3.5 m); alternatives (a) and (b) are not used.
- The water is `WATER` since Stage PG: stage 3's ground, stage 5's sea and the three crossings' surface.
- The 183 objects on the road keep passing through. Their bodies come back only once the drivers (who measure the
  racing lines and drive) can avoid objects standing on the road, not with the hills before that.
- The jumps and jumping are made with the hills, which also decide the 5 jump mounds not placed for standing on another
  passage's road. The crossings' bumps stay as they are (−11.4 to +12.1 m, 7.5 % at the steepest) until the hills
  make them again, and the 150 objects on another passage's road stay out.
- The stripes' phase is confirmed on the original (band B from position 0, the borders at even positions;
  [ENDURO RACER's course](original-road-data.md#enduro-racers-course)).

Stage ER is closed.

Not in this stage: the hills (the original's grade tables) and jumping, the ENDURO RACER series itself (bikes, rivals,
colors, pace and time extensions), sounds and music, the motion of what moves, the ending's text, and the product's
pictures drawn again.

## Stage MG — SUPER MONACO GP from the ROMs

Stage MG follows Stages RD2, SH, TO and ER and raises SUPER MONACO GP's two courses (Sega, 1989, on the X board), the
race's and the qualifying's, from the original's ROMs into two CIRCUIT courses, with the tools and rules those stages
made: the ROMs' pictures put on the texel grid by chosen lines, the background baked into a sky by `sky-baking`, SUPER
HANG-ON's plan, and PRs ordered so that the courses are measured as seldom as possible. It is the first stage to raise
circuits from ROMs, shaped as TSUKUBA, the hand-made circuit, is. Its aim is the earlier stages': exact, true to the
ROMs, fair to look at, simple, and fitted to this game's physics; the look comes first, and lengthy checks (the
reference times' review among them) are left out. Its PRs are numbered from MG-1, and Stage RD's, RD2's, SH's, TO's and
ER's rules hold where this section does not change them.

K's decisions (2026-10-21):

- **Kept from the earlier stages.** All physics stays as it is; distances come from the original's displayed speed and
  its clock. Pictures are resampled at the best quality there is (ROM pictures by chosen lines, backgrounds by area
  averages in linear light). Everything that moves is placed standing still. The background's near layer is drawn
  before its far layer at the same scale into one picture; the horizon's ground gradient is not made. The cars are
  baked from 3D models, so the original's car (its cockpit) and its rivals' Formula One cars are not converted. The
  sprites' and backgrounds' pictures converted from the ROMs are committed and shown on Pages, provisionally (drawn
  again for the product); sounds (PCM) stay local originals alone, and the ROM zip and the raw dumps stay out of Git and
  PRs. What the original draws as a sprite is a board, never a color or a strip, and a report names any place where a
  sprite had to be replaced, on the line after where the courses can be seen (K, 2026-10-18). The hills are made again
  in a later stage; crossings keep the 6 m rule. No class is made until the hills: the courses are driven in FREE PLAY
  alone and only their racing lines are measured.
- **Set.** MAME's `smgp` (Super Monaco GP, World, Rev B, FD1094 317-0126a). Its main CPU's program is encrypted for
  instruction fetches alone, so its tables are the ROMs' bytes as they are; the course tables lie in the sub CPU's
  program, which is not encrypted.
- **Scale.** Lengths follow K's rule, the original's displayed km/h and its clock: one step is 0.372267 m (the race's lap
  5.27 km, the qualifying's 2.28 km). The original has no amount that sets its lateral unit in metres, so the space
  between the barriers, 1640 units, is a real Monaco street's 10 m: a unit is 10 / 1640 m (the barriers 0.80 m tall, a
  lamp 6.5 m, a person 2.3 m). The original's world keeps one scale across and along the road, so this default shortens
  the road 0.64 times against its look. K kept this scale after MG-5's drawings (2026-10-21); the alternatives were
  (R) the real lap of 3.328 km, (C) the width from the rivals' cars against TESTAROSSA's, (A) one scale across and
  along ([SUPER MONACO GP's courses](original-road-data.md#super-monaco-gps-courses) keeps their notes).
- **Product.** Two circuits, `super-monaco-gp` (SUPER MONACO GP, the race's form) and `super-monaco-gp-qualifying`
  (SUPER MONACO GP QUALIFYING, the qualifying's form), each a FREE PLAY course in no series. The two forms share most of
  the road but each closes on its own path, so they are two circuits, not one BRANCH course.
- **Everything but the road's surface is a sprite** (K, 2026-10-21). The original's road layer draws only the sky's and
  ground's colors; every object, the road's surface included, is a sprite. The surface boards, lying flat on the ground,
  are strips: the surface, its centre line, the grid's marks, the start line, the tire marks and rubber, and the side
  paving the same boards draw. That replacement cannot be avoided and every report says so; Stage PG keeps this
  ([Stage PG](#stage-pg--pictures-and-the-ground)). Everything else is a board:
  the barriers, the barriers across the road, the concrete walls, the kerbs and the advertising boards are, as in the
  original, boards whose picture changes with the angle they are seen at (one of 32 chosen every frame), which this
  game's drawing and course format gain in MG-4 (Stage PG replaced the boards with views by single pictures and the
  kerbs by Strip `curb`s: [Stage PG](#stage-pg--pictures-and-the-ground)). No walls are made: what limits the cars is
  the original's band table alone, as material edges, and no board has a body.
- **Weather.** The fine set (the demo, qualifying and the first race); the overcast set is not made.
- **Tunnel.** The race's 9032–10860 steps, made as this game makes tunnels: boards, strips and a `cut` to a dark sky.

Rules of the stage, beside the earlier stages':

- K's zip lies in `reference-media/super-monaco-gp/rom/smgp.zip`, the tool's dump in
  `reference-media/super-monaco-gp/rom-data/`. The tool finds each ROM by its CRC and refuses another set. No code of
  MAME, Cannonball or LayOut is copied or ported: the formats are read by this project's own code from the stage's
  description and the ROMs themselves.
- **No decryption.** No decrypting code and no key (the zip's `317-0126a.key`) enter the repository or are used. What
  the stage's description says of the program's code (what it reads and how, its clock, its hits) was found by
  decrypting it for the description; the tool cannot check it and takes it as described.
- The road data tool gains SUPER MONACO GP's modules (`super-monaco-gp-*.ts`): its ROM set, addresses and formats (the
  X board's sprite size sets, the scenery lists, the view tables, the barrier band tables, the 16B tiles). Its sprite
  pixels are OUTRUN's, read by `sprite-pixels` as OUTRUN's are. What it adds to a shared module (closing a circuit
  among it) leaves every other original's `--check` unchanged.
- **Boards that change with the angle** (MG-4) are added to the drawing and the course format without changing any
  other course's document, identity or drawing: no compiler, recipe or course document version rises, and no field is
  added to a sprite's document.
- **Every original's results stay.** Before each PR main is taken in and every original's `--check` on main (OUTRUN's,
  SUPER HANG-ON's, TURBO OUTRUN's, ENDURO RACER's and, once it exists, SUPER MONACO GP's) passes on the local ROMs; a PR
  changing a shared rule says which course of which original changes, and by how much.
- The stage stops only where the ROMs disagree with the stage's description (an address holding other contents, an
  unknown format, a CRC that does not match), where a rule above would break, or where the format cannot make the
  courses' form (a circuit that does not close, a board whose angle cannot be chosen as the original chooses it; the
  nearest form it can make is then shown); every other open point is decided by its default and reported in its PR.

MG-2 read SUPER MONACO GP's ROMs into its dump: the set found by CRC, the main CPU's bytes as they are, the courses'
tables, the sprites' frame tables, view tables and palettes, and the background's pages
([SUPER MONACO GP](original-road-data.md#super-monaco-gp)). MG-3 laid the two circuits without objects: the plan from
the heading tables closed exactly on the written plane, lanes, materials and limits from the band tables, the surface
and its marks as strips, Sections split where their boards would pass the format's bound, the tunnel's dark sky, the
grid (one slot further past the line than the original's, for the camera's room), checkpoints and finish, their racing
lines measured ([SUPER MONACO GP's courses](original-road-data.md#super-monaco-gps-courses)). MG-4 gave the drawing
and the course format boards with views: a view set was one image holding a board's pictures and the picture of each
of its 32 views, drawn as the original selects it (Stage PG's PG-10 deleted them); no version rose and every other course draws and identifies
as before. MG-5 placed their objects: every object but the surface boards a board without a body, in the ROMs'
pictures by chosen lines, the barriers, kerbs, walls and advertising boards in eight view sets
([SUPER MONACO GP's objects](original-road-data.md#super-monaco-gps-objects)); the racing lines were measured again.
MG-6 baked their sky from the tile ROMs by `sky-baking` and the tunnel's dark. MG-7 recorded K's decisions on what
the stage's reports left open (2026-10-21, with ER-6): every default stays, and K drives the courses in FREE PLAY on
Pages and asks for changes as they show.

- The scale stays (a step 0.372267 m, 1640 units between the barriers 10 m); (R), (C) and (A) are not used.
- The near barriers keep standing as steps, the original's pictures and selection as they are: the pictures are drawn
  for the original's eye about 0.57 m above the road, and with this game's camera lowered to 0.6 m at the car they make
  the original's continuous band.
- The pictures stay as they are: 76 MB of saved JSON, about 5.4 MB compressed in Git and from Pages, as TURBO OUTRUN's
  and OUTRUN's; most of it is the 16-unit class, each of the original's pixels about 4 × 4 texels. A format holding
  pictures at the original's pixel size would make it smaller, and is not made now.

Stage MG is closed.

Not in this stage: the hills (the original's dz) and grade separation, the SUPER MONACO GP series itself (cars, rivals,
laps, rank limits, time and the overcast set), sounds and music, the motion of what moves, the start's signal, the
mirror and the cockpit, and the product's pictures drawn again.

## Stage PG — Pictures and the ground

Stage PG sets the rules by which pictures meet the ground, fixes the pictures cut off below their anchors, sorts the
originals' strips into boards and Strips, and adds a water material. It comes before Stage TD (the tidying of the road
data tool and the documents). Its PRs are numbered from PG-0.
Words: a board is a course's flat picture, a wall is a course's `walls` entry, a strip (board) is the originals' strip
boards, a Strip is a course's ground color and material; a picture's anchor is its base point, its height
`groundOffset`.

Why (main 0cb8038): beyond the player, the rows of a picture below its anchor were painted over by the nearer ground
rows, since pictures were merged with the ground rows by their anchors' depth and a ground row paints its screen row
from edge to edge ([Sprites and Painter](architecture.md#sprites-and-painter) said so: a contract's gap). A vehicle
shows its body's near side below its anchor (TESTAROSSA 23–50 % by yaw): on COCONUT BEACH (`outrun-a`, the player at
s = 1700, l = 0) a rival 5 m ahead in the next lane (l = 3.6) lost all 5 of its picture's 30 rows below the anchor.
OUTRUN's strips (4548, 4588, 45c8, 4608) and patches and TURBO OUTRUN's strips (2725a, 272fa, 2743a) and the objects
lying on its road are anchored at their middles, as in the original, so they lost their lower halves; and those strips
were one kind of board for things standing and lying alike, which neither rule fits. SUPER MONACO GP's boards with
32 views served that one kind of object alone.

K's decisions (2026-10-22):

- **Two kinds of picture** (replaced in the evening by one rule for every picture, below). The drawing decides the kind
  (whether a picture is given as a vehicle's); course and image documents carry no mark.
  1. **A board without depth**: every picture but the vehicles' (course images and tire puffs). Its anchor's height is
     its bottom edge alone (texel centres: anchorY = H − 0.5); its anchorX is as today. What floats or hangs (clouds,
     mist, flags, banners) and what reaches below the ground (a cliff's face) take their bottom edge's height from
     `groundOffset`, negative too; a cliff's face stands at its foot. No top anchor is made (a body stands
     `groundOffset` above the road, the picture's height tall, so a hanging anchor would need a second body rule; no
     picture hangs today). A board is one plane at its anchor's depth: every row is ordered at that depth, and nearer
     ground hides it pixel by pixel, as today.
  2. **A thing with depth along the road**: the pictures chosen from a vehicle's picture set alone (not view sets).
     The screen rows whose centres lie on or above the anchor's screen row are drawn at the anchor's depth, as today.
     Each row below lies on the ground nearer than the anchor: of the ground rows drawn on that screen row (transparent
     ground too), the farthest one nearer than the anchor is found, and the picture's row is drawn after that ground
     row and its walls; nearer ground and walls draw over it as today. A screen row with no ground row nearer than the
     anchor is drawn at the anchor's depth. Picture rows on the same ground row draw from far anchors to near. The
     player and the pictures nearer than it draw after all the ground, as today, and no ground hides them.
- **Boards extending sideways.** A strip that rises from the ground is a board of kind 1 (bottom anchor) whose picture
  repeats left or right within its plane to the screen's edge. The direction belongs to the image: an optional course
  image field (such as `extend: "left" | "right"`); an image without it draws as today, and a `-mirrored` image
  mirrors the direction. Course documents and their format do not change. The names `repeat` (repetition along s) and
  `tile` (tile pictures) are not used. Nothing extends both ways (clouds and mist are pairs extending outward from the
  middle). The nearest-size level repeats with the image's width W/40 m as its period, the same at every size, never
  shrunk (the true form of one plane at one depth); the strips the original shrinks outward (stones 45c8, sand 4588,
  VINEYARD's trees 435c, the grass bank 26fda, dunes 272fa, flower beds 2743a) extend at one size too. An extending
  board's placement has no body (`invalid_placement`): it is for looks alone. Standing at its bottom, a board at the
  same place stands half its height higher than the original's middle anchor, which is accepted.
- **What lies on the ground is a Strip** (replaced in the evening: it is a board again, below). What does not rise from
  the ground is no picture but a Strip; what lies wholly flat is baked into ground-color Strips by the baking below.
  This replaces K's decision of 2026-10-18 (scenery, sea, grass and sand never replaced by colors or Strips) for what
  lies on the ground alone; what rises stays a picture.
- **Water.** One shallow-water material, `WATER`; no deep water. Only the course limits (invisible walls) decide where
  a vehicle cannot go. Sea, lakes, puddles and water crossings are water-colored Strips, carrying `WATER` where they lie
  inside the course limits; water beyond a limit is color alone (a material carried beyond it would move the limit,
  and the limits do not change). This replaces ER's "no water material" (K, 2026-10-21).
- **SUPER MONACO GP's boards with 32 views** become single pictures (boards of kind 1) and the view sets are deleted;
  what lies on the road becomes Strips (the kerbs Strip `curb`s).
- **SUPER MONACO GP: only the kerbs and the road's marks are Strips** (K, 2026-10-22, replacing the row below for its
  flat boards). Every other object is a sprite's board, the flat boards (kind 0x04: buildings, trees, the gate, signs,
  the far bridge and cliffs) among them, standing on its bottom edge from the road.

K's decisions (2026-10-22, evening), after a review of PG-0 to PG-7b:

- **One rule for every picture.** Every picture (a vehicle's, a course image, a tire puff) folds at its anchor's screen
  row. The rows on and above it stand at the anchor's depth, as today. Each row below lies on the ground nearer than the
  anchor: it is drawn after the farthest ground row nearer than the anchor on its screen row (transparent ground
  counted) and its walls, where the picture draws it on the screen (the ground's perspective does not shorten it), so it
  lies only in how it overlaps. How much lies follows from where the anchor is in the picture alone (at the bottom edge
  all stands, at the middle half lies); no mark is carried. An extending board folds so in every repetition.
- **What lies on the ground is a board again.** K's rule of 2026-10-18 holds once more: what the original draws as a
  picture lying on the ground (sea, lakes, waves, drifts of sand, patches, puddles, gravel, pebbles, snow) is a board
  of the original's nearest size at the original's anchor, at the ground's height, with no body. Only the ground's
  color, which the original draws as no picture, and the road itself (SUPER MONACO GP's surface boards and kerbs among
  it) are Strips. The materials lie beneath as colorless Strips, `WATER` inside the course limits alone.
- **Rules of drawing.** A background's picture is one board. An anchor is at the bottom edge and at height 0 by default;
  a picture at height 0 whose anchor is elsewhere folds there. A standing thing stands on its bottom edge at the place
  that fits it. A course image (version 6) may carry `anchorY` again (texel centres, −0.5 ≤ anchorY ≤ H − 0.5; absent,
  the bottom edge), written for the pictures not anchored at their bottom alone, and such an image is placed at height 0
  alone (`invalid_placement` otherwise).
- **Below the ground.** A board's part below the ground (its anchor at the bottom, its `groundOffset` negative) stands
  at the anchor's depth, so the nearer drawn ground hides it and transparent ground shows it (a cliff's face), as the
  drawing does today. SUPER MONACO GP's supports (flag poles, the signs' pipes, the start's and checkpoints' gate posts,
  the bridge's piers, the crane) and the tunnel mouths' rocks go back to the original's negative heights, which put
  their heads where what they hold is; its roadside buildings, stone walls and rock faces (0.20 m below) fold at the
  ground's row; its far buildings stand on the ground as PG-9 made them. Elsewhere one figure of SUPER HANG-ON ASIA's
  goal stands below the ground (−0.039 m). A cliff's drop is for JALECO's BIG RUN later.
- **Drifts of sand lie:** OUTRUN's sand 4588 and TURBO OUTRUN's dunes 272fa (the same strip picture), and TURBO
  OUTRUN's pebbles 27840.
- **Shadows at the foot.** A picture with the original's shadow pixels drawn at its foot keeps them and is anchored at
  its foot (a trunk's base), the shadow below lying on the nearer ground.
- **Extending boards** drop their transparent end columns and repeat the middle part, whose ends join; the shape of the
  end by the road stands once, as a board of its own, and the outer end's shape is not used.
- **Materials.** TURBO OUTRUN's patches and puddles carry materials (its racing lines 2–26 s slower, TESTAROSSA's
  872.149 s becoming 887.120 s, accepted); its snow takes a new material, `SNOW`.
- **Pictures nearer than the player** draw after it, as today: a lying board just behind the player may cover its
  lower part, and a board's part below the ground nearer than the player is not hidden; both are accepted.
- **RACING HERO is not made** (2026-10-22 23:59): RH-6 deleted it; RH-3a's crossing rule and the functions RH-3 made
  general stay.

Where each thing goes:

| Thing                                                                                                                                                               | Goes to                                                                                                                                                                                                                                                             |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Vehicles                                                                                                                                                            | Kind 2                                                                                                                                                                                                                                                              |
| Trees, signs, buildings, flags, people and the other boards anchored at their bottoms today                                                                         | Kind 1 as they are (their recipes' anchors move to the bottom in PG-3)                                                                                                                                                                                              |
| OUTRUN's grass 4548 and stones 45c8, VINEYARD's row of trees 435c, TURBO OUTRUN's flower beds 2743a and grass bank 26fda                                            | Kind 1 extending sideways, at the bottom                                                                                                                                                                                                                            |
| OUTRUN's clouds 4246, TURBO OUTRUN's mist 2603a                                                                                                                     | Kind 1 extending sideways, at today's `groundOffset`                                                                                                                                                                                                                |
| TURBO OUTRUN's grass and stones on the road 27570                                                                                                                   | Kind 1, anchored again at the bottom, not extending; 27570's body (298) stays                                                                                                                                                                                       |
| OUTRUN's sea and lakes 4608, sand 4588 and patches outrun-001; TURBO OUTRUN's waves 2725a, dunes 272fa, puddles 274da (and -u1000), patches 27872 and pebbles 27840 | Boards lying on the ground at the original's anchor (evening); beneath, `WATER` under the sea, lakes, waves and puddles inside the limits, the patches by what they show (gravel `DIRT`, sand `SAND`, snow `SNOW`; OUTRUN's none), the sand, dunes and pebbles none |
| SUPER MONACO GP's boards with 32 views                                                                                                                              | Kind 1, one picture; the kerbs Strip `curb`s                                                                                                                                                                                                                        |
| SUPER MONACO GP's flat boards (kind 0x04, the original's mark of a flat board)                                                                                      | Kind 1 at the bottom, from the road (K, 2026-10-22); the surface boards stay Strips                                                                                                                                                                                 |
| SUPER MONACO GP's boards below the ground                                                                                                                           | The original's heights (the supports, the tunnel mouths' rocks), folded at the ground's row (the roadside buildings, stone walls and rock faces), standing on the ground (the far buildings) (evening)                                                              |
| ENDURO RACER's water                                                                                                                                                | `WATER` on stage 3's whole ground, stage 5's and the goal's sea (left of P, off the road) and the three water crossings' surface; stages 2 and 4's ground and stage 5's white sand stay `SAND`                                                                      |

Decided after the reports (K, 2026-10-22, evening):

- OUTRUN's sand strip 4588 lies (as TURBO OUTRUN's dunes 272fa do).
- The picture of a board with 32 views made one stays its view 0.
- The patches' materials: TURBO OUTRUN's by what they show (gravel `DIRT`, sand `SAND`, snow `SNOW`, puddles
  `WATER`); OUTRUN's none (the original's patches change no driving, and `SAND` stops the planned driver on DESOLATION
  HILL).

The materials of what lies (PG-6c, PG-7c; the baking of PG-6b2 and PG-7b keeps only this):

- The water's material (`WATER`) runs across from a strip's edge by the road (its item's x: its picture is foam and
  water, the edge the waterline) out to the outer Boundary of today's ground material, and along the road from the
  first piece's foot to the last's of a run (pieces within 16 m of the next). The waterline is a Boundary with knots at
  the items, the run's first and last kept, and at its Strip's ends and the Section's ends, so that it covers its Strip;
  where a Section's bounds require, its knots are thinned within 0.25 m. Nothing lies beyond the limits.
- A patch's or puddle's material is the rectangle of its board's foot: across, its picture's opaque columns; along,
  from where its top to where its bottom opaque row meets the ground as the camera (2 m high, 6 m behind) sees it, the
  row r m below the anchor lying 6r/(2 + r) m nearer.
- Bounds per Section: 2048 Strip elements, 32 Boundaries, 1024 Boundary knots, 64 Strips active at one point (hidden
  ones counted); a course that does not fit stops the work and is reported, as does a material that stops the planned
  driver or leaves a racing line unmeasured.

Rules of the stage:

- K hands over the ROMs (OUTRUN, TURBO OUTRUN, ENDURO RACER, SUPER MONACO GP, and the others' zips for their
  `--check`); only the converted results (course documents and images) enter the repository. Before every PR, every
  original's `--check` passes on the local ROMs.
- A PR changing a course or material document runs `npm run measure -- generate` (else the build fails with
  `measurement_stale`; PG-4 changes the material document, so every course).
- A PR changing a conversion from the ROMs raises that original's conversion version and writes it in the
  specification; a PR changing a shared part says which course of which original changes.
- Not made: ordering by a picture's reach along the road (the row rule needs no new value, and the ground rows decide
  how hills hide); drawing every picture after the ground and cutting it at the crest's row, as the original does (a
  picture below the road would show over the nearer road); deep water; any change to walls or to the order of walls and
  pictures beyond them; BRANCH's removal (PG-2b only leaves no course using it); new tests (PG-2a only moves today's).

The walls (`walls`) were used by TSUKUBA (12, looks alone) and OUTRUN TEST (368, 362 solid); OUTRUN TEST went in PG-2b,
and TSUKUBA keeps its walls until a later stage makes it again (K, 2026-10-22).

PRs:

- PG-0: this section.
- PG-1 drew kind 2's rows below the anchor on the ground nearer than it
  ([Sprites and Painter](architecture.md#sprites-and-painter)): the vehicles' near sides show; the boards' lower parts
  stay hidden by nearer ground until their PRs below change them.
- PG-2a moved the tests off OUTRUN TEST and TRIAL: traffic is driven on TSUKUBA by the test series' `traffic` class
  (the series on TSUKUBA CLUBMAN's picture), `terminal` and `course-strip-ground` read `super-hang-on-africa`, the
  screens smoke reads the test series beside the delivered ones, and the fork scenario is gone.
- PG-2b deleted OUTRUN TEST and OUTRUN TRIAL (TRIAL A, TRIAL A STEEP and the TRIAL series) with their measured
  products, the 84 images only they used and their sources (53 sprite sources and every sky source), the series
  pictures `trial` and `outrun-test`, the generators and their drawing tools, the images kept for OUTRUN TEST and the
  fake footage tools (with the camera's background pose only they gave).
- PG-3 made the default anchor ((W − 1)/2, H − 0.5) one function (`defaultSpriteAnchor`, which the drawn pictures and
  the workbench's new recipes take), stood every sprite recipe's anchor on its crop's bottom edge and made their
  pictures (the tire puffs' and the guidance's among them) again, and corrected `cone`'s anchorY. A master whose last
  row is padding (its height rounded up from the crop's) keeps its anchor on the source's bottom edge, within a texel
  above H − 0.5.
- PG-4 added `WATER`, shallow water, to the material catalog (grip 0.6, rolling resistance 0.06), the surface sounds
  and the tire puffs (spray every metre rolling); its values and their grounds are
  [Calibration](calibration.md#surface-materials)'s.
- PG-5 made boards extending sideways: a course image's optional `extend` (`"left"` or `"right"`) repeats the board
  within its plane, every image width, to the frame's edge
  ([Sprites and Painter](architecture.md#sprites-and-painter)); an extending image's placement has no body
  (`invalid_placement`). No image extends yet; PG-6a and PG-7a give it to the rising strips.
- PG-6a made OUTRUN's rising strips extending boards (conversion version 12): the grass 4548, the sand 4588 (by the
  default: it stands, as the dunes do), the stones 45c8, VINEYARD's trees 435c and CLOUDY MOUNTAIN's clouds 4246 are each
  their nearest size, standing on their bottom edge and extending away from the road (the clouds from the roads'
  middle, at their height), in place of the pictures restored from their far sizes; the clouds take one board a side
  instead of four. The sea 4608 waits for PG-6b.
- PG-6b was split. PG-6b1 made the coordinate domain's stations those where its outer edges change, so a material
  splitting the slab table without moving an outer edge adds no cell to the plan's injectivity check (DESERT's patches
  and the sea's water reported overlaps on curves); it changed no course. PG-6b2 made the baking a shared part of the
  road data tool (`ground-baking.ts`, [Baking](original-road-data.md#baking)) and baked OUTRUN's sea, lakes and patches
  into Strips (conversion version 13): the sea and lakes in water's colors with `WATER` from the waterline to the
  verges, the patches each a color Strip on the road with no material (`SAND`, the default, stopped the planned driver
  on DESOLATION HILL's grades of up to 40 %). Their boards (`outrun-strip-4608`, `outrun-001`) are no longer written;
  PG-10 deletes them.
- PG-7a made TURBO OUTRUN's rising strips (the flower beds 2743a, the dunes 272fa, the grass bank 26fda) and the far
  strip (the mist 2603a, at its height) each one board of its nearest size, standing on its bottom edge and extending
  away from the road, and the grass and stones 27570 and the pebbles 27840 stand on their bottom (27570's body
  unchanged) (conversion version 2; 29,077 objects placed instead of 30,193, bodies unchanged). The waves 2725a wait
  for PG-7b.
- PG-7b baked TURBO OUTRUN's waves (735 pieces, `WATER` from the waterline inside the verges), puddles (892,
  `WATER`) and gravel patches (1,133, `DIRT`) by PG-6b's baking (conversion version 3); every strip is now its nearest
  size, so TURBO OUTRUN no longer restores strips. Their boards (`toutrun-strip-2725a`, `toutrun-274da`,
  `toutrun-27872`) are no longer written; PG-10 deletes them.
- PG-8 made ENDURO RACER's water `WATER` (stage 3's ground, stage 5's and the goal's sea left of P, the three water
  crossings' surface; stages 2 and 4's ground and stage 5's white sand stay `SAND`) and its boards' base points, 0.8
  texel below their bottom, their bottom edge (conversion version 4); NEXT's water (Stage ER's Water, ER-6, what
  Stages ER and MG left) follows.
- PG-9 made SUPER MONACO GP's boards with 32 views single pictures, each its view 0, and its kerbs `curb`s (517 on the
  race, 163 on the qualifying), and stood every board on its bottom edge from the road (conversion version 4). The
  view sets are no longer written; PG-10 deletes them and their format.
- PG-10, the stage's cleanup, deleted the view sets (the image format `superoutride.sprite-views`,
  `src/image/sprite-views.ts`, `courseViewsFile`, `CourseSpriteViews`, `selectCourseSpriteView`,
  `tests/rendering/sprite-views.test.mjs` and their document sections), the strips' restoration (`restoredStrip` and
  the families' `reach` and `shrink`; `boardsAcross` went in PG-6b2) and the 20 images no longer used (OUTRUN's sea
  and patches, TURBO OUTRUN's waves, puddles and gravel patches, SUPER MONACO GP's eight view sets).
- PG-11 made the anchor's height one authority: a course image (version 5) and a sprite recipe (version 4) carry no
  anchor height; admission sets anchorY = H − 0.5 and the drawing uses the picture's anchor as before. The image
  writers, the sprite source compiler (version 3) and the workbench's y field went with it; what is baked lying
  keeps the original's anchor beside its master. Shadows' anchorY and vehicle pictures stay. Every image and recipe
  was written again, 28 drawn pictures of TSUKUBA's 0.01 to 0.95 texel lower (their recipes' anchors mapped a fraction
  above the padded bottom row); no compiler's version rose and the measured products stayed current. PG-1b brings
  anchorY back as an optional field, for the pictures not anchored at their bottom.

The evening's PRs, in this order:

- PG-0b: the evening's decisions here and the review's fixes in the documents; a movable body's knocked pictures may
  not extend sideways.
- PG-1b made one rule for every picture in the drawing (the renderer's `vehicle` mark and the scene's separate vehicle
  pictures gone), the course image's version 6 with its optional anchorY (every course image written again; none
  carries it yet) and the placement rule, and tested the parts below the ground: no course draws otherwise.
- PG-9b stood SUPER MONACO GP's boards below the ground by their three groups (conversion version 5): the supports
  and the tunnel mouths' rocks at the original's negative heights (76 on the race, 20 on the qualifying), the roadside
  buildings, stone walls and rock faces folded at the ground's row (127, 12), the far buildings on the ground (665,
  414).
- PG-4b added `SNOW`, snow lying thin on the road, to the material catalog (grip 0.25, rolling resistance 0.025), the
  surface sounds and the tire puffs (a white powder); its values and their grounds are
  [Calibration](calibration.md#surface-materials)'s. No course uses it yet (PG-7c gives it to PITTSBURGH's and DENVER's
  snow); every course was measured again.
- PG-6c made OUTRUN's lying things boards again (conversion version 14): the sea and lakes 4608, the sand 4588 and
  the patches `outrun-001` at the original's middle anchor, at height 0, with `WATER` beneath the sea and lakes from
  their waterline to the verges and nothing beneath the sand ([Lying boards](original-road-data.md#lying-boards),
  `ground-materials.ts`); every extending board cut into its edge, a board of its own standing once with each piece,
  and the part that repeats ([Extending boards](original-road-data.md#extending-boards), `extending-boards.ts`, shared
  with TURBO OUTRUN); a board and its edge are repeated together, so every Section keeps within 2048 sprite elements
  (at most 1564, OLD CAPITAL's). ALPS's grass strip 894 m below the road (the original's height −32768) is not placed.
  OUTRUN's roads no longer bake colors.
- PG-7c: TURBO OUTRUN's lying things likewise; the baking's color parts deleted.
- PG-12: shadows at the foot (OUTRUN, SUPER HANG-ON, TURBO OUTRUN, ENDURO RACER).

Left by Stage PG to later stages: the plan's injectivity check (`plan-domain-injectivity.ts`) takes only the cells next
to each other in order as neighbours; mended, it would need no way round such as PG-6b1's.

Each PR passes Node 24's `npm test` and the driving scenarios with current measured products, carries before and after
images (PG-1: the COCONUT BEACH scene above with the rival's tires and the sea strip seen, and pictures beyond a crest
hidden as today; PG-6 and PG-7: the standing strips and the sea and patches baked, before and after conversion and
beside the original; PG-9: the boards with 32 views made one), and leaves Pages ready for K's devices.
The evening's PRs set the before, the after and the original side by side as well: PG-6c and PG-7c the sea, lakes,
sand and patches, waves, dunes, puddles, pebbles and snow, and the grass and clouds' strips (no gaps, no repeated end
shapes); PG-9b the supports, the tunnel mouths and the roadside buildings; PG-12 TURBO OUTRUN's trees, OUTRUN's rocks
and people and SUPER HANG-ON's trees; and the racing lines' times a material changes, by vehicle.

## Stage RH — RACING HERO from the ROMs

K stopped Stage RH on 2026-10-22: RACING HERO is not made. RH-1 (this stage in NEXT), RH-2 (the ROMs read into a
dump), RH-3a (the crossings' rule for passages near a road's end), RH-3 (the ten courses), RH-5 (their skies) and RH-4
(their objects as boards) reached main; RH-6 deleted what they made for RACING HERO alone: the ten courses, their
images, skies and racing lines, the road data tool's `racing-hero-*` modules and commands, `sky-baking`'s second way
(`bakeFittedSky`) and RACING HERO's sections of the specifications. RACING HERO's research notes and tools stay in K's
research kit, outside the repository. Kept, as other originals use them: RH-3a's rule for crossings
([Profile](original-road-data.md#profile)), and the functions RH-3 made general: SUPER MONACO GP's `cutsByCount`,
`meanColor`, `ramped` and its Sections' element bounds, ENDURO RACER's rule for objects on another passage's road with
a half-width along the road, and `sky-baking`'s `pixelDifference`; so too RH-2's X board ROM reading and RH-5's 16B
tiles' pixel, which SUPER MONACO GP reads through.

## Stage DT — DRIFT TUNED trial vehicles

Stage DT lets K try on devices whether a DRIFT SERIES ("いかす走り屋チーム天国") can work: S13 and AE86 DRIFT TUNED
are driven in FREE PLAY; FC3S follows once K decides its open points. A series, scoring and series rules for the camera
or steering are not made in this stage (the Steering row of [Pending product decisions](#pending-product-decisions)).

K decided it runs in parallel with Stage RD, in its own sessions and branches. DT touches vehicles and physics, which
RD does not, so it shares only NEXT and the other shared documents with RD: when main moves, the branch is brought up to
it and validated again before main is fast-forwarded.

K's decisions for the stage:

- A vehicle may give its own tire and `wheelSlip` (wheel slip protection); a vehicle that does not uses the driving
  definition's game-wide defaults, which stay there while the game-wide tuning is unfinished. Neither is a difficulty
  or player choice ([Vehicle identity](product.md#vehicle-identity)).
- A DRIFT TUNED vehicle is a vehicle of its own (another specification of the same model): its pictures are the real
  car's, its tires and engine need not be. DRIFT TUNED vehicles have TCS and MSR off and ABS on (DT-6b).
- Wheel slip protection has two sides, each its own switch: the drive side, TCS and MSR (both bound the engine's
  effective opening), and the brake side, ABS (it bounds the pedal brake). A drift series too keeps ABS and drops TCS
  (DT-6b, in place of one switch for all three).
- Drifting needs a tire of its own: S13 `gripX=gripY=0.8` and AE86 0.7, both with `peakSlipX=peakSlipY=0.1`,
  `knee=0.74`, `loadSensitivity=0.15` and the sliding ratio 0.85 (DT-6; DT-2 started both at 1.1 with no fall), which K
  tunes in DEV; FC3S's is decided with DT-3.
- `AE86_DRIFT_TUNED` (Corolla Levin 3-door GT-APEX, early, May 1983 – May 1985, 4A-GEU, 5MT), `S13_DRIFT_TUNED`
  (Silvia K's, early, May 1988 – January 1991, CA18DET, 5MT) and `FC3S_DRIFT_TUNED` (Savanna RX-7 GT-X, early,
  October 1985 – April 1989, 13B turbo, 5MT).

- Planned drivers always drive with wheel slip protection on both sides (TCS, MSR and ABS act on the engine's
  effective opening and the pedal brake alone, so they are an input-side aid like the steering rule); a vehicle's
  `wheelSlip` holds while the player's input reaches it (DT-2b). Physics is the same for the player and the AI. The
  drifting AI is made now, before any series, as a planned driver's driving style (DT-7).
- A handbrake may come later: a brake on the rear wheels alone that ABS does not limit, so it locks them, with its key
  and SETTINGS, the HUD's input display, and planned drivers able to use it (a way to start a drift). It is not made
  in this stage, and driving input and brake handling stay open to it.
- Shifts are one rule for every vehicle: they decide by the vehicle's speed, the driven wheels' speed rolling without
  slip, so wheels that spin, in a jump too, move no shift and the engine follows them to the fuel cut (DT-4).
- A tire has a sliding ratio, its force sliding far past the peak over the peak's force, held by the driving
  definition's tire and by every vehicle's own tire: 1 (the force holds the peak, as today) on all but the DRIFT TUNED
  tires. The wheel solve takes the force's fall past the peak at the substep's starting wheel speed, so it keeps one
  root at any sliding ratio (K's choice of the DT-5 report's options; DT-5).
- Planned drivers sometimes spin the DRIFT TUNED cars despite wheel slip protection, which K accepts until the drifting
  AI, designed to catch a slide past a falling tire's peak: a planned driver catches none, and with the drift tire
  braking at the limit in a corner takes a wheel past it (K's choice of the DT-6 report's options; DT-6).

S13_DRIFT_TUNED and AE86_DRIFT_TUNED are in the catalog (DT-2) with the drift tire, TCS and MSR off and ABS on. K
tries them in FREE PLAY with no rivals on TSUKUBA with the MOVING camera and FRONT steering, S13 first, tuning GX, GY
and SR in DEV and adopting the exported mechanics document. Until their own pictures and exhausts are made, they
borrow:

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
| SUPER HANG-ON  | The reference courses have 6, 10, 14 and 18 stages (AFRICA, ASIA, AMERICA, EUROPE), the export sitdown/upright cabinet's (MAME's `shangon`, K's decision; [Stage SH](#stage-sh--super-hang-on-from-the-roms)). VFR750R keeps the existing 1988 full-power definition; GSX-R750 is the 1988 standard export model, not the 1989 GSX-R750R; 851 is a 1988 road model.                  |
| OUTRUN         | COUNTACH candidate: 25th Anniversary, 1988–1989. TESTAROSSA keeps the existing 1989 definition.                                                                                                                                                                                                                                                                                      |
| TURBO OUTRUN   | Stage order: New York, Washington D.C., Pittsburgh, Indianapolis, Chicago, St. Louis, Memphis, Atlanta, Miami, New Orleans, San Antonio, Dallas, Oklahoma City, Denver, Grand Canyon, Los Angeles. The reference course is raised from the ROMs of MAME's `toutrun` (K's decision; [Stage TO](#stage-to--turbo-outrun-from-the-roms)). F40 and 959 are period road specifications.   |
| CHASE H.Q.     | 928 candidate: S4. ESPRIT TURBO generation is open. 911 TURBO (930) relates to the existing 3.3 L definition.                                                                                                                                                                                                                                                                        |
| CISCO HEAT     | Reference stages: Golden Gate Bridge → Fisherman's Wharf, Fisherman's Wharf → Union Square, Union Square → Moscone Center, Moscone Center → Twin Peaks, Twin Peaks → Treasure Island; internal forks are unverified. BROUGHAM TUNED starts from the 1989 Brougham. 300ZX candidate: 1989–early 1990 Z32 Twin Turbo, without mixing US and Japanese outputs or two-seat and 2+2 data. |
| OUTRUNNERS     | The reference has 30 stages and 10 goals over both courses; connections are to be confirmed. Candidates: 911 SPEEDSTER 1989, RX-7 (FC3S) 1989, COBRA 427 (year open), ELDORADO (Biarritz; generation open), MINI (1967 Cooper S 1275), QUATTRO (1989 20V).                                                                                                                           |
| COOL RIDERS    | Stage nodes: prestage 1, stages 1–4 with 3, 9, 15 and 21, final NEW YORK 1 (fifty); each of three main routes runs 1, 3, 5, 7 with shared and merging nodes. The full exit table is open. VMAX 1200: 1989 export; RG500 Γ: 1985 road model; GL1500: 1988–1989; SUPER CUB 90: a late-1980s model.                                                                                     |
| FINAL LAP      | 1987 car candidates: Williams-Honda FW11B, Lotus-Honda 99T, McLaren-TAG Porsche MP4/3, March-Cosworth 871. Whether SUZUKA follows the reference game's layout or the real 1987 or 1989 circuit is open.                                                                                                                                                                              |
| WEC LE MANS 24 | 962C and C9 in their 1989 Le Mans specifications; reference cars Joest #9 and #63 are candidates. Qualifying and race outputs are not mixed.                                                                                                                                                                                                                                         |
| BIG RUN        | Reference route toward Dakar: Tunis, Tozeur, Tumu, Agadez, Bamako, Saint-Louis; the mapping to stages is unverified. A rally-raid 959 is a different vehicle from the road 959; 205 T16 is not the 205 GTI; PAJERO generation is open.                                                                                                                                               |
| RALLY STAGE    | Provisional courses: FOREST (tarmac, gravel, tarmac, gravel), MOUNTAIN (narrow tarmac, gravel climb, mountain tarmac), COAST (fast tarmac, dirt, wet tarmac), WINTER (tarmac, snow, packed snow, tarmac). Vehicle years, valve variants and Group A references are open.                                                                                                             |

### Courses of the originals

OUTRUN's courses are raised from its ROMs' road data in [Stage RD](#stage-rd--outrun-from-the-originals-road-data).
SUPER HANG-ON's are raised with the same tool in [Stage SH](#stage-sh--super-hang-on-from-the-roms), TURBO
OUTRUN's in [Stage TO](#stage-to--turbo-outrun-from-the-roms), ENDURO RACER's in
[Stage ER](#stage-er--enduro-racer-from-the-roms) and SUPER MONACO GP's in
[Stage MG](#stage-mg--super-monaco-gp-from-the-roms). How CHASE H.Q.'s are raised, K decides then.
Their time limits come from reference driving, as for every course.

Left by Stages ER and MG to later stages (K, 2026-10-21):

- The hills and jumping: ENDURO RACER's grade tables, its jumps and the 5 jump mounds standing on another passage's
  road, its crossings made again, and SUPER MONACO GP's hills.
- The bodies of ENDURO RACER's 183 objects on the road, once the drivers can avoid objects standing on the road.
- The SUPER MONACO GP series and its overcast set.

Left to later stages (K, 2026-10-22): BRANCH removed from the engine; TSUKUBA made again; then the walls' feature
removed, replaced by rows of boards.

OUTRUN's seven roads, as Stage RD2 left them (K, 2026-10-19 to 20):

- **No class until the hills.** The three originals' hills are reviewed and made again in a later stage, with proper
  grade separation; until then they keep today's rule, crossings keep the 6 m rule, and OUTRUN's roads have no class,
  FREE PLAY driving them untimed. Their classes are decided by the stage that makes the hills again (K, 2026-10-22).
- **Guidance.** The way of showing which road to take where a road is chosen is built to a default; K decides it on
  Pages.
- **BRANCH.** OUTRUN no longer uses BRANCH; K decided to remove it from the engine in a later stage (2026-10-22).
- **Pictures.** The ROMs' pictures are provisional: the product's are all drawn again, and the cars' pictures are this
  game's.

### Inspection and art

The course editor is the human inspection and adjustment view over the file/CLI workflow. Decide the default rounding
steps and joining tolerances of its cleaning operations while producing the first product courses, and which findings
become build rules once those defaults hold. The findings are worked out after every change, so their time is the
author's wait (one worker, the default amounts): TSUKUBA 39 s (digits 0.2 s, unneeded knots 13 s, near and referable
27 s, merge kinds 0.3 s). Show anchor displacement after geometry changes if producing courses
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

Add surface materials to the one game-wide material catalog as product courses need them (courses reference material IDs; there are no per-course material documents), with physical and sound values tuned on those courses: kerbs (circuits), gravel traps, concrete (streets, run-offs, pits), packed snow and mud (off-road), and cobblestones; shallow water is `WATER` (Stage PG's PG-4) and snow lying thin on the road `SNOW` (PG-4b, RALLY STAGE's WINTER "snow"; packed snow stays a later material), their values to tune on those courses. Kerbs and cobblestones rely on sound for their vibration unless a material roughness is added later.

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
    the most on VFR750R.

- Choices made in Stage OT and kept after OUTRUN TEST went (each recorded in its PR):
  - Tests (OT-1, OT-2): the TSUKUBA scenarios' player is 911 TURBO 3.3 against GOLF GTI 16V rivals at pace 1; the
    scenarios are split in two files, neither over about 30 s.
  - `WET_ASPHALT` (OT-4): grip 0.7 and rolling resistance as ASPHALT. Its sound has a +6 dB high band and
    susceptibility 0.7, to tune on real devices.
  - Transitions (OT-5): a wipe lays both maps on the incoming map's scroll; a rise keeps each map's own scroll; a
    wipe's direction comes from the road's turn over the 150 m ahead (threshold 0.05 rad); a transition takes 1 s, and
    a new crossing during one starts from the map being brought in.

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
| Series content   | CISCO HEAT course type; COOL RIDERS connections, rivals and traffic; FINAL LAP layout and cars                                                                                                                                                                                                                                                                                           |
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
- FE-10 (decided in Stage OT): a wallpaper change asked for while a black transition runs still finishes through black;
  only a steady screen cuts.

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
