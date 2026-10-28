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
import { pictureDimensions, pictureLayers, type ReviewFrame } from './layers.js';
import { ENDURO_REVIEW_NOTES } from './enduro-review-notes.js';

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
if (names.length !== 50 || names.some((n) => !ENDURO_REVIEW_NOTES[n.slice(8)]))
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
  const [description, height, reason] = ENDURO_REVIEW_NOTES[name.slice(8)]!;
  const collision = [...(widths.get(name) ?? [])].sort((a, b) => a - b);
  const scale = height === null ? 1 : height / dimensions.height;
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
    proposedCollisionWidths: collision.map((w) => w * scale),
    reason,
  };
  records.push(record);
  await writeFile(new URL(`${folder}review.json`, out), JSON.stringify(record, null, 2) + '\n');
  const proposal = height === null ? '維持' : `${number(dimensions.height)} → ${number(height)} m`;
  rows.push(
    `<tr class="${height === null ? '' : 'flag'}"><td><a href="#${name}">${name.slice(8)}</a></td><td>${escape(description)}</td><td>${number(dimensions.width)}</td><td>${number(dimensions.height)}</td><td>${number(dimensions.standingHeight)}</td><td>${number(dimensions.nearGround)}</td><td>${collision.map(number).join(' / ') || 'なし'}</td><td>${proposal}</td></tr>`,
  );
  cards.push(
    `<article id="${name}" class="${height === null ? '' : 'flag'}"><h2>${name} · ${escape(description)}</h2><p>${number(dimensions.width)} × ${number(dimensions.height)} m　提案: <strong>${proposal}</strong>　${mirrored ? '原本の反転版から正向きに復元' : ''}</p><p>${escape(reason)}</p>${variants.join('')}<figure><img src="${folder}shadow-overlay.svg" alt="影と基準点・基準線・当たり幅"/><figcaption>${shadow ? '現在の影' : '影なし'} · 黄: 基準点 / 青: 地面 / 赤: 当たり幅の端（複数あれば全て）</figcaption></figure><details><summary>縮尺案と基準の人物・ゲートを同倍率で見る</summary><p>縮尺案だけのプレビュー。生成画像・公開版ではありません。地面部分を含む枠の高さです。</p><div class="ruler"><figure><img src="${folder}body-${asset.defaultPalette}.png" width="${Math.round(master.width * scale)}" height="${Math.round(master.height * scale)}" alt="縮尺案"/><figcaption>案: ${number(dimensions.width * scale)} × ${number(height ?? dimensions.height)} m</figcaption></figure><figure><img data-reference="person" alt="基準の人物"/><figcaption>人物 2.075 m</figcaption></figure><figure><img data-reference="gate" alt="基準の支柱"/><figcaption>ゲート支柱 4.45 m</figcaption></figure></div></details></article>`,
  );
}
// Use each reference's actual default palette, rather than assuming one palette name for all pictures.
for (const [key, name] of [
  ['person', 'enduror-10398'],
  ['gate', 'enduror-111f8'],
] as const) {
  const file = files.includes(`${name}.json`) ? `${name}.json` : `${name}-mirrored.json`;
  const asset = readSpriteLodAsset(JSON.parse(await readFile(new URL(`content/images/${file}`, root), 'utf8')));
  for (let i = 0; i < cards.length; i++)
    cards[i] = cards[i]!.replace(
      new RegExp(`(?:src="[^"]*" )?data-reference="${key}"`, 'g'),
      `src="${name}/body-${asset.defaultPalette}.png" width="${asset.width}" height="${asset.height}"`,
    );
}
await writeFile(
  new URL('review.json', out),
  JSON.stringify({ commit, localExtracts: local, pictures: records }, null, 2) + '\n',
);
await writeFile(
  new URL('index.html', out),
  `<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ENDURO RACER — PS-1 縮尺一覧</title><style>
body{margin:0;background:#142128;color:#e4edf0;font:16px/1.65 system-ui,sans-serif}main{max-width:1200px;margin:auto;padding:32px 24px}h1{font-size:30px}h2{font-size:19px}a{color:#6ed7ed}article{background:#20333c;margin:24px 0;padding:20px;border:1px solid #435a66;border-radius:12px;overflow:auto}.flag{border-left:4px solid #e9ac48}table{border-collapse:collapse;width:100%;font-size:14px}td,th{padding:9px;text-align:left;border-bottom:1px solid #435a66;white-space:nowrap}.scroll{overflow:auto}img{image-rendering:pixelated;max-width:none}figure{margin:8px;display:inline-flex;flex-direction:column;align-items:center;gap:8px}figure img{background:repeating-conic-gradient(#b5c0c5 0% 25%,#dce1e3 0% 50%) 0 0/16px 16px}figcaption{font-size:13px;color:#bcced6}.pair,.ruler{display:flex;align-items:flex-end;gap:24px;overflow:auto;padding:10px}.ruler{background:repeating-linear-gradient(to top,#435a66 0 1px,transparent 1px 40px)}summary{cursor:pointer;color:#6ed7ed;padding:10px 0}p{max-width:90ch}.tag{color:#e9ac48}header{border-bottom:1px solid #435a66;padding-bottom:24px}
</style><main><header><p class="tag">STAGE PS / 01 · K の確認待ち · 生成なし</p><h1>ENDURO RACER の絵と縮尺</h1><p>50枚。原本の絵、本体、影を40 px/mの同じ倍率で表示します。金色の印は縮尺の変更案です。人とゲートは原本の大きさを基準にしています。案は実測値ではなく、絵を見た提案です。</p><p>枠の高さと、基準点より上の高さを分けて記載しています。足元の地面は本体に残ります。公開版の生成・コース比較・実機への追加は後続PRです。</p><p>${local ? '手元版: ROM 抜き出しを含みます。Git・PR・Pages に置かないでください。' : 'Pages 版: ROM 抜き出しを含みません。'}　<a href="review.json">寸法データ</a></p><small>原本 commit ${commit}</small></header><h2>全50枚の寸法（m）</h2><div class="scroll"><table><thead><tr><th>ID</th><th>絵</th><th>幅</th><th>枠の高さ</th><th>基準点より上</th><th>手前の地面</th><th>当たり幅</th><th>高さの案</th></tr></thead><tbody>${rows.join('')}</tbody></table></div>${cards.join('')}</main></html>`,
);
console.log(
  `PS-1: ${names.length} pictures, ${records.filter((r) => r.proposedHeight !== null).length} proposals, ${local ? 'local extracts' : 'no extracts'}: ${out.pathname}`,
);
