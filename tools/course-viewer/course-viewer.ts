import { mustGet } from '../../src/shell/dom.js';
import { loadContentManifest } from '../../src/content/content-delivery.js';
import { loadSurfaceMaterials } from '../../src/content/surface-material-catalog.js';
import { loadDeliveredCourse } from '../../src/content/load-delivered-course.js';
import { readCourseDocumentBytes, type CourseDocument } from '../../src/course/course-document.js';
import { CAMERA_DEFINITION } from '../../src/view/camera-definition.js';
import { createCameraRig, updateCamera } from '../../src/view/camera.js';
import { LOGICAL_HEIGHT, LOGICAL_WIDTH } from '../../src/view/display-scale.js';
import { backgroundYawX } from '../../src/view/tile-background.js';
import { stationIndexAt } from '../../src/course/geometry/station-sequence.js';
import { transformPlanarPoint } from '../../src/core/planar-transform.js';
import { expandRgb555Pixels } from '../../src/image/rgb555.js';
import { openPublishedStore } from '../workbench/published-store.js';
import { createViewerGl, type GpuMesh, type ViewParameters } from './viewer-gl.js';
import {
  attachFlyControls,
  cameraBasis,
  focalPixels,
  INITIAL_SPEED,
  moveCamera,
  screenRay,
  viewParameters,
  type FlyCamera,
} from './viewer-camera.js';
import {
  layOutCourse,
  routeLength,
  routeOccurrenceAt,
  routeSectionS,
  sectionHeading,
  sectionPoint,
  type CourseLayout,
  type PlacedSection,
} from './viewer-layout.js';
import { buildGround, buildWalls, materialColor, rgb555Bytes } from './viewer-surfaces.js';
import {
  boardLevels,
  buildBoards,
  FORM_COLORS,
  LEVEL_TABLE_WIDTH,
  type BoardMeshes,
  type BoardRecord,
  type LevelSlot,
} from './viewer-boards.js';
import {
  buildBoundaries,
  buildCentreline,
  buildGates,
  buildGrid,
  buildInvisibleWallCurtains,
  buildLanes,
  buildLimitCurtains,
  buildObjectLines,
  buildPlan,
  buildProfile,
  buildSectionEnds,
  GRADE_LEGEND,
  gradeColor,
  type Label,
  type LineLayer,
} from './viewer-overlays.js';
import { pickBoard } from './viewer-pick.js';
import { mapRibbons } from './map-grid.js';
import { mapBands, type MapBands } from './map-bands.js';
import type { MapGrid } from './map-terrain.js';
import type { MapMessage, MapRequest } from './map-protocol.js';

/**
 * The course viewer: every course of the build's delivery, drawn in true perspective from the same functions the game
 * and its physics read, with nothing to edit. [Development](../../docs/development.md#course-viewer) owns its rules.
 */

type LayerKey =
  | 'materials'
  | 'outside'
  | 'clearance'
  | 'unclear'
  | 'centreline'
  | 'lanes'
  | 'boundaries'
  | 'plan'
  | 'profile'
  | 'walls'
  | 'invisibleWalls'
  | 'limits'
  | 'standing'
  | 'lying'
  | 'shadows'
  | 'bands'
  | 'movable'
  | 'objects'
  | 'anchors'
  | 'outlines'
  | 'sections'
  | 'gates'
  | 'grid'
  | 'sky'
  | 'form';

interface LayerDefinition {
  readonly key: LayerKey;
  readonly label: string;
  readonly group: string;
  /** Shown at first: what the game shows. */
  readonly initial: boolean;
  /** Colors and what they mean. */
  readonly legend?: readonly { readonly color: readonly number[]; readonly text: string }[];
}

const LAYERS: readonly LayerDefinition[] = [
  { key: 'materials', label: 'Materials, not colors', group: 'Ground', initial: false },
  { key: 'outside', label: 'Beyond the course limits', group: 'Ground', initial: true },
  { key: 'clearance', label: 'Clearance line', group: 'Ground', initial: false },
  {
    key: 'unclear',
    label: 'Ground beyond the clearance',
    group: 'Ground',
    initial: false,
    legend: [{ color: [255, 0, 200], text: 'not one-to-one' }],
  },
  { key: 'centreline', label: 'Centreline and distances', group: 'Road', initial: false },
  { key: 'lanes', label: 'Lanes', group: 'Road', initial: false },
  { key: 'boundaries', label: 'Boundaries', group: 'Road', initial: false },
  {
    key: 'plan',
    label: 'Plan: straights, arcs, radii',
    group: 'Road',
    initial: false,
    legend: [
      { color: [230, 230, 230], text: 'straight' },
      { color: [90, 160, 255], text: 'arc left' },
      { color: [255, 90, 90], text: 'arc right' },
    ],
  },
  {
    key: 'profile',
    label: 'Profile: PVIs, vertical curves, grade',
    group: 'Road',
    initial: false,
    legend: [
      ...GRADE_LEGEND.map(({ text, grade }) => ({ color: gradeColor(grade), text })),
      { color: [255, 0, 255], text: 'vertical curve ends' },
    ],
  },
  { key: 'walls', label: 'Visible walls', group: 'Walls', initial: true },
  {
    key: 'invisibleWalls',
    label: 'Invisible walls',
    group: 'Walls',
    initial: false,
    legend: [{ color: [255, 200, 0], text: 'curtain' }],
  },
  {
    key: 'limits',
    label: 'Course limits',
    group: 'Walls',
    initial: false,
    legend: [{ color: [255, 60, 60], text: 'curtain' }],
  },
  { key: 'standing', label: 'Standing rows', group: 'Boards', initial: true },
  { key: 'lying', label: 'Lying rows', group: 'Boards', initial: true },
  { key: 'bands', label: 'Boards repeating sideways', group: 'Boards', initial: true },
  { key: 'movable', label: 'Movable objects', group: 'Boards', initial: true },
  { key: 'objects', label: 'Contact lines', group: 'Boards', initial: false },
  { key: 'anchors', label: 'Base points', group: 'Boards', initial: false },
  {
    key: 'outlines',
    label: 'Outlines and folds',
    group: 'Boards',
    initial: false,
    legend: [
      { color: [0, 255, 255], text: 'outline' },
      { color: [255, 0, 255], text: 'fold' },
    ],
  },
  { key: 'shadows', label: 'Shadow pictures', group: 'Shadows', initial: true },
  { key: 'sections', label: 'Section ends', group: 'Marks', initial: false },
  { key: 'gates', label: 'Start, checkpoints, finish', group: 'Marks', initial: false },
  { key: 'grid', label: 'Grid', group: 'Marks', initial: false },
  { key: 'sky', label: 'Sky', group: 'Sky', initial: true },
  {
    key: 'form',
    label: 'Boards by how they are written',
    group: 'Data',
    initial: false,
    legend: [
      { color: FORM_COLORS.original, text: 'repeat original' },
      { color: FORM_COLORS.copy, text: 'repeat copy' },
      { color: FORM_COLORS.reference, text: 'one, by reference' },
      { color: FORM_COLORS.absolute, text: 'one, by number' },
    ],
  },
];

