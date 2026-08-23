# M6.22 — True Child Stage Continuation

## 1. 目的

M6.20ではbrowser live routeを1回のpoint-to-point forkへ切り替え、M6.21ではLEFT / RIGHT child packageが異なるFar Backgroundを所有できることを確認した。

ただしM6.21までのchildは、handoff後もparentのclosed DEV stadiumと同じRaster / Guide geometryを使っていた。そのためFINISH後に走行を続けると、いずれparentのclosed raster seamへ戻る。

M6.22の目的は、**選択したchildが本当に独立したcourse geometryとして先へ続くこと**を、通常の3D branching rendererへ移行せず実現することである。

```text
parent visible fork
      ↓
validated LEFT / RIGHT choice
      ↓
PENDING overlap
      ↓
world-space handoff seam
      ↓
selected child owns an independent Raster Course + Guide Curve
      ↓
child-local physical FINISH
```

## 2. Core不変条件

M6.22でもrenderer Coreは変更しない。

```text
physics authority       = world-space
pseudo-depth            = wrapSigned(s_obj - s_cam)
1 chainage              = 1 horizontal scanline
same d                  = same scale
same d + same height    = same screen Y
road                    = Raster Segment
one vertex turn         <= 10 deg
terrain + sprites       = shared far->near Painter
camera roll             = 0
```

禁止事項も従来どおりである。

- camera-space Zを導入しない
- Euclidean distanceをdepthに使わない
- lateral positionでdepth補正しない
- polygon roadを作らない
- z-bufferを作らない
- 2本の3D道路を同時に描くbranch rendererを作らない
- Power Drift型の全面sprite roadへしない
- perspective-correct textureを導入しない
- arbitrary runtime sprite rotationを導入しない
- alpha blendingを導入しない

分岐の見た目はhandoff前まで従来の**1本の横断面がchainageで変形するjunction**であり、handoff後に選択済みchildだけが独立stageとなる。

## 3. なぜ単純なchild切替では足りないか

handoff位置でいきなり無関係なGuideへ切り替えると、vehicleのworld poseを保存できてもcameraが参照する`D_cam`後方の道路geometryが変わり、presentationが跳ぶ可能性がある。

そこでM6.22ではchild courseに**共有overlap prefix**を持たせる。

parentの現在のDEV Rasterでは、child sourceはparent Raster vertex 20から開始する。

```text
parent source start s ≈ 588.2564043349416 m
parent handoff seam   = 600 m
child-local seam      ≈ 11.7435956650584 m
```

childはhandoff seamの前からparent Raster vertexをexact copyし、seam後も`D_cam=5m`を十分超える区間まで同じgeometryを保持する。

したがってCOMMIT時に、

```text
parent s = 600
child  s = 600 - parentSourceStartS
```

へchainageの物差しをrebaseしても、vehicleとcameraが見るworld geometryは同一である。

## 4. World pose continuity

handoff authorityはM6.17から変更しない。

COMMIT時に変更してよいのはroad-coordinate expressionだけである。

```text
vehicle.course = child-local coordinate
```

変更しないもの:

```text
vehicle.x
vehicle.y
vehicle.z
vehicle.yaw
longitudinalSpeed
lateralSpeed
yawRate
verticalSpeed
```

cameraもworld lateral位置を保存し、local lateral coordinateだけをrebaseする。

M6.22 regressionsはhandoff seamの`-5m / 0m / +20m`でparentとchildのworld position / headingが一致することを固定する。

## 5. 独立child Raster / Guide

共有prefixを抜けた後、LEFT / RIGHTはそれぞれ独立したRaster Courseを所有する。

```text
CONTENT_GOAL_L
  └─ LEFT independent Raster Course / Guide Curve

CONTENT_GOAL_R
  └─ RIGHT independent Raster Course / Guide Curve
```

両者は異なるcourse lengthを持ち、同じchild-local chainageでも後半は異なるworld positionへ進む。

現在のgeometryは構造検証用DEV fixtureであり、最終course authoringではない。しかし重要なのは、**parent stadiumの閉路を製品stage continuationとして再利用しない構造**が成立したことである。

各Raster vertexはCoreの10° hard limitを既存compilerで検証される。

## 6. Child-local road

handoff後のstageはM6.18のsemanticを保つ。

```text
OUTSIDE
| 1m SHOULDER
| 7m ASPHALT
| 1m SHOULDER
| OUTSIDE
```

child-localではroad centerは`l=0`。

source-coordinate lateral originは、

```text
LEFT  = -7.5m
RIGHT = +7.5m
```

である。

SurfaceMapは各child course長を持つ独立source mapを使用し、StageSurfaceMapViewを通してlocal corridor外をVOIDとする。

## 7. GroundMap continuity

M6.18まではparent baked GroundMapを横方向に再利用する構造だった。M6.22のindependent child courseはparentとはchainage domainそのものが異なるため、現在のDEV childでは独立したprocedural GroundMap authorityを使用する。

