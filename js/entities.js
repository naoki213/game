// ---------------------------------------------------------------
// 動物モブ: ブタ / ヒツジ / ニワトリ
// ボックスモデルを頂点色付き三角形で描画 (renderer の progPoint を流用)
// ---------------------------------------------------------------
"use strict";

// 種族定義: parts は [ox, oy, oz, w, h, d, r, g, b]
// (エンティティ原点=足元中心, 単位はブロック, +Z が正面)
const MOB_TYPES = {
  cow: {
    speed: 1.1,
    halfW: 0.45, height: 1.35,
    health: 8,
    drops: 113, dropN: 2,   // 牛肉
    parts: [
      // 胴体 (茶白のまだら模様)
      [-0.45, 0.55, -0.6, 0.9, 0.55, 1.2, 1, 1, 1, TILE.MOB_COW_PATCH],
      // 頭
      [-0.22, 0.78, 0.55, 0.44, 0.42, 0.4, 1, 1, 1, TILE.MOB_COW_BROWN, TILE.MOB_COW_FACE],
      // 鼻先
      [-0.13, 0.8, 0.93, 0.26, 0.2, 0.06, 0.82, 0.78, 0.72],
      // 角 x2
      [-0.26, 1.16, 0.6, 0.08, 0.12, 0.08, 0.85, 0.82, 0.75],
      [0.18, 1.16, 0.6, 0.08, 0.12, 0.08, 0.85, 0.82, 0.75],
      // 脚 x4
      [-0.38, 0, -0.5, 0.22, 0.55, 0.22, 1, 1, 1, TILE.MOB_COW_BROWN],
      [0.16, 0, -0.5, 0.22, 0.55, 0.22, 1, 1, 1, TILE.MOB_COW_BROWN],
      [-0.38, 0, 0.26, 0.22, 0.55, 0.22, 1, 1, 1, TILE.MOB_COW_BROWN],
      [0.16, 0, 0.26, 0.22, 0.55, 0.22, 1, 1, 1, TILE.MOB_COW_BROWN],
    ],
  },
  spider: {
    speed: 2.9,
    halfW: 0.6, height: 0.9,
    health: 8,
    hostile: true,
    noBurn: true,
    dayNeutral: true,       // 昼は襲ってこない
    attack: 2,
    parts: [
      // 平たい胴体 (毛羽立った質感)
      [-0.5, 0.22, -0.55, 1.0, 0.45, 0.9, 1, 1, 1, TILE.MOB_SPIDER_FUR],
      // 頭
      [-0.3, 0.26, 0.35, 0.6, 0.42, 0.42, 1, 1, 1, TILE.MOB_SPIDER_FUR],
      // 赤い目 x2
      [-0.18, 0.48, 0.74, 0.1, 0.08, 0.05, 0.9, 0.15, 0.15],
      [0.08, 0.48, 0.74, 0.1, 0.08, 0.05, 0.9, 0.15, 0.15],
      // 脚 x4 (左右に張り出す)
      [-0.85, 0, -0.35, 0.3, 0.28, 0.16, 1, 1, 1, TILE.MOB_SPIDER_FUR],
      [0.55, 0, -0.35, 0.3, 0.28, 0.16, 1, 1, 1, TILE.MOB_SPIDER_FUR],
      [-0.85, 0, 0.15, 0.3, 0.28, 0.16, 1, 1, 1, TILE.MOB_SPIDER_FUR],
      [0.55, 0, 0.15, 0.3, 0.28, 0.16, 1, 1, 1, TILE.MOB_SPIDER_FUR],
    ],
  },
  pig: {
    speed: 1.4,
    halfW: 0.4, height: 0.9,
    drops: 112, dropN: 2,   // 豚肉
    parts: [
      // 胴体
      [-0.4, 0.35, -0.5, 0.8, 0.5, 1.0, 1, 1, 1, TILE.MOB_PIG_SKIN],
      // 頭
      [-0.28, 0.42, 0.42, 0.56, 0.45, 0.42, 1, 1, 1, TILE.MOB_PIG_SKIN, TILE.MOB_PIG_FACE],
      // 鼻
      [-0.1, 0.5, 0.82, 0.2, 0.14, 0.06, 0.85, 0.5, 0.55],
      // 脚 x4
      [-0.35, 0, -0.42, 0.22, 0.36, 0.22, 1, 1, 1, TILE.MOB_PIG_SKIN],
      [0.13, 0, -0.42, 0.22, 0.36, 0.22, 1, 1, 1, TILE.MOB_PIG_SKIN],
      [-0.35, 0, 0.2, 0.22, 0.36, 0.22, 1, 1, 1, TILE.MOB_PIG_SKIN],
      [0.13, 0, 0.2, 0.22, 0.36, 0.22, 1, 1, 1, TILE.MOB_PIG_SKIN],
    ],
  },
  sheep: {
    speed: 1.2,
    halfW: 0.45, height: 1.1,
    drops: 21, dropN: 2,   // 羊毛

    parts: [
      // もこもこの胴体 (毛玉状の羊毛模様)
      [-0.45, 0.45, -0.55, 0.9, 0.65, 1.1, 1, 1, 1, TILE.MOB_SHEEP_WOOL],
      // 頭 (肌)
      [-0.22, 0.75, 0.5, 0.44, 0.4, 0.35, 1, 1, 1, TILE.MOB_SHEEP_SKIN, TILE.MOB_SHEEP_FACE],
      // 脚 x4
      [-0.35, 0, -0.45, 0.2, 0.5, 0.2, 1, 1, 1, TILE.MOB_SHEEP_SKIN],
      [0.15, 0, -0.45, 0.2, 0.5, 0.2, 1, 1, 1, TILE.MOB_SHEEP_SKIN],
      [-0.35, 0, 0.22, 0.2, 0.5, 0.2, 1, 1, 1, TILE.MOB_SHEEP_SKIN],
      [0.15, 0, 0.22, 0.2, 0.5, 0.2, 1, 1, 1, TILE.MOB_SHEEP_SKIN],
    ],
  },
  zombie: {
    speed: 2.3,
    halfW: 0.32, height: 1.9,
    health: 10,
    hostile: true,
    parts: [
      // 脚 x2 (ぼろぼろの服)
      [-0.22, 0, -0.11, 0.2, 0.72, 0.22, 1, 1, 1, TILE.MOB_ZOMBIE_CLOTH],
      [0.02, 0, -0.11, 0.2, 0.72, 0.22, 1, 1, 1, TILE.MOB_ZOMBIE_CLOTH],
      // 胴体 (ぼろぼろの服)
      [-0.25, 0.72, -0.14, 0.5, 0.62, 0.28, 1, 1, 1, TILE.MOB_ZOMBIE_CLOTH],
      // 腕 x2 (前に突き出した腐った肌)
      [-0.43, 1.08, -0.1, 0.18, 0.18, 0.72, 1, 1, 1, TILE.MOB_ZOMBIE_SKIN],
      [0.25, 1.08, -0.1, 0.18, 0.18, 0.72, 1, 1, 1, TILE.MOB_ZOMBIE_SKIN],
      // 頭 (腐った肌)
      [-0.25, 1.34, -0.25, 0.5, 0.5, 0.5, 1, 1, 1, TILE.MOB_ZOMBIE_SKIN, TILE.MOB_ZOMBIE_FACE],
    ],
  },
  skeleton: {
    speed: 2.0,
    halfW: 0.3, height: 1.9,
    health: 10,
    hostile: true,
    ranged: true,
    drops: I.BONE, dropN: 2,
    parts: [
      // 脚 x2 (細い骨)
      [-0.18, 0, -0.08, 0.13, 0.75, 0.16, 1, 1, 1, TILE.MOB_SKELETON_BONE],
      [0.05, 0, -0.08, 0.13, 0.75, 0.16, 1, 1, 1, TILE.MOB_SKELETON_BONE],
      // 胴体 (あばら)
      [-0.2, 0.75, -0.12, 0.4, 0.6, 0.24, 1, 1, 1, TILE.MOB_SKELETON_BONE],
      // 腕 x2
      [-0.34, 0.85, -0.08, 0.12, 0.5, 0.16, 1, 1, 1, TILE.MOB_SKELETON_BONE],
      [0.22, 0.85, -0.08, 0.12, 0.5, 0.16, 1, 1, 1, TILE.MOB_SKELETON_BONE],
      // 頭 (白い骨)
      [-0.22, 1.35, -0.22, 0.44, 0.44, 0.44, 1, 1, 1, TILE.MOB_SKELETON_BONE, TILE.MOB_SKELETON_FACE],
    ],
  },
  creeper: {
    speed: 2.6,
    halfW: 0.3, height: 1.7,
    health: 12,
    hostile: true,
    creeper: true,
    noBurn: true,
    drops: I.GUNPOWDER, dropN: 2,
    parts: [
      // 脚 x4 (低い, 迷彩模様)
      [-0.25, 0, -0.28, 0.22, 0.4, 0.24, 1, 1, 1, TILE.MOB_CREEPER_SKIN],
      [0.03, 0, -0.28, 0.22, 0.4, 0.24, 1, 1, 1, TILE.MOB_CREEPER_SKIN],
      [-0.25, 0, 0.06, 0.22, 0.4, 0.24, 1, 1, 1, TILE.MOB_CREEPER_SKIN],
      [0.03, 0, 0.06, 0.22, 0.4, 0.24, 1, 1, 1, TILE.MOB_CREEPER_SKIN],
      // 縦長の胴体 (迷彩模様)
      [-0.2, 0.4, -0.15, 0.4, 0.85, 0.3, 1, 1, 1, TILE.MOB_CREEPER_SKIN],
      // 頭 (迷彩模様)
      [-0.24, 1.25, -0.24, 0.48, 0.45, 0.48, 1, 1, 1, TILE.MOB_CREEPER_SKIN, TILE.MOB_CREEPER_FACE],
    ],
  },
  enderman: {
    speed: 1.6,
    halfW: 0.3, height: 2.9,
    health: 20,
    hostile: false,     // 殴られるまでは襲ってこない (アグロ状態は angered で管理)
    neutral: true,
    noBurn: true,
    teleporter: true,   // 徘徊中もまれに瞬間移動する
    attack: 5,
    drops: I.ENDER_PEARL, dropN: 1,
    parts: [
      // 脚 x2 (長い)
      [-0.16, 0, -0.08, 0.13, 1.3, 0.16, 1, 1, 1, TILE.MOB_ENDERMAN_SKIN],
      [0.03, 0, -0.08, 0.13, 1.3, 0.16, 1, 1, 1, TILE.MOB_ENDERMAN_SKIN],
      // 胴体
      [-0.2, 1.3, -0.12, 0.4, 0.9, 0.24, 1, 1, 1, TILE.MOB_ENDERMAN_SKIN],
      // 腕 x2 (長く垂れる)
      [-0.34, 1.0, -0.08, 0.12, 1.2, 0.16, 1, 1, 1, TILE.MOB_ENDERMAN_SKIN],
      [0.22, 1.0, -0.08, 0.12, 1.2, 0.16, 1, 1, 1, TILE.MOB_ENDERMAN_SKIN],
      // 頭
      [-0.22, 2.2, -0.22, 0.44, 0.44, 0.44, 1, 1, 1, TILE.MOB_ENDERMAN_SKIN],
      // 目 x2 (紫に発光)
      [-0.14, 2.38, 0.2, 0.09, 0.08, 0.03, 0.85, 0.25, 0.95],
      [0.05, 2.38, 0.2, 0.09, 0.08, 0.03, 0.85, 0.25, 0.95],
    ],
  },
  chicken: {
    speed: 1.6,
    halfW: 0.25, height: 0.7,
    drops: 114, dropN: 1,   // 鶏肉
    parts: [
      // 体 (羽毛)
      [-0.22, 0.25, -0.3, 0.44, 0.4, 0.55, 1, 1, 1, TILE.MOB_CHICKEN_FEATHER],
      // 頭 (羽毛)
      [-0.13, 0.55, 0.18, 0.26, 0.3, 0.24, 1, 1, 1, TILE.MOB_CHICKEN_FEATHER, TILE.MOB_CHICKEN_FACE],
      // くちばし
      [-0.06, 0.66, 0.42, 0.12, 0.08, 0.1, 0.95, 0.65, 0.2],
      // とさか
      [-0.05, 0.5, 0.3, 0.1, 0.08, 0.1, 0.9, 0.25, 0.2],
      // 脚 x2
      [-0.14, 0, -0.05, 0.08, 0.28, 0.08, 0.9, 0.65, 0.25],
      [0.06, 0, -0.05, 0.08, 0.28, 0.08, 0.9, 0.65, 0.25],
    ],
  },
  villager: {
    speed: 1.0,
    halfW: 0.3, height: 1.95,
    health: 20,
    hostile: false,
    villager: true,   // 村の中だけに自然スポーンする NPC
    parts: [
      // 靴 (ローブの裾からわずかに覗く)
      [-0.16, 0, -0.1, 0.32, 0.12, 0.2, 0.18, 0.16, 0.16],
      // ローブ (裾広がり, 脚を覆う。布の折り目模様)
      [-0.28, 0.12, -0.16, 0.56, 0.66, 0.32, 1, 1, 1, TILE.MOB_VILLAGER_ROBE],
      // 胴体 (肩まわり, 布の折り目模様)
      [-0.25, 0.78, -0.14, 0.5, 0.55, 0.28, 1, 1, 1, TILE.MOB_VILLAGER_ROBE],
      // 腕 x2 (やや細く, 体に沿わせる)
      [-0.38, 0.55, -0.09, 0.13, 0.75, 0.18, 1, 1, 1, TILE.MOB_VILLAGER_ROBE],
      [0.25, 0.55, -0.09, 0.13, 0.75, 0.18, 1, 1, 1, TILE.MOB_VILLAGER_ROBE],
      // 頭 (大きめ, クリーム色の肌)
      [-0.3, 1.33, -0.3, 0.6, 0.6, 0.6, 1, 1, 1, TILE.MOB_VILLAGER_SKIN],
      // 眉間の陰
      [-0.19, 1.68, 0.29, 0.38, 0.04, 0.02, 0.6, 0.46, 0.34],
      // 鼻 (顔の下半分に垂れ下がる大きな鼻)
      [-0.09, 1.38, 0.29, 0.18, 0.27, 0.2, 0.58, 0.38, 0.25],
      // 目 x2 (緑, 鼻の付け根の高さ)
      [-0.23, 1.58, 0.29, 0.11, 0.07, 0.02, 0.13, 0.48, 0.1],
      [0.12, 1.58, 0.29, 0.11, 0.07, 0.02, 0.13, 0.48, 0.1],
    ],
  },
  wolf: {
    speed: 2.6,
    halfW: 0.32, height: 0.85,
    health: 12,
    hostile: false,
    tamable: true,     // ホネで手なずけると主人について歩き, 敵を攻撃する
    parts: [
      // 胴体 (毛並み)
      [-0.22, 0.32, -0.42, 0.44, 0.4, 0.8, 1, 1, 1, TILE.MOB_WOLF_FUR],
      // 頭 (毛並み)
      [-0.16, 0.42, 0.35, 0.32, 0.32, 0.32, 1, 1, 1, TILE.MOB_WOLF_FUR, TILE.MOB_WOLF_FACE],
      // 鼻先
      [-0.07, 0.44, 0.62, 0.14, 0.14, 0.12, 0.2, 0.18, 0.17],
      // 耳 x2
      [-0.16, 0.68, 0.4, 0.1, 0.1, 0.08, 0.4, 0.36, 0.32],
      [0.06, 0.68, 0.4, 0.1, 0.1, 0.08, 0.4, 0.36, 0.32],
      // しっぽ (毛並み)
      [-0.06, 0.5, -0.72, 0.12, 0.12, 0.3, 1, 1, 1, TILE.MOB_WOLF_FUR],
      // 脚 x4 (毛並み)
      [-0.2, 0, -0.32, 0.14, 0.32, 0.14, 1, 1, 1, TILE.MOB_WOLF_FUR],
      [0.06, 0, -0.32, 0.14, 0.32, 0.14, 1, 1, 1, TILE.MOB_WOLF_FUR],
      [-0.2, 0, 0.24, 0.14, 0.32, 0.14, 1, 1, 1, TILE.MOB_WOLF_FUR],
      [0.06, 0, 0.24, 0.14, 0.32, 0.14, 1, 1, 1, TILE.MOB_WOLF_FUR],
    ],
  },
  zombie_pigman: {
    speed: 2.1,
    halfW: 0.32, height: 1.9,
    health: 14,
    hostile: false,     // 殴られるまでは襲ってこない
    neutral: true,
    noBurn: true,
    attack: 4,
    drops: I.GOLD_INGOT, dropN: 1,
    parts: [
      // 脚 x2 (ズボン, ゾンビと同じぼろ布)
      [-0.22, 0, -0.11, 0.2, 0.72, 0.22, 1, 1, 1, TILE.MOB_ZOMBIE_CLOTH],
      [0.02, 0, -0.11, 0.2, 0.72, 0.22, 1, 1, 1, TILE.MOB_ZOMBIE_CLOTH],
      // 胴体 (ピンクがかった肌)
      [-0.25, 0.72, -0.14, 0.5, 0.62, 0.28, 1, 1, 1, TILE.MOB_PIGMAN_SKIN],
      // 腕 x2
      [-0.43, 1.08, -0.1, 0.18, 0.62, 0.22, 1, 1, 1, TILE.MOB_PIGMAN_SKIN],
      [0.25, 1.08, -0.1, 0.18, 0.62, 0.22, 1, 1, 1, TILE.MOB_PIGMAN_SKIN],
      // 頭 (豚鼻)
      [-0.25, 1.34, -0.25, 0.5, 0.5, 0.5, 1, 1, 1, TILE.MOB_PIGMAN_SKIN, TILE.MOB_PIGMAN_FACE],
    ],
  },
  blaze: {
    speed: 2.4,
    halfW: 0.35, height: 1.8,
    health: 20,
    hostile: true,
    flying: true,       // 重力を受けず, 目標の高さまで浮遊する
    ranged: true,
    noBurn: true,
    attack: 3,
    drops: I.BLAZE_ROD, dropN: 1,
    parts: [
      // 芯 (発光する黄金の柱, 揺らめく炎の模様)
      [-0.15, 0.3, -0.15, 0.3, 1.3, 0.3, 1, 1, 1, TILE.MOB_BLAZE_FIRE],
      // 周りを回る火の棒 x4
      [-0.55, 0.6, -0.05, 0.1, 0.7, 0.1, 1, 1, 1, TILE.MOB_BLAZE_FIRE],
      [0.45, 0.6, -0.05, 0.1, 0.7, 0.1, 1, 1, 1, TILE.MOB_BLAZE_FIRE],
      [-0.05, 0.6, -0.55, 0.1, 0.7, 0.1, 1, 1, 1, TILE.MOB_BLAZE_FIRE],
      [-0.05, 0.6, 0.45, 0.1, 0.7, 0.1, 1, 1, 1, TILE.MOB_BLAZE_FIRE],
      // 頭
      [-0.2, 1.5, -0.2, 0.4, 0.4, 0.4, 1, 1, 1, TILE.MOB_BLAZE_FIRE, TILE.MOB_BLAZE_FACE],
    ],
  },
  wither_skeleton: {
    speed: 1.8,
    halfW: 0.32, height: 2.4,
    health: 20,
    hostile: true,
    noBurn: true,
    attack: 5,
    drops: B.COAL_ORE, dropN: 2,
    parts: [
      // 脚 x2 (黒い骨)
      [-0.2, 0, -0.09, 0.15, 0.95, 0.18, 1, 1, 1, TILE.MOB_WITHER_SKELETON_BONE],
      [0.05, 0, -0.09, 0.15, 0.95, 0.18, 1, 1, 1, TILE.MOB_WITHER_SKELETON_BONE],
      // 胴体
      [-0.22, 0.95, -0.13, 0.44, 0.7, 0.26, 1, 1, 1, TILE.MOB_WITHER_SKELETON_BONE],
      // 腕 x2 (石の剣を模して太め)
      [-0.36, 1.08, -0.09, 0.13, 0.62, 0.18, 1, 1, 1, TILE.MOB_WITHER_SKELETON_BONE],
      [0.23, 1.08, -0.09, 0.13, 0.62, 0.18, 1, 1, 1, TILE.MOB_WITHER_SKELETON_BONE],
      // 頭
      [-0.24, 1.65, -0.24, 0.48, 0.48, 0.48, 1, 1, 1, TILE.MOB_WITHER_SKELETON_BONE, TILE.MOB_WITHER_SKELETON_FACE],
    ],
  },
  ghast: {
    speed: 1.2,
    halfW: 1.4, height: 1.7,
    health: 15,
    hostile: true,
    flying: true,
    ranged: true,
    fireball: true,      // ファイアボールを撃つ (見た目と高ダメージ)
    noBurn: true,
    attack: 6,
    drops: I.GUNPOWDER, dropN: 2,
    parts: [
      // 白くふわふわした大きな体 (雲状の模様)
      [-1.4, 0.2, -1.4, 2.8, 2.4, 2.8, 1, 1, 1, TILE.MOB_GHAST_BODY],
      // 顔 (眉と口)
      [-0.6, 1.6, -1.42, 0.35, 0.18, 0.05, 0.15, 0.14, 0.14],
      [0.25, 1.6, -1.42, 0.35, 0.18, 0.05, 0.15, 0.14, 0.14],
      [-0.35, 1.15, -1.42, 0.7, 0.3, 0.05, 0.15, 0.14, 0.14],
      // 垂れ下がる触手 x4 (雲状の模様)
      [-1.1, -1.6, -0.3, 0.22, 1.8, 0.22, 1, 1, 1, TILE.MOB_GHAST_BODY],
      [0.88, -1.6, -0.3, 0.22, 1.8, 0.22, 1, 1, 1, TILE.MOB_GHAST_BODY],
      [-0.11, -1.6, -1.1, 0.22, 1.8, 0.22, 1, 1, 1, TILE.MOB_GHAST_BODY],
      [-0.11, -1.6, 0.88, 0.22, 1.8, 0.22, 1, 1, 1, TILE.MOB_GHAST_BODY],
    ],
  },
  // 召喚制のボスモブ (ソウルサンド + ウィザースケルトンの頭蓋骨 3 個で召喚)
  wither_boss: {
    speed: 2.0,
    halfW: 1.0, height: 3.5,
    health: 150,
    hostile: true,
    flying: true,
    ranged: true,
    witherSkull: true,   // 専用の暗い頭蓋骨状の弾を撃つ
    noBurn: true,
    regen: 0.4,           // 徐々に体力が回復する (先制で畳みかける必要がある)
    attack: 8,
    drops: B.NETHER_STAR, dropN: 1,
    parts: [
      // 胴体 (黒ずんだ骨)
      [-0.5, 1.6, -0.5, 1.0, 1.3, 1.0, 1, 1, 1, TILE.MOB_WITHER_SKELETON_BONE],
      // あばら x3
      [-0.85, 1.7, -0.2, 0.3, 0.6, 0.4, 1, 1, 1, TILE.MOB_WITHER_SKELETON_BONE],
      [0.55, 1.7, -0.2, 0.3, 0.6, 0.4, 1, 1, 1, TILE.MOB_WITHER_SKELETON_BONE],
      [-0.3, 1.4, -0.75, 0.6, 0.7, 0.3, 1, 1, 1, TILE.MOB_WITHER_SKELETON_BONE],
      // 頭 x3 (中央が大きい)
      [-0.3, 2.9, -0.3, 0.6, 0.6, 0.6, 1, 1, 1, TILE.MOB_WITHER_SKELETON_BONE],
      [-0.95, 2.5, -0.1, 0.42, 0.42, 0.42, 1, 1, 1, TILE.MOB_WITHER_SKELETON_BONE],
      [0.53, 2.5, -0.1, 0.42, 0.42, 0.42, 1, 1, 1, TILE.MOB_WITHER_SKELETON_BONE],
      // 目 x3 (青白く発光)
      [-0.12, 3.05, 0.28, 0.1, 0.1, 0.04, 0.5, 0.9, 1.0],
      [-0.78, 2.65, 0.28, 0.08, 0.08, 0.03, 0.5, 0.9, 1.0],
      [0.7, 2.65, 0.28, 0.08, 0.08, 0.03, 0.5, 0.9, 1.0],
    ],
  },
};

