# M6.23 — Package-owned Child Stage Scenery

## 1. 目的

M6.22でLEFT / RIGHT childは、handoff後にparent closed DEV stadiumの続きを使わず、それぞれ独立したRaster Course / Guide Curve / SurfaceMapを持つstageになった。

M6.23では、その独立stageがgeometryだけでなく、**height / terrain presentation / ordinary world spritesをruntime packageの所有物として持てる**ことを確定する。

renderer CoreへLEFT / RIGHT分岐は追加しない。

## 2. Authority

route / handoff / geometry / physics authorityはM6.22をそのまま維持する。

```text
physical fork
  ↓
Route DAG choice
  ↓
PENDING parent overlap
  ↓
validated handoff seam
  ↓
activePackageId COMMIT
  ↓
selected child runtime package
```

M6.23が変更するのはchild package内のpresentation dataだけである。

```text
M6.22 authority retained
  coordinateFrame
  SurfaceMap
  StageRoadView corridor
  child FINISH gate

M6.23 package-owned presentation
  heightProfile
  terrainProfile / GroundBase
  worldSprites
  M6.21 Far Background identity
```

## 3. LEFT child — Coast / Ocean

LEFT childは海岸stageとして識別できる最小fixtureを持つ。

- handoff地点の道路高は0mでparentと連続
- 中盤は約-1.5mの低い海岸道路
- FINISHでは0mへ戻る
- LEFT側GroundBaseをTRANSPARENTにしてFar Backgroundの海を露出可能にする
- RIGHT側GroundBaseは緑地色
- landmark:
  - lighthouse
  - palm A
  - palm B

landmarkはすべて既存`CourseSprite` pathを使う。

## 4. RIGHT child — Mountain Pass

RIGHT childは山岳stageとして識別できるfixtureを持つ。

- handoff地点の道路高は0mでparentと連続
- 中盤で約7.5mへ上昇
- FINISHで約13m
- 左右GroundBaseはopaque rock系
- landmark:
  - warning pylon L
  - warning pylon R
  - pass sign

FINISH後のDEV tailではheightを0へ戻し、closed child fixture内部のseamで高さ不連続を作らない。

## 5. Handoff continuity

M6.23で最重要なのは、景観変更を理由にworld stateを変更しないことである。

handoff地点では両childとも、

```text
Y_render = 0
Y_phys   = 0
```

から開始する。

M6.22のexact overlap geometry、world X/Z、vehicle yaw、velocity、camera rebaseは変更しない。

## 6. Terrain / GroundBase

terrain visual identityは`CyclicVisualProfile`をchild packageごとに持つ。

LEFT:

```text
LEFT COAST / OCEAN
GroundBase_L = TRANSPARENT
GroundBase_R = green color
```

RIGHT:

```text
RIGHT MOUNTAIN PASS
GroundBase_L = rock color
GroundBase_R = rock color
```

これはGroundMap / SurfaceMapの意味を混同しない。

- GroundBase TRANSPARENTはvisual decision
- SurfaceMap VOIDはphysics decision

両者は独立のままである。

## 7. Landmark sprites

M6.23 landmarksはordinary metric spritesである。

使用する既存contract:

```text
CourseSprite
→ chainage pseudo-depth
→ existing far→near Painter
→ metric texelScale
```

各assetは、

- positive `worldWidthMeters`
- arbitrary `visualScale`なし
- runtime bitmap rotationなし
- 透明は0/1のみ
- opaque paletteは15色以下

とする。

alpha blendingは追加しない。

## 8. Renderer不変条件

M6.23では`src/render/m5-renderer.ts`を変更しない。

維持するもの:

```text
physics authority = world-space
1 chainage → 1 horizontal scanline
pseudo-depth = chainage difference only
same d → same scale
same d + same height → same screen Y
Raster Segment road
Terrain + World Sprite common far→near Painter
camera roll = 0
no z-buffer
no polygon road
no perspective-correct texture
no arbitrary runtime sprite rotation
no alpha blending
```

rendererはactive runtime packageから渡されたheight / terrain / sprite list / Far Backgroundを普通に描くだけである。

## 9. Live browser wiring

browser runtimeはM6.22 continuation/gates/handoffをそのまま使用する。

runtime package composerだけをM6.23へ進める。

```text
createM622ChildStageContinuation
createM622LivePointToPointGateSet
createM622RouteStageHandoffManifest
        ↓
createM623LiveStageRuntimeRegistry
        ↓
resolveActiveStageRuntimeContent(activePackageId)
```

したがってM6.22 geometry/physicsを壊さず、contentだけが豊かになる。

## 10. Validation

M6.23 regressionsは次を固定する。

1. LEFT / RIGHTともhandoff位置でheight=0を保つ。
2. LEFT FINISHは0m、RIGHT FINISHは13mでstage height identityが異なる。
3. LEFTはocean-facing TRANSPARENT GroundBaseを持つ。
4. RIGHTはopaque mountain GroundBaseを持つ。
5. child landmarksはordinary metric `CourseSprite`である。
6. landmark spriteは0/1 transparencyかつ15 opaque colors以下である。
7. landmarkはhandoff後かつFINISH前に存在する。
8. M6.23 runtimeでもM6.22 child Guide / SurfaceMapが同一object authorityとして維持される。
9. renderer CoreにM6.23/LEFT/RIGHT scenery decisionを追加しない。
10. browser live wiringはM6.22 continuationを維持しつつM6.23 runtime package composerを使う。

## 11. 次段階

M6.23で、独立child stageにgeometryだけでなくpackage-owned sceneryを載せられるところまで確認できる。

次はDEV fixtureを手書きmoduleで増やすのではなく、stage authoring dataから、

```text
Raster Course
Guide Curve
SurfaceMap
Ground / Terrain profile
height profile
Far Background reference
world sprites
route gates / handoff metadata
```

を一貫してcompileするstage authoring / compiler boundaryを設計するのが自然である。

ここでもrendererを通常の3D engineへ置き換えず、単純なSuper Scaler型runtime dataへcompileすることを優先する。
