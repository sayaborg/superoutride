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
  [Courses of the originals](#courses-of-the-originals)' list.
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

Next PR: in [Stage AU7](#stage-au7--the-road-data-tools-mended); then in [Stage
GR](#stage-gr--the-originals-courses-mended) and [Stage RM](#stage-rm--branch-tsukuba-and-the-walls), and beside them
[Stage NM](#stage-nm--a-namco-original-from-the-roms), later [Stage BR](#stage-br--big-run-from-the-roms), [Stage
CS](#stage-cs--cisco-heat-from-the-roms) and [Stage TA](#stage-ta--a-taito-original-from-the-roms);
[RD-6e](#courses-of-the-originals) once K's recordings come; then
[Stage 16](#stage-16--produce-product-courses).

Implement the stages in order. Each PR's restart instructions supply its detailed requirements.
Topic contracts belong to the topic specifications; development and release procedure belongs to AGENTS.
PRs hold rationale and verification evidence. Each stage first consolidates the structure its later PRs consume.

## Stage PS — Product pictures and courses (ENDURO RACER first)

K's instruction, 2026-10-29, replacing the public-picture trial that ChatGPT Work made in PS-0 to PS-5 (#1346, #1348,
#1352 to #1356). This stage makes the place where product courses and pictures are made, and tries it on ENDURO RACER:
its 50 unmirrored object pictures redrawn by K with generative AI, and its course mended by K. Far scenery is outside
this stage. It runs alongside the other stages, with the EX auditor's terms (2026-10-29):

- Stage TR has closed, so the PRs that change the course viewer's or the workbench's shape may go.
- Stage AU7 began on 2026-10-29 (#1384 to #1387, documents first). Its AU7-6 (#1389) names the originals' place,
  `content/originals/` (with `courses/` and `images/`), and the one way to find a name's path,
  `tools/authoring/content-places.ts` (`coursePathIn`, `imagePathIn` and the rest), read by the compile, the course
  tools, the course viewer and the workbench. AU7-6 touches `content-places.ts` (new), `compile-content.ts`,
  `tools/course/authoring-io.ts`, `editor-frame.ts`'s `showDiagnostics` (a line and an import), the course viewer's
  `openCourse` (one read of a document) and a few lines finding paths in the workbench's Course, Documents and Run
  modules. A PS PR that moves or changes those goes after AU7-6. Once AU7-7 has moved the originals, a picture or course
  read at a fixed path (`images/<name>.json`) is not found: every PS read finds its path through `content-places`;
  writes (product pictures to `images/`) stay as they are.
- AU7-10 makes road data's ROM reading (zips by `DecompressionStream`, finding by CRC, interleaving, assembling
  programs and pictures, palettes) functions over bytes with no Node module, one CRC-32 table shared with
  `tools/browser-shared/zip.ts`, and names them in its PR; PS-19 uses them. AU7 mends `tools/public-pictures/review.ts`'s
  imports of road data in the same PR; this stage does not touch them. AU7 removes conversion outputs no command
  writes, by the set of files the conversions write, so nothing of this stage's goes.
- A PR that raises a format's version moves the documents people hold (TSUKUBA, and the product courses and pictures)
  in the same PR, as TR-1 did TSUKUBA; the EX auditor adds this to AU7's and TR's rules, and this stage does not write
  it again.
- A PS PR that newly imports something of road data, or deletes a file that imports it, tells K. Nothing is added
  inside road data except as agreed with the EX auditor.

K's decisions of 2026-10-29 on the first PRs: an original picture used only mirrored (`enduror-10bc2`, `111f8`,
`1154a`) becomes a product picture in the course's orientation (PS-10a); while AU7 is awaited, the other groups
below go first.

### Words

The stage's courses and pictures are of two kinds alone (K, 2026-10-29):

- An **original course** or **original picture** is one the road data tool raises uniquely from the ROMs: today's
  courses of the originals (`enduro-racer.course.json` and the rest) and their pictures (`enduror-*` and the rest). It
  is never edited by hand; only road data's rules change it. It is played in DEV alone and is in no series, to the end.
  AU7 moves the originals to a place of their own; product courses and pictures, and the other hand-made ones (TSUKUBA,
  the signs), stay in `content/courses/`, `content/images/` and `content/sprite-sources/`, never mixed with them.
- A **product course** or **product picture** is an original's pictures, course and placements mended by hand; the
  game ships these. Write the two words: alone, `product` keeps the compile's meaning (its products). A product course
  is `<original id>-product`, a product picture `product-<original picture name>`. A product course is in DEV alone
  until K puts it in a series.

No other word (public, canonical, provisional, a copy of the original) is used; the trial's `public` names mean
product and are renamed below. Nothing copies originals at will. The stage ends with the build and the products
reading no original: an original is read only by PS-10b's one start of the product course, the sprite editor's
comparisons (pictures 1 to 3) and the making of a product picture from it. In the end the repository holds the game,
the product courses and pictures (K's PNGs, recipes and saved images) and four browser tools.

K generates every picture; the implementer generates none and calls no image-generation API. K decides each
picture's scale, anchor (across and the ground row), collision width, shadow and dither in the sprite editor, and
mends the course itself in the course editor. K's archive comes to the implementer or the auditor, who applies it
with `apply-changes`, measures and opens the PR.

### K's decisions kept from the trial

- The originals (`enduror-*`, `enduro-racer.course.json`, road data's conversion and `--check`) are not touched.
- Sign lettering is redrawn with the rest. People and gates keep their scale; K corrects the others, whose scales the
  original itself does not keep consistent.
- The anchor row is the ground, height 0; what is drawn below it lies on the nearer ground. Trees collide at their
  trunks, not their crowns.
- A shadow is the picture taken as a zero-thickness board standing vertical at its anchor, cast on flat ground by one
  game-wide light from the camera's upper left at elevation 60° and azimuth 45°. A picture has a shadow when its
  original has one, unless K changes it. A mirrored picture reflects its picture and shadow together; the shadow's
  reversed side is accepted.
- Dither is none by default. A picture with alternate palettes gets them made again for its new colors; ENDURO RACER
  has one, `enduror-10456` (`p028`, `p086`).

### What the trial left

The build derives the product course and pictures from the originals on every compile (`publicPictureStore`,
`tools/public-pictures/derive.ts`, with ENDURO RACER's paths, name pattern, display name and order written into it), so
the products depend on the originals for ever; the committed `content/images/public-*.json` (57 files, 7.3 MB) are
overwritten by it and never used; `content/public-picture-sources` holds six pictures in 23 MB, each chosen PNG kept
twice as an attempt, at 1024 to 2048 px; a second table, generation record and importer stand beside the sprite
sources, which already make course images from PNGs; registration is searched again on every compile and clips to the
original's outline dilated by 2 texels, so no picture may leave the original's frame; `enduror-10398` lost its flag
and `enduror-105e6` floats above its own pebbles; four tests were added; the generation record assumes Work.

### Product courses

- PS-10b starts `enduro-racer-product` (shown as `ENDURO RACER PRODUCT`, which K may rename) once, with the original
  course's content; afterwards it is only mended, never made again from the original, and a later change of the
  original reaches it only when K takes it. DEV lists courses in the order AU7 reads the two places in; this stage adds
  no ordering.
- The course itself is mended in the course editor and by the course command. When the sprite editor first makes a
  product picture, the same edit renames, at every placement of the chosen product course, the original picture it
  replaces (with its `-mirrored` and a movable object's `knocked` pictures) to the product picture. A collision width K
  sets in the sprite editor is written at every placement of that picture; a placement without a body gets none.
  Widths per placement are the course editor's; where they differ the sprite editor says so, and a width K enters
  there sets them all.
- A changed product course has its racing lines measured again (`npm run measure`).

### Product pictures

- No product file is made before AU7 has moved the originals (PS-10a on).
- K's first edit of an original picture in the sprite editor makes its product picture, looking as the original
  does; until then the product course shows the original picture. Making all of an original's pictures products at
  once would add about 200 MB. In the end a product course uses no original picture.
- A product picture is a sprite source: `content/sprite-sources/product-<original name>.png` and `.json`, saved as
  `content/images/product-<original name>.json` (and `-mirrored` where the course mirrors it). Sources not based on an
  original (the signs and the rest) stay as they are, unmarked.
- An original picture the course uses only mirrored is made a product in that orientation, named by the rule
  (`product-enduror-111f8-mirrored`), without `mirror`; its `basedOn.image` is the `-mirrored` original, so its shadow
  is cast the right way (`basedOn.transform` holds no reflection). The sample `111f8` saves Work's PNG reflected.
- The recipe (version 5) and import are described in [Sprite operations](image-assets.md#sprite-operations). A picture with
  alternate palettes has them made once by `alternateSpritePalettes` and written as named palettes, so importing again
  reads no original. The build admits saved images as now and makes none.

### Picture rules

The rules are `tools/graphics`'s, which the editor and `apply-changes` call
([Candidate palettes](image-assets.md#candidate-palettes), [Sprite operations](image-assets.md#sprite-operations),
[board shadows](architecture.md#board-shadows)). The existing sources are imported by the color rule at their
next import. The editor registers K's PNG to picture 3 (`registerSpriteSource`, never in the build, clipping nothing),
saves it at `reduceSpriteSource`'s size, and asks for the original PNG again when K enlarges a picture beyond what its
saved PNG holds (`sourceLowResolution`). The color rule is the sprite sources' alone: the HUD pictures keep their own
k-means (PS-9d records it), and whether they share the rule is K's later decision.

### Guarding the originals

A file is an original by its place: the editing pages, the course command and `apply-changes` write nothing in the
originals' place. This stage keeps no list of originals. The editors read courses and pictures through the reader AU7
fits to the two places (which finds a name's place), never building a place themselves.

### Four browser tools

K's division, 2026-10-29. Each page has a root entry that, like `workbench.html` today, opens the current build's page;
all four are on Pages and in `verify-published-site.ts`'s check (entries, pages and scripts delivered; the compile
checked once as now); the game's DEV panel links to each. UI text is English; PC Chrome is the target; a page holding
the PNG codec carries its license.

| Page          | Entry                | Place                  | Holds                                                                    |
| ------------- | -------------------- | ---------------------- | ------------------------------------------------------------------------ |
| Course editor | `course-editor.html` | `tools/course-editor/` | the workbench's Course module and course-\* screens; a Run of its course |
| Sprite editor | `sprite-editor.html` | `tools/sprite-editor/` | product pictures and everything the Sprites module does                  |
| Course viewer | `course-viewer.html` | `tools/course-viewer/` | as now: it reads the current build                                       |
| Workbench     | `workbench.html`     | `tools/workbench/`     | Documents, Changes, Measure, Run and Music                               |

**Shared parts.** What two or more pages use is in `tools/browser-shared/` once; each page holds only its screens:
`published-store.ts`; the editing pages' frame (the part of `workbench.ts` that does not depend on a screen: the
working state, the compile worker and its queries, saving and opening archives, the conflict prompt, undo and redo,
the header, the diagnostics list, and the HTML and CSS of those shared screens), which a page starts with its modules
and which shows no tabs for one module; `editor-context.ts` (`EditorContext`, `EditorModule`);
`change-archive.ts`, `zip.ts`, `history.ts`, `pending-edit.ts`, `dom.ts`, `compile-worker.ts`, `compile-protocol.ts`,
`worker-store.ts`; and the Run part that opens a game tab and hands it the compile. The measure worker and preview
measurements stay the workbench's, and previews stay out of the working state. Worker URLs come from the build root,
not `import.meta.url`, since a shared chunk need not lie beside its page. The archive format
(`superoutride.workbench-changes` v1, `workbench-changes.json`) and the game's `workbench=<commit>` keep their names.

**One working state per build** is [Workbench](development.md#workbench)'s, which every editing page shares.

**Course editor.** The Course module and its screens move as they are; their layout is K's to change after use. Its
Run is the workbench's Run part (FREE PLAY, and RACE and TIME ATTACK when the course is in a class and measured). A
diagnostic or finding opens its document in the workbench's Documents module, in an open workbench or a new tab. A link
opens the course in the current build's course viewer (`course-viewer.html?course=<id>`), noting that the viewer
shows no working state. An original course is shown read-only.

**Sprite editor.** It reads every picture and course from the working state. A chosen product course (a `-product`
course, remembered by the browser; today `enduro-racer-product`) heads it. One list shows the pictures that course
uses (placements, `-mirrored`, a movable object's `knocked`; a mirror pair as one), another every other sprite source.
A picture's kind is the data's, never its name's: an original is a course image in the originals' place, a product
picture a sprite source with `basedOn`, any other sprite source general.

- A general sprite source has everything the Sprites module does (new source; crop, hide, show and anchor tools;
  width; Generate palette; Palette from each import; Clear mask; Write course image; the checks), through the moved
  `sprite-source-view.ts` and `sprite-preview.ts`, and shows pictures 4 and 5.
- An original or product picture shows five pictures at one scale with their anchors aligned: (1) the ROM extract, only
  after K drops the ROM zip on the page, raised in the browser by AU7's ROM reading functions (PS-19) with the ROM's own
  pixels (pen 10 included) at the original's pixel size in the default palette, sent nowhere and kept out of the working state;
  (2) the original course image and its shadow; (3) the original body placed by the product recipe's scale and anchor
  through `basedOn.transform`, with the collision lines and shadow, which is the product picture until it is redrawn;
  (4) K's saved PNG; (5) the product master (15 colors, dither, board shadow).
- The list shows a thumbnail, the name and `ORIGINAL` (the product course still uses the original) or `PRODUCT`
  (`REDRAWN` too when the PNG's digest differs from `bodySha256`), marked `CHANGED` (differs from the build in the
  working state), `STALE` (`bodySha256` differs from the current original), `LOW-RES` (the saved PNG is less than
  twice the master) or `OUTLINE` (IoU of 3's and 5's outlines below 0.9); above it, how many placements still use an
  original picture.
- The first edit of an `ORIGINAL` picture first makes its product picture in the same edit: the original body as a PNG,
  a recipe with the original's scale, anchor, palettes (named), `shadow: "board"` where the original has a shadow,
  `mirror` where the course mirrors it and `basedOn`, and the course's renaming.
- The middle shows the five side by side, and two chosen of them overlaid or toggled by click or Space, at whole-number
  zoom over a checkerboard or the road's color, with the anchor, the ground line, the collision lines (two, symmetric
  about the anchor) and the original's outline drawn over them.
- The controls: height above the ground (m, with texels); the anchor's across and ground row (drag and number);
  collision width (m, by dragging either line, and back to the original's ratio); shadow, dither and the palette shown;
  make alternate palettes; register again; import the PNG again; arrow keys move the chosen line or point one texel.
  Each change draws 3 and 5 again at once. Beside them: the picture on the road at sizes 0 to 3 with its shadow, drawn
  as the build does, and the palettes and three dithers side by side.
- K corrects 3 first, exports it as generation input, and imports the generated PNG. Export, one picture or all as a
  zip, names files from the original's name: `<name>-input.png` (3's body enlarged by nearest neighbour to about 1024
  px on its long side, transparent), `<name>-guide.png` (the input with the ground line, anchor and collision lines)
  and `<name>-prompt.txt` (the prompt template and K's note). The template is today's `GENERATION_PROMPT` corrected:
  it keeps every part already there, thin ones (flags, poles) included, changes no pose, draws no background, ground or
  shadow, keeps the whole picture in frame on a transparent background, and says nothing that drops an existing part
  ("add no hanging parts" goes). K may edit it on the page, and the browser keeps it.
- PNGs, one or many, may be dropped on the page or on a list picture. A file name starting with the original's name
  (`enduror-10398…` or `product-enduror-10398…`) chooses the picture; exported input and guide files are not taken.
  The import registers the PNG to 3, writes the recipe's crop, `widthMeters` and anchor and `basedOn.transform`, and
  keeps the PNG at the saved size.
- Save is the frame's Save changes (the whole working state, the course editor's changes included). "Revert picture"
  returns a picture's files to the build's (removing a product picture this working state made, and renaming the
  course's placements back to the original, its collision widths left as they are and said so).
- Every picture rule is a `tools/graphics` function and the ROM extract is AU7's ROM reading; the editor implements
  none of them.

### Order

Each item is one PR with one purpose, released by AGENTS; the game stays playable after each. Topic documents describe
what is implemented, so each PR updates what it changes there; the vocabulary entries for original course and picture,
product course and product picture come with the PR that introduces each name. Each PR reports the repository's growth; a product
picture or course PR lists the pictures and courses it changes. Large PNGs are not committed (the saved size above), no
original picture is made a product before it is used, and the 23 MB already pushed stays in the history, which is not
rewritten. ROM zips, dumps and extracts stay out of Git, PRs and Pages, the editor's extract in the browser alone. No
test is added: checks run once, in admission and `apply-changes`.

The groups go in this order, each when its condition holds; while none can start, ask K (K, 2026-10-29):

1. Done: PS-6 to PS-9c, PS-13 to PS-14.
2. Now: PS-6c, PS-14b, PS-9d, PS-21 and PS-16, PS-14b before PS-16 (the sprite editor stands on the working state).
3. After AU7-6 (the readers of two places): PS-14c, then PS-15.
4. After AU7-7 (the originals moved): PS-10a to PS-10c, PS-11 and PS-12.
5. After 3 and 4: PS-17 and PS-18.
6. After AU7 closes: PS-19 and PS-20.

- **PS-10a — Product pictures already decided.** Data only, used by no course yet. The six samples: Work's chosen PNGs
  at the saved size, recipes and `basedOn.transform` raised from Work's registration and table so that each looks as now
  (the same frame and anchor), `enduror-10456`'s two palettes computed by the rule. Each picture with a height, anchor
  or below-ground override in Work's table: a product picture not yet redrawn (made as the editor's first edit makes
  one, with the table's overrides; the below-ground height becomes `anchor.y`). The pictures used only mirrored as
  above. No other picture is made.
- **PS-10b — Switch.** `content/courses/enduro-racer-product.course.json` made once with the original course's content
  (no copying tool), then renamed to PS-10a's pictures and given the table's `collisionWidth`s by the rules above.
  `publicPictureStore`, the per-build derivation and ENDURO RACER's hard-coded names go. The product course's racing
  lines are measured. In DEV both courses are driven and compared with the previous build's `ENDURO RACER PUBLIC`: the
  same apart from where the outline clipped and the pictures back on their originals (those without overrides).
- **PS-10c — Deletions.** `content/public-pictures/`, `content/public-picture-sources/`,
  `content/racing-lines/enduro-racer-public.json`, every part of `tools/public-pictures/` PS-10b leaves unused
  (`course-comparison.ts` and the build's call of it, the alternate-palette rule and `DITHERS` copies), `review.ts`'s
  own parts kept until PS-17, and the `public-pictures` and `public-picture-inputs` commands.
- **PS-17 — Sprite editor, product pictures.** The product course's choice, the lists, pictures 2 to 5, making a product
  picture from an `ORIGINAL` one, the controls and views, the course's renaming and Revert picture.
  `public-pictures.html` goes, from Pages too, and the whole of `tools/public-pictures/` (`review.ts` and what it alone
  uses); `review.ts` imports road data, so K is told it goes. Report to K what to try where, and go on.
- **PS-18 — Sprite editor, generation.** Export, PNG import and registration, the saved PNG size and making alternate
  palettes.
- **PS-19 — The ROM extract.** After AU7 closes. The editor imports AU7's ROM reading functions (by the names its PRs
  give), whose list K is told first; road data is not changed. Where they do not run in the browser (a Node module,
  say), K asks the EX auditor rather than this stage mending them. The editor's ROM zip drop; road data's `--check`
  unchanged.
- **PS-20 — K's archives.** Each archive K sends is applied, measured and made a data PR, until the product course uses
  no original picture.

### Stops

Stop for K: after PS-19 (always: K remakes the six samples, the attendant's flag and the rock's foot included, and
sends the saved archive); when `apply-changes` stops on a digest or an original; when PS-10b
changes the look of a picture other than those named there; when PS-11 finds a sprite source writing an original
picture; when the next group's condition does not hold and work would wait; before another original's products;
before any later step below.

### Later

Not in this stage:

1. **Another original's products**, when K starts that original, made as K and the auditor then decide. OUTRUN's
   twelve courses hold the same stages in separate files (about 53 MB in all), so how stages are held is decided
   first; check whether TURBO OUTRUN and the others do the same.
2. **The very end**, after every product: the originals' courses, pictures and racing lines, road data and the other ROM
   tools with their documents, the originals' place (whole), the recipes' `basedOn`, the sprite editor's pictures 1 to 3
   and the refusal of the originals' place leave the repository, kept by K (under `reference-media/originals/`, say, as local originals are). First check that
   no product course uses an original picture and that no product picture still holds original pixels. K decides then
   what becomes of far scenery (an original too) and whether names drop `product`.
3. **The working state in the course viewer**, as K decides after using the four tools.
4. **The HUD pictures' colors**: whether they take the sprite sources' color rule in place of their own k-means, as K
   decides.

## Stage AU7 — The road data tools mended

K's decision, 2026-10-29, on the EX auditor's audit of the road data tool: every proposal as recommended. The audit
covered `tools/road-data` and its commands, [Original road data](original-road-data.md) and the originals' chapters,
the [research notes](research/), the research tools, K's research kit, and where the course viewer and the game meet
the course format. Its findings, by id (PL, PF, IO, X, OR, SH, TO, EN, SM), are in this stage's first PR; each PR below
names those it closes, and mends a finding wherever else it holds. The stage serves K's four aims:

1. Another original can be raised by the rules decided here.
2. The tool can be used: K's ROMs alone raise the same originals at any time.
3. The tools and the documents are orderly.
4. They read easily.

Every PR of the stage:

- Runs on Node 24, as `engines` says, and passes every original's `npm run road-data -- originals --check` on K's
  ROMs before it goes; once it is on main, K is told its number and the auditor checks it on K's ROMs.
- Changes an original's courses or pictures only where the table below allows, and then raises that original's
  conversion's version, raises its courses and pictures again, measures them again (`npm run measure -- generate`) and
  states which courses and pictures change and by how much. While ENDURO RACER PUBLIC is derived from the original
  (until PS-10b), a PR changing ENDURO RACER says that it changes too. A course or picture changing elsewhere stops the
  PR for K.
- Raising a format's version moves the documents people hold (TSUKUBA, the product courses and pictures) in the same
  PR, and K is told.
- Moving or renaming what `tools/public-pictures/review.ts` imports from road data mends that import in the same PR
  (Stage PS deletes `review.ts` in PS-17); nothing of Stage PS's (its pictures, `content/public-pictures/`, its
  records, the product courses and pictures) is moved into the originals' place or removed as a conversion's output.
- Keeps moves and renames, deletions and logic changes in separate PRs, each logic PR readable in one review.

Not in the stage: the product pictures and courses (Stage PS, which does not touch the originals), Stage GR's three
decisions, and Stage NM's original.

The originals' canon may change only here:

| Change                                  | What changes                                          | Original and courses                                                                     | When                                                   |
| --------------------------------------- | ----------------------------------------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| AU7-34, the tables read in order        | heights and objects                                   | OUTRUN: heights A and SHORT A; objects A, B, both Cs, D, E, SHORT A, SHORT B and SHORT E | always                                                 |
| AU7-35, the grid                        | the cars' grid from 24 slots to 16, the first 16 kept | SUPER MONACO GP's two                                                                    | always                                                 |
| AU7-37, boards below the ground         | kind 8's heights                                      | SUPER MONACO GP's two                                                                    | always                                                 |
| AU7-38, what is not seen                | objects placed                                        | OUTRUN, TURBO OUTRUN                                                                     | only where part of a picture rises above the ground    |
| AU7-39, `GOAL_CENTRE`                   | cuts                                                  | OUTRUN's six goals                                                                       | where the derived value differs                        |
| AU7-40, the sprite bound                | Sections' cuts                                        | SUPER MONACO GP's two                                                                    | where the general bound does not hold today's Sections |
| AU7-45, proximity samples and turns     | cuts and plans                                        | ENDURO RACER, SUPER HANG-ON and others                                                   | where the one value or condition differs from today's  |
| AU7-46, band edges and one road's width | SUPER MONACO GP's bands, OUTRUN's cuts                | SUPER MONACO GP, OUTRUN                                                                  | where the rule's side changes the value                |
| AU7-24, palette pen 15                  | image bytes, the look unchanged                       | OUTRUN, SUPER HANG-ON                                                                    | always                                                 |
| AU7-27, the mean color                  | colors                                                | ENDURO RACER's slopes or SUPER MONACO GP's Strips                                        | always                                                 |
| AU7-21, Link ids                        | course documents' ids                                 | SUPER MONACO GP                                                                          | always                                                 |
| AU7-23, the steepest grade              | grade factors, slightly                               | SUPER HANG-ON or SUPER MONACO GP                                                         | always                                                 |
| AU7-31, TURBO OUTRUN's figures          | image names                                           | TURBO OUTRUN                                                                             | where the exact scale changes a name                   |
| AU7-47, the minimizer                   | the grades' pieces                                    | the originals using them                                                                 | where the pieces solved again differ                   |

Its PRs, in this order, each with the contracts it changes; the counts are the audit's (main 99812c8f) and are
counted again on the PR's main.

**Documents.** These may run beside the rest if K wishes.

- AU7-1, this stage.
- AU7-2, NEXT's Stages NM, BR, CS and TA each gain the starting points of K's research kit, a line each, the boards and
  sets read from MAME's driver descriptions and checked against the ROMs when the stage starts; no other emulator's or
  port's name, code or link.
- AU7-3, the research notes gain the kit's facts they lack: TURBO OUTRUN's leg ends, final goal and ending, time,
  objects and signs; SUPER MONACO GP's overcast set, series and signs (its Open filled); SUPER HANG-ON's and ENDURO
  RACER's signs. Kit facts it calls uncertain go to Open; facts the notes or chapters hold already are not repeated.
- AU7-4, Original road data's [Raising an original from its ROMs](original-road-data.md#raising-an-original-from-its-roms)
  gains the one list of what a new original holds in the repository: its conversion command with `--check`, its
  chapter with its ROM set and CRCs, its research note, and its entry in the command raising them all (`originals`)
  (K, 2026-10-23). AU7-15 adds its modules to the same list. K is shown it.

**Deletion.**

- AU7-5, `content/images/toutrun-2450a-mirrored.json` and `toutrun-249ba-mirrored.json` go: no course uses them and no
  command writes them since SP-1 (TO-11). `--check` does not see them until AU7-8.

**The tool raises the same originals (aim 2), courses unchanged.**

- AU7-6, the originals' place, readers. The originals (what the conversions write: courses, pictures, skies and the
  rest) get a place of their own, which this PR names (K, 2026-10-29, plan A); K tells Stage PS's auditor. The
  content's loading, the build and delivery, DEV's list of courses (an original course is DEV's alone), the course
  viewer, the workbench, the course command and the tests read courses and pictures from both places, and refuse an
  id or name in both; DEV lists the originals' place's courses after `content/courses/`'s. Whether an original
  course's racing lines (`npm run measure`'s) lie in the place too, so that the originals go as one, is decided here.
  [Development](development.md)'s Build outputs and Road data commands, Content and gameplay's course identity where
  the place enters it.
- AU7-7, the originals moved there, as they are (move only). Afterwards no file in it is written by hand.
- AU7-8, the conversions own their outputs (P1): each original's outputs are the set of files its conversion writes,
  the place's content, never a name pattern. Writing removes the place's files it no longer writes; `--check` names
  every difference, missing file and extra file, not only the first; saving and comparing are one part (five copies
  today), and every original's report has one form, naming every course and picture that changes, so that a picture
  changing alone names the courses to measure (X-1, X-10, IO-4, IO-14). [Raising the originals
  again](original-road-data.md#raising-the-originals-again).
- AU7-9, every command declares its options and refuses one it does not know, a repeated one and a missing value,
  naming it (`--chek yes` writes today, `--zp <path>` reads the default zip); results are returned, not taken from
  `console.log` (X-16, IO-8, TO-19).
- AU7-10, ROM reading over bytes. Reading a zip (by `DecompressionStream('deflate-raw')`, so async), finding ROMs by
  CRC-32 and size, interleaving, assembling programs and pictures, and palettes become functions taking bytes and
  reading no file, with no Node module (`node:fs`, `node:zlib`, `Buffer`), so the browser runs them (PS-19); one
  CRC-32 table serves them and `tools/workbench/zip.ts`. Files are read and written at the commands' ends alone. The
  PR names the functions and their modules, for K and Stage PS (X-6, IO-2).
- AU7-11, one way to find an original's zips (P2): each original's `-rom` module names its ROM directory, its sets
  and its options once (six option names today for the same zip; ENDURO RACER's fixed names apart), every command and
  `review.ts` find the zips by it, and a zip missing, unreadable or broken, a ROM unlike its description, and a part
  that cannot meet its contract (`point-plan` with a lane's least radius it cannot keep, PL-1) end in a structured
  diagnostic naming the original, the set and the place, with its cause; `Error` stays for internal invariants (IO-2,
  IO-12, EN-2, EN-17, PF-16, OR-14, SH-11, TO-17, PL-14).
- AU7-12, the tool checks Node's version first and stops naming it where it is not `engines`' (IO-17: Node 22's `**`
  differs from 24's in the last digit and fails `--check` as if the ROMs differed).
- AU7-13, every input of the canon named (P3): Rules list once what a canon depends on beyond the ROMs and constants
  (the product camera's definition through the grades' pieces, the vehicle catalog's largest body through the grid,
  the engine's least lane radius). `screen-pieces.json` records the inputs it was solved from and their digests, and
  `originals --check` compares them without solving; TURBO OUTRUN still rises from `toutrun.zip` alone, its pieces'
  sameness with OUTRUN's checked by the recorded digests (PF-2, PL-4, X-9, TO-6).

**Places and shapes, `--check` unchanged.** Moves and renames, deletions and changes of shape or arguments are separate
PRs.

- AU7-14, three layers named (P4), moves and renames: the rules every original shares (chosen lines, plans,
  profiles, Sections, the grid), the board families, nested (Sega's 16-bit format, holding 68000 programs, the 320 ×
  224 screen at 15/14, shadow pen 10 and the two background layers 1536 and 2048; within it the Out Run board's hills,
  heights' procedure, clock, approach tables, two roads, bands and OUTRUN-format tables), and the originals. A family
  holds how its board is read, never the port's rules, which [One board](original-road-data.md#rules-of-the-originals)
  keeps one for all. `board` is renamed where it means a picture's board or this game's board.
- AU7-15, the layers' dependencies (P4): the shared layer imports no original and takes no original's value as a
  default argument (`UNIT_METRES`'s 3.6 m in `pixel-grid`, `screen-pieces`' `{outrun, enduroRacer}`, `screen-frames`
  importing ENDURO RACER, `at-speed-commands` holding three originals, SUPER MONACO GP's one-colour sky laid in two
  layers); the families' values (screen size and pixel ratio, display offset, shadow pen, lateral scale, background
  layers) are named once by their family or original. Original road data's map of the parts, written once, and AU7-4's
  list gains the modules (X-4, X-12, X-15, IO-1, IO-3, IO-6, IO-9, PL-5, PL-12, PL-19, PF-1, PF-7, EN-9).
- AU7-16, one register of the originals, read by `originals` and the build; the vocabulary's board, crossing, draft and
  original made one concept each (original course and original picture; product course and product picture) in
  [Vocabulary](README.md#vocabulary) (X-12, PL-19, X-11).
- AU7-17, one shape of an original's modules (P5), renames: one suffix one role (`-rom`, `-road`, `-course`,
  `-boards`, `-backgrounds`, `-constants`, `-dump`, `-commands` and the rest), OUTRUN's conversion out of its commands
  into its own modules, SUPER HANG-ON's `course` and `courses` and SUPER MONACO GP's 1015-line course divided by role
  (X-5, OR-3, SH-3, SM-9, TO-12).
- AU7-18, the conversion as one shape, "ROM set → courses, pictures, skies and report", with the dump a leaf no
  conversion imports (ENDURO RACER's, SUPER HANG-ON's and SUPER MONACO GP's do), the checks it needs in the conversion;
  commands hold arguments and saving alone and import no other command's module; each chapter says which roles its
  original lacks and why (EN-3, SH-7, TO-5, TO-12).
- AU7-19, constants in one place with reason and source (P8): the shared in [Shared
  constants](original-road-data.md#shared-constants) and `shared-constants`, a family's in its table and module, an
  original's in its chapter's table and its constants module (OUTRUN's in six modules, TURBO OUTRUN's in seven); each
  value with its reason and source (an address, or K's date); materials as constants, as ENDURO RACER's are; "but where
  named" gone (X-8, OR-4, SH-6, SM-3, TO-1, TO-3, PL-11, PF-8, EN-7).
- AU7-20, constants that change nothing removed (SUPER HANG-ON's `ROAD_CENTRE` and the rest), deletion only.

**One part for each copy (P6), mostly `--check` unchanged.**

- AU7-21, course documents written by one typed part: the format's types, Link ids one rule (SUPER MONACO GP's `-to-`
  goes: its documents change), and `OriginalOutputs.course` saving the admitted document (PL-6).
- AU7-22, the road path P assembled by one part; `CoursePath`'s per-element `start`, which repeats the lengths'
  sum, derived (PL-13).
- AU7-23, profiles assembled by one function (overruns, kinks and crossings alike), with one reading of the steepest
  grade, so that Stage GR's crest criterion lays over it as one rule (PF-3, PF-9).
- AU7-24, pictures assembled by one part: the shadow's frame, K's table's keys and palette pen 15 alike (OUTRUN's and
  SUPER HANG-ON's image bytes change, not their look), lying pictures through `sprite-rules` too (IO-7).
- AU7-25, the two roads' Strips written by one part for OUTRUN and TURBO OUTRUN (OR-7, TO-7).
- AU7-26, the tick versions share placement and control with the conversions, only the stepping differs, so the
  comparison compares the original's two paths and not two copies (OR-8, TO-8, SH-15).
- AU7-27, one rule for a picture's mean color, in linear light (K): ENDURO RACER's slopes or SUPER MONACO GP's Strips
  change slightly (SM-8).
- AU7-28, SUPER MONACO GP's road and ground colors through `colorStretches` (the tunnel's dark ground stays a place's
  colors, not a stage's) (SM-8, SM-12).

**What the ROMs hold read from the ROMs (P7), one PR an original, `--check` expected unchanged.** Values the
unencrypted programs hold are read from them, their instructions checked; constants keep only what encrypted code
alone holds, K's decisions and the conversion's choices. A table's address is found by one rule for every original:
from an unencrypted instruction, checked; where only an encrypted program holds it (TURBO OUTRUN's and SUPER MONACO
GP's main, `LATERAL_LIMIT` say), a named constant checked by the table's content (PF-6, IO-3, EN-10).

- AU7-29, OUTRUN: the stages' table, 212, the routines' properties, the goal's figures and the flagman (OR-2, OR-13).
- AU7-30, SUPER HANG-ON: the ending's picture (`ENDING`), the gate's parts and lamps (`GATE_PARTS`), the stripes'
  halves and S 0x16BA (SH-1, SH-2, SH-5, SH-10).
- AU7-31, TURBO OUTRUN: the start's figures (`START_FIGURES`; 29 of 43 lie in the legs' records, the rest come of
  encrypted motion), the patches' choice, the name records read by their format, exact scales (TO-2, TO-15).
- AU7-32, ENDURO RACER: the stages' number and length (`STAGES`, 2048), stage 5's road color's choice, `PIXEL_UNITS`
  (EN-4, EN-6, EN-7).
- AU7-33, SUPER MONACO GP: the standing objects' height word −50, 1640, 992, 1720, the tunnel's ground, `LAYERS`,
  `RAMP` and the rest, the Out Run board's 64, 32, 16 and 15 (SM-2).

**The tables read in order (P10), canon changes; before Stage GR.**

- AU7-34, one reader reads every section table in its order, as the original does by its pointer, taking an entry when
  its position comes and dropping height points while a hill runs; OUTRUN's scenery and height points are no longer
  sorted by position (`outrun-scenery`, `hills`' `tableRuns`, `outrun-ticks`), widths are read with heights, and the
  goal's special case goes. TURBO OUTRUN's reader is checked the same way, and `positions-at-speed` sorts nothing.
  VINEYARD's height table (1780, then 1444 and 1654) no longer runs table 11's +28.3 m at 531 m. OUTRUN's version is
  raised (OR-1).

**Rules naming an original, course or picture made general or K's (P9), one PR a decision, as K decided.**

- AU7-35, the grid: SUPER MONACO GP's by `ruleGrid` too, its first 16 slots as today and 16 for cars, not 24; Original
  road data's [grid](original-road-data.md#the-grid) states a rule naming no original. A grid longer than 16
  (`startGridSlots` 32) joins NEXT's Features no course uses (PL-3, SM-7).
- AU7-36, NEXT's Stage GR gains SUPER MONACO GP's surface, marks and kerbs made by one rule, Strips from the picture of
  a flat board across the road, the marks where the original places them (300 steps off today); the rule enters
  Original road data with the PR that makes it (SM-1).
- AU7-37, one rule for a board whose foot is below the ground: it keeps its height, as Rules say; SUPER MONACO GP's
  kind 8 is not raised to the ground (K revised 2026-10-22's decision, 2026-10-29), and K's table's 14 entries at h −80
  and `groundLine` go (SM-4).
- AU7-38, one rule for what is not seen: an object whose whole picture lies below the ground is not placed, one whose
  foot alone does is (AU7-37). OUTRUN's `LOWEST` and TURBO OUTRUN's y < 0 go; ALPS' grass band and TURBO OUTRUN's two
  at y −1024 are expected to stay out (OR-11, TO-9).
- AU7-39, `GOAL_CENTRE` (1946) derived by a rule (OR-9).
- AU7-40, the sprite bound (8192) set once on a general ground by Content and gameplay, one statement in place of
  three; the ground and value are shown to K first, and `cutsByCount` stays if SUPER MONACO GP's Sections (2696, 2817, 3325) must be cut by it, else goes (X-2, PL-10, SM-14).
- AU7-41, a picture used both standing and floating: one rule for every original (SUPER HANG-ON and ENDURO RACER stop
  on a RangeError, OUTRUN and TURBO OUTRUN make `-unshaded` twins); a moving object's still picture chosen one way
  (OR-12); TURBO OUTRUN's girl not chosen by address (TO-18). Where names change, `review.ts`' pictures are checked
  (SH-8, EN-12).
- AU7-42, exceptions inside originals: ENDURO RACER's stage 3 written one way, not flat by decree (EN-5); the grades'
  pieces' "flat" by kind and position (kind 4, stage 3) left to the measure (PF-5); stage 5's road color by a rule
  (EN-6); SUPER MONACO GP's `course.course === 1`, its implicit tunnel stage and two `COURSES` (SM-6).
- AU7-43, SUPER MONACO GP's tunnel frame made a shared rule or an entry of K's table with its reason (SM-13).
- AU7-44, SUPER HANG-ON's limit at speed 0 derived once from its stages' table, not 2 written (SH-4).
- AU7-45, proximity sampled at one interval (1 position for OUTRUN and TURBO OUTRUN, 2.5 m for the rest, today) and
  turns joined by one condition (`heading-plan` <, `point-plan` <=) (PL-2, PL-7).
- AU7-46, SUPER MONACO GP's band edges and `BAND_RAMP` (4 in the table, 2 in the code), and one road's width (212 in
  the document, 250 in the code), made one with the rule (PL-8, PL-9).

**No other project's code (P11).**

- AU7-47, the grades' minimizer (`bounded-quasi-newton`) written again from the published method with this project's
  names and structure, or replaced by a simpler method of the project's own, whichever is simpler among those that
  solve the 73 pieces well, never written looking at the code it resembles (PF-4). The 73 pieces are solved again from
  the ROMs and compared in the PR. Rules state the scope once: it covers general numerical methods too, written from
  the published method in this project's names and structure; which project one resembled stays in the PR.

**Documents, research tools and small mends (P12, P13, P14).**

- AU7-48 to AU7-50, the chapters hold rules, inputs and constants, and results (lengths, counts, heights, versions)
  stay in the commands' reports and PRs; one authority for versions and CRCs (ENDURO RACER lacks 32 of its 44 ROMs'
  CRCs); research notes hold the originals' facts and what is open, not PR history or retired names; one place for what
  people may touch on an original's course; Rules and Raising as the tool is (a decrypted bootleg's tables and
  operands, `cpu-68000` running an original's code and how far it may, tick by tick against the limit at speed 0).
  Each PR before mends its own contracts; these sweep the chapters and notes last. K is shown the Rules' sentences
  (OR-5, OR-10, OR-16, SH-9, SH-12, TO-3, TO-4, TO-13, TO-14, EN-1, EN-8, EN-11, EN-18 to EN-20, SM-10, SM-11, X-7, X-11,
  X-13, IO-10, IO-11, PF-10 to PF-12, PF-19, PL-9, PL-10, PL-17).
- AU7-51 and AU7-52, the research tools in one language: `dis68.py` alone stays Python (any disassembler may), the
  rest become road data's research commands in TypeScript over AU7-10's zip, CRC and interleave, writing only under
  `reference-media/<original>/` as the dumps do, their output never in Git or a PR, a MAME driver read for its ROM lists
  and set names alone; Development states the exception once (K, 2026-10-29) (IO-5).
- AU7-53 onward, the audit's low findings left (unused things, stray comments, the 210 to 380-line `sectionDocument`s,
  `two-roads`' `THIN` and `THERE`, undocumented though they decide the canon), by kind (deletion, move and rename,
  small logic) and module (shared or an original's).
- The last PR removes this stage from NEXT and restores Next PR's line.

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

Every stage raising an original starts so, beside the procedure's steps. Its boards and sets are read from MAME's
driver descriptions, so they are checked against the ROMs when the stage starts; no other emulator's or port's name,
code or link enters the repository (MAME may be named). Its zips, MAME's parent sets, are checked against MAME's current
ROM list by name, size and CRC-32, their versions and parents recorded. Whether its heights are raised by today's rule
or laid flat until after Stage GR, and its scales and replacements, go to K with alternatives and a default. A fork in
the original makes a course a road, as OUTRUN's do (BRANCH goes in Stage RM).

The candidates come in two families (K's research kit, 2026-10-23). POLE POSITION (1982) and POLE POSITION II (1983),
on a Z80 and two Z8002s, with one course and four. FINAL LAP (1987) and its sequels, FOUR TRAX (1989) and SUZUKA 8
HOURS (1992) and its sequel, on Namco System 2, with two 68000s and a 6809 for sound. The repository's disassembler
(`tools/research/dis68.py`) reads the 68000 alone (capstone 5, which it uses, has a 6809 mode); nothing reads the Z80 or
the Z8002, and neither `cpu-68000` nor K's harness runs a Z8002. Where that is short, the tables are read statically
first and K decides how they are checked by running; another project's emulator stays on K's machine.

## Stage BR — BIG RUN from the ROMs

Stage BR raises JALECO's BIG RUN (1989) from its ROMs ([Raising an original from its
ROMs](original-road-data.md#raising-an-original-from-its-roms)), after Stage NM.

BIG RUN and CISCO HEAT share one family of board (MAME's `bigrun` and `cischeat`): four 68000s (the main, two road CPUs
and the sound's), a YM2151 and two M6295s; two road layers drawn from the road ROMs, scaled sprites whose ROMs are
reordered on loading, and three tile planes; the main program in two sets of ROMs (from 0x000000 and 0x100000). It
seems unencrypted, which the stage checks. The 68000 tools serve; checking by running needs the four CPUs, the road
CPUs included, run together. BIG RUN is studied first, then whether CISCO HEAT takes the same readers. BIG RUN uses
boards whose foot is below the ground (a cliff's drop).

## Stage CS — CISCO HEAT from the ROMs

Stage CS raises JALECO's CISCO HEAT (1990) from its ROMs ([Raising an original from its
ROMs](original-road-data.md#raising-an-original-from-its-roms)), after Stage BR.

Its board is [Stage BR](#stage-br--big-run-from-the-roms)'s. MAME calls CISCO HEAT's pictures imperfect, so how it looks
is compared with K's videos or a cabinet's records. Its hilly city streets are what it is known for, so how its heights
are raised goes to K.

## Stage TA — A TAITO original from the ROMs

Stage TA raises a TAITO original from its ROMs ([Raising an original from its
ROMs](original-road-data.md#raising-an-original-from-its-roms)), CHASE H.Q. or another as K chooses, after Stage CS.

The candidates come in two families (K's research kit, 2026-10-23): CHASE H.Q. (1988), S.C.I. (1989) and CONTINENTAL
CIRCUS (1987) on Taito's Z system, and TOP SPEED (1987; FULL THROTTLE in Japan), each with two 68000s and a Z80 for
sound. The 68000 tools serve; checking by running needs the two 68000s run together.

## Stage DT — DRIFT TUNED trial vehicles

On hold (K, 2026-10-27), and it may be stopped. What is on main stays: each vehicle's tire and wheel slip protection,
TCS and MSR apart from ABS, the shifts' rule, the tires' sliding ratio, and S13's and AE86's DRIFT TUNED. DT-7 does not
go to main: its PR is closed unmerged, and its branch `claude/busy-ritchie-lvtbpo` is kept, to be brought up to main if
the stage resumes. DT-3 and DT-8 (where the drift style is used) wait with it. If K stops the stage, one PR deletes what
only drifting uses (S13's and AE86's DRIFT TUNED and their tires, DT-3's plan), not the physics and rules every vehicle
has.

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

- Every original: what a vehicle passing over a lying picture shows, of the same kind as a movable object's knocked
  picture and never a material, is not decided (K, 2026-10-25): OUTRUN's drawings 1 (grass), 3 (sea and lakes) and 13
  (patches) set the road's surface effect for 12 frames while the car is on them, which draws a spray at the car and
  changes no driving ([Effect](outrun-road-data.md#strips-and-patches)); the other originals' are read when one is made.
  A draft that holds a position, kept where it was through the ROMs' positions when the canon changes and stopping the
  conversion where it cannot stay, comes first if people begin correcting pictures or placements. The Route reaching
  behind a circuit's entry, so that a start's camera may stand in the lap's last Section (K, 2026-10-25), is built when
  a circuit's grid needs it.
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
  made the finish gates' posts over lanes a and f are shown in drawings; whether a reference run hits them is checked
  then. K decides how the objects thrown or broken when hit (collision classes 3 and 11 to 17) show it; until then
  they stand with no body (K, 2026-10-26). K decides whether a run through all 16 stages is made, and if it is, whether it runs the four courses in turn
  or one course joining them (K, 2026-10-26). At a leg's start the original adds figures beside the 959 by the leg
  before's result (0xC2B0, 0xC318, by 0x60B72 and 0x60B76); they are not made.
- ENDURO RACER: the ENDURO RACER series itself (bikes, rivals,
  colors, pace and time extensions), sounds and music, the motion of what moves, the ending's text, and the product's
  pictures drawn again.
- SUPER MONACO GP: the SUPER MONACO GP series itself (cars, rivals, laps, rank limits, time and the overcast set),
  sounds and music, the motion of what moves, the start's signal, the mirror and the cockpit, and the product's
  pictures drawn again. A format holding pictures at the original's pixel size would make its pictures smaller (most
  are the 16-unit class, each of the original's pixels about 4 × 4 texels), and is not made now.

When the product's pictures are drawn again, a picture's shadow is cast from its shape, by one rule as a vehicle's is
cast from its own (K, 2026-10-28): an original's pen 10 and the shadow pictures it draws apart serve only a course
raised from its original, and the light's direction and the shadow's density are decided then.

At the top speed the cars fly at most crests (EX-G2: TURBO OUTRUN's 130 flights, the longest 180 m); K decides the
criterion later (K, 2026-10-26). Once it is decided, the mainline adds it as a rule of its own laid over the pieces
afterwards, not in the researcher's solve. How the vehicles land from ENDURO RACER's jumps K decides later too; until
then no scenario drives ENDURO RACER. The crests' and dips' radii take no tool: `gradeReport`'s flights count the
crests sharper than v²/g, and the dips' side joins it when K takes up the crests.

Left by Stages ER and MG to [Stage GR](#stage-gr--the-originals-courses-mended) (K, 2026-10-21):

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
