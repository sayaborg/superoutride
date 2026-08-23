# SUPER OUTRIDE 開発引き継ぎメモ

作成日: 2026-08-23 (JST)

## 0. 目的

新しいChatGPTスレッドで、GitHub `sayaborg/superoutride` の `main` を正本として、そのまま開発を継続するための引き継ぎ資料。

新スレッドでは会話記憶を信用して実装を始めず、最初にGitHub mainの実ファイルを読むこと。

最初に確認する順序:

1. `docs/SUPER_OUTRIDE_HANDOFF_2026-08-23.md`
2. `docs/00_core_design_freeze.md`
3. `docs/00a_core_design_freeze_addendum_m5_2.md`
4. `README.md`
5. `package.json`
6. `docs/01_...` ～ `docs/10_...`
7. `tests/`
8. `.github/workflows/pages.yml`

---

# 1. Repository / Pages

```text
repository: sayaborg/superoutride
default branch: main
visibility: public
```

GitHub Pages用workflowは追加済み:

```text
.github/workflows/pages.yml
```

workflow追加commit:

```text
d034c2de6eb1b52e15b06bc51b3aa0dbaeb0b1ac
Add GitHub Pages deployment workflow
```

公開予定URL:

```text
https://sayaborg.github.io/superoutride/
```

Pagesの初回Source設定がまだならGitHub UIで:

```text
Settings → Pages → Build and deployment → Source → GitHub Actions
```

以後mainへのpushで `npm install → npm run build → deploy` する。

---

# 2. ゲームの核

ゲーム名:

```text
SUPER OUTRIDE
```

Out Run / OutRunners と Super Hang-On / Cool Riders をリスペクトした高速走行ゲーム。

将来像:

- 周回ゲームではない
- Out Run型のルート分岐を将来追加
- 車 / バイク選択
- BGM選択
- 基本200km/h以上で疾走
- world physicsでは道路に拘束しない
- アウト・イン・アウト成立
- 路外走行可能
- rendererは最後までraster pseudo-3D / Super Scaler

最重要思想:

> **Physicsはworld座標。Rendererはchainage駆動のraster pseudo-3D。**

優先順位:

1. 設計の美しさ・単純さ
2. 実装の単純さ
3. 当時の実機でも成立し得る計算量

通常3Dへ近づける修正を「高精度化」として安易に導入しない。

---

# 3. Target / Input

```text
320 × 240
4:3
60 fps
browser game
```

PC: keyboard。

Mobile / tablet:

- landscape: game中央、左右余白にcontrols
- portrait: game下にcontrols
- steering: analog
- throttle: digital
- brake: digital
- gyro: none

Canonical input:

```ts
interface DrivingInput {
  steering: number; // -1..+1
  throttle: boolean;
  brake: boolean;
}
```

Desktop:

```text
←/→ steering
↑ throttle
↓ brake
V car/bike
R recovery
```

---

# 4. 設計正本

第一正本:

```text
docs/00_core_design_freeze.md
```

元Core Design Freezeをbyte-identicalで保持。安易に改変しない。

M5.2追加正本:

```text
docs/00a_core_design_freeze_addendum_m5_2.md
```

metric sprite scaleについてはこのAddendumが最新決定。

---

# 5. Renderer絶対原則

- Physics authoritative state = world coordinates
- vehicleをroad centerへsnapしない
- 1 chainage → 1 horizontal scanline
- `d = wrapSigned(s_obj - s_cam)`
- camera-space Zをdepthへ入れない
- lateral depth correctionなし
- Euclidean distanceでsprite scale補正しない
- same d → same scale
- same d + same height → same screen Y
- Raster road = straight segment集合
- vertex turn <= 10°
- Raster roadをsmooth polygon化しない
- Guide Curveはcoordinate / camera専用
- Guide/Rasterは同一global s
- Terrain + World Spriteは共通pseudo-depthでfar→near Painter
- z-bufferなし
- polygon roadなし
- perspective-correct textureなし
- arbitrary sprite rotationなし
- arbitrary alphaなし
- sprite transparency 0/1
- camera roll = 0
- GroundMap = `(s,l)` course-section texture
- SurfaceMap physicsも `(s,l)`
- GroundBaseは独立layerではない
- `GroundBase=TRANSPARENT` と `SurfaceMap=VOID` は別概念
- Far Backgroundはhorizon上下を含むfull-screen image

Final renderer:

```text
Optional Clear
→ Full Far Background
→ Terrain + World Sprite far→near
→ Player Sprite
→ HUD
```

---

# 6. Projection / Coordinate

World:

```text
+Z forward at yaw=0
+X right
+Y up
yaw positive clockwise (+Z→+X)
```

```text
t(ψ) = (sinψ, cosψ)
n(ψ) = (cosψ, -sinψ)
l>0 = road right
```