/** The line layers read from the compiled course, each built when first shown. */
const LINE_LAYERS: Partial<Record<LayerKey, (layout: CourseLayout) => LineLayer>> = {
  centreline: buildCentreline,
  lanes: buildLanes,
  boundaries: buildBoundaries,
  plan: buildPlan,
  profile: buildProfile,
  objects: buildObjectLines,
  sections: buildSectionEnds,
  gates: buildGates,
  grid: buildGrid,
};

/** Metres the ground is drawn beyond each course limit at first, and the slider's most. */
const INITIAL_DISPLAY_WIDTH = 20;
const MAXIMUM_DISPLAY_WIDTH = 1000;
/** Metres before a picture "Look here" puts the eye. */
const LOOK_HERE_METERS = 20;
/** CSS pixels: the width the viewer's lines are drawn at. */
const LINE_WIDTH = 2;
/** The terrain's color where no ribbon has stripes to carry. */
const TERRAIN_COLOR = [118, 128, 96];

/**
 * The course map's settings: its grid's spacing and margin (metres), the terrain's t and λ, the ground's height scale,
 * the light and the stripes.
 */
const mapSettings = { spacing: 2, margin: 100, tension: 0.3, lambda: 1, heightScale: 1, shade: false, stripes: true };
let mapMode = false;
let mapStatus = '';

const canvas = mustGet<HTMLCanvasElement>('view');
const labelCanvas = mustGet<HTMLCanvasElement>('labels');
const status = mustGet<HTMLElement>('status');
const courseSelect = mustGet<HTMLSelectElement>('course');
const slider = mustGet<HTMLInputElement>('s');
const sValue = mustGet<HTMLOutputElement>('s-value');
const layersPanel = mustGet<HTMLElement>('layers');
const layersButton = mustGet<HTMLButtonElement>('layers-button');
const projectionButton = mustGet<HTMLButtonElement>('projection');
const speedOutput = mustGet<HTMLOutputElement>('speed');
const mapButton = mustGet<HTMLButtonElement>('map');
const info = mustGet<HTMLElement>('info');
const infoList = mustGet<HTMLElement>('info-list');

const gpu = createViewerGl(canvas);
const shown = new Map<LayerKey, boolean>(LAYERS.map((layer) => [layer.key, layer.initial]));
let displayWidth = INITIAL_DISPLAY_WIDTH;
const camera: FlyCamera = {
  position: [0, 300, 0],
  yaw: 0,
  pitch: Math.PI / 2,
  perspective: true,
  distance: 300,
  speed: INITIAL_SPEED,
};

interface Loaded {
  readonly layout: CourseLayout;
  /** The authored document, for how its elements are written; null when the build published none. */
  readonly document: CourseDocument | null;
  ground: GpuMesh | null;
  materialGround: GpuMesh | null;
  unclear: GpuMesh | null;
  clearance: GpuMesh | null;
  walls: GpuMesh | null;
  boards: Record<keyof BoardMeshes, GpuMesh> | null;
  records: BoardRecord[];
  /** The boards drawn at one depth each, whose levels this frame picks. */
  slots: LevelSlot[];
  levels: Uint8Array;
  outlines: GpuMesh | null;
  anchors: GpuMesh | null;
  lines: Map<LayerKey, { mesh: GpuMesh; labels: Label[] }>;
  limits: GpuMesh | null;
  invisibleWalls: GpuMesh | null;
  sky: object | null;
  /** The course map's terrain on the GPU: the settings it was solved for, its grid, its time and its heights' range. */
  terrain: { key: string; grid: MapGrid; seconds: number; low: number; high: number } | null;
}
let loaded: Loaded | null = null;

// The build's delivery, as the game reads it, and the authored files it published for the workbench.
const content = await loadContentManifest(new URL('../../delivery/', location.href)).catch((error: unknown) => {
  status.textContent = `The build's delivery did not open: ${String(error)}`;
  throw error;
});
const authored = await openPublishedStore(new URL('../../authored/', location.href)).catch(() => null);
const materials = await loadSurfaceMaterials(content);
const materialColors = new Map<string, readonly number[]>(
  materials.source.materials.map((material, i) => [material.id, materialColor(material, i)]),
);
const courseIds = content.manifest.files.filter((file) => file.kind === 'course').map((file) => file.id);
for (const id of courseIds) courseSelect.add(new Option(id, id));

