# M6.19 — Stage Runtime Content Registry

## 1. 目的

M6.11では、Route DAGの各stageを`packageId`と`worldFrameId`だけからなるopaqueなcontent referenceへ結び付けた。M6.16〜M6.18では、分岐後のchild roadを同一world frame内で別の`l=0` chartとして表現し、renderer / GroundMap / SurfaceMapをchild-localな単一道路へ再表現できるようにした。

M6.19では、この2つをつなぐruntime境界を定義する。

```text
RouteStageContentManifest
        opaque packageId
               ↓
StageRuntimeContentRegistry
               ↓
complete runtime package
```

Route DAGそのものにはrenderer・physics・asset型を追加しない。

## 2. runtime選択の唯一のauthority

runtime packageを`RouteDagState.activeStageId`から直接選んではならない。

M6.17では、物理的なroute choiceとcontent handoff seamを意図的に分離している。したがってroute transitionがacceptされた直後には、次の状態が正しい。

```text
RouteDag.activeStageId       = STAGE_2_L
RouteStageHandoff.pending    = S1_LEFT
Handoff.activePackageId      = CONTENT_STAGE_1
runtime content              = CONTENT_STAGE_1
```

選択済みbranchのhandoff seamをforwardに横切り、M6.17 transactionが`COMMITTED`になった瞬間だけ、

```text
Handoff.activePackageId      = CONTENT_STAGE_2_L
Handoff.activeChartId        = LEFT_CHILD
runtime content              = CONTENT_STAGE_2_L
```

へ切り替える。

したがってM6.19のresolverは、Route DAG stateではなく次だけを読む。

```ts
{ activePackageId: string }
```

## 3. StageRuntimeContentPackage

runtime packageは、1つのstageを実際に走行・描画するためのcomplete read-only bundleである。

```text
StageRuntimeContentPackage
  packageId
  worldFrameId
  coordinateFrame
  roadView
  surfaceMap
  heightProfile
  terrainProfile
  groundProfile
  selectFarBackground
  worldSprites
```

各要素の役割は次のとおり。

- `coordinateFrame`: physics / cameraが使用するGuide系の`(s,l)`座標
- `roadView`: rendererが使用するstage-local横断面
- `surfaceMap`: physics materialのread-only sampler
- `heightProfile`: Y_phys / Y_camera / Y_render source
- `terrainProfile`: TerrainLine生成source
- `groundProfile`: GroundMap source / baked asset
- `selectFarBackground`: full Far Backgroundの選択
- `worldSprites`: 既存Painterへ渡すstage静的sprite群

renderer CoreやRoute DAGはこのbundle自体を理解しない。

## 4. GuideCoordinateSource

child contentをphysicsへ渡すため、Coreに最小のGuide coordinate frame abstractionを追加した。

```ts
interface GuideCoordinateFrame {
  guide: GuideCurve;
  lateralOrigin: number;
}

type GuideCoordinateSource = GuideCurve | GuideCoordinateFrame;
```

従来の`GuideCurve`は`lateralOrigin=0`のframeとしてそのまま利用できるため、既存経路は変わらない。

M6.16の`GuideChart`はstructural typingによりこのcontractを満たす。Coreからgameplay moduleへの依存は追加しない。

child handoff後は、同じworld positionを次のように再表現できる。

```text
parent frame       left road center = l -7.5 m
LEFT_CHILD frame   same world point = l  0.0 m
```

world X/Z、yaw、velocityを変更しない。

## 5. SurfaceMapReader

車・バイク・recoveryが具象`CyclicSurfaceMap`を要求していると、M6.18の`StageSurfaceMapView`を同じphysics pathへ渡せない。

そこで要求contractを次まで狭めた。

```ts
interface SurfaceMapReader {
  sample(s: number, l: number): SurfaceSample;
}
```

`CyclicSurfaceMap`と`StageSurfaceMapView`はどちらもこのcontractを実装する。

