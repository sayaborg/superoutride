# SUPER OUTRIDE

A 320×240 raster pseudo-3D browser driving game. Cars and bikes share world coordinates, suspension
contacts, tires and wheel mechanics. Saved CourseDocuments supply RIBBON COAST, RIBBON FORK and
RIBBON RING through one driving scene: provisional linear, fork/merge and circuit courses with ordered
Band ground.

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
`dist/content/`. Band constructs compile to immutable color fields before driving starts.
The product display setting defaults to LEVEL-POINT; DEV currently provides its live selector.
[Architecture](docs/architecture.md#band-rendering) defines the three available modes.

## Controls and authoring

[Browser](docs/browser.md) defines keyboard/touch operation, Session setup, URLs and DEV controls.
[Development](docs/development.md) lists course compilation, PNG previews, reports, graphics tools and
audio auditions. Authored content lives under `content/`; generated outputs are disposable.

## Structure

`src/` is the product root; `tools/` is the authoring/build root. TypeScript build tools consume product
source and share its strict type/lint checks. [Development](docs/development.md#typescript-tools)
describes execution and the remaining JavaScript tool migration.

| Directory     | Responsibility                                                                                                   |
| ------------- | ---------------------------------------------------------------------------------------------------------------- |
| `src/core`    | General mathematics, vectors, planar transforms, validation helpers and tolerances                               |
| `src/image`   | Indexed images, RGB555/RGBA codecs, palettes, sprite/LOD formats, BG tiles and image filters                     |
| `src/audio`   | Sound synthesis and audio engines                                                                                |
| `src/course`  | Course documents and compilation, road geometry, materials, occurrences, environment profiles and geometry views |
| `src/vehicle` | Vehicle mechanics, definitions, catalog and accepted operation requests                                          |
| `src/input`   | Keyboard/touch adapters and arbitration producing vehicle operation requests                                     |
| `src/race`    | Sessions, progress, gates, timing, drivers, recovery, reference driving and envelopes                            |
| `src/view`    | Cameras, projection, ground rows, sprite placement, drawing composition and framebuffer                          |
| `src/shell`   | DOM, frame loop, HUD, DEV, startup and whole-scene composition                                                   |

`src/shell/boot.ts` selects the entry; `src/shell/main-course.ts` is the driving composition root.
[Architecture](docs/architecture.md#layer-boundaries) defines the domain order and dependency rules.
