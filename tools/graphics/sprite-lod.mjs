import { CURRENT_FOCAL_LENGTH_PIXELS, pixelsPerMeterAtDepth } from '../../dist/view/presentation-scale.js';
import { createSpriteLodFixture } from '../../dist/image/fixtures/sprite-lod.js';
import { SoftwareSurface } from '../../dist/view/software-surface.js';
import { rgba } from '../../dist/image/rgb555.js';
import { drawScaledSprite } from '../../dist/view/sprite.js';
import { readSpriteLodAsset, selectSpriteLevel, SPRITE_SOURCE_TEXELS_PER_METER } from '../../dist/image/sprite.js';

const element = (id) => document.getElementById(id);
const surfaces = [new SoftwareSurface(320, 240), new SoftwareSurface(320, 240)];
const contexts = ['lod', 'master'].map((id) => element(id).getContext('2d'));
let documentSource, asset, master, animation;
function load(source) {
  const next = readSpriteLodAsset(source);
  master = readSpriteLodAsset({ ...source, levels: [source.levels[0]] });
  asset = next;
  documentSource = source;
  element('error').textContent = '';
  render();
}
function stop() {
  cancelAnimationFrame(animation);
  animation = undefined;
  element('animate').textContent = 'Animate approach';
}
function render() {
  const depth = Number(element('depth').value),
    phase = Number(element('phase').value);
  if (!Number.isFinite(depth) || depth < 2.5 || depth > 200 || !Number.isFinite(phase) || phase < 0 || phase > 1) {
    element('error').textContent = 'Depth must be 2.5–200 m; subpixel offset must be 0–1.';
    return;
  }
  element('error').textContent = '';
  const ppm = pixelsPerMeterAtDepth(CURRENT_FOCAL_LENGTH_PIXELS, depth);
  const k = selectSpriteLevel(asset, ppm),
    level = asset.levels[k];
  const stats = [asset, master].map((sprite, i) => {
    const surface = surfaces[i];
    surface.clear(rgba(28, 42, 54));
    const result = drawScaledSprite(surface, sprite, 160 + phase, 200 + phase, ppm);
    const context = contexts[i];
    context.putImageData(new ImageData(new Uint8ClampedArray(surface.pixels.buffer), 320, 240), 0, 0);
    context.strokeStyle = '#fff';
    context.lineWidth = 1;
    context.beginPath();
    context.moveTo(156 + phase, 200 + phase);
    context.lineTo(164 + phase, 200 + phase);
    context.moveTo(160 + phase, 196 + phase);
    context.lineTo(160 + phase, 204 + phase);
    context.stroke();
    return result;
  });
  const scale = (ppm * asset.worldWidthMeters) / asset.width;
  element('result').textContent =
    `${asset.name}\nLOD ${k}: ${level.width} × ${level.height}; ${ppm.toFixed(3)} screen px/m\nLogical frame: ${asset.worldWidthMeters.toFixed(3)} × ${(asset.height / SPRITE_SOURCE_TEXELS_PER_METER).toFixed(3)} m\nProjected extent: ${(asset.width * scale).toFixed(3)} × ${(asset.height * scale).toFixed(3)} px\nAnchor: ${(160 + phase).toFixed(2)}, ${(200 + phase).toFixed(2)}; samples: ${stats[0].outputSamples} / ${stats[1].outputSamples}`;
}
element('fixture').addEventListener('change', async () => {
  stop();
  const current = ++request,
    value = element('fixture').value;
  try {
    if (value.includes(',')) load(createSpriteLodFixture(...value.split(',').map(Number)));
    else {
      const response = await fetch(new URL(`../../dist/tools/graphics/sprite-lod-${value}.json`, import.meta.url));
      if (!response.ok) throw new Error(`Cannot load compiled sample (${response.status})`);
      const source = await response.json();
      if (current === request) load(source);
    }
  } catch (error) {
    if (current === request) element('error').textContent = error.message;
  }
});
for (const id of ['depth', 'distance', 'phase'])
  element(id).addEventListener('input', () => {
    stop();
    if (id === 'distance') element('depth').value = element(id).value;
    if (id === 'depth') element('distance').value = element(id).value;
    render();
  });
element('animate').addEventListener('click', () => {
  if (animation !== undefined) {
    stop();
    return;
  }
  element('animate').textContent = 'Pause';
  const start = performance.now();
  const frame = (now) => {
    const depth = 5 * 2 ** (5 * (1 - ((now - start) % 12000) / 12000));
    element('depth').value = depth.toFixed(3);
    element('distance').value = depth;
    render();
    animation = requestAnimationFrame(frame);
  };
  animation = requestAnimationFrame(frame);
});
let request = 0;
element('file').addEventListener('change', async () => {
  stop();
  const current = ++request,
    file = element('file').files[0];
  if (!file) return;
  try {
    // Preview admission limit, not a product asset or target-device budget.
    if (file.size > 8 * 1024 * 1024) throw new Error('Preview JSON exceeds 8 MiB.');
    const source = JSON.parse(await file.text());
    if (current === request) load(source);
  } catch (error) {
    if (current === request) element('error').textContent = error.message;
  }
});
element('download').addEventListener('click', () => {
  const url = URL.createObjectURL(new Blob([JSON.stringify(documentSource)], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'sprite-lod.json';
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
});
window.addEventListener('pagehide', stop);
load(createSpriteLodFixture());