const MOB_NAMES = Object.keys(MOB_TYPES);
const MOB_GRAVITY = 22;

// 面ごとのシェーディング (上 / 側面 / 下)
const BOX_SHADE = { top: 1.0, bottom: 0.55, north: 0.7, south: 0.75, east: 0.85, west: 0.62 };

// ---------------------------------------------------------------
// エンダードラゴン (最終ボス): 通常の Mob とは別に飛行 AI で動く
// parts は [ox, oy, oz, w, h, d, r, g, b] (原点=胴体中心, +Z が正面)
// ---------------------------------------------------------------
const DRAGON_PARTS = [
  // 胴体
  [-1.6, -1.0, -2.6, 3.2, 2.2, 5.2, 0.4, 0.12, 0.52],
  // 首
  [-0.8, 0.0, 2.6, 1.6, 1.6, 2.4, 0.37, 0.11, 0.49],
  // 頭
  [-1.0, 0.0, 5.0, 2.0, 1.6, 2.2, 0.34, 0.1, 0.46],
  // 鼻先
  [-0.55, 0.1, 7.1, 1.1, 0.9, 1.1, 0.28, 0.08, 0.38],
  // 尻尾 (先細りに 3 段)
  [-1.3, -0.8, -6.8, 2.6, 1.6, 3.0, 0.4, 0.12, 0.52],
  [-1.0, -0.6, -9.6, 2.0, 1.2, 2.4, 0.37, 0.11, 0.48],
  [-0.6, -0.4, -11.8, 1.2, 0.8, 2.0, 0.34, 0.1, 0.44],
  // 翼 x2 (左右に大きく広げる, 平ら)
  [-9.5, 0.4, -1.5, 8.0, 0.35, 4.2, 0.44, 0.15, 0.58],
  [1.5, 0.4, -1.5, 8.0, 0.35, 4.2, 0.44, 0.15, 0.58],
  // 脚 x2 (下にぶら下げる)
  [-1.6, -2.2, -0.6, 0.7, 1.3, 0.7, 0.37, 0.11, 0.48],
  [0.9, -2.2, -0.6, 0.7, 1.3, 0.7, 0.37, 0.11, 0.48],
  // 目 x2 (紫に発光)
  [-0.7, 0.55, 6.9, 0.22, 0.2, 0.05, 0.9, 0.25, 1.0],
  [0.48, 0.55, 6.9, 0.22, 0.2, 0.05, 0.9, 0.25, 1.0],
];

