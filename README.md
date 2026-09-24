# SUPER OUTRIDE

A 320×240 raster pseudo-3D browser driving game. Cars and bikes share world coordinates, suspension
contacts, tires and wheel mechanics. Saved CourseDocuments supply RIBBON COAST, RIBBON FORK and
RIBBON RING through one driving scene: provisional linear, fork/merge and circuit courses with ordered
Strip surfaces.

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
`dist/content/`. Strip constructs compile to immutable color and material fields before driving starts.
The product display setting defaults to LEVEL-POINT; DEV provides its live selector.
[Architecture](docs/architecture.md#band-rendering) defines the three available methods.

## Controls and authoring

[Browser](docs/browser.md) defines keyboard/touch operation, Session setup, URLs and DEV controls.
[Development](docs/development.md) lists course compilation, PNG previews, reports, graphics tools and
audio auditions. Authored content lives under `content/`; generated outputs are disposable.

## Structure

`src/` is the product root; `tools/` is the authoring/build root. TypeScript tools consume product source and share its strict type/lint checks. [Development](docs/development.md#typescript-tools)
describes execution and browser-tool delivery.

[Architecture](docs/architecture.md#layer-boundaries) defines the product layer order, responsibilities and dependency rules.

`src/shell/boot.ts` selects the entry; `src/shell/main-course.ts` is the driving composition root.
