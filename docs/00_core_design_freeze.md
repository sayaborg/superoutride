# ラスタスクロール疑似3Dレースゲーム Core Design Freeze

> **現行の読み方（00b による限定的 supersession）**
>
> 本文書は元来の closed-course Core を記録する凍結文書である。`docs/00b_core_design_freeze_addendum_m6_44.md`
> は、そのうち path/source の一般形、endpoint、renderer depth、closed-loop 必須条件だけを置換した。
> したがって本文書中の全 `wrapSigned(s_render - s_camera)` / `wrapSigned(s_obj - s_cam)` 記述
> （§4、§5、§40、§54、§76、§78 を含む）は現行 renderer authority ではない。現行式は
> `d = s_render - s_camera`、一般 runtime domain は有限 open `[0,L]`、cyclic は上位 topology が
> 明示的に有限 open window へ展開する。その他の renderer・metric 不変条件は、00b が明示した
> 境界の外では引き続き本書に従う。

## 0. 設計思想

本企画は、

> **3Dの自由度を持つ走行を、通常の3D透視投影を使わず、ラスタスクロール型pseudo-3Dとして描く。**

ことを目的とする。

成立させるものは、

- 直線道路上での斜め走行
- アウト・イン・アウト
- 路外走行
- 実車寄り車両物理
- 高低差
- 左右非対称道路
- 海岸・崖・谷などの地形表現
- 大量の拡大縮小sprite
- OutRunners / Cool Riders世代程度の高密度な画面表現

である。

ただし、描画方式そのものを通常の3Dへ近づけることは目的としない。

本方式で最優先するものは、次の3点である。

1. **設計の単純さ**
2. **実装の単純さ**
3. **当時の実機でも成立し得る計算量**

したがって、

- polygon road
- z-buffer
- perspective-correct texture mapping
- arbitrary sprite rotation
- per-pixel 3D transform
- full 3D terrain mesh

は使用しない。

基本思想は、

> **Physicsは3D。Rendererは2.5Dですらなく、chainage駆動のraster pseudo-3D。**

である。

### 0.1 本文書のscope

本文書は、

> **単一のforward-only closed courseに対するcourse coordinate、camera、terrain、GroundMap、sprite合成、Painter型rendererのcore specification**

を定義する。

本文書のcore scopeには、

- branch / route DAG
- stage progression
- checkpointによるtime extension
- rival AI
- collision responseのゲームルール
- event scripting

を含めない。

これらはgameplay / race-rule側の別仕様としてよい。

ただし、rendererと直接共有する最小限の情報として、

- `s_progress`
- `SurfaceMap`
- course-attached object anchor

は本文書内で定義する。

したがって、本仕様のclosed-loop条件と、別仕様でOutRun型のstage progressionやroute selectionを持たせることは混同しない。

---

# 1. 描画の絶対原則

本rendererの核は、

> **1つの道路chainageは、画面上では必ず1本の水平scanlineへ投影される。**

という原則である。

道路が、

- 直線
- カーブ
- 上り
- 下り
- 路外
- 海岸
- 崖沿い

のいずれであっても、この原則を破らない。

この原則の幾何学的前提は §18 の、

\[
\boxed{
Y(s,l)=Y(s)
}
\]

である。

すなわち同一chainage内ではlateral位置によって高さを変えない。

これにより同一 `s` は同一screen Yへ閉じ込められ、その1本のscanline上で §48 の `l ↔ screen X` affine mappingを使用できる。

したがって同一pseudo-depthに属するものは、

- road
- terrain
- road marking
- course-attached sprite anchor
- dynamic sprite anchor

すべて同一の奥行き規則を共有する。

通常3Dのように、

> 「横へ離れたobjectだから実距離が違い、depthもscaleも変わる」

という補正は行わない。

これは誤差ではなく、本rendererの意図的な表現規則である。

---

# 2. 座標系

## 2.1 World

物理演算の正本はworld座標とする。

XZ平面の向きは、以後すべて次で固定する。

```text
+Z : yaw = 0 のforward
+X : yaw = 0 のright
+Y : up

positive yaw : +Z から +X 方向への時計回り
positive l   : 道路進行方向に対してright
```

したがってheading \(\psi\) に対するplan tangentとright normalは、

\[
\boxed{
\mathbf t(\psi)
=
(\sin\psi,\cos\psi)
}
\]

\[
\boxed{
\mathbf n(\psi)
=
(\cos\psi,-\sin\psi)
}
\]

とする。

\(\mathbf n\) は常に進行方向右向きである。

この符号規約を、

- road heading
- vehicle yaw
- camera yaw
- Guide Curve normal
- lateral coordinate \(l\)
- §32 background pan
- §36 lateral camera
- §42 straight-road yaw projection

の全域で共通使用する。

```text
Vehicle {
    X
    Y
    Z

    yaw
    velocity

    sprung_pitch
    sprung_roll

    wheel_state[]
}
```

`sprung_pitch` / `sprung_roll` はphysics stateとして保持する。

`sprung_pitch` は §39 のcamera pitchへ使用する。`sprung_roll` はcamera rollには使用しない。四輪車ではcore renderer上の直接の消費先を必須とせず、二輪車では §58 のbank variant選択へ利用してよい。

車両を道路中心線や道路座標へ拘束しない。

したがって、直線道路上でも、

```text
道路方向  ↑

          ↗ 車両進行方向
```

が成立する。

道路から完全に外へ出ることもできる。

---

## 2.2 Course coordinate

描画およびコース属性参照用として、

```text
(s, l)
```

を使用する。

`s` は道路基準線に沿ったplan chainage。

`l` は基準線からの左右位置で、**rightを正**とする。

これは補助座標であり、車両物理状態の正本ではない。

---

# 3. 道路基準線

XZ平面上の道路基準線を、

\[
\boxed{
C(s)=(X(s),Z(s))
}
\]

とする。

この線は道路の幾何学的中央を意味しない。

用途は、

- chainage
- road heading
- lateral座標原点
- pseudo-depth
- road / terrain authoring基準

である。

道路headingを \(\psi_{\rm road}(s)\) とすれば、§2の規約により、

\[
\mathbf t(s)
=
\mathbf t(\psi_{\rm road}(s))
\]

\[
\mathbf n(s)
=
\mathbf n(\psi_{\rm road}(s))
\]

とする。

したがって左右幅は完全に独立でよい。

```text
leftWidth  = w_L(s)
rightWidth = w_R(s)
```

道路端は、

\[
P_{\rm roadL}(s)
=
C(s)-w_L(s)\mathbf n(s)
\]

\[
P_{\rm roadR}(s)
=
C(s)+w_R(s)\mathbf n(s)
\]

とする。

---

# 4. chainage

> **00b supersession:** 以下の cyclic depth 式だけは履歴記録であり、現行式は
> `d = s_render - s_camera` である。

`s` はXZ平面上のplan chainageである。

3D道路表面の弧長ではない。

路面の縦断勾配角を \(\alpha_{\rm grade}\) とすれば、実際の路面距離との関係は、

\[
d\ell
=
\frac{ds}{\cos\alpha_{\rm grade}}
\]

となる。

一方、§45 で使用する区分一次heightの勾配比は、角度ではなく、

\[
g
=
\frac{dY_{\rm render}}{ds}
\]

とする。

描画では、

\[
\boxed{
d
=
wrapSigned(s_{\rm render}-s_{\rm cam})
}
\]

をpseudo-depthとする。

`wrapSigned` は §5 のsigned cyclic differenceである。

この `d` がrenderer全体の共通奥行きである。

---

# 5. closed courseとwrap

> **00b supersession:** closed/cyclic は一般 Core ではなく明示的な上位 topology である。
> renderer は wrap せず、上位層が構成した finite open chainage を消費する。

コース全長を \(L_{\rm course}\) とする。

runtimeでは、無限に増大するfloat値を必須としない。

概念的な幾何course positionを、

```text
GeometricCoursePosition {
    lap
    s_local    // 0 <= s_local < L_course
}
```

としてよい。

これは §61 のgameplay上の `s_progress` とは別物である。

rendererではcamera近傍のsigned cyclic differenceを使用する。

\[
\boxed{
d
=
wrapSigned(s_{\rm obj}-s_{\rm cam})
}
\]

ただし、

\[
-\frac {L_{\rm course}}2
<
d
\le
\frac {L_{\rm course}}2
\]

へ正規化する。

描画距離について、

\[
\boxed{
0<d_{\min}<D_{\rm cam}<d_{\max}<\frac {L_{\rm course}}2
}
\]

をhard requirementとする。

同値なcourse設計側条件として、

\[
\boxed{
L_{\rm course}>2d_{\max}
}
\]

を満たす。

さらに、通常地表を画面下端まで描くsceneではnear planeが早すぎて地表を切らないことを要求する。

画面下端を \(y_{\rm bottom}\) とし、

\[
y_h=c_y-f\sin\Phi
\]

とすれば、near地表について、

\[
\boxed{
y_h
+
\frac{f}{d_{\min}}
\left[
Y_{\rm cam}
-
Y_{\rm render}(s_{\rm cam}+d_{\min})
\right]
\cos\Phi
\ge
y_{\rm bottom}
}
\]

を、想定camera envelopeのうち地表が画面下端を覆うべき状態で満たすようparameterを決める。

flat groundかつcamera heightが \(h\) なら、

\[
\boxed{
d_{\min}
\le
\frac{fh\cos\Phi}
{y_{\rm bottom}-y_h}
}
\]

へ簡約できる。

さらにnear側のrender heightを局所的に、

\[
Y_{\rm render}(s_{\rm cam}+d)
=
Y_{\rm render}(s_{\rm cam})+g d
\]

とみなし、cameraがその基準heightより \(h\) 上にある代表状態では、

\[
Y_{\rm cam}-Y_{\rm render}(s_{\rm cam}+d)
=
h-gd
\]

なので、

\[
\boxed{
d_{\min}
\le
\frac{h}
{
 g+
 \dfrac{y_{\rm bottom}-y_h}{f\cos\Phi}
}
}
\]

をparameter選定用の閉形式として使用できる。

この式は分母が正の場合に使用する。通常は想定する**最大上り勾配**を \(g\) に入れればcoverageの安全側になる。

flat ground式もこの \(g=0\) の場合である。

ここで等号が与えるのは**coverageを満たす最大の \(d_{\min}\)** であり、より小さい \(d_{\min}\) を選ぶことも正しい。したがって \(d_{\min}\) を数学的に等号へ固定する必要はない。

最終的なhard validationは、縦断勾配だけでなく、

- `Y_camera`
- vertical framing
- sprung motion
- \(\Phi\) envelope

を含めた上記一般coverage式を正本とする。

このcoverage requirementは §49〜§51 のPainter orderingそのものの成立条件ではない。Painter orderingは、存在するnear TerrainLineがfar TerrainLineを上書きする限り成立する。

ただしcoverage requirementを満たさない場合、near planeよりcamera側のTerrainLine自体が存在しないため、画面下端にFar Backgroundまたはfarther terrainが意図せず残ることがある。したがって通常地表sceneでは、**near-plane由来の画面下端の穴を防ぐ条件**としても扱う。

GroundBaseが意図的にTRANSPARENTである崖側などは、このcoverage requirementの対象外である。

以上のsigned cyclic differenceにより、

- start line直後
- lap境界
- 周回遅れ
- cameraが0/\(L_{\rm course}\)境界付近

でも、cameraから見て最も近いcourse copyを一意に選択できる。

---

# 6. closed loop条件

> **00b supersession:** 以下は明示的 closed-lap authoring にのみ適用する。一般 RasterPath / GuidePath
> の成立条件ではなく、通常の open path に last-to-first segment を要求しない。

単純閉曲線を前提とする。

heading積分について、

\[
\boxed{
\sum_i\Delta\psi_i=\pm2\pi
}
\]

位置について、

\[
\boxed{
\sum_iL_i\cos\psi_i=0
}
\]

\[
\boxed{
\sum_iL_i\sin\psi_i=0
}
\]

を要求する。

高さについても、

\[
\boxed{
Y(L_{\rm course})=Y(0)
}
\]

を必須とする。

camera / physics用smooth profileも境界を跨いで連続でなければならない。

最低でも、

- position continuity
- tangent continuity

を要求する。

---

# 7. コース形状制約

本rendererはforward-onlyの単純閉コースを対象とする。

走行道路として、

- XZ自己交差
- 立体交差
- 8の字
- 360° loop
- 長時間の逆走を通常プレイとする構造

は禁止する。

非隣接区間のroad polygon bandについても、

- 自己交差
- 重複

を禁止する。

トンネルは可能。

ただし、

- 壁
- 天井
- 坑口

はroad geometryではなくcourse-attached spriteとして描く。

坑口spriteは、

```text
外周        opaque
開口部分    transparent
```

という0/1 transparencyの額縁形状を基本とする。

これにより坑口の向こうにあるterrain / spriteをPainter順のまま見せられる。

トンネル内部では、Far Backgroundの空や屋外遠景が不自然に見えないよう、

- 近距離の壁
- 天井
- portal frame

はcourse-attached spriteで遮蔽する。

一方、遠方の坑内・奥壁・遠い照明等は、§32 の `background transition rule` により**tunnel interior用Far Backgroundへ差し替えてよい。**

これにより遠方まで大型spriteで覆う必要を減らせる。

このためにz-bufferや別のtunnel passを追加しない。

---

# 8. Raster road geometry

描画道路そのものは直線segmentの集合とする。

各vertexの折れ角は、

\[
\boxed{
|\Delta\psi|\le10^\circ
}
\]

をhard limitとする。

この制約には、

- road edgeを直線として扱える
- miterが極端にならない
- pseudo-3Dとして自然
- visible geometry処理量を抑えられる

という複数の意味がある。

---

# 9. segment生成

geometry segmentのbreakpointは、

- heading
- render height
- leftWidth
- rightWidth
- groundLeft
- groundRight

の和集合から生成する。

重要なのは、