class Dragon {
  constructor(cx, cy, cz) {
    this.center = [cx, cy, cz];
    this.radius = 22;
    this.angle = 0;
    this.pos = [cx + this.radius, cy + 16, cz];
    this.yaw = 0;
    this.health = 200;
    this.maxHealth = 200;
    this.hurt = 0;
    this.state = "circle";      // circle | dive
    this.stateTimer = 6 + Math.random() * 5;
    this.attackCooldown = 0;
    this.dead = false;
  }

  // クリスタルが生きているだけ緩やかに回復する (とどめの一撃は回復で覆らない)
  healFromCrystals(dt, crystalCount) {
    if (crystalCount <= 0 || this.health <= 0) return;
    this.health = Math.min(this.maxHealth, this.health + crystalCount * 0.4 * dt);
  }

  update(dt, world, player, mgr) {
    this.hurt = Math.max(0, this.hurt - dt);
    this.attackCooldown = Math.max(0, this.attackCooldown - dt);
    this.stateTimer -= dt;

    if (this.state === "circle") {
      this.angle += dt * 0.3;
      this.pos[0] = this.center[0] + Math.cos(this.angle) * this.radius;
      this.pos[2] = this.center[2] + Math.sin(this.angle) * this.radius;
      this.pos[1] = this.center[1] + 16 + Math.sin(this.angle * 0.7) * 3;
      // 進行方向を向く (円周上の接線方向)
      this.yaw = Math.atan2(-Math.sin(this.angle), Math.cos(this.angle));
      if (this.stateTimer <= 0 && !player.dead) {
        if (Math.random() < 0.3) {
          // 中央の泉の上にとまりに行く (本家のパーチ行動)
          this.state = "perch";
          this.perchTarget = [this.center[0], this.center[1] + 11, this.center[2]];
          this.perching = false;
          this.stateTimer = 14;   // 飛行 + 滞在の上限
        } else {
          this.state = "dive";
          this.diveTarget = [player.pos[0], player.pos[1] + 1, player.pos[2]];
          this.stateTimer = 3.2;
        }
      }
    } else if (this.state === "perch") {
      const t = this.perchTarget;
      if (!this.perching) {
        const dx = t[0] - this.pos[0];
        const dy = t[1] - this.pos[1];
        const dz = t[2] - this.pos[2];
        const dist = Math.hypot(dx, dy, dz) || 1;
        const speed = 13;
        this.pos[0] += (dx / dist) * speed * dt;
        this.pos[1] += (dy / dist) * speed * dt;
        this.pos[2] += (dz / dist) * speed * dt;
        this.yaw = Math.atan2(dx, dz);
        if (dist < 1.5) {
          this.perching = true;
          this.pos = [...t];
          this.stateTimer = 6;   // とまっている間は無防備 (攻撃のチャンス)
        }
      } else {
        // プレイヤーの方を向いてじっとしている
        this.yaw = Math.atan2(player.pos[0] - this.pos[0], player.pos[2] - this.pos[2]);
      }
      if (this.stateTimer <= 0) {
        this.angle = Math.atan2(this.pos[2] - this.center[2], this.pos[0] - this.center[0]);
        this.state = "circle";
        this.perching = false;
        this.stateTimer = 7 + Math.random() * 5;
      }
    } else if (this.state === "dive") {
      const dx = this.diveTarget[0] - this.pos[0];
      const dy = this.diveTarget[1] - this.pos[1];
      const dz = this.diveTarget[2] - this.pos[2];
      const dist = Math.hypot(dx, dy, dz) || 1;
      const speed = 16;
      this.pos[0] += (dx / dist) * speed * dt;
      this.pos[1] += (dy / dist) * speed * dt;
      this.pos[2] += (dz / dist) * speed * dt;
      this.yaw = Math.atan2(dx, dz);
      // プレイヤーに接触したらダメージ + ノックバック
      const pdx = player.pos[0] - this.pos[0];
      const pdz = player.pos[2] - this.pos[2];
      const pdy = player.pos[1] - this.pos[1];
      if (!player.dead && this.attackCooldown <= 0 &&
          Math.abs(pdy) < 3 && pdx * pdx + pdz * pdz < 4 * 4) {
        this.attackCooldown = 1.5;
        player.takeDamage(6);
        const pd = Math.hypot(pdx, pdz) || 1;
        player.vel[0] += (pdx / pd) * 9;
        player.vel[2] += (pdz / pd) * 9;
        player.vel[1] = Math.max(player.vel[1], 6);
      }
      if (this.stateTimer <= 0 || dist < 3) {
        // 現在位置に対応する角度から周回を再開する (スムーズに繋げる)
        this.angle = Math.atan2(this.pos[2] - this.center[2], this.pos[0] - this.center[0]);
        this.state = "circle";
        this.stateTimer = 7 + Math.random() * 5;
      }
    }

    if (this.health <= 0 && !this.dead) {
      this.dead = true;
      if (mgr) mgr.dragonDeathPos = [...this.pos];
    }
  }

