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
import { openPublishedStore } from '../workbench/published-store.js';
import { createViewerGl, type GpuMesh } from './viewer-gl.js';
import { attachCameraInput, focalPixels, screenRay, viewParameters, type OrbitCamera } from './viewer-camera.js';
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
import { buildGround, buildWalls, materialColor } from './viewer-surfaces.js';
import {
  boardLevels,
  buildBoards,
  FORM_COLORS,
  LEVEL_TABLE_WIDTH,
  type BoardMeshes,
  type BoardRecord,
} from './viewer-boards.js';
import { pickBoard } from './viewer-pick.js';

/**
 * The course viewer: every course of the build's delivery, drawn in true perspective from the same functions the game
 * and its physics read, with nothing to edit. [Development](../../docs/development.md#course-viewer) owns its rules.
 */

type LayerKey =
  | 'materials'
  | 'outside'
  | 'clearance'
  | 'unclear'
  | 'walls'
  | 'standing'
  | 'lying'
  | 'shadows'
  | 'bands'
  | 'movable'
  | 'anchors'
  | 'outlines'
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
  { key: 'walls', label: 'Visible walls', group: 'Walls', initial: true },
  { key: 'standing', label: 'Standing rows', group: 'Boards', initial: true },
  { key: 'lying', label: 'Lying rows', group: 'Boards', initial: true },
  { key: 'shadows', label: 'Shadows', group: 'Boards', initial: true },
  { key: 'bands', label: 'Boards repeating sideways', group: 'Boards', initial: true },
  { key: 'movable', label: 'Movable objects', group: 'Boards', initial: true },
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

/** Metres the ground is drawn beyond each course limit at first, and the slider's most. */
const INITIAL_DISPLAY_WIDTH = 20;
const MAXIMUM_DISPLAY_WIDTH = 1000;
/** CSS pixels: the width the viewer's lines are drawn at. */
const LINE_WIDTH = 2;

const canvas = mustGet<HTMLCanvasElement>('view');
const status = mustGet<HTMLElement>('status');
const courseSelect = mustGet<HTMLSelectElement>('course');
const slider = mustGet<HTMLInputElement>('s');
const sValue = mustGet<HTMLOutputElement>('s-value');
const layersPanel = mustGet<HTMLElement>('layers');
const layersButton = mustGet<HTMLButtonElement>('layers-button');
const projectionButton = mustGet<HTMLButtonElement>('projection');
const info = mustGet<HTMLElement>('info');
const infoList = mustGet<HTMLElement>('info-list');

const gpu = createViewerGl(canvas);
const shown = new Map<LayerKey, boolean>(LAYERS.map((layer) => [layer.key, layer.initial]));
let displayWidth = INITIAL_DISPLAY_WIDTH;
const camera: OrbitCamera = { target: [0, 0, 0], yaw: 0, pitch: 0.5, distance: 300, perspective: true };

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
  levels: Uint8Array;
  outlines: GpuMesh | null;
  anchors: GpuMesh | null;
  sky: object | null;
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
  const value = document.createElement('output');
  value.textContent = `${displayWidth} m`;
  range.addEventListener('input', () => (value.textContent = `${range.value} m`));
  range.addEventListener('change', () => {
    displayWidth = Number(range.value);
    rebuildGround();
  });
  width.append(range, value);
  layersPanel.append(heading, width);
}

function layersChanged(key: LayerKey) {
  if (key === 'outside') rebuildGround();
  else if (key === 'materials' && loaded && !loaded.materialGround) rebuildGround();
  requestDraw();
}

/** The drawn ground's width beyond each course limit. */
const drawnWidth = () => (shown.get('outside') ? displayWidth : 0);

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
  loaded.levels = new Uint8Array(built.records.length);
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
  ])
    gpu.remove(mesh);
  if (course.boards) for (const mesh of Object.values(course.boards)) gpu.remove(mesh);
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
      levels: new Uint8Array(0),
      outlines: null,
      anchors: null,
      sky: null,
    };
    info.hidden = true;
    rebuildGround();
    loaded.walls = gpu.meshFrom(buildWalls(loaded.layout));
    const length = routeLength(loaded.layout.route);
    slider.max = String(length);
    slider.step = String(Math.max(0.1, length / 4000));
    slider.value = '0';
    focusAt(0, false);
    viewTop();
    status.textContent = describe(loaded);
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
function focusAt(s: number, keepView = true) {
  const layout = loaded!.layout;
  const occurrence = routeOccurrenceAt(layout.route, s);
  const placed = layout.sections.find((p) => p.occurrence === occurrence)!;
  focus = { placed, s: Math.min(routeSectionS(occurrence, s), placed.section.coordinates.domain.end) };
  const p: number[] = [];
  sectionPoint(layout, placed, focus.s, 0, 0, p);
  camera.target = [p[0]!, p[1]!, p[2]!];
  if (!keepView) camera.yaw = sectionHeading(placed, focus.s);
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
    const row = new Uint16Array(image.width);
    const rgba = new Uint8Array(image.width * image.height * 4);
    for (let y = 0; y < image.height; y++) {
      image.paintRow(row, 0, 0, y, image.width);
      for (let x = 0; x < image.width; x++) {
        const v = row[x]!,
          at = 4 * (y * image.width + x);
        rgba[at] = Math.round((((v >>> 10) & 31) * 255) / 31);
        rgba[at + 1] = Math.round((((v >>> 5) & 31) * 255) / 31);
        rgba[at + 2] = Math.round(((v & 31) * 255) / 31);
        rgba[at + 3] = 255;
      }
    }
    gpu.setSky({ width: image.width, height: image.height, rgba });
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
}