function buildLayers() {
  layersPanel.replaceChildren();
  let group = '';
  for (const layer of LAYERS) {
    if (layer.group !== group) {
      group = layer.group;
      const heading = document.createElement('h2');
      heading.textContent = group;
      layersPanel.append(heading);
    }
    const label = document.createElement('label');
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.checked = shown.get(layer.key)!;
    // In the course map, the terrain takes the place of the ground beyond the limits.
    box.disabled = mapMode && layer.key === 'outside';
    box.addEventListener('change', () => {
      shown.set(layer.key, box.checked);
      layersChanged(layer.key);
    });
    label.append(box, layer.label);
    layersPanel.append(label);
    if (layer.legend) {
      const legend = document.createElement('div');
      for (const item of layer.legend) {
        const swatch = document.createElement('span');
        swatch.className = 'legend';
        swatch.style.background = `rgb(${item.color[0]} ${item.color[1]} ${item.color[2]})`;
        legend.append(swatch, ` ${item.text} `);
      }
      layersPanel.append(legend);
    }
  }
  const heading = document.createElement('h2');
  heading.textContent = 'Display width beyond the limits';
  const width = document.createElement('label');
  const range = document.createElement('input');
  range.type = 'range';
  range.min = '0';
  range.max = String(MAXIMUM_DISPLAY_WIDTH);
  range.step = '10';
  range.value = String(displayWidth);
  range.disabled = mapMode;
  const value = document.createElement('output');
  value.textContent = `${displayWidth} m`;
  range.addEventListener('input', () => (value.textContent = `${range.value} m`));
  range.addEventListener('change', () => {
    displayWidth = Number(range.value);
    rebuildGround();
  });
  width.append(range, value);
  layersPanel.append(heading, width);
  buildMapSettings();
  buildExportSettings();
}

/** The course map's settings, which solve its terrain again when changed (the height scale and light only redraw). */
function buildMapSettings() {
  const heading = document.createElement('h2');
  heading.textContent = 'Course map';
  layersPanel.append(heading);
  const number = (
    key: 'spacing' | 'margin' | 'tension' | 'lambda' | 'heightScale',
    label: string,
    min: number,
    max: number,
    step: number,
  ) => {
    const row = document.createElement('label');
    const input = document.createElement('input');
    input.type = 'number';
    Object.assign(input, { min: String(min), max: String(max), step: String(step), value: String(mapSettings[key]) });
    input.addEventListener('change', () => {
      const value = Number(input.value);
      if (!(value >= min && value <= max)) return void (input.value = String(mapSettings[key]));
      if (key === 'heightScale') keepOnRoad(() => (mapSettings[key] = value));
      else {
        mapSettings[key] = value;
        solveMap();
      }
    });
    row.append(label, input);
    layersPanel.append(row);
  };
  number('spacing', 'Grid (m)', 0.5, 50, 0.5);
  number('margin', 'Margin (m)', 0, 2000, 10);
  number('tension', 'Tension t', 0, 1, 0.05);
  number('lambda', 'λ (per m)', 0, 1000, 0.1);
  number('heightScale', 'Height scale', 0.1, 20, 0.1);
  for (const [key, label] of [
    ['stripes', 'Stripes'],
    ['shade', 'Shading'],
  ] as const) {
    const row = document.createElement('label');
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.checked = mapSettings[key];
    box.addEventListener('change', () => {
      mapSettings[key] = box.checked;
      requestDraw();
    });
    row.append(box, label);
    layersPanel.append(row);
  }
}

/** How much the ground's heights are stretched: the course map's height scale, else none. */
const heightScale = () => (mapMode ? mapSettings.heightScale : 1);

/**
 * The road's frame at the focus: its centreline point (its height stretched), its heading and its grade's angle (nose
 * up positive), as stretched.
 */
function roadFrame() {
  const { placed, s } = focus!;
  const p: number[] = [];
  sectionPoint(loaded!.layout, placed, s, 0, 0, p);
  const k = heightScale();
  const grade = Math.atan(k * placed.section.height.sampleDifferential(s).dYdS);
  return { x: p[0]!, y: p[1]! * k, z: p[2]!, heading: sectionHeading(placed, s), grade };
}

/**
 * `change` (a new focus or height scale) with the camera kept where it stands relative to the road at the focus: its
 * place along and across the road and above it, and its yaw and pitch against the road's heading and grade.
 */
function keepOnRoad(change: () => void) {
  if (!loaded || !focus) return change();
  const before = roadFrame();
  const dx = camera.position[0] - before.x,
    dz = camera.position[2] - before.z;
  const along = dx * Math.sin(before.heading) + dz * Math.cos(before.heading),
    across = dx * Math.cos(before.heading) - dz * Math.sin(before.heading),
    up = camera.position[1] - before.y;
  const yaw = camera.yaw - before.heading,
    pitch = camera.pitch + before.grade;
  change();
  const after = roadFrame();
  camera.position = [
    after.x + along * Math.sin(after.heading) + across * Math.cos(after.heading),
    after.y + up,
    after.z + along * Math.cos(after.heading) - across * Math.sin(after.heading),
  ];
  camera.yaw = after.heading + yaw;
  camera.pitch = pitch - after.grade;
  requestDraw();
}

/** The export's settings: the picture's width in pixels, what lies behind the course and the solid color. */
const exportSettings: { width: number; background: Background; color: string } = {
  width: 4096,
  background: 'sky',
  color: '#000000',
};