  // レイと大まかな AABB の交差 (剣で狙って殴るため)
  rayHit(origin, dir, maxDist) {
    const min = [this.pos[0] - 4.5, this.pos[1] - 2.5, this.pos[2] - 8];
    const max = [this.pos[0] + 4.5, this.pos[1] + 2.5, this.pos[2] + 8];
    let tmin = 0, tmax = maxDist;
    for (let a = 0; a < 3; a++) {
      if (Math.abs(dir[a]) < 1e-9) {
        if (origin[a] < min[a] || origin[a] > max[a]) return Infinity;
        continue;
      }
      let t1 = (min[a] - origin[a]) / dir[a];
      let t2 = (max[a] - origin[a]) / dir[a];
      if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
      tmin = Math.max(tmin, t1);
      tmax = Math.min(tmax, t2);
      if (tmin > tmax) return Infinity;
    }
    return tmin;
  }
}

class Mob {
  constructor(type, x, y, z) {
    this.type = type;
    this.def = MOB_TYPES[type];
    this.pos = [x, y, z];
    this.vel = [0, 0, 0];
    this.yaw = Math.random() * Math.PI * 2;
    this.onGround = false;
    this.state = "idle";           // idle | walk
    this.stateTime = 1 + Math.random() * 2;
    this.walkPhase = 0;
    this.bob = 0;
    this.health = this.def.health || 6;
    this.hurt = 0;                 // 被弾の赤フラッシュ残り時間
    this.attackCooldown = 0;
    this.burnAccum = 0;
    this.angered = false;                          // エンダーマン: 殴られるとアグロ
    this.teleportTimer = 4 + Math.random() * 5;
    this.tamed = false;                            // オオカミ: ホネで手なずけられたか
  }

  // 近くの安全な足場を探して瞬間移動する (エンダーマン)
  teleportBlink(world, range = 6) {
    for (let attempt = 0; attempt < 6; attempt++) {
      const nx = this.pos[0] + (Math.random() * 2 - 1) * range;
      const nz = this.pos[2] + (Math.random() * 2 - 1) * range;
      const bx = Math.floor(nx), bz = Math.floor(nz);
      for (let dy = 3; dy >= -3; dy--) {
        const by = Math.floor(this.pos[1]) + dy;
        if (!world.isSolidAt(bx, by, bz) && !world.isSolidAt(bx, by + 1, bz) &&
            !world.isSolidAt(bx, by + 2, bz) && world.isSolidAt(bx, by - 1, bz)) {
          this.pos[0] = nx; this.pos[1] = by; this.pos[2] = nz;
          this.vel = [0, 0, 0];
          return true;
        }
      }
    }
    return false;
  }

