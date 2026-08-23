import test from 'node:test';
import assert from 'node:assert/strict';

import { compileStageEnvironment } from '../dist/compiler/stage-environment-compiler.js';
import { createM2StadiumGuide } from '../dist/core/debug-course.js';
import { createM622ChildStageContinuation } from '../dist/dev/m6-22-child-stage-continuation.js';
import {
  createM623ChildEnvironmentAuthoring,
  createM623ChildEnvironmentContent,
} from '../dist/dev/m6-23-child-environment-content.js';
import { createM4SpriteAssets } from '../dist/visual/m4-sprite-assets.js';

function assetLibrary(assets) {
  return {
    tree: assets.tree,
    sign: assets.sign,
    guardrail: assets.guardrail,
    building: assets.building,
  };
}

test('M6.24 compiler converts stage-local sprite l into the source Guide frame exactly once', () => {
  const continuation = createM622ChildStageContinuation(createM2StadiumGuide());
  const source = continuation.left;
  const assets = createM4SpriteAssets();
  const environment = compileStageEnvironment(source, {
    id: 'LOCAL_L_TEST',
    heightNodes: [{ s: 0, y: 0 }, { s: 100, y: 0 }],
    visualSections: [{
      sStart: 0,
      name: 'LOCAL_L_TEST',
      groundBaseLeft: { kind: 'transparent' },
      groundBaseRight: { kind: 'transparent' },
    }],
    terrain: {
      screenHeight: 240,
      dMin: 2.5,
      dMax: 150,
      groundLeft: 12,
      groundRight: 12,
      roadLeft: 3.5,
      roadRight: 3.5,
      thinSpanScreenRows: 1,
    },
    sprites: [{ name: 'LOCAL_SIGN', s: 80, l: 2.25, assetId: 'sign' }],
  }, assetLibrary(assets));

  assert.equal(environment.worldSprites.length, 1);
  assert.equal(environment.worldSprites[0].l, source.roadView.sourceLateralOrigin + 2.25);
  assert.equal(environment.worldSprites[0].sRender, 80);
  assert.equal(environment.terrainProfile.height, environment.heightProfile);
});

test('M6.24 compiler rejects unknown assets, duplicate names and out-of-domain sprite chainage', () => {
  const continuation = createM622ChildStageContinuation(createM2StadiumGuide());
  const source = continuation.left;
  const assets = createM4SpriteAssets();
  const base = {
    id: 'VALIDATION_TEST',
    heightNodes: [{ s: 0, y: 0 }, { s: 100, y: 0 }],
    visualSections: [{
      sStart: 0,
      name: 'VALIDATION_TEST',
      groundBaseLeft: { kind: 'transparent' },
      groundBaseRight: { kind: 'transparent' },
    }],
    terrain: {
      screenHeight: 240,
      dMin: 2.5,
      dMax: 150,
      groundLeft: 12,
      groundRight: 12,
      roadLeft: 3.5,
      roadRight: 3.5,
      thinSpanScreenRows: 1,
    },
  };

  assert.throws(
    () => compileStageEnvironment(source, { ...base, sprites: [{ name: 'A', s: 80, l: 0, assetId: 'missing' }] }, assetLibrary(assets)),
    /unknown stage sprite asset/,
  );
  assert.throws(
    () => compileStageEnvironment(source, { ...base, sprites: [
      { name: 'A', s: 80, l: 0, assetId: 'sign' },
      { name: 'A', s: 90, l: 0, assetId: 'tree' },
    ] }, assetLibrary(assets)),
    /duplicate stage sprite name/,
  );
  assert.throws(
    () => compileStageEnvironment(source, { ...base, sprites: [{ name: 'A', s: source.guide.length, l: 0, assetId: 'sign' }] }, assetLibrary(assets)),
    /outside Guide chainage/,
  );
});

test('M6.24 M6.23 coast/mountain fixtures are now plain authoring compiled to the same stage identities', () => {
  const continuation = createM622ChildStageContinuation(createM2StadiumGuide());
  const assets = createM4SpriteAssets();
  const authoring = createM623ChildEnvironmentAuthoring(continuation);
  const compiled = createM623ChildEnvironmentContent(continuation, assets);

  assert.equal(authoring.left.id, 'LEFT_COAST_STAGE');
  assert.equal(authoring.right.id, 'RIGHT_MOUNTAIN_STAGE');
  assert.equal(compiled.left.id, authoring.left.id);
  assert.equal(compiled.right.id, authoring.right.id);
  assert.deepEqual(
    compiled.left.worldSprites.map((sprite) => sprite.name),
    authoring.left.sprites.map((sprite) => sprite.name),
  );
  assert.deepEqual(
    compiled.right.worldSprites.map((sprite) => sprite.name),
    authoring.right.sprites.map((sprite) => sprite.name),
  );
  assert.equal(compiled.left.heightProfile.sampleRender(60).y, 0);
  assert.equal(compiled.right.heightProfile.sampleRender(60).y, 0);
  assert.notEqual(compiled.left.heightProfile.sampleRender(150).y, compiled.right.heightProfile.sampleRender(150).y);
});

test('M6.24 environment compiler is route/camera/renderer blind and emits existing runtime source types only', async () => {
  const { readFile } = await import('node:fs/promises');
  const source = await readFile(new URL('../src/compiler/stage-environment-compiler.ts', import.meta.url), 'utf8');
  const imports = [...source.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((match) => match[1]);

  assert.equal(imports.some((entry) => entry.includes('route-dag')), false);
  assert.equal(imports.some((entry) => entry.includes('route-stage')), false);
  assert.equal(imports.some((entry) => entry.includes('/render/m5-renderer')), false);
  assert.equal(imports.some((entry) => entry.includes('/projection')), false);
  assert.equal(imports.some((entry) => entry.includes('/camera')), false);
  assert.match(source, /CyclicHeightProfile/);
  assert.match(source, /CyclicVisualProfile/);
  assert.match(source, /compileCourseSprite/);
});

test('M6.24 M6.23 DEV module no longer constructs runtime profiles or CourseSprites directly', async () => {
  const { readFile } = await import('node:fs/promises');
  const source = await readFile(new URL('../src/dev/m6-23-child-environment-content.ts', import.meta.url), 'utf8');

  assert.match(source, /compileStageEnvironment/);
  assert.doesNotMatch(source, /new CyclicHeightProfile/);
  assert.doesNotMatch(source, /new CyclicVisualProfile/);
  assert.doesNotMatch(source, /compileCourseSprite/);
});
