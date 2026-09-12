// Single-factor acoustic experiments. No vehicle geometry or engine facts are changed.
export const REFLECTION_CANDIDATES = [
  { label: '現在値', description: '比較基準。共通値を変更しません。', tuning: {} },
  {
    label: 'A：反射を弱く',
    description: '出口反射 −0.68 → −0.35。反射による響きを抑えます。',
    tuning: { outletReflection: -0.35 },
  },
  {
    label: 'B：反射を強く',
    description: '出口反射 −0.68 → −0.90。反射による響きを強めます。',
    tuning: { outletReflection: -0.9 },
  },
  {
    label: 'C：高域を減衰',
    description: '境界フィルター 4,500 → 1,800 Hz。反射波と出口の音色を変えます。',
    tuning: { returnCutoffHz: 1800 },
  },
  {
    label: 'D：管内の損失を増加',
    description: '距離あたりの減衰 0.04 → 0.16 Np/m。長い経路ほど減衰します。',
    tuning: { attenuationPerMeter: 0.16 },
  },
  {
    label: 'E：全閉時の励振を弱く',
    description: '全閉時の励振 22 → 8％。低開度で弱く柔らかくなり、全開は同じです。',
    tuning: { closedExcitation: 0.08 },
  },
];
