# SUPER OUTRIDE

A 320×240 raster pseudo-3D browser driving game. Cars and bikes share world coordinates, suspension
contacts, tires and wheel mechanics. Saved CourseDocuments supply RIBBON COAST, RIBBON FORK and
RIBBON RING through one driving scene: provisional linear, fork/merge and circuit courses with ordered
Band ground. Four legacy resident-ground courses remain available during the Stage 4a comparison.

[Play the game](https://sayaborg.github.io/superoutride/).
[Specifications](docs/README.md) identify each contract's owner; [NEXT](docs/NEXT.md) owns future work.

## Run

Use Node.js 24:

```sh
npm ci
npm test
python3 -m http.server 8000
```

Open `http://localhost:8000/`. Build stages saved content, completed sprites and Session data under
`dist/content/`, plus resident RGB555 payloads for legacy courses only. Band constructs compile to
immutable color fields before driving starts. DEV independently switches EXACT / LEVEL along s and
POINT / BOX / TENT along l, with immediate redraw and timing observations.

## Controls and authoring

[Browser](docs/browser.md) defines keyboard/touch operation, Session setup, URLs and DEV controls.
[Development](docs/development.md) lists course compilation, PNG previews, reports, graphics tools and
audio auditions. Authored content lives under `content/`; generated outputs are disposable.

## Structure

| Directory                                                 | Responsibility                                    |
| --------------------------------------------------------- | ------------------------------------------------- |
| `src/core`, `src/course`                                  | Coordinates, geometry and saved course schema     |
| `src/compiler`, `src/authoring`                           | Immutable course graph and authoring transactions |
| `src/runtime`                                             | Occurrences, driving readers and shared scene     |
| `src/physics`, `src/vehicle`                              | Mechanics and vehicle profiles                    |
| `src/input`, `src/camera`, `src/audio`                    | Input, camera observation and sound               |
| `src/gameplay`                                            | Recovery, progress, timing and drivers            |
| `src/graphics`, `src/visual`, `src/terrain`, `src/render` | Images, projection and rendering                  |
| `src/groundmap`                                           | Legacy ground compilation and resident readers    |
| `src/browser`                                             | Controls, scheduling and driving shell            |
| `src/dev`                                                 | Sprite authoring preview fixtures                 |

`src/main-course.ts` is the driving composition root. [Architecture](docs/architecture.md#layer-boundaries)
defines the current layer dependencies.