Projection:

```text
x = c_x + (f/d) X_r
y = c_y - f sinΦ - (f/d)(Y-Y_cam) cosΦ
y_h = c_y - f sinΦ
scale = f/d
```

通常frameのworld→courseはprevious Guide segmentからlocal continuity search。global nearestはinit/respawn/teleport等のみ。

---

# 7. M5.2 sprite metric — 絶対正本

ここは変更しない。

```text
player depthで 2.0m = 80px
player depthで 1.0m = 40px
```

したがって:

```text
f / D_cam = 40 px/m
D_cam = f / 40
```

FOV/focal lengthを将来変更してもsprite倍率側に自由度を追加しない。**D_camを動かして2m=80pxを維持する。**

Current:

```text
car physical width = 2.0m
f = 200px
D_cam = 5.0m
player scale = 40px/m
player car width = 80px
d_min = 2.5m
```

Current programmer car:

```text
source width = 80px
world width = 2.0m
```

player depthで1:1。near plane `d=2.5m` では同じ2m objectは160px、最大約2x magnification。

**playerより手前のobjectはchainage depthに従って素直に拡大する。画面都合で縮小しない。**

SpriteAssetはphysical sizeを持つ。source texel countとworld meterは別物。

概念:

```text
texelScale = (f/d) * (worldWidthMeters/sourceWidthTexels)
```

任意の `visualScale` を追加しない。

---

# 8. Current camera

```text
f = 200px
D_cam = 5.0m
pitch = 8° downward
d_min = 2.5m
player target Y ≈ 190px
horizontal FOV ≈ 77.3°
35mm horizontal-FOV equivalent ≈ 22.5mm
flat normal camera height ≈ 2.47m
```

FOVは未freeze。変更可能。ただし必ず `D_cam=f/40` を維持。

vertical framingは完全screen lockではない。hill/dip/sprung/airborneの数pixel motionを残す。

---

# 9. Road width current DEV value

現在のstandard road:

```text
edge l=-4.5m .. +4.5m
road total = 9.0m
2 lanes → 1 lane = 4.5m
```

これはDEV値でfinal freezeではない。
3.5m/lane案は議論したが変更確定していない。勝手に変更しない。

確定済み車幅:

```text
2.0m
```

---

# 10. Milestones

```text
M0 Browser Shell                 complete
M1 Core Geometry                 complete
M2 Road Running                  complete / GO
M3 Visual Core                   complete
M4 Super Scaler                  complete
M5 Driving Car + Motorcycle      complete
M5.1 visibility/recovery fix     complete
M5.2 fixed metric sprite scale   complete
```

M0: 320×240 browser shell, 60Hz fixed timestep, keyboard/touch。

M1: Raster Course, Guide Curve, cyclic math, world↔course, projection。

M2: world自由走行、斜め走行でs+l同時変化、TerrainLine、forward visibility、depth=chainageのみ。

M3: software framebuffer、piecewise `Y_render`、hill/crest/dip、GroundMap、GroundBase L/R、transparent cliff、Full Far Background。

M4: world sprite、TerrainLine+sprite merge、texel-center anchor、0/1 transparency、car yaw variants、bike yaw×bank variants、runtime rotationなし。

M5: SurfaceMap、DEV car physics、DEV motorcycle physics、ASPHALT/SHOULDER/GRASS/DIRT/SAND/VOID、bike physical bank→sprite variant。

M5.1: VOID fallとextreme spinでplayerが画面外へ消える問題を修正。last-safe recovery + safety camera。player spriteだけのscreen clampは禁止。`R` manual recovery。

M5.2: source texelとworld meterを分離し、2m=80pxを絶対正本化。

---

# 11. SurfaceMap

```text
SurfaceMap(s,l)
```

minimum:

```text
ASPHALT
SHOULDER
GRASS
DIRT
SAND
VOID
```

`VOID` = その `(s,l)` にvehicle支持地表がない。

GroundMap bitmapをphysicsでsampleしない。

```text
GroundBase=TRANSPARENT → visual: pixelを書かない
SurfaceMap=VOID        → physics: supporting surfaceなし
```

両者は独立。

---

# 12. DEV physics

Car/Bike physicsはCore Freezeではなくgameplay側DEV model。renderer数学と分離する。

Car current concepts:

- world X/Y/Z authoritative
- longitudinal/lateral velocity
- yaw/yaw rate
- dynamic bicycle/single-track系
- grip-limited tire force
- steering actuator
- high-speed steering reduction
- friction limits
- DEV AWD-biased drive
- front-biased brake
- aero drag / rolling resistance
- surface-dependent grip
- VOID airborne/fall

```text
front axle = 1.16m
rear axle = 1.44m
wheelbase = 2.60m
car width = 2.0m
```