function buildExportSettings() {
  const heading = document.createElement('h2');
  heading.textContent = 'Export';
  const width = document.createElement('label');
  const widthInput = document.createElement('input');
  widthInput.type = 'number';
  Object.assign(widthInput, { min: '256', max: String(gpu.largestOffscreen), step: '256' });
  widthInput.value = String(exportSettings.width);
  widthInput.addEventListener('change', () => {
    const value = Math.round(Number(widthInput.value));
    if (value >= 256 && value <= gpu.largestOffscreen) exportSettings.width = value;
    else widthInput.value = String(exportSettings.width);
  });
  width.append('Width (px)', widthInput);
  const background = document.createElement('label');
  const select = document.createElement('select');
  for (const [value, text] of [
    ['sky', 'Sky'],
    ['solid', 'Solid color'],
    ['transparent', 'Transparent'],
  ])
    select.add(new Option(text, value));
  select.value = exportSettings.background;
  select.addEventListener('change', () => (exportSettings.background = select.value as Background));
  const color = document.createElement('input');
  color.type = 'color';
  color.value = exportSettings.color;
  color.addEventListener('input', () => (exportSettings.color = color.value));
  background.append('Background', select, color);
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = 'Export PNG';
  button.addEventListener('click', () => void exportPicture());
  layersPanel.append(heading, width, background, button);
}

/**
 * The current view drawn again as a picture `exportSettings.width` pixels wide, of the screen's shape, with its lines
 * and labels as wide against it as on the screen, saved as a PNG file.
 */
async function exportPicture() {
  if (!loaded) return;
  const width = Math.min(exportSettings.width, gpu.largestOffscreen);
  const height = Math.max(1, Math.round((width * canvas.clientHeight) / canvas.clientWidth));
  const ratio = width / canvas.clientWidth;
  const hex = exportSettings.color;
  const color = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  let view: ViewParameters | null = null;
  const pixels = gpu.renderOffscreen(width, height, () => {
    view = render(width, height, ratio, exportSettings.background, color);
  });
  const picture = document.createElement('canvas');
  picture.width = width;
  picture.height = height;
  const context = picture.getContext('2d')!;
  context.putImageData(new ImageData(pixels, width, height), 0, 0);
  drawLabels(context, view!, ratio);
  requestDraw();
  const blob = await new Promise<Blob | null>((resolve) => picture.toBlob(resolve, 'image/png'));
  if (!blob) return void (status.textContent = 'The picture could not be made');
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `${courseSelect.value}-${mapMode ? 'map' : 'view'}-${width}x${height}.png`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 10000);
  showStatus();
  status.textContent += `; exported ${width} × ${height}`;
}

/** The course map on or off: its ground ends at the course limits, where its terrain begins. */
function setMapMode(on: boolean) {
  keepOnRoad(() => (mapMode = on));
  mapButton.setAttribute('aria-pressed', String(on));
  buildLayers();
  rebuildGround();
  solveMap();
  showStatus();
  requestDraw();
}

let mapWorker: Worker | null = null;

/** Solve the shown course's terrain and stripes on a worker for the current settings, unless they are solved already. */
function solveMap() {
  if (!loaded || !mapMode) return;
  const course = loaded;
  const key = JSON.stringify([mapSettings.spacing, mapSettings.margin, mapSettings.tension, mapSettings.lambda]);
  if (course.terrain?.key === key) return;
  mapWorker?.terminate();
  gpu.setTerrain(null, null);
  course.terrain = null;
  const worker = new Worker(new URL('./map-worker.js', import.meta.url), { type: 'module' });
  mapWorker = worker;
  worker.addEventListener('message', ({ data }: MessageEvent<MapMessage>) => {
    if (mapWorker !== worker || loaded !== course) return;
    const size = (grid: MapGrid) => `${grid.spacing} m grid of ${grid.nx} × ${grid.nz}`;
    if (data.type === 'progress')
      mapStatus =
        data.stage === 'terrain'
          ? `terrain on a ${size(data.grid)}: at ${data.spacing} m, step ${data.step + 1}`
          : `stripes on a ${size(data.grid)}: at ${data.spacing} m`;
    else {
      worker.terminate();
      mapWorker = null;
      if (data.type === 'error') mapStatus = `the terrain failed: ${data.message}`;
      else {
        let low = Infinity,
          high = -Infinity;
        for (const height of data.heights) {
          low = Math.min(low, height);
          high = Math.max(high, height);
        }
        gpu.setTerrain(data.grid, data.heights, data.stripes, pairColors(bands.pairs));
        course.terrain = { key, grid: data.grid, seconds: data.seconds.terrain + data.seconds.stripes, low, high };
        mapStatus =
          `terrain on a ${size(data.grid)} in ${data.seconds.terrain.toFixed(1)} s, ` +
          `${low.toFixed(1)} to ${high.toFixed(1)} m; stripes in ${data.seconds.stripes.toFixed(1)} s`;
        requestDraw();
      }
    }
    showStatus();
  });
  mapStatus = 'solving the terrain…';
  showStatus();
  const bands = mapBands(course.layout);
  worker.postMessage({
    ribbons: mapRibbons(course.layout),
    bands: bands.bands,
    pairCount: bands.pairs.length,
    spacing: mapSettings.spacing,
    margin: mapSettings.margin,
    parameters: { tension: mapSettings.tension, lambda: mapSettings.lambda },
  } satisfies MapRequest);
}

/** Each pair's brighter and darker colors as the game presents them, RGBA bytes. */
const pairColors = (pairs: MapBands['pairs']) => Uint8Array.from(pairs.flatMap((pair) => pair.flatMap(rgb555Bytes)));

function showStatus() {
  if (loaded) status.textContent = describe(loaded) + (mapMode ? `; course map: ${mapStatus}` : '');
}

function layersChanged(key: LayerKey) {
  if (key === 'outside') rebuildGround();
  else if (key === 'materials' && loaded && !loaded.materialGround) rebuildGround();
  else ensureLayer(key);
  requestDraw();
}

