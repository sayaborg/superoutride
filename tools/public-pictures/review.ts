import { requireLoaded } from '../../src/content/content-load-error.js';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { PNG } from 'pngjs';
import { readSpriteLodAsset } from '../../src/image/sprite.js';
import { rgb555ToRgba, unpackRgba } from '../../src/image/rgb555.js';
import { readCourseDocument } from '../../src/course/course-document.js';
import { courseElementLeaves, expansionWork } from '../../src/course/course-repeat.js';
import { contentDigest } from '../../src/core/content-digest.js';
import { romSet } from '../road-data/road-data-commands.js';
import { assembleEnduroRacerPrograms, assembleEnduroRacerSprites } from '../road-data/enduro-racer-rom.js';
import { sizeSetPixels, readSpritePalette } from '../road-data/enduro-racer-sprites.js';
import { pictureDimensions, pictureLayers, reviewFrame, type ReviewFrame } from './layers.js';
import { PUBLIC_TABLE_PATH, readPublicPictureTable } from './table.js';
import { scalePublicPicture } from './scaled-picture.js';
import { compileSpriteLod } from '../graphics/sprite-lod-compiler.js';
const table = readPublicPictureTable(
  JSON.parse(await readFile(new URL(`content/${PUBLIC_TABLE_PATH}`, new URL('../../', import.meta.url)), 'utf8')),
);

const root = new URL('../../', import.meta.url);
const local = process.argv.includes('--local');
if (process.argv.slice(2).some((a) => a !== '--local')) throw new TypeError('Usage: public-pictures [--local]');
// No caller-provided output path: raw extracts can only reach the ignored local directory.
const out = new URL(local ? 'reference-media/public-pictures-local/' : 'dist/public-pictures/', root);
await mkdir(out, { recursive: true });
const commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
const course = requireLoaded(
  readCourseDocument(JSON.parse(await readFile(new URL('content/courses/enduro-racer.course.json', root), 'utf8'))),
);
const widths = new Map<string, Set<number>>();
for (const section of course.sections) {
  for (const { element } of courseElementLeaves(section.sprites, '', expansionWork(100000))) {
    const name = element.image.replace(/-mirrored$/, '');
    const set = widths.get(name) ?? new Set<number>();
    if (element.body) set.add(element.body.width);
    widths.set(name, set);
  }
}
let extract: { main: Uint8Array; words: Uint32Array } | null = null;
if (local) {
  const set = await romSet(
    'enduror and endurobl',
    ['enduror', 'endurobl'].map((n) => new URL(`reference-media/enduro-racer/rom/${n}.zip`, root).pathname),
  );
  extract = { main: assembleEnduroRacerPrograms(set).main, words: assembleEnduroRacerSprites(set) };
}
const files = (await readdir(new URL('content/images/', root))).filter((f) =>
  /^enduror-[0-9a-f]{5}(-mirrored)?\.json$/.test(f),
);
const names = [...new Set(files.map((f) => f.replace(/(-mirrored)?\.json$/, '')))].sort();
if (names.length !== 50 || names.some((n) => !table.pictures[n]))
  throw new RangeError('PS-1 review requires exactly the 50 inspected ENDURO RACER pictures');