> **texture・surface・GroundBase変更だけではgeometry segmentを分割しない。**

ことである。

これらはscanline paint時にchainageから参照する。

これにより、

- marking event
- grass / sand region
- GroundBase color change

のたびにroad geometryが細分化されることを防ぐ。

segment内部ではgeometry量を一次補間する。

---

# 10. Edge geometry

左右road edgeはcompilerで連続なpolylineとして生成する。

一定幅の場合のmiter ratioは、

\[
miterRatio
=
\frac1{\cos(\Delta/2)}
\]

である。

\[
|\Delta|\le10^\circ
\]

なら過大なmiterは発生しない。

widthが左右で異なる場合も、

- left edge
- right edge

を独立に接続する。

compilerでは、

- intersection有限
- edge反転なし
- 異常延長なし
- road band自己交差なし

を検証する。

GroundMap左右edgeについても同様に生成し、

- intersection有限
- edge反転なし
- 異常延長なし
- ground band自己交差なし
- 非隣接ground band重複なし

を検証する。

authoring上の簡易目安として、局所corner半径より極端に大きいGroundMap幅を避けることは有用である。

ただし `g < R_corner` のような単一式をhard requirementとはせず、**実際に生成されたGroundMap edgeのintersection / inversion / overlap検証を正本**とする。

---

# 11. Guide Curve

Raster roadそのものは折れ線のままとする。

一方、

- world → `(s,l)`
- camera position
- camera heading基準

にはcornerを丸めたGuide Curveを使用する。

\[
\boxed{
C_{\rm guide}(s)
}
\]

とする。

これは別の道路ではない。

Raster roadを滑らかなheadingで参照するためだけの補助曲線である。

Guide Curveも同一global chainage \(s\) を共有する。

この**同一global sを最後まで維持すること**を、Guide Curveを数学的に完全なarc-length parameterへ作り替えることより優先する。

---

# 12. Guide Curveの生成

Raster vertex周辺だけをlocal circular filletとする。

描画道路自体は丸めない。

fillet metricを、

\[
\mu
=
\frac{|\Delta|}
{2\tan(|\Delta|/2)}
\]

とする。

\(\Delta=0\) では、

\[
\mu=1
\]

とする。

signed curvatureを、

\[
\kappa_c
=
\frac{\operatorname{sgn}(\Delta)}R
\]

とすれば、lateral offset chartのmetricは、

\[
\boxed{
J
=
\mu(1-\kappa_c l)
}
\]

となる。

Raster vertexとcircular filletの最大平面乖離は、

\[
\boxed{
\delta_{\rm guide}
=
R\left(\sec\frac{|\Delta|}{2}-1\right)
}
\]

である。

これはGuide Curveが描画道路からどれだけ離れるかをcompilerで定量確認するために使用できる。

Guide Curveはstraightとcircular filletを接続するため、

- position continuity
- tangent **direction** continuity

を持つ。

一方、global chainage \(s\) に対するparameter speedは、中心線 \(l=0\) でも、

\[
\left|\frac{dC_{\rm guide}}{ds}\right|
=
\begin{cases}
1 & \text{straight}\\
\mu & \text{fillet}
\end{cases}
\]

となるため、strictな数学用語では一般にC¹ではない。

したがってhorizontal Guide Curveのcore requirementは、

> **G¹：position continuous + tangent-direction continuous**

とする。

curvatureも一般に、

\[
0
\leftrightarrow
\frac1R
\]

と不連続である。

clothoid、高次spline、nonlinear reparameterizationをcore requirementへ追加しない。

これは**同一global chainageを保った単純なcircular fillet**を優先するための意図的な選択である。

---

# 13. Guide Curveの安全域

横方向有効域を、

\[
|l|_{\max}
\]

最低metric marginを、

\[
m_{\min}
\]

とする。

\[
\boxed{
J\ge m_{\min}
}
\]

を要求する。

corner \(i\) で必要なfillet半径は、

\[
\boxed{
R_{\min,i}
=
\frac{|l|_{\max}}
{1-m_{\min}/\mu_i}
}
\]

とする。

必要条件は、

\[
0<m_{\min}<\mu_i
\]

である。

したがって常に、

\[
\boxed{
R_{\min,i}>|l|_{\max}
}
\]

である。

これは重要な幾何学的制約である。

> **タイトなcornerと、そのcornerで大きく横へ外れてなおGuide chart内の支持surfaceとして走れる領域は直接trade-offする。**

これはparameter tuningだけでは消せない。

ただし \(|l|_{\max}\) は**Guide Curveを用いるworld→course chartの安全域**であり、GroundMapのvisual strip幅そのものではない。

したがって、

\[
g_L,\ g_R
\]

を \(|l|_{\max}\) 以下へ制限する必要はない。

一方、通常のphysics queryで走行可能surfaceとして使用するlateral envelopeを \(|l|_{\rm drivable,max}\) とすれば、原則として、

\[
\boxed{
|l|_{\rm drivable,max}
\le
|l|_{\max}
}
\]

を満たすよう設計する。

visual GroundMapはこれより外側へ広げてよい。

Guide Curve radiusは**新しいartist tuning parameterにはしない。**

既定規則は次の2つだけとする。

1. 一般polyline vertexでは、

\[
\boxed{
R_i=R_{\min,i}
}
\]

を単純なfallbackとする。

2. editor/compilerが「半径 \(R_{c,i}\) の円弧を弦polylineへ変換したvertex」であることを明示的に保持している場合は、§14 の最大適合filletを自動使用する。

任意polylineについてsegment長だけから半径を最大化するruleは採用しない。長いstraightに挟まれた単発cornerでGuide CurveがRaster vertexから数m単位で離れることを防ぐためである。

---

# 14. Fillet overlap

vertex \(i\) のtrim長を、

\[
t_i
=
R_i\tan\frac{|\Delta_i|}{2}
\]

とする。

segment長 \(L_i\) に対し、

\[
\boxed{
t_i+t_{i+1}\le L_i
}
\]

をcompilerで検証する。

数値実装ではcompiler toleranceを差し引いてよい。

等号は、2つのfilletがsegment上の同一点で接し、間のstraight部分が長さ0になる場合を許す。両filletのtangent directionがsegment方向で一致する限りG¹ continuityは保たれる。

ただし、segment両端のfilletが**逆符号のcurvature**を持つ場合は、直接接触を許さない。

segment内に残るstraight長を、

\[
\boxed{
L_{{\rm straight},i}
=
L_i-t_i-t_{i+1}
}
\]

とする。

\[
\operatorname{sgn}(\Delta_i)
\ne
\operatorname{sgn}(\Delta_{i+1})
\]

かつ両者が非zeroなら、

\[
\boxed{
L_{{\rm straight},i}
\ge
D_{\rm cam}
}
\]

をcourse / target-profile validationで要求する。

これによりcamera lateral offset chartが、同一点で

\[
+\kappa
\rightarrow
-\kappa
\]

へ直接切り替わることを禁止する。Guide Curveの基本continuityはG¹のままとし、逆向きS字だけを少なくともcamera depth相当のstraightで分離する。

暫定値を、

\[
|l|_{\max}=12{\rm m}
\]

\[
m_{\min}=0.25
\]

\[
\Delta_{\max}=10^\circ
\]

とすると、

\[
R_{\min}
\simeq16.01{\rm m}
\]

である。

したがって仕様表記は、

\[
\boxed{
R_{\min}\approx16.0{\rm m}
}
\]

とする。

なお \(|\Delta|\le10^\circ\) では、

\[
0.99746\lesssim\mu\le1
\]

なので、桁感としては、

\[
\boxed{
R_{\min}
\approx
\frac{|l|_{\max}}{1-m_{\min}}
}
\]

とみなしてよい。厳密なcompiler検証では常に \(\mu_i\) を含む式を使用する。

一般polyline fallbackとして両端が最大cornerかつ \(R=R_{\min}\) なら、

\[
L_i
\ge
2R_{\min}\tan5^\circ
\simeq2.80{\rm m}
\]

が必要になる。

ただしこれは一般hard limitではなく、上記暫定parameterでのworst caseである。

同じ暫定値で \(|\Delta|=10^\circ\)、\(R=R_{\min}\) ならGuide CurveとRaster vertexの最大乖離は、

\[
\delta_{\rm guide}
=
R_{\min}(\sec5^\circ-1)
\simeq0.061{\rm m}
\]

すなわち約6cmである。

Raster road自体はpolylineなので、各vertexに一意な物理corner半径は存在しない。したがって \(R_{\min}\) をそのまま「Raster roadの最小コーナー半径」と呼ばない。

ただしeditor側で半径 \(R_c\) の円を、各vertexのturn angleを \(\Delta\) とする**弦segment**で近似する場合、segment長は、

\[
L_i
=
2R_c\sin\frac{|\Delta|}{2}
\]

である。

このregular circular authoringでは、隣接するfilletがsegment中央でちょうど接する最大半径は、

\[
\boxed{
R_{\rm fit}
=
R_c\cos\frac{|\Delta|}{2}
}
\]

である。

このfilletは元の半径 \(R_c\) の円弧そのものではない。

元円と同心で、その内側へ、

\[
\boxed{
\delta_{\rm source}
=
R_c\left(1-\cos\frac{|\Delta|}{2}\right)
}
\]

だけ寄った円弧となる。

例えば、

- \(R_c=200\rm m,\ \Delta=2^\circ\) なら約3.0cm
- \(R_c=20\rm m,\ \Delta=10^\circ\) なら約7.6cm

である。

したがってcircular-authoring metadataがある場合は、

\[
\boxed{
R_i=R_{c,i}\cos\frac{|\Delta_i|}{2}
}
\]

を使用し、

\[
R_i\ge R_{\min,i}
\]

をcompilerで確認する。

これはsource円半径に対して、

\[
\boxed{
R_c
\ge
\frac{R_{\min}}
{\cos(|\Delta|/2)}
}
\]

と同値である。

\(|\Delta|=10^\circ\)、\(|l|_{\max}=12\rm m\)、\(m_{\min}=0.25\) の暫定値なら、

\[
R_c\gtrsim16.08{\rm m}
\]

である。

これにより、新しいcamera geometry knobを増やさず、通常の円弧authoringでは \(R=R_{\min}\) 固定より大きなGuide radiusを自動的に得られる。

一方、circular-authoring metadataがない一般polylineでは §13 の \(R_i=R_{\min,i}\) fallbackを維持する。

---

# 15. World → road coordinate

world objectから `(s,l)` を取得する場合、Guide Curveのlocal nearest searchを使用する。

検索は、

- 前frameのsegment index
- その隣接segment

を優先する。

通常frameでは近傍数segmentだけを探索する。

全コース検索を毎frame行わない。

重要なのは、

> **通常走行中の `(s,l)` はglobal nearest pointではなく、前frameから連続するlocal chart solutionを正本とする。**

ことである。

chart安全域、特に \(|l|>|l|_{\max}\) へ出てもworld position自体はclampしない。

vehicle physicsはworld座標のまま継続する。

一方、renderer / camera用course coordinateは、

1. 前frameのsegmentと隣接segmentだけから連続な `s` candidateを追跡する
2. 非隣接segmentへの突然のnearest-point jumpを禁止する
3. 必要ならrenderer / camera用 `l` のみ安全域へclampする
4. respawn / teleport / checkpoint resetなど明示的な再初期化時だけglobal searchを許す

とする。

local nearest searchが一時的に不安定な場合も、前frameのtangent方向への局所外挿で `s` の連続性を優先する。

これによりmedial axisを跨いだglobal nearest-point切替による `s_car` / `s_cam` の瞬間的な転送を防ぐ。

---

# 16. Height profile

高さのauthoring正本を、

\[
Y_{\rm source}(s)
\]

とする。

compilerから以下を生成する。

```text
Y_render(s)   : raster terrain用区分一次profile
Y_phys(s)     : wheel contact用smooth profile
Y_camera(s)   : camera guide用smooth profile
```

すべて同じchainageを共有する。

`Y_phys` はC¹以上とする。

`Y_camera` はC¹以上、可能ならC²とする。

`Y_render` はraster描画のため区分一次とする。

---

# 17. Render height error

player vehicleの接地とraster roadが目立ってずれないよう、

\[
Y_{\rm render}
\]

と、

\[
Y_{\rm phys}
\]

の差をcompilerで管理する。

近似誤差そのものよりscreen-space誤差を基準とする。

\[
\epsilon_y
=
\frac{f|\cos\Phi|}
d
|Y_{\rm phys}-Y_{\rm render}|
\]

について、原則としてplayer接地点のpseudo-depth、

\[
\boxed{
d=D_{\rm cam}
}
\]

で、

\[
\boxed{
\epsilon_y
\le
\epsilon_{\rm surface}
}
\]

を満たすよう `Y_render` をadaptive subdivisionする。

この基準は**player wheelとraster roadの接地整合**を主目的とする。

同じheight誤差に対するscreen-space誤差は \(1/d\) に比例するため、\(d<D_{\rm cam}\) では、

\[
\boxed{
\epsilon_y(d)
=
\epsilon_y(D_{\rm cam})
\frac{D_{\rm cam}}{d}
}
\]

となり、near planeでは最大で概ね \(D_{\rm cam}/d_{\min}\) 倍へ増える。

これは意図的に許容する。chase viewでは \(0<d<D_{\rm cam}\) はcameraとplayerの間であり、player spriteに隠れる割合が大きい。ここを \(d_{\min}\) 基準へ変更してY_renderを過剰細分化することはcore requirementとしない。

camera parameterの可動範囲を持つ場合は、想定される \(\Phi\) のworst caseをcompiler検証に使用する。

また、地表へ固定されるcourse-attached spriteは、authoring上のheight offsetを保持したうえで、compiler時に接地基準を `Y_render(s)` へsnapしてよい。

これにより、

- player wheelとraster roadの浮き沈み
- ground-attached spriteと描画terrainの接地ずれ

を別々に処理せずに済む。

非接地object、橋上構造、tunnel ceiling等はこのsnapの対象外である。

