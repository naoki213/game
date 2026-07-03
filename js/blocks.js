// ---------------------------------------------------------------
// ブロック定義レジストリ
// ---------------------------------------------------------------
"use strict";

// ブロック ID
const B = {
  AIR: 0,
  GRASS: 1,
  DIRT: 2,
  STONE: 3,
  SAND: 4,
  WATER: 5,
  LOG: 6,
  LEAVES: 7,
  PLANK: 8,
  GLASS: 9,
  BRICK: 10,
  COBBLE: 11,
  SNOW: 12,
  BEDROCK: 13,
  COAL_ORE: 14,
  IRON_ORE: 15,
  GLOWSTONE: 16,
  TALL_GRASS: 17,
  FLOWER_YELLOW: 18,
  FLOWER_RED: 19,
  TORCH: 20,
  WOOL: 21,
  GOLD_ORE: 22,
  DIAMOND_ORE: 23,
  GOLD_BLOCK: 24,
  DIAMOND_BLOCK: 25,
};

// 道具・素材アイテム (ID 100 以降はブロックではなく設置不可)
const I = {
  WOOD_PICK: 100,
  STONE_PICK: 101,
  IRON_PICK: 102,
  DIAMOND_PICK: 103,
  WOOD_SWORD: 104,
  STONE_SWORD: 105,
  IRON_SWORD: 106,
  DIAMOND_SWORD: 107,
  IRON_INGOT: 108,
  GOLD_INGOT: 109,
  DIAMOND: 110,
  BOW: 111,
};

// テクスチャアトラス内のタイル番号 (textures.js の描画順と一致させる)
const TILE = {
  GRASS_TOP: 0,
  GRASS_SIDE: 1,
  DIRT: 2,
  STONE: 3,
  SAND: 4,
  WATER: 5,
  LOG_SIDE: 6,
  LOG_TOP: 7,
  LEAVES: 8,
  PLANK: 9,
  GLASS: 10,
  BRICK: 11,
  COBBLE: 12,
  SNOW: 13,
  SNOW_SIDE: 14,
  BEDROCK: 15,
  COAL_ORE: 16,
  IRON_ORE: 17,
  GLOWSTONE: 18,
  TALL_GRASS: 19,
  FLOWER_YELLOW: 20,
  FLOWER_RED: 21,
  CRACK_0: 22,   // 破壊ひび割れ (5 段階)
  CRACK_1: 23,
  CRACK_2: 24,
  CRACK_3: 25,
  CRACK_4: 26,
  TORCH: 27,
  WOOL: 28,
  GOLD_ORE: 29,
  DIAMOND_ORE: 30,
  GOLD_BLOCK: 31,
  DIAMOND_BLOCK: 32,
  PICK_WOOD: 33,
  PICK_STONE: 34,
  PICK_IRON: 35,
  PICK_DIAMOND: 36,
  SWORD_WOOD: 37,
  SWORD_STONE: 38,
  SWORD_IRON: 39,
  SWORD_DIAMOND: 40,
  INGOT_IRON: 41,
  INGOT_GOLD: 42,
  GEM_DIAMOND: 43,
  BOW: 44,
};

// 各ブロックの属性
//   tiles: [top, side, bottom]
//   opaque: 完全不透明 (隣接面をカリングできる / AO を落とす)
//   solid:  当たり判定あり
//   emissive: 自己発光 (シェーディングを弱める)
//   cross: X 字型の板ポリで描画する植生 (草花)
//   hardness: サバイバルで素手破壊にかかる秒数 (Infinity = 破壊不可)
//   drops: 破壊時にドロップするブロック ID (undefined = 自分自身, null = なし)
//   pickable: ピッケルで加速する石系ブロック (素手だと非常に遅い)
//   minTier: ドロップに必要なピッケル階層 (0=素手可 1=木 2=石 3=鉄)
const BLOCKS = [];

function defBlock(id, name, jp, tiles, opts = {}) {
  BLOCKS[id] = {
    id,
    name,
    jp,
    tiles,                       // [top, side, bottom] タイル番号
    opaque: opts.opaque !== false,
    solid: opts.solid !== false,
    emissive: !!opts.emissive,
    cross: !!opts.cross,
    hardness: opts.hardness !== undefined ? opts.hardness : 1.0,
    drops: opts.drops !== undefined ? opts.drops : id,
    pickable: !!opts.pickable,
    minTier: opts.minTier || 0,
  };
}