ただしhandoffで座標の物差しを変えただけなのに、白線dashやchecker模様の位相が跳んではならない。

そこでGroundMap profileは次を持てる。

```text
roadCenterL      = child source lateral origin
chainageOffsetS  = parent source start s
```

sampling時は、

```text
source_l = local_l + sourceLateralOrigin
source_s = child_local_s + chainageOffsetS
```

としてvisual sourceを読む。

これによりhandoff seamでは、

```text
child_local_s + chainageOffsetS == parent_s
```

となり、road marking / asphalt phase / checker phaseが一致する。

`chainageOffsetS`はvisual source addressingだけのauthorityであり、pseudo-depthやphysics chainageには使わない。

## 8. Runtime package ownership

M6.22 child packageは次をまとめて所有する。

```text
coordinateFrame / Guide
StageRoadView
SurfaceMap
HeightProfile
TerrainProfile
GroundMapProfile
Far Background selector
World Sprite source
```

現在、child worldSpritesは空配列である。parent CourseSpriteの`course.s`はparent chainage domainなので、childへそのままコピーして再解釈しないためである。

これは将来child固有worldSpritesを追加するための正しい境界でもある。

## 9. Route gateとFINISH

route choiceは従来どおりparentのvisible separated road上のworld-space gateで決まる。

```text
parent route choice ≈ s 545m
parent handoff seam = s 600m
```

handoff後のFINISHはparentの`s=700`ではなく、各child Guide上に直接authoringする。

現在のDEV authority:

```text
child-local FINISH = s 250m
```

LEFTとRIGHTのFINISHは実際に異なるworld positionに存在する。

terminal stageへ入っただけではfinishせず、対応するphysical FINISH gateのforward crossingが必要である。

## 10. Race diagnosticとの分離

M6.0〜M6.3のclosed parent race progressはDEV diagnosticとして残っている。

child-local chainageをparent lap progressとして誤解しないよう、player側のlegacy closed-course progress更新はparent packageがactiveな間だけ行う。

point-to-point result authorityはRoute DAG physical FINISHであり、closed parent progressではない。

rival physicsも現在はparent DEV Guide上で独立して継続する。child packageへCOMMIT後はparent-domain rival spriteをchild-domain chainageとして再解釈せず、presentationから除外する。

## 11. Renderer接続

rendererへ渡すものは従来どおり単一のactive package由来データだけである。

```text
activePackageId
   ↓
StageRuntimeContentPackage
   ↓
GuideCurve + Terrain/Ground + WorldSprites + StageRoadView
   ↓
existing renderM5Driving()
```

rendererは、

```text
LEFT
RIGHT
GOAL_L
GOAL_R
S1_LEFT
S1_RIGHT
```

を知らない。

childへ移った後のpseudo-depth wrap lengthはactive cameraの`courseLength`を使う。したがってparent closed stadium lengthをchild depth計算へ持ち込まない。

## 12. FINISH後

M6.20 post-finish continuation authorityを維持する。

```text
physical FINISH
→ validated result記録
→ HUD FINISHED
→ physics continues
→ input continues
→ camera continues
→ renderer continues
```

FINISHはsimulation pause authorityではない。

child Raster Course自体は現在のCore compilerがcyclic substrateであるため内部的なclosure seamを持つ。しかしproduct point-to-point objectiveはchild-local physical FINISHで既に完了しており、そのclosure seamをlap completionとして利用しない。

## 13. Validation

M6.22 regressionsは次を固定する。

1. handoff前後のshared prefixでparent / child world positionとheadingが一致する。
2. LEFT / RIGHT Guideがparentとは独立し、互いにも異なるcourseになる。
3. child roadのsource lateral centerが±7.5mに正しくtranslationされる。
4. GroundMap chainage phaseがhandoff seamでparentとchildの間で一致する。
5. child packageが独立Guide / SurfaceMap / GroundMap / Far Backgroundを所有する。
6. local corridor外のSurfaceMapはVOIDである。
7. world-space route choice → PENDING → seam COMMIT → child-local physical FINISHが成立する。
8. renderer Coreにroute-side decision logicを追加しない。
9. browserのdepth diagnosticもactive `camera.courseLength`を使用する。

M6.22追加後のfull regression targetは241 testsである。

## 14. 次段階

M6.22で「選んだchildが本当に別course geometryとして続く」という構造は成立した。

次はこの構造をDEV fixtureからcontent authoringへ発展させる。

候補:

- child固有Terrain / GroundMap content
- child固有World Sprites / landmarks
- child固有height profile
- stage course authoring/compiler package化
- childから次stageへのgeneralized continuation
- longer point-to-point routeでのstreaming / content budget検証

いずれもrendererを通常3D化せず、stage packageのsource dataとして拡張する。
