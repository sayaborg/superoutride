# Original road data

OUTRUN's, SUPER HANG-ON's, TURBO OUTRUN's, ENDURO RACER's, POLE POSITION II's and FINAL LAP 2's courses are raised from
the road data in their program ROMs by the [rules of the originals](#rules-of-the-originals). This document owns those
rules and the parts the originals share; each original's ROM set, programs, tables' format and addresses, dump and
conversion into course documents are its own document's: [OUTRUN](outrun-road-data.md), [SUPER
HANG-ON](super-hang-on-road-data.md), [TURBO OUTRUN](turbo-outrun-road-data.md), [ENDURO
RACER](enduro-racer-road-data.md), [POLE POSITION II](pole-position-ii-road-data.md), [FINAL LAP
2](final-lap-2-road-data.md) and [CHASE H.Q.](chase-hq-road-data.md). What the conversion does not yet cover is NEXT's
([Courses of the originals](NEXT.md#courses-of-the-originals)).

The road data tool (`tools/road-data/`) lies in layers, each a directory, lowest first. A module imports only its own
layer's and those below, no original imports another, and an original's dump is a leaf its commands alone read; the
[dependency check](../tests/infrastructure/layer-dependencies.test.mjs) holds this. Each module's comment says what it
holds and links the section here that states its rule; this is their one map.

- **The rules every original shares** (`shared/`):
  - _reading_: zips and ROM sets (`zip`, `rom-set`), how a conversion fails (`conversion-errors`), and a road position's
    length (`road-position`);
  - _the plan_: a heading table's plan (`heading-plan`: its runs and the turns between them), a curve table's
    (`curve-plan`: its arcs and its runs), the plan laid in the world (`course-path`: `CoursePath`), and [a lap on its
    model](#a-lap-on-its-model): K's models (`course-models`, the folder `course-sources/`), the lap laid, measured and
    solved (`model-lap`, by `least-squares`) and the answers kept (the file `model-laps.json`);
  - _the profile_: the profile and a Section's profile knots (`road-profile`), a rise table's profile (`rise-profile`), a jump's or a dip's mound and its slopes' colors (`jump-mound`), where a road passes
    over itself (`overpasses`: its cells, what stands on another passage, and where a plan crosses itself), and the [grades' rule](#profile-from-the-originals-screen): a piece's frames
    (`screen-frames`), its measure (`screen-measure`) and solve (`screen-solve`, by `box-minimiser`), and the
    pieces K's researcher solved and their reader (`screen-pieces`, the file `screen-pieces.json`);
  - _across_: a function of the road position in straight pieces (`piecewise-linear`: a road width or an offset), a lateral
    changed straight between points (`monotone-cubic`), [lanes by a mask](#lanes-by-a-mask) (`lane-mask`), [two
    roads](#two-roads) drawn together, each from its own
    picture across (`two-roads`), the ground's material by its color (`ground-material`), the grid (`grid-rule`), [a
    road's surface](#a-road-laid-out) in bands across and its Strips along it (`road-surface`), [a course's
    limits](#a-road-laid-out) where its original's program holds them and its ground reaching them (`program-limits`), [a
    road laid out](#a-road-laid-out) that closes no lap (`road-layout`), and [a circuit laid out](#a-circuit-laid-out)
    (`circuit-layout`);
  - _pictures_: the originals' pixels on this game's texel grid (`pixel-grid`: a pixel's texels at its width in metres
    and its original's aspect, its pixels by [chosen lines](#chosen-lines) `chosenLines`, a picture turned as shown,
    palettes' names and a board's master), the [sprites' rules](#pictures-from-the-extract) (`sprite-rules`: a picture
    of the extract made its body, its shadow frame and its base), a picture and the band it lies in cut from one grid
    ([`band-boards`](#strips)), and a background baked into one sky
    ([`sky-baking`](#sky-baking));
  - _writing_: a course document by the course format's types, its Links one rule (`course-writing`); how Sections
    are written by the format's types (`section-writing`: knots simplified, a sprite element, a Strip, a lane's
    lateral, a width and a lateral line along a Section as every original writes them (`spriteElement`, `stripElement`,
    `laneLateral`, `widthLine`, `lateralLine`), sprites repeated, a stripe's parts
    repeated at its period as written, pictures raised, the plan as written, each joint at its station to the
    micrometre, so that a station written at a joint is the joint's, and a Section's domain, its cuts and whether the
    course format admits it as written, and its stations as written in every original (`sectionStations`: to the
    micrometre, `micrometre`; within 2 µm, `WRITTEN_SLACK`, of a joint the joint's, a gate or a sky's change within it
    of the Section's start at its start; within 10 µm of its end the end; a stretch written only where its ends'
    stations stay apart as written, `apart`), and the checkpoints and the finish it holds, each after its start and up
    to its end (`sectionGates`)), a course's colors in stretches (`color-stretches`), and what a conversion makes, its
    files by their paths in the originals' place and its report's parts (`conversion`);
  - _K's_: the [shared constants](#shared-constants) (`shared-constants`) and K's table of looks (`sprite-table.json`).
- **The CPUs** (`cpu/`), how a CPU's program is read, whatever its board: a 16-bit program's words and the halves it is
  interleaved from and a program from its pairs of ROMs (`program-words`), the instructions a 68000 routine can run, walked by their encodings
  (`routine-paths`), a 68000 for the research commands (`cpu-68000`), and a Z80's and a Z8002's instructions read as
  Zilog's manuals encode them, for the research listings (`z80-instructions`, `z8000-instructions`).
- **Sega's 16-bit hardware** (`sega-16/`), how its hardware is read and nothing of the port: the images the ROMs make
  (`rom-images`: the tile ROMs' bit planes and a tile's pixels, the sprite ROMs'
  words, the road ROM's lines and an edge's pixels a line fitted across them), the sprite hardware's pixels and its
  shadows' frames (`sprite-pixels`), and the display the originals draw on (`display`: its screen's 224 rows, its pixels' 15/14 aspect, the shadow pen 10, the
  background layers' 1536 and 2048 pixels and where they show at heading 0 by a hardware's display offset,
  `layerMiddles`), which each original gives the shared rules.
- **The Out Run hardware** (`out-run-hardware/`), the parts OUTRUN's and TURBO OUTRUN's programs lay alike and the
  others on the hardware share: the road tables in OUTRUN's format (`road-tables`: palette words and their colors,
  curves, widths and heights, scenery points, road paths and height tables, the road widths they give), the clock
  ([`clock`](#the-programs-clock)), the hills with OUTRUN's road position and stripes' period (`hills`) and the heights'
  procedure (`height-procedure`), the ticks at one speed (`ticks`), how objects approach the car (`object-approach`: an
  approach table's step and where an object at a line stands, `lineAhead`), the road ROM's nearest line two roads are
  checked against (`road-line`), the strips as boards (`strips`), the background layers (`backgrounds`), its constants
  ([`constants`](#the-hardwares-constants)), and the grades' rule on the hardware (`screen-frames`, `table-grades`).
- **The Pole Position hardware** (`pole-position-hardware/`), how Namco's Pole Position hardware is read: its display
  (`display`: its frames a second, its 224 rows and 256 columns, its pixels' 6/7 aspect), its colors (`colors`: a
  palette PROM's color and a road palette's colors, one a lateral step) and its sprites (`sprites`: a sprite's pixels
  and a sprite color's pens).
- **The Namco System 2 hardware** (`namco-system-2/`), how Namco's System 2 is read: its display (`display`: its frames
  a second, its 224 rows and 288 columns, its pixels' 27/28 aspect and where a palette entry lies), its road, the C45
  chip (`road`: a road tile's pixels and a tile word), its tile layers, the C123 chip (`tiles`: a tile word's pixels
  and a face's colors), and its sprites (`sprites`: a sprite's pens).
- **Taito's boards** (`taito/`), what CHASE H.Q.'s Z system, CONTINENTAL CIRCUS's and TOP SPEED's board share: the
  course records CHASE H.Q. and TOP SPEED hold in one form (`course-records`: a section's 32 records of 8 bytes, 0x2000
  road units each, and its next sections for the left and the right; what a record's bytes mean is each original's), a
  palette word of the Z system's chip as this repository's color (`palette`: the TC0110PCR's red in bits 0–4 and blue in
  10–14, put in RGB555's places, so that nothing past it reads the chip's order), the Z system's frames a second
  and its pixel's aspect (`z-system-display`), its road generator's lines (`tc0150rod`: a tile's edge line and body line of pens, the edges
  outward from their middle) and its tile layers (`tc0100scn`: a tile's pens from the tile ROM's words, and the layer
  the chip draws at the bottom by its control word 6, every pen its color, the other over it, its pen 0 transparent)
  and its sprites (`z-sprites`: a sprite's 16 × 16 tiles from its four ROMs, laid by the spritemap, at its full size).
- **Each original** (`outrun/`, `super-hang-on/`, `turbo-outrun/`, `enduro-racer/`, `pole-position-ii/`, `final-lap-2/`,
  `chase-hq/`, `top-speed/`): its modules, one role a suffix ([An original's modules](#an-originals-modules)). CHASE H.Q.'s
  (`chase-hq/`) are its main and sub programs' and tile, road and sprite ROMs (`chase-hq-rom`), its things' pieces
  and a pixel's laterals at their full size (`chase-hq-things`), its things' places and hits (`chase-hq-objects`) and pictures (`chase-hq-boards`), its course
  tables and road
  position (`chase-hq-road`), its heights (`chase-hq-heights`), its plan (`chase-hq-plan`),
  its road's picture at its nearest row (`chase-hq-road-picture`), its road across, its lanes, limits, bands and
  materials (`chase-hq-road-across`), its skies' bands and their changes (`chase-hq-backgrounds`), its conversion
  (`chase-hq-course`), its dump (`chase-hq-dump`), its commands (`chase-hq-commands`) and its goals run on its code
  (`chase-hq-goals`). TOP SPEED's (`top-speed/`) are its programs' and tile ROMs (`top-speed-rom`), its course tables, paths,
  courses and road position (`top-speed-road`), its heights (`top-speed-heights`), its plan (`top-speed-plan`), its
  road across, its lanes, limits and ground (`top-speed-road-across`), its road's picture at its nearest line
  (`top-speed-road-picture`), its skies' bands, color sets and changes (`top-speed-backgrounds`), its dump
  (`top-speed-dump`) and its commands (`top-speed-commands`).
- **The commands**, at the tool's root and in each original's `<original>-commands` module: the entry (`road-data`),
  the register of the originals (`originals-register`: each original's ROM source, conversion and commands, in the
  order they are raised; the one list of them, which the entry and `originals` read), what the commands share
  (`road-data-commands`), a conversion's outputs (`original-outputs`), every original raised at
  once (`originals-commands`), the grades' pieces solved (`screen-pieces-commands`), the laps on their models solved
  (`model-laps-commands`), the checks against the
  originals' ticks (`at-speed-commands`, `height-ticks-commands`, `goal-ticks-commands`), and the research commands,
  which read a ROM set's bytes for a description (`research-commands`).

### An original's modules

Each original's modules are `<original>-<role>`, one role a suffix, every original's alike:

| Suffix           | Role                                                                                                                                             |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `-rom`           | its ROM set's source and which of its ROMs make which image; its programs and images assembled                                                   |
| `-road`          | the tables its programs hold, read raw: its road, its scenery's tables and the amounts its course takes                                          |
| `-sprites`       | its sprites' tables: their size lists, palettes and pixels                                                                                       |
| `-backgrounds`   | its backgrounds read, and laid as skies                                                                                                          |
| `-scenery`       | where its objects stand along its road, as its program places them                                                                               |
| `-ticks`         | its scenery run tick by tick at one speed by the conversion's own run, its stepping alone its own, for the check at speed (`positions-at-speed`) |
| `-boards`        | the pictures its objects show, as boards                                                                                                         |
| `-cross-section` | its road across: its lines and edges                                                                                                             |
| `-layout`        | one course laid out as a course document: its plan, profile, Sections, lanes, strips, objects and gates                                          |
| `-course`        | its conversion: from its ROM set, its courses, pictures, skies and report                                                                        |
| `-constants`     | its own constants and fixed rules, each with its reason                                                                                          |
| `-dump`          | its research dump, a leaf its commands alone read                                                                                                |
| `-commands`      | its commands: their arguments, the reading of its zips and the saving                                                                            |

A role an original lacks its chapter names, with why. A role one original alone has is its own module, named for it:
OUTRUN's pieces its roads lay (`outrun-pieces`), the figures after its goals (`outrun-goal-figures`) and its sounds
(`outrun-sounds`); TURBO OUTRUN's objects as they stand on its course (`turbo-outrun-objects`) and what stands at its
legs' start (`turbo-outrun-start`); ENDURO RACER's screen (`enduro-racer-screen`) and its pieces' frames
(`enduro-racer-screen-frames`); FINAL LAP 2's road surface (`final-lap-2-surface`). An original's file of K's hand lies
beside its modules: FINAL LAP 2's front layers' arrangement (`final-lap-2-fronts.json`, [its
skies](final-lap-2-road-data.md#its-skies)).

The shared code does not branch on an original's name (K, 2026-11-03): a rule in `shared/` or a hardware's layer takes
what differs between originals as its input, and an original's exception lies in that original's own modules. A
command may compose several originals' modules, as `screen-pieces-commands` solves OUTRUN's and ENDURO RACER's pieces,
and a shared file may hold each original's data under its name (`screen-pieces.json`), but no shared rule asks which
original it serves.

## ROMs and the register

From K's zips to the originals the tool raises: the rules every original is raised by and the constants they share.

### Rules of the originals

Every original is raised from its ROMs by these rules (K, 2026-10-18 to 2026-10-23):

- **What stays out.** The ROMs and any raw data taken from them are not committed and appear in no PR: K's zips lie in
  `reference-media/<original>/rom/` (`outrun`, `super-hang-on`, `turbo-outrun`, `enduro-racer`, `pole-position-ii`, `final-lap-2`), the
  tool's dumps beside them in `rom-data/`.
- **The sets.** Each original is raised from its MAME parent set, which its chapter names (K, 2026-10-23): `outrun`,
  `shangon`, `toutrun`, `enduror`, `polepos2` and `finalap2`. Where the parent's program is encrypted for data too, its tables and
  its instructions' operands are read from a decrypted bootleg (below).
- **No decryption.** No decrypting code and no key enter the repository or are used. A set whose main CPU's program is
  encrypted for instruction fetches alone (FD1094) is read as the ROMs' bytes, its tables being plain; one encrypted for
  data too (FD1089) is read from MAME's decrypted bootleg set. What a chapter says of an encrypted program's code was
  found by decrypting it for the description; the tool cannot check it and takes it as described.
- **Reading a set.** Every ROM read is found in the set's zips by its CRC-32 and size, whatever a zip names it, each zip
  entry checked against the CRC-32 its archive records; a set missing one is refused, naming the set and the ROM. No
  key is read. A dump records the ROMs read by MAME's names and CRC-32s, from the set's table.
- **Running an original's code.** A research command alone runs an original's code (`cpu-68000`): an unencrypted
  routine, from its entry until it returns or reaches a trap, where its program waits for its next frame, at most 10⁷
  instructions a call, given the base register, frame and stack its program gives it and the regions beside its work
  RAM it reads and writes (a shared RAM, a chip's), a routine it calls for hardware it does not need (a sound)
  returning at once, to check a model or a value against it: `height-ticks`, the heights' procedure tick by tick, every
  table the courses name, at the original's top speed; `goal-ticks`, CHASE H.Q.'s speed routine tick by tick from a
  standing start, its top speed and the tick it reaches it, and each stage's goal with its criminal's routines and its
  time run beside it, against the values its conversion takes. No conversion runs an original's code, and
  nothing encrypted is run.
- **What is not linked or shown.** No link to a public place to download ROMs is written in the repository or a PR,
  and no picture setting the original's screen or its ROMs' pictures beside this game's one to one enters either (K may
  be given one privately).
- **Other projects' code.** No code of MAME or of other projects is copied or ported: the formats are read by this
  project's own code from this description and the ROMs themselves, and general numerical methods are written from
  their published method in this project's names and structure. No other emulator's or port's name, code or link
  enters the repository (MAME may be named).
- **Conversions.** CI has no ROM, so a conversion's results are committed as course documents and images. A conversion
  is deterministic: its command raises them from the ROMs locally, and with `--check` fails where one differs from the
  committed. Each original's ROM table (`<original>-rom`) holds its ROMs' names and CRC-32s, and its course module its
  conversion's version: they are their one record, which the dumps and the courses copy and the chapter names but does
  not repeat. A PR changing a conversion raises its version, and a PR changing a shared part says which course of
  which original changes, and by how much.
  Before each PR every original's `--check` passes on the local ROMs.
- **One hardware.** The originals are ported to one hardware of their time that never was (K, 2026-10-28): it has
  one specification, what differs between originals is taken up by the conversion, by rules alike for every original,
  and no original gets hardware of its own. The design's beauty, concision and freedom from exceptions come first, even
  where play loses a little by them. The far scenery is true to physics, one picture turning by the camera's angle
  alone, and colors that change over time are not ported ([Sky baking](#sky-baking)).
- **Experience before fidelity.** A course's design comes first: beautiful and simple (K, 2026-11-03). A rule
  follows the ROMs only as far as the player's experience needs, what is seen and felt while driving.
- **A course's model.** A course with a model keeps its ROMs as far as a closed lap like its circuit allows (K,
  2026-11-04): its curve table's corners at their sharpness and in their order, and its straights, only their lengths
  moved so that its lap closes nearest its model, the circuit as it was in the original's year drawn at real size in
  straights and arcs; its lap's length is its model's in place of the clock's. What its ROMs place keeps its curve table
  position on the lap as moved; what repeats keeps its length. Where it has heights, its highest and lowest lie at most
  its circuit's elevation apart (its model's): where its grades would part them farther, all are taken times one factor
  so that they lie exactly so far apart (K, 2026-11-06).
- **Canon and constants.** What a course's ROMs determine, by constants and rules, is its canon, not adjusted
  afterwards (K, 2026-10-23). A course follows from its parent set and its constants, and a course with a model from
  its model too ([A lap on its model](#a-lap-on-its-model)): a value the ROMs hold is read
  from them unless only encrypted code holds it, and each arbitrary constant and fixed rule is named once with its
  reason, the shared ones in [Shared constants](#shared-constants) and one module, each original's in its chapter and
  one module of its own; the fewer they are, the better. A rule covers every case of its kind: none is made for a
  stage, a course, an overpass or a picture, and one found so is made general or removed by the PR that touches it.
  Where making a part shared changes a course (`--check` differs), the PR mends a copy that had drifted from the ROM,
  keeps a difference the ROM holds as that original's value, and asks K where it cannot tell which. The grade limit
  (`GRADE_LIMIT`) and each original's scale across are K's to adjust until the end, every course they reach (K,
  2026-11-06): a PR changing one raises the version of each conversion it moves.
- **The canon's inputs.** Beyond the ROMs and the constants, a canon depends on three of this game's definitions and,
  for a course with a model, on its model and its lap's answer, each read where the conversion runs, so that changing
  one changes what `--check` compares. The definitions are this game's camera (`CAMERA_DEFINITION`: its focal length,
  horizon row and height, through the [grades' pieces](#profile-from-the-originals-screen), its distance behind the
  player, through a course's entry, and its centre column, through the skies' facing); each form's largest body in the
  vehicle catalog (`content/vehicles/`, through [the grid](#the-grid)); and the least radius a lane keeps
  (`leastLaneRadius`, through the plans). The grades' pieces, solved once, record the camera they were solved for and
  what each was solved from, so a conversion stops where either differs rather than reading stale pieces. The models are
  K's course sources ([A lap on its model](#a-lap-on-its-model)); the laps' answers, solved once, record the SHA-256 of
  what each was solved from (its curve table, its model's geometry, its road width, its lanes' least radius and the
  procedure's numbers), so a conversion stops where it differs, and `originals --check` finds a stale answer without
  solving.
- **Ownership.** The conversion owns every file of an original, whole; no person edits one (K, 2026-10-30). A
  course is its canon and its extract. The canon is what the ROMs determine by constants and rules, and for a course
  with a model its model with them: the course's
  `name`, `entry`, `maxLaps`, `bearing` and `links`, and each Section's `plan`, `profile`, `lanes`, `centerLane`,
  `centerLateral`, `boundaries`, `strips`, `walls`, `openLimits` and `gates`. The extract is its pictures and their
  placements: each Section's `sprites` and `environments`. Raising a course again writes it from the ROMs alone, and
  `--check` compares every byte (`OriginalOutputs.course`). A name is read from its original's ROMs where the original
  shows it as text, and is otherwise a constant with its reason. A course's `maxLaps` is the laps its original runs it
  (K, 2026-10-30): a non-circuit's 1, the course format's rule; `bearing` is 0 (`BEARING`). The extract is faithful, so raising it
  again gives it unchanged; a product course corrects pictures and placements or draws them again, never an original
  (K, 2026-10-24).
- **What is made.** Physics stays as it is: lengths along the road come from the original's displayed speed and its
  clock, a road position being v × t / (3.6 × g) m where a speed shown as v km/h gains the road g positions a tick of t
  seconds (`metresAPosition`); a modelled course's lap is its model's length (A course's model, above). Everything
  that moves is placed standing still. Pictures are resampled by [chosen lines](#chosen-lines), no colors mixed,
  backgrounds too, laid into skies by [Sky baking](#sky-baking); the sprites' and backgrounds' pictures converted from
  the ROMs are committed and shown on Pages provisionally, drawn again for the product. The vehicles are this game's,
  baked from 3D models, so the originals' are not converted. Sounds are local originals alone
  ([Local originals](development.md#local-originals)).
- **Pictures.** How a picture meets the ground in the drawing is
  [Sprites and Painter](architecture.md#sprites-and-painter)'s. A rule either makes the extract, taking what the ROMs
  hold and the original draws as it is, or is this game's way of showing every picture alike (standing, folding,
  drawing order, shadows), [Architecture](architecture.md)'s; a rule that changes a picture for one original is made
  one of these or kept as K's decision with its reason. The conversions place them so:
  - A background's picture is one board. An anchor is at the bottom edge and at height 0 by default; a picture at
    height 0 anchored elsewhere folds there: above, it stands up from the ground; below, it lies on the nearer ground.
  - A standing thing stands on its base, what floats at its height ([Pictures from the extract](#pictures-from-the-extract)).
    What lies on the ground (sea, waves,
    drifts of sand, patches, puddles, pebbles) is a board of the original's picture at the original's anchor, with no
    body ([Lying boards](#lying-boards)).
  - A board whose foot is below the ground (a negative height) keeps it: the nearer drawn ground hides its part below
    the ground and transparent ground shows it, as a cliff's drop is drawn. One whose whole picture lies below the
    ground is never seen and is not placed.
  - A strip the original draws on outward is a board of its nearest size ([Strips](#strips)); the road's surface
    itself is Strips.
  - A lying picture has no material: the road's Strips alone decide the material (K, 2026-10-25).
  - Only vehicles have pictures by angle.

### Shared constants

The arbitrary constants the originals' conversions share are these, each named once (`shared-constants`); each
original's own are in its chapter, and a solver's tolerance stays with its solver.

| Constant                      | Value                                  | Why                                                                                                                                                                                                                                                                                                 |
| ----------------------------- | -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GRADE_LIMIT`                 | ±0.25                                  | K's grade limit: no piece of the [grades' rule](#profile) is steeper                                                                                                                                                                                                                                |
| `PASSAGES_APART`              | 200 m                                  | a road's cells this far apart along it are other passages: ENDURO RACER places no object on one ([its objects](enduro-racer-road-data.md#enduro-racers-objects))                                                                                                                                    |
| `GATE_ROOM`                   | 2 m                                    | a [Section's cut](#sections-cuts) keeps this far from a gate                                                                                                                                                                                                                                        |
| `PASSAGE_STEP`                | 1 m                                    | where a road [comes near itself](#sections-cuts) is sampled this often, well within a lane's least radius                                                                                                                                                                                           |
| `OPEN`                        | 0.5 m                                  | the ground between [two roads](#two-roads) no wider is their asphalt                                                                                                                                                                                                                                |
| `GRID_FORMS`                  | cars 1 a row, 12 m; bikes 4 a row, 3 m | K's [general grids](#the-grid) (2026-10-25)                                                                                                                                                                                                                                                         |
| `BEARING`                     | 0°                                     | a course's compass bearing at its entry: an original's ROMs hold no compass direction                                                                                                                                                                                                               |
| `VECTOR_RESOLUTION`           | 1.5/4096 rad                           | a heading table's resolution: a unit and a half of its vectors' 4096, where the runs stop growing fewer ([plan from a heading table](#plan-from-a-heading-table))                                                                                                                                   |
| `CELL_METRES`                 | 10 m                                   | the [grades' rule](#profile-from-the-originals-screen)'s cells, the whole number of the original's positions nearest it: 5 (10.01 m) OUTRUN's, 8 (9.48 m) ENDURO RACER's; the solve's fineness: the near half of OUTRUN's lines spans 4.78 positions (9.58 m), and ENDURO RACER's cycle is 32 cells |
| `DISTANCE_STEP_ROWS`          | 1/5 row                                | the rule's distance steps on the reading camera's level road: the fineness at which this game's road bands are counted                                                                                                                                                                              |
| `HILL_ROWS`                   | 1 row                                  | a hill frame, where the look is measured: the original's road more than this from its level road                                                                                                                                                                                                    |
| `ROW_STEPS`, `ROW_STEP_SLACK` | 1/8192 row; 1/1000 step                | the originals' rows are whole steps (OUTRUN's 16ths, ENDURO RACER's 8192ths), read on them; a row off them is no original's                                                                                                                                                                         |
| `PVI_ROWS`                    | 0.5 row                                | a piece is the fewest PVIs within this of the best look: where the looks cannot be told apart, the simplest form                                                                                                                                                                                    |
| `LOOK_PLACES`                 | 3                                      | a look is rounded to thousandths of a row before the pieces are compared                                                                                                                                                                                                                            |
| `WRITTEN_SLACK`               | 2 µm                                   | two written micrometres: stations reckoned apart lie within it when they are one ([Sections' cuts](#sections-cuts))                                                                                                                                                                                 |
| `END_SNAP`                    | 10 µm                                  | an offset this near a Section's end is written at its end                                                                                                                                                                                                                                           |

## The hardware layer

What the originals' hardware gives every original on it: its constants, its colors and pixels, its clock, and its events made into positions.

### The hardware's constants

The hardware families' values, each named once by its family's module, are these; the originals on a family's hardware
share them, and its programs' own are read where they are used.

| Constant                                                           | Value           | Why                                                                                                                |
| ------------------------------------------------------------------ | --------------- | ------------------------------------------------------------------------------------------------------------------ |
| `FRAMES_A_SECOND` (`display`)                                      | 60              | the video's frames a second, whatever a program's tick: OUTRUN's and TURBO OUTRUN's two frames, ENDURO RACER's one |
| `SCREEN_ROWS` (`display`)                                          | 224             | Sega's 16-bit hardware draws 320 × 224                                                                             |
| `PIXEL_ASPECT` (`display`)                                         | 15/14           | its 320 × 224 shown at 4:3: a pixel is 14 wide to 15 tall                                                          |
| `SHADOW_PEN` (`display`)                                           | 10              | its sprite hardware's shadow in a picture drawn with shadows allowed                                               |
| `BACK_WIDTH`, `FRONT_WIDTH`                                        | 1536; 2048      | its background layers' pixels around, the front turning 4/3 as many a turn                                         |
| `TILE_PIXELS` (`rom-images`)                                       | 8               | a tile's pixels across and down                                                                                    |
| `ROAD_LINE_CENTRE` (`rom-images`)                                  | 252             | the pixel edge a road ROM line's centre falls on, between its columns 251 and 252                                  |
| `ROAD_HALF` (`constants`)                                          | 250 units       | a road's surface to its edge bands' outer edge: the Out Run hardware's road ROM's nearest line                     |
| `UNIT_METRES` (`constants`)                                        | 3.6 × 3 / 424 m | K's 3.6 m lane of OUTRUN and TURBO OUTRUN over the Out Run hardware's road ROM's 424/3 units                       |
| `LAYER_MIDDLE` (`constants`)                                       | 1888 pixels     | K's reading of the Out Run hardware's display offset ([Sky baking](#sky-baking))                                   |
| `stripFractions` (`strips`)                                        | (k + 1)/16; k/8 | the Out Run hardware's strips' families' sizes ([Strips](#strips))                                                 |
| `FRAMES_A_SECOND` (`pole-position-hardware/display`)               | 60.606          | the Pole Position hardware's frames: 6.144 MHz over 384 × 264                                                      |
| `SCREEN_ROWS`, `SCREEN_COLUMNS` (`pole-position-hardware/display`) | 224; 256        | the Pole Position hardware draws 256 × 224                                                                         |
| `PIXEL_ASPECT` (`pole-position-hardware/display`)                  | 6/7             | its 256 × 224 shown at 4:3: a pixel is 7 wide to 6 tall                                                            |
| `ROAD_PALETTE_ENTRIES` (`pole-position-hardware/colors`)           | 64              | the road ROMs' lateral steps across the road picture, a road palette's entries                                     |
| `FRAMES_A_SECOND` (`taito/z-system-display`)                       | 60.056          | the Z system's frames: 26.686 MHz over 4, 424 × 262                                                                |
| `PIXEL_ASPECT` (`taito/z-system-display`)                          | 1               | its 320 × 240 shown at 4:3: a pixel is square                                                                      |

### Palette words

A palette word `w` is RGB555, each channel four bits over a low bit shared from bits 12–14:
R = (w & 0xF) << 1 | (w >> 12 & 1), G = (w >> 4 & 0xF) << 1 | (w >> 13 & 1), B = (w >> 8 & 0xF) << 1 | (w >> 14 & 1).
Strips take it as their RGB555 as it is. Every original reads a run of palette words, with their RGB555, by one reader
(`road-tables`' `readColors`).

### Sprite pixels

The sprite ROMs' words, as OUTRUN's sprite hardware and those like it draw them (`sprite-pixels`):

- **Pixels.** Each word holds eight 4-bit pixels, the most significant first. 0 and 15 are transparent. Read from the
  left, a row ends with the word whose bits 4–7 are 15; drawn mirrored, its words are read the other way, the least
  significant pixel first, and the row ends with the word whose bits 24–27 are 15.

### The programs' clock

OUTRUN and TURBO OUTRUN run on one hardware, and the parts they share (the hills, the objects' approach, the road
widths, the stripes) take each one's clock from its own program (`out-run-hardware/clock`, read by `readClock` in each
original's module):

- **Step.** The road position each km/h advances a tick, 16.16: 0x12F, a long in each main program.
- **Frames.** The main loop waits on a counter it sets to 1 and the frame interrupt counts down past 0: two frames a
  tick, 30 ticks a second at the video's 60. The phase word gains km/h / 64 once a frame in the interrupt and once a
  tick in object 0, three times a tick.
- **Lines.** The road's 512 lines (`move.w #$200, d3` in each sub program).

Each chapter gives its programs' addresses, and a frame count only encrypted code holds is its chapter's constant
([OUTRUN's](outrun-road-data.md#course-documents), [TURBO OUTRUN's](turbo-outrun-road-data.md#turbo-outruns-programs)).
From the clock a road position is 2.0027 m (its gain step / 65536 positions a tick of 1/30 s), a
stripe's period 32 × step / (3 × 1024) positions (the fine position gaining km/h / 64 three times a tick, 32 of it a
period), and a width point's rate its speed × 16 / step units a position. A far layer (OUTRUN's clouds, TURBO OUTRUN's
far strip) stands `farUp` road units up: twice the level road's top above the eye, and the eye (2 × 151 + 72), from the
hills' level horizon on the clock's lines.

### Time made into position

Each original runs its events tick by tick at its car's speed, so where an event falls on its road depends on the
speed. A course places them in the limit of a speed falling to 0, where they depend on none (K, 2026-10-26):

- **What advances with the road** is counted by road position: an object's approach, a scenery point taken where the
  road position reaches it, its pattern turned as its cursor steps a position at a time (the original's once a tick no
  longer limits it, as on OUTRUN's hardware at 216.3 km/h or less, where a tick advances no more than a position), a
  stretch or section begun past the end of the one before, a hill's rise, slide and return. On OUTRUN's hardware a
  tick's advance comes a unit at a time, once a `phaseUnit` (64 × step / (3 × 65536) positions, 303/3072) from GO, and
  every object approaches by its approach table's step for an advance of 1 after that tick's control.
- **What stands at a line at GO** (an object the original has standing at its start) stands where it passes the car
  by its approach or where its line lies ahead of the car at GO, the nearer: the original draws an object at a line at
  that line's scale, so it stands where that line lies ([A line's distance](#hills), `lineAhead`).
- **What waits by ticks** is counted at the original's top speed, a tick its road position's gain there: a hill's hold,
  TURBO OUTRUN's ticks from a gate's post to the next stage and to its stop. In the
  limit a wait would never end.
- **Where a step drops a remainder**, the limit is taken through the speeds at which it drops nothing, and only there
  is it one (K, 2026-10-27), as with SUPER HANG-ON's depth step
  ([SUPER HANG-ON road data](super-hang-on-road-data.md#placing-super-hang-ons-scenery)).

Brought out a position at a time, objects fill an original's object slots more often than at its top speed, and those
that find none are not brought out, as the original's are not.

## The road's plan

The road's line in the plane, from its heading table.

A course's entry, unless the course is a circuit, lies this game's camera's distance (`cameraDistance`, 6 m) behind
the rearmost of its grids' last slots ([the grid](#the-grid)), where the camera stands behind that slot at GO. The
original's road reaches back 6 m behind its own vehicle's place at GO, P a straight into it there where the road does
not reach so far; behind that, the road is a straight in the heading it has there, level at its height, its
cross-section the same, with no objects (K, 2026-11-05).

### Plan from a heading table

A heading table, headings each at its position (a table's positions one apart, or as a course places them),
becomes straights and arcs over its positions (`headingPlan`, `heading-plan`) by one constant, the table's resolution
(K, 2026-10-23). A table of heading vectors about 4096 long, as the originals' road paths are, has a resolution of
1.5 / 4096 radians (`VECTOR_RESOLUTION`), a unit and a half of the 4096, where the runs stop growing fewer: SUPER
HANG-ON's AFRICA has 167 runs at one unit, 142 at 1.5 and 141 at 2, and ENDURO RACER 148, 132 and 128. The resolution
the components' rounding alone gives (half a unit either way of each, √2/2 of a unit at 4096) more than doubles every
original's runs (AFRICA 142 to 359, ENDURO RACER 132 to 554, TURBO OUTRUN 781 to 1470), for the tables vary beyond
their components' rounding (K, 2026-10-24).

- **Runs.** In the table's order, a run takes the next heading while some line holds every heading of it within the
  resolution, and ends at the first it cannot take. Its line is its minimax one, the line whose largest departure is
  least: of its headings' hull's edges' slopes, the one at which their spread is least, through the spread's middle;
  one line for three headings or more. A run of two has the line through both, a run of one (only a table's last can
  be one) the level line through it. A line that holds a run holds each part of it, so the run taken a heading at a
  time is the longest, and the runs are the fewest any such rule makes.
- **Arcs.** A run is an arc over its positions at its line's rate, from its line's heading at its first position to
  its line's at its last, however little it turns (an arc's radius has no ceiling but being finite); a run whose line
  is level is a straight, and a run of one heading has no length.
- **Turns.** Two runs are joined by a turn over the step between them, from the first's line at its last position to the
  next's at its first.
- **The lanes' least radius.** No element turns tighter than the least radius the course format lets the lanes on its
  inside keep there (`leastLaneRadius`: the distance from P to the farthest lane edge on that side, the vehicles' reach
  and the clip's tolerance, the most over the element's positions; a tighter curve leaves a lane without material,
  [Architecture](architecture.md#plan-authority)). A turn tighter than that takes one more step on each side from the
  runs beside it, a round, every such turn at once, the fewest that keep it; a turn that takes a run's whole arc, or
  meets or overlaps the next turn, joins it, and turns between the runs beyond; a run whose own arc would be tighter is
  taken into the turns either side of it, as one. This is the one place where the plan departs from its table's headings
  by more than the resolution: a heading table that turns by several degrees in one position (TURBO OUTRUN's, at four
  places) asks for a curve its road cannot take.
- **Headings.** Each element turns from the heading the plan has reached to its end's on the lines: an arc's on its
  run's line, a turn's on the next run's; straights one after another are one.

The rule promises the heading: at every position of the table but a widened turn's, the plan's heading lies within the
resolution of the table's. It does not promise the position: the minimax lines' departures do not sum to nothing, so the
plan may drift from the line the table builds by up to the resolution times the distance (the originals' plans drift
0.12 m at most, SUPER HANG-ON's AMERICA's), within the table's own rounding. `planFidelity` measures both at each
position, and each widened turn's most; the road data commands report them.

### Plan from a curve table

A curve table, a value at each interval of the road (as POLE POSITION II's), becomes straights and arcs (`curvePlan`,
`curve-plan`) by one number, the course's turn scale s: an interval of value v and length l is an arc turning v × s × l
radians, left positive, a straight where v is 0, and neighbouring intervals of one value are one piece. The table is
read round as a loop (`curveRuns`): a run is the most intervals in turn of one sign, a corner one of values of one sign
and a straight one of zeros, and the table's start parts no run. A course with no model takes its intervals' lengths
from its clock (`metresAPosition`) and the turn scale that turns it once in its lap, 2π over its values' sum times its
interval; a course with a model takes its runs' lengths and its turn scale from its model ([A lap on its
model](#a-lap-on-its-model)). A road that closes no lap is not read round, its table's start and end parting it, and
its turn scale is its original's farthest sky layer's (K, 2026-11-06): each value the pixels that layer turns over an
interval, the scale 2π over a turn's pixels times the interval's length (`skyTurnPlan`), so that the road turns as the
sky does, its sign, which way a positive value turns, its conversion's. No arc is tighter than its lanes' least radius
(`leastLaneRadius`); a plan that would be stops its conversion.

### A lap on its model

A course with a model ([A course's model](#rules-of-the-originals); POLE POSITION II's FUJI, SUZUKA and SEASIDE and
FINAL LAP 2's JAPAN, MONACO and ITALY) is laid as the lap on its model (`model-lap`), by K's rule (2026-11-04):

- **Runs.** Its curve table is read round as a loop, its runs as [Plan from a curve table](#plan-from-a-curve-table)'s.
  An interval's curvature is the course's turn scale times its value over the lap's mean interval (its model's length
  over its table's intervals); the turn scale is not the scale across. Its corners keep each value's curvature and their
  order, its straights stay straight, and only each run's length moves, all its intervals by one factor: a corner made
  longer turns the more, and what lies within a run, the start line too, keeps its share of it.
- **Closed.** Its heading and place close exactly at its model's length, and it turns as many times as its model (once;
  a figure of eight none).
- **Apart.** Where its model's road keeps off itself, so does the lap, by its original's road width (two lanes): of
  every two of the lap's intervals' ends whose model points as far along lie a road width apart or more, the model
  between them longer than the half circle on them, the lap's points lie a road width apart or more (K, 2026-11-08:
  their distance, no longer along the model points' difference, as an original may leave out a corner of its model:
  FINAL LAP 2's MONACO has no Loews hairpin, and its lap runs straight across beneath the model's). It crosses itself
  only where its model does: as many times (POLE POSITION II's SUZUKA and FINAL LAP 2's JAPAN once).
- **Nearest.** Of such laps it is the one whose two terms' sum is least: the mean of its intervals' ends' squared
  distances from their model's points as far along from its start, in road widths, and the sum of its runs' squared
  factors in doublings, so that each of its corners and straights, by which its boards stand, counts on its own: one run
  doubled or halved weighs as the whole lap a road width off its model (K, 2026-11-04). Its turn scale, and where its
  start lies on its model (metres from the model's start line), are solved with its factors; no turn scale makes its
  tightest arc tighter than its lanes' least radius (`leastLaneRadius`).
- **Plan.** Its plan is the curve table's plan at its runs' lengths and its turn scale ([Plan from a curve
  table](#plan-from-a-curve-table)); intervals of one run and one value are one arc, so the lap stays closed.

The procedure solves it (`solveLap`), deterministic, its sums in one order and its iterations and stops fixed: its
answer is the procedure's, not the least of all laps. At each turn scale of a grid, 0.15 to 2 by 0.05, then twice about
the closed lap of least sum so far, whether it meets the rule or not, by a fifth of the step over two steps either side,
whose tightest arc keeps the least radius, the lap is solved from the table's lengths and its start at its model's start
line: its intervals' ends' headings fitted to its model's as far along, its turning and length closed and its start
free; then the distances at the changes' weights 64, 16, 4, 2 and 1 in turn, the start held at the headings' until the
weight 2, the closure met exactly by each step; then the separations, four rounds at stiffnesses 3, 10, 30 and 100, each
holding the lap's points apart, a hundredth of a road width beyond it, of the pairs the lap then holds within three road
widths. Each stage
is Levenberg's and Marquardt's damped least squares on the residuals' analytic derivatives (`least-squares`), each step
meeting the closure's linearization and brought back onto it by Newton's steps; the runs' factors are moved least, at
last, so that the lap closes exactly. Of the turn scales whose lap meets the rule, the least sum is the answer (of equal
ones the earliest). A lap may meet the rule only between the grid's turn scales, so the rounds refine about the lap that
closes nearest, not only about one that meets it. The answers are solved on the repository's Node (24): on another, the
last digits of its arithmetic may lead the procedure to another lap (POLE POSITION II's SEASIDE takes another on Node
22), so the answers are kept and checked, not solved again.

**The answers kept.** Solving takes minutes a course, so the conversion does not solve: the answers are the repository's
(`tools/road-data/shared/model-laps.json`), each course's turn scale, start and runs' factors with the SHA-256 of what
it was solved from: its curve table's bytes, its model's geometry, its road width, its lanes' least radius and the
procedure's numbers (`lapDigest`), so that an answer solved by another rule or procedure is stale. A conversion takes a
course's answer only where its own inputs and the procedure give that digest, and otherwise stops, naming the command
that solves it again (`model-laps`, [Development](development.md#road-data-commands)); it checks each time that the
answer closes, keeps apart and crosses as the rule says, which is quick. So `originals --check` finds a stale answer
without solving; `model-laps --check` solves every lap again and compares the answers byte for byte. Where K changes an
original's road width, its courses with a model are solved again and their answers replaced.

**The models.** The models are K's course sources (2026-11-08, `tools/road-data/shared/course-sources/`, read by
`course-models`), saved as K gave them: their notes (`COURSES.md`) and a layout a file (`tracks/<id>.json`, schema
3.0), fourteen layouts, of which six are used now (CONTINENTAL CIRCUS's eight wait for its courses). Each layout is a
circuit's centreline over the years its original took it as lines and arcs at real size in metres, x east and y south,
an arc's positive sweep turning right, from its start line (K's estimate, its file's `start_finish_basis`), its segments
joined end to start within 10 nm, the last to the first, with its circuit's elevation, its highest point less its lowest
(`elevation_m`), which only an original with heights uses (FINAL LAP 2's). Its reader admits each segment's geometry
against itself and its stations, its joins in place and heading, its first segment leaving its start pose, and its
elevation as a positive length; a model's course is its file's original and course, which its conversion checks. Each
original's chapter names its models' sources; the files hold them whole.

### A road laid out

What every original's road takes, whether it closes a lap or not: its road across in bands, each its base color with its
material over each Section and its other colors along an interval as stripes ([Places and
patterns](#places-and-patterns)), and where its original's picture draws its surface along the road that surface's
Strips over the bands, each a time or a repeat of times, cut at its Sections' borders (`road-surface`); and its course
limits where its original's program holds them, as its chapter reads them, the `outer-left` and `outer-right` Boundaries
straight between their stations within a Section, the ground's material reaching them, one on both sides or each side's
own, changing where its color does, and the outermost band on a side that is the ground its color alone
(`program-limits`).

A road that closes no lap is laid alike (`road-layout`): cut where its original changes something at once (a tunnel's
walls, a fork's or a merge's lanes) and again where its road comes near itself ([Sections' cuts](#sections-cuts)), so
that its limits, and the ground's edge with them, jump only at a Link, a jump within a Section stopping the conversion;
its plan and profile as every original's are, each Section's knots within on the step of computed values
([Profile](#profile)); its start's grids in its first Section and its gates; and each Section's lanes, the Link's lane,
its road's own Strips and its skies as its original gives them, and Boundaries of its own and Strips over the ground
where it draws a road beside the course's (CHASE H.Q.'s road not taken).

### A circuit laid out

An original raised from a curve table lays each course, a circuit, alike (`circuit-layout`): its lap cut at its line, at
the middle of its longest straight the line does not lie on (of equal ones the earliest) and again where its road comes
near itself ([Sections' cuts](#sections-cuts)); its profile, level or its original's heights (FINAL LAP 2's, [its
heights](final-lap-2-road-data.md#its-heights)), each Section's knots within on the step of computed values as every
original's are ([Profile](#profile)); two lanes, a and b, of its original's lane width either
side of P, P its road's centre, or where its road's left edge moves along its lap (FINAL LAP 2's) the halves of its road
between its edges, the bands left of P going with the left edge ([FINAL LAP 2's road
across](final-lap-2-road-data.md#final-lap-2s-road-across)); its limits, the ground reaching them and its road across in bands as [a road
laid out](#a-road-laid-out) has them; its start line's rows over them; where its original's picture
draws its surface along the lap (FINAL LAP 2's), that surface's Strips over the bands, and beyond its picture's edges
its ground's one color where its original gives one (FINAL LAP 2's), each a time or a repeat of times
at a lap's stations, cut at its Sections' borders ([its road surface](final-lap-2-road-data.md#its-road-surface)); its
boards, each on the road or at its height above it; its sky, facing by the road's turn from the course's start; its finish at its line, and its start gate in the
Section returning to it by [the grid](#the-grid).

### Places and patterns

What a course's ROMs place along its road (its objects, puddles, start line, grid's marks, where its kerbs and colours
begin and end, its grades) lies at its curve table position, its interval and how far into it, on the lap as laid: an
interval's place on the plan is where its interval begins there, and a share of the interval the same share of its
length there, so that it keeps its place among the corners when a run's length moves. Bodies and pictures keep their
size. A grade it gives an interval is laid times one factor a lap, its length by the clock over its length as laid, so
that the grade does not step where runs laid at different lengths meet, and the lap's mean grade is taken off so that it
closes in height (K, 2026-11-06). What repeats along the road (stripes, kerbs' blocks) keeps its length: an interval of
it is the lap's mean interval, the lap's length over its table's intervals, laid from the course's start line, so that a
lap holds its intervals exactly.

## The road's profile

The road's heights: its grades read back from the original's screen, or a 3D road's rises times its factor; a course
with a model's within its circuit's elevation; then its crests within the crests rule; then its mounds; then cut into
Sections.

### Profile from the original's screen

An original's grades are the road its screen shows, read back through the camera that drew it at this game's focal
length, within ±25 % (K's limit): one rule for every original (K, 2026-10-26).

- **A 3D road in the ROMs** (SUPER HANG-ON's vertical vectors) is what its screen read back gives: its heights times
  one factor an original, f = min(its lens ratio, 0.25 ÷ its road's steepest grade), the lens ratio its focal length
  over this game's, in screen heights. The road's form is kept and the limit kept by f: a camera that tilts with the
  road, as SUPER HANG-ON's and this game's do, does not tell a long uniform grade on the screen, so its screen read
  again within the limit would change the large form.
- **A screen alone** (OUTRUN's and TURBO OUTRUN's height tables, ENDURO RACER's slope words, FINAL LAP 2's slope
  tables) is read back piece by
  piece: each piece the road whose screen lies nearest the original's, both ways, its grades within the limit (the form
  bending to it), with the fewest PVIs that match within half a row of the nearest. OUTRUN and TURBO OUTRUN bend their
  512 lines on the screen, which no camera does, so they are read through this game's camera (a lens ratio of 1);
  ENDURO RACER draws through a level camera (its horizon does not move), and is read through it at this game's focal
  length; so does FINAL LAP 2, whose slope spaces its lines as a level camera sees a grade ahead.

The rule's constants are [Shared constants](#shared-constants)' (`GRADE_LIMIT`, `PVI_ROWS`, `HILL_ROWS`,
`CELL_METRES`, `DISTANCE_STEP_ROWS`, `ROW_STEPS`, `LOOK_PLACES`). It reads through this game's camera, 6 m behind and 2 m
above with a focal length of 240 rows of 240 (`CAMERA_DEFINITION`), to the distance it draws the road, 200 m
(`RENDER_FAR_DEPTH_METERS`): the product's, not the rule's.

- **Pieces.** OUTRUN's and TURBO OUTRUN's: one a height table the courses run (kinds 0 to 3), the table run alone on the
  level road (its level base, [Hills](#hills)) as `tableRuns` runs it, a held shape (kinds 1 to 3) at the original's top
  speed (its chapter's). A table run at one speed is one piece wherever it runs; a piece not held serves every original
  whose table it is (TURBO OUTRUN's tables are OUTRUN's), and a held one is one a speed.
  - _Cells_ of 5 positions from the piece's start.
  - _Stretch:_ from the camera's place when the table starts to the first cell border at or past the camera's place when
    it ends. The grades at the cell borders within are free within ±0.25, 0 at its ends; outside it the road is level.
    Past the table's end the original's screen is level, so no grade lies beyond the camera's place then; what the
    original shows ahead before the table ends is not read.
  - _Frames:_ from the fewest cells that reach 200 m (20 cells, 200.3 m) before the stretch to its end: before them no
    stretch lies within 200 m of the camera, and both screens are level. The original's screen is the table's window
    while it runs, the level road elsewhere.
  - _Kind 4_ moves the base, and its screen is measured as every other table's, from the level base (K, 2026-11-01):
    one whose screen shows no hill is level, and one drawing a slope while its base moves has its piece
    ([OUTRUN's](outrun-road-data.md#sub-cpu)). A piece solved at the level base serves after kind 4 has moved the base, a
    choice of
    the rule: the original's rows' differences from the level road's do not depend on the base line by line, but which
    lines count (each row's first, the cut at 224) do, so a piece solved at another base would differ a little.

  ENDURO RACER's: its cycle and its hills, as [its screen](enduro-racer-road-data.md#enduro-racers-screen) says.

  FINAL LAP 2's: each course's lap, as [its heights](final-lap-2-road-data.md#its-heights) says. A lap is closed: read
  round its second of three alike, its grade at its start free and at its end the same, its vertical curves found as
  every piece's from its start to its end.

  The tool lays each piece's frames (`outrunFrames`, `enduroRacerCycleFrames`, `enduroRacerHillFrames`,
  `finalLap2LapFrames`), its cell the whole number of positions nearest 10 m (`cellPositionsOf`), a road that closes the
  whole number of its positions nearest 10 m that divides its lap (`closedCellPositions`).

- **Screens.** The tool draws the originals' screens: OUTRUN's and TURBO OUTRUN's every line's row (`rowsOf`) at its
  distance (`readLineDistances`) by [Hills](#hills), ENDURO RACER's words and rows (`enduro-racer-screen`) by [ENDURO RACER's
  screen](enduro-racer-road-data.md#enduro-racers-screen), its road's top and bottom rows read from the programs.
- **Cameras.** The road read is seen by the reading camera on rows:
  - _This game's_ (OUTRUN, TURBO OUTRUN), the product camera at rest (`CAMERA_DEFINITION`): the player where the original's car is, the camera 6 m behind
    it and 2 m above, pitched θ = −atan g with the grade g under it. The road D m ahead at height h lies on row
    120 − 240 sin θ − (240 / D)(h − y_c) cos θ of its 240, y_c = h₀ + (2 + 6 sin θ) / cos θ with h₀ the height under
    it; its level road on 120 + 480 / D; both × 224/240 on the original's rows.
  - _ENDURO RACER's_ at this game's focal length: level, where its level road's pinhole lies, a line on its row by its
    height above the road at the bike ([ENDURO RACER's screen](enduro-racer-road-data.md#enduro-racers-screen)).
  - _FINAL LAP 2's_ at this game's focal length: level, at its pinhole, a line on its row by its height above the road
    at the position ([its heights](final-lap-2-road-data.md#its-heights)).
- **Measure** (`screenMeasure`). Each frame, on the original's rows, each screen against its own level road, both ways:
  - _Row steps:_ the measure makes its choices (which whole row a line takes and whether it is seen, whether a frame
    shows a hill) on the original's exact values: its rows, whole steps of 1/8192 row (`ROW_STEPS`), and its lines'
    distances in its own units, so that what lies below a step, as a shift of 10⁻⁹ row, moves none of them. OUTRUN's
    and TURBO OUTRUN's rows are sixteenths: a line's row is the bottom row less its window word ÷ 16, the word the
    slopes' 16.16 sum × 16 ÷ 65536 to a whole number ([Hills](#hills), The window); ENDURO RACER's are 8192ths ([ENDURO
    RACER's screen](enduro-racer-road-data.md#enduro-racers-screen)). An original's row more than a thousandth of a step
    from one stops the reading. A row the tool computes (a level road's at a line's distance) enters the cost only as a
    difference and need not lie on a step. The rule is every original's alike: a frame gives its own lines' distances
    and its level road's rows at them (`ScreenFrames`).
  - _The original's rows,_ one an integer row: its lines are taken near to far, a line seen where it lies above every
    nearer one and its row is below 224; each integer row (its row's floor) takes the first seen line to reach it. At
    that line's distance D the difference is (min(y(D), E(D)) − y₀(D)) − (o − ℓ): y the read road's row, y₀ the reading
    camera's level road's, E(D) the least read row over the distance steps to the farthest at or below D (behind a
    nearer crest, the crest's row), o and ℓ the original line's row and its level road's.
  - _The read road's rows,_ one a distance step: steps D₀ < D₁ < … evenly in 1/D, 1/5 row of the reading camera's level
    road apart (Δ(1/D) 0.2/448 m⁻¹ for OUTRUN and TURBO OUTRUN, 0.2/(694.2 × 32/27) m⁻¹ for ENDURO RACER), from the
    original's nearest line's distance in any frame to 200 m. Step k (k ≥ 1) weighs w_k = max(0, E(D_{k−1}) − y(D_k)), the rows it
    shows above the top of the nearer road; its difference is (y(D_k) − y₀(D_k)) − e(D_k), e(D) what the original's
    road shows at D: its lines' rows, cut at 224 and made least from near to far, linear in D between lines and its
    farthest line's beyond, less its level road's rows likewise. The read road's rows are not cut.
  - _Cost:_ the squares of both ways' differences summed over the frames, the original's rows one each and the read
    road's by w; ENDURO RACER's cycle counts the middle cycle's frames.
  - _Look:_ the root mean square of both ways' differences over the hill frames, divided by the original's rows counted
    and the w summed: rows of the original's 224.
- **Solve.** The grades lie on the cell borders, linear within a cell (the heights quadratic). The stretch's grades
  within ±0.25 that make the cost least are found from level by the two-metric projection method (Bertsekas 1982): a variable at a bound the
  gradient pushes outward is held, the others step by the limited-memory quasi-Newton direction of the corrections
  remembered, and the step is halved along the projection arc until the cost falls by Armijo's rule; the cost's
  derivative taken with the hidden original's rows moving with the crest's step (the cost is not smooth where they are
  hidden). The minimiser is the tool's own (`minimiseInBox`), written from the method's papers.
- **PVIs.** At first every cell of the stretch is a vertical curve. One move at a time, solved again from the last
  answer (a joined border's grade from the mean of the two before, a border gone dropped), until one vertical curve is
  left, which is level (0 PVIs):
  - _Moves:_ a vertical curve made straight (its two ends' grades one), or two neighbouring vertical curves made one (the
    middle border's grade on the line between the outer two's).
  - _The move taken_ is the one of least linearised cost (L v)² / (L P Lᵀ): v the free grades, L the move's linear
    condition (= 0), P = (JᵀJ + 10⁻⁹ tr(JᵀJ)/n I)⁻¹ with J the differences' Jacobian at the answer and n the free grades,
    the read road's weights w held at their values and the hidden original's rows moving as for the derivative. A move
    with L P Lᵀ at most 0 is not counted; where none is, the first vertical curve is made straight. Of equal values the
    vertical curve nearer the stretch's start comes first, and for one vertical curve straight before joined; a later
    move replaces an earlier only when strictly less.
  - _The piece_ is, of the answers along the way, the one with the fewest vertical curves within 0.5 row of the best
    look, the looks rounded to 0.001 row (half to even). A piece with no hill frame (a table whose screen keeps within
    a row of the level road, table 0) is level.
  - _The solves_ (`solvePiece`, `choosePiece`): the first from level at most 3000 iterations, each later one from the
    last answer 300, each at most twice as many evaluations; one stops when an iteration lowers the cost by at most
    10⁻¹³ of it or the projected derivative's largest part is at most 10⁻⁹; 30 corrections are remembered.
- **The pieces kept.** The pieces lie in the repository (`tools/road-data/shared/screen-pieces.json`), and the courses read
  them: solving them all takes over two hours. `npm run road-data -- screen-pieces` solves them from the ROM zips and
  writes the file: every piece the courses run (the tables OUTRUN's spans and TURBO OUTRUN's stages name, every kind, a
  held one at its original's top speed, ENDURO RACER's cycle and hills, and FINAL LAP 2's laps); with `--check` it
  solves them again and
  fails, naming each piece that differs and its largest height difference along its stretch; with `--sensitivity` it
  solves each piece again from the original's rows moved by ±10⁻⁹ row and names those whose heights move by more than 1
  mm or whose vertical curves change in number (`SHIFT`, `MOVES`): none does, the rows read on their steps (Measure).
  The same ROMs give the same pieces, the file to the byte: one thread, every sum in a fixed order, the solves' limits
  and the looks' rounding fixed (above). The file holds one shape for every original: each original's metres a
  position and its pieces, each by its name (a table's `table <n>`, held `table <n> at <kmh> km/h`; ENDURO RACER's
  `cycle` and `hill <k>`, with their whole cycles; FINAL LAP 2's by its course's name, with its grade at its start,
  `grade`). It records what they were solved for and from: this game's camera's
  focal length, horizon row and height (`piecesCamera`); each table's piece the SHA-256 of its table's kind and words,
  its original's clock and line distances and, held, its speed (`tableInputs`); each of ENDURO RACER's the SHA-256 of
  its screen's tables and its metres a position (`enduroRacerInputs`); each of FINAL LAP 2's the SHA-256 of its
  projection, its slope table and its metres a unit (`finalLap2Inputs`). `screenPieces` (`screen-pieces`) admits them
  once, an original's pieces by its name: their shape, the camera as this game's, one entry an original and one piece a
  name, each piece's changes within its stretch and summing to 0 (its grade ending as it starts, at 0 but on a lap),
  and its grades within `GRADE_LIMIT`; and a conversion takes a piece only where its own ROMs give the same digest (`tableGrades`, ENDURO
  RACER's course), so `originals --check` finds stale pieces without solving them. Where an original's tables, clock and
  line distances are another's, the pieces solved from the other's serve it, checked from its own ROMs alone
  ([TURBO OUTRUN's](turbo-outrun-road-data.md#turbo-outruns-sub-cpu)). The solve is not convex and the PVIs
  are taken greedily one at a time, so a piece is this solve's answer, not every minimiser's. The canon is the pieces
  the repository's tool writes, and it does not change silently: a PR that changes what the solve reads (this game's
  camera's definition, the measure, the projection) runs `screen-pieces --check`, and where a piece changes it writes
  the file again and reports the pieces changed and their height differences to K. On this game's camera's side the rows
  are not on steps, and a few pieces lie near a tie between two answers: a shift of that camera's rows by ±10⁻⁹ row
  moves tables 9 and 7 at 324 km/h and table 12 at 293 km/h by 2.1 to 2.5 m, and tables 65, 198, 26, 92 and 135 by 1.1
  to 20 mm (K, 2026-10-27).

### Hills

The original builds its hills as shapes on its screen. The tool runs its sub program's procedure for them in its own
integers (`height-procedure`), fitting nothing; only the lines' distances, which read its stripes, are a least-squares
law (A line's distance, below). Level, each of the road's 512 lines has the slope base 0x240 × 16
(16.16 rows), so the road's top is row 223 − 512 × 9216 / 65536 = 151 (`k1`'s 151.4). Both are read from each sub
program with the procedure's counts (`readHeightCounts`): the level base, `move.l #$240, $732` (S 0x1B3A; TURBO OUTRUN's
S 0x1A86), and the road's last row, 223, its rows' count less one as the program clears the road's 224 rows
(`move.w #$df, d0`, S 0x1174 in both). The horizon's row the main program reads for the sky is counted from the row below,
0xE0 less a line's word ÷ 16 (S 0x14BE; TURBO OUTRUN's S 0x140A).

- **The procedure.** Each tick the sub program advances the running table's state (S 0x1B12 to 0x1EFE) and builds the
  window, the road's 512 line words (S 0x1F00 to 0x2208); TURBO OUTRUN's sub program holds the same procedure 0xB4 lower
  (S 0x1A5E). `procedureTick` is that tick, its words the original's line for line.
- **The window.** The lines form seven segments, near to far: s0 = 0x1FF − the split and s1 = the split ÷ 2, the split
  0x100 + the share, then the rest halved in turn, each half its floor (S 0x1F22). Segment 0's slope is the base × 16,
  kind 2's plus its fade (an entry × the share >> 4, S 0x1F9C); each further one is its predecessor's plus an increment:
  while kind 0 or kind 3 slides, the next entry × 16, segment 1's less the fade, so that an entry fades as its share
  passes; while kind 1 or kind 3 holds or returns, the fade on every segment (S 0x1FEA). Each slope is held at 0x10000
  (one row a line, S 0x2044) before the next increment is added; a falling one is not held. Kind 4 draws one slope, the
  base × 16 + its move × the share >> 4, not held (S 0x219E). A line's word is the slopes summed from the nearest line ×
  16 ÷ 65536, its row 223 − the word ÷ 16; the road's top is the least row. The screen is 224 rows (0 to 223); a line on
  row 224 or below is not seen. Lines 0 to 510 are read: line 511 lies, by the lines' distances, at the horizon,
  infinitely far.
- **A line's distance** (`readLineDistances`). The stripes give each line's distance: the sub program copies the row of
  its phase (the phase word's low five bits) of the stripe table at S 0x109EE to the road each tick (S 0x1ACA; TURBO
  OUTRUN's, identical, S 0x1A16), 32 phases of a word for each line, a word whose low byte is 0xFF drawing the line's
  stripe. A line's stripe, centred between its on and off edges, lies its distance ahead in phase units modulo the 32 of
  a period. Unwrapped from the nearest line, each line the least distance at or beyond the last, the lines read while
  each lies under half a period beyond the last: lines 0 to 509 (line 510 lies half a period beyond). The stripes are
  drawn in whole phases, so the near lines' distances are steps, many lines alike; a line's distance is the law ln(L /
  (L − k)) / a positions for line k, L and a the least squares' over the lines read: L 521.3 and a 0.1412, within 0.06
  positions of the lines read (root mean square), the most 0.50 at line 509. From this game's camera a line lies its
  distance × the position's metres + 6 m.
- **Counts** (`readHeightCounts`, read with the clock from each sub program). Each tick a share count gains 12 × the
  phase word's gain that tick (`muls.w #$c`, S 0x1C48) and is divided by the table's step to a share held at 255
  (`cmpi.w #$ff`, S 0x1C74); at a value's end it starts again from 1 (S 0x1CD0), what it gained past the end dropped.
- **Kind 0** slides its entries through the segments, each entry's share run to 255 over step × the factor the last
  value's direction selects: the ascent factor after a rising value, the descent factor after a falling one, 1 at the
  table's start and after a level one (S 0x1C5A to 0x1C72, the direction set by segment 1's slope at S 0x2004 to
  0x2022). The table ends when the entry six past the one running is its end mark.
- **Kinds 1 and 2** rise, their share run to 254 over step (`cmpi.w #$fe`, S 0x1D6C), hold, and return as they rise (S
  0x1D04 to 0x1D46): entry 0 while they rise, entry 1 from then on. The hold counts its wait down each tick by the whole
  part of 12 × the phase word's gain that tick ÷ step (S 0x1D2E), holding through the tick that takes it below 0 (S
  0x1D3E).
- **Kind 3** has thirteen entries. It slides its first six in, each its share run to 255 over 4 whatever its step
  (`move.w #4, d3`, S 0x1DCE; six, `cmpi.w #6`, S 0x1DE0); holds by its word as kinds 1 and 2 hold, entry 6 on every
  segment; and at the hold's end moves its entries' pointer on six (S 0x1E46) and returns, its share run to 255 over its
  step, entry 12 on every segment. Its entry 11 is not read.
- **Kind 4** moves the horizon's base to its word, its share run to 255 over its step, and it stays.
- **Points.** A height point asks for its table when the road position reaches it (`$66`), and the table starts the next
  tick. One reached while a table runs is dropped, and one naming table 0 asks for nothing: table 0 is the level table
  (kind 0, its entries all 0, in both originals) the procedure runs between tables.
- **Along the road** (`driveTable`, `tableRuns`, `rowsAlong`, `hillsAlong`). A table runs from its point in the limit of
  a speed falling to 0 ([Time made into position](#time-made-into-position)): between one phase unit and the next its
  ticks gain nothing and its state settles; then a tick gains one unit, a phase unit of road (`phaseUnit`). Each table
  counts its units from its start. Its hold is counted at the original's top speed instead (at a speed falling to 0 it
  would never end): the phase word's whole gains tick by tick from a carry of 0, each tick km/h × step ÷ 65536 of road.
  A run ends at the tick it asks for no next table, the level road at its base after it.

Kinds 0 and 1 are checked on OUTRUN's `k1` ([Checks on `k1`](outrun-road-data.md#checks-on-k1)). The procedure is
checked against the original's own code run tick by tick (`height-ticks`, [Road data
commands](development.md#road-data-commands)): every tick's 512 line words equal, for every table the courses name at
each original's top speed. Under kind 4's raised base a table may put the road's top at or above the screen's top
([OUTRUN's](outrun-road-data.md#dump)).

### Profile from a rise table

A rise table, grades each at its position (a table's positions one apart, or as a course places them), becomes vertical
curves over its positions (`riseProfile`, `rise-profile`) as a heading table becomes arcs ([plan from a heading
table](#plan-from-a-heading-table)), by one constant, the table's resolution, a grade:

- **Runs.** A heading table's runs ([plan from a heading table](#plan-from-a-heading-table), `headingRuns`), of its
  grades: each the grades one line holds within the resolution, its line its minimax one.
- **Curves.** A run is a vertical curve over its positions at its line's rate, to its line's grade at its last
  position; a run whose line is level is a tangent, and a run of one grade has no length.
- **Joins.** Two runs are joined by a vertical curve over the step between them, to the next's line at its first
  position.
- **Grades.** Each curve changes the grade from the one the profile has reached; the road is level before the table.
- **Fixed points.** Where the road crosses itself, the table's height is kept at its passages (K, 2026-11-06): its
  positions there, which its conversion gives from its plan, and its position 0 are fixed points, at each the curves'
  height departing from the table's (`tableHeight`: its grades joined straight between their positions); the departure
  is taken off straight between neighbouring fixed points, by changes of grade at them of no length, and held past the
  last. A road crossing nowhere has position 0 alone, and its profile is the curves'. The height kept, its grades
  joined straight, differs from an original program's sum, which adds a grade a step, by at most half a step's length
  times the grade's difference there from position 0's; it is kept so, as the grade a mended stretch adds then stays
  within a step, and the difference is not seen, as a road's passages where it crosses itself are not drawn to each
  other and its vehicles do not meet there ([FINAL LAP 2's courses](final-lap-2-road-data.md#final-lap-2s-courses)).

The rule promises the grade: at every position the profile's grade lies within the resolution of the table's, and
within two resolutions where fixed points mend it, as each departure grows by at most the resolution a metre. It
promises the height at the fixed points alone: elsewhere the minimax lines' departures leave it to drift by up to the
resolution times the distance.

### Crests

At a speed V no crest throws the car (K, 2026-11-02): a crest's curvature is at most g / V², its radius at least
R = V² / g; dips are not bounded. Each original's road takes the rule whole, before its mounds are added and before it
is cut into Sections (an OUTRUN course, TURBO OUTRUN's legs joined, SUPER HANG-ON's and ENDURO RACER's stages joined,
a closed road's lap), by one function (`crestBound`, `tools/road-data/shared/crest-bound`):

- **Nearest.** Of the profiles whose grade falls no faster than 1/R a metre, the one nearest the road's in its grades
  (the integral of the squared difference): the monotone regression of h(s) = g(s) + s/R, g the grade. A road whose
  grade nowhere falls faster is kept as it is; a kink down is beyond any radius, a kink up is kept.
- **Stretches.** Each crest sharper than R becomes one stretch [a, b] over which the grade falls straight at 1/R, the
  road touching it at both ends in height and grade, the height at b the road's; crests near enough to share one are one
  stretch, and nothing outside the stretches changes. A stretch's ends are where g(a) − g(b) − (b − a)/R = 0 and ∫ₐᵇ g
  ds − (b − a)(g(a) + g(b))/2 = 0; h is straight between the road's breaks (its bends' ends and kinks), so pool-adjacent
  violators on h at those, a kink within the road on both sides of its jump, and at a fine step find where the stretches
  lie, and each is then solved exactly on h's pieces: the step is no part of the answer (halving it changes nothing by a
  µm). The lowest point is found exactly too, at a bend's end, a kink or where a bend's grade passes 0.
- **Ends.** A stretch reaching the road's start changes the grade there (a kink at 0); the road's end heights are
  kept.
- **Lap.** A closed road (a circuit's lap, `crestBoundLap`) is cut at its lowest point s_low (the first after the line where several are
  equal), taken as one road and turned back. H(s) = ∫h = y(s) + s²/2R less a line is y(s) + (s − s_low)²/2R, least at
  s_low, so H's lower convex hull touches it there and a stretch ends there: s_low does not move, and the lap still
  closes in height and grade.
- **Checks.** The conversion stops where a stretch's ends do not keep the road's heights to a µm or a crest sharper than
  R is left.

V is K's, course by course, chosen by driving (K, 2026-11-03); a course with no V is written without the rule
([NEXT](NEXT.md#courses-of-the-originals) holds how a V goes in). Each original's conversion writes its trials beside its
courses: for each course, `crest-trials/<course>.json` in the
originals' place, for each speed K may choose (170, 200, 230 and 260 km/h, `CREST_TRIAL_KMH`) each Section's profile as
the course would be written with the rule at that speed, its jumps and dips on it (`crestTrials`), compared by
`--check` as every output is. Each course command reports for each road and speed what the rule does (`gradeReport`'s
`crests`): the stretches it lays, the most it moves the road and the share of its length moved 0.5 m or more. Strips,
pictures and walls stand on the profile and move with it.

The content build delivers each course's trials beside it (`crest-trial`), each speed's profiles admitted in the course
(`readCrestTrials`); the DEV setting CREST SPEED ([Browser](browser.md)) lays one over an original's course as it loads.

### Profile

A road's profile is its grades by the [grades' rule](#profile-from-the-originals-screen), its crests within the
[crests rule](#crests) and its jumps and dips on them, in that order, then cut into Sections (`laidProfile`):

- **Pieces placed.** OUTRUN's and TURBO OUTRUN's height points stand where the original's main CPU puts them on each
  span, in the road's order (each chapter's). Each stretch the original runs on without a stop runs its tables by one
  `tableRuns`, as its chapter says; a point reached while a table runs is dropped, across a span's or a stage's end
  too, and a hold counts at the original's top speed. Each run lays its table's piece
  whole, a held one its speed's, its stretch from this game's camera's place when the table starts, the camera's
  distance (6 m) before the car's station, not cut at a span's or a stage's end (`tableGrades`). A run whose piece the
  pieces lack stops the conversion.
- **ENDURO RACER's** run cycle by cycle, each from the reading camera's place when the road position is its first, as
  its chapter says ([ENDURO RACER's course](enduro-racer-road-data.md#enduro-racers-course), Profile).
- **The grade** is the pieces' summed, level outside them, the height carried along the road (`bendOf`, `profileOf`,
  a change running past either end left out, broken at the Sections' cuts; a closed one keeps its grade at the line as
  a kink at 0): the road's heights are the ROMs' (a course with a model's within its circuit's elevation, [A course's
  model](#rules-of-the-originals)), and where it passes over itself its passages may meet
  (K, 2026-11-02); the road's start and
  end may differ in height (K, 2026-10-23). Where two pieces overlap (one past a leg's end over the next leg's) their
  grades add, a choice, as the original never shows both; past the road's end a piece is cut.
- **Jumps and dips** (K, 2026-10-26, 2026-10-27). What the originals throw or jolt a vehicle with is a mound across the
  whole road of K's values, computed from neither the ROMs nor a vehicle's data, by one rule: its face, from its root to
  its crest (a dip's bottom), changes grade uniformly from `root` at its root to `crest` at its crest (straight where
  they are equal), a bend of one curvature; its crest is sharp, and past it the road comes back straight at `−crest`,
  kinked at the crest and where it meets the road again. Each original's mound, a jump's ramp or a dip, and where it
  stands are its chapter's ([ENDURO RACER's](enduro-racer-road-data.md#enduro-racers-course) ramp and its colors,
  [TURBO OUTRUN's](turbo-outrun-road-data.md#turbo-outruns-courses) dip). Its grades are added to the profile's
  (`moundGrades`). Where two overlap the one farther from the road is taken (a ramp's higher, a dip's lower), kinked
  where a face and a back meet; none is left out. On a dip's slopes the road's colors (its stripes, lines and edge
  bands, not the ground beside it) are changed in the conversion (`slopeColor`): a slope facing the camera (its far
  side) brightened halfway to white, one facing away (its near side) at the shadow's half brightness, a stripe cut where
  a slope ends within it. On a hill a slope's grade adds to the profile's, so the steepest grade may pass 25 %.

- **Knots.** Each stretch of constant curvature is a PVI at the intersection of the tangents at its ends, its station to
  1e-9 m (finer than a station's µm, so that both tangents' grades hold), its curve 2 µm shorter at each end so curves
  that meet stay apart; a mound's kink is a knot of no curve, the stretches broken there; stretches break at the
  Sections' cuts, and a knot next to a cut lies on the cut's tangent at its station as written, a road laid out
  (`road-layout`) taking its Section's end as its plan writes it, its one curve fitted between its ends, so joined
  Sections' heights and grades agree; a Section joined at both ends whose one stretch spans it has its knot where the
  tangents at its two cuts meet, so both grades hold.

COCONUT BEACH's profile against the original's is OUTRUN's ([COCONUT BEACH's
profile](outrun-road-data.md#coconut-beachs-profile)).

## Across the road

The road's cross-section, its colors, what stands and lies beside it, its skies and its grid.

### Two roads

One road's picture across, each edge with the paint to its right, is checked against its original's nearest line of
road as its hardware's layer reads it, each pixel's paint and the road units a pixel spans (OUTRUN's and TURBO
OUTRUN's their road ROM's row 255, 1 pixel a unit, its centre between pixels 251 and 252, its values 0 the surface, 1 a
line, 2 an edge band and 3 beyond the road; `nearestRoadLine`), by one check (`checkRoadPicture`): each pixel's paint is
the picture's at the pixel's centre, but within a pixel of an edge, as the line draws them on whole pixels, and on a
line the picture leaves out (OUTRUN's centre line). Two roads drawn together (`composite`, `two-roads`), each of its
own picture and width, show at each point the paint of the highest level in their hardware's order, each road's
surface, lines and edges at levels of its own and at a tie road 0's (`PaintLevels`): Sega's (`segaLevels`, OUTRUN's and
TURBO OUTRUN's) the surface of either road (its shoulder included) over road 0's (the left one's) lines and edges, over
road 1's, over the ground; the TC0150ROD's (`TC0150ROD_LEVELS`, CHASE H.Q.'s) road A's edges, its body with its lines,
road B's edges and its body, each over the one before. Each line and band shown is a Strip between
two features' edges held to lanes, or to a road laid where it passes, its edges on Boundaries (`compositeOf`,
OUTRUN's and CHASE H.Q.'s roads not taken), cut where the arrangement changes (`arrangements`: every edge is straight
between the lines' knots, the roads' ends and the road not taken's whole positions or its table's steps, so the
arrangement changes only where two edges cross,
solved exactly from their lines; one shorter than a micrometre along P, which the format cannot write, joins the one
before it), an end where it narrows to nothing drawn in to where it is 10 µm wide (`THIN`,
`drawnInterval`); the ground's color is everywhere, its half 0 over its halves. The material under them is one rule:
each road's surface is its asphalt, and so is the ground between two roads where it is no wider than 0.5 m (`OPEN`,
`narrowGround`, by each road's half width), the ground's beyond, so that the material changes metres away from where the lanes' rule does. Each
original's chapter gives the arrangement at each road width ([OUTRUN's](outrun-road-data.md#cross-section), [TURBO
OUTRUN's](turbo-outrun-road-data.md#turbo-outruns-courses)).

The lanes driven over two roads, road 0's centre w left of their middle and road 1's w right, are one rule
(`lanesOverTwoRoads`) taken from one road's picture alone: its lane lines' middle ℓ (its innermost line's), its outer
lane's outer edge o (the next line's middle, or its edge band where that comes first) and its half width h, beyond
which the ground shows. The lanes are a, b, c | median | d, e, f: a and f, each road's outer lane, are o − ℓ; b and e lie
between a road's lane lines and c and d between road 0's and road 1's; the median is the ground between the roads,
there only where it shows (K, 2026-10-26):

- w ≤ ℓ: c = d = 0, b = e = w + ℓ, b and e sharing the lane between the roads' lane lines;
- ℓ ≤ w ≤ h: b = e = 2ℓ, c = d = w − ℓ, no median, c and d meeting at the roads' middle;
- h ≤ w ≤ 2h − o: c = d = 2h − ℓ − w and the median 4(w − h);
- beyond: c = d = o − ℓ and the median 2(w − o), the edge bands and the ground between.

A lane is written where some position of its Section gives it a width over 10⁻⁹ units (`THERE`), else it is not there.

Lane b's centre is road 0's (−w) wherever both its lane lines show (w ≥ ℓ), else −(w + ℓ) / 2. The roads are one road
for the Sections' cuts ([Sections](#9-sections-gates-limits-of-admission)) where they have no median, w ≤ h.

### A lateral changed straight between points

Where an original changes a lateral straight between its points (a road width), the course lays it as one monotone cubic
through those points over the whole course (`monotoneCubic`, Fritsch–Carlson): between two points a cubic Hermite, a
point's slope the mean of its sides', level where they differ in sign or one side is level, and at the course's ends,
and an interval's two slopes scaled together where it would overshoot (α² + β² ≤ 9). The curve is one over the whole
course, unbroken at Sections and pieces, and every line made from the lateral (a road's centre, the lanes) is taken from
it. The format lays a lateral straight between knots, so a course writes the curve's value at each of the original's
positions (`writtenAt`). The road passes the original's points; between them, where a point's side is level, the curve
is the smooth step and departs from the original's straight line by at most 9.6 % of the change (1.9 m where OUTRUN's
roads part from 0 to 768). What is drawn follows the joined lateral: the roads, the lanes and the objects' laterals.
What the original's program decides by the lateral's value (whether the roads are apart as an object appears) is decided
by the original's, straight between its points. OUTRUN's and TURBO OUTRUN's road widths are joined so, and FINAL LAP 2's
roads' left edges, their pictures' rows the points and each step of the picture the positions written; SUPER HANG-ON's
and ENDURO RACER's roads, of two fixed lanes, change none.

### Lanes by a mask

Where an original sets its road's lanes by a mask, one bit a lane slot, the course lays OUTRUN's six lanes a to f, each
its slot's width where its bit is set and 0 where it is not, the slots set lying outward from P on each side, the
point the original measures its laterals from, or the conversion stops (`laneWidths`, `lane-mask`). Each original gives,
in its chapter and module, which bit is which lane, where P lies among them, a slot's width, and where and over what
length its road's edges move when the mask changes: its stretch ending or starting where the new mask's record starts,
its length the whole change's or a lane's, a side's edge taking it for each lane it moves. Each side's edge moves
straight from the old mask's lanes to the new's over the stretch, both sides together; where it takes a lane's length a
lane, it moves from where it stands toward the newest mask's lanes, a change while it still moves taking over from
there (TOP SPEED's main program moves its edges so). Each lane's width goes straight from one value to the other while
the edge crosses it, and each lane's points are joined by the monotone cubic ([A lateral changed straight between
points](#a-lateral-changed-straight-between-points)). A change the original makes at once (at its forks and merges) is
a jump, which lies at a Section's cut, each lane's width there starting a new join, or the conversion stops.

### The ground beside the road

An original's ground (its material beside the road) reaches its vehicle's lateral limit: as far as its program lets the
player's vehicle go beside the road, measured from where the program measures it (K, 2026-10-24); each original's limit,
and where its program holds it, is its chapter's. The course limits lie on the ground's edge, the original's line, and a
vehicle's body meets them, so its centre stops half its width inside the original's limit (K, 2026-10-25). The ground
reaches from a Section's outermost lanes, zero-wide ones counted, so its edge moves with them and jumps only at a Link;
on [a road laid out](#a-road-laid-out), where a limit lies within the road (a tunnel's wall), no ground lies on its
side; a road's material lies within it, and a road beyond it (OUTRUN's road not taken) is its colors alone. The course
format ends the ground where the plan stops being one-to-one ([Architecture](architecture.md#plan-authority)). The ROMs
hold no material: each original's ground and road materials are K's decision (2026-10-25), each its own, named with its
reason in its chapter. Where K decides that an original's ground takes its material from its color, the rule is one
(`groundMaterial`): `GRASS` where green is the color's strongest channel, `WATER` where blue is, `SAND` otherwise, left
and right of the road each by its own color; ENDURO RACER's ground takes it (K, 2026-11-01), and CHASE H.Q.'s and TOP
SPEED's (K, 2026-11-06).

### Strips

OUTRUN's and TURBO OUTRUN's strips, and the bands every original draws fixed on the screen (below), are boards of this
rule. A strip, OUTRUN's or TURBO OUTRUN's, is drawn from its edge nearest the road outward, a size for each depth (each
chapter's strips). Its board (`stripBoard`, `strips.ts`) is made from its nearest size, its edge nearest the road on the
left (a mirrored one's columns mirrored), by [the sprites' rules](#pictures-from-the-extract): a looping one casts no
shadow, its pen 10 a color (K, 2026-10-28), and any other is one picture by those rules as every other picture is. How it meets the ground is K's table's (K,
2026-10-24): it stands on its base; one standing out nearer stands on its original's anchor (`base`: `anchor`), its rows
below lying on the nearer ground; one that lies lies about its original's anchor (`lies`). Its edge nearest the road is
the board's base point across. Whether it loops is K's decision by what it shows (K, 2026-10-24), each chapter's table:

- **Looping.** Its unit is the nearest size's colored columns, from its leftmost colored column to its rightmost,
  repeating away from the road (`extend`: right, or left mirrored) to the frame's edge, the first where its columns
  stand in the original's picture.
- **Not looping.** One wide picture (`wideStrip`) from the strip's edge to the scenery's reach, its nearest size's rows
  high. A farther size k is the nearest shrunk across to its share f (its chapter's), with what lies beyond
  it, so it reaches to its last colored column + 1 over f; each column u is taken from the finest size that
  reaches it, its column ⌊u f⌋, its rows stretched to the nearest's.
- **The scenery's reach** (`sceneryReach`). Across every course of its original, how far beyond the outermost lane's
  edge on its side the farthest picture on the ground (at height 0) reaches: a picture's outer edge is its base point
  and half its width, a strip's its edge nearest the road and its nearest picture's colored columns outward, not its
  board, whose width the reach decides. Each original's reach is its chapter's.
- **Bands fixed on the screen** (K, 2026-11-06). Pieces an original draws at a width or a period on the screen whatever
  their distance (the TAITO originals' among them) are boards of this rule too, outside [things of several
  pieces](#things-of-several-pieces) and with no body, each extended (`extend`), repeating to the frame's edge in its
  plane as the original's reach the screen's edge. A band across the road stands at its thing's station, floating at
  the original's height (`groundOffset`) or standing: its picture, the original's pieces drawn once at their full size
  as a thing's are, its middle the thing's lateral; and beyond each of its edges its band, the columns of its outermost
  piece or of the piece the original repeats, from its first row holding a pixel to its last, a board extending outward,
  the left one mirrored, all cut from one texel grid so that their rows agree, a band standing as much higher than the
  picture as its last row lies above the picture's base (`bandBoards`, as FINAL LAP 2's underpass and its bank are
  laid). Letters and tunnel
  mouths are not repeated: their picture alone is drawn. That the original's bands keep their width and period on the
  screen however near, where a board shrinks with distance, is a replacement that cannot be avoided, each chapter's.

### Chosen lines

A ROM's picture is put on the 40 texels/m grid by chosen lines (`chosenLines`), so that its one-pixel lines (outlines,
letters' strokes, poles) neither break nor change their width: every texel is a source pixel, its colors unmixed (the
LOD levels below the master mix them). Each axis is planned from the picture on its own, at its r texels a pixel:

- **Count.** N = max(1, round(n × r)) of its n lines, each a source line in order: shrinking (N < n), K = n − N lines
  are dropped; growing (N > n), each line is repeated q = ⌊N / n⌋ times and K = N − q·n of them once more.
- **Choice.** The K are one from each of K equal windows [⌊k·n/K⌋, ⌊(k+1)·n/K⌋), k = 0 … K − 1, chosen in order: the
  line of least score, a line's score being the number of pixels it differs in from the nearer of its two neighbours
  (an end line's one). Shrinking, the neighbours are the lines still kept (the left or upper the nearest not yet
  dropped), so two equal lines across a window's edge are not both dropped; growing, the source's. Of equal scores,
  the line nearest the window's middle, then the lowest. Transparency is a color.
- **Picture.** A texel is the source pixel of its chosen row and column. A picture's pixels are palette indices or
  colors (RGB555 or transparent), chosen alike.
- **Symmetry.** A picture each of whose columns equals its mirror's stays symmetric: N moves by one where K would be
  odd (to the nearer of n × r), the left ⌊n/2⌋ columns take K/2 windows chosen as above, and the right columns mirror
  them; an odd middle column is neither dropped nor repeated once more.
- **Mirroring.** A mirrored picture is the unmirrored picture's output mirrored, not chosen again.

Base points, hit widths and LOD levels are each original's own rules ([Boards](outrun-road-data.md#boards), [SUPER
HANG-ON's courses](super-hang-on-road-data.md#super-hang-ons-courses)); in every original a body is as wide as its hit
width, at most its picture's colored columns, the shadow's pixels aside (`coloredColumns`), and is written as one part on
its placement's lateral (`spriteElement`: `[{ across: 0, width, movable: null }]`). A separate shadow picture is put on
the grid the same way.

### Pictures from the extract

The extract is a picture as its ROM holds it (its pixels, pen 10 among them, its palettes, sizes and mirroring, its
anchor and height) with each use's flags from the original: whether it is drawn with shadows allowed, a separate
shadow picture, whether it lies. It is made from the ROMs again by every conversion and never committed. One set of
rules (`sprite-rules`) makes it a course image, the originals differing only by their flags and K's table:

- **Colors.** A board's colors in a palette are its pens but those its sprite hardware draws none of, which the
  hardware names (`TRANSPARENT_PENS`, K, 2026-11-09): Sega's and Namco's pens 0 and 15, the TAITO Z system's pen 0
  alone, its pen 15 a color (`boardColors`).
- **Shadow pen.** In a use drawn with shadows allowed that stands, lifted less than a pixel of its original's at the
  picture's largest size, pen 10 is shadow, taken from the picture into its shadow frame; in a use lifted a pixel or
  more, which floats, in any other use, or where K's table says so, it is a color: only what stands casts the ground's
  shadow (K, 2026-10-27). A use's own height decides, not its routine's flags. A picture shown by uses of both kinds is
  two images, the colored one's `-unshaded` after its name.
- **The ground's shadow.** Its seeds are the shadow pixels with only shadow or transparency below them in their
  column, and it is what is reached from them through shadow pixels' eight neighbours. K's `paintedShadow` makes the
  pixels of its indices from its row down shadow pixels too, taken from the picture where reached; those not reached
  stay (a rock's black cracks).
- **Fill A.** In a row of the ground's shadow, the picture's pixels between its leftmost and rightmost pixels are
  shadow too and stay in the picture.
- **Base.** A picture stands on its base point, on the bottom edge of its lowest row holding a pixel once its shadow is
  taken, or of K's `base` row, the ground painted below that lying on the nearer ground. Its course image keeps its
  rows to the lower of those, its shadow frame the whole grid (`paintedShadow`), both anchored at the base point. On the ground the
  base is at the original's point, the picture drawn lower than the original by its shadow's rows (K, 2026-10-22);
  raised, at the original's height, with no ground's shadow, its shadow picture (below) on the road beneath it
  ([Shadows](architecture.md#shadows)); but one resting on a kept standing piece of a thing goes down as that piece is
  drawn ([Things of several pieces](#things-of-several-pieces), lowered to rest).
- **Shadow pictures.** A shadow picture its original draws apart is laid where and as large as it draws it, on the
  picture's shadow frame's grid by its anchor, a floating use's as a standing one's.
- **Lying.** A picture its original draws by a routine that puts it on the road lies about its original's anchor
  (`lies`, [Lying boards](#lying-boards)), in its colors, with no shadow: its body and rows by these rules as every
  picture's (`pictureParts`, `partsOnGrid`), no pen taken for shadow.
- **K's table** (`sprite-table.json`) holds K's judgement of a look where the rules cannot tell (K, 2026-10-24),
  keyed by a picture's name less what it is drawn as (mirrored, flipped, shadowed, unshaded, a frame's part;
  `tableKey`), each key a picture some original draws (`originals` fails naming one that is not):
  `penIsColour`, `paintedShadow`, `base`, `lies` or `frame`, one a picture of the extract with its reason (a crowd both
  `penIsColour` and `paintedShadow`; the auditor's candidates of 2026-10-24, K confirming them on the pictures), rows the
  extract's pixel rows from 0 at the top: `penIsColour`, pen 10 stays a colour in a use drawn with shadows allowed;
  `paintedShadow`, pixels of its indices from its row down, reached as the ground's shadow is, are shadow; `base`, the
  row standing on the ground, or the original's anchor (`anchor`), the rows below lying on the nearer ground; `lies`,
  the whole picture lies on the ground.
- **Names.** A picture's image is named `<original>-<picture>`, then what it is drawn as, in this order and each only
  where it holds: `-mirrored`, `-flipped`, `-shadowed`, `-unshaded`. The original is its short name
  (`outrun`, `shangon`, `toutrun`, `enduror`); the picture its original's own id: OUTRUN's sprite (three
  digits), a strip's family (`strip-<address>`) or a frame (`frame-<address>`); SUPER HANG-ON's sprite (three digits)
  or size list (`frame-<address>`); TURBO OUTRUN's size list (five hex digits, `-u<thousandths>` after it where a pixel
  is not 2 road units) or a strip's (`strip-<size list>`); ENDURO RACER's size set (five hex digits); POLE POSITION
  II's (`polepos2`) board its first big sprite (two hex digits) and an object composed of sprites the routine laying
  them (four hex digits), its craft that and its first sprite's code (`16fc-<code>`); FINAL LAP 2's (`finalap2`)
  object its kind (three digits); CHASE H.Q.'s (`chasehq`) thing its kind (three hex digits); a [thing of several pieces](#things-of-several-pieces) as that section says. A sky is
  `<original>-<its stage or course>-sky`.

Every original's pictures are made so, OUTRUN's and TURBO OUTRUN's strips as [Strips](#strips) says. Their flags are
their chapters' ([OUTRUN's](outrun-road-data.md#boards), [SUPER HANG-ON's](super-hang-on-road-data.md#super-hang-ons-sprites),
[TURBO OUTRUN's](turbo-outrun-road-data.md#turbo-outruns-objects), [ENDURO RACER's](enduro-racer-road-data.md#enduro-racers-sprites)).
The TAITO originals' sprite hardware draws no shadow and their programs draw none apart, so their pictures have none
(default; K confirms at the stage's end).

### Things of several pieces

One thing an original draws in pieces (a gate, an arch, a banner, a board, the airship or the plane) is one picture at
conversion, built again from the ROMs' pixels as the original draws it, never from its pieces' converted pictures,
unless the original reuses a standing piece of it: then its pieces stay the original's pieces, and only what is one
picture cut apart, a banner or a girder, is baked (K, 2026-11-06). A baked thing's pieces' bodies are its body's parts
([the format](content-and-gameplay.md#sprites-and-environment)). POLE POSITION II's, OUTRUN's, SUPER HANG-ON's,
ENDURO RACER's and TURBO OUTRUN's things are raised so; FINAL LAP 2's and CHASE H.Q.'s are each one picture already,
a kind's pieces drawn as one unit at one point, its base point the original's point.

Why bake: a picture is drawn whole at its base point's scale f/d, d its distance along the road, and placed across at
its base point's distance right of the camera's axis × f/d (`pseudoProject`). Where the camera turns θ from the road,
pieces' spacing across shrinks by cos θ but each piece's width does not, so a thing's pieces part or overlap seen from
aside; the original's camera never turns from the road, and one picture cannot come apart in itself. Nor do the
converted pieces' pictures join as the original draws them: each goes onto the texel grid alone by its own chosen
lines, so seams move and lines across them step.

Why keep reused pieces: the original builds things of pieces it reuses, one post under many things, one building under
other boards. Baked group by group, the pictures multiply with every combination and place: TURBO OUTRUN's, baked
whole, came to 78 pictures and about 219 MB, its rock posts (26EE0) under a bridge's girders (27962) in 10 versions
alone, the road's width moving the posts apart. A mirrored piece counts as another: a thing whose mirrored post is
used nowhere else is one design, and is baked (POLE POSITION II's gantry).

- **Which pieces.** Of the pieces an original puts out at once (each chapter says where its code decides that unit),
  those standing within 0.25 m along the road are candidates; of them, a floating piece (`floats`) and the pieces it
  touches are one thing, through every such touch (`touchingThings`). A floating and a standing piece touch where
  their colored pixels, pen 10 among them, overlap or neighbour by side or corner as laid at the original's own size;
  two floating pieces where at most three clear pixels lie between (`TOUCH`: 4 pixels apart across and down at the
  most). Pieces standing on the ground touching one another are not joined (a crowd, a row of trees or buildings). A
  thing of two pieces or more, unless every piece stands at one station and one lateral, drawn together already.
  Strips, lying pictures, movable objects and pieces shown only off a chosen Link are never joined.
  A tile layer an original lays only in a frame it draws a thing, from the thing's place and size, is one of its
  pieces, laid as the original leaves it at the thing's full size (FINAL LAP 2's underpass's bank).
- **Reused standing pieces** (`joinPlan`, counted over every road of the original once its things are found). A piece
  is its id with its mirroring (shading, its shadow and its scale aside). A thing is not baked where a standing piece
  of it is reused: placed in no thing anywhere, in a thing of another arrangement (its pieces at their laid places,
  drawing order, shading and palettes aside), or twice in this thing. Every such thing has a floating piece, so
  something rests on the reused piece. Its pieces stand as they would unjoined, each its own picture and body.
- **Bands.** In such a thing, the floating pieces that touch one another and are placed apart nowhere in the original
  (apart: touching no other floating piece, in no thing or with standing pieces alone) are baked as one band, a thing
  of its own laid as below; a board used apart elsewhere stays a piece even beside a girder. At one station a band is
  written between the thing's pieces the original draws under the band pieces they touch and those it draws over them
  (`bandOrder`); where no place is both, the chapter says so.
- **Lowered to rest.** A standing picture is drawn its shadow's rows lower than its original (its painted shadow's rows
  below its base, `drawnLower`), a floating one not (K, 2026-10-22), so what rests on a kept standing piece would float
  above it: a floating piece or band resting on standing pieces, touching them directly or through other floating
  pieces, goes down as the most lowered of them is drawn (an overlap hides a row, a gap would show the sky). Whether it
  floats and its pen 10 are decided at its original height; its shadow on the road stays.
- **Accepted.** A kept post and a baked band part where the camera turns θ: a post a across from the band's middle
  moves a(1 − cos θ) against it, 0.22 m at 10° and 0.87 m at 20° for TURBO OUTRUN's rock arch's posts 14.5 m out; a
  board on a building at one lateral hardly moves.
- **Its picture.** A baked thing or band is laid at the original's own size, its largest size a pixel a pixel (POLE
  POSITION II's, its sprites' size where a big sprite is 1:1), each piece in the original's drawing order, a later one
  over those before, mirrored and colored as the original draws it, the pens its hardware draws none of transparent. Its
  colors: an index each (piece, pen) seen, those showing one color in every palette combination the thing is drawn in
  one index, in the order they first appear; past 15, the pairs kept by FINAL LAP 2's rule (`keptKeys`) in the first
  combination's colors, each other taking its kept pair's index (`joinedColors`). The picture then goes through the
  sprites' rules once, as one picture of the extract. A piece the original draws at a zoom fixed in one axis or both
  (CHASE H.Q.'s dunes, TOP SPEED's placements of types 1 to 3) is laid at the thing's full size too, where every piece
  is a pixel a pixel; that the original's thing changes its shape as it is drawn smaller is a replacement that cannot
  be avoided, its chapter's.
- **Its place.** Its base point is the middle of its outer edges, its lateral that middle's; it stands where a piece of
  it stands on the ground, else floats at its lowest colored row's height, lowered to rest as above. A piece with a body
  gives its body a part, as wide as the piece's body was, its middle the piece's base point's lateral less the thing's.
  Each palette combination is a palette, named by the palettes its pieces use, first appearing in drawing order, joined
  by `+` (`p019+p016`), the least name its default; two combinations of one name, or a name over 128 code units, stop
  the conversion.
- **Its name.** POLE POSITION II's keep its things' names; the other originals' are
  `<original>-joined-<its first drawn piece's id>`.
- **A passage.** A thing a vehicle passes through along a stretch, a tunnel or a bridge an original draws as one face,
  is its picture laid again at equal steps over the stretch, so fine that the eye at the player's height sees nothing
  through them (K, 2026-11-06, `passageSteps`): in each column of its opening whose edge lies above the eye, g that
  edge's height above the eye, t the picture's colored rows above it and D the nearest depth at which it is on the
  screen (the near plane's, or g × f ÷ the horizon's row), a step at most t × D ÷ g, the steps the fewest of equal
  length within the least. A board is drawn at its base point's depth, so a vehicle's heading and lateral do not enter.

### Lying boards

What lies on the ground is a board at the original's anchor (the middle of its picture, H/2 − 0.5, for OUTRUN's and
TURBO OUTRUN's; a strip's as [Strips](#strips) makes it), at height 0, with no body. A picture of [the sprites' rules](#pictures-from-the-extract)
is a lying image (`lies`), all of it on the ground about its anchor; any other folds there, its rows below the anchor
lying on the nearer ground as every picture's do ([Sprites and Painter](architecture.md#sprites-and-painter)). It has
no material: what lies under
it is the material around it, the road's Strips alone deciding it (K, 2026-10-25).

### Sky baking

Each original's background becomes one published sky the same way (`bakeSky`). The original's own module gives, from
its ROMs:

- **Layers.** Its layers in the order the original draws them, the first drawn first (Sega's and FINAL LAP 2's back,
  then front; POLE POSITION II's panorama alone), each its pixels a turn (Sega's back's 1536 and front's 2048; FINAL LAP
  2's 1536 each; POLE POSITION II's 2048), its picture's width or, where the original turns it at another rate, more or
  less than one picture, in RGB555 or transparent, with its bottom row's place: how many rows below the horizon (0 the
  first row below it); and the layer that faces the sky (`facing`; Sega's and FINAL LAP 2's back), whose turn is the
  sky's and whose rows set the sky's.
- **Overlap.** For each other layer, the facing layer's pixel its pixel 0 lies over, as the original has it, a whole
  pixel or not: its pixel f lies over the facing layer's f × (the facing's turn ÷ its turn) + overlap (Sega's front
  0.75f, FINAL LAP 2's f with its overlap 0), rounded only where the sky is laid (step 2). A layer whose turn is no
  whole number of its pictures is laid round from the facing layer's pixel the original's chapter names (`seam`), its
  picture cut once there.
- **Ramp.** The sky's color in each row up from the horizon, the last also every row above, and the color below the
  horizon.

The sky is laid in four steps, by [chosen lines](#chosen-lines), no colors mixed:

1. **Columns.** Each layer's columns, its turn, are chosen to 1504: at this game's 240 pixels a radian that is 359.04°,
   so the sky drifts about 4 pixels a turn.
2. **Layers.** In the original's rows, the ramp, then each layer over it in its order, each by its bottom row; a layer's
   chosen column j over the facing layer's chosen column j + overlap × 1504 / the facing's turn rounded (modulo 1504),
   as its pixel f lies over the facing's f × (the facing's turn ÷ its turn) + overlap; one laid round from its seam,
   from the facing layer's chosen column there.
3. **Rows.** The original's rows each way from the horizon (Sega's 305, CHASE H.Q.'s 164) are chosen to 320 at its pixel
   aspect times 1504 over its facing layer's turn a row (Sega's 15/14 × 1504/1536, CHASE H.Q.'s 1504/768), the horizon
   between rows 319 and 320: as many as the nearest whole number gives 320 of, one more where they give fewer, the 320
   nearest the horizon kept.
4. **Tiles.** The pixels are drawn as a tile picture as the skies command draws one (each 8 × 8 tile its 15 most
   used RGB555 colors, every other pixel the nearest kept in linear light, no dithering).

The skies face as the original's backgrounds by the facing layer: its pixel x is the sky's x × its turn / 1504, whatever
its columns chosen. Where a chapter names the facing layer's column at which the road vanishes at the original's
heading 0, the sky's yaw origin shows that column at this game's camera's centre (`skyYawOrigin`). A Section's is the
course's plus the road's turn from the course's start to its start, continued from Section to Section so that the sky
never jumps at a border, and taken by the sky's period, 1504 / 240 rad, only where it would leave the format's ±360°
(`sectionYawOrigin`, every original's). FINAL LAP 2's sky faces by its front's arrangement, its back's clouds facing
nothing ([its skies](final-lap-2-road-data.md#its-skies)).

The Out Run hardware shows a tile layer's pixel `LAYER_MIDDLE` − its scroll at the screen's middle column, a larger
scroll moving the picture right: the hardware's display offset, which no program holds (the hardware's, K's reading
of SUPER HANG-ON's front layer at its heading 0, its pixel 1880 at its scroll 8). The back layer's 1536 pixels
are the map's last. An original on the hardware takes its back layer's column at heading 0 and its overlap from its
program's scrolls there by these (`layerMiddles`; SUPER HANG-ON's, TURBO OUTRUN's and OUTRUN's chapters). OUTRUN's and
TURBO OUTRUN's programs lay their layers alike, and one module reads and lays them (`out-run-hardware/backgrounds`): a layer's
pages of 64 × 32 tiles from its data, its rows from the bottom up, a row of tile words or runs, a row not written tile
word 0x0020; the last page leftmost; a tile word's tile its bits 0–12 and its palette its bits 6–12. Their sub CPUs' road code is the same bytes, and it
lays the sky's ramp (`rampRows`; each sub program's line list its chapter's): above the
road's top the road layer's solid color 0x800 + k, k from 1 two rows each to 62, then 63 every row above; color 0 only
where the road's top lies above the row it reaches, so below the horizon.

A stage's change, its sky and its road's and ground's colors, runs over the stretch of road over which the original
changes them (K, 2026-10-29): from where the original begins changing its sky, road or ground to where it has changed
them all, a part it changes over time taken as the distance its top speed covers in that time (each chapter's top speed,
tick and metres a position), a change made at once of length 0. Where a change begins before the one before it has
ended, the two are one, from the earliest start to the latest end, mixing from the set before the first to the set
after the last, the sets between not shown (`joinedChanges`; K, 2026-11-09). The environment's knot starts the stretch and its
`transition` is its length; the sky changes by lines and the colors by color pairs over it ([Image
assets](image-assets.md#background-transitions)). Each set of the road's and the ground's colors runs from one change of
the sky to the next, a change's own stretch mixing from the set before it (`colorStretches`, `stretchColor`). A color
pair is the old and the new colors of the change in force where it lies. Each chapter gives its program's addresses. The
sets are the original's stages' road and ground colors; a place's color (K, 2026-10-21, 2026-10-27, 2026-10-29) is not
one of them: it keeps its own ends and changes at once. While the original's background fades from one to another, the brighter one's sky shows; a dark sky shows only
where the original's background is wholly dark (K, 2026-10-27). FINAL LAP 2's changes of its front by sections along a
lap are not laid: a course keeps one sky (K, 2026-11-04).

### The grid

Every original's course has a car grid (`grid`) and a bike grid (`bikeGrid`), the bike grid holding bikes alone, each
as many slots as a run's competitors, listed from the start line back (K, 2026-10-25 and 2026-11-05; `ruleGrid`, the
start gate of both grids by it `startGate`, which every original's conversion uses). FREE PLAY and TIME ATTACK fill a
grid from the front, the rivals first and the player behind them; a RACE's entries take the slots its class gives
them ([Run setup](content-and-gameplay.md#run-setup)).

1. **The start line.** On a circuit, its line: a grid's front slot stands where its original's front place does, but
   never nearer the line than half its kind's largest body in the vehicle catalog (a car 4.996 × 2.15 m, a bike 2.38 ×
   0.85 m), so that no body crosses the line at GO; an original's grid nearer moves back so far, whole, and the general
   form's front slot stands so far before the line. On a course that is not a circuit, the front of the places its
   original stands vehicles in at GO, of either kind, where a grid's front slot stands.
2. **The original's grid**, where the original stands vehicles of the grid's kind at GO: their places front to back,
   its own vehicle's among them. Where its program lays them by a rule (POLE POSITION II's rows of two, FINAL LAP 2's
   slots by turns either side), the rule is laid on to a run's competitors, places as far along in the order it lays
   them. Otherwise the general form follows behind them, and of places as far along its own vehicle's is first and the
   rest go from the left. Where a body of the kind's largest at any of them would overlap another's, the places spread
   along the road from the front one, each one's distance behind it multiplied by the least factor that parts them all;
   where two as far along would overlap, or one leaves the course limits, the grid is the general form alone.
3. **The general form**, where the original stands none of the kind, or behind its places, on the original vehicle's
   lane and its left neighbour, or the two lanes it stands between:
   - cars one a row, each 12 m behind the one before, in the two lanes by turns: the first in the left lane, or behind
     the original's places in the lane the last of them is not in;
   - bikes four a row, two in each lane a quarter of its width either side of its centre, left to right, each row 3 m
     behind the one before, behind the original's places 3 m behind the last of them.

A grid reaching further back than its original's road lays the road on back ([The road's plan](#the-roads-plan)).

## The Sections

Where a course is cut into Sections.

### Sections' cuts

A course's Sections begin where its original changes stage or sector, and each is cut again where its road comes near
itself (`domainCuts`): where the road at one place lies within its lanes' least radius of the road at another
(`passagePairs`, sampled every metre, `PASSAGE_STEP`), those two passages lie in different Sections. While a pair
remains, one cut parts every pair whose earlier passage lies before the earliest later one, where one can, else the
earliest later passage's pairs. The cut lies between the passages, where the road is one road (OUTRUN's and TURBO
OUTRUN's, where two roads are drawn, at road widths of at most `ROAD_HALF`, 250: no median between their lanes) and
before the finish (the format keeps it in the course's last Section), at the middle of the longest straight of P there
longer than 4 m (twice `GATE_ROOM`), else of the longest such stretch (their lengths to the micrometre, as the format writes them; of equal ones the
earliest), its middle more than 2 m from a gate; failing that, on from that stretch's middle by half metres until it is.
The format refuses a Section whose ground beyond the road stops being one-to-one
([Architecture](architecture.md#plan-authority)).

## The canon and its check

The outputs every original's conversion writes, compared with the committed ones.

### Raising the originals again

Every original's courses can be raised again from K's ROM zips and this repository alone. The zips, MAME's parent sets
(their ROMs and CRC-32s are each original's ROM set section's):

| Original         | Zips                          | In                                      | ROM set                                                                               |
| ---------------- | ----------------------------- | --------------------------------------- | ------------------------------------------------------------------------------------- |
| OUTRUN           | `outrun.zip`                  | `reference-media/outrun/rom/`           | [ROM set](outrun-road-data.md#rom-set)                                                |
| SUPER HANG-ON    | `shangon.zip`                 | `reference-media/super-hang-on/rom/`    | [SUPER HANG-ON's ROM set](super-hang-on-road-data.md#super-hang-ons-rom-set)          |
| TURBO OUTRUN     | `toutrun.zip`                 | `reference-media/turbo-outrun/rom/`     | [TURBO OUTRUN's ROM set](turbo-outrun-road-data.md#turbo-outruns-rom-set)             |
| ENDURO RACER     | `enduror.zip`, `endurobl.zip` | `reference-media/enduro-racer/rom/`     | [ENDURO RACER's ROM set](enduro-racer-road-data.md#enduro-racers-rom-set)             |
| POLE POSITION II | `polepos2.zip`                | `reference-media/pole-position-ii/rom/` | [POLE POSITION II's ROM set](pole-position-ii-road-data.md#pole-position-iis-rom-set) |
| FINAL LAP 2      | `finalap2.zip`                | `reference-media/final-lap-2/rom/`      | [FINAL LAP 2's ROM set](final-lap-2-road-data.md#final-lap-2s-rom-set)                |
| CHASE H.Q.       | `chasehq.zip`                 | `reference-media/chase-hq/rom/`         | [CHASE H.Q.'s ROM set](chase-hq-road-data.md#chase-hqs-rom-set)                       |

`npm run road-data -- originals` ([Development](development.md#road-data-commands)) runs, in this order,
`outrun-course`, `super-hang-on-course`, `turbo-outrun-course`, `enduro-racer-course`, `pole-position-ii-course`, `final-lap-2-course` and `chase-hq-course`, each finding its zips in its ROM directory. A conversion takes its original's ROM set alone
and gives its outputs and its report (`Conversion`); its command reads the zips, which its report names, and saves or
compares the outputs. A conversion's outputs are the files it writes, whatever their names: its courses, the boards and
pictures their objects show and its skies, each by its path in the originals' place, `content/originals/`
(`conversion`); a course is the format's document, its Positions normalized, as the course format admits it. One part saves them all (`original-outputs`), writing those whose bytes
differ, or with `--check` writes nothing and names every output that differs from the committed file or is missing.
Each conversion's command reports so in one form: its result with its outputs' count and the changed and missing ones.

Once every conversion has run, the originals' place holds exactly their outputs: a file in it that none writes is
removed, or with `--check` named; an original's own command cannot tell another's files, so `originals` alone looks.
Each conversion's result is one line of JSON; one that fails (a zip missing, a set refused, an output differing) is
reported on its line and the rest still run, and the command then ends with a failure. The last line names the files
no conversion writes and the courses whose document or pictures changed, whose identities may change with them: their
measured products are made again with `npm run measure -- generate` ([Measured
products](development.md#measured-products)).

The grades' pieces are the repository's (`tools/road-data/shared/screen-pieces.json`): the commands read them and do not solve
them ([Profile from the original's screen](#profile-from-the-originals-screen)).

The local originals of the recordings are not raised by it: `outrun-sounds` writes them, with ffmpeg
([Local originals](development.md#local-originals)). The dumps (`<original>-read`) are research's, not the courses'.
Neither the research tools nor K's local kit (its harnesses and decrypting code) is needed to raise the courses.

## Raising an original from its ROMs

The way OUTRUN, SUPER HANG-ON, TURBO OUTRUN, ENDURO RACER, POLE POSITION II, FINAL LAP 2 and CHASE H.Q. were raised, as
steps and checks for the next original. Each original's tables and rules are in its own road data document; this is the
procedure they share. Research (reading the program, emulating it, deciding) is done on K's machine with the research
tools ([Development](development.md#research-tools)) and K's local kit (its harnesses and decrypting code); the road
data tool reads the ROMs' tables and instructions and writes the courses.

Besides what its conversion writes, a raised original holds these in the repository (K, 2026-10-23):

- its directory of modules, `tools/road-data/<original>/` ([the map](#original-road-data)): its ROM set's source
  (`<original>-rom`, its `RomSource`), its readers and conversion, and its commands (`<original>-commands`);
- its conversion command, `<original>-course`, with its `--check` ([Road data commands](development.md#road-data-commands));
- its chapter, `<original>-road-data.md`, naming its ROM set, whose ROMs' CRC-32s and conversion's version its
  modules hold;
- its research note, `research/<original>.md`;
- its entry in the register of the originals (`originals-register`), which the tool's entry and `originals`, the command
  raising every original ([Raising the originals again](#raising-the-originals-again)), read.

### 0. Rules

- First check the boundary (K, 2026-11-03): the tool raises an original whose road surface its road layer draws a
  line at a time, as these six's do. An original whose road surface is drawn by sprites (SUPER MONACO GP, RACING
  HERO, POWER DRIFT, RAD MOBILE) is left to a later model ([NEXT](NEXT.md#originals-with-a-sprite-road-surface)): its
  road's boards laid on the road as Strips are far more than a Section holds.
  The rules of the originals (what never enters the repository, decryption, other projects' code, the picture rule) are in
  [Rules of the originals](#rules-of-the-originals); every step below keeps them.
- How a stage starts (as Stage NM started): originals raised in one stage are studied before any is raised, so
  that the rules they share are decided once. Their hardware and sets are read from MAME's driver descriptions and
  checked against the ROMs when the stage starts; their zips are checked as below (1). Their heights are raised by
  today's rule, the crests' V decided later course by course as every other course's; their scales and replacements
  go to K with alternatives and a default. A fork in the original makes a course a road, as OUTRUN's do. Their courses'
  order by name and their programs' tick are read from the programs, else seen in K's MAME by steps given to K, and
  each chapter names the MAME commit its driver was read from. Where a road crosses itself at one height, how the
  crossing is drawn and how bodies meet it are checked, and what shows is reported.

### 1. The ROM set

- Take MAME's parent set of the original, the version K names. Check every ROM in the zip against MAME's current list
  for that set (`ROM_START` in its driver): name and CRC-32 (`research-set`), and size (`research-zip`). Record the set,
  its MAME description and any ROM whose name or content differs (an older MAME's zip may name ROMs differently; a key
  file may differ).
- Note the clones: regions, revisions, cabinets, bootlegs. Some hold other content (another course order, other
  courses); some are decrypted bootlegs a tool may read.
- Find the encryption: none; FD1094 (instruction fetches only, so every table is plain in the ROM's bytes); FD1089
  (instructions and data: read the tables and the instructions' operands from a decrypted bootleg set, else they
  cannot be read by the tool).
- The road data tool reads the set by the ROM rule of the [rules of the originals](#rules-of-the-originals); record any
  ROM whose name differs from MAME's current list.

### 2. The hardware and the programs

- Identify the hardware (Hang-On / Space Harrier, Out Run, X, Y, …), its CPUs, which CPU holds which tables, and
  how the shared RAM maps between them.
- Assemble each CPU's program from its ROMs (even and odd bytes interleaved, `research-image`); note mirrors.

### 3. Finding the tables

- Start from what the program shows: strings (stage names, debug labels), the stage setup routine, the per-tick road
  advance, the routines that read a pointer and step through records.
- For each table record its address, entry format, terminator and who reads it (routine and RAM variable). Expect: stage
  or section descriptors; the plan (curves with radii, or heading tables, or path vectors); widths; heights or slopes;
  scenery points and object types; colors (road, ground, sky ramp); background layers and palettes; start, checkpoint
  and goal objects; the time and extension tables.
- Confirm by running the program (research emulation, on K's machine): dump RAM and compose frames from the tilemaps,
  sprites and road layer; check that a table's entries appear where the reading says, at the frames and positions
  recorded as evidence.

### 4. Length and time

- Find the tick (often two frames, from the main loop's wait on the frame interrupt) and the road position (usually a
  16.16 long).
- Along the road the scale follows the [rules of the originals](#rules-of-the-originals): find the program's amounts
  that give it (the advance per tick against the displayed speed, or the clock against the camera's units a tick) and
  check them where possible (K's video, the clock against frames).
- Across and up, the original's world often keeps no one scale, so the scale is K's, decided by driving (K,
  2026-10-26): a lane of 3.6 m in OUTRUN and TURBO OUTRUN, 4.3 m in SUPER HANG-ON and 3.8 m in ENDURO RACER. Up is 15/14 of across where the original projects both alike (its 320 × 224 screen is shown at 4:3). For a
  new original, report the alternatives with their costs (texel bounds, grid lengths, closure, how objects and the eye
  compare) for K to choose.
- An original whose own car is a Formula One car has one scale across (K, 2026-11-04): its own car, at the depth the
  original draws it on its road, is as wide as a Formula One car could be in the original's year, 2.15 m in 1983 and
  in 1990, measured against the road at that depth; its chapter records the measurement and the lane it gives, which K
  may round or adjust by driving. Up is the original's pixel aspect (POLE POSITION II's 6/7).

### 5. Plan, profile, cross-section

- The plan becomes straights and arcs by the [plan from a heading table](#plan-from-a-heading-table), by the [plan from
  a curve table](#plan-from-a-curve-table), or from the table's own arcs where it holds them; each original's document
  records how far its plan lies off its path, or, for a course with a model, laid as [a lap on its
  model](#a-lap-on-its-model), how near its model it lies.
- Lanes lie on the material and keep their number across a Section's Links; SUPER HANG-ON, ENDURO RACER and POLE POSITION II lay two lanes, a and b, either side of the original's centre line, and an original's painted lanes are
  Strips over them.
- Heights by the [grades' rule](#profile-from-the-originals-screen): a 3D road in the ROMs times its factor, or its
  screen read back piece by piece ([Profile](#profile)); record the original's height or slope format.
- Cross-section: lanes, lines, edge bands from the road ROM's nearest line or the surface sprites; colors and the
  stripes' period and phase (check the phase in the original, the bike or car held still while the position is set).
- Materials and limits from the original's band or zone tables where it has them; where a car cannot go, the course
  limit alone decides.

### 6. Objects

- Pictures follow the picture rule of the [rules of the originals](#rules-of-the-originals) and the [picture
  contract](image-assets.md#picture-contract). Walls (`walls`) are not used.
- Place each object at its station and lateral as the original's routine places it (on a curve table's course, at its
  curve table position, [Places and patterns](#places-and-patterns)), with its picture's bottom edge at
  the height the original draws it, its mirroring and palette; spawn and approach rules decide where it stands (simulate
  them tick by tick at the speed the original's layout assumes).
- Bodies follow the original's hit routines: an object it tests gets a body as wide as its extents, at most its
  picture's colored columns, the shadow's pixels aside (`coloredColumns`); the rest pass through.
- Pictures by chosen lines at their size class; check the course's texel and image bounds.

### 7. Skies

- Bake the background into one sky by [Sky baking](#sky-baking);
  background changes (stages, tunnels, weather) become sky changes at the original's positions, which the renderer
  reaches with the point its camera follows ([Architecture](architecture.md#ground-and-background)).

### 8. The original's camera

- Measure the eye on a level road: the horizon row y_h and the road's lateral scale s (pixels a unit) at a row y give
  the eye H = (y − y_h) / s in lateral units, the same at every row for a pinhole projection. Report it raw and with
  rows 15/14 of a column, in metres at the adopted scale, against the player's vehicle, and the camera's distance and
  field of view where the original's depth allows (its along-road depth is often not a perspective). Measure and record
  its focal length too, in screen heights, so its lens ratio, which the [grades' rule](#profile-from-the-originals-screen)
  scales by. Each research note's Camera (eye height) section keeps its original's figures.

### 9. Sections, gates, limits of admission

- Cut Sections where the original changes stage or sector, and again where its road comes near itself (within its lanes'
  least radius) or its boards pass the format's sprite element bound; check every bound in [Numeric and resource
  domains](content-and-gameplay.md#numeric-and-resource-domains).
- Gates: the grids by [The grid](#the-grid); checkpoints, the finish or goal, as the original places them.
- Write the document by the course format's types, every original's by one part (`course-writing`): a course is
  entered at its first Section, and each Link's id is its two Sections' ids joined by a hyphen.

### 10. Identity and checks

- A course's identity is [Content and gameplay](content-and-gameplay.md#compiled-identity-and-project-publication)'s;
  the checks before handing over are [AGENTS](../AGENTS.md)'s and the [rules of the originals](#rules-of-the-originals)'
  (every original's `--check`).
