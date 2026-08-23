# M6.23 — Child Environment Content

## 1. 目的

M6.22で、LEFT / RIGHT childはparent closed stadiumの単なるviewではなく、独立したRaster Course / Guide / SurfaceMap / GroundMap chainage domainを持つstageになった。

M6.23の目的は、その独立stageへ**package-owned environment content**を与え、branch後の道路形状だけでなく、地形高度・地表visual・world spriteもchildごとに独立していることを確認することである。

ただしrenderer Coreは変更しない。

```text
activePackageId
   ↓
StageRuntimeContentPackage
   ├─ coordinateFrame
   ├─ SurfaceMap
   ├─ HeightProfile
   ├─ TerrainProfile
   ├─ GroundMapProfile
   ├─ Far Background
   └─ World Sprites
        ↓
existing renderer / Painter
```

## 2. 非目標

M6.23では次を行わない。

- LEFT / RIGHT分岐判定をrendererへ追加
- branch専用renderer
- camera-space Z
- Euclidean distance depth
- lateral depth correction
- polygon road
- z-buffer
- perspective-correct texture
- arbitrary runtime sprite rotation
- alpha blending
- vehicle handling calibration
- vehicle collision
- childからさらに次stageへ遷移するroute extension

## 3. Handoff continuity

M6.22のchild-local handoff位置は約11.74mである。

M6.23ではchild sceneryによる高度変化をhandoff直後から始めない。

```text
child s = 0..60m
height = 0m
```

とし、handoff seam前後の少なくとも`D_cam = 5m`を十分に超える範囲で共通height datumを維持する。

これによりCOMMIT時に、

```text
vehicle world X/Y/Z
vehicle yaw
velocity
camera world lateral
```

を変更する必要はない。

M6.23はworld pose continuityを壊さない。

## 4. LEFT child — coast identity

LEFT childはM6.21のcoast/ocean Far Backgroundを維持し、M6.23ではさらにchild-local terrain / spriteを追加する。

HeightProfile DEV authoring:

```text
s=0     y= 0.0
s=60    y= 0.0
s=105   y=-1.5
s=155   y=+1.0
s=215   y= 0.0
s=285   y= 0.0
```

大きな山岳ではなく、海岸道路らしい低い起伏だけを与える。

GroundBase visualは砂色寄りのLEFT terrainと緑のRIGHT terrainを使う。

World Sprite DEV authoring:

```text
COAST_SIGN_1
COAST_GUARD_1
COAST_GUARD_2
COAST_BUILDING
COAST_GUARD_3
```

これらはすべてLEFT child Guideへ直接compileされる。

## 5. RIGHT child — mountain identity

RIGHT childはM6.21のmountain/valley Far Backgroundを維持し、M6.23ではより明確な山岳height profileを持つ。

```text
s=0     y=0
s=60    y=0
s=105   y=4
s=150   y=9
s=195   y=3
s=245   y=7
s=295   y=0
```

World Sprite DEV authoring:

```text
MOUNTAIN_TREE_1
MOUNTAIN_TREE_2
MOUNTAIN_TREE_3
MOUNTAIN_SIGN
MOUNTAIN_TREE_4
MOUNTAIN_TREE_5
MOUNTAIN_BUILDING
```

RIGHT childも自身のGuide / height domainへ直接compileする。

## 6. Sprite chainage authority

M6.22ではparent CourseSpriteをchildへコピーしなかった。理由はparent spriteの`sRender`がparent chainage domainだからである。

M6.23でもこの原則を維持する。

child spriteは、

```text
CourseSpriteAuthoring(child s, child source l)
   ↓
compileCourseSprite(child Guide, child HeightProfile)
   ↓
CourseSprite(sRender = child chainage)
```

として生成する。

parent CourseSpriteの`sRender`をchild chainageとして読み替えることは禁止する。

## 7. Lateral coordinate

M6.22 child Guideはparent world geometryと同じworld frame上で、road centerをchild chartの`l=0`として扱う。

一方、Raster/visual source lateral originは、

```text
LEFT  = -7.5m
RIGHT = +7.5m
```

である。

したがってchild sprite authoringのsource `l`は、

```text
source_l = sourceLateralOrigin + child_local_l
```

として置く。

これはdepth補正ではない。単なる横方向source座標である。

## 8. Runtime package ownership

M6.23 child packageは次をまとめて所有する。

```text
CONTENT_GOAL_L
  LEFT Guide / chart
  LEFT SurfaceMap
  LEFT HeightProfile
  LEFT TerrainProfile
  LEFT GroundMapProfile
  coast Far Background
  COAST_* World Sprites

CONTENT_GOAL_R
  RIGHT Guide / chart
  RIGHT SurfaceMap
  RIGHT HeightProfile
  RIGHT TerrainProfile
  RIGHT GroundMapProfile
  mountain Far Background
  MOUNTAIN_* World Sprites
```

rendererはpackage IDもLEFT/RIGHTも知らない。

## 9. Painter不変条件

M6.23 world spritesは既存`CourseSprite`であり、既存far→near Painterへ入る。

変更しないもの:

```text
pseudo-depth = wrapSigned(s_obj - s_cam)
1 chainage → 1 horizontal scanline
same d → same scale
same d + same height → same screen Y
Terrain + World Sprite shared far→near Painter
metric sprite scale
camera roll = 0
```

World Sprite用の新しいdepth pathは作らない。

## 10. M6.22 compatibility entry

browser `main.ts`はM6.22で確立した`createM622LiveStageRuntimeRegistry()` entryを使っている。

M6.23ではこのentryをcompatibility facadeとして残し、内部でM6.23 live composerへ委譲する。

これによりM6.22のroute/handoff/browser wiringを無意味に書き換えず、concrete child package内容だけを進化させる。

## 11. Validation

M6.23 regressionsは次を固定する。

1. handoff neighborhoodはLEFT / RIGHTともheight=0で連続する。
2. overlap後はLEFT coastとRIGHT mountainでheight profileが明確に異なる。
3. child world spritesはそれぞれ自分のchild chainage domain内にcompileされる。
4. LEFT packageはCOAST_* spritesを持つ。
5. RIGHT packageはMOUNTAIN_* spritesを持つ。
6. child packageはheight / terrain / sprites / Far Backgroundを一括所有する。
7. parent CourseSpriteをchildへ流用しない。
8. renderer CoreにM6.23 / COAST / MOUNTAIN / route-side判定を追加しない。

## 12. 次段階

M6.23でbranch後の2 childは、

- geometry
- physical surface
- GroundMap addressing
- Far Background
- height / terrain
- World Sprites

まで独立stageになった。

次は、DEV専用に直書きされたchild stage sourceを、**再利用可能なstage authoring / compiler**へ整理するのが自然である。

その後、child terminalを次stageへ接続して長いpoint-to-point routeへ一般化できる。

ここでもrenderer Coreへroute logicを入れない。