---

# 18. Camber

同一chainageに属するroad / terrainは同一Yとする。

すなわちrenderer上、

\[
\boxed{
Y(s,l)=Y(s)
}
\]

である。

これは単なるcamber省略ではなく、§1 の、

> **1 chainage → 1 horizontal scanline**

を成立させる前提である。

同一 `s` でscreen Yが `l` に依存しないため、§48では同じscanline上で `l ↔ screen X` を厳密なaffine mappingとして扱える。

したがって、

- road camber
- cant
- bank angle
- lateral terrain slope

はraster geometryとして持たない。

camera rollも使用しない。

これは本方式の重要な簡略化である。

---

# 19. GroundMap

道路およびその周囲の水平地表を、

\[
\boxed{
GroundMap(s,l)
}
\]

として定義する。

これはperspective変形済みbitmapではない。

source座標は、

```text
vertical   : chainage s
horizontal : lateral l
```

である。

含められるものは、

- asphalt
- lane line
- arrows
- road text
- shoulder
- curb
- skid marks
- patches
- grass
- dirt
- sand
- beach
- flat sea surface（道路と同一高度として扱える場合のみ。§21参照）
- その他の地表模様

である。

---

# 20. GroundMap幅

GroundMap有効範囲を、

\[
\boxed{
-g_L(s)
\le
l
\le
g_R(s)
}
\]

とする。

必ず、

\[
\boxed{
g_L(s)\ge w_L(s)
}
\]

\[
\boxed{
g_R(s)\ge w_R(s)
}
\]

を要求する。

これはcompiler hard requirementとする。

GroundMap strip edgeは、

\[
P_{\rm groundL}
=
C-g_L\mathbf n
\]

\[
P_{\rm groundR}
=
C+g_R\mathbf n
\]

とする。

左右幅は独立である。

GroundMap幅はvisual authoring範囲であり、§13 のGuide Curve chart安全域 \(|l|_{\max}\) とは別概念である。したがって、

\[
g_L>|l|_{\max}
\quad\text{or}\quad
g_R>|l|_{\max}
\]

であっても、それだけでは不正としない。

GroundMap edgeの正否は §10 のintersection / inversion / overlap検証を正本とする。

---

# 21. GroundMapの表現限界

GroundMap全体は1本の水平scanlineへ投影される。

したがって同一chainage内で、

```text
road       Y = 20m
sea        Y = 0m
```

のようなlateral方向の高低差を持つことはできない。

つまりGroundMapで表現できるのは、

> **道路と同じ高度に存在する水平なコース断面**

だけである。

したがって、

- 法面
- 垂直な崖壁
- 土手
- 橋脚
- 道路より大きく低い海面

などはGroundMap geometryとして描かない。

必要に応じて、

- GroundBase TRANSPARENT
- Far Background
- course-attached sprite

を組み合わせる。

---

# 22. GroundMap authoring

GroundMapの正本は巨大bitmapではない。

論理的には、

\[
\boxed{
BaseTile
+
SurfaceRegion
+
Marking/DecalEvent
}
\]

とする。

例えば、

```text
s=1200..1360 : lane merge region
s=1240       : arrow
s=1270       : arrow
s=1290       : arrow
s=1310..1360 : lane boundary convergence
```

と記述できる。

compilerはこれをtexture chunkへbakeする。

ただし、白線・lane boundary・単純なcurb bandなど、`l` の区間として表せる鋭いmarkingについては、compilerが**GroundMapと意味的に等価なanalytic lateral span**へ変換してもよい。

固定scanline内では §48 により `l ↔ x` がaffineなので、

```text
l0 .. l1
    ->
x0 .. x1
```

への変換だけで描ける。

これは別layerや追加passではない。

あくまでGroundMap断面の描画を、

- texture fetch
- analytic interval fill

のどちらで実装するかというcompile/runtime optimizationであり、§78のGroundMap定義を変更しない。

arrow、road text、skid mark、patchなど2次元形状を必要とするものは通常どおりdecal / textureへbakeしてよい。

---

# 23. GroundMap texture coordinate

GroundMapのl方向はmeter基準とする。

\[
\boxed{
1{\rm m}
=
一定texel数
}
\]

とし、

\[
l=0
\]

を固定source originとする。

したがってground strip幅が変化しても、

- lane width
- white line
- curb
- skid mark

のsource画像自体が横方向に伸縮しない。

screenへの変形だけが変化する。

---

# 24. GroundMap chunk

全コース長を1枚の巨大bitmapとして持つ必要はない。

例えば、

```text
chunk 0 :   0–64m
chunk 1 :  64–128m
chunk 2 : 128–192m
...
```

のようなchainage chunkへcompileする。

何もない領域ではbase tileを反復できる。

したがって、

> **全長方向のmappingは存在するが、全長分の巨大textureは必要ない。**

---

# 25. GroundMap filtering

遠方ではchainage方向のsample footprintが急速に大きくなる。

scanline \(y\) に対し、

\[
\Delta s
=
|s(y+0.5)-s(y-0.5)|
\]

を求める。

横方向についても、

\[
\Delta l
=
|l(x+0.5)-l(x-0.5)|
\]

を求める。

flat groundでcamera heightを \(h\) とすれば、

\[
y-y_h
=
\frac{fh\cos\Phi}{d}
\]

より、代表的には、

\[
\boxed{
\Delta s
\simeq
\frac{d^2}{fh\cos\Phi}
}
\]

となる。

straight segmentでroadとcameraのheading差を、

\[
\beta
=
\psi_{\rm road}-\psi_{\rm cam}
\]

とする。

§48 のhorizontal affine mappingおよび §43 のscreen widthから、\(\cos\beta>0\) の通常forward intervalでは、横1pixelのsource footprintは概ね、

\[
\boxed{
\Delta l
\simeq
\frac{d}{f\cos\beta}
}
\]

である。

\(\beta=0\) では、

\[
\Delta l\simeq\frac df
\]

へ戻る。

したがってbaselineでは、

\[
\Delta l\propto d,
\qquad
\Delta s\propto d^2
\]

であり、遠方ほどsource footprintはchainage方向へ強く伸びる。

一方、\(|\beta|\) が大きいと \(\Delta l\) だけが \(1/\cos\beta\) 倍へ増える。これは同時にGroundMap stripのscreen幅そのものが \(\cos\beta\) に比例して縮退する状態である。

GroundMap filteringは、**通常のisotropic mip pyramidを前提としない。**

runtimeで高価なanisotropic filterを行う代わりに、compilerがanisotropic prefiltered imageを生成する。

coreでは、base lateral densityとbase chainage densityを独立parameterとして選ばない。

代表camera状態 \(\Phi_{\rm ref}\) に対するlevel-0交差距離を、

\[
\boxed{
d_0
}
\]

とする。

既定値は、

\[
\boxed{
d_0=D_{\rm cam}
}
\]

とする。

これにより、flat / straight / \(\Phi_{\rm ref}\) baselineではplayer depthでlevel 0のlateral footprintとchainage footprintが同時に1 base texelへ達する。

base texelのmeter footprintは、

\[
\boxed{
q_l
=
\frac{d_0}{f}
}
\]

\[
\boxed{
q_s
=
\frac{d_0^2}
{fh\cos\Phi_{\rm ref}}
}
\]

とする。

したがって、

\[
\rho_l=\frac1{q_l},
\qquad
\rho_s=\frac1{q_s}
\]

であり、これらは独立parameterではない。

また、

\[
\boxed{
q_s
=
\frac{f q_l^2}
{h\cos\Phi_{\rm ref}}
}
\]

である。

target profileで \(d_0>D_{\rm cam}\) を選ぶことは許すが、その場合player depthでのlevel-0 magnificationは、

\[
\boxed{
M_l
=
\frac{d_0}{D_{\rm cam}}
}
\]

\[
\boxed{
M_s
=
\left(
\frac{d_0}{D_{\rm cam}}
\right)^2
}
\]

となる。

したがってchainage方向のnear-field拡大は二乗で悪化する。`d_0` をmemory削減だけを理由に大きくしてはならない。

代表例として、

```text
f        = 200 px
h        = 2 m
Phi_ref  = 8 deg
W        = 24 m
L_unique = 3000 m
```

を仮定すると、

| d_0 | q_l | q_s | 全長unique時のbase texel数 N_0 |
|---:|---:|---:|---:|
| 5 m | 0.025 m | 0.063 m | 約45.7 M |
| 20 m | 0.10 m | 1.01 m | 約713 k |
| 60 m | 0.30 m | 9.1 m | 約26 k |

となる。

この強いtrade-offのため、既定は \(d_0=D_{\rm cam}\) とし、memoryは§24のchunk、repeating base tile、decal、analytic spanによって削減する。

推奨する単純なprefilterは、距離が概ね2倍になるごとに、

```text
l方向 density : 1/2
s方向 density : 1/4
```

となる**1本のanisotropic pyramid**である。

level \(k\) の代表texel footprintは、

\[
q_l(k)=q_l2^k
\]

\[
q_s(k)=q_s4^k
\]

である。

baselineのflat / straight / \(\Phi_{\rm ref}\) では、上記 \(q_l,q_s\) の定義により、lateral方向とchainage方向が同じlevel progressionになる。

ただし大きな \(|\beta|\) でlateral footprintだけが増えたとき、そのためにshared pyramidのlevelを上げると、chainage方向が1 levelにつき4倍余分にぼける。

したがってcoreのpyramid levelは**chainage footprintだけで選ぶ。**

\[
\boxed{
k_s
=
\max\left(
\left\lceil
\log_4\frac{\Delta s_{\rm eff}}{q_s}
\right\rceil,
0
\right)
}
\]

\[
\boxed{
k
=
clamp(k_s,0,k_{\max})
}
\]

とする。

通常のTerrainLineでは、

\[
\Delta s_{\rm eff}=\Delta s
\]

である。

§64 のthin-span / single-scanline collapseでは、その1 rowが代表するclipped chainage intervalを \(\Delta s_{\rm collapse}\) とし、

\[
\boxed{
\Delta s_{\rm eff}
=
\max(
\Delta s,
\Delta s_{\rm collapse}
)
}
\]

とする。

lateral footprintから、

\[
k_l
=
\max\left(
\left\lceil
\log_2\frac{\Delta l}{q_l}
\right\rceil,
0
\right)
\]

を診断値として求めてよいが、**\(k_l>k_s\) を理由にshared pyramidのlevelを上げない。**

高yaw時のlateral minificationは、

- GroundMap strip自体のscreen-space collapse
- §22 のanalytic lateral span
- subpixel coverage rule
- dedicated lateral-prefiltered texture
- thin-span / narrow-span collapse

で処理する。

これにより斜め走行時にchainage detailだけが4倍、16倍と過剰に失われることを防ぐ。

coreではl方向levelとs方向levelを独立に持つ2次元LOD tableを標準化しない。

必要prefilter段数は独立parameterではない。

Course Compilerは、target camera / course envelope全体についてRoad Generatorと同じmappingを評価し、

- \(d_{\min},d_{\max}\)
- \(f,h,\Phi\) envelope
- render height / grade
- forward heading envelope
- thin-span collapseが代表するchainage interval
- \(d_0\)

を含めて \(\Delta s_{\rm eff,max}\) を求める。

必要s方向downsample段数は、

\[
\boxed{
N_{s,\rm down}
=
\max\left(
0,
\left\lceil
\log_4
\frac{\Delta s_{\rm eff,max}}{q_s}
\right\rceil
\right)
}
\]

とする。

target design envelope内の**non-optional TerrainLine**について、必要levelがcompile済み \(k_{\max}\) を超えてはならない。compilerは必要levelを生成するかvalidation errorとする。

§64で省略可能とされたthin spanだけは、必要levelが上限を超える場合にそのrowをskipしてよい。

runtimeがtarget envelope外へ出た場合のgraceful fallbackとしては \(k_{\max}\) clampを許す。

level \(k\) の面積はbaseに対して概ね \(1/8^k\) なので、無限級数でも総memoryは、

\[
1+\frac18+\frac1{64}+\cdots
=
\frac87
\]

すなわちbase比約14.3%増に収まる。

全長 \(L_{\rm unique}\)、平均source幅 \(W\) をすべてunique texelとして持つ上限的な見積りでは、base texel数は、

\[
N_0
\simeq
\frac{W L_{\rm unique}}{q_lq_s}
=
\boxed{
\frac{
W L_{\rm unique} f^2 h\cos\Phi_{\rm ref}
}{d_0^3}
}
\]

となる。

したがって、

\[
\boxed{
N_0\propto d_0^{-3}
}
\]

である。

ただし§24のchunk / repeating base tileを使うため、実asset memoryが全コースunique相当になる必要はない。

simple white line等を §22 のanalytic lateral spanへcompileした場合、そのmarkingはtexture pyramidに依存しない。

ただしsubpixel aliasingは別問題なので、projected widthが1pixel未満へ縮退する場合は、

- 1pixel coverage表現
- 小数段階のprecomputed intensity / dither
- prefiltered textureへのfallback

のいずれかを使用し、0px / 1pxの単純binary点滅を避ける。これはarbitrary alpha blendingを要求しない。

dash、短いcurb block、短周期markingなどchainage方向に高周波なものは、\(\Delta s\) がfeature周期へ近づくとstrobeするため、原則としてanalytic spanへ変換せずprefilter済みtexture / decal側へ残す。

高価なruntime anisotropic filteringは必要ない。

---

# 26. SurfaceMap

走行物理に使用するsurface属性は、

\[
\boxed{
SurfaceMap(s,l)
}
\]

とする。

同一chainageでも、

```text
l = 0m   : asphalt
l = 6m   : shoulder
l = 9m   : grass
l = 12m  : sand
```

のように異なる属性を持てる。

surface typeには少なくとも、

```text
ASPHALT
SHOULDER
GRASS
DIRT
SAND
...
VOID
```

を持てる。

`VOID` は、

> **その `(s,l)` にvehicleを支持する地表が存在しない**