defBlock(B.AIR, "air", "空気", [0, 0, 0], { opaque: false, solid: false });
defBlock(B.GRASS, "grass", "草ブロック", [TILE.GRASS_TOP, TILE.GRASS_SIDE, TILE.DIRT],
  { hardness: 0.7, drops: B.DIRT });
defBlock(B.DIRT, "dirt", "土", [TILE.DIRT, TILE.DIRT, TILE.DIRT], { hardness: 0.6 });
defBlock(B.STONE, "stone", "石", [TILE.STONE, TILE.STONE, TILE.STONE],
  { hardness: 1.6, drops: B.COBBLE, pickable: true, minTier: 1 });
defBlock(B.SAND, "sand", "砂", [TILE.SAND, TILE.SAND, TILE.SAND], { hardness: 0.6 });
defBlock(B.WATER, "water", "水", [TILE.WATER, TILE.WATER, TILE.WATER],
  { opaque: false, solid: false, hardness: Infinity, drops: null });
defBlock(B.LOG, "log", "原木", [TILE.LOG_TOP, TILE.LOG_SIDE, TILE.LOG_TOP], { hardness: 1.3 });
defBlock(B.LEAVES, "leaves", "葉", [TILE.LEAVES, TILE.LEAVES, TILE.LEAVES],
  { opaque: false, hardness: 0.25, drops: null });
defBlock(B.PLANK, "plank", "木材", [TILE.PLANK, TILE.PLANK, TILE.PLANK], { hardness: 1.2 });
defBlock(B.GLASS, "glass", "ガラス", [TILE.GLASS, TILE.GLASS, TILE.GLASS],
  { opaque: false, hardness: 0.35, drops: null });
defBlock(B.BRICK, "brick", "レンガ", [TILE.BRICK, TILE.BRICK, TILE.BRICK],
  { hardness: 1.8, pickable: true, minTier: 1 });
defBlock(B.COBBLE, "cobblestone", "丸石", [TILE.COBBLE, TILE.COBBLE, TILE.COBBLE],
  { hardness: 1.8, pickable: true, minTier: 1 });
defBlock(B.SNOW, "snow", "雪ブロック", [TILE.SNOW, TILE.SNOW_SIDE, TILE.DIRT],
  { hardness: 0.7, drops: B.DIRT });
defBlock(B.BEDROCK, "bedrock", "岩盤", [TILE.BEDROCK, TILE.BEDROCK, TILE.BEDROCK],
  { hardness: Infinity, drops: null });
defBlock(B.COAL_ORE, "coal_ore", "石炭鉱石", [TILE.COAL_ORE, TILE.COAL_ORE, TILE.COAL_ORE],
  { hardness: 2.2, pickable: true, minTier: 1 });
defBlock(B.IRON_ORE, "iron_ore", "鉄鉱石", [TILE.IRON_ORE, TILE.IRON_ORE, TILE.IRON_ORE],
  { hardness: 2.2, pickable: true, minTier: 2 });
defBlock(B.GLOWSTONE, "glowstone", "グロウストーン", [TILE.GLOWSTONE, TILE.GLOWSTONE, TILE.GLOWSTONE],
  { emissive: true, hardness: 0.4 });
defBlock(B.TALL_GRASS, "tall_grass", "草", [TILE.TALL_GRASS, TILE.TALL_GRASS, TILE.TALL_GRASS],
  { opaque: false, solid: false, cross: true, hardness: 0.05, drops: null });
defBlock(B.FLOWER_YELLOW, "flower_yellow", "タンポポ", [TILE.FLOWER_YELLOW, TILE.FLOWER_YELLOW, TILE.FLOWER_YELLOW],
  { opaque: false, solid: false, cross: true, hardness: 0.05 });
defBlock(B.FLOWER_RED, "flower_red", "ポピー", [TILE.FLOWER_RED, TILE.FLOWER_RED, TILE.FLOWER_RED],
  { opaque: false, solid: false, cross: true, hardness: 0.05 });
defBlock(B.TORCH, "torch", "松明", [TILE.TORCH, TILE.TORCH, TILE.TORCH],
  { opaque: false, solid: false, emissive: true, hardness: 0.05 });
BLOCKS[B.TORCH].torch = true;   // 専用の小型モデルで描画
defBlock(B.WOOL, "wool", "羊毛", [TILE.WOOL, TILE.WOOL, TILE.WOOL], { hardness: 0.8 });
defBlock(B.GOLD_ORE, "gold_ore", "金鉱石", [TILE.GOLD_ORE, TILE.GOLD_ORE, TILE.GOLD_ORE],
  { hardness: 2.6, pickable: true, minTier: 3 });