/** Build a line layer or curtain the first time it is shown. */
function ensureLayer(key: LayerKey) {
  if (!loaded || !shown.get(key)) return;
  const build = LINE_LAYERS[key];
  if (build && !loaded.lines.has(key)) {
    const layer = build(loaded.layout);
    loaded.lines.set(key, { mesh: gpu.linesFrom(layer.lines), labels: layer.labels });
  }
  if (key === 'limits' && !loaded.limits) loaded.limits = gpu.meshFrom(buildLimitCurtains(loaded.layout));
  if (key === 'invisibleWalls' && !loaded.invisibleWalls && loaded.document)
    loaded.invisibleWalls = gpu.meshFrom(buildInvisibleWallCurtains(loaded.layout, loaded.document));
}

/** The drawn ground's width beyond each course limit: none in the course map, whose terrain lies beyond them. */
const drawnWidth = () => (!mapMode && shown.get('outside') ? displayWidth : 0);

/** The ground, its marks beyond the clearance and the clearance lines, then the boards, whose bands reach its edge. */
function rebuildGround() {
  if (!loaded) return;
  const width = drawnWidth();
  for (const mesh of [loaded.ground, loaded.materialGround, loaded.unclear, loaded.clearance]) gpu.remove(mesh);
  const built = buildGround(loaded.layout, width, null);
  loaded.ground = gpu.meshFrom(built.ground);
  loaded.unclear = gpu.meshFrom(built.unclear);
  loaded.clearance = gpu.linesFrom(built.clearance);
  loaded.materialGround = shown.get('materials')
    ? gpu.meshFrom(buildGround(loaded.layout, width, materialColors).ground)
    : null;
  rebuildBoards();
}

function rebuildBoards() {
  if (!loaded) return;
  if (loaded.boards) for (const mesh of Object.values(loaded.boards)) gpu.remove(mesh);
  gpu.remove(loaded.outlines);
  gpu.remove(loaded.anchors);
  const built = buildBoards(loaded.layout, loaded.document, drawnWidth());
  const { textures } = built;
  gpu.setAtlas(textures.size, textures.pages, textures.levels, LEVEL_TABLE_WIDTH, textures.palettes);
  loaded.boards = Object.fromEntries(
    Object.entries(built.meshes).map(([key, builder]) => [key, gpu.boardsFrom(builder)]),
  ) as Record<keyof BoardMeshes, GpuMesh>;
  loaded.records = built.records;
  loaded.slots = built.slots;
  loaded.levels = new Uint8Array(built.slots.length);
  loaded.outlines = gpu.linesFrom(built.outlines);
  loaded.anchors = gpu.linesFrom(built.anchors);
  requestDraw();
}

/** Free a course's meshes. */
function release(course: Loaded) {
  for (const mesh of [
    course.ground,
    course.materialGround,
    course.unclear,
    course.clearance,
    course.walls,
    course.outlines,
    course.anchors,
    course.limits,
    course.invisibleWalls,
  ])
    gpu.remove(mesh);
  if (course.boards) for (const mesh of Object.values(course.boards)) gpu.remove(mesh);
  for (const layer of course.lines.values()) gpu.remove(layer.mesh);
  gpu.setTerrain(null, null);
}

const describe = (course: Loaded) =>
  `${course.layout.course.name} (${course.layout.course.type}), ${course.layout.sections.length} Sections` +
  (course.document ? '' : '; no authored document, so no data form');

async function openCourse(id: string) {
  status.textContent = `Opening ${id}…`;
  courseSelect.disabled = true;
  try {
    const course = await loadDeliveredCourse(content, id, materials, (files, total) => {
      status.textContent = `Opening ${id}: ${files} of ${total} files`;
    });
    // How the course is written comes from the authored document the build published, as the workbench reads it.
    const source = await authored?.store.read(`courses/${id}.course.json`).catch(() => null);
    const read = source ? readCourseDocumentBytes(source) : null;
    status.textContent = `Laying out ${id}…`;
    await new Promise((resolve) => setTimeout(resolve));
    if (loaded) release(loaded);
    loaded = {
      layout: layOutCourse(course),
      document: read?.ok ? read.value : null,
      ground: null,
      materialGround: null,
      unclear: null,
      clearance: null,
      walls: null,
      boards: null,
      records: [],
      slots: [],
      levels: new Uint8Array(0),
      outlines: null,
      anchors: null,
      lines: new Map(),
      limits: null,
      invisibleWalls: null,
      sky: null,
      terrain: null,
    };
    info.hidden = true;
    rebuildGround();
    loaded.walls = gpu.meshFrom(buildWalls(loaded.layout));
    for (const layer of LAYERS) ensureLayer(layer.key);
    const length = routeLength(loaded.layout.route);
    slider.max = String(length);
    slider.step = String(Math.max(0.1, length / 4000));
    slider.value = '0';
    focusAt(0);
    viewTop();
    showStatus();
    solveMap();
    history.replaceState(null, '', `?course=${encodeURIComponent(id)}`);
  } catch (error) {
    status.textContent = `${id} did not open: ${error instanceof Error ? error.message : String(error)}`;
    throw error;
  } finally {
    courseSelect.disabled = false;
  }
}

/** The focus: where the s slider stands on the Route, the occurrence it is in and its station there. */
let focus: { placed: PlacedSection; s: number } | null = null;
function focusAt(s: number) {
  const layout = loaded!.layout;
  const occurrence = routeOccurrenceAt(layout.route, s);
  const placed = layout.sections.find((p) => p.occurrence === occurrence)!;
  focus = { placed, s: Math.min(routeSectionS(occurrence, s), placed.section.coordinates.domain.end) };
  sValue.textContent = `${s.toFixed(1)} m · ${placed.section.id} ${focus.s.toFixed(1)} m`;
  updateSky();
  requestDraw();
}