ことを意味する。

`VOID` をqueryした場合、SurfaceMapは接地surfaceを返さない。

その後の、

- 落下
- vehicle airborne処理
- damage
- respawn

などのgameplay / vehicle physics ruleは別仕様でよい。

重要なのは、

> **`GroundBase = TRANSPARENT` と `SurfaceMap = VOID` は独立である。**

ことである。

前者は「pixelを書かない」というvisual rule、後者は「支持surfaceがない」というphysics ruleであり、自動的に同値とはしない。

物理判定にGroundMap bitmapそのものをsampleする必要はない。

authoring上のSurface Regionを正本として、

```text
Surface Region
   ├─ visual GroundMap / GroundBase
   └─ physical SurfaceMap
```

へcompileする。

これによりvisualとphysicsの定義を共有しつつ、runtime物理判定は軽くできる。

通常走行で支持surfaceを返し得るlateral envelopeは §13 のGuide Curve chart安全域内に置く。

すなわち、走行可能領域の最大絶対lateral位置を \(|l|_{\rm drivable,max}\) とすれば、原則、

\[
\boxed{
|l|_{\rm drivable,max}\le|l|_{\max}
}
\]

とする。

これはGroundMap visual strip全体を \(|l|_{\max}\) 内へ制限するという意味ではない。

---

# 27. GroundBase

GroundMap stripより外側の地面について、

```text
GroundBase_L(s)
GroundBase_R(s)
```

を持つ。

指定可能値は、

```text
COLOR
TRANSPARENT
```

の2種類のみ。

`TRANSPARENT` はalpha blendingではない。

> **pixelを書かない**

という意味である。

任意alphaは使用しない。

---

# 28. GroundBaseはlayerではない

GroundBaseは独立した画面layerとして事前描画しない。

これは非常に重要である。

GroundBaseは、

> **各terrain scanlineを描画するときの左右paint rule**

である。

scanline上のGroundMap左右端を、

```text
x_gL
x_gR
```

とすれば、

```text
screen left .. x_gL
    GroundBase_L

x_gL .. x_gR
    GroundMap

x_gR .. screen right
    GroundBase_R
```

として描画する。

`TRANSPARENT` ならその区間を書かない。

reference-line screen Xによる左右分割は不要である。

---

# 29. GroundBase例

## 草原

```text
GroundBase_L = green
GroundBase_R = green
```

## 左が海岸側

```text
GroundBase_L = sea / sand color
GroundBase_R = grass
```

## 左が崖

```text
GroundBase_L = TRANSPARENT
GroundBase_R = grass / rock
```

この場合、左側にはterrain pixelを書かない。

そのため後ろに存在する、

- Far Background
- より遠いterrain
- より遠いsprite

がそのまま見える。

---

# 30. Far Background

Far Backgroundは、

> **水平線より上だけの遠景ではない。**

水平線の上下を含む、

\[
\boxed{
1枚の背景bitmap
}
\]

とする。

例えば1枚の画像内に、

```text
空
山
遠い森
水平線
遠い海面
谷底
崖の向こう側
遠い海岸
```

まで描いてよい。

これによりGroundBaseをtransparentにした場所から、

> **Far Backgroundの水平線より下の部分**

を直接露出できる。

片側が崖の場合の海面や谷底は、この方法で表現できる。

したがってFar Backgroundのhorizon下領域は、単なる「通常terrainに隠れる捨て絵」としてauthoringしない。

下り坂、dip、GroundBase TRANSPARENT、cliff opening等によって露出した場合でも、

> **非常に遠い地表・海面・谷底・遠景として見えて破綻しない内容**

を描く。

この制約はgeometry hard requirementではなくbackground authoring guidelineである。

---

# 31. Background horizon anchor

Far Background sourceには、

```text
sourceHorizonY
```

を持たせる。

camera horizonを、

\[
y_h
\]

とすれば、

```text
sourceHorizonY
        ↓
screen y_h
```

が一致するようvertical placementする。

重要なのは、

> **horizonはclip境界ではなく、背景画像のanchorである。**

ということである。

Far Backgroundはhorizonより下へ自由に存在してよい。

---

# 32. Far Background horizontal scroll

Far Backgroundはpanoramaとして水平scroll可能とする。

camera yawに対するscrollは、

```text
backgroundPixelsPerRadian
```

で定義する。

概念的には、

\[
x_{\rm bg}
=
x_0
-
K_{\rm bg}\psi_{\rm cam}
\]

とする。

道路側のpseudo projectionと完全に同じ関数を使ってはならない。

straight roadの基準線について §42 から、

\[
x_{\rm road}
=
c_x-f\sin\theta
\]

のbaselineを考えれば、

\[
\frac{\partial x_{\rm road}}
{\partial\psi_{\rm cam}}
=
-f\cos\theta
\]

である。

したがってforward方向 \(\theta=0\) でbackgroundとroadのlocal angular scaleを一致させるscreen-space既定値は、

\[
\boxed{
K_{\rm bg}=f
}
\]

pixels/radianである。

source panorama側のpixels/radianを直接 \(f\) にする必要はなく、source→screen scaleを含めた**effective screen-space value**が \(f\) になればよい。

道路baselineのyaw写像 \(-f\sin\theta\) は360°で元のscreen Xへ戻り、値域も高々 \([-f,+f]\) である。

したがって、この写像をそのまま360°panoramaの一意な水平座標として使用することはできない。

> **道路のsine yaw projectionと、wrap可能な大域panoramaを全yawで厳密一致させることは原理的に両立しない。**

そこでcoreでは、

- forward近傍のlocal angular scaleだけ \(K_{\rm bg}=f\) で一致
- 大域backgroundは単純なlinear angular pan

とする。

\(|\theta|\) が大きいとroad側のyaw responseは \(f\cos\theta\) へ低下する一方、background panは一定 \(K_{\rm bg}\) で流れる。

これは「誤差を許容する」のではなく、**大域panoramaを一意に保つために不可避な非整合を、最も単純なlinear panで処理する**仕様である。

bitmapは水平wrap可能としてよい。

`background transition rule` により、屋外用Far Backgroundから、

- tunnel interior
- 建物内部
- 特殊stage遠景

等の別bitmapへ切り替えてよい。

この切替は既存Far Background pass内で行い、新しい描画passを増やさない。

---

# 33. Sky / clear

frame開始時は、原則、

```text
SkyColor
```

でclearする。

その上へFar Backgroundを描く。

Far Backgroundが全画面を不透過で必ず上書きする構成では、SkyColor clearを省略してよい。

これは76,800pixelの不要なframebuffer writeを避ける単純なoptimizationである。

Far Backgroundに0/1 transparencyを使用する場合、またはviewport全体を保証して覆わない場合にはSkyColor clearを行う。

任意alpha blendingは不要である。

---

# 34. Camera depth

cameraのlongitudinal positionは、

\[
\boxed{
s_{\rm cam}
=
s_{\rm car}
-
D_{\rm cam}
}
\]

とする。

通常走行中、longitudinal方向にLPFは入れない。

したがってplayer carは常に、

\[
\boxed{
d_{\rm car}=D_{\rm cam}
}
\]

となる。

これはplayer spriteのscale安定性にとって重要である。

---

# 35. Camera yaw

camera yawはvehicle yawを空間距離相当でsmoothする。

まず、

\[
\psi_{\rm cam,LPF}
=
LPF(\psi_{\rm vehicle},\tau_\psi)
\]

を求める。

時定数は、

\[
\boxed{
\tau_\psi
=
k_\psi
\frac{D_{\rm cam}}
{\max(|\dot s_{\rm car}|,\dot s_{\min})}
}
\]

とする。

\[
0<k_\psi\le1
\]

である。

これにより速度が変わっても、

> cameraが車両に対して何m程度遅れて向きを変えるか

という空間的な感覚を保ちやすい。

ただしtight cornerでLPF由来のyaw lagが過大にならないよう、camera lagそのものに上限を設ける。

\[
\Delta\psi_{\rm lag}
=
wrapAngle(\psi_{\rm cam,LPF}-\psi_{\rm vehicle})
\]

とする。`wrapAngle` は角度差を \((-\pi,\pi]\) のsigned shortest angleへ正規化する関数である。

そのうえで、

\[
\boxed{
\psi_{\rm cam}
=
\psi_{\rm vehicle}
+
clamp(
\Delta\psi_{\rm lag},
-\theta_{\rm lag,max},
+\theta_{\rm lag,max}
)
}
\]

とする。

このclampは**camera smoothingが生んだ遅れだけ**を制限する。

vehicleがroad headingに対して意図的に斜めを向くこと、driftすること、spinすること自体をclampしてはならない。

極端なspin時のcamera演出を別に持たせる場合も、このcore ruleと分離する。

---

# 36. Lateral camera

Guide Curveからplayerのlateral位置を取得する。

\[
l_{\rm car}
=
(P_{\rm car}-C_{\rm guide})
\cdot \mathbf n_{\rm guide}
\]

vehicle headingとGuide heading差を、

\[
\delta
=
\psi_{\rm vehicle}
-
\psi_{\rm guide}
\]

とする。

cameraがplayer headingの後方へ位置するためのtargetを、

\[
\boxed{
l_{\rm target}
=
l_{\rm car}
-
D_{\rm cam}\sin\delta
}
\]

とする。

camera lateral位置は、

\[
l_{\rm cam}
=
LPF(l_{\rm target},\tau_{\rm lat})
\]

とし、

\[
|l_{\rm cam}|
\le
l_{\rm cam,max}
\]

へclampする。

この式は単なるroad-center追従ではなく、playerを横方向にある程度framingする働きも持つ。

straight road、camera yaw = vehicle yaw、lateral LPF遅れなし、clampなしの理想化状態では \(\delta=\theta\) であり、§42をplayerへ適用すると、

\[
\boxed{
x_{\rm player}
=
c_x
-
f\sin\theta(1-\cos\theta)
}
\]

となる。

小yawではplayerのscreen Xずれは高次に抑えられるため、通常drift範囲ではplayerを画面中央近傍へ保ちやすい。

ただし、

- \(|l_{\rm cam}|=l_{\rm cam,max}\) に達した場合
- lateral LPF遅れが大きい場合
- camera yaw lagが大きい場合
- 極端なspin / 大lateral excursion

にはこのframing効果を保証しない。

通常プレイとして想定するyaw / lateral envelopeについてのみ、player anchorが所定のscreen-safe範囲へ入ることをparameter決定時に検証する。無制限の路外走行でplayerを必ず画面内へ固定する追加camera ruleはcore specificationに入れない。

---

# 37. Camera XZ position

camera XZ位置は、

\[
\boxed{
P_{\rm cam,XZ}
=
C_{\rm guide}(s_{\rm cam})
+
l_{\rm cam}
\mathbf n_{\rm guide}(s_{\rm cam})
}
\]

とする。

これにより、

- raster roadは折れ線
- camera pathはcornerでposition / tangent direction連続

を両立する。

ただし §12 のとおりGuide Curve horizontal geometryのcore requirementはG¹であり、global chainage `s` に対するparameter speedやcurvatureの連続性は要求しない。

一般polyline fallbackではstraight↔fillet境界にmetric変化が残る。circular-authoringでは §14 により大きなfillet radiusを自動使用するため、lateral offset由来の変化を小さくできる。

lateral offset chartでは、

\[
J
=
\mu(1-\kappa_c l)
\]

により、同じglobal chainage incrementに対するworld-space移動率がlateral位置で変化する。

したがって大きな \(|l_{\rm cam}|\) ではstraight↔fillet境界でcamera XZ velocity / accelerationの変化が見えやすくなる可能性がある。

これはcore geometryとして受け入れ、clothoid、strict C¹/C² spline、nonlinear reparameterizationを標準化しない。

Course Compiler / debug validationでは、想定 \(l_{\rm cam}\) envelopeに対する \(J\) の範囲とcamera XZ motionをstress test対象とする。実画面で問題が確認された場合のみ、course coordinateを変更しないpresentation側の簡易smoothingを追加検討する。

逆符号filletがstraight長0で直接接触する構造は §14 により禁止する。これにより \(+\kappa\rightarrow-\kappa\) のmetric jumpを同一点で発生させない。

straight↔fillet境界に残る単一のmetric変化は本core geometryの許容範囲とし、想定 \(l_{\rm cam}\) envelopeでcompiler stress testを通す。

---

# 38. Camera vertical position

camera base heightを、

\[
Y_{\rm base}
=
Y_{\rm camera}(s_{\rm cam})+h
\]

とする。

ただし急なcrestやdipでplayerが画面外へ飛ばないよう、player vertical framingを追加する。

playerを希望screen Y、

\[
y_{\rm player,target}
\]

へ置くために必要なcamera heightを、

\[
Y_{\rm frame}
=
Y_{\rm car}
-
\frac{D_{\rm cam}}
{f\cos\Phi}
\left(
c_y-f\sin\Phi-y_{\rm player,target}
\right)
\]

とする。

補正量、

\[
\Delta Y_{\rm frame}
=
Y_{\rm frame}-Y_{\rm base}
\]

をLPFし、上限を設ける。

最終的に、

\[
\boxed{
Y_{\rm cam}
=
Y_{\rm base}
+
clamp(
LPF(\Delta Y_{\rm frame}),
-\Delta Y_{\max},
+\Delta Y_{\max}
)
+
\Delta Y_{\rm sprung}
}
\]

とする。

playerを完全固定するのではなく、追従量を制限することで地形による上下動を残す。

\(\Delta Y_{\rm sprung}\) は意図的にframing feedbackの**外側**へ加算する。したがってsprung motionによる数pixel程度のplayer vertical motionは完全には打ち消さない。

これはchase-viewのbody / camera motionを残すための仕様であり、framing誤差として再補正しない。

---

# 39. Camera pitch

camera pitchは、

\[
\boxed{
\Phi
=
\phi_{\rm base}
+
k_\phi\phi_{\rm sprung}
}
\]

とする。

camera rollは0。

本rendererのpitchは通常3D camera rotationではない。

