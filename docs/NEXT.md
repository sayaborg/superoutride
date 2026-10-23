# Next task checkpoint

## Current state

Each line is one area as it stands, with the document that owns it.

- **Scene and runs.** One compiled graph scene serves TSUKUBA and the courses raised from the originals' ROMs with RACE,
  TIME ATTACK and FREE PLAY runs. Without DEV, FREE PLAY offers TSUKUBA alone; the originals' courses, in no series, are
  DEV's ([Architecture](architecture.md), [Run setup](content-and-gameplay.md#run-setup)).
- The [five racing vehicles](racing-vehicles.md) are authored FREE PLAY entries with provisional pictures and sound.
  Lotus 79 SPECIAL has two actual forward ratios and opts into contact explosion/recovery. The owner's scope is vehicle
  content and this contact response; any other physics addition needs prior confirmation.
- The [five production road motorcycles](road-bikes.md) are FREE PLAY entries with original provisional sprites,
  four colors and four-stroke sound. Their source ledger and shared-solver measurements distinguish verified
  specifications from estimates. Existing traffic policy and series eligibility remain unchanged; new physics
  still requires prior confirmation.
- **Product.** TSUKUBA, the first product course, is timed by TSUKUBA CLUBMAN, the first product series, with its
  PRODUCTION 750, GTI CUP and 911 CUP classes; the [product specification](product.md) is Stage 16's target
  ([Product courses](content-and-gameplay.md#product-courses),
  [Series documents](content-and-gameplay.md#series-documents)).
- **Courses of the originals.** OUTRUN's seven roads, SUPER HANG-ON's four courses, TURBO OUTRUN's and ENDURO RACER's
  courses and SUPER MONACO GP's two circuits are raised from the ROMs by the road data tool
  ([Original road data](original-road-data.md), [Courses of the originals](#courses-of-the-originals)).
- **Features no course uses.** BRANCH (forks, seam joins and signs shown by a fork's choice), solid walls (TSUKUBA's
  walls are looks alone), open course limits, movable objects (and their knocked pictures), and the `WET_ASPHALT` and
  `SHOULDER` materials stay in the engine ([Content and gameplay](content-and-gameplay.md),
  [Stage RM](#stage-rm--branch-tsukuba-and-the-walls)).
- **Course format.** Plans of straights and arcs, positions measured from joints, lanes, Lateral values, Strips, gates
  and images named by file; circuits are closed cycles of two or more Sections
  ([CourseDocument](content-and-gameplay.md#coursedocument)).
- **Drawing.** Strips author surface color and material; ground and walls are drawn by LEVEL-POINT; sprites are indexed;
  every picture folds at its anchor and casts its own shadow; BG is one infinite tiled plane; the camera stands 6 m
  behind and 2 m above the player's base point ([Architecture](architecture.md#sprites-and-painter),
  [Camera](architecture.md#camera-and-fixed-metric), [Image assets](image-assets.md)).
- **Pictures.** TESTAROSSA's, 911 TURBO 3.3's and GOLF GTI 16V's pictures are generated sets, VFR750R's a 3D
  prototype, the other vehicles' converted provisional pictures
  ([Vehicle picture generator](image-assets.md#vehicle-picture-generator)).
- **Content and measured products.** One manifest verifies all delivered content; the build compiles it in one pass and
  admits the measured racing lines, reference times and pace schedules, which `npm run measure` saves under `content/`
  ([Build outputs](development.md#build-outputs), [Measured products](development.md#measured-products)).
- **Race, drivers and traffic.** The race owns competitor mechanics in fixed steps and publishes facts; one planned
  driver drives rivals, traffic, reference runs, the attract demo and the takeover; footprints contact vehicles, walls,
  limits and objects through one external force ([Drivers](content-and-gameplay.md#drivers),
  [Traffic](content-and-gameplay.md#traffic), [Body contact](content-and-gameplay.md#body-contact)).
- **Vehicle physics.** Five-point torque curves, fuel cut, the tire law, protection, steering and recovery
  ([Vehicle physics](vehicle-physics.md)).
- **Audio.** The audio scene and sound graph, engine sounds by exhaust graphs to a measured loudness, tire audio
  (UNIFIED), recordings and music, effects and contact sound; the recordings are placeholders until K's files replace
  them ([Audio](audio.md), [Tire audio](tire-audio.md), [placeholder recordings](#placeholder-recordings)).
- **Tire puffs.** Smoke, spray and dust by the surface under each tire ([Tire puffs](tire-puffs.md)).
- **Front end and HUD.** TITLE to RESULT inside the frame, carousels, SELECT VEHICLE's pages, the HUD's fonts, the
  player record and `dev=1` ([Browser](browser.md), [HUD design sources](image-assets.md#hud-design-sources)).
- **Authoring.** One authoring core serves the build, the CLI and the workbench with its course editor; loading compiles
  in slices ([Workbench](development.md#workbench),
  [Course authoring operations](content-and-gameplay.md#course-authoring-operations),
  [Course loading](architecture.md#course-loading)).

Next PR: [Stage TD](#stage-td--the-road-data-tool-and-the-documents-tidied)'s next PR (TD-5);
then [Stage GR](#stage-gr--the-originals-courses-mended) and
[Stage RM](#stage-rm--branch-tsukuba-and-the-walls), and beside them
[Stage NM](#stage-nm--a-namco-original-from-the-roms), later [Stage BR](#stage-br--big-run-from-the-roms),
[Stage CS](#stage-cs--cisco-heat-from-the-roms) and [Stage TA](#stage-ta--a-taito-original-from-the-roms);
[RD-6e](#courses-of-the-originals) once K's recordings come;
[DT-7](#stage-dt--drift-tuned-trial-vehicles), and [DT-3](#stage-dt--drift-tuned-trial-vehicles) once K decides; then
[Stage 16](#stage-16--produce-product-courses).

Implement the stages in order. Each PR's restart instructions supply its detailed requirements.
Topic contracts belong to the topic specifications; development and release procedure belongs to AGENTS.
PRs hold rationale and verification evidence. Each stage first consolidates the structure its later PRs consume.

## Stage TD — The road data tool and the documents tidied

Stage TD gathers the tools and documents the Sega originals made into one shared form, for the work that follows them
([Stage GR](#stage-gr--the-originals-courses-mended)) and for the next originals
([Stage NM](#stage-nm--a-namco-original-from-the-roms), [Stage BR](#stage-br--big-run-from-the-roms),
[Stage CS](#stage-cs--cisco-heat-from-the-roms), [Stage TA](#stage-ta--a-taito-original-from-the-roms)). It changes no
output. Its PRs are numbered from TD-1.

K's decisions (2026-10-22 and 2026-10-23):

- **The Sega originals are five**: OUTRUN, SUPER HANG-ON, TURBO OUTRUN, ENDURO RACER and SUPER MONACO GP. RACING HERO
  is not made ([Courses of the originals](#courses-of-the-originals)).
- **What the repository may hold goes into it**: each original's research notes, the procedure that raises an original
  from its ROMs, and small research tools that decrypt nothing and hold no other project's code and no ROM data. What
  it may not hold stays on K's machine: the ROMs' zips and raw data, decrypting code and keys, decrypted programs, the
  harnesses that run the originals, disassemblies, and comparison pictures made from the ROMs.
- **The courses can be raised again from the ROMs' zips at any time**: one command raises every original, and a section
  of the shared document says how; K's machine keeps only what the repository may not hold.
- **NEXT is made ready for the next work**: the stages below, whose names K may change. Stage PG's decisions (the
  picture rules, the water material, the view sets and OUTRUN TEST and TRIAL deleted) do not change, nor does the line
  it left to later stages, which is named Stage RM.
- **No output changes**: nothing under `content/` and `src/` changes, every original's dump and `--check` stay byte for
  byte the same, and no racing line is measured again.
- **SUPER MONACO GP's original eye** is about 0.52 m, not about 0.57 m as
  Stage MG said; its chapter already gives 0.52 m
  ([SUPER MONACO GP's objects](original-road-data.md#super-monaco-gps-objects)).

Rules of the stage:

- One purpose a PR: what is added, what is moved or renamed, what is deleted and what changes in logic are separate PRs
  ([AGENTS](../AGENTS.md#work-and-release)). A PR that moves lists at its start every change other than the move, and
  only those this section names. A PR too large for one review is split and the split reported.
- Open points are decided by their defaults and recorded in the PR: the names of modules and documents, what is shared
  and what is an original's, the index's wording, which lines Current state keeps, where open points and links go. The
  stage stops only where it cannot keep the output (a dump, a `--check`, `content/`, `src/`, a command's standard output
  or the sound originals would change), where two documents disagree and their owner does not decide, or where a rule
  of the rights below would break.
- Rights, as before: the ROMs' zips and raw dumps enter no commit, PR body or PR picture; no decrypting code or key and
  no research output (program images, disassemblies, string lists, dumps) enters the repository; no other project's
  code is copied or ported, and new text names MAME alone, the rest as "other projects' code".
- Every PR that touches code (TD-4, TD-5, TD-6, TD-9b) shows on K's local ROMs, before and after it: every original's
  dump the same (their SHA-256 in the PR), every original's `--check` passing, no difference under `content/` and
  `src/`, every command's standard output the same, and the sound originals' SHA-256 the same. The standing checks are
  [AGENTS](../AGENTS.md#checks)'s and the road data commands [Development](development.md#road-data-commands)'s.
- Each concept keeps one owning document ([index](README.md)). A move changes no text but its links, the sentences
  saying where something is, and the one sentence that joins a rule written in several places, each such sentence shown
  before and after in the PR. Where NEXT and the chapter owning a matter disagree, the chapter holds and NEXT's sentence
  is not moved; the PR lists the disagreements found. Every document PR shows that every link and anchor resolves but
  those broken on main before it.
- **Beside the vehicles.** Vehicles are being added beside this stage (RV-1 to RV-4, the five road motorcycles). Their
  documents ([Racing vehicle ledger](racing-vehicles.md), [Road motorcycle ledger](road-bikes.md) and the folders
  below them), their pictures and checks in `tools/build/` and `tools/graphics/`, `tools/course/racing-vehicle-check.ts`
  and their tests are not Stage TD's: they are neither moved nor reworded, and Current state's vehicle lines and the
  index's rows for them stay. Where a PR of either rewrites the same file, it is built on whichever reached main first,
  keeping the other's lines. Stage TD measures nothing again; when main's measured products are new, the checks pass on
  them.

PRs, in this order:

- TD-1: this section, the later stages below, the driver's eye view in
  [Pending product decisions](#pending-product-decisions), "Next PR", and Stage PG closed.
- TD-2 is not needed: SUPER MONACO GP's chapter already gives its original eye as 0.52 m.
- TD-3a: what still holds in the finished stages' sections moved to its owners: the rules all originals keep to a new
  section of [Original road data](original-road-data.md), Rules of the originals; each original's decisions to its
  chapter; product promises to [Product](product.md); the later work's promises and what was left, RD-6e among them, to
  [Courses of the originals](#courses-of-the-originals); Current state's open points to their owners.
- TD-3b: the finished stages' sections deleted (VC, RD, SH, TO, ER, MG, PG and RH).
- TD-3c: Current state rewritten as a restart point, one line an area with its owner's link.
- TD-4: the parts originals share moved to modules named after no original, OUTRUN's ROM tables to its ROM module, and
  one `paletteName`.
- TD-5: one way of finding the ROMs: a shared module finds each ROM of a set by its CRC-32 and size, refuses a set
  missing one by the set's and the ROM's names, and writes the dump's ROM records.
- TD-6: the road data tool's command line split into one command module an original; OUTRUN's commands take its name as
  the others do.
- TD-7: [Original road data](original-road-data.md) split into the shared document and one document an original.
- TD-8: the research tools (`tools/research/`) and their subsection in [Development](development.md).
- TD-9: the procedure that raises an original from its ROMs, a section of the shared document, and each original's
  research notes (`docs/research/`).
- TD-9b: one command raising every original from its zips, and its section in the shared document.
- TD-10: this section deleted, and "Next PR" pointing to the later stages.

Each PR updates its specifications with it (the index, Development, NEXT's progress).

Not in this stage: any change of behavior or format; the courses, pictures, skies and racing lines; the hills, jumps,
crossings and bodies (Stage GR); BRANCH, TSUKUBA and the walls (Stage RM); deleting other tools or documents, or mending
the links broken today (the stage's last report lists the candidates for K); making the tool general for BIG RUN and
CISCO HEAT (Stage BR); renaming course IDs, pictures or dump formats; testing the rule on imports between originals.

## Stage GR — The originals' courses mended

Stage GR mends the five originals' courses, decides how hills are made and makes them, and fixes defects, among them
SUPER MONACO GP's QUALIFYING, which loads and never starts; what Stages ER and MG left in
[Courses of the originals](#courses-of-the-originals) is its.

## Stage RM — BRANCH, TSUKUBA and the walls

Stage RM makes what Stage PG left to later stages in [Courses of the originals](#courses-of-the-originals).

## Stage NM — A NAMCO original from the ROMs

Stage NM raises a NAMCO original from its ROMs, one whose courses are simple first; K chooses which.

## Stage BR — BIG RUN from the ROMs

Stage BR raises JALECO's BIG RUN (1989) from its ROMs, after Stage NM.

## Stage CS — CISCO HEAT from the ROMs

Stage CS raises JALECO's CISCO HEAT (1990) from its ROMs, after Stage BR.

## Stage TA — A TAITO original from the ROMs

Stage TA raises a TAITO original from its ROMs, CHASE H.Q. or another as K chooses, after Stage CS.

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
| SUPER HANG-ON  | The reference courses have 6, 10, 14 and 18 stages (AFRICA, ASIA, AMERICA, EUROPE), the export sitdown/upright cabinet's (MAME's `shangon`, K's decision; [SUPER HANG-ON](original-road-data.md#super-hang-on)). VFR750R keeps the existing 1988 full-power definition; GSX-R750 is the 1988 standard export model, not the 1989 GSX-R750R; 851 is a 1988 road model.                |
| OUTRUN         | COUNTACH candidate: 25th Anniversary, 1988–1989. TESTAROSSA keeps the existing 1989 definition.                                                                                                                                                                                                                                                                                      |
| TURBO OUTRUN   | Stage order: New York, Washington D.C., Pittsburgh, Indianapolis, Chicago, St. Louis, Memphis, Atlanta, Miami, New Orleans, San Antonio, Dallas, Oklahoma City, Denver, Grand Canyon, Los Angeles. The reference course is raised from the ROMs of MAME's `toutrun` (K's decision; [TURBO OUTRUN](original-road-data.md#turbo-outrun)). F40 and 959 are period road specifications.  |
| CHASE H.Q.     | 928 candidate: S4. ESPRIT TURBO generation is open. 911 TURBO (930) relates to the existing 3.3 L definition.                                                                                                                                                                                                                                                                        |
| CISCO HEAT     | Reference stages: Golden Gate Bridge → Fisherman's Wharf, Fisherman's Wharf → Union Square, Union Square → Moscone Center, Moscone Center → Twin Peaks, Twin Peaks → Treasure Island; internal forks are unverified. BROUGHAM TUNED starts from the 1989 Brougham. 300ZX candidate: 1989–early 1990 Z32 Twin Turbo, without mixing US and Japanese outputs or two-seat and 2+2 data. |
| OUTRUNNERS     | The reference has 30 stages and 10 goals over both courses; connections are to be confirmed. Candidates: 911 SPEEDSTER 1989, RX-7 (FC3S) 1989, COBRA 427 (year open), ELDORADO (Biarritz; generation open), MINI (1967 Cooper S 1275), QUATTRO (1989 20V).                                                                                                                           |
| COOL RIDERS    | Stage nodes: prestage 1, stages 1–4 with 3, 9, 15 and 21, final NEW YORK 1 (fifty); each of three main routes runs 1, 3, 5, 7 with shared and merging nodes. The full exit table is open. VMAX 1200: 1989 export; RG500 Γ: 1985 road model; GL1500: 1988–1989; SUPER CUB 90: a late-1980s model.                                                                                     |
| FINAL LAP      | 1987 car candidates: Williams-Honda FW11B, Lotus-Honda 99T, McLaren-TAG Porsche MP4/3, March-Cosworth 871. Whether SUZUKA follows the reference game's layout or the real 1987 or 1989 circuit is open.                                                                                                                                                                              |
| WEC LE MANS 24 | 962C and C9 in their 1989 Le Mans specifications; reference cars Joest #9 and #63 are candidates. Qualifying and race outputs are not mixed.                                                                                                                                                                                                                                         |
| BIG RUN        | Reference route toward Dakar: Tunis, Tozeur, Tumu, Agadez, Bamako, Saint-Louis; the mapping to stages is unverified. A rally-raid 959 is a different vehicle from the road 959; 205 T16 is not the 205 GTI; PAJERO generation is open.                                                                                                                                               |
| RALLY STAGE    | Provisional courses: FOREST (tarmac, gravel, tarmac, gravel), MOUNTAIN (narrow tarmac, gravel climb, mountain tarmac), COAST (fast tarmac, dirt, wet tarmac), WINTER (tarmac, snow, packed snow, tarmac). Vehicle years, valve variants and Group A references are open.                                                                                                             |

### Courses of the originals

OUTRUN's, SUPER HANG-ON's, TURBO OUTRUN's, ENDURO RACER's and SUPER MONACO GP's courses are raised from their ROMs'
road data ([Original road data](original-road-data.md)); RACING HERO is not made (K, 2026-10-22). How CHASE H.Q.'s are
raised, K decides in [Stage TA](#stage-ta--a-taito-original-from-the-roms).
Their time limits come from reference driving, as for every course.

Left by the stages that raised them, beside what follows:

- OUTRUN: K's video taking the left road every time is not awaited; when it comes, kinds 3 and 4 and the forks' sides
  are checked again. RD-6e: music, local originals of the tracks from K's four MAME recordings once they come.
- SUPER HANG-ON: the hills (how the original's vertical heading tables become grades), the SUPER HANG-ON series itself
  (sixteen bikes, their colors and pace), sounds and music, the mini ride-on cabinets' courses (their programs are
  encrypted), the ending's motion (its last frame alone stands), and the product's pictures drawn again. When classes
  return, each is the player alone on VFR750R from GO (slot 15), no traffic, margin 1.35.
- TURBO OUTRUN: the hills made again (proper grade separation with them), the TURBO OUTRUN series itself (F40 and 959,
  their colors and sides, the rival and the clock's values), the original's time extensions, turbo, tune-ups and traffic
  tables, the objects that fly or break when hit made movable, the ending's picture as a screen picture, sounds and
  music, the other cabinets' courses (`toutrun2` among them), and the product's pictures drawn again. Until its class is
  made the GOAL gate's posts over lanes a and f are shown in drawings; whether a reference run hits them is checked
  then.
- ENDURO RACER: the hills (the original's grade tables) and jumping, the ENDURO RACER series itself (bikes, rivals,
  colors, pace and time extensions), sounds and music, the motion of what moves, the ending's text, and the product's
  pictures drawn again.
- SUPER MONACO GP: the hills (the original's dz) and grade separation, the SUPER MONACO GP series itself (cars, rivals,
  laps, rank limits, time and the overcast set), sounds and music, the motion of what moves, the start's signal, the
  mirror and the cockpit, and the product's pictures drawn again. A format holding pictures at the original's pixel size
  would make its pictures smaller (most are the 16-unit class, each of the original's pixels about 4 × 4 texels), and
  is not made now.
- Stage PG: the plan's injectivity check (`plan-domain-injectivity.ts`) takes only the cells next to each other in order
  as neighbours; mended, it would need no way round such as PG-6b1's.

Left by Stages ER and MG to [Stage GR](#stage-gr--the-originals-courses-mended) (K, 2026-10-21):

- The hills and jumping: ENDURO RACER's grade tables, its jumps and the 5 jump mounds standing on another passage's
  road, its crossings made again, and SUPER MONACO GP's hills.
- The bodies of ENDURO RACER's 183 objects on the road, once the drivers can avoid objects standing on the road.
- The SUPER MONACO GP series and its overcast set.

Left to [Stage RM](#stage-rm--branch-tsukuba-and-the-walls) (K, 2026-10-22): BRANCH removed from the engine; TSUKUBA
made again; then the walls' feature removed, replaced by rows of boards.

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

Engine sound lagged and stayed late on some devices; on the owner's device it no longer does (2026-10-14), its cause
not identified. Review it on the named devices with `dev=1`'s audio timing line, which measures the AudioContext's
latency, clock and worklet overruns ([Browser](browser.md#performance-hud)).

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
| Camera           | Whether SUPER MONACO GP gets a driver's eye view (its camera 1 m high, where its base point lies); if made, the player's car draws its shadow alone and the other vehicles their next smaller size's picture stretched twice                                                                                                                                                             |
| Bank             | How the displayed vehicle bank follows lean (real-device evaluation)                                                                                                                                                                                                                                                                                                                     |
| Art              | Production assets, new physical materials and tunnel/background content                                                                                                                                                                                                                                                                                                                  |
| Vehicle art      | Whether cones and barricades are also generated from solids                                                                                                                                                                                                                                                                                                                              |
| Vehicle art      | Pictures of a stopped vehicle's wheels (generated pictures always show them turning)                                                                                                                                                                                                                                                                                                     |
| Vehicle art      | Whether mirroring halves the direction pictures a set stores                                                                                                                                                                                                                                                                                                                             |
| Vehicle art      | VFR750R's four colors on real devices: the real tricolour and three provisional fictional schemes                                                                                                                                                                                                                                                                                        |
| Weather          | Falling rain over wet sections (WET_ASPHALT lies under an overcast sky without rain today)                                                                                                                                                                                                                                                                                               |
| Tire puffs       | Whether a sliding tire throws its puffs by the friction work beyond the tire law's peak (the tire observation's `slidingPower`), K's reading of "work on the plateau" to confirm ([Tire puffs](tire-puffs.md))                                                                                                                                                                           |
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