  update(dt, world, player, daylight, mgr) {
    this.hurt = Math.max(0, this.hurt - dt);
    this.attackCooldown = Math.max(0, this.attackCooldown - dt);

    // --- ゆっくり体力が回復するボスモブ (ウィザー) ---
    if (this.def.regen && this.health > 0 && this.health < this.def.health) {
      this.health = Math.min(this.def.health, this.health + this.def.regen * dt);
    }

    // --- エンダーマンの瞬間移動 (徘徊中もまれに, 水中では必ず) ---
    if (this.def.teleporter) {
      const inWater = BLOCKS[world.getBlock(Math.floor(this.pos[0]),
        Math.floor(this.pos[1] + 0.3), Math.floor(this.pos[2]))].fluid === "water";
      this.teleportTimer -= dt;
      if (inWater || this.teleportTimer <= 0) {
        this.teleportBlink(world, this.angered ? 10 : 6);
        this.teleportTimer = this.angered ? 1.5 + Math.random() * 2 : 5 + Math.random() * 6;
      }
    }

    let chasing = false;

    // --- 手なずけたオオカミ: 主人について歩き, 近くの敵モブを攻撃する ---
    if (this.tamed) {
      let nearestHostile = null, nearestD2 = 8 * 8;
      if (mgr) {
        for (const om of mgr.mobs) {
          if (om === this || !om.def.hostile) continue;
          const hdx = om.pos[0] - this.pos[0], hdz = om.pos[2] - this.pos[2];
          const d2 = hdx * hdx + hdz * hdz;
          if (d2 < nearestD2) { nearestD2 = d2; nearestHostile = om; }
        }
      }
      if (nearestHostile) {
        const hdx = nearestHostile.pos[0] - this.pos[0], hdz = nearestHostile.pos[2] - this.pos[2];
        const hd = Math.hypot(hdx, hdz);
        this.yaw = Math.atan2(hdx, hdz);
        this.state = "walk";
        chasing = true;
        if (hd < 1.5 && this.attackCooldown <= 0) {
          this.attackCooldown = 1.0;
          nearestHostile.health -= 3;
          nearestHostile.hurt = 0.3;
        }
      } else {
        const pdx = player.pos[0] - this.pos[0], pdz = player.pos[2] - this.pos[2];
        if (Math.hypot(pdx, pdz) > 4) {
          this.yaw = Math.atan2(pdx, pdz);
          this.state = "walk";
          chasing = true;
        }
      }
    }

    if (this.def.hostile || this.angered) {
      // --- 昼は燃えてダメージ (クリーパーは燃えない) ---
      if (daylight > 0.5 && !this.def.noBurn) {
        this.burnAccum += dt;
        if (this.burnAccum >= 1) {
          this.burnAccum -= 1;
          this.health -= 3;
          this.hurt = 0.3;
        }
      }
      // --- プレイヤーを追跡 ---
      const dx = player.pos[0] - this.pos[0];
      const dy = player.pos[1] - this.pos[1];
      const dz = player.pos[2] - this.pos[2];
      const distH = Math.hypot(dx, dz);
      const passive = this.def.dayNeutral && daylight > 0.5; // クモは昼は中立
      if (!player.dead && !passive && distH < 28 && Math.abs(dy) < 12) {
        chasing = true;
        this.yaw = Math.atan2(dx, dz);
        this.state = "walk";

        if (this.def.ranged) {
          // --- スケルトン: 距離を保ちつつ弓を撃つ ---
          if (distH < 5) this.yaw += Math.PI;          // 近すぎたら後退
          else if (distH < 12) this.state = "idle";    // 射程内では足を止める
          if (distH < 15 && Math.abs(dy) < 6 && this.attackCooldown <= 0 && mgr) {
            this.attackCooldown = 2.2;
            mgr.shootArrow(this, player);
          }
        } else if (this.def.creeper) {
          // --- クリーパー: 接近して自爆 ---
          if (this.fuse == null && distH < 2.4 && Math.abs(dy) < 2) {
            this.fuse = 1.3;
            if (mgr) mgr.hissRequest = true;
          }
          if (this.fuse != null && distH > 5) this.fuse = null; // 離れたら解除
          if (this.fuse != null) {
            this.state = "idle";
            this.fuse -= dt;
            if (this.fuse <= 0) {
              if (mgr) mgr.explosions.push({ pos: [...this.pos] });
              this.health = 0;
            }
          }
        } else if (distH < 1.4 && Math.abs(dy) < 2 && this.attackCooldown <= 0) {
          // --- 近接攻撃 (ゾンビ / クモ) ---
          this.attackCooldown = 1.1;
          player.takeDamage(this.def.attack || 3);
          // ノックバック
          const d = distH || 1;
          player.vel[0] += (dx / d) * 6;
          player.vel[2] += (dz / d) * 6;
          player.vel[1] = Math.max(player.vel[1], 3.5);
        }
      } else if (this.def.creeper) {
        this.fuse = null;
      }
    }

    // --- 状態遷移 (ふらふら歩く) ---
    if (!chasing) {
      this.stateTime -= dt;
      if (this.stateTime <= 0) {
        if (this.state === "idle") {
          this.state = "walk";
          this.yaw = Math.random() * Math.PI * 2;
          this.stateTime = 1.5 + Math.random() * 3;
        } else {
          this.state = "idle";
          this.stateTime = 1 + Math.random() * 3;
        }
      }
    }

    // --- 移動 ---
    const speed = this.state === "walk" ? this.def.speed : 0;
    const tx = Math.sin(this.yaw) * speed;
    const tz = Math.cos(this.yaw) * speed;
    this.vel[0] = lerp(this.vel[0], tx, Math.min(8 * dt, 1));
    this.vel[2] = lerp(this.vel[2], tz, Math.min(8 * dt, 1));

    if (this.def.flying) {
      // 飛行モブ (ブレイズ): 重力を受けず, プレイヤーの目線あたりを浮遊する
      const targetY = player.pos[1] + 2.5 + Math.sin(this.stateTime * 0.6) * 1.5;
      this.vel[1] = clamp((targetY - this.pos[1]) * 1.2, -4, 4);
    } else {
      this.vel[1] -= MOB_GRAVITY * dt;
      this.vel[1] = Math.max(this.vel[1], -30);

      // 水中では浮く
      const bx = Math.floor(this.pos[0]);
      const bz = Math.floor(this.pos[2]);
      if (BLOCKS[world.getBlock(bx, Math.floor(this.pos[1] + 0.3), bz)].fluid === "water") {
        this.vel[1] = Math.max(this.vel[1], 1.5);
      }
    }

    const wasBlocked = this.moveAxis(world, 0, this.vel[0] * dt) |
                       this.moveAxis(world, 2, this.vel[2] * dt);
    this.onGround = false;
    this.moveAxis(world, 1, this.vel[1] * dt);

    // 壁にぶつかったらジャンプ (段差登り)
    if (wasBlocked && this.onGround) {
      this.vel[1] = 7;
    } else if (wasBlocked && this.state === "walk" && Math.random() < 0.05) {
      this.yaw += Math.PI * (0.5 + Math.random());
    }

    // 歩行アニメーション
    const hSpeed = Math.hypot(this.vel[0], this.vel[2]);
    this.walkPhase += hSpeed * dt * 3.2;
    this.bob = hSpeed > 0.3 ? Math.sin(this.walkPhase * Math.PI * 2) : 0;
  }

  // 戻り値: この軸で衝突したか
  moveAxis(world, axis, delta) {
    if (delta === 0) return false;
    this.pos[axis] += delta;
    const hw = this.def.halfW, h = this.def.height;

    const x0 = Math.floor(this.pos[0] - hw), x1 = Math.floor(this.pos[0] + hw - 1e-7);
    const y0 = Math.floor(this.pos[1]), y1 = Math.floor(this.pos[1] + h - 1e-7);
    const z0 = Math.floor(this.pos[2] - hw), z1 = Math.floor(this.pos[2] + hw - 1e-7);

    for (let y = y0; y <= y1; y++) {
      for (let z = z0; z <= z1; z++) {
        for (let x = x0; x <= x1; x++) {
          const bh = world.blockHeightAt(x, y, z);
          if (bh === 0) continue;
          const blockTop = y + bh;
          if (this.pos[1] >= blockTop - 1e-6) continue; // ハーフの上は素通り
          if (axis === 0) {
            this.pos[0] = delta > 0 ? x - hw - 1e-4 : x + 1 + hw + 1e-4;
            this.vel[0] = 0;
          } else if (axis === 2) {
            this.pos[2] = delta > 0 ? z - hw - 1e-4 : z + 1 + hw + 1e-4;
            this.vel[2] = 0;
          } else {
            if (delta > 0) {
              this.pos[1] = y - h - 1e-4;
            } else {
              this.pos[1] = blockTop + 1e-4;
              this.onGround = true;
            }
            this.vel[1] = 0;
          }
          return true;
        }
      }
    }
    return false;
  }

  // レイと AABB の交差 (ヒットしたら距離, しなければ Infinity)
  rayHit(origin, dir, maxDist) {
    const hw = this.def.halfW, h = this.def.height;
    const min = [this.pos[0] - hw, this.pos[1], this.pos[2] - hw];
    const max = [this.pos[0] + hw, this.pos[1] + h, this.pos[2] + hw];
    let tmin = 0, tmax = maxDist;
    for (let a = 0; a < 3; a++) {
      if (Math.abs(dir[a]) < 1e-9) {
        if (origin[a] < min[a] || origin[a] > max[a]) return Infinity;
        continue;
      }
      let t1 = (min[a] - origin[a]) / dir[a];
      let t2 = (max[a] - origin[a]) / dir[a];
      if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
      tmin = Math.max(tmin, t1);
      tmax = Math.min(tmax, t2);
      if (tmin > tmax) return Infinity;
    }
    return tmin;
  }
}