主作用は、

- horizon上下移動
- height差のscreen Y変換

である。

俯角を増やしたからといって通常3Dのように手前の地面が大きく見えるわけではない。

これは意図的なpseudo-3D表現である。

---

# 40. Pseudo projection

画面座標を、

```text
x : 右向き正
y : 下向き正
```

とする。

objectのpseudo-depthを、

\[
\boxed{
d
=
wrapSigned(s_{\rm obj}-s_{\rm cam})
}
\]

とする。

rendererへ投入するobject / terrainは、§44 のvisible intervalへcamera-localにunwrapしたうえで、このsigned cyclic depthを共通使用する。

\[
u=\frac1d
\]

camera right vectorを、

\[
r_{\rm cam}
\]

とする。

cameraからobjectまでの横方向距離を、

\[
X_r
=
(P_{\rm XZ}-P_{\rm cam,XZ})
\cdot r_{\rm cam}
\]

高さ差を、

\[
V
=
Y-Y_{\rm cam}
\]

とする。

screen projectionは、

\[
\boxed{
x
=
c_x
+
fuX_r
}
\]

\[
\boxed{
y
=
c_y
-
f\sin\Phi
-
fuV\cos\Phi
}
\]

\[
\boxed{
scale
=
fu
}
\]

とする。

これがrenderer全体で使用する唯一のpseudo projectionである。

---

# 41. Horizon

camera horizonは、

\[
\boxed{
y_h
=
c_y-f\sin\Phi
}
\]

とする。

用途は、

- Far Background vertical anchor
- camera framing上の基準

である。

terrain描画をhorizonでclipしてはならない。

上り坂ではterrainがhorizonより上へ出てもよい。

---

# 42. Straight road yaw

直線道路に対し、

\[
\theta
=
\psi_{\rm cam}
-
\psi_{\rm road}
\]

とする。

camera lateral位置を含めると、

\[
\boxed{
x
=
c_x
-
f\sin\theta
+
\frac fd
(l-l_{\rm cam})
\cos\theta
}
\]

となる。

したがってbaseline yaw shift、

\[
-f\sin\theta
\]

はdepth非依存である。

ただしreference line \(l=0\) 自体のscreen Xは、camera lateral位置が0でない場合、

\[
x_{\rm ref}
=
c_x-f\sin\theta
-
\frac fd l_{\rm cam}\cos\theta
\]

であり、厳密にはdepth依存項を持つ。`c_x - f sinθ` を「道路中心が常に存在するX」と読み替えてはならない。

本方式のyaw responseは通常perspective cameraの、

\[
x_{\rm perspective}
\propto
-f\tan\theta
\]

とは異なり、

\[
x_{\rm pseudo}
\propto
-f\sin\theta
\]

である。

したがって高yawでは通常透視より横shiftが圧縮される。例えば \(45^\circ\) では、

\[
\frac{\sin45^\circ}{\tan45^\circ}
\simeq0.707
\]

で、通常透視より約29%小さい。

さらに \(|\sin\theta|\le1\) なのでyaw shift自体は発散しない。

これは誤差補正の対象ではなく、**大yawでも画面を破綻させにくくする意図的なSuper Scaler的compression**とする。

baselineとして \(l=l_{\rm cam}=0\) を考え、reference lineを画面中心から横margin \(M_x\) 内へ保ちたいdesign yawを \(\theta_{\rm design}\) とすれば、

\[
\boxed{
f|\sin\theta_{\rm design}|\le M_x
}
\]

をprojection parameter選定の目安として使える。

これはvehicle physics上の「ドリフト可能角」を制限する式ではなく、**想定yawをどの程度画面内へ収めたいかというpresentation envelope**である。

---

# 43. Road edge projection

compile済みroad edgeを直接projectionできる。

screen road widthは、

\[
\boxed{
W_{\rm screen}
=
\frac fd
[
(P_{\rm roadR}-P_{\rm roadL})
\cdot r_{\rm cam}
]
}
\]

通常segmentでは、

\[
W_{\rm screen}
=
\frac fd
W\cos\beta
\]

となる。

\[
\beta
=
\psi_{\rm road}-\psi_{\rm cam}
\]

である。

\(\beta\to90^\circ\) ではroad widthは0へ潰れる。

発散はしない。

ただしroad edge polyline自体を独立したpolygon / line geometryとしてscreenへ二重描画する必要はない。

road edgeの主用途は、

- compiler geometry validation
- road / surface authoring基準
- screen-space road width評価
- GroundMap上のroad region生成

である。

最終的なroad appearanceは原則GroundMap断面の一部として描く。

---

# 44. Forward visibility

forward visibilityはRaster roadのlevel-0 headingとnear / far depth clipから決める。

camera-localなunwrapped chainageでnear側を、

\[
\boxed{
s_{\rm visibleStart}
=
s_{\rm cam}+d_{\min}
}
\]

とする。

cameraからfar方向へlevel-0 Raster roadを辿り、

\[
\beta(s)
=
\psi_{\rm road}(s)-\psi_{\rm cam}
\]

として、最初に、

\[
\boxed{
\cos\beta\le0
}
\]

となる地点までをheading由来のforward limitとする。

far側は、

\[
\boxed{
s_{\rm visibleEnd}
=
\min\left(
s_{\rm first\ facing\ cutoff},
s_{\rm cam}+d_{\max}
\right)
}
\]

とする。

したがって通常のforward Terrain / World Sprite passが扱うintervalは、

\[
\boxed{
s_{\rm visibleStart}
\le
s
\le
s_{\rm visibleEnd}
}
\]

である。

同値にpseudo-depthでは、

\[
\boxed{
d_{\min}
\le
d
\le
d_{\max}
}
\]

を要求する。

\(d<d_{\min}\) のterrain / road / world spriteはnear clipする。

\(d>d_{\max}\) のterrain / road / course sprite / dynamic spriteはheadingにかかわらず描画しない。

また、visible interval内ではlevel-0 Raster headingについて、

\[
\cos\beta>0
\]

を満たす。

camera直前のforward candidateですでに、

\[
\cos\beta\le0
\]

である場合、または、

\[
s_{\rm visibleStart}>s_{\rm visibleEnd}
\]

である場合、forward visible intervalは空でよい。

このときframe全体が消えるわけではない。§72 の順序により、

- Far Background
- Player Sprite
- HUD

は通常どおり残り、forward Terrain / World Sprite passだけをskipする。

vehicle yawはclampしないため、spinや極端なdriftでこの状態へ入ることはphysics上許容する。

rendererはforward-onlyであり、core pathへrear-facing geometry処理を混在させない。

必要ならartist tuningとして、

\[
\cos\beta<\epsilon_\beta
\]

で早めにfade / cutしてよいが、これはcore requirementではない。

---

# 45. Road Generator

segment内部では、

- XZ
- Y
- road edge
- ground edge

がpseudo-depthに対して一次である。

したがって、

\[
x=a_x+b_xu
\]

\[
y=a_y+b_yu
\]

となる。

\(|b_y|\) が通常範囲なら \(u=1/d\) を消去でき、

\[
\boxed{
x=C_x+D_xy
}
\]

となる。

つまり、

> **1つのgeometry segmentの各edgeはscreen上で厳密な直線**

である。

これは近似ではない。

segment内のrender heightを、camera固定frame内で、

\[
Y_{\rm render}(d)=Y_0+g_{\rm seg}d
\]

と書く。

ここで \(g_{\rm seg}\) はangleではなく、

\[
\boxed{
g_{\rm seg}=\frac{dY_{\rm render}}{ds}
}
\]

というdimensionlessな縦断勾配比である。

\(Y_0\) はそのlinear segmentを \(d=0\) まで外挿したheight interceptである。

すると、

\[
y
=
y_h
-fg_{\rm seg}\cos\Phi
-
\frac{f(Y_0-Y_{\rm cam})\cos\Phi}{d}
\]

なので、

\[
\boxed{
a_y
=
y_h-fg_{\rm seg}\cos\Phi
}
\]

はそのsegmentを無限遠へ外挿したときの**asymptotic row**である。

これはglobal horizonではない。上り・下りの勾配に応じて \(y_h\) より上にも下にも移動する。

Road Generatorでは、

- segmentのrow range推定
- clip
- degenerate判定

の補助値としてそのまま利用してよい。

terrainを \(y_h\) や \(a_y\) で一律clipするruleは追加しない。

ただし、

\[
|b_y|<\epsilon_{b_y}
\]

のようにscreen Y方向へ退化する場合、`x = C_x + D_x y` の形へ無理に変形しない。

そのsegmentは §64 のthin-span / single-scanline規則へ送る。

---

# 46. Scanline生成

Road Generatorは各visible segmentからterrain scanline recordを生成する。

概念的には、

```text
TerrainLine {
    d
    s
    y

    x_groundL
    x_groundR

    groundBaseL
    groundBaseR

    textureChunk
    textureS
    lateralStart
    lateralStep
    prefilterLevel
}
```

程度でよい。

`prefilterLevel` は §25 のcompile済みanisotropic prefilterからscanline単位で選択する。

単純markingを §22 のanalytic spanへcompileした場合も、別passを増やさず同じTerrainLine処理中に描く。

analytic spanを可変長listとして全TerrainLine recordへ恒久保持する必要はない。

推奨する単純な経路は、TerrainLineの、

```text
s
```

からcompile済み `MarkingSpanEvent` tableをqueryし、そのscanlineでactiveなlateral intervalだけを取得する方式である。

```text
MarkingSpanEvent {
    s_begin
    s_end
    l0(s)
    l1(s)
    material / coverageRule
}
```

程度の表現でよい。

TerrainLineはfar→nearへ生成するため、通常のforward intervalではqueryする \(s\) は**大から小へ減少する。**

したがってevent tableを \(s\) 昇順で保持する場合、runtime cursorは、

- reverse cursor
- camera-local unwrapped index

のいずれかで単調に処理する。

毎scanlineでtable先頭から再検索しない。

chainage方向に高周波なdash / short markingは §25 の規則によりanalytic eventへせずtexture / decal側へ残す。

Road Generator自体はpixelを描画しなくてもよい。

rendererへ逐次供給してもよい。

---

# 47. Vertical sampling

segment内で、

\[
y=a_y+b_yu
\]

なので、

\[
u(y)
=
\frac{y-a_y}{b_y}
\]

\[
d(y)
=
\frac1{u(y)}
\]

\[
\boxed{
s(y)
=
s_{\rm cam}+d(y)
}
\]

となる。

このchainageから、

- GroundMap
- GroundBase
- Surface region
- geometry width

を取得する。

---

# 48. Horizontal sampling

scanlineのGroundMap左右端を、

\[
x_{gL},
\quad
x_{gR}
\]

とする。

source lateral range、

\[
-g_L
\le
l
\le
g_R
\]

をscreen、

\[
x_{gL}
\le
x
\le
x_{gR}
\]

へaffine mappingする。

通常は、

\[
\boxed{
l(x)
=
-g_L
+
\frac{x-x_{gL}}
{x_{gR}-x_{gL}}
(g_L+g_R)
}
\]

である。

固定scanline内では、

> **lとscreen Xの関係は厳密なaffine**

である。

§44 のvisible intervalでは \(d>0\)、\(\cos\beta>0\) であり、\(g_L+g_R>0\) なので、非退化spanでは、

\[
\boxed{
x_{gL}<x_{gR}
}
\]

が成立する。

fixed-point丸め等でこの差が \(\epsilon_x\) 未満へ縮退した場合だけ、下記のdegenerate ruleへ送る。

したがってinner pixel loopでは、

```text
sourceL += sourceLStep
```

という単純な加算だけで描画できる。

ただし横方向退化として、

\[
\boxed{
|x_{gR}-x_{gL}|<\epsilon_x
}
\]

の場合は上式のdivisionを行わない。

そのTerrainLineのGroundMap部分は、

- skip
- または1pixel代表span

として扱う。

GroundBase_L / GroundBase_Rの左右paint ruleはそのまま適用してよい。

これにより \(\beta\to90^\circ\) 近傍やfixed-point丸めで `lateralStep` が発散することを防ぐ。

---

# 49. Terrainの描画順

terrainは、

\[
\boxed{
far \rightarrow near
}
\]

で描画する。

これは本設計の重要な単純化である。

- terrain envelope
- per-column horizon buffer
- z-buffer

は使用しない。

遠方を先に、近景を後から描く。

近景terrainが遠景terrainを単純に上書きする。

---

# 50. GroundBaseと透明部分

TerrainLineを描画するとき、

```text
left of x_groundL
    GroundBase_L

GroundMap range
    GroundMap

right of x_groundR
    GroundBase_R
```

を描く。

GroundBaseがCOLORならfillする。

TRANSPARENTなら何もしない。

したがって、すでに背後に描かれている、

- Far Background
- farther terrain
- farther sprite

がそのまま残る。

このPainter構造により、

> **崖の透明抜きのための特殊なocclusion処理は一切不要**

となる。

---

# 51. 起伏の遮蔽

起伏により異なるchainageが同じscreen Yへ投影されることがある。

その場合も特別なterrain envelopeは不要である。

far terrainを先に描き、near terrainを後から描くため、

> **near terrainが同じpixelを自然に上書きする。**

これは §5 のnear-plane coverageとは別の原理である。coverageを満たさない場合でも、実際に生成されたnear TerrainLineとfar TerrainLineのPainter関係は正しい。ただしnear planeよりcamera側にTerrainLineが存在しない画面下端では意図しない露出が起こり得る。

GroundBaseがTRANSPARENTな列だけは上書きしない。

したがって、

- hill
- crest
- dip
- cliff opening

すべて同じPainter ruleで処理できる。

ただしTRANSPARENT exteriorはterrain occluderとして機能しない。

near crestのGroundBaseがTRANSPARENTであれば、その外側では、

- Far Background
- farther terrain
- farther sprite

が残る。

したがって丘・crestの外側まで遮蔽したいsceneでは、