/** The sky of the environment at the focus, as the game's is the one at the point its camera follows. */
let skyPlacement = { horizonY: 0, yawX: 0 };
function updateSky() {
  if (!loaded || !focus) return;
  const environments = focus.placed.section.appearance.environments;
  const environment =
    environments[
      stationIndexAt(
        environments.map((e) => ({ s: e.at.s })),
        's',
        focus.s,
      )
    ]!;
  const background = environment.background;
  const image = background.asset.image;
  if (loaded.sky !== image) {
    // The sky's pixels as the game presents them: RGB555 painted row by row, expanded to RGBA.
    const pixels = new Uint16Array(image.width * image.height);
    for (let y = 0; y < image.height; y++) image.paintRow(pixels, y * image.width, 0, y, image.width);
    const rgba = new Uint32Array(pixels.length);
    expandRgb555Pixels(pixels, rgba);
    gpu.setSky({ width: image.width, height: image.height, rgba: new Uint8Array(rgba.buffer) });
    loaded.sky = image;
  }
  // The occurrence's rotation carries the sky's yaw origin to the world, as the game's route readers do.
  const sky = {
    image,
    imageHorizonY: background.horizonY,
    yawOriginRadians: background.yawOriginRadians + focus.placed.rotation,
  };
  skyPlacement = {
    horizonY: background.horizonY,
    yawX: backgroundYawX(sky, 0, CAMERA_DEFINITION.focalLength) + CAMERA_DEFINITION.centerX,
  };
}

function setPerspective(perspective: boolean) {
  camera.perspective = perspective;
  projectionButton.setAttribute('aria-pressed', String(perspective));
  projectionButton.textContent = perspective ? 'Perspective' : 'Parallel';
  showMotion();
}

/** The eye's speed, or a parallel view's scale, where the page shows it. */
function showMotion() {
  speedOutput.textContent = camera.perspective
    ? `${camera.speed < 10 ? camera.speed.toFixed(1) : Math.round(camera.speed)} m/s`
    : `scale ${Math.round(camera.distance)} m`;
}

/** Straight down from as high as shows the whole course (as large in a parallel view). */
function viewTop() {
  const { bounds } = loaded!.layout;
  const focal = viewFocal(canvas.clientWidth, canvas.clientHeight);
  const extent = Math.max(bounds.maxX - bounds.minX, bounds.maxZ - bounds.minZ, 100);
  const height = ((extent / 2) * focal * 1.1) / (Math.min(canvas.clientWidth, canvas.clientHeight) / 2);
  const ground = focus ? roadFrame().y : 0;
  camera.position = [
    (bounds.minX + bounds.maxX) / 2 - loaded!.layout.origin.x,
    ground + height,
    (bounds.minZ + bounds.maxZ) / 2 - loaded!.layout.origin.z,
  ];
  camera.yaw = 0;
  camera.pitch = Math.PI / 2;
  camera.distance = height;
  showMotion();
  requestDraw();
}

/** Metres from the road the side view stands, and how high above it. */
const SIDE_DISTANCE = 200;
const SIDE_HEIGHT = 20;

/** From the right of the road at the focus, looking across at it. */
function viewSide() {
  if (!focus) return;
  const frame = roadFrame();
  camera.position = [
    frame.x + SIDE_DISTANCE * Math.cos(frame.heading),
    frame.y + SIDE_HEIGHT,
    frame.z - SIDE_DISTANCE * Math.sin(frame.heading),
  ];
  camera.yaw = frame.heading - Math.PI / 2;
  camera.pitch = Math.atan(SIDE_HEIGHT / SIDE_DISTANCE);
  camera.distance = SIDE_DISTANCE;
  showMotion();
  requestDraw();
}

/**
 * The game's camera behind a car standing on the centreline at the focus, facing along the road and pitched to the
 * road's grade there (the lying plane's), as the camera is fixed to the body: `updateCamera` with the camera definition,
 * carried to the world by the occurrence.
 */
function viewGame() {
  if (!focus) return;
  const { placed, s } = focus;
  const coordinates = placed.section.coordinates;
  const heading = coordinates.toWorld(s, 0, { x: 0, z: 0, s: 0, l: 0, heading: 0 }).heading;
  const vehicle = {
    x: 0,
    z: 0,
    yaw: heading,
    course: { s, l: 0 },
    renderY: placed.section.height.sample(s),
    // Nose-up positive, the grade's angle.
    sprungPitch: Math.atan(placed.section.height.sampleDifferential(s).dYdS),
    longitudinalSpeed: 0,
    lateralSpeed: 0,
  };
  const game = updateCamera(createCameraRig(), { coordinates }, vehicle, CAMERA_DEFINITION, 'FACING');
  const world = transformPlanarPoint(placed.worldFromSection, game);
  // The camera stands as high above the stretched road as above the road.
  camera.position = [
    world.x - loaded!.layout.origin.x,
    game.y + (heightScale() - 1) * vehicle.renderY,
    world.z - loaded!.layout.origin.z,
  ];
  setPerspective(true);
  camera.yaw = game.yaw + placed.rotation;
  camera.pitch = game.pitch;
  requestDraw();
}

let drawPending = false;
function requestDraw() {
  if (drawPending) return;
  drawPending = true;
  requestAnimationFrame(draw);
}

const pixelRatio = () => Math.min(window.devicePixelRatio || 1, 2);
/** The focal length of the view, in pixels of a `width` by `height` view: the game's frame fitted to it. */
const viewFocal = (width: number, height: number) =>
  focalPixels(width, height, CAMERA_DEFINITION.focalLength, LOGICAL_WIDTH, LOGICAL_HEIGHT);