class MobManager {
  constructor(world) {
    this.world = world;
    this.mobs = [];
    this.spawnTimer = 0;
    this.maxAnimals = 12;
    this.maxZombies = 8;
    this.maxEndermen = 3;
    this.maxNetherMobs = 10;
    this.deaths = [];        // 今フレーム死んだモブ (演出は main 側)
    this.explosions = [];    // クリーパーの爆発 (処理は main 側)
    this.arrows = [];        // スケルトンの矢
    this.groanRequest = false;
    this.hissRequest = false;
    this.shootRequest = false;
    this.dragon = null;          // エンダードラゴン (ジ・エンドにいる間のみ)
    this.dragonDeathPos = null;  // 今フレームに倒した位置 (演出は main 側)
  }

  // ダメージを与える (剣の近接攻撃から呼ぶ)
  hitDragon(damage, dir) {
    if (!this.dragon || this.dragon.dead) return;
    this.dragon.health -= damage;
    this.dragon.hurt = 0.3;
    if (dir) {
      this.dragon.pos[0] += dir[0] * 0.5;
      this.dragon.pos[2] += dir[2] * 0.5;
    }
  }

  shootArrow(mob, player) {
    const from = [mob.pos[0], mob.pos[1] + 1.4, mob.pos[2]];
    const dx = player.pos[0] - from[0];
    const dy = (player.pos[1] + 1.1) - from[1];
    const dz = player.pos[2] - from[2];
    const len = Math.hypot(dx, dy, dz) || 1;
    const fireball = !!mob.def.fireball;
    const witherSkull = !!mob.def.witherSkull;
    const SPEED = fireball || witherSkull ? 12 : 17;
    this.arrows.push({
      pos: from,
      vel: [
        (dx / len) * SPEED + (Math.random() - 0.5) * 1.2,
        (dy / len) * SPEED + 1.4,   // 少し山なりに
        (dz / len) * SPEED + (Math.random() - 0.5) * 1.2,
      ],
      life: 3,
      dmg: mob.def.attack || 3,
      fireball,
      witherSkull,
    });
    this.shootRequest = true;
  }

  // プレイヤーが矢を放つ (弓)
  playerShoot(origin, dir) {
    const SPEED = 22;
    this.arrows.push({
      pos: [origin[0] + dir[0] * 0.4, origin[1] + dir[1] * 0.4, origin[2] + dir[2] * 0.4],
      vel: [dir[0] * SPEED, dir[1] * SPEED, dir[2] * SPEED],
      life: 3,
      fromPlayer: true,
    });
  }

  updateArrows(dt, player) {
    for (let i = this.arrows.length - 1; i >= 0; i--) {
      const a = this.arrows[i];
      a.life -= dt;
      if (a.life <= 0) { this.arrows.splice(i, 1); continue; }
      a.vel[1] -= 7 * dt;
      a.pos[0] += a.vel[0] * dt;
      a.pos[1] += a.vel[1] * dt;
      a.pos[2] += a.vel[2] * dt;

      if (a.fromPlayer) {
        // エンダードラゴン (体の大まかな範囲に命中判定)
        if (this.dragon && !this.dragon.dead) {
          const dx = a.pos[0] - this.dragon.pos[0];
          const dy = a.pos[1] - this.dragon.pos[1];
          const dz = a.pos[2] - this.dragon.pos[2];
          if (Math.abs(dx) < 3.5 && Math.abs(dz) < 7 && Math.abs(dy) < 3) {
            this.hitDragon(6, [a.vel[0], 0, a.vel[2]]);
            this.arrows.splice(i, 1);
            continue;
          }
        }
        // プレイヤーの矢 → モブに命中
        let hitMob = null;
        for (const m of this.mobs) {
          const hw = m.def.halfW + 0.15;
          if (Math.abs(a.pos[0] - m.pos[0]) < hw &&
              Math.abs(a.pos[2] - m.pos[2]) < hw &&
              a.pos[1] > m.pos[1] - 0.1 && a.pos[1] < m.pos[1] + m.def.height + 0.1) {
            hitMob = m;
            break;
          }
        }
        if (hitMob) {
          hitMob.health -= 5;
          hitMob.hurt = 0.35;
          hitMob.vel[0] += a.vel[0] * 0.15;
          hitMob.vel[1] = 4;
          hitMob.vel[2] += a.vel[2] * 0.15;
          this.arrows.splice(i, 1);
          continue;
        }
      } else {
        // 敵の矢 → プレイヤーに命中
        const dx = a.pos[0] - player.pos[0];
        const dz = a.pos[2] - player.pos[2];
        const dy = a.pos[1] - player.pos[1];
        if (!player.dead && Math.abs(dx) < 0.5 && Math.abs(dz) < 0.5 && dy > -0.2 && dy < 1.9) {
          player.takeDamage(a.dmg || 3);
          player.vel[0] += a.vel[0] * 0.12;
          player.vel[2] += a.vel[2] * 0.12;
          this.arrows.splice(i, 1);
          continue;
        }
      }
      // ブロック命中
      if (this.world.isSolidAt(Math.floor(a.pos[0]), Math.floor(a.pos[1]), Math.floor(a.pos[2]))) {
        this.arrows.splice(i, 1);
      }
    }
  }

  update(dt, player, daylight) {
    this.deaths.length = 0;
    this.groanRequest = false;
    this.hissRequest = false;
    this.shootRequest = false;
    this.dragonDeathPos = null;
    this.updateArrows(dt, player);
    const playerPos = player.pos;

    // --- エンダードラゴン ---
    if (this.dragon && !this.dragon.dead) {
      const crystalCoords = this.world.endCrystalCoords();
      const aliveCrystals = crystalCoords.filter(([x, y, z]) => this.world.getBlock(x, y, z) === B.END_CRYSTAL).length;
      this.dragon.healFromCrystals(dt, aliveCrystals);
      this.dragon.update(dt, this.world, player, this);
    }

    // --- スポーン ---
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this.spawnTimer = 2;
      this.trySpawn(playerPos, daylight);
    }