- GroundMap stripを必要範囲まで広げる
- GroundBaseをCOLORにする
- course-attached cliff / wall / terrain spriteを配置する

のいずれかをauthoring側で選ぶ。

TRANSPARENTは「崖側に起伏を置けない」という意味ではなく、**そのtransparent span自体にはnear terrainの遮蔽能力がない**という意味である。

---

# 52. World spriteとの合成

world spriteもterrainと同じpseudo-depthを使用する。

world sprite listを、

\[
d
\]

の大きい順、

\[
far\rightarrow near
\]

にsortする。

TerrainLineもfar→nearで生成する。

この2つをdepth順にmergeして描画する。

概念的には、

```text
while terrain or sprite remains:

    if terrain is farther:
        draw terrain line

    else:
        draw sprite
```

とする。

同一depthなら、

```text
terrain
↓
sprite
```

の順とする。

これによりspriteは自分が立っている地面の上に描かれ、その後に描かれるnear terrainによって必要部分だけ自然に隠される。

z-bufferは不要である。

---

# 53. Course-attached sprite

authoring時には、

```text
(s, l, Y)
```

を使用してよい。

地表へ接地するobjectについては、

```text
(s, l, groundOffset)
```

としてauthoringし、compilerで、

\[
Y
=
Y_{\rm render}(s)+groundOffset
\]

へsnapしてよい。

ただしcompilerで最終的に、

```text
CourseSprite {
    X
    Y
    Z
    s_render
}
```

へ展開しておく。

非接地object、tunnel ceiling、bridge structure等は任意の `Y` を保持する。

runtimeでLOD geometryからpositionを再計算しない。

これにより、

- guardrail
- tree
- sign
- building
- spectator
- tunnel structure

がgeometry simplificationによって跳ねることを防ぐ。

---

# 54. Dynamic sprite

dynamic objectの正本はworld座標。

```text
DynamicSprite {
    X
    Y
    Z

    guideSegmentPrev
}
```

renderer投入時にGuide Curveから、

```text
s_render
```

を求める。

このworld→Guide Curve変換にも§15をそのまま適用する。

すなわち各dynamic objectは前frameのGuide segment indexを保持し、

- previous segment
- adjacent segment

を優先するlocal continuity searchを行う。

通常frameでglobal nearest searchを使用しない。

respawn / teleport / spawn直後など、明示的な初期化時だけglobal searchを許す。

これによりhairpin等のmedial axisをdynamic objectが跨いでも、`s_render` が非隣接segmentへ突然jumpすることを防ぐ。

その上で、

\[
d
=
wrapSigned(s_{\rm render}-s_{\rm cam})
\]

を使用する。

---

# 55. Sprite anchor

spriteのworld anchorはroadと同じpseudo projectionを使用する。

\[
\boxed{
x_{\rm anchor}
=
c_x
+
\frac fdX_r
}
\]

\[
\boxed{
y_{\rm anchor}
=
c_y
-
f\sin\Phi
-
\frac fd
(Y-Y_{\rm cam})
\cos\Phi
}
\]

とする。

各SpriteAssetはbitmap内部のanchor位置を持つ。

```text
SpriteAsset {
    width
    height
    anchorX
    anchorY
}
```

source bitmap座標は**texel-center convention**で統一する。

```text
source texel center:
    x = 0, 1, ... width-1
    y = 0, 1, ... height-1
```

`anchorX`, `anchorY` はこの連続source座標系で表す。integer値はtexel centerを意味し、boundary座標とは混在させない。

既定anchorは**最下段の幾何学的中央**とし、

\[
\boxed{
anchorX=\frac{width-1}{2}
}
\]

\[
\boxed{
anchorY=height-1
}
\]

とする。

source texel center \((i,j)\) のscreen位置は、

\[
\boxed{
x(i)
=
x_{\rm anchor}
+
scale\,(i-anchorX)
}
\]

\[
\boxed{
y(j)
=
y_{\rm anchor}
+
scale\,(j-anchorY)
}
\]

である。

rectangle boundaryを必要とするblitterでは、左上boundaryを、

\[
x_{\rm left}
=
x_{\rm anchor}
-
scale\left(anchorX+\frac12\right)
\]

\[
y_{\rm top}
=
y_{\rm anchor}
-
scale\left(anchorY+\frac12\right)
\]

とする。

vehicle yaw variant / bank variant / animation frame間では、同じworld contact pointが揺れないようanchor semanticを統一する。絵柄ごとの足元位置差はper-frame anchor offsetで吸収してよい。

§53 の `groundOffset` はworld-space Y offsetであり、このbitmap内anchorとは別概念である。

---

# 56. Sprite bitmap

sprite bitmap内部は3D再投影しない。

\[
\boxed{
scale_X
=
scale_Y
=
\frac fd
}
\]

とする。

§55 のbitmap anchorもこのuniform scaleだけでscreenへ変換する。

したがって、

- arbitrary rotationなし
- anisotropic scaleなし
- perspective warpなし
- arbitrary alphaなし

である。

sprite transparencyは0/1。

---

# 57. Sprite scale_Yについて

terrain anchorのvertical projectionには、

\[
\cos\Phi
\]

が入る。

しかしsprite bitmap自体のvertical scaleには入れない。

つまり、

\[
scale_Y
=
\frac fd
\]

のままとする。

これは意図的な非整合である。

> **camera pitchによってsprite bitmapを縦につぶさない。**

Super Scaler的な見た目を維持するための仕様であり、バグとして修正してはならない。

このためterrainのvertical projectionとの比には `1/cosΦ` 程度の小さな非整合が残る。通常のcamera pitch envelopeでは数%未満を想定し、これを補正するためのsprite anisotropic scaleは追加しない。

---

# 58. Sprite yaw

sprite bitmapそのものをruntime回転しない。

vehicleやobjectのcamera-relative yawに応じ、

```text
sprite angle variant
```

を選択する。

四輪車・二輪車とも同じ方式とする。

playerについて、

\[
\psi_{\rm vehicle}
-
\psi_{\rm cam}
\]

はcamera yaw lagにより0とは限らない。

clampへ達しない定常curveでは概ね、

\[
\psi_{\rm vehicle}
-
\psi_{\rm cam}
\simeq
k_\psi\kappa D_{\rm cam}
\]

となる。

実際のcamera lagは §35 の、

\[
|\Delta\psi_{\rm lag}|\le\theta_{\rm lag,max}
\]

で制限する。

したがってplayerも複数yaw spriteを持つ。

二輪車でbank表現を行う場合もruntime rotationは追加しない。

代わりにassetを、

```text
spriteVariant[yawVariant][bankVariant]
```

という2次元variantとして持つ。

二輪のbankVariant選択にはvehicleのbank / roll stateを利用してよい。

四輪車の `sprung_roll` はphysics stateとして保持するが、core rendererでは直接使用しなくてよい。四輪のbody roll表現を追加する場合もruntime rotationではなくoptional asset variantとして実装する。

したがって二輪車のsprite budgetでは、四輪車よりvariant総数が増えることを見込む。

---

# 59. 同一sの意図的歪み

course-attached objectは、同じchainageならlateral位置にかかわらず同じpseudo-depthを持つ。

したがって、

```text
same s
→ same d
→ same scale
```

である。

例えばhairpin内側の木がEuclidean distanceではcameraへ近くても、道路中心と同じchainageなら同じscaleになる。

これは通常3Dから見れば誤差である。

しかし本rendererでは、

> **絶対に補正しない。**

これを補正するとrendererの原則そのものが崩れ、通常3Dへ近づくためである。

authoring guidelineとして、極端に大きな `|l|` へ重要spriteを配置しない。

---

# 60. Player sprite

player carは、

\[
d=D_{\rm cam}
\]

でほぼ固定される。

player spriteは通常、

- terrain
- world sprite

の後に描画する。

playerの下半分をroad crest等で厳密に遮蔽する処理はcore rendererでは行わない。

chase-view arcade表現を優先する。

---

# 61. Race progress

幾何学上の、

\[
s_{\rm car}
\]

と、ゲーム上のprogressを分離する。

```text
s_car
    world→course chartから得る幾何chainage

GeometricCoursePosition
    lap + s_localによるclosed-course上の幾何位置表現

s_progress
    race rule上のvalidate済み進捗
```

とする。

`s_progress` は、

- checkpoint sequence
- lap index
- reverse detection
- shortcut validation

を通した値とする。

順位・lap判定にraw `s_car` を直接使用しない。

したがって §5 の `GeometricCoursePosition` と `s_progress` は二重定義ではない。

前者はgeometry、後者はgameplay ruleの正本である。

---

# 62. Forward-only

rendererは、

\[
\boxed{
d>0
}
\]

のみを対象とする。

仕様外は、

- rear-view mirror
- rear camera
- 継続的逆走時の後方course描画

である。

逆走そのものはvehicle physics上可能でよい。

ただしrendererの通常cameraはforward-onlyとする。

したがって §44 のとおり、cameraが直前のforward course segmentへ90°以上背を向けた状態では、forward Terrain / World Sprite passが空になってよい。

これはrenderer failureではなくforward-only coreの定義された縮退動作である。

spin / reverse中に別の見せ方が必要ならcamera presentationまたは別renderer modeとして追加し、このcore pathへrear-facing geometry処理を混在させない。

---

# 63. LOD方針

core specificationでは階層LODを必須としない。

理由は、

- 320×240
- 1 chainage → 1 scanline
- visible road geometryは数百segment程度
- pixel処理量の方が支配的

だからである。

まずlevel-0 geometryだけで実装する。

必要になった場合のみ、

> **同じs intervalを保ったcompile済みgeometry decimation**

を追加してよい。

これはsemantic featureではなくoptimizationとする。

coordinate chart、physics、object position、forward visibilityは常にlevel-0を正本とする。

---

# 64. 退化segment

segment端を、

\[
u_0,u_1
\]

とすると、

\[
\Delta y
=
|b_y||u_1-u_0|
\]

である。

\[
\boxed{
\Delta y
<
\epsilon_{\rm span}
}
\]

なら、

- 単一scanline
- または省略可能なthin span

として扱う。

single-scanlineへcollapseする場合、そのrowが代表する**clipped chainage interval全体**をfilter footprintへ含める。

collapse対象のchainage端を \(s_0,s_1\) とし、

\[
\boxed{
\Delta s_{\rm collapse}
=
|s_1-s_0|
}
\]

とする。

§25 のprefilter level選択には、

\[
\boxed{
\Delta s_{\rm eff}
=
\max(
\Delta s,
\Delta s_{\rm collapse}
)
}
\]

を使用する。

target design envelope内のnon-optional thin spanについて必要levelが \(k_{\max}\) を超える場合、compilerはprefilter levelを追加するかvalidation errorとする。

省略可能なthin spanだけは、必要levelが上限を超える場合にrow自体をskipしてよい。

far geometryのために複雑なgeometry LODを用意する前に、このscreen-space collapseを使用する。

---

# 65. Runtimeでdivisionを減らす

数式上は、

\[
u=\frac1d
\]

を使用する。

ただしpixel inner loopでdivisionしてはならない。

実装では、

- reciprocal lookup table
- fixed-point reciprocal
- segment setup時だけdivision
- incremental affine stepping

を使用できる。

GroundMap横samplingはscanline内で完全affineなので、

```text
src += srcStep
```

だけで処理できる。

---

# 66. 数値形式

仕様上、runtimeでfloat64を必須としない。

推奨は、

```text
Editor / Compiler
    float64

Runtime
    fixed point または float32
```

である。

当時相当の実機を意識する場合は、

- chainage
- world coordinate
- projection parameter
- texture coordinate

をfixed point化してよい。

lap countは整数で分離する。

これにより巨大なunwrapped doubleを保持する必要がない。

---

# 67. 描画計算量

320×240では画面pixel数は、

\[
320\times240
=
76,800
\]

pixelである。

本rendererの主要処理は、

1. visible geometryを数十〜数百segment処理
2. TerrainLine生成
3. 各TerrainLineをhorizontal span転送
4. scaled sprite転送

である。

Painter方式では起伏によって複数のTerrainLineが同じscreen rowへ重なり得るため、terrainもoutput pixel budgetを持つ。

少なくとも、

```text
terrainLineCount <= N_terrainline,max
terrainOutputPixelsPerFrame <= P_terrain,frame,max
terrainOutputPixelsPerScreenRow <= P_terrain,row,max

visibleSpriteCount <= N_sprite,max
spriteOutputPixelsPerFrame <= P_sprite,frame,max
spriteOutputPixelsPerScanline <= P_sprite,line,max
```

をtarget hardware profileで定義する。

`terrainOutputPixels` は、GroundBase COLOR fillおよびGroundMap span転送として実際に処理するoutput sample数を数える。GroundBase TRANSPARENTでskipしたspanは含めなくてよい。

terrain budgetはtarget profileの**content / compiler validation budget**とする。runtimeでbudgetを超えたことだけを理由にnon-optional TerrainLineを任意に捨ててはならない。

budget超過courseは、

- authoring修正
- thin-span skip
- compile済みgeometry decimation
- texture / GroundBase構成の見直し

によってtarget profileへ収める。runtimeではcounter / assert / telemetryとして監視してよい。

terrainのstress caseには、

- crest / dipが短い間隔で連続する区間
- 複数segmentが同じscreen rowへ重なる区間
- GroundBase COLORが広い区間

を含める。

spriteのstress caseには、近距離tunnel interior / portal通過を含める。

tunnel遠方の坑内・奥壁・遠い照明等はtunnel interior用Far Backgroundへ置換できるため、sprite output budgetを消費しない。

budgetを超える場合は、

- off-screen clipping
- thin-span collapse / skip
- optional geometry decimation
- distance / priorityによるsprite cull
- animation / variant sharing
- optional sprite LOD

を使用してよい。

このためにz-bufferや3D polygon rendererを導入しない。

target hardwareに要求するGroundMap用の最小primitiveは、

> **1本のhorizontal destination spanに対し、indexed sourceを任意のsource始点と固定stepで読み、palette変換してRGB555相当framebufferへ書けるline scaler**