function viewTop() {
  const { bounds } = loaded!.layout;
  camera.pitch = Math.PI / 2 - 1e-4;
  camera.distance = Math.max(bounds.maxX - bounds.minX, bounds.maxZ - bounds.minZ, 100) * 0.9;
  camera.yaw = 0;
  camera.target = [0, camera.target[1], 0];
  requestDraw();
}

function viewSide() {
  if (!focus) return;
  camera.pitch = 0;
  camera.yaw = sectionHeading(focus.placed, focus.s) + Math.PI / 2;
  camera.distance = 200;
  focusAt(Number(slider.value));
}

/**
 * The game's camera behind a car standing on the centreline at the focus, facing along the road: `updateCamera` with
 * the camera definition, carried to the world by the occurrence.
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
    sprungPitch: 0,
    longitudinalSpeed: 0,
    lateralSpeed: 0,
  };
  const game = updateCamera(createCameraRig(), { coordinates }, vehicle, CAMERA_DEFINITION, 'FACING');
  const t = placed.worldFromSection;
  const eye = [
    t.cosine * game.x + t.sine * game.z + t.translation.x - loaded!.layout.origin.x,
    game.y,
    -t.sine * game.x + t.cosine * game.z + t.translation.z - loaded!.layout.origin.z,
  ];
  setPerspective(true);
  camera.yaw = game.yaw + placed.rotation;
  camera.pitch = game.pitch;
  camera.distance = 1;
  camera.target = [
    eye[0]! + Math.sin(camera.yaw) * Math.cos(camera.pitch),
    eye[1]! - Math.sin(camera.pitch),
    eye[2]! + Math.cos(camera.yaw) * Math.cos(camera.pitch),
  ];
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
  const focal = viewFocal(width, height);
  const view = viewParameters(camera, width, height, ratio, focal);
  gpu.begin(view, [0.05, 0.05, 0.08]);
  if (!loaded) return;
  if (shown.get('sky'))
    gpu.drawSky(view.rayFromScreen, CAMERA_DEFINITION.focalLength, skyPlacement.yawX, skyPlacement.horizonY);
  gpu.drawMesh(shown.get('materials') ? loaded.materialGround : loaded.ground, view, { ground: true });
  const boards = loaded.boards;
  const tint = shown.get('form') ? 0.6 : 0;
  if (boards) {
    boardLevels(
      loaded.records,
      view.eye,
      view.forward,
      focal,
      camera.perspective ? null : camera.distance,
      loaded.levels,
    );
    gpu.setBoardLevels(loaded.levels);
    // What lies on the ground draws onto it: the shadows halve it first, then the lying rows cover it.
    if (shown.get('shadows') && shown.get('movable')) gpu.drawShadows(boards.shadows, view, view.eye);
    if (shown.get('lying')) {
      gpu.drawBoards(boards.lying, view, view.eye, true, tint);
      if (shown.get('bands')) gpu.drawBoards(boards.bandLying, view, view.eye, true, tint);
      if (shown.get('movable')) gpu.drawBoards(boards.movableLying, view, view.eye, true, tint);
    }
  }
  if (shown.get('unclear')) gpu.drawMesh(loaded.unclear, view, { translucent: true });
  if (shown.get('clearance')) gpu.drawLines(loaded.clearance, view, LINE_WIDTH, true);
  if (shown.get('walls')) gpu.drawMesh(loaded.walls, view);
  if (boards && shown.get('standing')) {
    gpu.drawBoards(boards.standing, view, view.eye, false, tint);
    if (shown.get('bands')) gpu.drawBoards(boards.bandStanding, view, view.eye, false, tint);
    if (shown.get('movable')) gpu.drawBoards(boards.movableStanding, view, view.eye, false, tint);
  }
  if (shown.get('outlines')) gpu.drawLines(loaded.outlines, view, LINE_WIDTH / 2, true);
  if (shown.get('anchors')) gpu.drawLines(loaded.anchors, view, LINE_WIDTH, true);
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
    const hit = pickBoard(loaded.records, ray.origin, ray.direction, (record, lying) => {
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

attachCameraInput(canvas, camera, requestDraw, () => viewFocal(canvas.clientWidth, canvas.clientHeight));
attachPicking();
window.addEventListener('resize', requestDraw);
courseSelect.addEventListener('change', () => void openCourse(courseSelect.value));
slider.addEventListener('input', () => focusAt(Number(slider.value)));
layersButton.addEventListener('click', () => {
  const open = layersPanel.hidden;
  layersPanel.hidden = !open;
  layersButton.setAttribute('aria-expanded', String(open));
});
mustGet('view-top').addEventListener('click', viewTop);
mustGet('view-side').addEventListener('click', viewSide);
mustGet('view-game').addEventListener('click', viewGame);
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
  camera.target = [...selected.base] as [number, number, number];
  camera.distance = Math.min(camera.distance, 40);
  requestDraw();
});

buildLayers();
const requested = new URLSearchParams(location.search).get('course');
const first = requested && courseIds.includes(requested) ? requested : courseIds[0]!;
courseSelect.value = first;
await openCourse(first);
