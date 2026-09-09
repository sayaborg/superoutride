# SUPER OUTRIDE

320×240のラスタ型疑似3Dドライビングゲーム。ブラウザ上で、車とバイクが同じワールド座標・接地・タイヤ・車輪の物理系を使う。

車両の力学・制御仕様はパラメータ以外をfreezeし、次の映像・サウンド・ゲームシステム開発の土台とする。操縦性は `DEV_UNCALIBRATED`。車種別のパラメータ調整と対象端末での性能・操作確認は継続課題。

- [次の作業・再開手順](docs/NEXT.md)
- [現行仕様の一覧](docs/README.md)
- [開発契約](AGENTS.md)
- [監査結果](docs/AUDIT.md)
- [公開ゲーム](https://sayaborg.github.io/superoutride/)

## 実行

Node.js 24を使用する。

```sh
npm ci
npm test
python3 -m http.server 8000
```

`http://localhost:8000/` を開く。`npm run check` は型検査、`npm run build` はESMとGroundMapの生成。

## 操作

左右矢印で操舵、↑またはXでアクセル、↓またはZでブレーキ。タッチは画面左半分で左右に操舵、右半分で上にアクセル・下にブレーキ。指を置いた場所が原点で、64 CSS pxの移動が最大入力。キーボードとタッチは共通の入力調停を使う。

画面のセレクタで車種・コース・調整値を選ぶ。コースのキー1〜4は LINEAR / BRANCHING / TSUKUBA / FISCO。URLはそれぞれ `?mode=linear` / `?mode=branching` / `?mode=circuit` / `?mode=fisco`。省略時はBRANCHING。

現在の調整基準は GX=5、PX=20%、GY=2.5、PY=10%、KN=0.74、D=20°、M=65°、ACT=0.30秒。[調整値の意味と所有者](docs/calibration.md)を参照。

## 構成

`src/core` は開いた座標・射影、`src/physics` は共通車両力学、`src/course` と `src/runtime` はコースのコンパイルと実行中の内容、`src/gameplay` は分岐・ラップ・復帰、`src/render` と `src/visual` は描画、`src/browser` はブラウザUIを所有する。`src/dev` は具体的な試走コースと回帰用の構成データ。

履歴資料はGit履歴で参照する。作業ツリーには現行仕様・実行可能な回帰テスト・再開情報を置く。ファイル名のM番号は識別子であり、古い設計を現行仕様より優先する根拠にはしない。
