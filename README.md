# SUPER OUTRIDE

A 320×240 raster pseudo-3D driving game for the browser. Cars and bikes share world coordinates, suspension contacts, tires and wheel mechanics.

[Play the game](https://sayaborg.github.io/superoutride/). The default LINEAR is a development 2.94 km saved CourseDocument with curves, hills, variable widths, shoulders, row scenery and two environments.
[Specifications and restart checkpoint](docs/README.md) identify each contract's owner.

## Run

Use Node.js 24.

```sh
npm ci
npm test
python3 -m http.server 8000
```

Open `http://localhost:8000/`. Build validates and stages course JSON, images and completed resident RGB555 in `dist/content`. Ground loads once before driving.

## Controls

Left/right arrows steer. Up or X accelerates; down or Z brakes. Backspace recovers the vehicle.
On touchscreens, the left half controls steering and the right half controls throttle (up) and brake (down). Each finger's initial position is its origin; 64 CSS pixels gives full input.

Open DEV for vehicle, camera, calibration and sound controls. The performance HUD shows FPS, frame/step time and the maximum seam commit time, plus resident ground bytes/tiles/Sections. Key 1 selects LINEAR; key 2 selects the two-Section SEAM trial; key 3 selects the two-lap CIRCUIT with two rivals; key 4 selects BRANCH with two paths and a shared finish. D, M and ACT use minus/value/plus controls; steps wrap at their limits. Physics and audio tuning remain deferred (DEV_UNCALIBRATED).

## Authoring and tools

The [production CLI](docs/development.md#agent-production-tools) measures calibrated frames, fits saved observations, compiles CourseDocuments, renders PNG sequences through the browser scene and reports profiles/plan views. Product content lives in `content/courses` and `content/images`.
The [Sprite Tool](tools/graphics/sprite-tool.html) and [Sprite LOD preview](tools/graphics/sprite-lod.html) retain the existing image authoring workflow.
[Audio audition](tools/audio/audio-browser.html) uses the same local HTTP server.

## Structure

| Directory                                                 | Responsibility                                          |
| --------------------------------------------------------- | ------------------------------------------------------- |
| `src/core`, `src/course`                                  | Finite coordinates, geometry and authored course schema |
| `src/compiler`, `src/authoring`                           | Immutable course graph and authoring transactions       |
| `src/runtime`                                             | Occurrences, driving readers and shared scene assembly  |
| `src/physics`, `src/vehicle`                              | Common mechanics and production vehicle profiles        |
| `src/input`, `src/camera`, `src/audio`                    | Input, observation and sound                            |
| `src/gameplay`                                            | Recovery, race progress, gates and drivers              |
| `src/graphics`, `src/visual`, `src/terrain`, `src/render` | Images, projection and rendering                        |
| `src/groundmap`                                           | Offline ground compilation and resident RGB555 readers  |
| `src/browser`                                             | Controls, scheduling and driving shell                  |
| `src/dev`                                                 | Regression fixtures and diagnostics                     |

`src/main-course.ts` is the sole driving composition root. Parsed repository hygiene checks enforce layer boundaries.