である。

概念的には、

```text
src = srcStart

for each output pixel:
    index = source[src]
    dst   = palette[index]
    src  += srcStep
```

である。

hardwareがこのprimitiveを持たない場合はCPUで同じinner loopを実行し、そのcostは `P_terrain,frame,max` / `P_terrain,row,max` に含める。

GroundMap horizontal samplingはscanline内でaffineなので、per-pixel divisionやmatrix演算は必要ない。

不要なものは、

- triangle setup
- perspective-correct UV interpolation
- depth buffer
- per-pixel depth test
- per-pixel 3D matrix multiplication
- texture polygon clipping

である。

設計目標は、

> **1990年代の32-bit CPUに、line scaler / sprite scaler / blitter相当を組み合わせても成立し得る処理構造**

とする。

---

# 68. 表現規格

基本画面は、

```text
320 × 240
4:3
60fps
RGB555相当
```

とする。

spriteは基本、

```text
16色
15色 + transparent
0/1 transparency
```

とする。

GroundMap・Far Backgroundはspriteではないため、sprite単位16色制限を必須としない。

ただしメモリ・帯域削減のため、

- 8bit indexed texture
- palette conversion
- RGB555 framebuffer

等を使用してよい。

任意alpha blendingをrendererの基本機能にはしない。

---

# 69. Far Backgroundの具体例

海岸崖コースを例とする。

Far Background bitmap：

```text
        空
      遠い雲

----------- horizon -----------

         遠い水平線
~~~~~~~~~~ 海 ~~~~~~~~~~
       遠い島
```

terrain：

```text
左 GroundBase = TRANSPARENT

GroundMap =
    cliff edge
    shoulder
    road
    shoulder

右 GroundBase = rock / grass
```

すると左側では、

```text
Far Backgroundの海
```

が直接露出する。

崖壁が必要なら、

```text
course-attached cliff sprite
```

を配置する。

このため海面をGroundMap上で道路と同一高さへ無理に置く必要がない。

---

# 70. 平地の具体例

草原コース：

```text
Far Background
    空＋遠山

GroundBase_L
    grass green

GroundMap
    grass
    shoulder
    asphalt
    road markings
    shoulder
    grass

GroundBase_R
    grass green
```

Far Background下半分は通常terrainに隠れる。

---

# 71. 上り坂の具体例

前方road heightがcameraより高い場合、

\[
V>0
\]

なので、

\[
y
=
y_h
-
\frac fdV\cos\Phi
\]

から、

\[
y<y_h
\]

となる。

つまりterrainはhorizonより上へせり上がる。

これは正常である。

Far Backgroundはそのterrainによって後から上書きされる。

「horizonより上は必ず空」というruleは存在しない。

---

# 72. Painter ordering

最終的な画面合成は、

```text
1. Clear SkyColor
   §33の条件でFar Backgroundが全画面を不透過に覆う場合は省略可

2. Far Background
   ├─ horizon above
   └─ horizon below

3. Terrain + World Sprite
   far → near Painter pass

4. Player Sprite

5. HUD
```

である。

Terrain pass内部では、

```text
GroundBase_L
GroundMap
GroundBase_R
```

を同じTerrainLineとして描く。

これが画面構造の最終定義である。

---

# 73. Course Compiler

Course Compilerは以下を行う。

## Geometry

- heading event統合
- Raster reference line積分
- closed-loop検証
- XZ自己交差検証
- road band重複検証
- \(\Delta_{\max}\) 検証
- road left/right edge生成
- ground left/right edge生成
- miter / edge接続検証
- ground band intersection / inversion / overlap検証
- \(L_{\rm course}>2d_{\max}\) 検証
- \(0<d_{\min}<D_{\rm cam}<d_{\max}<L_{\rm course}/2\) 検証
- circular-authoring metadataがある場合は \(R_c\) / chord angleを保持

## Guide Curve

- local circular fillet生成
- 一般polylineでは \(R_i=R_{\min,i}\) fallback
- circular-authoringでは \(R_i=R_{c,i}\cos(|\Delta_i|/2)\) を自動適用
- \(R_i\ge R_{\min,i}\) 検証
- metric検証
- \(t_i+t_{i+1}\le L_i\) overlap検証
- 逆符号fillet対では \(L_{{\rm straight},i}\ge D_{\rm cam}\) 検証
- G¹ continuity検証
- periodic closure検証
- Raster vertexとの最大乖離 \(\delta_{\rm guide}\) 算出
- circular-authoring時のsource円との乖離 \(\delta_{\rm source}\) 算出
- local chart adjacency情報生成
- drivable SurfaceMap lateral envelopeが \(|l|_{\max}\) 内にあることを検証
- \(R_{\min}>|l|_{\max}\) 由来のtight-corner / lateral-envelope trade-off report
- 想定 \(l_{\rm cam}\) envelopeに対する \(J\) range算出
- camera XZ motion stress test用metadata生成

## Height

- source height読込
- Y_phys生成
- Y_camera生成
- Y_render adaptive approximation
- `d = D_cam` を原則とするrender / physical screen error検証
- near側 \(D_{\rm cam}/d\) error倍率のreport
- closed-loop continuity検証
- near terrain screen-bottom coverage検証
- 最大上り勾配を含む§5のnear-plane coverage envelope検証

## Ground

- GroundMap logical layer生成
- Surface Region生成
- `VOID` を含むSurfaceMap生成
- chunk bake
- Road Generatorと同じmappingで、\(d_{\min},d_{\max},f,h,\Phi\)、grade、forward heading、thin-span collapseを含む \(\Delta s_{\rm eff}\) / \(\Delta l\) range算出
- 既定 \(d_0=D_{\rm cam}\) とし、target profileで変更する場合はnear-field magnificationを検証
- \(d_0\) から \(q_l,q_s,\rho_l,\rho_s\) 自動導出
- unique textureを仮定した \(d_0^{-3}\) base-memory上限見積り
- 必要anisotropic prefilter段数算出
- 1本のanisotropic prefilter生成
- runtime levelはchainage footprint \(k_s\) のみで選択し、\(k_l\) はdiagnosticとする
- non-optional TerrainLineの必要levelが \(k_{\max}\) 内に収まることを検証
- optional analytic lateral span生成
- chainage高周波markingをanalytic span対象から除外
- subpixel analytic spanのcoverage rule metadata生成
- GroundBase event compile
- visual transparencyとphysical VOIDの独立性検証

## Background

- sourceHorizonY metadata保持
- source→screen scaleを含むeffective `K_bg` 算出
- baselineとして \(K_{\rm bg}=f\) を検証可能
- horizon下contentをvery-far terrainとしてauthoringするためのpreview / warningを提供可能
- background transition table生成
- tunnel interior用Far Backgroundを使用する場合のtransition検証

## Object

- course-attached objectのworld anchor生成
- ground-attached objectの `Y_render(s)` snap
- s_render保持
- SpriteAsset bitmap anchor検証
- yaw / bank / animation variant間のanchor consistency検証可能
- tunnel portal aperture / near interior sprite rule検証可能
- sprite variant metadata生成

## Budget

- GroundMap / prefilter memory見積り
- sprite variant memory見積り
- TerrainLine count / terrain output pixel budget検証用metadata生成
- 起伏密集区間をterrain overdraw stress caseとして評価
- visible sprite / sprite output pixel budget検証用metadata生成
- tunnel interior / portal close-upをsprite output pixel stress caseとして評価
- tunnel遠方をFar Backgroundへ逃がした場合のsprite budget reductionを評価可能

---

# 74. Runtime pipeline

runtimeは以下とする。

```text
1. Vehicle physics update
   SurfaceMapがVOIDなら支持surfaceなしとして扱う

2. player world → Guide Curve local search
   s_car, l_car取得
   前frameからのlocal continuityを優先

3. dynamic object local chart update
   各objectのprevious Guide segmentからs_render取得
   通常frameではglobal nearestを使わない

4. race progress update

5. camera update
   s_cam
   l_cam
   yaw + yaw-lag clamp
   height
   pitch

6. horizon算出

7. §33で必要な場合のみclear SkyColor

8. active Far Background選択・描画
   outdoor / tunnel interior等をbackground transition ruleで切替

9. level-0 forward visibility判定
   visibleStart = s_cam + d_min
   visibleEnd   = min(heading cutoff, s_cam + d_max)
   intervalが空ならforward terrain/world passをskip

10. visible Raster geometry走査
    d_min <= d <= d_max の範囲だけを対象とする

11. TerrainLineをfar→near生成
    scanlineごとにDelta_s_effを求め
    chainage footprintからprefilterLevelを選択
    terrain budget counterを更新
    non-optional TerrainLineはbudget超過だけを理由にdropしない

12. world spriteをbudget適用後、dでfar→near sort
    d_min <= d <= d_max の範囲だけを対象とする

13. TerrainLineとworld spriteを
    d順にmergeしてPainter描画
    TerrainLine.sからactive MarkingSpanEventをreverse cursor等でquery
    analytic GroundMap spanも同じTerrainLine内で処理

14. player sprite描画

15. HUD
```

これ以上のpassをcore rendererには増やさない。

---

# 75. 当時実機を意識した禁止事項

core rendererへ以下を安易に追加しない。

- z-buffer
- terrain polygon mesh
- perspective-correct texture
- arbitrary camera roll
- sprite free rotation
- sprite perspective warp
- per-pixel lighting
- normal mapping
- arbitrary alpha
- full 3D background geometry
- lateral depth correction
- Euclidean distanceによるsprite scale補正

これらは一つずつは小さく見えても、積み重ねると本方式が通常3D rendererへ変質する。

---

# 76. 絶対に外さない原則

1. Physicsの正本はworld座標。
2. Vehicleを道路へ拘束しない。
3. 描画は最後までraster pseudo-3D。
4. 1 chainageは1 horizontal scanline。
5. pseudo-depthはsigned cyclic chainage差 `wrapSigned(s_obj-s_cam)`。
6. 全描画物が同じpseudo-depthを共有する。
7. dへcamera-space Z補正を入れない。
8. lateral位置によるdepth補正を入れない。
9. 同一dなら同一scale。
10. 同一d・同一heightなら同一screen Y。
11. roadは直線segment集合。
12. vertex折れ角は10°以下。
13. Raster road自体をsmooth polygon化しない。
14. Guide Curveは座標取得とcamera専用。
15. Guide Curveも同一global sを共有する。
16. Guide Curve horizontal geometryはG¹を要求し、strict C¹ / C²化をcore requirementにしない。
17. 一般polylineのGuide radiusは \(R_{\min}\) fallback、circular-authoringだけ既知 \(R_c\) から自動拡大する。
18. road widthは左右独立。
19. GroundMap widthも左右独立。
20. \(g_L\ge w_L\)、\(g_R\ge w_R\) はhard requirement。
21. GroundMap visual幅をGuide chartの \(|l|_{\max}\) へ機械的にclampしない。
22. 通常走行で支持surfaceを返すSurfaceMap lateral envelopeはGuide chart安全域内へ置く。
23. \(R_{\min}>|l|_{\max}\) によるtight-corner / drivable-width trade-offを隠さない。
24. GroundMapは `(s,l)` のコース断面texture。
25. GroundMapはlateral heightを持たない。
26. GroundMap横座標はmeter基準。
27. Surface物理も `(s,l)`。
28. GroundBaseは左右独立。
29. GroundBaseはCOLORまたはTRANSPARENT。
30. GroundBaseは独立layerではない。
31. TRANSPARENTはpixelを書かない。
32. Far Backgroundはhorizon上下を含む1枚絵。
33. horizonはbackground anchorでありterrain clipではない。
34. Far Backgroundのhorizon下もvery-far terrainとして破綻しないようauthoringする。
35. Far Backgroundはroadのsine yawと全yaw厳密一致させず、forward局所scaleだけ合わせる。
36. tunnel等の遠方内部は既存Far Background transitionへ逃がしてよい。
37. terrainはfar→near Painter描画。
38. world spriteも同じPainter順へ統合する。
39. terrain envelopeを使用しない。
40. z-bufferを使用しない。
41. sprite anchorだけpseudo projectionする。
42. sprite bitmap内部を3D再投影しない。
43. sprite bitmapには明示的なbitmap anchorを持つ。
44. sprite rotationを行わない。
45. sprite scaleにpitch cos補正を入れない。
46. camera rollを使用しない。
47. forward visibilityはlevel-0 Raster headingと \(d_{\min},d_{\max}\) の両方でclipする。
48. rendererはforward-only。
49. extreme spinでforward visible intervalが空になることを許容する。
50. course wrapはsigned cyclic depthで処理する。
51. \(d_{\max}<L_{\rm course}/2\)。
52. `s_car` と `s_progress` を分離する。
53. runtime float64を要求しない。
54. pixel inner loopではaffine加算を基本とする。
55. 通常3Dへ近づける修正を「高精度化」と呼んで安易に導入しない。
56. \(Y(s,l)=Y(s)\) は「1 chainage → 1 scanline」の前提であり、§48の横affine mappingを成立させる。
57. 通常走行中のworld→course変換はplayer / camera / dynamic objectすべてでglobal nearestではなく前frameからのlocal continuityを優先する。
58. chart安全域外でもworld physicsをclampしない。
59. `GroundBase = TRANSPARENT` と `SurfaceMap = VOID` を同一視しない。
60. GroundMap遠方filterはcompile済みanisotropic prefilterを基本とし、高価なruntime anisotropic filteringを要求しない。
61. GroundMap base densityは原則 \(d_0\) 1個から \(q_l,q_s\) を導出する。
62. core GroundMap LODは1本のanisotropic pyramidとし、levelはchainage footprintで選ぶ。2次元LOD tableを標準化しない。
63. GroundMapの既定は \(d_0=D_{\rm cam}\)。prefilter段数は実Road Generator envelopeとthin-span collapseを含む \(\Delta s_{\rm eff,max}\) から導出する。
64. simple markingのanalytic span化はGroundMapと意味的に等価なoptimizationであり、別layer / 別passにしない。
65. analytic spanでもsubpixel aliasing対策を行い、chainage高周波markingは原則texture側へ残す。
66. camera yaw clampはcamera lagだけへ適用し、vehicleの自由なyawを制限しない。
67. near terrainが必要なsceneでは `d_min` がscreen-bottom coverageを満たす。
68. ground-attached course spriteは必要に応じ `Y_render(s)` へcompile-snapする。
69. 横・縦の退化spanではdivisionを避け、single-pixel / thin-span ruleへ落とす。
70. terrain処理にはTerrainLine countとframe / screen-row単位のoutput pixel budgetを持つ。
71. sprite処理にはframe / scanline単位のoutput pixel budgetを持つ。
72. tunnelは0/1 transparent aperture、near sprite、Far Background transitionで処理し、専用3D passを追加しない。
73. tunnel close-upをsprite pixel budgetのstress caseとする。
74. 二輪bankはruntime rotationではなくyaw×bankのsprite variantで表現する。
75. 四輪sprung_rollはcore rendererで直接使用しなくてよい。
76. branch / stage progression / AI / collision responseはcore rendererへ混在させず、別仕様とする。
77. 逆符号filletはstraight長0で直接接触させず、少なくとも `D_cam` のstraightで分離する。
78. sprite source coordinateはtexel-center conventionで統一する。

