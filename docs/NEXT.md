# Next task checkpoint

## Current state

Each line is one area as it stands, with the document that owns it.

- **Scene and runs.** One compiled graph scene serves TSUKUBA and the courses raised from the originals' ROMs with RACE,
  TIME ATTACK and FREE PLAY runs. Without DEV, FREE PLAY offers the courses a series runs (TSUKUBA, and for now the
  originals of the ARCADE TRIBUTE series delivered); the other originals' courses, in no series, are DEV's
  ([Architecture](architecture.md), [Run setup](content-and-gameplay.md#run-setup)).
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
- **Courses of the originals.** OUTRUN's twelve roads, SUPER HANG-ON's four courses, TURBO OUTRUN's, ENDURO RACER's,
  POLE POSITION II's four, FINAL LAP 2's four, CHASE H.Q.'s ten, TOP SPEED's seven, CONTINENTAL CIRCUS's eight and BIG
  RUN's six courses are raised from the ROMs by the road data tool ([Original road data](original-road-data.md), [Courses of the
  originals](#courses-of-the-originals)). Stage EX has put them on their road path P: their plans raised from the ROMs'
  heading tables, their widths unrounded and joined by one monotone cubic, their material ended at the plan's clearance
  and their ground at each original's own limit beside the road; OUTRUN's forks and goals are the original's, with
  parting gates, and the lying pictures have no material. What remains is [Courses of the
  originals](#courses-of-the-originals)' list.
- **Features no course uses.** BRANCH (forks, seam joins and signs shown by a fork's choice), solid walls (TSUKUBA's
  walls are looks alone), open course limits, a grid longer than 16 slots (`startGridSlots` 32), movable objects (and
  their knocked pictures), and the `WET_ASPHALT`, `SHOULDER` and `SNOW` materials (`SNOW` for RALLY STAGE's WINTER) stay
  in the engine ([Content and gameplay](content-and-gameplay.md), [Stage RM](#stage-rm--branch-tsukuba-and-the-walls)).
  So do three of the format's general constructs, each part of a rule every course follows: `text` Strips, the road's
  lettering, for the product courses to write; a Strip's `"transparent"` color, the colour rule's eraser of earlier
  color; and the environments' `repeat`, the one repeat every element list takes.
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
- **Front end and HUD.** TITLE to RESULT inside the frame, the selection's rows of cards ([Card UI](#card-ui)), the
  HUD's fonts, the player record and `dev=1` ([Browser](browser.md),
  [HUD design sources](image-assets.md#hud-design-sources)).
- **Authoring.** One authoring core serves the build, the CLI and the workbench with its course editor; loading compiles
  in slices ([Workbench](development.md#workbench),
  [Course authoring operations](content-and-gameplay.md#course-authoring-operations),
  [Course loading](architecture.md#course-loading)).

Next PR: in [Stage RM](#stage-rm--branch-tsukuba-and-the-walls), and beside it [Stage
BR](#stage-br--big-run-from-the-roms)'s raising, BR-8 next; later [Stage CS](#stage-cs--cisco-heat-from-the-roms);
[RD-6e](#courses-of-the-originals) once K's recordings come; then [Stage 16](#stage-16--produce-product-courses).

Implement the stages in order. Each PR's restart instructions supply its detailed requirements.
Topic contracts belong to the topic specifications; development and release procedure belongs to AGENTS.
PRs hold rationale and verification evidence. Each stage first consolidates the structure its later PRs consume.

## Stage PS — Product pictures and courses (ENDURO RACER first)

K's decision of 2026-11-06: ENDURO RACER's product course (`enduro-racer-product`) was removed (NM-14), and no product
course or picture is made until K starts them again. The tools (the sprite editor, the course editor and baking) and
the product's words, rules and procedures stay as they are.

K's instruction, 2026-10-29, replacing the public-picture trial that ChatGPT Work made in PS-0 to PS-5 (#1346, #1348,
#1352 to #1356). This stage makes the place where product courses and pictures are made, and tries it on ENDURO RACER:
its 50 unmirrored object pictures redrawn by K with generative AI, and its course mended by K. Far scenery is outside
this stage. K's decision of 2026-10-30: the stage stays open, with no end such as "the product course uses no
original picture", since other originals are redrawn after ENDURO RACER. It holds the product tools, procedures and
picture rules; a picture rule a new course needs is added here as an item, and done items leave as now. Applying
K's archives is ordinary work ([Product pictures, step by step](development.md#product-pictures-step-by-step)), not an
item. It runs alongside the other stages, with the EX auditor's terms (2026-10-29):

- Stages TR and AU7 have closed (AU7 on 2026-11-02). The originals lie in `content/originals/` (with `courses/` and
  `images/`); every PS read finds a name's path through `tools/authoring/content-places.ts` (`coursePathIn`,
  `imagePathIn` and the rest), and writes (product pictures to `images/`) stay where they are. Road data's ROM reading
  (`readZip`, `RomSet`, each original's `-rom` module, ENDURO RACER's `-sprites`) takes bytes and reaches no Node
  module, which the dependency check keeps; the sprite editor's ROM extract imports it. Conversion outputs no command
  writes are removed by the set of files the conversions write, so nothing of this stage's goes.
- The crests rule applies to the original courses alone, a course's V going in course by course ([Courses of the
  originals](#courses-of-the-originals)). This stage touches nothing of the originals' canon.
- A PR that raises a format's version moves the documents people hold (TSUKUBA, and the product courses and pictures)
  in the same PR, as TR-1 did TSUKUBA; this is the main line's rule, and this stage does not write it again.
- A PS PR that newly imports something of road data, or deletes a file that imports it, tells K. Nothing is added
  inside road data except as agreed with the main line's auditor.

K's decisions of 2026-10-29 on the first PRs: an original picture used only mirrored (`enduror-10bc2`, `111f8`,
`1154a`) becomes a product picture in the course's orientation (PS-10a); while AU7 is awaited, the other groups
below go first. K's decision of 2026-10-30: the review page (`review.ts`, `public-pictures.html`) went with the trial's
parts in PS-10c; comparing came back in the sprite editor (PS-17b). K's decision of 2026-10-30: pictures the original
splits into pieces (the gate banners and the like) can be baked into one product picture in the sprite editor, its
pieces without bodies alone (Baking below).

### Words

The stage's courses and pictures are of two kinds alone (K, 2026-10-29):

- An **original course** or **original picture** is one the road data tool raises uniquely from the ROMs: today's
  courses of the originals (`enduro-racer.course.json` and the rest) and their pictures (`enduror-*` and the rest). It
  is never edited by hand; only road data's rules change it. It is played in DEV alone and is in no series, to the end,
  but for one exception: until POLE POSITION II's, ENDURO RACER's, SUPER HANG-ON's, OUTRUN's, TURBO OUTRUN's and FINAL
  LAP 2's product courses are made, their ARCADE TRIBUTE
  series run their original courses, so that K can try an ARCADE TRIBUTE's play for the card UI (K, 2026-11-09 and
  2026-11-10); their classes move to the product courses when they are made.
  AU7 moves the originals to a place of their own; product courses and pictures, and the other hand-made ones (TSUKUBA,
  the signs), stay in `content/courses/`, `content/images/` and `content/sprite-sources/`, never mixed with them.
- A **product course** or **product picture** is an original's pictures, course and placements mended by hand; the
  game ships these. Write the two words: alone, `product` keeps the compile's meaning (its products). A product course
  is `<original id>-product`, a product picture `product-<original picture name>`. A product course is in DEV alone
  until K puts it in a series.

No other word (public, canonical, provisional, a copy of the original) is used; the trial's `public` names mean
product and are renamed below. Nothing copies originals at will. The build and the products read no original: an
original is read only by a product course's start K decides (none now: ENDURO RACER's, started by PS-10b, PS-24, PS-28
and NM-13, was removed by NM-14), the sprite editor's comparisons (pictures 1 to 3)
and the making of a product picture from it. In the end the repository holds the game,
the product courses and pictures (K's PNGs, recipes and saved images) and four browser tools.

K generates every picture; the implementer generates none and calls no image-generation API. K decides each
picture's scale, anchor (across and the ground row), collision width, shadow and dither in the sprite editor, and
mends the course itself in the course editor. K's archive comes to the implementer or the auditor, who applies it as
[Product pictures, step by step](development.md#product-pictures-step-by-step) says.

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

### Product courses

- No product course is in the repository now. PS-10b started `enduro-racer-product` (shown as
  `ENDURO RACER PRODUCT`) with the original course's content, PS-28 and NM-13 made it again from the original
  (versions 46 and 47), and NM-14 removed it (K, 2026-11-06). A product course is started from its original course's content when K decides,
  and is then only mended: a later change of the original reaches it only when K takes it. DEV lists courses in the
  order AU7 reads the two places in; this stage adds no ordering.
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
  (`product-enduror-111f8-mirrored`), without `mirror`; its piece's `image` is the `-mirrored` original, so its shadow
  is cast the right way (its `transform` holds no reflection).
- The recipe (version 6) and import are described in [Sprite operations](image-assets.md#sprite-operations). A picture with
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
course, remembered by the browser; none now) heads it. One list shows the pictures that course
uses (placements, `-mirrored`, a movable object's `knocked`; a mirror pair as one), another every other sprite source.
A picture's kind is the data's, never its name's: an original is a course image in the originals' place, a product
picture a sprite source with `basedOn`, any other sprite source general.

- A general sprite source has everything the Sprites module does (new source; crop, hide, show and anchor tools;
  width; Generate palette; Palette from each import; Clear mask; Write course image; the checks), through the moved
  `sprite-source-view.ts` and `sprite-preview.ts`, and shows pictures 4 and 5.
- An original or product picture shows five pictures at one scale with their anchors aligned: (1) the ROM extract, only
  after K drops the ROM zips on the page (ENDURO RACER's `enduror` and `endurobl`), raised in the browser by road data's
  ROM reading functions with the ROM's own pixels (pen 10 included) at the original's pixel size in the default palette,
  sent nowhere and kept out of the working state;
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

### Baking

K's rule, 2026-10-30. The original places some single things (a gate's banner) as several pieces, for the hardware's
sake. The sprite editor bakes such pieces into one product picture placed once. Since K's decision of 2026-11-06 the
originals' conversions bake such things themselves from the ROMs ([Things of several
pieces](original-road-data.md#things-of-several-pieces)): an original course comes with them as one picture, or, where
the original reuses a standing piece of them, as their pieces with one band baked of their banner or girder (NM-15c);
baking stays for product pictures.

- **A group** (first step alone): in the chosen product course, two or more pieces without a body (`body: null`) at the
  same `at`, the same `unselectedLink` and the same kind of `lateral` (the same boundary or lane), siblings in one
  element list (the same `repeat`'s). A piece with a body (a pole) is in no group and stays a picture of its own. In
  ENDURO RACER's course, before NM-15b joined them: the start banner and the goal banner (3 pieces each, 3.37 m high,
  their middle pieces differing) and the four checkpoints' banners (3 pieces, 2.74 to 2.84 m); SUPER HANG-ON's gates,
  whose poles have no body either, were whole groups. Since NM-15c the gates' corners and banner come as one band over
  their legs, and ENDURO RACER's banners and boards as one band over their posts.
- **One entry per arrangement.** Groups with the same pieces at the same offsets (within 0.1 mm), wherever they lie,
  are one entry with their count (ENDURO's checkpoints, ×4); groups whose pieces differ only in palette join it as
  color variants.
- **Before baking**, the entry draws the pieces together as they look now (each piece's current picture, original or
  product, with its palette, offset and height), overlapping in the order the game draws things at one depth. Each
  piece can be left in or out and moved by texels (dragging and arrow keys). The baked picture's anchor defaults to
  the middle of the pieces' outer edges across and the lowest piece's anchor row (its height becomes the new
  placement's `groundOffset`); its name to `product-<leftmost piece's original>-baked`. K may move the anchor and
  change the name (starting `product-`, unused elsewhere).
- **Baking** writes in one edit:
  - A product picture (a sprite source) whose PNG is the composite's master pixels (40 texels/m, each piece's offset
    rounded to a texel). Its recipe holds `widthMeters` and the anchor; palettes chosen once by the color rule and
    written named, with a color variant for each combination of the pieces' palettes found, made by the alternate
    palette rule extended to pieces and named from the combination (`p045+p046`); `shadow: "board"` when a piece
    standing on the ground (`groundOffset` 0) has a shadow, else none, as K may change; and `basedOn` listing each
    piece's original (a product piece's own original), `bodySha256` and `transform` from this PNG's pixels to that
    original's body, with what restores the piece's placement (picture name, palette, offsets across and up from the
    anchor, and K's move).
  - The product course: at every site of the entry, the pieces' placements give way to one placement of the baked
    picture, with the site's color variant as `palette`, the pieces' `at` and `unselectedLink`, the anchor's `lateral`
    and `groundOffset`, and `body: null`.
- A baked picture is listed, exported, imported and redrawn as any product picture (`PRODUCT` until redrawn). Its
  pictures 2 and 3 are the pieces' originals composed through their `transform`s; it is `STALE` when any piece's
  original changes.
- **Revert picture** of a baked picture deletes its files and puts the pieces' placements back at every site from what
  `basedOn` holds, after K confirms when the picture has been redrawn and the redrawing would go.
- **Format and rules.** `basedOn` becomes a list of pieces (recipe version 6); a picture from one original lists one.
  Composing pieces at their offsets and the alternate palettes of pieces are one `tools/graphics` function each, which
  the editor alone calls: the build and `apply-changes` import the saved PNG as any other.
- ENDURO RACER's banner pieces (`enduror-106e0`, `10712`, `10744`, `1170c`, `110a4`, `110d6` and `11108`) are gone:
  NM-15c bakes its start's, goal's and checkpoints' banners and boards into one band each over their posts, which are
  pieces again.

### Order

Each item is one PR with one purpose, released by AGENTS; the game stays playable after each. Topic documents describe
what is implemented, so each PR updates what it changes there; the vocabulary entries for original course and picture,
product course and product picture come with the PR that introduces each name. Each PR reports the repository's growth; a product
picture or course PR lists the pictures and courses it changes. Large PNGs are not committed (the saved size above), no
original picture is made a product before it is used, and the 23 MB already pushed stays in the history, which is not
rewritten. ROM zips, dumps and extracts stay out of Git, PRs and Pages, the editor's extract in the browser alone. No
test is added: checks run once, in admission and `apply-changes`.

The groups go in this order, each when its condition holds; while none can start, ask K (K, 2026-10-30):

1. Done: PS-6 to PS-10c, PS-11, PS-11b, PS-12, PS-12b, PS-13 to PS-14d, PS-15a to c, PS-16a to d, PS-17a to d,
   PS-18a and b, PS-19, PS-19b, PS-21, PS-22a to d, PS-23a to d, PS-24, PS-25a1 to a3, PS-25b, PS-26a, b and d,
   PS-26c1 to c5, PS-26e, PS-26f1 to f3, PS-26g, PS-26h, PS-28, PS-29, PS-30, PS-31a, PS-31b, PS-32a and PS-32b.
2. Now: none, until K starts product courses and pictures again (K, 2026-11-06).

A PR that leaves part of its item undone names what it left in the PR, the report and here.

### Stops

Stop for K: when `apply-changes` stops on a digest, an original, or an import or compile that fails;
when the next group's condition does not hold and work would wait; before another original's products; before any
waiting item below.

### Waiting for K

None starts before K decides:

1. **Another original's products**, when K starts that original, made as K and the auditor then decide. OUTRUN's
   twelve courses hold the same stages in separate files (about 53 MB in all), so how stages are held is decided
   first; check whether TURBO OUTRUN and the others do the same. An original whose ROM extract the editor shows has
   its `-sprites` module added to the dependency check of ROM reading (no Node module), as agreed with the main line's auditor.
   An original's things at one distance are drawn in the order its conversion writes them, and the originals change
   only by their V (GR-5), so where a sign lies under a pole or building written after it (135 groups in TURBO
   OUTRUN, 1 in ENDURO RACER, not all wrong; OUTRUN's 16, a board without a body written before a solid one it overlaps
   at one station, are now in its sprite list's order, and ENDURO RACER's, its start's and checkpoints' right banners
   before their poles, are now bands written in its draw list's order among their posts, NM-15c), how a product course
   mends it (reordering in the course editor, an order baking chooses) is decided before that original's products
   begin.
   The course editor's findings take over 5 minutes on eleven OUTRUN and TURBO OUTRUN originals (`outrun-e` the
   longest) after PS-31b and PS-32b; K's decision of 2026-11-03 stops the work towards a minute a course there, since
   K mends the game's courses (TSUKUBA, about 20 s in the browser) and never the originals. How fast
   they need to be is decided when that original's products begin: going on means following, for each candidate,
   which Boundaries an element's reading looked at, and reusing the readings of the Boundaries it leaves.
2. **The very end**, after every product: the originals' courses, pictures and racing lines, road data and the other ROM
   tools with their documents, the originals' place (whole), the recipes' `basedOn`, the sprite editor's pictures 1 to 3
   and the refusal of the originals' place leave the repository, kept by K (under `reference-media/originals/`, say, as local originals are). First check that
   no product course uses an original picture and that no product picture still holds original pixels. K decides then
   what becomes of far scenery (an original too) and whether names drop `product`.
3. **The working state in the course viewer**, as K decides after using the four tools.
4. **Baking pieces with bodies**, if K decides it is wanted. A placement's body may now hold several parts (NM-15a, K,
   2026-11-06), so a baked picture's placement can keep its pieces' bodies as its parts; no placement without a picture
   is needed.
5. **The HUD pictures' colors**: whether they take the sprite sources' color rule in place of their own k-means, as K
   decides.
6. **The compile worker's memory**: it keeps one compile's result (about 2.8 GB) and adds about 0.8 GB while the next
   compiles (the course editor alone peaks at 4.4 GB, beside the sprite editor 7.8 GB). It is no leak; if K's PC
   suffers (a tab lost), K and the auditor decide the mending.
7. **Picture rules a new course needs**, added here when they arise.

## Originals with a sprite road surface

The road data tool raises an original whose road layer draws its road surface line by line (K, 2026-11-03). An original
whose road surface is drawn with sprites waits for a future model of its own, provisionally SUPER OUTRIDE 2: its
boundary, SUPER MONACO GP frozen at `8beb28f7` (conversion version 36), what was learned, the candidates, what the
model needs and how to start it are in [The sprite-road model](sprite-road-model.md).

## Stage RM — BRANCH, TSUKUBA and the walls

Stage RM makes what Stage PG left to later stages in [Courses of the originals](#courses-of-the-originals). BRANCH
and the walls go, so their follow-ups (forks' transfer, a fork's conditional bodies, wall Strips and the walls'
open decisions) are not kept.

## Stage BR — BIG RUN from the ROMs

Stage BR raises JALECO's BIG RUN (1989; `bigrun`) from its ROMs ([Raising an original from its
ROMs](original-road-data.md#raising-an-original-from-its-roms)), and [Stage CS](#stage-cs--cisco-heat-from-the-roms)
CISCO HEAT (1990; `cischeat`) after it, each from its MAME parent set (K, 2026-11-05). The two share one board and were
studied together beside Stage TA's raising (K, 2026-11-08), as every stage raising an original starts ([How a stage
starts](original-road-data.md#0-rules)); K decided from the studies (2026-11-09).

The study read the board against MAME's driver (MAME's master `179cfab5`): four 68000s, the main, two road CPUs and the
sound's, whose program MAME decrypts and which is not read, as no road needs it ([No
decryption](original-road-data.md#rules-of-the-originals)); the main's and the road CPUs' are plain. Each road CPU
writes one road layer, a line of the road ROMs' pictures to each line of the screen, scrolled and colored, so the two
are inside the boundary. Each road CPU's ROM holds every stage's two roads, each a table of straights and arcs, an arc
its radius and side, with the position and heading in the plane where each starts, and a 3D road of vertical arcs and
straights, both by the distance along the road. Each road CPU draws one of them, and the car is on the one whose centre
is nearer. K has no MAME (K, 2026-11-05): what was to be seen running is read statically, or run on `cpu-68000` where
one CPU's routine suffices, and no research tool runs the four CPUs together (K, 2026-11-09).

K's decisions (2026-11-09):

- **BIG RUN's courses** are its six stages, as the [course texts](#course-names-and-descriptions) name them: STARTING
  RUN, SPECIAL STAGE 1 to 4 and VICTORY RUN (`big-run-starting-run` and so on), each from its start to its goal, 2.84 km
  in the first and the last and 4.89 km in the others.
- **Its two roads** are drawn and driven together where both go on, as OUTRUN's are before its forks: [two
  roads](original-road-data.md#two-roads) whose centres each lie at their own lateral from P, not w either side of their
  middle, P the second road CPU's road (K, 2026-11-09). Each object stands by the road its record's flag names, its
  lateral measured from that road's centre: P for the second road's, P plus the first road's lateral for the first's.
  They part and meet again in SPECIAL STAGES 1, 2 and 4, and STARTING RUN starts with them side by side. Where one
  leaves and does not come back, VICTORY RUN's first road going on straight where the second turns 90° from 2.47 km, the
  course holds the other and draws the one that leaves as the road not taken, its objects with it, as far as the
  original draws it; VICTORY RUN stays one course, as the course texts have it.
- **Its scale across** is its own car's (K, 2026-11-09): at the depth the original draws it, its straight picture is as
  wide as a real car of its kind in 1989, 1.76 m, the Peugeot 405 Turbo 16 Grand Raid's, its chapter citing
  Ultimatecarpage. The study measured the picture 71.7 units wide, so a unit across is 24.5 mm, 1.86 times a unit along
  (13.2 mm). Its courses' PR measures the picture again, and K adjusts the scale at the end, as every original's scale
  across. Up is the plan's own scale: its heights are a 3D road in the plan's units, and its screen draws a unit up as a
  unit across, its 256 × 224 shown at 4:3.
- **Its plan** is its tables' own arcs ([Plan, profile,
  cross-section](original-road-data.md#5-plan-profile-cross-section)): an arc's angle is its length in the distance
  column over its radius, its side the record's flag, and the table's headings and positions check it, within 0.03° and
  14 units; the record's degrees are rounded and are not read. A shared rule lays a plan from a table's arcs, a
  heading's jump between two straights laid as a turn at the lanes' least radius, as [a heading table's
  turn](original-road-data.md#plan-from-a-heading-table) is.
- **Its heights** are a 3D road in the ROMs ([Profile from the original's
  screen](original-road-data.md#profile-from-the-originals-screen)), times f = min(its lens ratio, 0.25 ÷ its steepest
  grade): 0.537 for its steepest 25°, its lens ratio 2.7 to 3.1, so that SPECIAL STAGE 2's 87 m become 47 m. Its crests
  take V as every course's ([Crests](original-road-data.md#crests)).
- **Its tick** is its board's frames a second over its main loop's (K, 2026-11-08): the loop waits for interrupt 4,
  which MAME gives every second frame, so a tick is 1/30 s, the chapter stating that interval as an assumption. Its
  program agrees: its waiting clock and its last seconds' warning count 30 ticks a second, while its race clock counts a
  shown second in 24 to 28 ticks at Normal, the factory setting, a little ahead of time.
- **Its skies** are baked ([Sky baking](original-road-data.md#sky-baking)) from its two tile layers, the near turning 12
  pixels a degree and the far 8, each laid round from its seam, as neither turn (4,320 and 2,880 pixels) is a whole
  number of its pictures.
- **Its materials.** Its ground's is read from its color (`groundMaterial`), and a ground the rule makes `WATER` that is
  no water stops the conversion for K, as in Stage TA. Its road's is as the study's table of its sets of road colors has
  it: `ASPHALT` for its towns' paving (STARTING RUN's first 1.1 km), `DIRT` for its desert's road and `WATER` for its
  river crossings, each set named in its chapter.
- **Its order.** It is raised beside Stage RM now that Stage TA has closed, and CISCO HEAT after it.

K decided (2026-11-11):

- **Its two roads' heights.** The original draws each road at its own heights, each road CPU its own layer, and this
  game's one road layer draws one road's: the course takes the second road's heights, and the first's through SPECIAL
  STAGE 2's parting in height, where the two share their plan, the first lies below and the original holds the car on
  it. Where the two share their plan and part in height, the other road is not drawn; where they lie apart, both are
  drawn at the course's heights. Where the original's road lines leave a side transparent and show beneath it ground
  more than 1 m below the course, or its background, the ground on that side is transparent (a Strip's `"transparent"`
  color); if its data does not tell where, where the other road lies more than 1 m below. Through it the boards whose
  foot is below the ground ([Rules of the originals](original-road-data.md#rules-of-the-originals)) are seen before its
  sky's rows below the horizon: a cliff's faces, and the other road's standing objects at its own heights (a negative
  `groundOffset`). Its lying objects there are not placed, as no picture folds below the ground, and where it lies
  above, as through SPECIAL STAGE 2's parting, none of its objects is, as that road is not drawn. No construct is added:
  the format and the engine draw all of it.
- **Its lanes** are its town paving's wherever its road goes ([two roads](original-road-data.md#two-roads)): its
  desert's road, as wide at every depth, paints no lane line.
- **Its tables' check** is record by record: each record is laid from the table's own heading and position where it
  starts and taken against the next record's, within 0.03° and 14 units, and a jump is a record's heading departing by
  more than that from the heading its record before reaches. Laid on from the first record's, its plan departs further
  from the table's points, by what its records' small departures add up to, which its chapter reports.

Defaults for K to confirm before the stage closes, each its PR's:

- **The sky's color below the horizon** (BR-5). Its ramp's first row's, the row at the horizon: the road layer draws
  the road there and gives the sky no color of its own below it, so the horizon's row goes on down.
- **A scene's steps up and down** (BR-5). Not laid: a sky lays a picture at one height, its scene's own row offset
  ([its skies](big-run-road-data.md#its-skies)), while the program moves the plane along 21 of the 26 scenes it shows
  by their tables of steps, 2 to 80 rows each.
- **A second road from its own table** (BR-4b). Where the two tables hold one point and one arc, the two roads are one.
  Where they part, the second is laid by its own arcs from P's point where they part, and where the tables' points meet
  again its miss of P there is spread straight along P over the parting, so that it meets P where they do; one that
  never meets P again keeps its own arcs. Where the two start apart, the second is laid from its own first point, taken
  from P's, its miss where they first meet spread the same way. So the two are one, part and meet where the original's
  tables have them, whatever their records' small departures add up to.
- **A 3D road's grade** (BR-6a). A record's grade is the sine of its angle, as the table's heights rise along its
  positions, a vertical arc's changing evenly to the next record's; the steepest is taken among the records starting
  before each goal, 25°, so f is 0.537 as K decided, while SPECIAL STAGE 1's last record bends on to 30° past its goal.
- **The town's entries in every stage** (BR-6b). Entries 1 to 24 of each road layer's palette are STARTING RUN's in
  every stage, as a game plays its stages in turn from it and no later stage loads them again.
- **The eight partings in height** (BR-6). As K decided on 2026-11-11: over the five rivers the course crosses on the
  second road, its clear sides show the sky's rows below the horizon where the original shows the first road's water
  below. The board takes no second road layer for now, which would draw that water ([Stage
  CS](#stage-cs--cisco-heat-from-the-roms), K, 2026-11-12).
- **A course's end** (BR-6c). Its goal, and on to the first record of either road past it, at most 2,000 positions:
  enough for the finish, short of SPECIAL STAGE 1's fall past its goal.
- **The two roads' order** (BR-6c). Road 2's picture over road 1's, as MAME draws the second road layer over the first at
  one priority; the rows' priorities, set from both roads' flags, are not read.
- **Where pictures leave the lanes no material** (BR-6c). The lanes keep the held road's surface's material, and a clear
  run and the ground between the roads `SAND`; the car drives on there, as the original lets it off its road.
- **Its limits** (BR-6c). 512 units, a line's half, beyond the outermost road's centre on each side, where the original
  draws its pictures to; the program's own limit to the car's lateral is not read.
- **The road not taken** (BR-6c). VICTORY RUN's road 1 is drawn, with no material, as far as it heads within 60° of P,
  where its lateral can be taken across P.
- **Its skies** (BR-6c). A sky's change laid over its fade's 48 ticks at 200 km/h; a sky's yaw its back plane facing its
  middle column where its scene loads, the front plane's overlap as when both load together (BR-5).
- **Its own car's width** (BR-7). Measured again from its frame and zoom tables: 85.0 units, where the study had 71.7
  (its zoom taken twice), so a unit across is 20.7 mm; K adjusts it at the end.
- **Its objects' places** (BR-7, BR-7c). An object's lateral is its picture's left edge and its height its top edge, as
  the program draws its sprite down from it, its board's base its drawn height below; its lateral in units across and
  its height in units up, a unit up 6/7 of a unit across, as its pictures are drawn at the screen's pixel; a sprite's
  pixel 1.992 units, the zoom at the nearest distance; its sway (`$f6048`, `$f604a`) not taken; its pen 0, a shadow or a
  color, transparent.
- **Its objects' hits** (BR-7). An object in the program's list of things the car meets (flags' bits 9 and 10) has a
  body as wide as its picture's colored columns; how the program meets them is not read.
- **Objects not placed** (BR-7). Those of kinds other than 0, which the program moves or picks, and those of a sprite
  of its shadow alone; the conversion reports how many each course leaves.

The PRs, in order:

- **BR-8** The stage closes, its scale across left for K to adjust at the end: this section goes, Stage CS taking what
  it needs of it, what is left goes to [Courses of the originals](#courses-of-the-originals), and BIG RUN's class goes
  into [the product](product.md#arcade-tribute).

## Stage CS — CISCO HEAT from the ROMs

Stage CS raises JALECO's CISCO HEAT (1990) from its ROMs ([Raising an original from its
ROMs](original-road-data.md#raising-an-original-from-its-roms)), after Stage BR, whose studies read it with BIG RUN.

Its board and tables are [Stage BR](#stage-br--big-run-from-the-roms)'s, one layer reading both, its headings 65,536 a
turn where BIG RUN's are 16,384, and its tick is BIG RUN's. MAME calls CISCO HEAT's pictures imperfect, so how it looks
is compared with K's videos or a cabinet's records.

K's decisions (2026-11-09):

- **Its courses** are its five stages, one a course, as the [course texts](#course-names-and-descriptions) name them
  (`cisco-heat-stage-1` to `cisco-heat-stage-5`); its two roads are BIG RUN's, the one that leaves at STAGE 5's end the
  road not taken. In STAGE 5 they change their order across eight times, its first road on one side of its second where
  they run side by side and on the other where they part widest, as BIG RUN's and its other stages' never do; [the lanes
  over two roads](original-road-data.md#two-roads) take either order.
- **Its heading's jumps** between straights (4° to 20°) are laid as turns by [the plan from a table's
  arcs](original-road-data.md#plan-from-a-tables-arcs), and where its first road jumps back onto its second at the end
  of their parting, a Section is cut.
- **Its heights** are no 3D road times f: its grades pass −90° and its stages fall by up to a fifth of their length,
  which its camera, tilting with the road, never shows. They are read back from its screen as [Profile from the
  original's screen](original-road-data.md#profile-from-the-originals-screen) reads a screen alone, the rule extended to
  a camera that tilts with the road. Its 59 places steeper than −40°, in STAGES 1, 2, 3 and 5, show as crests the road
  falls away beyond and as climbs ahead, never as walls, as the study saw its road CPU draw them.
- **Its scale along** is its program's: its car gains a position a tick for each whole unit of its speed, which its
  speedometer shows times 1.75 km/h, so a position is 16.2 mm (1.75 / 108 m), 1.225 times BIG RUN's. Its program scales
  the gain on an arc by the car's lateral and pushes on a car that falls behind; both are its handling, not its course,
  and change no length.
- **Its scale across** is its own car's, as BIG RUN's: the sedan, one of the two cars a player chooses from, as wide as
  the Ford LTD Crown Victoria of 1990, 1.969 m, its chapter citing Edmunds. Its straight picture, 79 pixels wide, is
  drawn at its own size where its road shows 0.81 to 0.82 pixels a unit, so it is 97 units wide, as wide as the same car
  drawn as a rival near the camera, and a unit across is 20.3 mm, 1.25 times a unit along; K adjusts it at the end, as
  every original's scale across. The other car, of the Nissan 300ZX's kind, is 77 units wide.

K decided (2026-11-12):

- **Its two roads' heights** are taken as BIG RUN's are ([Stage BR](#stage-br--big-run-from-the-roms), K, 2026-11-11):
  the course takes the heights of the road the original holds the car on, and where the two lie apart both are drawn at
  the course's heights. Both roads' heights are read back from its screen by one rule, so that where one lies more than
  1 m below the other is taken between two readings alike.
- **Its skies** turn with the road at one rate, as every course's do: its program shifts its planes only through a
  curve, by its speed and up to a limit, and back on a straight, so its sky is baked as one turning a fixed number of
  pixels a degree, the rate at which its planes shift through its curves at its default speed, its chapter giving how.
- **One road layer.** The board takes no second road layer for now: its courses are raised on one road layer as BIG
  RUN's are, its two roads where they lie apart drawn at the course's heights, and its courses' PR reports how far apart
  in height its two roads lie where they part. A second road layer, which would draw them at their own heights and the
  water BIG RUN's first road shows below its second over its rivers, would be a stage of its own, its courses and BIG
  RUN's raised again then.

The stage starts by reading how its screen draws its two roads where their order changes, which one's paint shows over
the other's, and its courses' PR measures its own car's width again.

Defaults for K to confirm before the stage closes, each its PR's:

- **The rule's words** (CS-1). [Profile from the original's
  screen](original-road-data.md#profile-from-the-originals-screen)'s cameras are one reading camera, its focal length,
  pinhole and behind, level or tilting with the grade under the player as the original's is, each original's camera one
  of it; CISCO HEAT's tilts, at this game's focal length where its pinhole lies. No other original's reading changes.
- **Its camera's pitch** (CS-1). Its road CPUs pitch the camera by the held road's angle under the car, and its main
  program adds a pitch where a record of its first road's list gives one, gone within 16 frames
  ([research](research/cisco-heat.md#its-camera)); its screen is read at the road's angle alone.
- **Its skies' turn** (CS-2, CS-3f). Its planes slide through a curve at its highest top speed, 160 units a frame,
  while the car turns through its roads' sharpest common curves, 7,000 positions ([its
  skies](cisco-heat-road-data.md#its-skies)): 5.73 pixels a degree for the back and 11.84 for the front, its back
  plane's pictures laid about 1.4 times narrower than the original draws them, as BIG RUN's 1.9; the radius its roads
  turn through longest, 40,000, would lay them 7.8 times narrower.
- **A jump beside an arc** (CS-3g). [The plan from a table's arcs](original-road-data.md#plan-from-a-tables-arcs)
  lays a heading's jump as a turn added to the records either side, straight or arc, over the fewest whole positions
  alike either side at which the curvature they add up to keeps the lanes' least radius; a jump between straights is
  the case of it the rule laid before. It lays STAGE 5's 20° jump of both roads at 351,908, after an arc of 65,000
  positions; no other original's reading changes.
- **Its screen** (CS-3l). Its road CPU's rows as its program draws them from its tables ([its
  heights](cisco-heat-road-data.md#its-heights)), its nearest row on its screen's last, a frame every 64 positions of
  the car (about a metre), each stage's road read from its start to its end, its goal and on to the first record of
  either road past it, at most 2,000 positions, as BIG RUN's, level before its start.
- **Its lanes** (CS-3k). Its two roads keep the lanes of its most common picture, kind 2's, wherever they go, as BIG
  RUN's keep its town's: four lanes of 116, 142, 142 and 116 units, its lines' surface the pen they cover most, as the
  run at their centre is a lane line ([its road across](cisco-heat-road-data.md#its-road-across)).
- **Its colours** (CS-3m). A row's entry its word's bits 0 to 5, its bit 6 (the striped deck's variants) not read; each
  layer's palette as its stage loads it at its start, the changes its records make on along it not read; its sky's
  entries their first set, then their last from where its fade begins ([its
  colours](cisco-heat-road-data.md#its-colours)).
- **Each way's slide** (CS-2). A plane slides by its slide's whole pixels, a pixel more one way than the other (the
  front 15 and 16, the back 7 and 8): their mean.
- **The steps along a scene** (CS-2). Not laid, as BIG RUN's: a sky lays its scene's own row offset.

The PRs, in order:

- **CS-3** CISCO HEAT's five courses without objects.
- **CS-4** CISCO HEAT's objects.
- **CS-5** The stage closes, its scale across left for K to adjust at the end: this section goes, what is left goes to
  [Courses of the originals](#courses-of-the-originals), and CISCO HEAT's class goes into [the
  product](product.md#arcade-tribute).

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

## Card UI

The selection is rows of cards ([product](product.md#6-flow-and-screens)). GD-5 laid down their skeleton (K,
2026-11-09): the rows and their order, the main picture's world and the series' worlds, the zoom and line thinning,
the menu input and the music, with SELECT SERIES showing the series pictures and every other card its name and one
line until the cards are designed. What follows goes to K first:

- **Records within RACE (GD-6).** TIME ATTACK has left the menus and records are to be taken within RACE (K,
  2026-11-09). To decide: what a course without laps records (its time to the goal), whether a race whose rivals,
  traffic or clock may end it records as it runs, and how a record is kept (by class with its vehicle, as now) and
  shown (on the class's card). Until then TIME ATTACK runs only from a URL.
- **The cards' design** (K, 2026-11-12): packed with what a card is about, no boxes drawn round its parts, and a
  course's and a vehicle's card the same in every series and in FREE PLAY. Three styles are built to choose among
  ([card styles](browser.md#card-styles)): when K has chosen, the others, SETTINGS' CARD DESIGN and the C key go, the
  small print becomes a text-tile font, and the SELECT VEHICLE screen no row shows since GD-5 (`vehicle-screen.ts` and
  its pages) goes with them. To follow in the chosen design: SERIES (its description, researched and rewritten as K
  asked), each vehicle's description (the same), RULES, SETTINGS and CONTROLS; a class's record with GD-6. For K: a series whose classes share a course (TSUKUBA CLUBMAN) shows the
  same course card for each, told apart by the path's row alone; and, as K's prototype offered, a course without laps
  drawn as its stages' heights rather than from above.
- **The main picture:** K's 40×30 picture, whose clear parts show the attract demo; until it comes the title logo
  stands for it. Each series' picture is converted as K delivers it, named by its series' ID, and its series joins
  SELECT SERIES then.
- **The changes outside the rows:** the PRE-RACE card, READY and the ways into and out of a run, which still go
  through black (K, 2026-11-08: line thinning alone).
- **PAUSE's QUIT,** which takes a RACE to TITLE, and where within the rows it should lead.
- **Defaults K is to confirm** (GD-5): a gamepad's RT confirms and LT goes back in menus, as the accelerator and
  brake. The card's y 32 is K's (2026-11-11), balanced by the path's row.

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

Create the selected courses using the Strip schema and file/CLI authoring workflow. Review appearance, driving
experience and time margins on real devices. The first product series is TSUKUBA CLUBMAN: the TSUKUBA circuit and its
three classes ([Series](product.md#5-series)). ARCADE TRIBUTE's eleven series follow, one at a time in the order K
decides, and the game's own series after them (K, 2026-11-05; [Series](product.md#5-series)). The following production
and authoring goals are collected from the topic specifications; their order within this stage is not yet scheduled.

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
- Bike grids: every course has one (K, 2026-11-05), so `bikeGrid` could become required; that changes every course's
  identity and TSUKUBA's measured products, so it waits for a format change that does so anyway.

### Placeholder recordings

The impact recordings and the two placeholder tracks delivered today are placeholders (electronic tones) for building
Stage 14; the 17 effects are K's provisional two-operator FM recordings (Stage FE). Before the product, K's files
replace them under the same names, with no code change ([Audio](audio.md#recordings-and-music-documents)):

- Music (`content/music/`): `placeholder-one.m4a` and `placeholder-two.m4a`, each with its music document; the product
  tracks bring their own names and documents. TSUKUBA CLUBMAN's title track is `placeholder-one` until K delivers one.
  An ARCADE TRIBUTE series' title track is named by its series' ID. Those K has delivered are K's recordings, which
  stand in until the game's internal sound source plays the series' music (K, 2026-11-09); each other series the
  [front end selection](content-and-gameplay.md#front-end-selection-document) lists without a document yet has
  `placeholder-two` until K delivers its track.
- Impacts (`content/impacts/`): `vehicle`, `wall`, `object` and `movable` (`.m4a`).

### Music and jingles with the course

K's decision (2026-10-31): physical sound is the game's, and a course's music and jingles go with the course
([Music and sound effects](product.md#13-music-and-sound-effects)). Its race tracks are its
[course sounds](content-and-gameplay.md#course-sounds)' (K, 2026-11-11), and a run plays the first. What remains:

- Each jingle (signal lamp, GO, checkpoint, extension, lap, final lap, GOAL, GAME OVER, new record) in the course sounds,
  a recording or none, the game's own then; until then the jingles are the game's effects.
- Which of a course's race tracks plays when it has several.
- The local originals of an original's voices (`outrun-sounds`) become that original's jingles instead of the game's
  effects; the original's impacts are physical sound and are no longer replaced.
- The other ARCADE TRIBUTE courses' race tracks, as K delivers them.

### Course names and descriptions

K's decisions (2026-11-07 and 2026-11-08): every course has an official display name and an English description, kept
as data in `content/course-texts.json`, outside the course document, so that changing them changes no course identity,
record or measured product. A name begins with its reference game's title and uses no mark but that title's own (POLE
POSITION II's courses are written POLE POSITION II FUJI, as the title is written (K, 2026-11-09), CHASE H.Q.'s CHASE
H.Q. STAGE 1 LEFT and so on), at most 40 characters. A description tells of the course alone, never of how a mode is played, true to the reference game's own
material and in natural English of the period; a real course's says which years' layout it is and what changed before
and after. The file lists all 66 courses in the reference games' order, TSUKUBA last, those not yet raised among them: a
stage that raises one uses its id and its entry, and a product course takes its original's entry. Descriptions are kept
unwrapped; the course card's design sets the box they wrap into and the check that they fit.

GD-2b, when no stage has a course change open, removes `name` from the course document: the road data tools stop
writing it, the originals are raised again, and every course's identity changes once and its measured products are made
again.

### Reference and remaster goals

Provenance lives in authoring project data (observations), not in the runtime course document.

Record exact edition, cabinet/region or circuit layout, supporting material, deliberate approximations
and remaster departures. Preserve topology, characteristic turn order, elevation sequence and visual
identity within the pseudo-projection and mechanics. Checkpoints and sprites/music changes may be
independent of Section boundaries. Use schematic route maps rather than require one geographic embedding.
Suzuka's overpass is represented as a tunnel under it, with one road surface drawn at a time.

### Series values

Each class sets its rule values from playtests on the produced course: rank limits, ahead distances,
pace ratios, time margin, grid spacing and entry colors.

A class whose player starts from another slot than its grid's last, as an ARCADE TRIBUTE's own field may (OUTRUN's
player alone, POLE POSITION II's eight), is to have its reference run start from its player's slot (K, 2026-11-05),
the slot then entering the reference times' and pace schedules' identities; until then it shares the measurement from
the last slot.

### Series production starting points

Candidates and reference observations gathered while specifying the product. They are starting points for
production, not decisions: the [product specification](product.md#5-series) owns what is decided, and
series documents and authoring project data replace these rows as each series is produced. Exact vehicle
specifications follow [Era](product.md#era): one consistent model year, market and grade per vehicle.

| Series        | Starting points                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SUPER HANG-ON | The reference courses have 6, 10, 14 and 18 stages (AFRICA, ASIA, AMERICA, EUROPE), the export sitdown/upright cabinet's (MAME's `shangon`, K's decision; [SUPER HANG-ON](super-hang-on-road-data.md)). VFR750R keeps the existing 1988 full-power definition; GSX-R750 is the 1988 standard export model, not the 1989 GSX-R750R; 851 is a 1988 road model.                                                                                                                                                                            |
| OUTRUN        | TESTAROSSA keeps the existing 1989 definition.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| TURBO OUTRUN  | Stage order: New York, Washington D.C., Pittsburgh, Indianapolis, Chicago, St. Louis, Memphis, Atlanta, Miami, New Orleans, San Antonio, Dallas, Oklahoma City, Denver, Grand Canyon, Los Angeles. The reference course is raised from the ROMs of MAME's `toutrun` (K's decision; [TURBO OUTRUN](turbo-outrun-road-data.md)). F40 and 959 are period road specifications. The catalog's F40 (FERRARI_F40_1990) is a 1990 model, after [Era](product.md#era)'s 1989; the tribute needs one of 1989 or before.                           |
| FINAL LAP 2   | The reference game is of 1990; the tribute's cars are of 1989 or before ([Era](product.md#era)). The catalog has `FERRARI_640` (1989) and `MCLAREN_MP4_4` (1988).                                                                                                                                                                                                                                                                                                                                                                       |
| CHASE H.Q.    | 928 candidate: S4. ESPRIT TURBO generation is open. 911 TURBO (930) relates to the existing 3.3 L definition. Starting point for the tribute: catching a stage's rival becomes passing it before the stage end, with no arrest ([Concept](product.md#1-concept)).                                                                                                                                                                                                                                                                       |
| CISCO HEAT    | Reference stages: Golden Gate Bridge → Fisherman's Wharf, Fisherman's Wharf → Union Square, Union Square → Moscone Center, Moscone Center → Twin Peaks, Twin Peaks → Treasure Island; internal forks are unverified. BROUGHAM TUNED starts from the 1989 Brougham. 300ZX candidate: 1989–early 1990 Z32 Twin Turbo, without mixing US and Japanese outputs or two-seat and 2+2 data. Ordinary road appearances, without police livery or lights; BROUGHAM TUNED is one explicit finished specification, used unchanged on every course. |
| BIG RUN       | Reference route toward Dakar: Tunis, Tozeur, Tumu, Agadez, Bamako, Saint-Louis; the mapping to stages is unverified. A rally-raid 959 is a different vehicle from the road 959; 205 T16 is not the 205 GTI; PAJERO generation is open.                                                                                                                                                                                                                                                                                                  |

### Courses of the originals

OUTRUN's, SUPER HANG-ON's, TURBO OUTRUN's, ENDURO RACER's, POLE POSITION II's, FINAL LAP 2's, CHASE H.Q.'s, TOP SPEED's,
CONTINENTAL CIRCUS's and BIG RUN's courses are raised from their ROMs' road data ([Original road data](original-road-data.md));
RACING HERO is not made (K, 2026-10-22). Their time limits come from reference driving, as for every course.

Left by the stages that raised them, beside what follows:

- Every original: the objects that fly or break when hit are made movable together once every original is raised,
  TURBO OUTRUN's (its collision classes 3 and 11 to 17) and CHASE H.Q.'s dustbins and their like among them; until then
  they stand with no body (K, 2026-11-09).
- Every original: what a vehicle passing over a lying picture shows, of the same kind as a movable object's knocked
  picture and never a material, is not decided (K, 2026-10-25): OUTRUN's drawings 1 (grass), 3 (sea and lakes) and 13
  (patches) set the road's surface effect for 12 frames while the car is on them, which draws a spray at the car and
  changes no driving ([Effect](outrun-road-data.md#strips-and-patches)); the other originals' are read when one is made.

- OUTRUN: K's video taking the left road every time is not awaited; when it comes, kinds 3 and 4 and the forks' sides
  are checked again. RD-6e: music, local originals of the tracks from K's four MAME recordings once they come. The
  planner's driver overturns near COCONUT BEACH's fork, outrun-a's at about tick 6710, and outrun-e's is blocked and
  recovers; EX-7's one-off drive found it, and it predates Stage EX. FREE PLAY's rivals on OUTRUN's courses drive with
  the same driver. Its ARCADE TRIBUTE series runs its originals for now (K, 2026-11-10): the TESTAROSSA's reference
  runs recover 9 to 16 times a road, and outrun-a's ends off the pavement past its GOAL, so its class has no clock
  until the driver is mended; then its product courses, its vehicles and the original's traffic.
- TOP SPEED: its ARCADE TRIBUTE series, of the classes [the product](product.md#arcade-tribute) names, is not made. Not
  drawn as the original draws them: its cloud banks' rows and size by their distance (each is a band across the road
  of one height and one size; the original lays it on the screen by its own curve, behind the ground), which needs a
  picture laid on the screen by its distance to a station ([Its cloud banks](top-speed-road-data.md#its-things)); the
  things of the branch not taken beyond the 30.7 m its road not taken is drawn over, which the original shows until
  its slide ends ([Beside a road not taken](top-speed-road-data.md#its-things)); and the fifth stage's gate's and the
  GOAL gate's right posts' hits, whose boxes lie wholly beyond their pictures, which needs a body outside its picture
  ([Its hit](top-speed-road-data.md#its-things)). Estimates, not confirmed: its tunnels' road and sky dark over their
  walls and, under an overpass, the road alone dark; a run of both programs through a tunnel and under an overpass
  would confirm them ([its chapter](top-speed-road-data.md#top-speeds-conversion)). K adjusts its scale (a lane of
  3.6 m) by driving in DEV; its grades are its original's (−21 % to +30 %), a rise table having no grade limit.
- SUPER HANG-ON: its ARCADE TRIBUTE series runs its originals for now, with VFR750Rs until the GP machines are made
  (K, 2026-11-10); its product courses, its vehicles, the turbo, sounds and race music, the mini ride-on cabinets'
  courses (their programs are encrypted), the ending's motion (its last frame alone stands; when the motion is made,
  `ENDING` is read again from the program's run), and the product's pictures drawn again.
- TURBO OUTRUN: its ARCADE TRIBUTE series runs its originals for now (K, 2026-11-10); then the original's time
  extensions, turbo, tune-ups and traffic tables, the ending's picture as a screen picture, sounds and music, the other cabinets' courses (`toutrun2` among them), and the
  product's pictures drawn again. Until its class is made the finish gates' posts over lanes a and f are shown in
  drawings; whether a reference run hits them is checked then. Its objects thrown or broken when hit (collision classes
  3 and 11 to 17) wait with every original's (above). A run through all 16 stages, if made, belongs to the game's own
  series of joined roads, as one course joining the four (K, 2026-10-31). At a leg's start the original adds figures
  beside the 959 by the leg before's result (0xC2B0, 0xC318, by 0x60B72 and 0x60B76); they are not made.
- ENDURO RACER: its ARCADE TRIBUTE series runs its original for now, without a clock, since no driver avoids the rocks
  and logs on its road and the reference run does not reach the GOAL (K, 2026-11-10); its clock (the original's own
  start time and extensions, or a reference run that finishes), its product course, sounds and race music, the motion of
  what moves, the ending's text, and the product's pictures drawn again.
- POLE POSITION II: its ARCADE TRIBUTE series runs its originals for now (below); its product courses, sounds and race
  music, and the product's pictures drawn again; its rivals' and traffic's colors, made distinct when the LOTUS 79
  SPECIAL's colors are drawn apart (its four are one JPS livery today). Its lane (5.5 m) is adjusted with every course's
  lane at once, after all the courses are made (K, 2026-11-09), its courses with a model then solved again. K decides in
  DEV the airship's and
  plane's height (`CRAFT_HEIGHT`, 30 m, provisional) and how their banner's sprites meet, whose hardware stretch is not
  read ([Its craft](pole-position-ii-road-data.md#its-craft)).
- FINAL LAP 2: its ARCADE TRIBUTE series runs its originals for now (K, 2026-11-10), the player's car to be decided; its
  product courses, sounds and race music, and the product's pictures drawn again. K adjusts its scale (2.15 m, its own
  car) by driving in DEV, its courses with a model then solved again, and sees JAPAN's underpass in DEV ([FINAL LAP 2's
  objects](final-lap-2-road-data.md#final-lap-2s-objects)). Its cells stay as they are (K, 2026-11-10).
- CHASE H.Q.: its ARCADE TRIBUTE series, of the classes [the product](product.md#arcade-tribute) names, is not made; a
  tribute's stage is to pass the criminal before its end ([its courses](chase-hq-road-data.md#chase-hqs-courses)). Not
  drawn as the original draws them: event 2's banks of cloud (kind 0x681), bands across the road at their records' own
  distances ([its objects](chase-hq-road-data.md#chase-hqs-objects)); drawing them as the original does, as though
  0x400 + 0.75 d² / 65,536 positions away at a distance d, needs a rule by which a board is drawn at a depth other
  than its station's. Estimates, not confirmed: its tunnels dark over their records, which a run of both programs
  through a tunnel would confirm, and its lines' colors in banks 3 and 7 set by no program after the palette's start,
  which a run of the main program through a stage would confirm ([its
  chapter](chase-hq-road-data.md#chase-hqs-conversion)). K adjusts its scale (a lane of 3.6 m) by driving in DEV, where
  K also sees what its chapter names: the grey green ground, the lanes and limits at its forks and merges, the limits
  on stage 4 and 5's tight bends, and the nearer sky bands' proportions; its grades are its original's (−34 % to
  +55 %), a rise table having no grade limit.
- CONTINENTAL CIRCUS: its ARCADE TRIBUTE series, of the classes [the product](product.md#arcade-tribute) names, is not
  made. Estimates, not confirmed ([its chapter](continental-circus-road-data.md#its-conversion)): its rises' resolution
  (1.5 units a sample), which counting its laps' runs at 1, 1.5 and 2 units would confirm; its skies' facing at the
  start, which a run of both programs to a race's start would confirm; and the 0x12C its program adds at a checkpoint
  read as time, which a run of both programs past a checkpoint would confirm. The other readings its chapter marks not
  confirmed stay so. Not drawn as the original draws them: JAPAN's bridge's span, the format having no surface over
  the road, and its tile layers' bands over a zone's far lines where it draws no ground ([Its
  bands](continental-circus-road-data.md#its-bands), [Its zones](continental-circus-road-data.md#its-zones)). Its pit
  lanes are not driven, as this game has no damage to mend there (K, 2026-11-06). That an F1 car is not slowed on
  grass, as POLE POSITION II shows, is mended on the vehicles' and materials' side. K adjusts its scale
  (2.15 m, its own car) and its grade limit (`GRADE_LIMIT`, its heights' factor 0.570) by driving in DEV, its courses
  with a model then solved again; MEXICO's lap stays as the procedure gives it (K, 2026-11-10).

When the product's pictures are drawn again, a picture's shadow is cast from its shape, by one rule as a vehicle's is
cast from its own (K, 2026-10-28): an original's pen 10 and the shadow pictures it draws apart serve only a course
raised from its original, and the light's direction and the shadow's density are decided then.

As raised, the cars fly at most crests at the top speed (EX-G2: TURBO OUTRUN's 130 flights, the longest 180 m). The
[crests rule](original-road-data.md#crests) (K, 2026-11-02) is laid on the road after the pieces, not in the
researcher's solve, at a speed V that K decides course by course by driving (K, 2026-11-03); a course with no V yet keeps
its profile as read, without the rule.

- Kept to choose V: the crest trials (`content/originals/crest-trials/`, 29 files) and the DEV setting CREST SPEED.
- The originals' canon may change only when a course's V goes in. Each comes, as K decides a course's V, in a small PR
  of its own: a table of course id to V (km/h) in one place, made when the first V is decided (not now); the conversion
  bounds the crests of the courses in the table alone, at their V; the original's version is raised and the course's
  racing lines and reference runs measured again. A V K wants to try that the trials lack (`CREST_TRIAL_KMH`: 170,
  200, 230, 260) is added to them first.
- When every course has its V, or K says it is done, the trial files and CREST SPEED go.

How the vehicles land from ENDURO RACER's jumps K decides later; until then no scenario drives ENDURO RACER.

Left to [Stage RM](#stage-rm--branch-tsukuba-and-the-walls) (K, 2026-10-22): BRANCH removed from the engine; TSUKUBA
made again; then the walls' feature removed, replaced by rows of boards.

### Distant views

- Decided (K, 2026-11-02): below the horizon K paints the distant view (COCONUT BEACH's sea, the cliff courses to
  come); the ground is not extended to the horizon. The picture's rows are the screen's rows, shifted up and down by
  the pitch alone, not projected by their angle. A course's introduction and the like may swing the camera's pitch
  down a long way.
- K decides: the picture's height (720 rows, 90 tiles, proposed) and how it is made (a distant-view editor, or by hand
  in a thread with small commands).

### Inspection and art

The course editor is the human inspection and adjustment view over the file/CLI workflow. Decide the default rounding
steps and joining tolerances of its cleaning operations while producing the first product courses, and which findings
become build rules once those defaults hold. The findings are worked out after every change, so their time is the
author's wait (one worker, the default amounts): TSUKUBA 39 s (digits 0.2 s, unneeded knots 13 s, near and referable 27
s, merge kinds 0.3 s). Show anchor displacement after geometry changes if producing courses needs it. It shows both a
Section's edges as its document writes them and as the format clips them (the course limits). Before master-course
production, document/compiler versions can advance without migration readers; replace development inputs with the
corresponding version.

`course render --section` serves only a course's start Section and the one after: the route window is refreshed at the
grid and does not go back, so a frame farther along a course of many Sections is not served.

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

Add surface materials to the one game-wide material catalog as product courses need them (courses reference material IDs; there are no per-course material documents), with physical and sound values tuned on those courses: kerbs (circuits), gravel traps, gravel roads (the mixed-surface real courses), concrete (streets, run-offs, pits), packed snow and mud (off-road), and cobblestones; shallow water is `WATER` (Stage PG's PG-4) and snow lying thin on the road `SNOW` (PG-4b, RALLY STAGE's WINTER "snow"; packed snow stays a later material), their values to tune on those courses. Kerbs and cobblestones rely on sound for their vibration unless a material roughness is added later.

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
| Series content   | ARCADE TRIBUTE: each series' vehicles, field, traffic and clock, decided when it is produced, in the order K decides                                                                                                                                                                                                                                                                     |
| Own series       | Decided after ARCADE TRIBUTE (K, 2026-11-05): SUPER OUTRIDE (to enjoy the roads and the vehicles), CROSS COUNTRY (joined roads alone, against rivals; K, 2026-10-31), GRAND PRIX (circuit races, TSUKUBA CLUBMAN's kind) and the place of RALLY STAGE, an original game and not a tribute                                                                                                |
| Records          | Whether TIME ATTACK records are kept by course and vehicle rather than by class, once several series run one course                                                                                                                                                                                                                                                                      |
| Authoring        | Joining two product courses into one, for CROSS COUNTRY: a course across two originals (ENDURO RACER and SUPER HANG-ON's AFRICA, say) or TURBO OUTRUN's four sections                                                                                                                                                                                                                    |
| Vehicles         | Exact specifications of adopted vehicles (year, market, grade); BROUGHAM TUNED values                                                                                                                                                                                                                                                                                                    |
| Real courses     | Series or FREE PLAY placement of the selected real courses below, and which of them run bike classes, car classes or both; the fourth circuit, C02 or C07; M04 and M05 as the whole stage, its last part or an invented course                                                                                                                                                           |
| Tunnels          | Whether tunnel sides and ceilings are drawn by the renderer like walls (a ceiling is a second surface above the road), replacing sprite frames                                                                                                                                                                                                                                           |
| Rivals           | Whether rivals follow closer than traffic (in dense traffic they keep the 1.5 s following time and queue)                                                                                                                                                                                                                                                                                |
| Rivals           | Whether an ahead entry's lane is checked where it appears rather than against the course's fewest lanes (Stage 16)                                                                                                                                                                                                                                                                       |
| Drivers          | Whether steering lookahead and response change: a lane change at about 47 m/s overshoots by about 1.7 m (with the rival racing line)                                                                                                                                                                                                                                                     |
| Traffic          | Whether traffic speeds vary or density changes: one speed lets it fill both lanes of a two-lane road; lane drivers never pass                                                                                                                                                                                                                                                            |
| Interaction      | Whether a slight front-face overlap with a solid object deflects the vehicle instead of stopping it (real devices)                                                                                                                                                                                                                                                                       |
| Interaction      | How far a vehicle rebounds from a solid object (about 7 m/s back from 40 m/s today; real devices)                                                                                                                                                                                                                                                                                        |
| Interaction      | Whether a vehicle stopped against a wall or course limit recovers as one held by a fixed object does: a spun S13 DRIFT TUNED came to rest nose-in against TSUKUBA's course limit, its rear wheels spinning on the grass, and no input moved it (no reverse gear; manual recovery is DEV's)                                                                                               |
| Grade separation | Occurrence/neighborhood/height selection of surfaces, landmarks and contacts at nearby overpasses                                                                                                                                                                                                                                                                                        |
| Front end        | Stage FE "Decisions for K" ([below](#stage-fe-decisions-for-k))                                                                                                                                                                                                                                                                                                                          |
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
- Menus: PAUSE, RESULT and LOAD FAILED are carousels; a single item draws no arrows; no screen advances during a
  black transition (READY's countdown starts fully bright).
- Color display names (13 characters at most, for SELECT VEHICLE's unchanged color line): 911 TURBO 3.3 SILVER,
  BLACK, GUARDS RED, GP WHITE; TESTAROSSA ROSSO CORSA, GIALLO MODENA, BIANCO, NERO; GOLF GTI 16V TORNADO RED, ALPINE
  WHITE, BLACK, SILVER; DELTA HF INTEGRALE BIANCO, ROSSO MONZA, BLU LANCIA, NERO; CORVETTE C4 BRIGHT RED; FXRT SPORT
  GLIDE VIVID BLACK; every other color its plain name. To confirm or replace.
- PRE-RACE: the start bar stands at the entry Section's origin; a BRANCH map takes each fork's first exit; FREE PLAY has
  no BEST line; RETRY passes the card too; the course format change changed every course identity, so records saved
  in browsers no longer count (reference times were re-measured, unchanged).
- Attract demo (FE-8b; filmed since 2026-11-12, [browser](browser.md#card-rows)): the classes of one course share one
  compiled course; the demo holds only the shown and the next class's runs. To confirm on a device: the shots'
  distances, heights and speeds, the 15 s turns, the ticker's speed and row, and a turn's 300 s.
- FE-10 (decided in Stage OT): a wallpaper change asked for while a black transition runs still finishes through black;
  only a steady screen cuts.

### Selected real courses

K's decisions (2026-11-08 and 2026-11-09): the real courses are fewer, and beside the circuits come mixed-surface
courses, where tarmac, gravel and jumps follow one another as an ENDURO RACER sequel or a rally might have them. A real
course is made where that is easier than inventing one, and an invented course may take its place; for now the real
ones below are to be made. A circuit keeps its 1989 layout; a mixed-surface course may take its current one, remastered
into the late-1980s world ([Era](product.md#era)). Series courses are listed in the
[product specification](product.md#5-series).

| ID  | Course                         | Form    | Reference / identifying note                                                                                                  |
| --- | ------------------------------ | ------- | ----------------------------------------------------------------------------------------------------------------------------- |
| C01 | Nürburgring Nordschleife       | CIRCUIT | Germany, 1989                                                                                                                 |
| C03 | Circuit de la Sarthe / Le Mans | CIRCUIT | France, 1989; before Mulsanne chicanes                                                                                        |
| C16 | Tsukuba Circuit                | CIRCUIT | Japan, 1989; four-wheel layout, 2,045 m, without the motorcycle chicane added in 1990; made (`tsukuba`)                       |
| C02 | Spa-Francorchamps              | CIRCUIT | Belgium, 1989; 1983–93 layout; the fourth circuit, this or C07                                                                |
| C07 | Mount Panorama / Bathurst      | CIRCUIT | Australia, 1989; the fourth circuit, this or C02                                                                              |
| M01 | Höljes                         | CIRCUIT | Sweden, current layout; rallycross, about 1.2 km, 60% tarmac and 40% gravel, its longest jump about 38 m                      |
| M02 | Lohéac                         | CIRCUIT | France, current layout; rallycross, 1.07 km, 60% gravel and 40% tarmac                                                        |
| M03 | Le Touquet                     | CIRCUIT | France, current layout; the Enduropale's loop of 13 to 15 km on the beaches of Le Touquet and Stella-Plage, without the dunes |
| M04 | Fafe                           | LINEAR  | Portugal, current layout; the rally stage of 11.18 km on gravel, the Pedra Sentada jump near its end                          |
| M05 | Erzberg                        | LINEAR  | Austria, current layout; the Iron Road Prolog, 13 to 15 km of gravel road up the iron-ore mine                                |

The left-out circuits' IDs are not used again: Monza (C04), Monaco (C09) and Suzuka (C15) are courses of the originals
already (FINAL LAP 2's ITALY, MONACO and JAPAN, CONTINENTAL CIRCUS's MONACO and JAPAN, POLE POSITION II's SUZUKA), and
Silverstone (C05), Laguna Seca (C06), Interlagos (C08), Phillip Island (C10), Mugello (C11), Assen (C12), Road America
(C13) and Brands Hatch (C14) are left out to keep the list short (K, 2026-11-09).

The mixed-surface courses are made in the order of their IDs, the rallycross circuits first; whether M04 and M05 are
the whole stage, its last part or an invented course is decided when they are made. A rallycross circuit's joker lap is
not driven, as BRANCH was removed ([Stage RM](#stage-rm--branch-tsukuba-and-the-walls)); its lap is the main route. The
jumps wait, as ENDURO RACER's do, for how vehicles land ([Courses of the originals](#courses-of-the-originals)), and the
gravel for a material of its own. Which of these courses run bike classes, car classes or both is decided with their
series.

#### Reference data

A real course's plan is traced over its own drawing where it has one, as TSUKUBA's, or else over an open orthophoto or
the shading of an open elevation model, laid under the course editor; its heights come from an open elevation model,
as TSUKUBA's were scaled against the Geospatial Information Authority of Japan's; its widths, lengths and surfaces
come from its own documents. The data below may be used (K, 2026-11-09); each licence is confirmed on its provider's
page when the course is made, and the course's chapter names what it used, with its licence and attribution. Google's
imagery is not traced, as its terms forbid it, and OpenStreetMap's lines are not copied, as its licence would bind
the course data to the ODbL; either may only show where a road is. Others' videos and photographs only show how a
place looks: no curve is taken from them and nothing is cut from them.

| Country   | Courses       | Heights                                                                                   | Imagery to trace                                                                                                          |
| --------- | ------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Sweden    | M01           | Lantmäteriet's terrain model (Markhöjdmodell Nedladdning, grid 1+), 1 m, CC0              | Lantmäteriet's historical orthophotos, CC0, the latest from 2005; current ones need an application and terms of their own |
| France    | C03, M02, M03 | IGN's LiDAR HD terrain model, 0.5 m, where flown, else RGE ALTI, 1 m; Licence Ouverte 2.0 | BD ORTHO, and IGN's historical aerial photographs for Sarthe's 1989 layout; Licence Ouverte 2.0                           |
| Portugal  | M04           | DGT's terrain model from its 2024 LiDAR survey, 0.5 m and 2 m, CC BY 4.0                  | DGT's orthophotos (25 cm, 2018) and OrtoSat (30 cm, 2023)                                                                 |
| Austria   | M05           | BEV's ALS terrain model and Styria's, 1 m, CC BY 4.0                                      | basemap.at's orthophoto, CC BY 4.0                                                                                        |
| Germany   | C01           | LVermGeo Rheinland-Pfalz's DGM1, 1 m, dl-de/by-2-0                                        | LVermGeo Rheinland-Pfalz's DOP20 (20 cm), dl-de/by-2-0                                                                    |
| Belgium   | C02           | SPW's terrain model of 2021–2022, 0.5 m                                                   | SPW's orthophotos of 2021 (25 cm), CC BY 4.0                                                                              |
| Australia | C07           | NSW Spatial Services' 1 m DEM, through ELVIS, CC BY 3.0 AU                                | —                                                                                                                         |

The courses' own documents: Euro RX's supplementary regulations (Part 1) give a rallycross circuit's length, widths,
shares of gravel and tarmac and direction, as FIA's gave Höljes's in 2014 (1,210 m, 10 to 16 m wide, 40% gravel and 60%
tarmac, anticlockwise); Rally de Portugal's stage maps give where M04 runs, and Erzbergrodeo's course of the year where
M05 runs, which changes as the mine is worked; the Enduropale's regulations and press kit give M03's loop of the year.