    // --- 更新 & デスポーン ---
    for (let i = this.mobs.length - 1; i >= 0; i--) {
      const m = this.mobs[i];
      const dx = m.pos[0] - playerPos[0];
      const dz = m.pos[2] - playerPos[2];
      if (dx * dx + dz * dz > 90 * 90 || m.pos[1] < -10) {
        this.mobs.splice(i, 1);
        continue;
      }
      // 遠くのモブは間引いて更新
      if (dx * dx + dz * dz > 48 * 48 && Math.random() < 0.5) continue;
      m.update(dt, this.world, player, daylight, this);

      if (m.health <= 0) {
        this.deaths.push({ pos: [...m.pos], type: m.type });
        this.mobs.splice(i, 1);
        continue;
      }
      // 近くのゾンビはうめき声
      if (m.def.hostile && dx * dx + dz * dz < 12 * 12 && Math.random() < dt * 0.12) {
        this.groanRequest = true;
      }
    }
  }

  count(hostile) {
    let n = 0;
    for (const m of this.mobs) if (!!m.def.hostile === hostile) n++;
    return n;
  }

  countType(type) {
    let n = 0;
    for (const m of this.mobs) if (m.type === type) n++;
    return n;
  }

  trySpawn(playerPos, daylight) {
    // ジ・エンド: エンドストーンの上にエンダーマンが徘徊する (本家準拠)
    if (this.world.isInEnd(playerPos[0], playerPos[2])) {
      if (this.countType("enderman") >= 6 || Math.random() > 0.3) return;
      const eang = Math.random() * Math.PI * 2;
      const edist = 16 + Math.random() * 26;
      const sx = Math.floor(playerPos[0] + Math.cos(eang) * edist);
      const sz = Math.floor(playerPos[2] + Math.sin(eang) * edist);
      const ec = this.world.getChunk(sx >> 4, sz >> 4);
      if (!ec || !ec.generated) return;
      for (let y = Math.floor(playerPos[1]) + 20; y > Math.floor(playerPos[1]) - 24; y--) {
        if (y < 2 || y > CHUNK_H - 3) continue;
        if (this.world.getBlock(sx, y, sz) === B.END_STONE &&
            this.world.getBlock(sx, y + 1, sz) === B.AIR &&
            this.world.getBlock(sx, y + 2, sz) === B.AIR) {
          this.mobs.push(new Mob("enderman", sx + 0.5, y + 1.01, sz + 0.5));
          return;
        }
      }
      return;
    }
    // --- 村: 近くの村に村人が最低数 (4人) いるように優先的に湧かせる ---
    const pvgx = Math.floor(playerPos[0] / VILLAGE_GRID);
    const pvgz = Math.floor(playerPos[2] / VILLAGE_GRID);
    for (let dgz = -1; dgz <= 1; dgz++) {
      for (let dgx = -1; dgx <= 1; dgx++) {
        const v = this.world.villageInCell(pvgx + dgx, pvgz + dgz);
        if (!v) continue;
        const pdx = playerPos[0] - v.cx, pdz = playerPos[2] - v.cz;
        if (pdx * pdx + pdz * pdz > 70 * 70) continue;   // 村の近くにいるときだけ
        let near = 0;
        for (const m of this.mobs) {
          if (m.type !== "villager") continue;
          const mdx = m.pos[0] - v.cx, mdz = m.pos[2] - v.cz;
          if (mdx * mdx + mdz * mdz < 60 * 60) near++;
        }
        if (near >= 4) continue;
        // 井戸の周りのランダムな地点の地表にスポーン
        const vang = Math.random() * Math.PI * 2;
        const vdist = 4 + Math.random() * 14;
        const sx = Math.floor(v.cx + Math.cos(vang) * vdist);
        const sz = Math.floor(v.cz + Math.sin(vang) * vdist);
        const vc = this.world.getChunk(sx >> 4, sz >> 4);
        if (!vc || !vc.generated) continue;
        const h = this.world.surfaceY(sx, sz);
        if (h > 0 && this.world.getBlock(sx, h + 1, sz) === B.AIR &&
            this.world.getBlock(sx, h + 2, sz) === B.AIR) {
          this.mobs.push(new Mob("villager", sx + 0.5, h + 1.01, sz + 0.5));
          return;
        }
      }
    }

    // プレイヤーの周囲 20–50 ブロックのランダム地点
    const ang = Math.random() * Math.PI * 2;
    const dist = 20 + Math.random() * 30;
    const x = Math.floor(playerPos[0] + Math.cos(ang) * dist);
    const z = Math.floor(playerPos[2] + Math.sin(ang) * dist);

    const chunk = this.world.getChunk(x >> 4, z >> 4);
    if (!chunk || !chunk.generated) return;

    // --- ネザー: ゾンビピッグマン / ブレイズが常時湧く (昼夜は無関係) ---
    if (this.world.isInNether(playerPos[0], playerPos[2])) {
      if (this.count(true) + this.countType("zombie_pigman") >= this.maxNetherMobs) return;
      const py = Math.floor(playerPos[1]);
      for (let dy = -10; dy <= 10; dy++) {
        const y = py + dy;
        if (y < 2 || y > CHUNK_H - 3) continue;
        if (this.world.getBlock(x, y, z) === B.AIR && this.world.getBlock(x, y + 1, z) === B.AIR &&
            this.world.getBlock(x, y, z) !== B.LAVA_BLOCK) {
          const r = Math.random();
          const type = r < 0.5 ? "zombie_pigman" : r < 0.72 ? "blaze" :
            r < 0.88 ? "wither_skeleton" : "ghast";
          this.mobs.push(new Mob(type, x + 0.5, y + 1.01, z + 0.5));
          return;
        }
      }
      return;
    }

    // --- 洞窟の暗闇: 地表から離れた閉ざされた場所には昼夜を問わず敵モブが湧く ---
    if (Math.random() < 0.5 && this.count(true) < this.maxZombies + 4) {
      const h = this.world.surfaceY(x, z);
      if (h - 12 > 4) {
        const cy = 4 + Math.floor(Math.random() * (h - 12 - 4));
        if (this.world.getBlock(x, cy, z) === B.AIR && this.world.getBlock(x, cy + 1, z) === B.AIR &&
            this.world.getBlock(x, cy - 1, z) !== B.AIR && BLOCKS[this.world.getBlock(x, cy - 1, z)].fluid !== "lava") {
          const r = Math.random();
          const type = r < 0.4 ? "zombie" : r < 0.7 ? "skeleton" : r < 0.85 ? "spider" : "creeper";
          this.mobs.push(new Mob(type, x + 0.5, cy + 1.01, z + 0.5));
          return;
        }
      }
    }

    const y = this.world.surfaceY(x, z);
    if (y + 1 <= WATER_LEVEL) return;

    if (daylight < 0.3) {
      // 夜: 敵モブ (ゾンビ / スケルトン / クリーパー / クモ / まれにエンダーマン)
      if (Math.random() < 0.08 && this.countType("enderman") < this.maxEndermen) {
        this.mobs.push(new Mob("enderman", x + 0.5, y + 1.01, z + 0.5));
        return;
      }
      if (this.count(true) >= this.maxZombies) return;
      const r = Math.random();
      const type = r < 0.35 ? "zombie" : r < 0.6 ? "skeleton" : r < 0.8 ? "creeper" : "spider";
      this.mobs.push(new Mob(type, x + 0.5, y + 1.01, z + 0.5));
    } else if (daylight > 0.5) {
      // 昼: 動物 (草の上のみ, ニュートラルモブは除く)
      if (this.count(false) >= this.maxAnimals) return;
      if (this.world.getBlock(x, y, z) !== B.GRASS) return;
      // 森林バイオームにはオオカミが徘徊する (ホネで手なずけられる)
      if (this.world.columnInfo(x, z).biome === "forest" &&
          this.countType("wolf") < 4 && Math.random() < 0.15) {
        this.mobs.push(new Mob("wolf", x + 0.5, y + 1.01, z + 0.5));
        return;
      }
      // 村の中には村人が住んでいる
      const vgx = Math.floor(x / VILLAGE_GRID), vgz = Math.floor(z / VILLAGE_GRID);
      const village = this.world.villageInCell(vgx, vgz);
      if (village) {
        const vdx = x - village.cx, vdz = z - village.cz;
        if (vdx * vdx + vdz * vdz < 45 * 45 &&
            this.countType("villager") < 6 && Math.random() < 0.25) {
          this.mobs.push(new Mob("villager", x + 0.5, y + 1.01, z + 0.5));
          return;
        }
      }
      const passive = MOB_NAMES.filter((n) => !MOB_TYPES[n].hostile && !MOB_TYPES[n].neutral && !MOB_TYPES[n].tamable && !MOB_TYPES[n].villager);
      const type = passive[(Math.random() * passive.length) | 0];
      this.mobs.push(new Mob(type, x + 0.5, y + 1.01, z + 0.5));
    }
  }

  // 視線上のモブを探す
  pick(origin, dir, maxDist) {
    let best = null, bestT = maxDist;
    for (const m of this.mobs) {
      const t = m.rayHit(origin, dir, maxDist);
      if (t < bestT) { bestT = t; best = m; }
    }
    return best;
  }

  // 叩いてダメージ + ノックバック
  punch(mob, dir, damage = 2) {
    mob.health -= damage;
    mob.hurt = 0.35;
    mob.vel[0] += dir[0] * 7;
    mob.vel[2] += dir[2] * 7;
    mob.vel[1] = 5;
    if (mob.def.neutral) {
      mob.angered = true; // エンダーマン: 殴られると襲ってくる
    } else if (!mob.def.hostile) {
      mob.state = "walk";
      mob.yaw = Math.atan2(dir[0], dir[2]); // 叩かれた方向へ逃げる
      mob.stateTime = 2;
    }
  }

  // 描画用の頂点配列を組み立てる。verts = 単色ボックス [x,y,z,r,g,b],
  // texVerts = 模様入りテクスチャつきボックス [x,y,z,u,v,shade,tr,tg,tb]
  buildVertexData() {
    const verts = [];
    const texVerts = [];
    for (const m of this.mobs) {
      const sin = Math.sin(m.yaw), cos = Math.cos(m.yaw);
      const bobY = Math.abs(m.bob) * 0.04;
      const hurtT = m.hurt > 0 ? 0.55 : 0;
      // クリーパーの導火線: 白く点滅
      const flashT = (m.fuse != null && Math.sin(m.fuse * 24) > 0) ? 0.75 : 0;
      for (let pi = 0; pi < m.def.parts.length; pi++) {
        const p = m.def.parts[pi];
        let [ox, oy, oz, w, h, d, r, g, b, tile, faceTile] = p;
        if (hurtT > 0) {
          // 被弾中は赤くフラッシュ
          r = r + (1 - r) * hurtT;
          g *= 1 - hurtT;
          b *= 1 - hurtT;
        }
        if (flashT > 0) {
          r = r + (1 - r) * flashT;
          g = g + (1 - g) * flashT;
          b = b + (1 - b) * flashT;
        }
        // 脚は歩行時に前後へ振る
        const isLeg = oy === 0;
        if (isLeg && m.bob !== 0) {
          const dir = (pi % 2 === 0 ? 1 : -1) * m.bob * 0.12;
          oz += dir;
        }
        if (tile !== undefined) {
          pushBoxTex(texVerts, m.pos, sin, cos, ox, oy + bobY, oz, w, h, d, tile, r, g, b, faceTile);
        } else {
          pushBox(verts, m.pos, sin, cos, ox, oy + bobY, oz, w, h, d, r, g, b);
        }
      }
      // 手なずけたオオカミは赤い首輪をつける
      if (m.tamed) {
        pushBox(verts, m.pos, sin, cos, -0.17, 0.5 + bobY, 0.28, 0.34, 0.1, 0.16, 0.75, 0.12, 0.12);
      }
    }

    // 矢: 速度方向を向いた細い棒 (ファイアボールは大きな橙の球状に)
    for (const a of this.arrows) {
      const yaw = Math.atan2(a.vel[0], a.vel[2]);
      if (a.witherSkull) {
        pushBox(verts, a.pos, Math.sin(yaw), Math.cos(yaw),
          -0.24, -0.24, -0.24, 0.48, 0.48, 0.48, 0.12, 0.1, 0.16);
      } else if (a.fireball) {
        pushBox(verts, a.pos, Math.sin(yaw), Math.cos(yaw),
          -0.28, -0.28, -0.28, 0.56, 0.56, 0.56, 1.0, 0.55, 0.15);
      } else {
        pushBox(verts, a.pos, Math.sin(yaw), Math.cos(yaw),
          -0.035, -0.035, -0.3, 0.07, 0.07, 0.6, 0.5, 0.4, 0.28);
      }
    }

    // エンダードラゴン
    if (this.dragon && !this.dragon.dead) {
      const dr = this.dragon;
      const sin = Math.sin(dr.yaw), cos = Math.cos(dr.yaw);
      const hurtT = dr.hurt > 0 ? 0.55 : 0;
      for (const p of DRAGON_PARTS) {
        let [ox, oy, oz, w, h, d, r, g, b] = p;
        if (hurtT > 0) {
          r = r + (1 - r) * hurtT;
          g *= 1 - hurtT;
          b *= 1 - hurtT;
        }
        pushBox(verts, dr.pos, sin, cos, ox, oy, oz, w, h, d, r, g, b);
      }
    }
    return { verts: new Float32Array(verts), texVerts: new Float32Array(texVerts) };
  }
}