defBlock(B.DIAMOND_ORE, "diamond_ore", "ダイヤモンド鉱石", [TILE.DIAMOND_ORE, TILE.DIAMOND_ORE, TILE.DIAMOND_ORE],
  { hardness: 2.8, pickable: true, minTier: 3, drops: I.DIAMOND });
defBlock(B.GOLD_BLOCK, "gold_block", "金ブロック", [TILE.GOLD_BLOCK, TILE.GOLD_BLOCK, TILE.GOLD_BLOCK],
  { hardness: 2.4, pickable: true, minTier: 2 });
defBlock(B.DIAMOND_BLOCK, "diamond_block", "ダイヤモンドブロック", [TILE.DIAMOND_BLOCK, TILE.DIAMOND_BLOCK, TILE.DIAMOND_BLOCK],
  { hardness: 2.8, pickable: true, minTier: 3 });

// ---------------- 道具・素材アイテム ----------------
// tool: { kind: "pick"|"sword", tier, speed(採掘倍率), damage, durability }

const ITEMS = {};

function defItem(id, name, jp, tile, tool = null) {
  ITEMS[id] = { id, name, jp, tile, tool };
}

defItem(I.WOOD_PICK, "wood_pick", "木のピッケル", TILE.PICK_WOOD,
  { kind: "pick", tier: 1, speed: 2.5, damage: 3, durability: 60 });
defItem(I.STONE_PICK, "stone_pick", "石のピッケル", TILE.PICK_STONE,
  { kind: "pick", tier: 2, speed: 4.5, damage: 3, durability: 130 });
defItem(I.IRON_PICK, "iron_pick", "鉄のピッケル", TILE.PICK_IRON,
  { kind: "pick", tier: 3, speed: 7, damage: 4, durability: 250 });
defItem(I.DIAMOND_PICK, "diamond_pick", "ダイヤのピッケル", TILE.PICK_DIAMOND,
  { kind: "pick", tier: 4, speed: 10, damage: 4, durability: 600 });
defItem(I.WOOD_SWORD, "wood_sword", "木の剣", TILE.SWORD_WOOD,
  { kind: "sword", tier: 1, speed: 1, damage: 4, durability: 60 });
defItem(I.STONE_SWORD, "stone_sword", "石の剣", TILE.SWORD_STONE,
  { kind: "sword", tier: 2, speed: 1, damage: 5, durability: 130 });
defItem(I.IRON_SWORD, "iron_sword", "鉄の剣", TILE.SWORD_IRON,
  { kind: "sword", tier: 3, speed: 1, damage: 6, durability: 250 });
defItem(I.DIAMOND_SWORD, "diamond_sword", "ダイヤの剣", TILE.SWORD_DIAMOND,
  { kind: "sword", tier: 4, speed: 1, damage: 7, durability: 600 });
defItem(I.BOW, "bow", "弓", TILE.BOW,
  { kind: "bow", tier: 1, speed: 1, damage: 2, durability: 100 });
defItem(I.IRON_INGOT, "iron_ingot", "鉄インゴット", TILE.INGOT_IRON);
defItem(I.GOLD_INGOT, "gold_ingot", "金インゴット", TILE.INGOT_GOLD);
defItem(I.DIAMOND, "diamond", "ダイヤモンド", TILE.GEM_DIAMOND);

// ブロック / アイテムを問わず定義を引く
function getDef(id) {
  return id >= 100 ? ITEMS[id] : BLOCKS[id];
}

// ホットバーに並ぶブロック (1–9 キー)
const HOTBAR_BLOCKS = [
  B.GRASS, B.DIRT, B.STONE, B.PLANK, B.LOG,
  B.LEAVES, B.GLASS, B.BRICK, B.TORCH,
];

function isOpaque(id) { return BLOCKS[id].opaque; }
function isSolid(id) { return BLOCKS[id].solid; }

// 高速参照用 LUT (ライト計算のホットループで使う)
const OPAQUE_LUT = new Uint8Array(256);
const LIGHT_LUT = new Uint8Array(256);   // 発光ブロックの光量 (0..15)
for (const b of BLOCKS) {
  if (!b) continue;
  OPAQUE_LUT[b.id] = b.opaque ? 1 : 0;
  if (b.emissive) LIGHT_LUT[b.id] = b.id === B.TORCH ? 14 : 15;
}
