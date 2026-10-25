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
- The [fourteen arcade car selections](chase-turbo-vehicles.md) are provisional FREE PLAY entries, bringing the
  catalog to 35 vehicles. The 1986 Porsche 930 and 1984 Corvette C4 coexist with their existing 1989 versions;
  the unidentified box truck remains deferred. The ledger owns specification limits and validation.
- **Product.** TSUKUBA, the first product course, is timed by TSUKUBA CLUBMAN, the first product series, with its
  PRODUCTION 750, GTI CUP and 911 CUP classes; the [product specification](product.md) is Stage 16's target
  ([Product courses](content-and-gameplay.md#product-courses),
  [Series documents](content-and-gameplay.md#series-documents)).
- **Courses of the originals.** OUTRUN's twelve roads, SUPER HANG-ON's four courses, TURBO OUTRUN's and ENDURO RACER's
  courses and SUPER MONACO GP's two circuits are raised from the ROMs by the road data tool
  ([Original road data](original-road-data.md), [Courses of the originals](#courses-of-the-originals)). Stage EX has
  put them on their road path P: their plans raised from the ROMs' heading tables (SUPER MONACO GP's from its point
  path, closing by the rule alone), their widths unrounded and joined by one monotone cubic, their material ended at
  the plan's clearance and their ground at each original's own limit beside the road; OUTRUN's
  forks and goals are the original's, with parting gates, and the lying pictures have no material. What remains is
  [Stage EX](#stage-ex--the-originals-courses-exact-their-constants-few)'s list.
- **Features no course uses.** BRANCH (forks, seam joins and signs shown by a fork's choice), solid walls (TSUKUBA's
  walls are looks alone), open course limits, movable objects (and their knocked pictures), and the `WET_ASPHALT`,
  `SHOULDER` and `SNOW` materials (`SNOW` for RALLY STAGE's WINTER) stay in the engine ([Content and gameplay](content-and-gameplay.md),
  [Stage RM](#stage-rm--branch-tsukuba-and-the-walls)). So do three of the format's general constructs, each part of a
  rule every course follows: `text` Strips, the road's lettering, for the product courses to write; a Strip's
  `"transparent"` color, the colour rule's eraser of earlier color; and the environments' `repeat`, the one repeat
  every element list takes.
- **Course format.** Plans of straights and arcs, positions measured from joints, lanes, Lateral values, Strips, gates
  and images named by file; circuits are closed cycles of two or more Sections
  ([CourseDocument](content-and-gameplay.md#coursedocument)).
- **Drawing.** Strips author surface color and material; ground and walls are drawn by LEVEL-POINT; sprites are indexed;
  every picture folds at its anchor, every picture with a shadow casts it, and shadows and lying images lie on the
  ground that faces the camera about their anchors; BG is one infinite tiled
  plane; the camera stands 6 m behind and 2 m above the player's base point
  ([Architecture](architecture.md#sprites-and-painter), [Camera](architecture.md#camera-and-fixed-metric),
  [Image assets](image-assets.md)).
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

Next PR: in [Stage EX](#stage-ex--the-originals-courses-exact-their-constants-few), EX-13 onward and K's
grades when they come, with the sprites' SP-2, SP-4 and SP-5 beside them; then
[Stage GR](#stage-gr--the-originals-courses-mended) and [Stage RM](#stage-rm--branch-tsukuba-and-the-walls), and beside
them [Stage NM](#stage-nm--a-namco-original-from-the-roms), later
[Stage BR](#stage-br--big-run-from-the-roms), [Stage CS](#stage-cs--cisco-heat-from-the-roms) and
[Stage TA](#stage-ta--a-taito-original-from-the-roms); [RD-6e](#courses-of-the-originals) once K's recordings come;
[DT-7](#stage-dt--drift-tuned-trial-vehicles), and [DT-3](#stage-dt--drift-tuned-trial-vehicles) once K decides; then
[Stage 16](#stage-16--produce-product-courses).

Implement the stages in order. Each PR's restart instructions supply its detailed requirements.
Topic contracts belong to the topic specifications; development and release procedure belongs to AGENTS.
PRs hold rationale and verification evidence. Each stage first consolidates the structure its later PRs consume.

## Stage EX — The originals' courses exact, their constants few

Stage EX raises the five originals' courses from what their ROMs determine and a short list of arbitrary constants, by
one mathematics they share, before [Stage GR](#stage-gr--the-originals-courses-mended) and the next originals. Its PRs
are numbered from EX-1; the Git subjects of 2026-10-16 numbered EX-1 to EX-10 are the exhaust's work
([Audio](audio.md)), not this stage's.

K's decisions (2026-10-23):

- **What the ROMs determine is a course's canon.** Its plan, widths and Strips are raised from the ROMs exactly, by
  constants, and so are its grades wherever a method determines them uniquely from the ROMs. The canon is not adjusted
  afterwards. The other grades are computed as a first draft, which people may adjust by eye; the pictures and the
  placements are the extract (K, 2026-10-24, below).
- **A course follows from its parent set and its constants.** Each original is raised from its MAME parent set.
  Every course needs some arbitrary constants, kept apart from what the ROMs give; ideally the same constants determine
  the same course uniquely, and the fewer they are, the more beautiful the design.
- **Beauty, concision and no ad hoc rule come first.** The stage tidies the road data tool and the documents to that
  end.

K's decisions (2026-10-24):

- **The design's beauty and concision come first**, and the course format may change to that end.
- **A course is made in one of two ways**, raised from an original's ROMs or a real circuit made from its reference
  material ([Product courses](content-and-gameplay.md#product-courses)).
- **The scale bears on play**, so it is K's, decided by driving (2026-10-26, the constants' table below).
- **The pictures and placements extracted faithfully from the ROMs are the extract.** The extract is not the canon:
  the product corrects or draws them again, in the people's layer, never in the extract itself. It is what a correction
  starts from, so the extraction is faithful and raising it again gives it unchanged (`--check`). The grades the ROMs
  do not determine stay drafts.
- **The sprites' extraction and its rules are worked out alongside the stage** (below).

K's decisions (2026-10-26):

- **Crossings are kept 3 m apart**, the least change's measure written in Original road data's Crossings.
- **Every original's grades by one rule**, the road its screen shows read back through the camera that drew it at this
  game's focal length within ±25 % ([Profile from the original's screen](original-road-data.md#profile-from-the-originals-screen)):
  OUTRUN's, TURBO OUTRUN's and ENDURO RACER's by K's researcher's pieces (EX-G2), replacing the draft grades and
  `c_look`. EX-14 takes `road-profile`'s `UNIT` 576, `ORIGINAL_LEVEL_TOP` 151 and `ORIGINAL_ROWS` 224, and OUTRUN's
  `CLOUDS_UP` and TURBO OUTRUN's `FAR_UP` which write them again, after it.

K's decisions (2026-10-25):

- **The ground's materials stay each original's own.** The ROMs hold no material, so each is K's decision, written with
  its reason in its original's chapter.
- **On a circuit the start's camera may stand in the lap's last Section.** No run needs it yet: the camera-space check
  reads the slots a run starts from, the rearmost of SUPER MONACO GP's 16 at 40.2 m past its line and TSUKUBA's at
  8 m, so the Route reaching behind a circuit's entry is built when a circuit's grid needs it. A linear course keeps
  its road from the camera's distance before GO, which the start needs.
- **Stripes are written one way**: `curb` is deleted from the course format and stripes are written by a Strip's
  `repeat`.

The stage's defaults, each chosen for the fewest constants and no rule made for one case (K may change any in its PR):

- **The plan is the road path.** A Section's lanes may lie off its plan, so the plan is each original's road path P
  itself, a station is a distance along P, and the widths are the ROMs' unrounded. Stripes, objects, gates and skies
  stand on one ruler, the ROMs' positions.
- **A heading table is a chain of arcs by its own runs** (K, 2026-10-23), by the
  [plan from a heading table](original-road-data.md#plan-from-a-heading-table), the tables' resolution its one constant.
  A Section's plan holds up to 1024 elements, as its profile does (TURBO OUTRUN's DENVER has 687).
- **The format owns where a plan stops being one-to-one** ([Architecture](architecture.md#plan-authority)), so a
  document writes only what it intends: its ground by one rule, no ground narrowed to fit, a Section cut only where the
  road comes near itself or crosses, and a turn widened only to the least radius its lanes keep
  ([plan from a heading table](original-road-data.md#plan-from-a-heading-table)), one rule for every original (K,
  2026-10-24).
- **SUPER MONACO GP's circuits** are raised the same way, from their integer path's points by the
  [plan from a point path](original-road-data.md#plan-from-a-point-path) (K, 2026-10-24): the points close exactly, so
  no correction closes a lap.
- **The canon's grades** are the [grades' rule](original-road-data.md#profile-from-the-originals-screen)'s (K,
  2026-10-26). SUPER MONACO GP's path is the original's 3D road: its heights are its rises' sum at the plan's scale,
  raised from its points as its plan is, by the [profile from a point path](original-road-data.md#profile-from-a-point-path)
  (EX-10), so a lap closes, times its factor (EX-G3). SUPER HANG-ON's vertical heading vectors are its road's
  directions, their sines times its factor, raised as a heading table is, by their own runs: the [profile from a rise
  table](original-road-data.md#profile-from-a-rise-table) (EX-12, EX-G3). OUTRUN's, TURBO OUTRUN's and ENDURO RACER's
  height tables and slope words are shapes on the screen, read back piece by piece (EX-G2).
- **Crossings.** Where the heights leave two passages nearer than 3 m, one fixed rule parts them by the least change,
  whatever made the heights ([Original road data](original-road-data.md#profile), Crossings); on a canon's heights it is
  part of the canon.
- **Time made into position.** Each original's events in time are placed where they fall at its top speed: OUTRUN's
  objects (293 km/h); SUPER HANG-ON's objects, its ground's 32 steps and the next section's road colours' switch
  (0xF1); TURBO OUTRUN's objects (324 km/h), whose tables come one position a step with none missed at 216.3 km/h or
  less, a placement by design. EX-14 first finds, for each original, whether a placement independent of speed exists:
  where one does, the top speed leaves the rule; where none does, one shared rule chooses the speed, written once with
  its reason. The road colours (Strips) are canon, so where they switch is written as the ROMs determine it.
- **Sky changes.** SUPER MONACO GP cuts to the tunnel's sky at the step its background is black (9054), and out of it
  at the step before the middle of its brightening (10750; the middle of 10655–10847 is 10751): two rules for one kind
  of event. EX-14 makes where in an original's fade a sky cuts one rule, and writes every original's sky changes by it.
- **Each constant once.** A value the ROMs hold is read from them, not written into the tool, unless only encrypted
  code holds it. Each arbitrary constant and each fixed rule (a shape the ROMs do not hold, such as OUTRUN's forks) is
  named once with its reason: the shared ones in [Original road data](original-road-data.md) and one module, each
  original's in its chapter and one module of its own. A solver's tolerance stays with its solver.
- **Ownership.** The conversion owns a course's canon and its extract, and people its drafts: `--check` compares what
  the conversion owns, and raising a course again rewrites it and keeps the drafts as people left them. EX-13 says of
  each field it writes whether it is canon, extract or draft; EX-25 keeps a draft where it was through the ROMs'
  positions when the canon changes, and stops where a draft cannot stay rather than move it unseen.
- **No class.** The stage adds no class, SUPER HANG-ON's and SUPER MONACO GP's courses none with their hills made
  ([Product courses](content-and-gameplay.md#product-courses)).

Rules of the stage:

- One purpose a PR ([AGENTS](../AGENTS.md#work-and-release)), under the
  [rules of the originals](original-road-data.md#rules-of-the-originals). Each PR names the constants, fixed rules and
  special cases it removes and adds, and the courses it changes and by how much, and writes what it makes of this
  section into the documents that own it.
- A rule covers every case of its kind: no PR adds one made for a stage, a course, a crossing or a picture, and one the
  audit found made so is made general or removed by the PR that touches it.
- Where making a part shared changes an original's course (`--check` differs), the PR mends a copy that had drifted
  from the ROM, keeps a difference the ROM holds as that original's value, and stops and asks K where it cannot tell
  which.

PRs, in this order:

- K's grades by the [grades' rule](original-road-data.md#profile-from-the-originals-screen) (K, 2026-10-26):
  - EX-G4: what EX-G2 and EX-G3 no longer use deleted (`road-profile`'s table grades, `c_look` and the closing,
    `outrun-look`, SUPER HANG-ON's eye scale).
- EX-13: one way of writing Sections for every original, each of today's copies made one shared part:
  - The widths joined by one monotone cubic (OUTRUN's `joinedWidth` and TURBO OUTRUN's copy).
  - The stripes at one period, EX-7j2's count of halves in every original.
  - The Sections' cuts by one rule, their distance from a gate one length in metres; `turbo-outrun-layout.ts`'s own
    `domainCuts`, and SUPER MONACO GP's cuts by checkpoints and objects' counts, among them.
  - The material under two roads by one rule (OUTRUN's by road, TURBO OUTRUN's one sheet and `OPEN`), and the lanes
    over two roads alike (OUTRUN's and TURBO OUTRUN's).
  - The objects' body widths bounded alike (SUPER HANG-ON's and ENDURO RACER's).
  - A lane's Lateral written as it is, with no Boundary tracing one lane's line (48 of TURBO OUTRUN's 48, 38 of
    `outrun-a`'s 103, 6 of TSUKUBA's 27).
  - `round`, the three 2 µm constants and `onJoint`.
- EX-14: the shared constants and fixed rules in one module and in Original road data's table. OUTRUN's program values
  that shared parts write as numbers are read from each original's ROM and passed in: 0x12F (`STEP_PER_KMH`,
  `POSITION_PER_KMH`, `STRIPE_PERIOD`'s 303, `WIDTH_RATE`'s 16/303 and its copy), `TICKS` 30, `PHASE_STEPS` 3,
  `MOST_ADVANCE` 15 and `LINES` 512, and `road-profile`'s `UNIT` 576 (0x240), `ORIGINAL_LEVEL_TOP` 151 and
  `ORIGINAL_ROWS` 224, which OUTRUN's `CLOUDS_UP` and TURBO OUTRUN's `FAR_UP` write again. `PIXEL_ASPECT`'s copies
  (15/14) go, and each value with neither name nor reason is given both.
- EX-15 to EX-24: each original in turn (SUPER HANG-ON, ENDURO RACER, TURBO OUTRUN, OUTRUN, SUPER MONACO GP), two PRs
  each: what its ROMs hold read from them instead of written into the tool, then its constants and fixed rules in one
  module and in its chapter's table, its special cases made general rules or deleted. SUPER MONACO GP's band limits,
  two rules today (the barrier's 820, whose note's 700 + 105 makes 805, and the run-off's 1228 + 105), become one. The
  laterals the originals change straight between points are joined by the one monotone cubic
  ([Original road data](original-road-data.md)) in their original's PR:

  | Original        | Lateral changed straight between points                                                   |
  | --------------- | ----------------------------------------------------------------------------------------- |
  | SUPER HANG-ON   | None: one road of two fixed lanes, no width points                                        |
  | ENDURO RACER    | None: one road of two fixed lanes                                                         |
  | SUPER MONACO GP | The materials' edges and the course limits, moved straight over the 4 steps between bands |

- EX-G5a to EX-G5c: the pieces solved from the repository alone: the originals' screens, the measure and the solve,
  and the `screen-pieces` command, which compares what it solves with the pieces kept and does not write them.
- EX-25: the canon's ownership.
- EX-26: this section deleted, and "Next PR" pointing to Stage GR.

Alongside the stage, outside its numbering: the sprites' extraction and its rules. A rule either makes the extract,
taking what the ROMs hold and the original draws as it is, or is this game's way of showing every picture alike
(standing, folding, drawing order, shadows), owned by [Architecture](architecture.md); a rule that changes a picture for
one original is made one of these or kept as K's decision with its reason. First a table of each original's rules and
constants (documents only), then pictures where a proposal changes the look, then K decides; an engine change goes in a
PR of its own, and EX-25 comes first if people begin correcting pictures or placements. The four K named:

- The standing height: a picture stands on its bottom row, or on its lowest row not shadow where a shadow is drawn at
  its foot (`footAnchorY`), so it is drawn lower than the original by the shadow's rows; a `-raised` second picture
  (`raisedSplit`) when it is also shown lifted; `groundOffset` from the original's y, and SUPER MONACO GP's negative
  heights.
- The boards lying on the ground: their anchor at the picture's middle (OUTRUN and TURBO OUTRUN alone). They have no
  material (K, 2026-10-25, SP-3).
- The extending boards: a repeat of a quarter of the opaque width or more, the seam's 8 columns either side compared by
  outline, texel, length and nearness to the road, the outer end's shape unused, the road's end a separate `-edge`
  board.
- The shadows, each original's own and apart from this game's (which draws a shadow's own picture, darkening only the
  road): OUTRUN's pixel 10 by its drawing mode's shadow bit and its shadow sprite (0xFF56) kept as a `-shadowed`
  picture's own shadow frame, SUPER HANG-ON's every pixel 10, TURBO OUTRUN's pixel 10 by its kind's bit 2 and its
  shadow picture (0x2667A) by bit 1, ENDURO RACER's pixel 10 split into the board's shadow frame. Since SP-1 a fixed
  object draws its shadow frame at its picture's place and size, so OUTRUN's and TURBO OUTRUN's shadow pictures and
  ENDURO RACER's foot shadows are seen; OUTRUN's, SUPER HANG-ON's and TURBO OUTRUN's pixel 10 is drawn in its palette
  colour until SP-2.

The table (2026-10-24, in its PR) proposes, for K to decide on Pages:

- Standing height: the shadow rows at a picture's foot become its shadow frame, cast on the road, so the picture stands
  on its lowest row not shadow without being drawn lower, and no `-raised` copy is needed (a raised use casts none);
  or `footAnchorY` kept as K's decision of 2026-10-22.
- Lying boards: TURBO OUTRUN's anchors read from its ROM rather than set by OUTRUN's analogy.
- Extending boards: the rule kept as this game's (one for every original), with the outer end shown once as a board of
  its own rather than left out.
- Shadows: fixed objects cast the shadow their original draws (an engine change in a PR of its own), or the shadows
  drawn into the pictures as they are.

Not decided (K, 2026-10-25): what happens as a vehicle passes over a lying picture, a show of the same kind as a
movable object's knocked picture and never a material, may come later. OUTRUN's drawings 1 (grass), 3 (sea and lakes)
and 13 (patches) set the road's surface effect for 12 frames while the car is on them, which draws a spray at the car
and changes no driving ([Effect](outrun-road-data.md#strips-and-patches)). The other originals' are read when one is
made.

The sprites' PRs, beside the stage's (the auditor's third round, parts 2, 5 and 6), in this order:

- SP-2 (`tools/`): the extract, its rules and K's table, in one shared module with each original's flags;
  `footAnchorY` and the `-raised` copies removed. A picture lies where its original draws it by a routine that puts it
  on the road (OUTRUN's drawing 13; TURBO OUTRUN's routines 0x08, 0x4C and 0x50), K's table's `lies` kept for the bands
  alone; `RISING_ON_ROAD` deleted, with TURBO OUTRUN's check of half-scale objects on the road and its notes.
- SP-4 (`tools/`): the start objects' depth, and OUTRUN's figures after the goal (today placed from this game's camera
  distance and focal length), by the original's projection (its ROM's focal length and eye) instead of `startDepth`,
  and `SIGN_NEARER` removed.
- SP-5 (`tools/`): the bands (the extending boards) by K's table of how each meets the ground (standing, standing out
  nearer, lying) and whether it loops, each from its nearest picture, one that does not loop made one wide picture to
  the original's course width; `stripCut` and the `-edge` boards replaced.

### The constants' table (EX-7d)

EX-7d's table (in its PR) lists every chosen value but the scale. K's decisions on it (2026-10-24):

- **The heading tables' resolution** stays K's 1.5/4096, a turn tighter than its lanes keep is widened to the least
  radius they keep, and an arc's radius is bounded only by the arc computation's precision, one rule for every original
  ([plan from a heading table](original-road-data.md#plan-from-a-heading-table)).
- **The ground's width** is each original's own limit of its vehicle beside the road, as its ROM holds it (K,
  2026-10-24): OUTRUN's 500 units from the car's road's centre, SUPER HANG-ON's 500 and ENDURO RACER's 512 from P,
  SUPER MONACO GP's band tables, and TURBO OUTRUN's 500 as OUTRUN's (read from its program decrypted locally).
- **The road past the finish** is the original's own, not lengthened (SUPER HANG-ON's 200 positions; TURBO OUTRUN's and
  ENDURO RACER's read from their ROMs by EX-15 to EX-24), and no course is made for the vehicles: a vehicle that has not
  stopped where the road ends is allowed (the DRIFT TUNED cars), and one that leaves the domain at the road's end
  recovers at rest, as one a fixed object blocks (K, 2026-10-24). The tool's lengths are EX-14's and EX-15 to EX-24's.
- **The rules' numbers** kept as shared constants with their reasons, each written once (EX-14): the crossings' 3 m
  (K), passages 200 m apart, a passage running on over 3 positions, a cut clear of a gate (2 m; TURBO OUTRUN's two
  positions until EX-13 makes it one length), the grids' 12 m and 3 m.
- **Values the ROMs hold** written into the tool (OUTRUN's roads-apart width 280 at 0xE308 and its top speed 293 km/h
  among them) are read from them by EX-15 to EX-24.

### What the audit found, and its PRs

EX-1's and EX-2's audit left these to the stage, each with the PR that owns it.

- OUTRUN holds its stage length in three places: EX-21.
- SUPER HANG-ON's START gate assumes that the depth step is half the speed: EX-15, which checks it and reads it from the
  ROMs.
- TURBO OUTRUN reads its own advance but uses OUTRUN's (the same value today): EX-19.
- TURBO OUTRUN's objects are placed at its top speed, not at 216.3 km/h: EX-14, by the rule of time made into position
  above.
- The hills' kind 2 has no effect (its `holdLength` is 0), and `STEEPEST` is a literal: EX-14.
- Values each written in several places (the distance between passages in 4, the passage gap in 3, the grid's spacing
  and the goal positions, the sky's horizon, the rounding helper and its epsilon in 6, the yaw formula and the grid
  builder): EX-13 and EX-14.
- Values read or kept that no rule uses (SUPER HANG-ON's race end and rivals' grid, TURBO OUTRUN's advance and several
  of its tables, SUPER MONACO GP's band entries' t2, and six SUPER MONACO GP constants with no effect): each original's
  two PRs, EX-15 to EX-24.
- Of SUPER MONACO GP's 29 amounts written into the tool, 11 lie in its encrypted main program and cannot be read, and 3
  have no source written: EX-23 and EX-24, which name these with their reasons in the chapter's table.
- The plan's tolerances and thresholds (about 25), and seven constants that OUTRUN's and TURBO OUTRUN's modules both
  hold: those EX-4 to EX-8 did not remove, EX-9.
- The roundings' epsilons (`EPSILON`, 1e-5, in SUPER HANG-ON's, ENDURO RACER's and SUPER MONACO GP's writers, and
  `JOINT_SNAP`, 2e-6): EX-13 and EX-14. Since EX-5b and EX-7 put a Section's stations on one ruler, those no longer
  needed are deleted rather than made one.
- No PR reviewed the constants' values, only their names (EX-1 counted 119 chosen): EX-7d's table did, but for the
  scale.

OUTRUN's colour refusals, which its chapter once stated, are not restored (K, 2026-10-23): a set is known by its CRC-32
and size (TD-5), so its tables do not vary, and `--check` and the eye catch a misreading.

## Stage GR — The originals' courses mended

Stage GR mends the five originals' courses, decides the originals' classes, and fixes defects; what Stages ER and MG
left in
[Courses of the originals](#courses-of-the-originals) is its.

## Stage RM — BRANCH, TSUKUBA and the walls

Stage RM makes what Stage PG left to later stages in [Courses of the originals](#courses-of-the-originals). BRANCH
and the walls go, so their follow-ups (forks' transfer, a fork's conditional bodies, wall Strips and the walls'
open decisions) are not kept.

## Stage NM — A NAMCO original from the ROMs

Stage NM raises a NAMCO original from its ROMs ([Raising an original from its
ROMs](original-road-data.md#raising-an-original-from-its-roms)), one whose courses are simple first; K chooses which.

## Stage BR — BIG RUN from the ROMs

Stage BR raises JALECO's BIG RUN (1989) from its ROMs ([Raising an original from its
ROMs](original-road-data.md#raising-an-original-from-its-roms)), after Stage NM.

## Stage CS — CISCO HEAT from the ROMs

Stage CS raises JALECO's CISCO HEAT (1990) from its ROMs ([Raising an original from its
ROMs](original-road-data.md#raising-an-original-from-its-roms)), after Stage BR.

## Stage TA — A TAITO original from the ROMs

Stage TA raises a TAITO original from its ROMs ([Raising an original from its
ROMs](original-road-data.md#raising-an-original-from-its-roms)), CHASE H.Q. or another as K chooses, after Stage CS.

## Stage DT — DRIFT TUNED trial vehicles

Stage DT lets K try on devices whether a DRIFT SERIES ("いかす走り屋チーム天国") can work: S13 and AE86 DRIFT TUNED
are driven in FREE PLAY; FC3S follows once K decides its open points. A series, scoring and series rules for the camera
or steering are not made in this stage (the Steering row of [Pending product decisions](#pending-product-decisions)).

K decided it runs in parallel with the road data stages, in its own sessions and branches. DT touches vehicles and
physics, which they do not, so it shares only NEXT and the other shared documents with them: when main moves, the branch is brought up to
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
| SUPER HANG-ON  | The reference courses have 6, 10, 14 and 18 stages (AFRICA, ASIA, AMERICA, EUROPE), the export sitdown/upright cabinet's (MAME's `shangon`, K's decision; [SUPER HANG-ON](super-hang-on-road-data.md)). VFR750R keeps the existing 1988 full-power definition; GSX-R750 is the 1988 standard export model, not the 1989 GSX-R750R; 851 is a 1988 road model.                         |
| OUTRUN         | COUNTACH candidate: 25th Anniversary, 1988–1989. TESTAROSSA keeps the existing 1989 definition.                                                                                                                                                                                                                                                                                      |
| TURBO OUTRUN   | Stage order: New York, Washington D.C., Pittsburgh, Indianapolis, Chicago, St. Louis, Memphis, Atlanta, Miami, New Orleans, San Antonio, Dallas, Oklahoma City, Denver, Grand Canyon, Los Angeles. The reference course is raised from the ROMs of MAME's `toutrun` (K's decision; [TURBO OUTRUN](turbo-outrun-road-data.md)). F40 and 959 are period road specifications.           |
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
  are checked again. RD-6e: music, local originals of the tracks from K's four MAME recordings once they come. The
  planner's driver overturns near COCONUT BEACH's fork, outrun-a's at about tick 6710, and outrun-e's is blocked and
  recovers; EX-7's one-off drive found it, and it predates Stage EX. FREE PLAY's rivals on OUTRUN's courses drive with
  the same driver.
- SUPER HANG-ON: the SUPER HANG-ON series itself (sixteen bikes, their colors and pace), sounds and music, the mini
  ride-on cabinets' courses (their programs are encrypted), the ending's motion (its last frame alone stands), and the
  product's pictures drawn again. When classes return, each is the player alone on VFR750R from GO (slot 15), no
  traffic, margin 1.35.
- TURBO OUTRUN: the TURBO OUTRUN series itself (F40 and 959,
  their colors and sides, the rival and the clock's values), the original's time extensions, turbo, tune-ups and traffic
  tables, the objects that fly or break when hit made movable, the ending's picture as a screen picture, sounds and
  music, the other cabinets' courses (`toutrun2` among them), and the product's pictures drawn again. Until its class is
  made the GOAL gate's posts over lanes a and f are shown in drawings; whether a reference run hits them is checked
  then.
- ENDURO RACER: the ENDURO RACER series itself (bikes, rivals,
  colors, pace and time extensions), sounds and music, the motion of what moves, the ending's text, and the product's
  pictures drawn again.
- SUPER MONACO GP: the SUPER MONACO GP series itself (cars, rivals, laps, rank limits, time and the overcast set),
  sounds and music, the motion of what moves, the start's signal, the mirror and the cockpit, and the product's
  pictures drawn again. A format holding pictures at the original's pixel size would make its pictures smaller (most
  are the 16-unit class, each of the original's pixels about 4 × 4 texels), and is not made now.

Left by Stages ER and MG to [Stage GR](#stage-gr--the-originals-courses-mended) (K, 2026-10-21):

- The bodies of ENDURO RACER's 183 objects on the road, once the drivers can avoid objects standing on the road.
- The SUPER MONACO GP series and its overcast set.

Left to [Stage RM](#stage-rm--branch-tsukuba-and-the-walls) (K, 2026-10-22): BRANCH removed from the engine; TSUKUBA
made again; then the walls' feature removed, replaced by rows of boards.

### Inspection and art

The course editor is the human inspection and adjustment view over the file/CLI workflow. Decide the default rounding
steps and joining tolerances of its cleaning operations while producing the first product courses, and which findings
become build rules once those defaults hold. The findings are worked out after every change, so their time is the
author's wait (one worker, the default amounts): TSUKUBA 39 s (digits 0.2 s, unneeded knots 13 s, near and referable
27 s, merge kinds 0.3 s). Show anchor displacement after geometry changes if producing courses
needs it. It shows both a Section's edges as its document writes them and as the format clips them (the course limits).
Before master-course production, document/compiler versions can advance without migration readers; replace development
inputs with the corresponding version.

Develop production sprites, BG and tunnel artwork. Inspect distant sprites, source-camera/variant
sampling, palettes and braking lamps on real devices. Preserve the authoring goals of dimensioned
markings, boundary treatments and seeded visual variation through the Strip model; ground
appearance and physical bindings stay independent. Saved generated artwork and recipes are inputs,
with descriptive provenance and reproducible builds; an embedded image-generation service is optional.

The workbench opens and saves a local checkout's `content/` folder directly where the browser allows it, once an author
works from a checkout; until then its changes leave as an archive.

### Calibration and time margins

Tune physical parameters, tire sound and driver difficulty, including vehicle-specific tire settings: a vehicle's
mechanics document may give its own tire and `wheelSlip` (Stage DT); introduce per-axle tire parameters only when
this tuning needs them. Add asymmetric
(rebound-only) suspension damping only if landings bounce.
Use continuous tool reference runs that complete reproducibly and use different vehicles' capabilities
comparably; review proposed checkpoint margins against the resulting driving experience. FREE PLAY and
TIME ATTACK have no time limit. Reference driving stays outside builds. Review the complete 32-vehicle
scene (sixteen competitors and sixteen traffic vehicles) with graphics and audio on named devices. Establish device capacity/performance budgets from the whole
application, including loading the longest Section (TURBO OUTRUN's DENVER, 687 plan elements). Measure color-table preblend memory per km on the product courses (a two-lane road was about 0.3 MB per km;
a dense 21 km probe used about 121 MiB). If it exceeds the device budget, build preblend levels only
for the route window instead of the whole Section.

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
| Rivals           | Whether one-make rivals' pace ratios are shuffled each run (today each slot keeps its own)                                                                                                                                                                                                                                                                                               |
| Series content   | CISCO HEAT course type; COOL RIDERS connections, rivals and traffic; FINAL LAP layout and cars                                                                                                                                                                                                                                                                                           |
| Series content   | WEC LE MANS 24 layout and field; BIG RUN vehicles and field; RALLY STAGE title and course set                                                                                                                                                                                                                                                                                            |
| Vehicles         | Exact specifications of adopted vehicles (year, market, grade); BROUGHAM TUNED values                                                                                                                                                                                                                                                                                                    |
| Circuits         | Series or FREE PLAY placement of the selected circuits below                                                                                                                                                                                                                                                                                                                             |
| Tunnels          | Whether tunnel sides and ceilings are drawn by the renderer like walls (a ceiling is a second surface above the road), replacing sprite frames                                                                                                                                                                                                                                           |
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
| Weather          | Falling rain over wet sections, once a course has one (no course uses `WET_ASPHALT` today)                                                                                                                                                                                                                                                                                               |
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
  classes of one course share one compiled course; the demo holds only the shown and the next class's runs.
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