// ---------------- アイテムドロップ ----------------

class ItemManager {
  constructor(world) {
    this.world = world;
    this.items = [];   // {id, pos, vel, phase, age}
  }

  spawn(blockId, x, y, z, n = 1) {
    if (this.items.length > 120) this.items.shift();
    this.items.push({
      id: blockId,
      n,
      pos: [x + 0.5, y + 0.3, z + 0.5],
      vel: [(Math.random() - 0.5) * 2.2, 2.5 + Math.random() * 1.5, (Math.random() - 0.5) * 2.2],
      phase: Math.random() * Math.PI * 2,
      age: 0,
    });
  }

  // onPickup(blockId) — プレイヤーが拾ったときに呼ばれる
  update(dt, player, onPickup) {
    const world = this.world;
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      it.age += dt;
      if (it.age > 240) { this.items.splice(i, 1); continue; }

      // --- プレイヤーへの吸い寄せと回収 ---
      const px = player.pos[0] - it.pos[0];
      const py = (player.pos[1] + 0.4) - it.pos[1];
      const pz = player.pos[2] - it.pos[2];
      const d2h = px * px + pz * pz;              // 水平距離
      const d2 = d2h + py * py;
      if (it.age > 0.5) {
        // 回収は水平距離ベース (アイテムは地面に転がっているため)
        if (d2h < 0.9 * 0.9 && py > -1.2 && py < 2.0) {
          this.items.splice(i, 1);
          onPickup(it.id, it.n || 1);
          continue;
        }
        if (d2 < 2.5 * 2.5) {
          const d = Math.sqrt(d2) || 1;
          const pull = 22;                        // 重力に勝てる強さ
          it.vel[0] += (px / d) * pull * dt;
          it.vel[1] += (py / d) * pull * dt;
          it.vel[2] += (pz / d) * pull * dt;
        }
      }

      // --- 物理 (簡易: 軸ごとに判定して止める) ---
      it.vel[1] -= 16 * dt;
      it.vel[1] = Math.max(it.vel[1], -20);
      // 水に浮く
      if (BLOCKS[world.getBlock(Math.floor(it.pos[0]), Math.floor(it.pos[1]), Math.floor(it.pos[2]))].fluid === "water") {
        it.vel[1] = Math.min(it.vel[1] + 40 * dt, 1.2);
        it.vel[0] *= 0.95; it.vel[2] *= 0.95;
      }
      for (let a = 0; a < 3; a++) {
        const next = it.pos[a] + it.vel[a] * dt;
        const test = [it.pos[0], it.pos[1], it.pos[2]];
        test[a] = next + (a === 1 ? -0.05 : 0);
        if (world.isSolidAt(Math.floor(test[0]), Math.floor(test[1]), Math.floor(test[2]))) {
          if (a === 1 && it.vel[1] < 0) {
            // 着地: 摩擦で滑りを止める
            it.vel[0] *= 0.6;
            it.vel[2] *= 0.6;
          }
          it.vel[a] = 0;
        } else {
          it.pos[a] = next;
        }
      }
      if (it.pos[1] < -10) this.items.splice(i, 1);
    }
  }
}

// ボックスをエンティティのヨーで回転させて三角形 36 頂点を積む
function pushBox(verts, pos, sin, cos, ox, oy, oz, w, h, d, r, g, b) {
  // ローカル 8 頂点
  const corners = [];
  for (let i = 0; i < 8; i++) {
    const lx = ox + ((i & 1) ? w : 0);
    const ly = oy + ((i & 2) ? h : 0);
    const lz = oz + ((i & 4) ? d : 0);
    // Y 軸回転
    corners.push([
      pos[0] + lx * cos + lz * sin,
      pos[1] + ly,
      pos[2] + -lx * sin + lz * cos,
    ]);
  }
  // 各面: [4 頂点のインデックス, シェード]
  const faces = [
    [[2, 6, 7, 3], BOX_SHADE.top],
    [[0, 1, 5, 4], BOX_SHADE.bottom],
    [[4, 5, 7, 6], BOX_SHADE.south],   // +Z (正面)
    [[1, 0, 2, 3], BOX_SHADE.north],   // -Z
    [[1, 3, 7, 5], BOX_SHADE.east],    // +X
    [[4, 6, 2, 0], BOX_SHADE.west],    // -X
  ];
  for (const [idx, shade] of faces) {
    const quad = idx.map((i) => corners[i]);
    const cr = r * shade, cg = g * shade, cb = b * shade;
    // 2 三角形 (両面は不要: 面は外向き。カリング無効で描くので順序は気にしない)
    for (const tri of [[0, 1, 2], [0, 2, 3]]) {
      for (const vi of tri) {
        verts.push(quad[vi][0], quad[vi][1], quad[vi][2], cr, cg, cb);
      }
    }
  }
}

// pushBox のテクスチャ版: 各面にタイルの模様をそのまま貼る
// (r,g,b は色ではなく, 被弾フラッシュなどに使う色ティント倍率)。
// faceTile を渡すと正面 (+Z) だけ別タイル (顔) に差し替える
function pushBoxTex(verts, pos, sin, cos, ox, oy, oz, w, h, d, tile, tr, tg, tb, faceTile) {
  const corners = [];
  for (let i = 0; i < 8; i++) {
    const lx = ox + ((i & 1) ? w : 0);
    const ly = oy + ((i & 2) ? h : 0);
    const lz = oz + ((i & 4) ? d : 0);
    corners.push([
      pos[0] + lx * cos + lz * sin,
      pos[1] + ly,
      pos[2] + -lx * sin + lz * cos,
    ]);
  }
  const uv = tileUV(tile);
  const faceUV = faceTile !== undefined ? tileUV(faceTile) : null;
  // 面ごとの角の並び順 (idx) は pushBox 由来でカメラ視点での回転オフセットが異なるため,
  // UV 4点サイクルを面ごとに回転させて正しい向きに揃える (揃えないと顔などが90度回転して見える)
  const rotUV = (t, shift) => {
    const cycle = [[t.u0, t.v0], [t.u0, t.v1], [t.u1, t.v1], [t.u1, t.v0]];
    const out = [];
    for (let i = 0; i < 4; i++) out.push(cycle[(i + shift) % 4]);
    return out;
  };
  const faces = [
    [[2, 6, 7, 3], BOX_SHADE.top, rotUV(uv, 0)],
    [[0, 1, 5, 4], BOX_SHADE.bottom, rotUV(uv, 1)],
    [[4, 5, 7, 6], BOX_SHADE.south, rotUV(faceUV || uv, 1)],   // +Z (正面, 顔)
    [[1, 0, 2, 3], BOX_SHADE.north, rotUV(uv, 1)],
    [[1, 3, 7, 5], BOX_SHADE.east, rotUV(uv, 2)],
    [[4, 6, 2, 0], BOX_SHADE.west, rotUV(uv, 2)],
  ];
  for (const [idx, shade, faceUvSet] of faces) {
    const quad = idx.map((i) => corners[i]);
    for (const tri of [[0, 1, 2], [0, 2, 3]]) {
      for (const vi of tri) {
        verts.push(quad[vi][0], quad[vi][1], quad[vi][2], faceUvSet[vi][0], faceUvSet[vi][1], shade, tr, tg, tb);
      }
    }
  }
}
