# M6.20 — Live Point-to-Point Stage Runtime

## 1. 目的

M6.19までで、Route DAGのopaqueな`packageId`を、physics / camera / rendererが共通利用できる`StageRuntimeContentPackage`へ解決する境界は完成した。しかし従来のDEV routeは、closed stadium上の同じ物理forkを後のpassでもう一度使うstress fixtureだった。

そのfixtureのままchild packageをlive適用すると、最初のhandoff後に未選択道路がstage-local view外へ消えるため、次のpassで同じforkを第2分岐として再利用できない。そこでM6.20では、browser live routeを製品方向に近いpoint-to-pointへ切り離す。

## 2. Live route

browser runtimeが使用するrouteは次だけである。

```text
           ┌─ GOAL_L
STAGE_1 ───┤
           └─ GOAL_R
```

choices:

```text
S1_LEFT  : STAGE_1 → GOAL_L
S1_RIGHT : STAGE_1 → GOAL_R
```

`GOAL_L` / `GOAL_R`はterminal stageである。ただしterminalへ入っただけではfinishしない。従来どおり明示的なphysical FINISH gateが必要である。

旧M6.8の2段route DAGは削除しない。あれはroute compiler / repeated-transitionのstress fixtureとして残す。browser live route authorityには使わない。

## 3. 物理位置

現在のDEV stadium上では、live point-to-pointの重要位置は次である。

```text
junction fully separated : s = 530 m
physical route choice     : s = 545 m
handoff seam              : s = 600 m
child physical FINISH     : s = 700 m
closed raster seam        : s = 776.5128086698837 m
```

したがって順序は必ず、

```text
fork choice
  ↓ 55 m overlap
handoff seam
  ↓ 100 m child-only run
physical FINISH
  ↓
closed seamより前にrun終了
```

となる。

これによりbrowser runはclosed raster seamをpoint-to-point gameplay上のlap boundaryとして利用しない。

## 4. Live runtime packages

M6.20 live registryは3 packageだけを持つ。

```text
CONTENT_STAGE_1 → parent chart / parent road view
CONTENT_GOAL_L  → LEFT_CHILD / left StageRoadView / left StageSurfaceMapView
CONTENT_GOAL_R  → RIGHT_CHILD / right StageRoadView / right StageSurfaceMapView
```

RouteStageContentManifestは引き続きopaque IDしか持たない。

## 5. Runtime切替 authority

物理forkを横切った瞬間にはRoute DAGだけがterminal childへ進む。

```text
RouteDag.activeStageId = GOAL_L
handoff.pending         = S1_LEFT
activePackageId         = CONTENT_STAGE_1
```

この間は親overlapをphysics / camera / rendererすべてが使い続ける。

s=600のhandoff seamをforwardに横切った瞬間だけ、

```text
activePackageId = CONTENT_GOAL_L
activeChartId   = LEFT_CHILD
```

となり、`activeRuntime()`がchild packageを返す。

## 6. Physics接続

各physics tickのplayer側は、そのtick開始時点のactive runtimeから次を読む。

```text
coordinateFrame
heightProfile
surfaceMap
```

Car / Motorcycleのhandling equationは変更しない。

handoff COMMIT時には、M6.17が同じworld pointをchild chartへ再表現した`coordinate`だけをvehicleへ反映する。

```ts
vehicle.course = { ...routeHandoffState.coordinate };
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

したがってcontent handoffはworld teleportではない。

## 7. Camera continuity

child chartではlateral originが±7.5m変わる。そのためcamera rigのlocal `l`をそのまま持ち越すとworld lateral位置が飛ぶ。

M6.20では、handoff時に次の純粋な座標変換だけを行う。

```text
world_l     = old_local_l + old_origin
new_local_l = world_l - new_origin
```

camera yaw、vertical correction、world lateral位置は保持される。

これはpresentation teleportやcamera resetではない。

## 8. Renderer接続

rendererはRoute DAGを知らない。`main.ts`がactive runtimeから、

```text
Far Background
GuideCurve underlying coordinate frame
Terrain profile
Ground profile
World sprites
StageRoadView
```

を取り出して既存`renderM5Driving()`へ渡す。

child packageへCOMMITすると`StageRoadView`が有効になり、M6.18どおり選択した1本の道路だけが横方向source view内へ残る。

変更しないrenderer authority:

```text
pseudo-depth
1 chainage = 1 scanline
TerrainLine depth/Y
Delta_s_eff
Painter order
sprite scale
player scale
```

## 9. Rival

現在のrival physicsは従来のparent DEV Guide上で独立に走り続ける。playerがchild packageへ入った後、rivalがactive child corridor外ならrender listからだけ除外する。

これはsprite overlapやroute authorityではない。rivalのphysics state / ranking stateは変更しない。

## 10. Point-to-point finish

terminal childのphysical FINISH gateをforwardに横切ると、

```text
World gate
→ RouteDag FINISHED
→ ValidatedRunFinish(ROUTE_DAG)
→ POINT_TO_POINT_OBJECTIVE FINISHED
```

となる。

browser runtimeではobjectiveがFINISHEDになった後、simulation tickを進めない。したがってrun終了後にclosed raster seamへ進んで別のparent sectionへwrapすることはない。

## 11. Closed race telemetryとの関係

M6.0〜M6.3のclosed-course progress / ranking / timingは現在もDEV diagnosticとして残る。しかしproduct finish authorityには使わない。

M6.20のrun completionはRoute DAGのphysical child FINISHだけがauthorityである。

## 12. Validation

M6.20 testsは次を固定する。

1. live DAGはSTAGE_1からGOAL_L / GOAL_Rへの1 forkだけである。
2. child FINISHはhandoff seam後かつclosed raster seam前である。
3. LEFT pathがphysical gate → PENDING → seam COMMIT → left runtime → physical FINISHを通る。
4. RIGHT pathも同じ条件を満たす。
5. camera frame rebaseがworld lateralを保存する。
6. live registryはparent + terminal child 2 packageだけである。
7. browser `main.ts`がM6.20 live route / runtime resolverを実際に使い、旧M6.8 repeated routeをimportしない。

実装・live wiring後の回帰は231/231 pass。

## 13. 次段階

M6.20でbranch後のruntime package切替そのものがbrowserへ入った。次はpackageが単にroad corridorだけ違う状態から進め、LEFT / RIGHT child packageに**視覚的なidentity**を持たせるのが自然である。

候補は、既存renderer pathだけを使ったchild固有Far Background / world spritesである。Route DAGやPainterへ新しい分岐ロジックを追加してはならない。
