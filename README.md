# SUPER OUTRIDE

A 320×240 raster pseudo-3D driving game for the browser. Cars and bikes share world coordinates, suspension contacts, tires and wheel mechanics.

[Current specifications and restart checkpoint](docs/README.md) identify the owner of each technical and development contract. [Play the game](https://sayaborg.github.io/superoutride/).

## Run

Use Node.js 24.

```sh
npm ci
npm test
python3 -m http.server 8000
```

Open `http://localhost:8000/`. See the documentation index for the complete development workflow.

## Controls

Left/right arrows steer. Up or X accelerates; down or Z brakes. On touchscreens, the left half controls steering and the right half controls throttle (up) and brake (down). Each finger's initial position is its origin; 64 CSS pixels of displacement produces full input. Keyboard and touch share input arbitration.

Use the selectors for vehicle, course and calibration. Course keys 1–4 select LINEAR / BRANCHING / TSUKUBA / FISCO. Their URLs are `?mode=linear`, `?mode=branching`, `?mode=circuit` and `?mode=fisco`; BRANCHING is the default.

See [current calibration values and meanings](docs/calibration.md).

## Structure

| Directory       | Responsibility                                                                   |
| --------------- | -------------------------------------------------------------------------------- |
| `src/core`      | Open Raster/Guide coordinates, height, projection and shared metrics             |
| `src/course`    | Authored cross-sections, stage views and Raster authoring                        |
| `src/input`     | Keyboard/touch input and arbitration                                             |
| `src/physics`   | Common vehicle mechanics, surfaces and control                                   |
| `src/vehicle`   | Production identities and compiled profiles                                      |
| `src/camera`    | Camera observation and follow policy                                             |
| `src/gameplay`  | Physical route gates, laps, sessions, rivals and recovery                        |
| `src/graphics`  | Framebuffer, color codec, sprite blitting and Painter primitives                 |
| `src/visual`    | Background/sprite assets and visual sections                                     |
| `src/road`      | Terrain projection and scanline geometry                                         |
| `src/groundmap` | Logical/baked ground readers, baking and filtering                               |
| `src/render`    | Scene pipeline and projected course/vehicle presentation                         |
| `src/runtime`   | Course compilation, unfolding and actor/gameplay composition                     |
| `src/browser`   | DOM controls, selectors, scheduling and driving shell                            |
| `src/dev`       | Concrete courses, regression fixtures and diagnostics in separate subdirectories |

`src/main.ts`, `src/main-linear.ts` and `src/main-circuit.ts` are the browser composition roots selected by boot. The dependency boundary is enforced by repository hygiene tests.
