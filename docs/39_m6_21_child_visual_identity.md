# M6.21 — Child Visual Identity

## 1. 目的

M6.20で、browser live routeは `STAGE_1 → GOAL_L / GOAL_R` の1 fork point-to-pointとなり、validated handoff seamを越えた瞬間に `activePackageId` がchild packageへCOMMITするところまで完成した。

M6.21の目的は、そのpackage handoffが道路座標だけでなく**視覚contentの切替authorityでもある**ことを、renderer Coreへ分岐知識を追加せずに実証することである。

最小実装として、LEFT childとRIGHT childに異なるfull-screen Far Backgroundを持たせる。

```text
CONTENT_GOAL_L → coast / ocean Far Background
CONTENT_GOAL_R → mountain / valley Far Background
```

## 2. 非目標

M6.21では次を行わない。

- 2本の3D道路を描くbranch renderer
- LEFT / RIGHT判定をrendererへ追加
- camera-space Z
- Euclidean distance depth
- lateral depth correction
- polygon road
- z-buffer
- perspective-correct texture
- arbitrary runtime sprite rotation
- alpha blending
- child geometry continuation
- handling calibration
- vehicle-to-vehicle collision

M6.21はcontent ownershipの確認だけである。

## 3. Authority

M6.19/M6.20のauthorityをそのまま使う。

```text
activePackageId
   ↓
resolveActiveStageRuntimeContent()
   ↓
StageRuntimeContentPackage
   ↓
selectFarBackground(camera.s)
   ↓
existing renderer path
```

route choice直後はまだparent packageである。

```text
Route = child
Runtime = CONTENT_STAGE_1
Handoff = PENDING
```

validated world-space seam COMMIT後だけ、

```text
Runtime = CONTENT_GOAL_L
```

または、

```text
Runtime = CONTENT_GOAL_R
```

となる。

したがって背景切替も画面pixel、screen X、steering、sprite overlapではなく、既存のworld-space handoff transactionに従う。

## 4. 実装構造

M6.21は `src/dev/m6-21-child-visual-identity.ts` にchild visual sourceを置く。

このmoduleが生成するのは通常の `FarBackground` だけである。

```text
M621ChildVisualIdentity
  ├─ leftFarBackground
  └─ rightFarBackground
```

`src/dev/m6-20-live-runtime-content.ts` のlive package composerは、このidentityをchild packageへ束ねる。

```text
CONTENT_STAGE_1
  selectFarBackground = existing parent selector

CONTENT_GOAL_L
  selectFarBackground = LEFT child bitmap

CONTENT_GOAL_R
  selectFarBackground = RIGHT child bitmap
```

M6.20の関数名はlive registryのstructural composerとして維持する。M6.21はそのpackage content入力を拡張する後続milestoneであり、renderer APIは変更しない。

## 5. Far Background

両child背景は既存M3 backgroundと同じpresentation contractを使う。

```text
source size       640 × 320
sourceHorizonY    126
pixelsPerRadian   200
```

full-screen bitmapなので水平線より下のpixelも最初から持つ。

LEFTは海面と海岸、RIGHTは山稜と谷を持つ。どちらもstartup時に1回生成するopaque bitmapで、runtime scanline rendererは既存のhorizontal pan / horizon alignmentだけを行う。

透明度やlayer合成を新設しない。

## 6. Renderer不変条件

`renderM5Driving()` / `drawFarBackground()` はM6.21のroute topologyを知らない。

rendererへ渡されるのは従来どおり単一の `FarBackground` である。

変更しないauthority:

```text
pseudo-depth d = wrapSigned(s_obj - s_cam)
1 chainage → 1 horizontal scanline
same d → same scale
same d + same height → same screen Y
Terrain + World Sprite shared far→near Painter
camera roll = 0
metric sprite scale
```

## 7. World pose continuity

visual identityの切替はM6.17〜M6.20のhandoff transactionに従うだけなので、COMMIT時にvehicle world stateを変更しない。

```text
world X/Y/Z : unchanged
yaw         : unchanged
velocity    : unchanged
```

cameraもworld lateral位置を保存したままlocal coordinateだけrebaseする。

## 8. Point-to-point FINISH後

M6.20実装後に見つかった回帰として、FINISH後にsimulation loop自体を止める処理が存在した。これはPR #31で修正済みである。

現在のauthorityは、

```text
physical FINISH
→ validated result記録
→ HUD FINISHED
→ physics continues
→ input continues
→ camera continues
→ renderer continues
```

である。

したがってM6.21のchild visual identityもFINISH後にそのまま観察できる。

## 9. Validation

M6.21 regressionsは少なくとも次を固定する。

1. LEFT / RIGHT child backgroundsが640×320 full bitmapであり、互いに異なるpixel contentを持つ。
2. parent packageは従来のparent Far Background selectorを保持する。
3. `CONTENT_GOAL_L` はLEFT backgroundを所有する。
4. `CONTENT_GOAL_R` はRIGHT backgroundを所有する。
5. selection authorityは `resolveActiveStageRuntimeContent(...activePackageId)` である。
6. renderer Coreには `CONTENT_GOAL_L/R`、`GOAL_L/R`、`LEFT_CHILD/RIGHT_CHILD` の分岐を導入しない。
7. browser側は既存の `runtime.selectFarBackground(camera.s)` を使い続ける。

## 10. 次段階

現在のchildは視覚packageとしては別stageになったが、geometryとしては同じclosed DEV stadiumの続きを利用している。

次は**true child stage continuation**を設計する。

必要条件:

- selected childが本当に別courseとして先へ続く
- unselected siblingは継続不要
- handoff時にworld poseをteleportしない
- 1 chainage → 1 scanlineを維持
- pseudo-depthはchainage差のみ
- simple raster pseudo-3Dを維持
- ordinary 3D branching geometryへ逃げない

M6.21はその前提として、route stage packageが視覚contentの実体を独立所有できることを確定する。