function draw() {
  drawPending = false;
  const ratio = pixelRatio();
  const width = Math.max(1, Math.round(canvas.clientWidth * ratio)),
    height = Math.max(1, Math.round(canvas.clientHeight * ratio));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  const view = render(width, height, ratio, 'sky');
  if (labelCanvas.width !== width || labelCanvas.height !== height) {
    labelCanvas.width = width;
    labelCanvas.height = height;
  }
  const context = labelCanvas.getContext('2d')!;
  context.clearRect(0, 0, width, height);
  drawLabels(context, view, ratio);
}

/** What lies behind the course: the sky (where its layer is shown), a solid color, or nothing. */
type Background = 'sky' | 'solid' | 'transparent';
/** The screen's color behind the sky. */
const SCREEN_COLOR = [0.05, 0.05, 0.08];

/** The shown layers in a `width` by `height` view at `ratio` device pixels to a CSS pixel; its parameters. */
function render(width: number, height: number, ratio: number, background: Background, color = SCREEN_COLOR) {
  const focal = viewFocal(width, height);
  const view = viewParameters(camera, width, height, ratio, focal, heightScale());
  gpu.begin(view, background === 'transparent' ? [0, 0, 0, 0] : color);
  if (!loaded) return view;
  if (background === 'sky' && shown.get('sky'))
    gpu.drawSky(view.rayFromScreen, CAMERA_DEFINITION.focalLength, skyPlacement.yawX, skyPlacement.horizonY);
  const shade = mapMode && mapSettings.shade;
  gpu.drawMesh(shown.get('materials') ? loaded.materialGround : loaded.ground, view, { ground: true, shade });
  if (mapMode) gpu.drawTerrain(view, TERRAIN_COLOR, shade, mapSettings.stripes);
  const boards = loaded.boards;
  const tint = shown.get('form') ? 0.6 : 0;
  if (boards) {
    boardLevels(
      loaded.slots,
      view.eye,
      view.forward,
      focal,
      camera.perspective ? null : camera.distance,
      loaded.levels,
    );
    gpu.setBoardLevels(loaded.levels);
    // What lies on the ground draws onto it: the shadows halve it first, then the lying rows cover it.
    if (shown.get('shadows')) gpu.drawShadows(boards.shadows, view, view.eye);
    if (shown.get('lying')) {
      gpu.drawBoards(boards.lying, view, view.eye, true, tint);
      if (shown.get('bands')) gpu.drawBoards(boards.bandLying, view, view.eye, true, tint);
      if (shown.get('movable')) gpu.drawBoards(boards.movableLying, view, view.eye, true, tint);
    }
  }
  if (shown.get('unclear')) gpu.drawMesh(loaded.unclear, view, { translucent: true });
  if (shown.get('clearance')) gpu.drawLines(loaded.clearance, view, LINE_WIDTH, true);
  for (const [key, layer] of loaded.lines)
    if (shown.get(key) && key !== 'objects') gpu.drawLines(layer.mesh, view, LINE_WIDTH, true);
  if (shown.get('walls')) gpu.drawMesh(loaded.walls, view, { shade });
  if (boards && shown.get('standing')) {
    gpu.drawBoards(boards.standing, view, view.eye, false, tint);
    if (shown.get('bands')) gpu.drawBoards(boards.bandStanding, view, view.eye, false, tint);
    if (shown.get('movable')) gpu.drawBoards(boards.movableStanding, view, view.eye, false, tint);
  }
  if (shown.get('objects')) gpu.drawLines(loaded.lines.get('objects')?.mesh ?? null, view, LINE_WIDTH, true);
  if (shown.get('outlines')) gpu.drawLines(loaded.outlines, view, LINE_WIDTH / 2, true);
  if (shown.get('anchors')) gpu.drawLines(loaded.anchors, view, LINE_WIDTH, true);
  if (shown.get('limits')) gpu.drawMesh(loaded.limits, view, { translucent: true });
  if (shown.get('invisibleWalls')) gpu.drawMesh(loaded.invisibleWalls, view, { translucent: true });
  return view;
}

/** The shown layers' labels into `context`, nearest first, none over another. */
function drawLabels(context: CanvasRenderingContext2D, view: ViewParameters, ratio: number) {
  if (!loaded) return;
  const placed: { x: number; y: number; depth: number; label: Label }[] = [];
  const v = view.view,
    p = view.projection;
  for (const [key, layer] of loaded.lines) {
    if (!shown.get(key)) continue;
    for (const label of layer.labels) {
      const [x, unscaled, z] = label.at as [number, number, number];
      const y = unscaled * view.heightScale;
      const ex = v[0]! * x + v[4]! * y + v[8]! * z + v[12]!,
        ey = v[1]! * x + v[5]! * y + v[9]! * z + v[13]!,
        ez = v[2]! * x + v[6]! * y + v[10]! * z + v[14]!;
      if (view.perspective && ez > -0.1) continue;
      const w = view.perspective ? -ez : 1;
      const sx = ((p[0]! * ex) / w + 1) * 0.5 * view.width,
        sy = (1 - (p[5]! * ey) / w) * 0.5 * view.height;
      if (sx < -50 || sy < -20 || sx > view.width + 50 || sy > view.height + 20) continue;
      placed.push({ x: sx, y: sy, depth: -ez, label });
    }
  }
  placed.sort((a, b) => a.depth - b.depth);
  context.font = `${12 * ratio}px system-ui, sans-serif`;
  context.textBaseline = 'bottom';
  const taken: number[][] = [];
  for (const item of placed) {
    if (taken.length >= 300) break;
    const w = context.measureText(item.label.text).width + 6 * ratio,
      h = 16 * ratio;
    const box = [item.x, item.y - h, item.x + w, item.y];
    if (taken.some((t) => box[0]! < t[2]! && box[2]! > t[0]! && box[1]! < t[3]! && box[3]! > t[1]!)) continue;
    taken.push(box);
    context.fillStyle = 'rgb(0 0 0 / 60%)';
    context.fillRect(box[0]!, box[1]!, w, h);
    context.fillStyle = item.label.color;
    context.fillText(item.label.text, item.x + 3 * ratio, item.y - 2 * ratio);
  }
}

