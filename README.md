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

For engine tuning while driving, open `http://localhost:8000/?mode=circuit` and use ENGINE TUNING
above the game. `http://localhost:8000/tools/audio-browser.html` is the separate audition page;
serve both over HTTP, rather than opening HTML files directly. See the [audio specification](docs/audio.md)
for the signal path, parameters and approximation limits.

## Controls

Left/right arrows steer. Up or X accelerates; down or Z brakes. On touchscreens, the left half controls steering and the right half controls throttle (up) and brake (down). Each finger's initial position is its origin; 64 CSS pixels of displacement produces full input. Keyboard and touch share input arbitration.

Use the selectors for vehicle, course and calibration. D, M and ACT use minus/value/plus controls; each step wraps at its range limit. Course keys 1–4 select LINEAR / BRANCHING / TSUKUBA / FISCO. Their URLs are `?mode=linear`, `?mode=branching`, `?mode=circuit` and `?mode=fisco`; BRANCHING is the default.

Sound starts on the first supported interaction. SOUND START begins or resumes audio; SOUND ON/OFF
toggles mute, and VOL adjusts volume. On iPhone, disable silent mode and raise media volume if needed.
ENGINE TUNING shares eight provisional minus/plus controls with the audition page. Changes fade;
reset restores defaults, vehicle replacement retains tuning, and page/course reload resets it.
Player and nearest-rival engines use the accepted native-rate sample-free waveguide. Wind is deferred.

TIRES: CURRENT / TIRES: CONTACT switches player tire sound while driving, with independent front/rear
state and only tire output fading. CURRENT is the reload default. CONTACT adds rolling rumble,
higher-pitched friction vibration and separate pavement/shoulder/grass/dirt/sand sketches; its mapping
is provisional, not calibrated local tire physics. Both are retained comparison references. The next
task is to choose a third method, not assume CONTACT is the final model or merely optimize it; start
from the [specification index and checkpoint](docs/README.md). The
[development guide](docs/development.md#tire-comparison-tools) distinguishes both audition tools.

See [current calibration values and meanings](docs/calibration.md).

## Structure

| Directory       | Responsibility                                                                   |
| --------------- | -------------------------------------------------------------------------------- |
| `src/core`      | Open Raster/Guide coordinates, height, projection and shared metrics             |
| `src/course`    | Authored cross-sections, stage views and Raster authoring                        |
| `src/input`     | Keyboard/touch input and arbitration                                             |
| `src/physics`   | Common vehicle mechanics, surfaces and control                                   |
| `src/vehicle`   | Production identities and compiled profiles                                      |
| `src/audio`     | Procedural audio voices and read-only acoustic contracts                         |
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