Bike:

- steering→bank target
- surface grip limits bank
- bank-derived lateral acceleration/yaw
- loose-surface sideslip
- physical bank→yaw×bank sprite variant
- no runtime bitmap rotation

`V`切替時はworld kinematicsを引き継ぎteleportしない。

---

# 13. Build / Test

Local:

```bash
npm install
npm run build
python3 -m http.server 8000
```

Open:

```text
http://localhost:8000/
```

Test:

```bash
npm test
```

Current package:

```text
name = super-outride-m5-2
version = 0.5.2
TypeScript = ^5.8.3
```

`index.html`は`./styles.css`と`./dist/main.js`のrelative path参照。

---

# 14. Validation注意

M5.2最新成果物:

```text
M5_2_VALIDATION.txt
```

会話上の最新結果:

```text
63 tests
63 pass
0 fail
```

ただし2026-08-23時点のGitHub `README.md` のValidation節にM5.1時点の:

```text
58 tests
58 pass
0 fail
```

が残っている。README末尾にはM5.2説明があるため、validation countだけstale。

**新スレッド開始時にまず最新mainでtestを確認し、READMEを同期すること。**

---

# 15. 未freeze / DEV項目

勝手にfinalizeしない:

- lane width（current 4.5m）
- car/bike physics係数
- steering/tire model
- acceleration/braking balance
- crash/damage/final respawn
- camera FOV
- camera height/LPF tuning
- final player target Y
- final yaw/bank variant counts
- GroundMap texture density/LOD
- terrain/sprite performance budgets
- final course authoring format
- tunnel/portal
- AI/collision
- route branch/stage
- BGM
- game UI/title/stage progression

---

# 16. Next recommended work

M5.2の次はgameplayへ急ぐ前にcompiler/performance foundationを優先。

## Compiler / Asset Pipeline

1. Surface Region authoring
2. Surface Region → GroundMap/GroundBase/SurfaceMap compile
3. Course compiler validation
4. asset physical metadata validation
5. `worldWidthMeters`必須化
6. arbitrary visual scale禁止検証

## GroundMap prefilter

Core方針:

- runtime expensive anisotropic filteringなし
- compiler-side anisotropic prefilter
- chainage footprintでLOD選択
- 2D LOD tableを標準化しない
- baseline `d0 = D_cam`

M5.2で `D_cam=5m` になったのでGroundMap density依存値を再計算すること。

## Performance budget

計測:

- TerrainLine count/frame
- terrain pixels/frame,row
- sprite count/frame
- sprite pixels/frame,scanline

stress:

- hill/crest/dip密集
- near tunnel portal
- close large sprite
- many sprites
- transparent cliff + farther terrain/sprite

その後special visual cases、最後にM6 gameplay layerへ進む。

---

# 17. 新スレッド開始手順

```text
1. GitHub connectorで sayaborg/superoutride を読む
2. main HEAD確認
3. Core Freeze読む
4. M5.2 Addendum読む
5. README/package/tests/src確認
6. current validation確認
7. 短い作業計画
8. 実装
9. test
10. main commit
11. Pages deploy確認
```

原則:

```text
GitHub main
→ read/modify
→ test
→ commit
→ Pages
```

---

# 18. 新スレッドへ貼る開始文

```text
SUPER OUTRIDEの開発を継続する。

GitHub repository:
sayaborg/superoutride

以後はGitHub mainを正本として直接読み書きし、実装・テスト・commitまで行う。

最初に必ず読む:
- docs/SUPER_OUTRIDE_HANDOFF_2026-08-23.md
- docs/00_core_design_freeze.md
- docs/00a_core_design_freeze_addendum_m5_2.md
- README.md
- package.json
- tests/
- .github/workflows/pages.yml

「自車位置で2.0m=80px、1m=40px」をsprite scaleの絶対正本とする。
FOV変更時もsprite倍率は変更せず、D_cam=f/40としてcamera positionを変更する。
自車より手前のobjectはpseudo-depthに従ってそのまま拡大する。

Core Design Freezeのrenderer原則を崩さず、設計の単純さ・実装の単純さ・当時実機で成立し得る計算量を最優先する。

現在M5.2まで完了。
次はcompiler / asset pipeline / GroundMap anisotropic prefilter / renderer budget計測を優先する。

まずmainの現在状態とtestを確認してから実装を開始せよ。
```

---

# 19. 最重要定義

> **SUPER OUTRIDEは、3D物理で自由に走る車両を、道路chainageを共通pseudo-depthとするhorizontal scanline terrainと拡大縮小spriteだけで描くPainter型Super Scaler rendererである。**

M5.2 sprite metric:

> **自車位置では2.0mを必ず80pxとして描き、FOV変更時もこの比率を固定し、D_camだけを変更する。**