const escape = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const number = (v: number) => v.toFixed(3).replace(/0+$/, '').replace(/\.$/, '');
async function png(file: string, frame: ReviewFrame, colors: readonly number[]) {
  const image = new PNG({ width: frame.width, height: frame.height });
  frame.indices.forEach((index, i) => {
    const c = unpackRgba(rgb555ToRgba(colors[index] ?? 0));
    image.data.set([c.r, c.g, c.b, index ? 255 : 0], i * 4);
  });
  const bytes = PNG.sync.write(image);
  await writeFile(new URL(file, out), bytes);
  return bytes;
}
function annotated(frame: ReviewFrame, file: string, bodyWidths: readonly number[]) {
  const margin = 8;
  const x = frame.anchorX + 0.5,
    y = frame.anchorY + 0.5;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${frame.width + margin * 2}" height="${frame.height + margin * 2}" viewBox="${-margin} ${-margin} ${frame.width + margin * 2} ${frame.height + margin * 2}"><image href="${file}" width="${frame.width}" height="${frame.height}" style="image-rendering:pixelated"/><path d="M0 ${y}H${frame.width}" stroke="#27a8e0" stroke-width="1"/>${bodyWidths.map((w) => `<path d="M${x - w * 20} ${y - 5}v10 M${x + w * 20} ${y - 5}v10" stroke="#ef3340" stroke-width="1"/>`).join('')}<path d="M${x - 3} ${y}h6 M${x} ${y - 3}v6" stroke="#ffc400" stroke-width="1"/></svg>`;
}
function scaleFigure(frame: ReviewFrame, source: string, label: string, scale = 1) {
  return `<figure><span class="scale-frame" style="width:${frame.width * scale}px"><img src="${source}" style="width:${frame.width * scale}px;height:${frame.height * scale}px;top:calc(var(--ground-y) - ${(frame.anchorY + 0.5) * scale}px)" alt="${escape(label)}"/></span><figcaption>${escape(label)}</figcaption></figure>`;
}
const references = await Promise.all(
  ['enduror-10398', 'enduror-111f8'].map(async (name) => {
    const mirrored = !files.includes(`${name}.json`);
    const file = `${name}${mirrored ? '-mirrored' : ''}.json`;
    const asset = readSpriteLodAsset(JSON.parse(await readFile(new URL(`content/images/${file}`, root), 'utf8')));
    return {
      frame: pictureLayers(asset.levels[0]!, mirrored).body,
      source: `${name}/body-${asset.defaultPalette}.png`,
      label: `${name === 'enduror-10398' ? '人物' : 'ゲート支柱'} ${number(pictureDimensions(pictureLayers(asset.levels[0]!, mirrored).body).height)} m`,
    };
  }),
);
const cards: string[] = [],
  rows: string[] = [];