---

# 77. parameter決定順序と依存関係

未確定parameterを独立な一覧として選ばない。

本仕様では、概ね次の順序で決める。

## 77.1 Target display / presentation envelope

最初に、target hardwareと画面上の見せ方を決める。

- screen width / height
- \(c_x,c_y\)
- \(y_{\rm bottom}\)
- 目標frame rate
- framebuffer / texture format
- 通常プレイで見せたいyaw envelope \(|\theta|\le\theta_{\rm design}\)
- reference line / playerを置きたいhorizontal screen-safe range
- playerのtarget screen Y

320×240 / 60fps / RGB555相当は §68 の基本規格とする。

baseline \(l=l_{\rm cam}=0\) でreference lineを中心から \(M_x\) 以内へ置きたいなら、§42より、

\[
f|\sin\theta_{\rm design}|\le M_x
\]

を \(f\) 選定の第一制約として使用できる。

これはphysics上のyaw limitではない。

## 77.2 Gameplay lateral envelope / Road

次に通常走行として支えるlateral範囲を決める。

- 標準 `w_L`
- 標準 `w_R`
- \(|l|_{\rm drivable,max}\)
- 路外をどこまで支持surfaceとして残すか
- `VOID` 開始位置

GroundMapのvisual幅、

- 標準 `g_L`
- 標準 `g_R`
- 最大strip幅

はこの値より広くてよい。

## 77.3 Guide Curve chart

通常走行のdrivable envelopeを含むよう、

\[
|l|_{\max}\ge|l|_{\rm drivable,max}
\]

を決める。

本節の範囲で未確定なのは、

- \(|l|_{\max}\)：暫定12m
- \(m_{\min}\)：暫定0.25

だけである。

cornerごとに、

\[
\mu_i
=
\frac{|\Delta_i|}{2\tan(|\Delta_i|/2)}
\]

\[
R_{\min,i}
=
\frac{|l|_{\max}}
{1-m_{\min}/\mu_i}
\]

を導出する。

必ず、

\[
R_{\min,i}>|l|_{\max}
\]

なので、tight cornerと広いdrivable lateral envelopeは直接trade-offする。

Guide radiusをartist parameterとして追加しない。

- 一般polyline → \(R_i=R_{\min,i}\)
- circular-authoring metadataあり → \(R_i=R_{c,i}\cos(|\Delta_i|/2)\)

とし、後者でも \(R_i\ge R_{\min,i}\) を要求する。

さらに各segmentで、

\[
t_i+t_{i+1}\le L_i
\]

を満たす。

Guide Curveのcontinuity requirementはG¹であり、strict C¹ / C²化をparameter tuningのために導入しない。

## 77.4 Projection / chase camera composition

次に、

- \(f\)
- \(D_{\rm cam}\)
- \(h\)
- \(\phi_{\rm base}\)
- \(y_{\rm player,target}\)

を共同で決める。

player spriteの基本scaleは、

\[
\boxed{
scale_{\rm player}
=
\frac{f}{D_{\rm cam}}
}
\]

なので、\(f\) と \(D_{\rm cam}\) は独立ではない。

また、通常プレイyaw / lateral envelopeについて§36の実projectionを評価し、player anchorがdesign上のhorizontal screen-safe rangeへ入ることを確認する。

さらに \(D_{\rm cam}\) 決定後、§14の逆符号fillet対について \(L_{{\rm straight},i}\ge D_{\rm cam}\) を最終検証する。

## 77.5 Near / far depth

camera / projectionが決まった後、\(d_{\min}\) を§5のcoverageから決める。

flat ground代表値では、

\[
\boxed{
d_{\min}
\le
\frac{fh\cos\Phi}
{y_{\rm bottom}-y_h}
}
\]

である。

代表的な最大上り勾配比を \(g_{\max}\) とするなら、

\[
\boxed{
d_{\min}
\le
\frac{h}
{
 g_{\max}+
 \dfrac{y_{\rm bottom}-y_h}{f\cos\Phi}
}
}
\]

を初期値決定に使える。

等号が与えるのは最大許容 \(d_{\min}\) であり、最終値はcamera envelopeを含む§5一般式で検証する。

\(d_{\max}\) は、

- 必要なvisible distance
- far terrainのscreen collapse
- sprite density / budget
- course全長

から決め、

\[
\boxed{
0<d_{\min}<D_{\rm cam}<d_{\max}<L_{\rm course}/2
}
\]

を満たす。

したがってcourse設計側では、

\[
L_{\rm course}>2d_{\max}
\]

を要求する。

## 77.6 GroundMap texel density / prefilter

\(d_{\min},d_{\max},f,h,\Phi\) envelopeが決まった後、§25からsource footprint rangeを求める。

base densityの既定は、

\[
\boxed{
d_0=D_{\rm cam}
}
\]

とする。

そのうえで、

\[
\boxed{
q_l=\frac{d_0}{f}
}
\]

\[
\boxed{
q_s=\frac{d_0^2}{fh\cos\Phi_{\rm ref}}
}
\]

から、

\[
\rho_l=1/q_l,
\qquad
\rho_s=1/q_s
\]

を自動導出する。

target profileで \(d_0>D_{\rm cam}\) を選ぶ場合は、

\[
M_l=\frac{d_0}{D_{\rm cam}},
\qquad
M_s=\left(\frac{d_0}{D_{\rm cam}}\right)^2
\]

を必ずreportし、player前方のGroundMap detailが許容できることをpreviewで確認する。

全長をunique textureとして持つ上限的なbase-memory見積りは、

\[
N_0\propto d_0^{-3}
\]

である。

memory削減は、まず、

- chunk
- repeating base tile
- decal
- analytic span

で行う。

prefilter pyramidは1本だけとする。

runtime levelはchainage footprintだけで、

\[
k_s
=
\max\left(
\left\lceil
\log_4\frac{\Delta s_{\rm eff}}{q_s}
\right\rceil,
0
\right)
\]

から選ぶ。

大yawで増えるlateral footprintはshared pyramid levelを押し上げない。必要なlateral high-frequency detailはanalytic span / coverage rule / dedicated textureへ逃がす。

Course Compilerはflat-ground式だけでなく、実Road Generatorと同じmappingをtarget envelope全体へ適用し、

- grade
- camera pitch
- near / far clip
- forward heading
- thin-span collapse

を含む \(\Delta s_{\rm eff,max}\) を求める。

必要s方向downsample段数は、

\[
N_{s,\rm down}
=
\max\left(
0,
\left\lceil
\log_4
\frac{\Delta s_{\rm eff,max}}{q_s}
\right\rceil
\right)
\]

で導出する。

non-optional TerrainLineは必要levelを必ず保持する。

analytic markingについては、

- continuous lateral line / band
- subpixel coverage ruleを安価に持てるもの

を優先し、dashや短周期markingはprefilter済みtexture / decalへ残す。

## 77.7 Camera response

geometryとprojectionが決まった後、camera responseを調整する。

未確定値は、

- \(k_\psi\)
- \(\theta_{\rm lag,max}\)
- \(\dot s_{\min}\)
- \(\tau_{\rm lat}\)
- \(l_{\rm cam,max}\)
- \(k_\phi\)
- vertical follow時定数
- \(\Delta Y_{\max}\)

である。

§37のため、想定 \(l_{\rm cam}\) envelopeで \(J\) とcamera XZ motionを確認する。

逆符号filletの直接接触は§14で禁止し、少なくとも \(D_{\rm cam}\) のstraightで分離する。これを満たした上でstraight↔filletの単一metric変化をstress testする。

Guide CurveはG¹を正本とし、strict C¹ / C²化やnonlinear reparameterizationをcamera tuningのために導入しない。

circular-authoringでは大きな \(R_i\) が自動的に得られるため、\(l/R\) 由来のmetric variationは一般polyline fallbackより小さくなる。

## 77.8 Far Background

projectionの \(f\) が決まった後、background angular scaleを決める。

screen-space baselineは、

\[
\boxed{
K_{\rm bg}=f
}
\]

pixels/radianとする。

これはforward近傍のlocal angular scaleを一致させる値であり、roadのsine yaw mappingとpanoramaを全yawで一致させる値ではない。

その上で、

- Far Background bitmap size
- sourceHorizonY
- source panorama horizontal FOV
- source pixels/radian
- source→screen scale
- horizontal wrap
- background transition rule
- outdoor / tunnel interior等のvariant
- full-screen opaque保証の有無
- SkyColor

を決める。

source bitmapのhorizon下もvery-far terrainとして成立するようauthoringする。

## 77.9 Sprite asset / budget

次にasset規格とhardware budgetを決める。

- \(N_{
m terrainline,max}\)
- \(P_{
m terrain,frame,max}\)
- \(P_{
m terrain,row,max}\)
- sprite bitmap anchor既定値 / per-frame offset rule
- sprite yaw variant数
- 二輪bank variant数
- optional四輪body-roll variantの有無
- \(N_{\rm sprite,max}\)
- \(P_{\rm sprite,frame,max}\)
- \(P_{\rm sprite,line,max}\)

terrain budgetは起伏密集区間をworst-case候補として測定する。

sprite budgetは開けたcourseだけで決めず、近距離tunnel interior / portal通過をworst-case候補として測定する。

遠方tunnel interiorはFar Backgroundへ逃がし、近距離spriteだけでworst caseを測る。

## 77.10 Numerical / compiler tolerance

最後に実機profileへ合わせて、

- \(\epsilon_{\rm surface}\)
- compiler geometry tolerance
- fillet contact / overlap tolerance
- \(\epsilon_{\rm span}\)
- \(\epsilon_{b_y}\)
- \(\epsilon_x\)
- GroundMap texture format
- Far Background format
- fixed-point precision

を決める。

§44 の \(\epsilon_\beta\) によるearly fade / cutはartist tuningでありcore specification外なので、このcore parameter dependencyには含めない。

## 77.11 依存関係の要約

最小限の依存関係は、

```text
Target screen / desired yaw presentation
        ↓
        f
        ↓
D_cam ──→ player scale = f / D_cam
   └────→ opposite-sign fillet straight >= D_cam
        ↓
h, Φ, y_bottom, y_h, g_max
        ↓
      d_min

required visible distance + course length
        ↓
      d_max
        ↓
      d_0
        ↓
   q_l, q_s
        ↓
prefilter levels / memory
```

および、

```text
drivable lateral envelope
        ↓
     |l|max
        ↓
      m_min
        ↓
   R_min at each corner
        ↓
 generic polyline: R = R_min
 circular source: R = R_c cos(Δ/2)
        ↓
 overlap / chart validation
```

である。

GroundMap visual width \(g_L,g_R\) はこのchart chainとは独立に広げられるが、実際に生成したground edgeのintersection / inversion / overlap検証を必ず通す。

---

# 78. 最終定義

本方式では道路基準線chainageから、

\[
\boxed{
d
=
wrapSigned(s_{\rm obj}-s_{\rm cam})
}
\]

を共通pseudo-depthとして求める。

すべての描画anchorを、

\[
\boxed{
x
=
c_x
+
\frac fdX_r
}
\]

\[
\boxed{
y
=
c_y
-
f\sin\Phi
-
\frac fd
(Y-Y_{\rm cam})
\cos\Phi
}
\]

\[
\boxed{
scale
=
\frac fd
}
\]

で描画する。

道路と周囲の水平地表は、

\[
\boxed{
GroundMap(s,l)
}
\]

として保持する。

各terrain scanlineでは、

1. screen Yに対応するchainageを求める
2. GroundMap左右edgeを求める
3. GroundBase_Lを左spanへ適用する
4. GroundMap断面を横affine転送する
5. GroundBase_Rを右spanへ適用する

だけでよい。

GroundBaseがTRANSPARENTならpixelを書かない。

背景には、

> **horizonより上と下を一体として持つFar Background bitmap**

がすでに描かれているため、その部分がそのまま露出する。

terrainとworld spriteは、

\[
\boxed{
far\rightarrow near
}
\]

のPainter順に描く。

このため、

- terrain envelope
- per-column depth buffer
- z-buffer

を必要としない。

最終的なrendererは、

> **Optional Clear → Full Far Background → Far-to-Near Terrain/Sprites → Player → HUD**

という単純な構造になる。

そして道路・路外地面・spriteのすべてについて、

> **奥行きは3D camera-space Zではなく、道路chainageだけで決める。**

これを最後まで崩さない。

---

# 79. 本方式の一文定義

> **3D物理で自由に走る車両を、道路chainageを共通pseudo-depthとする水平scanline terrainと拡大縮小spriteだけで描く、Painter型Super Scaler renderer。**

これを本設計の最終的な核とする。
