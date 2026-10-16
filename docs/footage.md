# Courses from footage

A course of an original game is raised from videos of it being played. The footage tool measures the videos, solves
one course that, drawn by this game's own scene and renderer from the original's camera, looks as close to the
original's frames as one consistent course can, and writes it as a course document with its Strips and course-fixed
sprites. This document owns the footage model, the footage features, the footage observations (sprites included), the
procedure, the replay comparison and the round-trip test. Stage VC builds the tool
([NEXT](NEXT.md#stage-vc--courses-from-footage) lists which parts exist); [Development](development.md#footage-commands)
lists its commands.

The original is not assumed to draw a consistent world. What a consistent course cannot explain is the original's
inconsistency: it is measured and reported, never drawn. Nothing here changes how the product draws, drives or sounds;
the renderer is only ever generalized (a frame size or a pose given as an argument), never given a branch for an
original.

## Terms

| Term                 | Meaning                                                                                                                                                                         |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| original             | The game a video shows (OUTRUN, SUPER HANG-ON, CHASE H.Q. and so on), with its edition and cabinet                                                                              |
| video                | One file of footage of the original, as K supplies it                                                                                                                           |
| game pixel           | One pixel of the original's own frame grid, before the video's scaling                                                                                                          |
| footage model        | What is true of the original in every video: its camera, gauge, color roles, HUD and the rules it draws by ([Footage model](#footage-model))                                    |
| capture values       | What is true of one video alone: its crop and scale to game pixels, its color decoding and its frame times ([Capture values](#capture-values))                                  |
| footage features     | Numbers measured from each frame of a video ([Features](#features)); they never leave `reference-media/`                                                                        |
| footage observations | The committed numeric record of a course raised from footage ([Footage observations](#footage-observations))                                                                    |
| replay               | The solved course drawn through the product scene and renderer from the original's camera at each frame's solved pose                                                           |
| gauge                | The one free scale of the footage, fixed by the width of a vehicle the original draws at the road's scale ([What footage measures](#what-footage-measures))                     |
| depth authority      | The depth cues of the original that agree with each other, which place things in depth ([Inconsistencies](#inconsistencies-of-the-original))                                    |
| inconsistency amount | How far the original's drawing departs from one consistent world, by station and depth range                                                                                    |
| outline board        | A course image that keeps an original sprite's outline, filled with one color ([Outline boards](#outline-boards))                                                               |
| fake footage         | Footage this game draws of one of its own courses with a camera unlike its own, to test the tool against known truth ([Round-trip test](#fake-footage-and-the-round-trip-test)) |
| noise level          | The variance, in game pixels², of one feature under one footage condition (scale, compression, frame rate), measured on calibration intervals and on fake footage               |

## Symbols

| Symbol             | Meaning                                                                                    |
| ------------------ | ------------------------------------------------------------------------------------------ |
| `(x, y)`           | Game pixels, `y` down                                                                      |
| `t`                | A frame's timestamp (PTS) in its video                                                     |
| `s`, `l`           | Chainage (arc length) and lateral position (right positive) of the solved course           |
| `s_c(t)`, `l_c(t)` | The camera's chainage and lateral position at each frame                                   |
| `ψ(t)`             | The camera's yaw relative to the road's direction (right positive)                         |
| `φ(t)`             | The camera's pitch                                                                         |
| `Y_c(t)`           | The camera's height (absolute)                                                             |
| `x₀`, `y₀`         | The centre column and the horizon row with a level camera (footage model)                  |
| `f`, `h`, `K`      | Focal length (px), the level camera's height above the road (m), `K = f·h` (footage model) |
| `a`                | The original's background scroll, px/rad (footage model)                                   |
| `D′`               | The original's distance from the camera to the player's base point, m (footage model)      |
| `B`                | The width of the gauge vehicle, m (footage model)                                          |
| `κ(s)`, `ν(s)`     | Plan curvature (right positive) and vertical curvature                                     |
| `Y(s)`             | Road height                                                                                |
| `W(s)`             | A width across the road: the road, a lane or a median, all measured alike                  |
| `u`                | Rows below the horizon, `u = y − y_h(t)`                                                   |
| `v`                | The original's displayed speed, m/s                                                        |

## Forward model

The forward model is the product's [pseudo projection](architecture.md#height-and-projection) with the original's
camera values:

```text
d = s − s_c(t)                                              d > 0; depth is the chainage difference
x = x₀ + (f/d)·r
y = y_h(t) + (f/d)·(Y_c(t) − Y(s))·cos φ(t)
y_h(t) = y₀ − f·sin φ(t)
```

`r` is a point's distance right of the camera's axis. For a point at lateral `l`, to first order in small angles,

```text
r(d, l) = (l − l_c(t)) − ψ(t)·d + ∫₀^d (d − σ)·κ(s_c(t) + σ) dσ
```

- A width across the road is `x_R − x_L = (f/d)·W(s)` whatever the height and pitch: in this projection width is always
  an exact depth cue.
- The background turns with the camera's heading `θ = road heading + ψ`. The original's background moves
  `Δx_bg = −a·Δθ`, with `Δθ = κ(s_c)·Δs_c + Δψ` (turning right moves it left); the product's moves at `f` px/rad. The two
  are compared as angles: `Δx/a` for the original and `Δx/f` for the replay.
- The small-angle form serves only the [initial estimate](#initial-estimate). Correctness is decided by the
  [replay comparison](#replay-comparison), which draws through the product renderer itself.

## What footage measures

The footage measures ratios only. Three assumptions per original complete it, and nothing else is assumed:

1. **Displayed speed.** The speed the original's HUD shows is the true speed.
2. **Gauge.** The original's drawing of its player's vehicle is as wide as that vehicle's real overall width (for
   OUTRUN, TESTAROSSA's).
3. **Projection form.** The original draws in the forward model's form. This is checked on every video
   ([Inconsistencies](#inconsistencies-of-the-original)).

On a level straight (no horizontal background motion, a centreline linear in `u`, road edges that are straight lines
meeting at one point) the footage measures:

- **Horizon and centre.** The edges' lines meet at row `y₀` and column `x₀ − f·ψ`. A yaw offset that never changes
  cannot be told from `x₀`, so `x₀` is the most frequent meeting column over the level straights, where the original's
  camera faces along the road; `ψ` is measured from it.
- **Height ratio.** A width is `w = (W/h)·u`, so each straight gives `W/h`.
- **`K`.** A stripe edge fixed at station `s_m` stands at `1/u = (s_m − s_c)/K`, so `d(1/u)/dt = −v/K`: following stripe
  edges against the displayed speed gives `K = f·h`. All videos of an original share `K` and are calibrated together.
- **Lane widths.** The spacing of lane lines gives each lane width over `h`.
- **Vehicle width.** A vehicle picture's width over the road's width at the picture's base row is `B/W`: the same row, so
  neither `f` nor `h` enters.

`f` and `h` are known only as their product. The gauge fixes `h`, then `f = K/h`: it is the footage's one free scale,
and widths, heights and curvatures move with it together while lengths along the road, fixed by the displayed speed,
do not. There is no separate vertical scale.

- **The gauge's value.** `B` is the overall width of the original's player vehicle: its mechanics document's
  `overallWidth` under `content/vehicles/`, or, for a vehicle not in the catalog, its real overall width, written in the
  footage model with its reference. For a two-wheeler original it is the two-wheeler's width.
- **Which vehicle measures it.** An original may draw its player's vehicle at a fixed size of its own, not at the road's
  scale; since the player always stands at one depth, the player alone cannot show it. Traffic and rival pictures are
  measured first: their width over the road's width at their base rows must stay constant with depth (they follow the
  road's `f/d`). The player's ratio is then compared with that of the same model, or of any vehicle if all are drawn
  one width:
  - at the road's scale, the player measures the gauge;
  - otherwise a traffic or rival vehicle drawn at the road's scale measures it, with `B` that model's real overall
    width, and the player's scale factor is recorded.
- **Common width.** Whether every vehicle is drawn one width (a game-wide vehicle width) or each model its own is
  recorded in the footage model.
- **Results, not assumptions.** Lane and road widths are results. Each is reported beside the motorway lane standard of
  the country it is set in: USA 3.65 m, Germany 3.75 m, UK 3.65 m, Japan 3.5 m.
- **Background scroll.** `a` is measured once `f` is known, from the background's horizontal motion against `Δθ`: the
  initial estimate measures it, since `Δθ` needs the road's heading and the camera's yaw.
- **Closed courses.** On a circuit the headings sum to 2π and the plan closes. Those constraints fix `f` on their own,
  so they test the gauge; their difference from it is reported.

## Inconsistencies of the original

A depth shows four ways: a row, a width, a stripe spacing and a sprite's size. In the forward model all four agree. An
original may not.

- **Depth authority.** Over hills and curves the tool finds which cues agree with each other; the agreeing set places
  everything in depth and is recorded in the footage model. (A common construction moves the rows alone, with widths,
  stripes and sprites agreeing.)
- **Inconsistency amount.** Height and curvature are estimated separately from each depth range (0–25, 25–50, 50–100 and
  100–200 m) at the same station; their differences along `s` are the inconsistency amount.
- **Solving.** The course is the least-squares fit of frame differences in game pixels, each feature weighted by the
  inverse of its noise level. No weight is chosen per depth range by hand.
- **Hills.** Height is seen in two ways: rows ahead moving, and the horizon and background moving vertically as the camera
  passes. Where they disagree what lies ahead is taken and the passing difference reported.
- **Pitch and grade.** Camera pitch and the grade ahead move every row alike, so one frame cannot separate them; the
  original's pitch rule can. It is checked against the background's and the horizon's vertical motion and recorded in
  the footage model:
  - `level`: the camera stays level, so row shifts measure the grade itself;
  - `road`: the camera pitches with the road, so the frame shows only vertical curvature; where the background moves
    with pitch, its row measures the grade, its factor fitted against vertical curvature and level taken as its most
    frequent row.

  When neither decides, the grade's constant is the one that minimizes the mean squared grade.

## Footage model

A footage model is `superoutride.footage-model` version 1, at `content/footage/<game>/footage-model.json`
(`<game>` an id such as `outrun`). It is production-only, like the
[underlay alignments](content-and-gameplay.md#course-authoring-operations): numbers and names only, which the core
neither reads nor delivers. It is made from every video of the original's first course, then frozen: later courses only
check it, and a contradiction stops the work.

| Field        | Contents                                                                                                                                                                               |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `game`       | The original's name, edition and cabinet, as text                                                                                                                                      |
| `frame`      | The game pixel frame's `width` and `height`                                                                                                                                            |
| `camera`     | `focalLength` (`f`), `height` (`h`), `centerX` (`x₀`), `horizonRow` (`y₀`), `backgroundScale` (`a`), `playerDistance` (`D′`), each its `value` and standard `error`                    |
| `gauge`      | `vehicle` (a vehicle ID or a named real vehicle), `width` (`B`) and its reference, `measuredOn` (`player`, `traffic` or `rival`), `playerScale` (1 at the road's scale), `commonWidth` |
| `projection` | The projection-form check: its residual in game pixels                                                                                                                                 |
| `depth`      | The depth authority: the agreeing cues among `row`, `width`, `stripes` and `sprites`                                                                                                   |
| `pitch`      | The pitch rule, `level` or `road`, with the background's vertical factor when it has one                                                                                               |
| `hud`        | The speed readout's place, digit size, spacing and count; the clock's when shown; each timing event's place and kind                                                                   |
| `masks`      | Rectangles never measured: the HUD, and the player's vehicle and shadow                                                                                                                |
| `colors`     | Each color role (road light/dark, rumble, white line, yellow line, verge light/dark, median and so on) with its RGB555 values, which may change along a course                         |
| `materials`  | Each ground role's surface material (road `ASPHALT`; verges `SAND`, `GRASS`, `DIRT` and so on) and the drivable width beyond the road when no video leaves it                          |
| `noise`      | Each feature's noise level by footage condition                                                                                                                                        |

The HUD digit and event glyph templates are pixels: they are kept in `reference-media/<game>/`, and the model holds only
their places and sizes.

## Capture values

Each video's capture values (`superoutride.footage-capture` version 1, `capture.json` beside its frames, and saved in
the footage observations) are numbers alone:

- `video`: its file name, SHA-256 and size;
- `grid`: on each axis the first game pixel's edge in video pixels (`origin`), video pixels per game pixel (`period`,
  whole or fractional), the game pixels (`count`, so the black margins are what lies outside), and `onGrid`, the share of
  edge energy on the grid's boundaries: near 1 when scaled by nearest pixels, lower when smoothed, which costs accuracy
  and is reported;
- `color`: the range (`limited` or `full`) and matrix (`bt601` or `bt709`) taken, with every candidate's lattice error;
- `frames`: the count, the duration and the original's update period.

Each frame's timestamp, whether the original updated it and its difference from the frame before stay in `frames.json`
in `reference-media/`.

## Ingest

`ingest` cuts a video at `reference-media/<game>/<course>/<video>/` into game-pixel PNG frames there (`frames/`):

- **Times and size.** ffprobe gives each frame's timestamp, the video's size and its pixel format; footage is 8-bit
  4:2:0 (`yuv420p`, or `yuvj420p`), decoded raw, never converted, so range and matrix are measured.
- **Pixel grid.** From about 120 frames spread over the video: margins are the outer lines whose brightest luma is of
  the dark kind, when the lines' brightest values are two kinds by BIC. Between them, the period (1.25 to 8 video pixels)
  and phase are those whose boundaries gather the most luma-change energy beyond an even spread, counted in windows just
  under one video pixel so that an aliased period cannot gather two boundaries; origin and period are then fitted to
  the boundary columns by energy-weighted least squares.
- **Game pixels.** Each game pixel's Y is the mean of its video pixels' interior (its outer ring left out once it is
  wider than two), its U and V the mean of the chroma samples inside it, or the one nearest its centre: thin features
  bleed under reduced chroma resolution, and this reads a color from inside its area.
- **Color decoding.** Of the four ranges and matrices, the one under which game pixels in even areas (whose neighbours
  share their luma within 2 levels) lie nearest the RGB555 lattice.
- **Update period.** Frames whose luma differs from the frame before by a repeat's compression noise are repeats when the
  log differences are two kinds by BIC; the update period is the most frequent spacing between updates (a still
  original, such as a countdown, also repeats).

## Features

A person first reads the color census (`colors`): every RGB555 color the frames are drawn in with its share. A decoded
pixel goes to its nearest lattice color; one within three noise deviations of a more frequent one joins it; what
remains is kept when BIC prefers it to an even scatter of the rest. The person writes each ground color's roles in the
footage model (`road`, `line`, `rumble`, `verge`, `ground`, `median` and `shadow`; one color may hold several, as a white
for lines and rumble stripes), the HUD's readouts and event places with their ink colors, and the masks, and cuts the HUD
templates (each digit's and event's ink colors by letter, `.` for ground) into `reference-media/<game>/hud-templates.json`.

`features` then measures every frame into `features.jsonl` beside its frames, one JSON line per frame:

- **Rows.** The original draws each row as runs of single colors; the video rings around every edge (H.264 errs by
  10–20 levels of luma there, against about 1 in even areas) and bleeds chroma across it. A row is therefore read as
  the piecewise-constant sequence of the model's colors, or no known color, of greatest likelihood (a Viterbi pass): a
  pixel of a known color lies about it by a Student t of one degree of freedom in luma and color difference at the
  even-area noise ingest measured (heavy tails take ringing in), a pixel of no known color anywhere in the 255³ cube
  alike, and each new segment costs its two parameters (where, which color) by BIC. Between road segments, a line color
  the pixels cannot tell from the segment's own within one more parameter's cost is taken (a white dash and a white
  rumble stripe may differ only in luma). Each edge between two known colors lies where luma, interpolated between
  pixel centres, crosses midway between their lumas, so edges are read to a fraction of a pixel; a row index `y` is
  seen at its centre, `y + 0.5`, and an edge at `x` is the continuous column `x`. Masked pixels are never measured.
- **Roads.** A road is a sequence of road and line segments with road among them, continuing under a mask; its edge is measured only where the
  segment beside it is a clean ground color (not unknown, masked, road or line) and its own end segment is road, or a
  line color that is nothing else (a white that may also be a rumble stripe could lie outside the edge). Each road keeps
  its most common road color, whose change between rows is a stripe edge. Lines are line segments with road on both
  sides (centre and width); rumble strips are rumble segments at a road's edge; medians are median segments between two
  roads.
- **Ground top.** The topmost row with road pixels (`roadTop`; a crest cuts the road there) and the topmost row whose
  unmasked pixels are mostly ground colors (`groundTop`).
- **Background.** The shift from the frame before above the ground (rows above `groundTop` − 2): horizontally the lag of
  the column profile of luma changes, vertically of the row profile, each the largest cross-correlation within 40
  (20) game pixels refined by a parabola.
- **HUD.** Each pixel's ink letter is the ink color nearest its luma (full resolution, where chroma bleeds across thin
  strokes) within a third of the luma distance at which a pixel stops being likelier a known color than none. Each readout
  cell is the template nearest its letters; the speed and clock are numbers when every cell reads a digit or blank. An
  event shows when every ink color of its template is read at more than half of that color's pixels (a misread is the
  exception, while the scene behind, a white sign or a dark hill, matches one ink at most); of several, the one read at
  the most pixels.
- **Pictures.** A pixel is of no ground color when its segment has no known color, or when the segment's pixels two or
  more pixels from both its ends (past chroma bleed and the strongest ringing) average to another RGB555 color than the
  segment's: the row reading takes each pixel alone, so a long run of a color close to a known one (a black tyre beside
  a shadow's dark grey) reads as that color, and its mean tells them apart.
- **Player.** Within the player mask, the largest 8-connected component of pixels of no ground color (shadows are
  ground's; strays such as a row the frame's edge bleeds into stand apart): the bottom edge of its lowest row and its
  leftmost and rightmost columns.
- **Objects.** Below `groundTop`, each 8-connected component of unmasked pixels of no ground color: its bounding columns
  and rows, its pixel count, and whether it touches the frame's edge, a mask or the ground top.

The horizon, landmarks and `D′` are measured from these by calibration and the landmark step.

**Noise levels.** For fake footage, `fake --exact n` writes every nth frame and the next as the original drew them,
and `noise` measures the same features on those frames (`exact-features.jsonl`) and on the video's frames at the same
indices (`exact-video-features.jsonl`), and writes, per feature, the mean and variance of the video's reading less the
exact one, with the count of readings the exact frame has and the video lacks (`noise.json`): road edges and lines
each pair with the video's nearest of their kind within 3 game pixels; the speed's and event's mismatch rates; the
player's bottom row and width; `roadTop`, `groundTop` and the background's shift.

## Calibration

`calibrate` measures the original's camera from every video of its first course together (`--video` names each) and
writes it into the footage model's `camera`, each value with its standard error; the person's draft holds the gauge
(`vehicle`, `width` and its reference) and `camera: null`.

- **Marks.** A frame's marks are its left road edges, right road edges and line centres from the ground top down, each
  kind linked row to row on its own, a point to the one on the next row that is its nearest while it is that one's
  nearest. Where a mark's point is missing on a row its nearest may be another mark's, so a mark breaks where its second
  difference exceeds three deviations of the frame's second differences (their robust spread, no less than rounding's
  √(6/12) px). Marks of five rows or more take part, each weighed by the inverse of its variance about its own parabola
  (a curve does not inflate it), no less than rounding's 1/12 px².
- **Straights.** In rows `w = y − y_v` below a vanishing point, a straight and level road's marks are
  `x = x_v + c_i·w`; ahead of a curve, to first order, `x = x_v + c_i·w + (C + c_i·E)/w`, with `C` from plan curvature
  and `E` from vertical curvature. The meeting set grows from the two longest marks: the mark that adds least joins
  while its residual through the point, at its own best slope, exceeds its own line's by no more than three deviations,
  so the sides of objects and sprites' runs of road colors stay out however many they are. A frame of three meeting
  marks or more is on a straight when BIC, each mark's variance known, prefers their meeting at one point both to each
  mark's own line and to the road ahead curving.
- **Horizon and centre.** `x₀` and `y₀` are the most frequent column and row of the straights' vanishing points (the
  peak of a kernel density of Silverman's width). A level straight is one whose vanishing row agrees with `y₀` within
  three deviations of both (its own from the fit, `y₀`'s), and is measured from `y₀`.
- **`K`.** On level straights, the stripe edges of the road under the player's column: the boundary between two rows of
  different road colors, `u` rows below `y₀`. Each edge is predicted on the next level frame at `1/u − Δs/K` (`Δs` the
  displayed speed's integral), and a prediction and an edge that are each other's nearest, within the two rows'
  rounding (the earlier magnified by the motion, `(u′/u)²`) and the motion's share of `K`'s uncertainty, continue one
  track. The tracks share one slope `−1/K` of `1/u` against `s`, each with its own intercept, by least squares weighted
  by `u⁴` (a row's rounding is `1/u²` in `1/u`); a track whose own slope departs from the others' by more than three
  deviations (its rounding, scaled by the tracks' robust spread) is no fixed stripe edge, such as one the drawing holds
  still near the horizon, and is left out. The standard error is clustered by track. From a rough start (single steps
  to the next edge below, their median weighted as the fit weighs them), following and fitting repeat until `K` moves
  by less than its standard error.
- **Gauge and player.** On level straights the player picture's base row stands `u` rows below `y₀` and spans `b`
  columns: `D′ = K/u` and `h = B·u/b`, then `f = K/h`. Each of `u` and `b` is the mean over the frames within three
  robust deviations (no less than a pixel) of their median, so turning pictures stand apart and the picture's columns,
  rounded at every lateral phase, average out.
- **Several videos.** Each video is measured on its own (`x₀`, `y₀`, `K`, `u` and `b`) and the original's values are
  their weighted means, each standard error scaled by the videos' disagreement (the square root of their reduced
  chi-square) when they disagree beyond their own errors, so differences between captures enter the errors. The base
  row is a whole row at one depth in every video, so its rounding (1/12 row²) is added after combining. Errors propagate
  to first order.
- **Background scroll.** `backgroundScale` stays null until the initial estimate measures it, since `Δθ` needs the
  road's heading and the camera's yaw that it solves.

## Initial estimate

All frames and rows are solved together as one linear least-squares problem. Each station is seen many times from far
to near, and that redundancy removes the noise.

1. **Position.** `s_c(t)` is the visual odometry of the nearest rows' stripe motion, scaled so that its total equals the
   integral of the displayed speed; without stripes it is that integral. `s = 0` is where the camera crosses the start
   line.
2. **Widths and lanes.** Measured on the nearest rows above the player and HUD masks, where curves and hills contribute
   by `d²` least: `W = h·(x_R − x_L)/u` at `s_c + K/u` on level road; elsewhere the depth authority places it.
3. **Plan.** The centreline's `r = (x_c − x₀)·d/f` is fitted to the forward model: `κ(s)` on a 1 m grid, and `l_c` and `ψ`
   for every frame, together, with the background's horizontal motion as more equations of the same system. It is
   linear in `κ`, and each `κ` meets only frames near in time, so the system is sparse.
4. **Height.** With `d` from the depth authority, `(y − y_h(t))·d/(f·cos φ) = Y_c(t) − Y(s)` gives `Y(s)`, with `y_h(t)` (or
   `φ(t)`) unknown per frame and the grade's constant from the pitch rule.
5. **Weights.** Each equation is weighted in game pixels: a lateral error `ΔL` is `(f/d)·ΔL` pixels. The initial
   estimate is thus already a least-squares fit of frame differences.
6. **Regularization.** Only a weak second difference, to bridge stretches no frame shows. Form comes from the
   [partition](#partition-into-course-form).

## Landmarks

Start, checkpoints, forks and goals are placed precisely:

- **Kinds.** The start line and the player's place at GO (the grid); a fork's beginning, where a median first widens
  from 0 (from the lane and median measurements); checkpoints (timing lines) and goals.
- **`D′`.** On level road, the player picture's base row `y_car` gives `D′ = K/(y_car − y_h)`. Timing happens at the
  player, `D′` ahead of the camera.
- **Two estimates.** Each timing line is placed twice:
  - from shape: the station of its gate or arch sprite (where its [inverse size](#position-and-size) reaches zero), or
    of a line painted on the road (from the appearance);
  - from time: `s_c(t_e) + D′` at the HUD event's time `t_e` (time added, the stage display changing, the clock and so on;
    which HUD change is the event is decided by a person looking at frames).

  The shape gives the station; the time checks it and tells which gate is the timing line. A difference beyond the
  time's quantization (the update period times half the speed) is reported.

- **Order.** Whether a fork begins before or after its checkpoint is measured, not assumed. In the course format a
  stage ends at its checkpoint, the Section's end, and the fork's lock and closure stand in the Section before it, as
  in OUTRUN TEST ([Test course](content-and-gameplay.md#test-course)); an order that does not fit this stops the work.
- **Sections.** Seams stand at checkpoints; a fork's lock and closure follow from its measured beginning by the
  format's rules.

## Partition into course form

- **Plan.** `κ(s)` is divided into straights (`κ = 0`) and arcs (constant `κ`) minimizing
  `Σ (κ_i − κ_element)²/σ_i²` plus a penalty per element (BIC: parameters × `ln n`), by dynamic programming (PELT or the
  like), with `σ_i` from the least-squares residuals. Arcs are written by length, radius and turn; curvature steps stay
  at their joints (there are no transition curves).
- **Profile.** `ν(s)` is divided the same way into constant grade (`ν = 0`) and vertical curves (constant `ν`). A
  vertical curve over `[a, b]` is written as a PVI at its middle with `curveLength = b − a`, the PVI's height where the
  tangents before and after meet.
- **Lanes.** Lanes and medians are counted from the lane lines. Each width is one number, written at Positions only
  where it changes, divided by the same method.
- **Rounding.** The course command's cleaning operations (rounding steps, removing unneeded knots) apply; what they
  move, the [replay comparison](#replay-comparison) restores.

## Appearance

The ground's appearance is taken from the footage alone: road colors and light–dark stripes, rumble strips, white lines
and lane dashes, the colors and stripes beyond the road, and where they change.

- **Back-projection.** Each frame's ground pixels map back to `(s, l)` through the solved course and pose, by the
  product projection's inverse (a row gives `s`; within a row, `x` maps to `l` affinely).
- **Collection.** On an `(s, l)` grid, each cell takes its most frequent color cluster, observations with a small
  footprint (near ones) weighing more. The original draws one color per scan line, so distant stripes alias: rows whose
  `s` step exceeds half a stripe period are left out of the appearance and its comparison.
- **Across.** Each cluster's edges are measured as offsets from the nearest lane line or road edge and held constant
  (the median); laterals are written as lane references `{lane, side, offset}` or Boundaries.
- **Along.** A cluster's change stations give its period `P`, phase and duty by least squares, written as a `repeat`
  (`every = P`); a new repeat starts where period, phase or color change. Rumble strips are `curb`s; lane dashes a strip
  in a repeat; road-wide light–dark stripes a road-wide strip in a repeat; beyond the road, a strip open on one side
  (`null`) in a repeat.
- **Order.** Ground beyond the road, the road, the road's light–dark stripes, then lines and rumble strips, as later
  Strips overwrite earlier ones.
- **Colors.** Cluster centres as RGB555. Where a color changes along `s` (a stage's color change, a gradual change), each
  step is a Strip of its own.
- **Materials.** From the footage model's role table. The drivable width beyond the road is measured where a video leaves
  the road, otherwise taken from the footage model.
- **Limits.** The course format's limits (`activeStrips` and the rest) are kept; a course that exceeds one stops the work.
- **Environment.** A background change's station is an environment knot. The background picture and its arrival follow
  how the series is made, not the footage.

## Course-fixed sprites

What stands fixed on the course is taken with its outline, position and size exact and its color approximate: things on
the ground, things fixed on the road (a cone counts at the place it stands) and things fixed in the air (a sign over a
gate). The original's picture inside the outline is never taken.

### Finding and tracking

- **Candidates.** Connected components of: ground pixels of no ground cluster, and sky pixels unlike the background
  mosaic (built from the measured background shifts as reference data in `reference-media/`, never committed), with the
  HUD, the player and its shadow masked.
- **Tracking.** A course-fixed thing's place follows from the solved pose; it is tracked by that prediction, and tracks
  that do not fit a fixed thing (traffic, rivals) are dropped.
- **Overlap.** Pixels are assigned in depth order, far to near as drawn, and reassigned as estimates improve.
- **Unknown pixels.** What the frame's edge cuts off or another thing hides is unknown, not transparent.

### Position and size

Thing `i` has a base point (its lower edge's middle) at `s_i`, `l_i`, a height `g_i` above the road, and a world width
`w_i` and height `H_i`. As in the product it is a board facing the camera:

```text
d_i(t) = s_i − s_c(t)
left, right columns = x₀ + (f/d_i)·(r_i(t) ∓ w_i/2)
bottom row = y_h(t) + (f/d_i)·(Y_c(t) − Y(s_i) − g_i)·cos φ(t)
top row = bottom row − (f/d_i)·H_i            (pitch handled as the product draws it)
```

- **`s_i` and `w_i`.** `1/width = (s_i − s_c(t))/(f·w_i)` is linear in `s_c`: regressed over every frame, its zero gives
  `s_i` and its slope `w_i`. The zero does not move if the original draws sprites at a constant factor off the road's
  scale.
- **`l_i`, `g_i` and `H_i`.** From the centre column, the bottom row and the top row, by least squares in game pixels.
- **Two sizes.** (a) By the scale above. (b) By the ratio to the road's width at the same depth, times `W`. If (a) and
  (b) differ by one factor for every thing, the original draws sprites off the road's scale (a depth-cue disagreement):
  (b) is taken and the factor reported. The product draws road and sprites at the same `f/d`, so keeping each thing's size
  relative to the road keeps it looking the same.
- **Lateral.** Both as a number and as an offset from the nearest road edge or lane line; within a row of things of one
  kind, whichever is constant is written. A row following an edge whose width changes is written by reference.
- **Height.** A thing in the air has `g_i > 0`; one standing below the road has `g_i < 0`.

### Outline

The original is taken to scale its sprite pictures by nearest texel (this is checked), so each frame's pixel shows one
texel of the original picture.

- **Board coordinates.** Each frame's pixels of a thing map to its board's `(p, q)` (metres, right of and above the base
  point): `p = (x − x_base)·d/f`, `q = (y_bottom − y)·d/f`.
- **Texel grid.** The original texel size `τ` (m) and the grid's phase are those that put the steps of magnified frames
  (a texel larger than a pixel) on texel boundaries.
- **Shape.** Each texel's inside or outside is a vote over all frames, observations with a footprint under one texel
  weighing more; every thing of one kind votes together. A kind never seen magnified is resolved by super-resolution
  from the frames' differing phases, and the resolution actually reached is recorded.
- **Changing pictures.** If votes split by scale range, the original changes its picture with distance (LOD): each range
  keeps its shape, the nearest range's is the thing's shape, and the change distances are recorded. A picture changing
  periodically in time is an animation: its frame count and period are recorded.
- **Mirroring.** Pictures reused mirrored are detected and recorded.
- **Outline.** The shape, as texel steps, is a polygon in metres, not smoothed: the outline at the original's resolution.
- **Shadow.** Road pixels under a thing darkened by one ratio (the original's shadow drawing) are its shadow, recorded
  as a shape on the road's `(s, l)`.
- **Color.** Per kind, the one RGB555 color covering the largest area inside the outline (approximate).

### Kinds and rows

- **Kinds.** Outlines normalized by size, with their approximate color, group into kinds. One picture placed at several
  sizes is one kind, each thing keeping its size.
- **Rows.** A kind standing at a constant spacing along `s` is a row: spacing, start, end, side and lateral, written as a
  `repeat`. Where the spacing varies beyond the noise level, each thing is placed alone.
- **Groups.** Gates and arches built of several parts are a thing per part, recorded as one group.

### Outline boards

- **Picture.** Each kind becomes one course image whose only content is its outline: a
  [sprite image](image-assets.md#completed-sprite-images) whose master is the outline polygon filled at this game's
  40 texels/m, a texel opaque when its centre lies inside. Where the original texel is not a whole multiple of 1/40 m an
  edge moves by up to half a texel (1.25 cm), whose largest value is reported; detail finer than 40 texels/m is lost and
  reported.
- **Anchor.** The base point of [Position and size](#position-and-size).
- **Color.** Every opaque texel is the kind's one color, palette slot 1. No inner pattern, lettering or color division is
  drawn.
- **Exceptions.** A thing whose outline is itself a logo or a character's shape (a character-shaped sign, a standing
  board) becomes a board of its bounding rectangle and is listed in the report.
- **Mirroring.** A kind reused mirrored becomes two images; a symmetric one stays one.
- **Animation.** A changing picture keeps its first frame's outline and is reported.
- **Shadow.** An observed shadow becomes the image's `shadow`: its shape on the road seen by the size-0 camera of the
  [picture contract](image-assets.md#picture-contract).
- **Movable objects** (cones and the like). The standing, airborne and landed images may be the one board (the format
  lets a body name an image twice). Without an observed shadow, the shadow is the object's square seen by the size-0
  camera, as the provisional ones are.
- **Making.** The board's picture and its recipe are saved under `content/sprite-sources/` and the course image written
  through `courseImageFile`, as every sprite is made ([Sprite operations](image-assets.md#sprite-operations)).
- **Bodies.** A thing in the air is `null` (pass-through). Whether a thing on the ground is solid is decided per kind by
  a person looking, and listed in the report for K to correct. A solid thing's width is the width of the outline's
  lowest texel row (where it meets the ground).

## Replay comparison

- **Replay.** The footage model's camera (`x₀`, `y₀`, `f`) at each frame's solved pose (`s_c`, `l_c`, `ψ`, `Y_c`, `φ`)
  draws the course through the product scene and renderer, without the player or traffic. An original frame that fits
  in 320×240 is placed on the logical frame at the game pixel grid; a larger one needs the renderer's frame size as an
  argument, a generalization with no branch for an original.
- **Depths compared.** Only rows the product draws (depths 2.5–200 m) are compared; farther rows serve the initial
  estimate alone.
- **Features.** The same extractor runs on both frames. Compared: road edges, lane lines and the centreline; the row where
  a crest cuts the road and stripe-edge rows; the background's angle (horizontal and vertical); the agreement of color
  clusters; each sprite's bounding rectangle, base point and outline agreement (against the product renderer drawing its
  outline board).
- **Update.** Gauss–Newton (or Levenberg–Marquardt) over every parameter: plan lengths and radii, PVIs, lane widths, each
  Strip's period, phase and edges, sprite places and sizes, and the poses. A parameter acts only on frames that show it,
  so its Jacobian comes from local differences.
- **Form changes.** Once the continuous parameters converge, the partition is redone only where residuals along `s`
  keep one sign (elements split or merged), BIC preventing over-division.
- **End.** The weighted residuals' χ² per degree of freedom cannot be told from 1, and residuals along `s` show no
  significant structure (their sign changes are as many as noise gives). The noise level comes from the video's
  calibration intervals and from fake footage under the same conditions. There is no fixed threshold without a basis.
- **Unexplained.** Residuals that do not converge are set against the inconsistency amount and reported as the
  original's inconsistency or as unexplained.

## Several videos of one course

K supplies two or more videos of each course. The course is one; each video is an independent observation.

- **Parameters.** The course's (plan, profile, lanes, Strips, sprites) are one set for every video; poses are each
  video's own.
- **Alignment.** The videos' stations are first matched by the start line and by cross-correlating ground-color maps.
  After that each video's pose is solved against the course, so videos are never aligned with each other directly.
- **Comparison.** Each video is replayed and compared on its own; every update is one least-squares problem over all
  videos' residuals, which are reported per video.
- **Length.** `K` belongs to the original, so every video's displayed speed calibrates it together. The spread of each
  video's start-to-end length (its own integral of displayed speed) is reported.
- **Leave one out.** After convergence the course is solved again without video `k` and compared with video `k`. If each
  such prediction's residual lies within the noise level, the course does not depend on the number of videos; a video
  that does not is reported (over-fitting, or a fault of that video).
- **Disagreement.** Videos that disagree beyond the noise level (another edition or cabinet, another course) stop the
  work.

## Footage observations

A course's footage observations are `superoutride.footage-observations` version 1, at
`content/footage/<game>/<course>.observations.json`: production-only numbers, which the core neither reads nor delivers.

| Field           | Contents                                                                                                                                          |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `course`        | The course document it made, by file name stem                                                                                                    |
| `videos`        | Each video's name, edition and cabinet, SHA-256, [capture values](#capture-values), start-to-end length and residuals                             |
| `plan`          | Each solved element with its standard errors                                                                                                      |
| `profile`       | Each PVI with its standard errors                                                                                                                 |
| `lanes`         | Lane and median widths, measured, with the country's lane standard                                                                                |
| `landmarks`     | Each start, grid, fork beginning, checkpoint and goal: its station from shape and, per video, from time, with their difference                    |
| `appearance`    | Each Strip's period, phase, duty, edges and color as measured; environment knot stations                                                          |
| `sprites`       | Kinds (world size, texel size and resolution reached, LOD, animation, mirroring, color, body proposal, scale factor to the road), things and rows |
| `inconsistency` | The inconsistency amount along `s` by depth range, and residuals that did not converge                                                            |
| `departures`    | Remaster departures and assumptions, as text                                                                                                      |

Outline evidence (the original-resolution texel shapes and per-frame masks) stays in `reference-media/`, from which the
tool makes it again deterministically from the videos.

## Fake footage and the round-trip test

Before any original's video, the whole procedure passes a round trip on footage of a known course.

- **Truth.** Four OUTRUN TEST stages, COASTLINE, CLIFF ROAD, FARMLAND and INTERCHANGE (27.6 km), with hills, a jump,
  tight curves, lanes that appear and end, medians, wet road and dirt, and drawn sprites: trees, signs, gates, an
  overpass, sea stacks standing below the road, cones and spectators. The generator makes this truth course
  (`outrun-test-route`) from the saved OUTRUN TEST document:
  - the stages are chained in that order, each through OUTRUN TEST's own Link to the next stage where it has one and
    its left exit otherwise; every other exit keeps its fork (lock, closure and signs) and leads to a stub, a 400 m
    level straight of two lanes ending in a finish, enough for the view past the seam;
  - walls and course-limit openings are left out, since footage does not raise walls;
  - checkpoint arches stand at their seams, where timing happens, not 12 m past them;
  - a row of cones (movable objects) lines INTERCHANGE's first lane taper;
  - each median is drawn as OUTRUN TEST's generator means to and does not (grass in 40 m light and dark stripes, a
    solid line inside each road's edge along it), so that footage shows it.
- **Camera.** The fake original's frame is 320×224 game pixels (the top of the logical frame) seen from `f` = 200 px,
  `h` = 1.6 m, `x₀` = 156, `y₀` = 98, `a` = 150 px/rad and `D′` = 4 m, pitching with the road's chord from the camera
  to the player (pitch rule `road`), the camera `h` above the road beneath it. Each frame's camera stands at its pose
  `(s_c, l_c, ψ, φ, Y_c)` exactly as replay places it; its lateral puts the player's base point on the centre column.
  As in an original, the player stands where its picture's lowest row meets the road, `D′` from the camera, and timing
  happens there; the product picture's own base point, the footprint's centre, stands 5.19 m from the camera, since
  TESTAROSSA's picture seen from behind reaches 0.48 m below it (`D = D′·(h + e)/h` for a reach `e`).
  The product camera's own values are 240 px, 2 m, 160, 120 and `a = f`, its player 6 m away.
- **Drive.** From the pole, 3 s at rest, GO, then the speed the road's curvature allows (8.5 m/s² across, top speed
  288 km/h varied smoothly), weaving across the taken road's two lanes, the camera looking aside by 0.03–0.08 rad for
  2–3 s every 8–18 s; past the goal it slows to 30 m/s and ends 60 m before the course's end. The HUD shows the speed in
  whole km/h (the player's chainage rate), a clock, the stage and the events GO, TIME BONUS (each checkpoint) and GOAL
  for 2 s, all in text tiles. Traffic (GOLF GTI 16V, DELTA HF INTEGRALE and 911 TURBO 3.3, about two per kilometre at
  27–36 m/s) keeps a lane of the taken road and is passed at least 2.6 m aside, hiding what lies behind it.
- **Capture.** Each video scales the game frame by a whole factor with nearest pixels into a larger frame with black
  margins and encodes it with H.264, in its own range and matrix; the 30 fps video keeps every other frame. Corrupted
  versions are made inside the generator only, never in the product renderer:
  - `hills`: while the camera passes within 60 m of a vertical curve, rows below the horizon move by up to 10 game
    pixels, down over crests and up over sags, easing over 60 m: a change not consistent with depth;
  - `player`: the frame drawn without the player, its picture laid over at 1.3 times the road's scale where its base
    point projects: a player off the road's scale.

  | Video    | Seed | fps | Scale | Video size | Margins (left, top) | CRF | Range, matrix   | Corruption |
  | -------- | ---: | --: | ----: | ---------- | ------------------- | --: | --------------- | ---------- |
  | `a`      |    1 |  60 |     3 | 1280×720   | 160, 24             |  23 | limited, BT.709 | none       |
  | `b`      |    2 |  60 |     2 | 854×480    | 107, 16             |  27 | limited, BT.601 | none       |
  | `c`      |    3 |  30 |     4 | 1440×1080  | 80, 92              |  25 | full, BT.709    | none       |
  | `hills`  |    4 |  60 |     3 | 1280×720   | 160, 24             |  23 | limited, BT.709 | hills      |
  | `player` |    5 |  60 |     3 | 1280×720   | 160, 24             |  23 | limited, BT.709 | player     |

- **What a person would write.** `fake` also writes, under `reference-media/fake/`, what a person would after looking at
  the fake original's frames: its footage model draft (every OUTRUN TEST ground color of the truth course with its
  roles, the halved shadows of them, the HUD's readouts and event places with their ink colors, the masks, and the
  gauge: TESTAROSSA at the width the fake original draws it, as a person names an original's player vehicle and its
  real width) and its HUD templates.
- **Truth written.** `reference-media/fake/outrun-test-route/` holds the truth course document and, per video,
  `video.mp4` and `truth.json` (`superoutride.fake-footage-truth` version 1): the stages and their route stations, the
  video's capture, the camera (with `D′`), the gauge vehicle's and the traffic's overall widths and the widths their
  pictures are drawn at (a picture's width at the road scale of its lowest row, wider than the vehicle since the picture
  is a view in perspective), the corruption and its intervals, the landmarks (start line, pole, checkpoints, fork
  beginnings and finish, in route stations), the HUD's events with their frames and times and its layout, the traffic,
  and every kept frame's time, pose, player place, speed and displayed km/h.

It passes when:

- **Footage model.** `f`, `h`, `y₀`, `x₀`, `a` and `D′` equal the truth under the true vehicle's width as the gauge, with
  their errors reported; lane widths, as results, equal the truth.
- **Course.** The recovered course and the true one, drawn from the same camera and trajectory, differ in every
  feature by less than one game pixel and by no more than the noise level.
- **Appearance.** Strip colors equal the truth in RGB555, and periods, phases and edges are confirmed by the agreement of
  color clusters.
- **Sprite places and sizes.** The reprojection of `s`, `l`, `g`, `w` and `H` lies within one game pixel and the noise
  level.
- **Sprite outlines.** The texel size (1/40 m) and phase are recovered. For things seen magnified at their nearest, each
  board equals the true image's alpha texel for texel; the fraction of texels left undecided is reported.
- **Sprite kinds.** Things of one picture make one kind, and LOD changes fall at the product's LOD selection distances.
- **Corrupted versions.** The inconsistency amount rises over the corrupted hills and nowhere else. The player off the
  road's scale is detected, the gauge taken from traffic, and the footage model still equals the truth.
- **Several videos.** Solved together they meet every condition above, and each leave-one-out prediction lies within
  the noise level; differing capture comes back as each video's own capture values.
- **Landmarks.** Start, checkpoints and goal from shape equal the truth within the noise level, and differ from the
  stations from time by no more than the time's quantization; `D′` equals the truth.
- **Noise levels.** Each feature's noise level is recorded per footage condition (scale, compression, frame rate) and
  serves the comparison's weights and its end.

## Procedure

For each course, K supplies two or more videos, the original's name, and its edition and cabinet.

1. **Ingest** each video into `reference-media/<game>/<course>/<video>/`, as game-pixel PNG frames, with its capture values.
2. **Footage model.** The original's first course makes it from all its videos: color clusters and roles, HUD templates
   and timing events, masks, calibration (`D′` included), the projection-form check, the depth authority, the pitch rule
   and the gauge (`B`, the vehicle measured, the player's scale factor, whether every vehicle is one width). Its numbers
   are saved at `content/footage/<game>/footage-model.json`. Later courses keep it frozen and check it; a contradiction
   stops the work.
3. **Features** of each video.
4. **Initial estimate and inconsistency amount,** over all videos together.
5. **Landmarks:** start, forks, checkpoints and goals.
6. **Partition** into the course document's draft. Seams are at checkpoints; gate structures (fork parts, goals, grids)
   follow the format's rules and OUTRUN TEST's construction at the measured stations. A fork's parted roads are not taken
   from the footage, so two roads are never drawn in one frame.
7. **Appearance.**
8. **Sprites,** their outline boards made and placed on the course.
9. **Replay comparison,** each video replayed and the course updated from every video's residuals until it ends, then
   leave one out.
10. **Product checks:** the course compiles; the course report; `npm run measure` (racing lines and reference times).
11. **Report** ([below](#report)).

The original's lap or stage times are never fitted: reference driving sets the game's time limits as for every course.
The former trial rule (the strongest curve at 0.75 of the lateral limit, the others in proportion to the background's
turn) is not used; the lateral acceleration each curve needs at the original's displayed speed is only reported.

## Report

- Each video's residuals, each leave-one-out prediction's residual and the spread of the videos' lengths.
- Landmarks: each one's station from shape, from time and their difference, per video; the order of forks and
  checkpoints.
- Gauge: `B` and the vehicle that measured it, the player's scale factor, whether every vehicle is one width; lane and
  road widths beside the country's lane standard.
- The lateral acceleration each curve needs at the original's displayed speed.
- Where the vehicle leaves the ground at the original's speed (`v²·ν` beyond gravity over a crest).
- The inconsistency amount along `s`, and residuals that did not converge.
- Sprite kinds: count, world size (`w × H`), texel size and resolution reached, the largest outline shift at
  40 texels/m, LOD, animation, mirroring, color, body proposal, and the sprites' scale factor to the road.
- Things made bounding-rectangle boards (logos, character shapes).
- Remaster departures, and the time the procedure took.
- A side-by-side of each video and its replay, made in `reference-media/`. Neither the repository nor a PR holds the
  original's pixels: a PR shows only the product's pictures and numeric diagrams (SVG).

## Stopping conditions

The work stops and reports when:

- ffmpeg or another external tool cannot be made available;
- the round trip on fake footage does not pass after fixing the tool, for no understood reason;
- the renderer or projection needs a change that is not a generalization;
- on a real video: the speed readout cannot be read or is absent; there is no level straight to calibrate on; the
  projection form fails with no agreeing set of depth cues; no vehicle is drawn at the road's scale, so there is no
  gauge; a later course contradicts the original's footage model; videos of one course disagree beyond the noise
  level; the order of forks and checkpoints does not fit the format; the comparison does not converge to the noise
  level (reported with its residual map); or the course exceeds a format limit such as `activeStrips`.