const records = [];
for (const name of names) {
  const mirrored = !files.includes(`${name}.json`);
  const file = `${name}${mirrored ? '-mirrored' : ''}.json`;
  const bytes = await readFile(new URL(`content/images/${file}`, root));
  const asset = readSpriteLodAsset(JSON.parse(bytes.toString()));
  const { master, body, shadow } = pictureLayers(asset.levels[0]!, mirrored);
  const dimensions = pictureDimensions(master);
  const settings = table.pictures[name]!;
  const { description, height, reason } = settings;
  const { master: publicMaster, scale } = scalePublicPicture(asset, settings, mirrored);
  const publicAsset = readSpriteLodAsset(compileSpriteLod(publicMaster));
  const publicFrame = reviewFrame(publicAsset.levels[0]!);
  const publicShadow = publicAsset.levels[0]!.shadow;
  if (publicShadow) {
    const frame = reviewFrame(publicShadow);
    await mkdir(new URL(`${name}/`, out), { recursive: true });
    await png(`${name}/public-shadow.png`, frame, [0, 32767]);
    await writeFile(
      new URL(`${name}/public-shadow-overlay.svg`, out),
      annotated(
        frame,
        'public-shadow.png',
        [...(widths.get(name) ?? [])].map((w) => settings.collisionWidth ?? w * scale),
      ),
    );
  }
  await mkdir(new URL(`${name}/`, out), { recursive: true });
  await png(`${name}/public.png`, publicFrame, publicAsset.levels[0]!.paletteRgb555);
  await writeFile(
    new URL(`${name}/public-anchor.svg`, out),
    annotated(
      publicFrame,
      'public.png',
      settings.collisionWidth === null
        ? [...(widths.get(name) ?? [])].map((w) => w * scale)
        : [settings.collisionWidth],
    ),
  );
  const collision = [...(widths.get(name) ?? [])].sort((a, b) => a - b);
  const folder = `${name}/`;
  await mkdir(new URL(folder, out), { recursive: true });
  const variants: string[] = [];
  for (const [palette, { colors }] of Object.entries(asset.palettes)) {
    await png(`${folder}master-${palette}.png`, master, colors);
    await png(`${folder}body-${palette}.png`, body, colors);
    variants.push(
      `<div><h4>${escape(palette)}</h4><div class="pair"><figure><img src="${folder}master-${palette}.png" width="${master.width}" height="${master.height}" alt="現在の絵"/><figcaption>現在の絵</figcaption></figure><figure><img src="${folder}body-${palette}.png" width="${body.width}" height="${body.height}" alt="影を除いた本体"/><figcaption>本体（影だけ除去）</figcaption></figure></div></div>`,
    );
    if (extract) {
      const raw = sizeSetPixels(extract.main, extract.words, parseInt(name.slice(8), 16));
      const rawFrame = {
        width: raw.width,
        height: raw.height,
        anchorX: (raw.width - 1) / 2,
        anchorY: raw.height - 0.5,
        indices: [...raw.pixels].map((v) => (v === 15 ? 0 : v)),
      };
      await png(
        `${folder}extract-${palette}.png`,
        rawFrame,
        readSpritePalette(extract.main, parseInt(palette.slice(1), 10)).rgb555,
      );
      variants.push(
        `<details><summary>ROM 抜き出し・${escape(palette)}（原画素・ペン10を含む）</summary><img src="${folder}extract-${palette}.png" width="${raw.width}" height="${raw.height}" alt="ROM 抜き出し"/></details>`,
      );
    }
  }
  const shadowFrame = shadow ?? { ...master, indices: master.indices.map(() => 0) };
  const shadowBytes = await png(`${folder}shadow.png`, shadowFrame, [0, ...Array<number>(15).fill(0x4210)]);
  const overlay = annotated(shadowFrame, `data:image/png;base64,${shadowBytes.toString('base64')}`, collision);
  await writeFile(new URL(`${folder}shadow-overlay.svg`, out), overlay);
  const record = {
    name,
    description,
    source: file,
    sourceSha256: await contentDigest(bytes),
    unmirroredFromMirror: mirrored,
    ...dimensions,
    collisionWidths: collision,
    shadow: shadow !== null,
    proposedHeight: height,
    proposedWidth: dimensions.width * scale,
    proposedFrameHeightTexels: master.height * scale,
    proposedCollisionWidths: collision.map((w) => settings.collisionWidth ?? w * scale),
    reason,
    originalAnchor: { x: master.anchorX, y: master.anchorY },
    publicAnchor: { x: publicFrame.anchorX, y: publicFrame.anchorY },
    publicHeight: pictureDimensions(publicFrame).height,
  };
  records.push(record);
  await writeFile(new URL(`${folder}review.json`, out), JSON.stringify(record, null, 2) + '\n');
  const proposal = height === null ? '維持' : `${number(dimensions.height)} → ${number(height)} m`;
  rows.push(
    `<tr class="${height === null ? '' : 'flag'}"><td><a href="#${name}">${name.slice(8)}</a></td><td>${escape(description)}</td><td>${number(dimensions.width)}</td><td>${number(dimensions.height)}</td><td>${number(dimensions.frameHeightTexels)}</td><td>${number(dimensions.groundTexels)}</td><td>${collision.map(number).join(' / ') || 'なし'}</td><td>${proposal}</td><td>${collision.map((w) => number(settings.collisionWidth ?? w * scale)).join(' / ') || 'なし'}</td><td>${settings.anchor ? `${number(settings.anchor.x)}, ${number(settings.anchor.y)}` : '原本を継承'}</td></tr>`,
  );
  const above = Math.max(publicFrame.anchorY + 0.5, ...references.map((r) => r.frame.anchorY + 0.5));
  const ground = Math.max(
    pictureDimensions(publicFrame).groundTexels,
    ...references.map((r) => pictureDimensions(r.frame).groundTexels),
  );
  cards.push(
    `<article id="${name}" class="${height === null ? '' : 'flag'}"><h2>${name} · ${escape(description)}</h2><p>${number(dimensions.width)} × ${number(dimensions.height)} m　提案: <strong>${proposal}</strong>　${mirrored ? '原本の反転版から正向きに復元' : ''}</p><p>${escape(reason)}</p>${variants.join('')}${publicShadow ? `<figure><img src="${folder}public-shadow-overlay.svg" alt="公開版の手続きの影と基準点・当たり幅"/><figcaption>公開版の影・60° / 45°</figcaption></figure>` : ''}<figure><img src="${folder}public-anchor.svg" alt="公開版と補正後の基準点"/><figcaption>公開版・縮尺と手続きの影 / 高さ ${number(pictureDimensions(publicFrame).height)} m / 基準点 (${number(publicFrame.anchorX)}, ${number(publicFrame.anchorY)})</figcaption></figure><figure><img src="${folder}shadow-overlay.svg" alt="影と基準点・基準線・当たり幅"/><figcaption>${shadow ? '現在の影' : '影なし'} · 黄: 基準点 / 青: 地面 / 赤: 当たり幅の端（複数あれば全て）</figcaption></figure><details><summary>縮尺案と基準の人物・ゲートを同倍率で見る</summary><p>高さは基準点（地面）から上まで。青線は地面＝0 mです。基準点より下は手前の地面上の絵で、高さには含みません。</p><div class="ruler" style="--ground-y:${above}px;--frame-height:${above + ground}px">${scaleFigure(publicFrame, `${folder}public.png`, `案: 幅 ${number(publicFrame.width / 40)} m・高さ ${number(pictureDimensions(publicFrame).height)} m`)}${references.map((r) => scaleFigure(r.frame, r.source, r.label)).join('')}</div></details></article>`,
  );
}
await writeFile(
  new URL('review.json', out),
  JSON.stringify({ commit, localExtracts: local, pictures: records }, null, 2) + '\n',
);
await writeFile(
  new URL('index.html', out),
  `<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ENDURO RACER — PS-1 縮尺一覧</title><style>
body{margin:0;background:#142128;color:#e4edf0;font:16px/1.65 system-ui,sans-serif}main{max-width:1200px;margin:auto;padding:32px 24px}h1{font-size:30px}h2{font-size:19px}a{color:#6ed7ed}article{background:#20333c;margin:24px 0;padding:20px;border:1px solid #435a66;border-radius:12px;overflow:auto}.flag{border-left:4px solid #e9ac48}table{border-collapse:collapse;width:100%;font-size:14px}td,th{padding:9px;text-align:left;border-bottom:1px solid #435a66;white-space:nowrap}.scroll{overflow:auto}img{image-rendering:pixelated;max-width:none}figure{margin:8px;display:inline-flex;flex-direction:column;align-items:center;gap:8px}figure img{background:repeating-conic-gradient(#b5c0c5 0% 25%,#dce1e3 0% 50%) 0 0/16px 16px}figcaption{font-size:13px;color:#bcced6}.pair,.ruler{display:flex;align-items:flex-end;gap:24px;overflow:auto;padding:10px}.ruler{align-items:flex-start}.scale-frame{height:var(--frame-height);position:relative;display:block}.scale-frame img{position:absolute;left:0}.scale-frame::after{content:"";position:absolute;left:0;right:0;top:var(--ground-y);border-top:1px solid #27a8e0}summary{cursor:pointer;color:#6ed7ed;padding:10px 0}p{max-width:90ch}.tag{color:#e9ac48}header{border-bottom:1px solid #435a66;padding-bottom:24px}
</style><main><header><p class="tag">STAGE PS / 02 · 縮尺試案・基準点の確認 · 生成なし</p><h1>ENDURO RACER の絵と縮尺</h1><p>50枚。原本の絵、本体、影を40 px/mの同じ倍率で表示します。金色の印は縮尺の変更案です。人とゲートは原本の大きさを基準にしています。案は実測値ではなく、絵を見た提案です。</p><p>基準点の行が地面＝高さ0です。物の高さは基準点から上までで測り、基準点より下の絵は高さに含めません。下の部分は手前の地面上に寝ている絵で、本体には残ります。DEV の ENDURO RACER PUBLIC で縮尺調整版を走れます。生成画像への置換とコース画面の比較は後続PRです。</p><p>${local ? '手元版: ROM 抜き出しを含みます。Git・PR・Pages に置かないでください。' : 'Pages 版: ROM 抜き出しを含みません。'}　<a href="review.json">寸法データ</a></p><small>原本 commit ${commit}</small></header><h2>全50枚の寸法</h2><div class="scroll"><table><thead><tr><th>ID</th><th>絵</th><th>幅（m）</th><th>高さ・地面から上（m）</th><th>画像の高さ（px）</th><th>地面部分（px）</th><th>当たり幅（m）</th><th>高さの案</th><th>公開版の当たり幅（m）</th><th>基準点の補正（元絵のpx）</th></tr></thead><tbody>${rows.join('')}</tbody></table></div>${cards.join('')}</main></html>`,
);
console.log(
  `PS-2: ${names.length} pictures, ${records.filter((r) => r.proposedHeight !== null).length} proposals, ${local ? 'local extracts' : 'no extracts'}: ${out.pathname}`,
);