/** What a tap on a board shows: its data, and a button to look at it. */
let selected: BoardRecord | null = null;
function showInfo(record: BoardRecord, lying: boolean) {
  selected = record;
  const leaf = record.leaf;
  const kind = [
    lying ? 'lying rows' : 'standing rows',
    record.movable
      ? 'movable object'
      : record.placed.section.objects.some((object) => object.sprite === record.index)
        ? 'solid fixed object'
        : 'scenery',
    record.image.extend ? `repeating ${record.image.extend}, ${record.copies.length - 1} repetitions` : '',
  ];
  const rows: [string, string][] = [
    ['Kind', kind.filter(Boolean).join(', ')],
    ['Image', record.image.name],
    ['Palette', record.palette],
    ['Section', record.placed.section.id],
    ['s', `${record.s.toFixed(3)} m (course ${(record.placed.routeStart + record.s).toFixed(1)} m)`],
    ['l', `${record.l.toFixed(3)} m`],
    ['Height', `${record.base[1]!.toFixed(3)} m, ground offset ${record.groundOffset} m`],
    ['Placement', `${record.index} of the Section's sprites`],
    [
      'Written',
      leaf
        ? `${leaf.path}${leaf.copies.length ? `, ${leaf.copies.map((copy) => `copy ${copy.index} of ${copy.path}`).join(', ')}` : ', not repeated'}`
        : 'unknown',
    ],
    [
      'Size',
      `${record.image.width} × ${record.image.height} texels, anchor (${record.image.anchorX}, ${record.image.anchorY})`,
    ],
  ];
  infoList.replaceChildren(
    ...rows.flatMap(([term, value]) => {
      const dt = document.createElement('dt'),
        dd = document.createElement('dd');
      dt.textContent = term;
      dd.textContent = value;
      return [dt, dd];
    }),
  );
  info.hidden = false;
}

/** A tap that did not turn the view picks the nearest shown board under it. */
function attachPicking() {
  let down: { x: number; y: number; time: number; id: number } | null = null;
  let pointers = 0;
  canvas.addEventListener('pointerdown', (event) => {
    pointers++;
    down = pointers === 1 ? { x: event.clientX, y: event.clientY, time: performance.now(), id: event.pointerId } : null;
  });
  const end = (event: PointerEvent) => {
    pointers = Math.max(0, pointers - 1);
    const start = down;
    down = null;
    if (!start || start.id !== event.pointerId || event.type !== 'pointerup' || !loaded) return;
    // With the pointer held, the mouse only looks.
    if (document.pointerLockElement === canvas) return;
    if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > 6 || performance.now() - start.time > 600)
      return;
    const rect = canvas.getBoundingClientRect();
    const ray = screenRay(
      camera,
      event.clientX - rect.left,
      event.clientY - rect.top,
      rect.width,
      rect.height,
      viewFocal(rect.width, rect.height),
    );
    // The boards' records stand unstretched: the ray is taken back to them (exactly for what lies on the ground).
    const unscale = (v: readonly number[]) => [v[0]!, v[1]! / heightScale(), v[2]!];
    const hit = pickBoard(loaded.records, unscale(ray.origin), unscale(ray.direction), (record, lying) => {
      if (!shown.get(lying ? 'lying' : 'standing')) return false;
      if (record.movable && !shown.get('movable')) return false;
      return !record.image.extend || record.copies.length === 1 || shown.get('bands')!;
    });
    if (hit) showInfo(hit.record, hit.lying);
    else info.hidden = true;
  };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);
}

attachFlyControls(canvas, camera, (motion) => {
  moveCamera(camera, motion);
  showMotion();
  requestDraw();
});
attachPicking();
window.addEventListener('resize', requestDraw);
courseSelect.addEventListener('change', () => void openCourse(courseSelect.value));
slider.addEventListener('input', () => keepOnRoad(() => focusAt(Number(slider.value))));
layersButton.addEventListener('click', () => {
  const open = layersPanel.hidden;
  layersPanel.hidden = !open;
  layersButton.setAttribute('aria-expanded', String(open));
});
mustGet('view-top').addEventListener('click', viewTop);
mustGet('view-side').addEventListener('click', viewSide);
mustGet('view-game').addEventListener('click', viewGame);
mapButton.addEventListener('click', () => setMapMode(!mapMode));
projectionButton.addEventListener('click', () => {
  setPerspective(!camera.perspective);
  requestDraw();
});
mustGet('info-close').addEventListener('click', () => (info.hidden = true));
mustGet('info-focus').addEventListener('click', () => {
  if (!selected || !loaded) return;
  const s = selected.placed.routeStart + selected.s;
  slider.value = String(s);
  focusAt(s);
  // The picture at the middle of the view, the eye as it looks, 20 m before it.
  const { forward } = cameraBasis(camera);
  const base = [selected.base[0]!, selected.base[1]! * heightScale(), selected.base[2]!];
  camera.position = [0, 1, 2].map((i) => base[i]! - forward[i]! * LOOK_HERE_METERS) as [number, number, number];
  requestDraw();
});

buildLayers();
const requested = new URLSearchParams(location.search).get('course');
const first = requested && courseIds.includes(requested) ? requested : courseIds[0]!;
courseSelect.value = first;
await openCourse(first);