車両handling equationやfriction値には変更を加えていない。

## 6. child座標の一致条件

child packageではphysics/cameraとrendererが同じ横方向原点を使わなければならない。

```text
coordinateFrame.lateralOrigin
        ==
roadView.sourceLateralOrigin
```

registry compilerはこの一致を必須検証する。

これにより、例えばLEFT_CHILDでは、

```text
physics course.l = 0
camera local l   = 0
SurfaceMap l     = 0
renderer road l  = 0
```

が同じworld road centerを意味する。

## 7. registry compile validation

`compileStageRuntimeContentRegistry()`は次を拒否する。

- manifestにないruntime package
- duplicate runtime packageId
- manifest packageに対応するruntime package欠落
- `worldFrameId`不一致
- Guide lengthとHeightProfile lengthの不一致
- TerrainProfileが別のHeightProfileを参照するpackage
- baked GroundMap course length不一致
- coordinate frameとStageRoadViewのlateral origin不一致

runtime package切替によってworld frameが暗黙に変換されることはない。

## 8. M6.19 DEV registry

現DEV route packageは次のように解決する。

```text
CONTENT_STAGE_1    → PARENT
CONTENT_STAGE_2_L  → LEFT_CHILD
CONTENT_STAGE_2_R  → RIGHT_CHILD
CONTENT_GOAL_LL    → LEFT_CHILD
CONTENT_GOAL_LR    → RIGHT_CHILD
CONTENT_GOAL_RL    → LEFT_CHILD
CONTENT_GOAL_RR    → RIGHT_CHILD
```

child packageはM6.18の`StageRoadView`と`StageSurfaceMapView`を利用する。

## 9. 現在main.tsへlive package切替を入れない理由

現在のclosed stadiumは、同じ物理forkを後のDEV passでもう一度使って第2分岐を検証するfixtureである。

最初のhandoff後にLEFT_CHILD / RIGHT_CHILDを永久にlive適用すると、その後に同じ場所へ戻った際、未選択側がstage-local corridor外となり、第2分岐そのものが見えなくなる。

ここで「次周だけparent viewへ戻す」等のhackを入れると、DEV周回fixtureの事情が製品stage architectureへ逆流する。

したがってM6.19は、runtime package境界とatomic selection authorityを完成させるが、`main.ts`にはまだ恒久的child package切替を接続しない。

## 10. renderer invariants

M6.19は次を変更しない。

```text
pseudo-depth = signed cyclic chainage difference only
1 chainage = 1 horizontal scanline
same d = same scale
TerrainLine + World Sprite = one far→near Painter
no z-buffer
no polygon road
no perspective-correct texture mapping
camera roll = 0
```

StageRoadViewはM6.18どおり横方向だけを再表現する。

## 11. Validation

M6.19 regressionは次を直接検証する。

1. opaque manifestの全packageがruntime registryでexactly once解決される。
2. Route DAG transition後でもPENDING中は旧`activePackageId`がruntime authorityである。
3. validated seam COMMIT時にpackage / Guide frame / road viewが同時にchildへ切り替わる。
4. COMMITでworld poseは変わらない。
5. 通常M5 car physicsがchild Guide frame + child SurfaceMapをそのまま消費できる。
6. sibling road spaceはchild SurfaceMapでVOIDとなる。
7. RouteStageContentManifestは引き続きruntime型を知らない。
8. runtime registryはRoute DAG decision logicを持たない。

初回実装CIでは224/224 tests passを確認した。

## 12. 次段階

次は、closed DEV fixtureの同一fork再利用に依存しない**実際のchild stage continuation**をauthoringする。

そのstage package内に次の分岐またはterminal continuationを持たせることで、M6.17のhandoff後にM6.19 runtime packageを`main.ts`のphysics / camera / rendererへ実際に接続できる。

製品側のpoint-to-point / future branchingを、DEV lap semanticsへ依存させないことを優先する。
