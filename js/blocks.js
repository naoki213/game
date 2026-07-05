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
  TNT: 26,
  GRAVEL: 27,
  CHEST: 28,
  BED: 29,
  STONE_SLAB: 30,
  PLANK_SLAB: 31,
  WHEAT_0: 32,   // 小麦の成長段階
  WHEAT_1: 33,
  WHEAT_2: 34,
  STONE_BRICK: 35,
  MOSSY_COBBLE: 36,
  ICE: 37,
  BOOKSHELF: 38,
  PUMPKIN: 39,
  OBSIDIAN: 40,
  SANDSTONE: 41,
  // 42-53 は色付き羊毛 (WOOL_COLORS から自動割当)
  SMOOTH_STONE: 54,
  CRACKED_STONE_BRICK: 55,
  CHISELED_STONE_BRICK: 56,
  GRANITE: 57,
  DIORITE: 58,
  ANDESITE: 59,
  QUARTZ: 60,
  DARK_BRICK: 61,
  BIRCH_PLANK: 62,
  DARK_PLANK: 63,
  STONE_BRICK_SLAB: 64,
  BRICK_SLAB: 65,
  SANDSTONE_SLAB: 66,
  // 67-74 色付きガラス, 75-76 原木, 77 ジャック・オ・ランタン,
  // 78-79 鉄/石炭ブロック, 80-85 テラコッタ, 86-98 カーペット
  BIRCH_LOG: 75,
  DARK_LOG: 76,
  JACK_O_LANTERN: 77,
  IRON_BLOCK: 78,
  COAL_BLOCK: 79,
  FARMLAND: 99,
  // 140 以降はオリジナル建築ブロック (100-139 はアイテム用)
  MARBLE: 146,
  MARBLE_BLACK: 147,
  CHECKER: 148,
  TATAMI: 149,
  SHOJI: 150,
  VERMILION: 151,
  COPPER: 152,
  COPPER_OXIDIZED: 153,
  CRYSTAL: 154,
  LAVA_BLOCK: 155,
  ASPHALT: 156,
  ROAD_LINE: 157,
  THATCH: 158,
  STEEL: 159,
  HAZARD: 160,
  PILLAR: 161,
  CLOUD: 162,
  // 173-177: エンダードラゴン討伐に向けたジ・エンド関連ブロック
  END_STONE: 173,
  END_PORTAL_FRAME: 174,
  END_PORTAL_FRAME_EYE: 175,
  END_PORTAL: 176,
  END_CRYSTAL: 177,
  // 178-182: ネザー関連ブロック
  NETHERRACK: 178,
  SOUL_SAND: 179,
  NETHER_QUARTZ_ORE: 180,
  NETHER_PORTAL: 181,
  NETHER_BRICK: 182,
  // 186-187: ウィザー召喚 (ソウルサンド + ウィザースケルトンの頭蓋骨のレア
  // ドロップで T 字に組むと召喚される) 関連
  WITHER_SKULL: 186,
  NETHER_STAR: 187,
  // 216-224 はドア (8方向x開閉, DOOR_ID_BASE) で使用済みのため 225 以降を使う
  FENCE_PLANK: 225,
  CRAFTING_TABLE: 226,
};

// コンクリート (なめらかな単色 8 色, ID 163-170 / タイル 150-157)
const CONCRETE_ID_BASE = 163;
const CONCRETE_TILE_BASE = 150;
const CONCRETE_COLORS = [
  ["white", "白コンクリート", [225, 227, 228]],
  ["gray", "灰コンクリート", [125, 128, 132]],
  ["black", "黒コンクリート", [42, 44, 48]],
  ["red", "赤コンクリート", [185, 50, 48]],
  ["orange", "橙コンクリート", [228, 120, 30]],
  ["yellow", "黄コンクリート", [235, 200, 45]],
  ["green", "緑コンクリート", [80, 160, 60]],
  ["blue", "青コンクリート", [55, 90, 190]],
];

// ネオンブロック (発光 6 色, ID 140-145 / タイル 127-132)
const NEON_ID_BASE = 140;
const NEON_TILE_BASE = 127;
const NEON_COLORS = [
  ["red", "赤ネオン", [255, 80, 80]],
  ["blue", "青ネオン", [80, 130, 255]],
  ["green", "緑ネオン", [90, 255, 120]],
  ["pink", "ピンクネオン", [255, 110, 220]],
  ["cyan", "水色ネオン", [80, 235, 255]],
  ["yellow", "黄ネオン", [255, 235, 90]],
];

// 色付きガラス (8 色, ID 67-74 / タイル 90-97)
const SGLASS_ID_BASE = 67;
const SGLASS_TILE_BASE = 90;
const SGLASS_COLORS = [
  ["red", "赤のガラス", [210, 60, 60]],
  ["yellow", "黄のガラス", [230, 210, 70]],
  ["green", "緑のガラス", [90, 170, 80]],
  ["lightblue", "空色のガラス", [120, 190, 230]],
  ["blue", "青のガラス", [70, 90, 200]],
  ["purple", "紫のガラス", [150, 80, 190]],
  ["pink", "桃色のガラス", [235, 150, 190]],
  ["black", "黒のガラス", [55, 55, 60]],
];

// テラコッタ (6 色, ID 80-85 / タイル 103-108)
const TERRA_ID_BASE = 80;
const TERRA_TILE_BASE = 103;
const TERRA_COLORS = [
  ["white", "白のテラコッタ", [205, 180, 165]],
  ["orange", "橙のテラコッタ", [160, 85, 40]],
  ["red", "赤のテラコッタ", [140, 60, 45]],
  ["brown", "茶のテラコッタ", [95, 62, 45]],
  ["cyan", "青緑のテラコッタ", [85, 92, 92]],
  ["gray", "灰のテラコッタ", [58, 42, 36]],
];

// カーペット (白 + 羊毛 12 色, ID 86-98, タイルは羊毛を流用)
const CARPET_ID_BASE = 86;

// 色付き羊毛 (建築の彩り用)
const WOOL_ID_BASE = 42;
const WOOL_TILE_BASE = 68;
const WOOL_COLORS = [
  ["red", "赤の羊毛", [190, 55, 50]],
  ["orange", "橙の羊毛", [235, 140, 40]],
  ["yellow", "黄の羊毛", [235, 205, 60]],
  ["lime", "黄緑の羊毛", [140, 200, 60]],
  ["green", "緑の羊毛", [75, 130, 55]],
  ["lightblue", "空色の羊毛", [120, 180, 230]],
  ["blue", "青の羊毛", [60, 80, 180]],
  ["purple", "紫の羊毛", [140, 70, 180]],
  ["pink", "桃色の羊毛", [235, 150, 180]],
  ["gray", "灰色の羊毛", [110, 110, 115]],
  ["black", "黒の羊毛", [40, 40, 45]],
  ["brown", "茶色の羊毛", [115, 75, 50]],
];

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
  PORK: 112,
  BEEF: 113,
  CHICKEN_MEAT: 114,
  SEEDS: 115,
  WHEAT: 116,
  BREAD: 117,
  WOOD_AXE: 118,
  STONE_AXE: 119,
  IRON_AXE: 120,
  DIAMOND_AXE: 121,
  WOOD_SHOVEL: 122,
  STONE_SHOVEL: 123,
  IRON_SHOVEL: 124,
  DIAMOND_SHOVEL: 125,
  WOOD_HOE: 126,
  STONE_HOE: 127,
  IRON_HOE: 128,
  DIAMOND_HOE: 129,
  GOLD_PICK: 130,
  GOLD_SWORD: 131,
  SHEARS: 132,
  FISHING_ROD: 133,
  FISH: 134,
  // エンダードラゴン討伐関連
  ENDER_PEARL: 135,
  EYE_OF_ENDER: 136,
  GUNPOWDER: 137,
  // ネザー関連
  FLINT: 138,
  FLINT_AND_STEEL: 139,
  // 100-139 のアイテム区画が埋まったため, ブロック側で未使用の 183 以降を使う
  // (140-145 はネオンブロックの ID と衝突するため使用しない)
  NETHER_QUARTZ: 183,
  BLAZE_ROD: 184,
  COMPASS: 185,
  BONE: 188,   // 186-187 は B.WITHER_SKULL / B.NETHER_STAR で使用済み
  // 189-212 は階段ブロック (B側) で使用済みのため 213 以降を使う
  BUCKET: 213,
  WATER_BUCKET: 214,
  LAVA_BUCKET: 215,
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
  PORK: 45,
  BEEF: 46,
  CHICKEN_MEAT: 47,
  TNT_SIDE: 48,
  TNT_TOP: 49,
  GRAVEL: 50,
  CHEST_SIDE: 51,
  CHEST_TOP: 52,
  BED_TOP: 53,
  WHEAT_0: 54,
  WHEAT_1: 55,
  WHEAT_2: 56,
  SEEDS: 57,
  WHEAT_ITEM: 58,
  BREAD: 59,
  STONE_BRICK: 60,
  MOSSY_COBBLE: 61,
  ICE: 62,
  BOOKSHELF: 63,
  PUMPKIN_SIDE: 64,
  PUMPKIN_TOP: 65,
  OBSIDIAN: 66,
  SANDSTONE: 67,
  // 68-79 は色付き羊毛
  SMOOTH_STONE: 80,
  CRACKED_STONE_BRICK: 81,
  CHISELED_STONE_BRICK: 82,
  GRANITE: 83,
  DIORITE: 84,
  ANDESITE: 85,
  QUARTZ: 86,
  DARK_BRICK: 87,
  BIRCH_PLANK: 88,
  DARK_PLANK: 89,
  // 90-97 色付きガラス
  BIRCH_LOG_SIDE: 98,
  DARK_LOG_SIDE: 99,
  JACK_O_FACE: 100,
  IRON_BLOCK: 101,
  COAL_BLOCK: 102,
  // 103-108 テラコッタ
  AXE_WOOD: 109,
  AXE_STONE: 110,
  AXE_IRON: 111,
  AXE_DIAMOND: 112,
  SHOVEL_WOOD: 113,
  SHOVEL_STONE: 114,
  SHOVEL_IRON: 115,
  SHOVEL_DIAMOND: 116,
  HOE_WOOD: 117,
  HOE_STONE: 118,
  HOE_IRON: 119,
  HOE_DIAMOND: 120,
  PICK_GOLD: 121,
  SWORD_GOLD: 122,
  SHEARS: 123,
  FISHING_ROD: 124,
  FISH: 125,
  FARMLAND: 126,
  // 127-132 ネオン
  MARBLE: 133,
  MARBLE_BLACK: 134,
  CHECKER: 135,
  TATAMI: 136,
  SHOJI: 137,
  VERMILION: 138,
  COPPER: 139,
  COPPER_OXIDIZED: 140,
  CRYSTAL: 141,
  LAVA_BLOCK: 142,
  ASPHALT: 143,
  ROAD_LINE: 144,
  THATCH: 145,
  STEEL: 146,
  HAZARD: 147,
  PILLAR: 148,
  CLOUD: 149,
  // 158-165: エンダードラゴン討伐関連 (150-157 はコンクリート)
  ENDER_PEARL: 158,
  EYE_OF_ENDER: 159,
  GUNPOWDER: 160,
  END_STONE: 161,
  END_PORTAL_FRAME: 162,
  END_PORTAL_FRAME_EYE: 163,
  END_PORTAL: 164,
  END_CRYSTAL: 165,
  // ネザー関連
  NETHERRACK: 166,
  SOUL_SAND: 167,
  NETHER_QUARTZ_ORE: 168,
  NETHER_PORTAL: 169,
  NETHER_BRICK: 170,
  FLINT: 171,
  FLINT_AND_STEEL: 172,
  NETHER_QUARTZ: 173,
  BLAZE_ROD: 174,
  COMPASS: 175,
  WITHER_SKULL: 176,
  NETHER_STAR: 177,
  BONE: 178,
  // モブの模様入りスキン (ボックスモデルにテクスチャを貼る)
  MOB_ZOMBIE_SKIN: 179,
  MOB_ZOMBIE_CLOTH: 180,
  MOB_SHEEP_WOOL: 181,
  MOB_SHEEP_SKIN: 182,
  MOB_CREEPER_SKIN: 183,
  MOB_COW_PATCH: 184,
  MOB_COW_BROWN: 185,
  MOB_PIG_SKIN: 186,
  MOB_SKELETON_BONE: 187,
  MOB_SPIDER_FUR: 188,
  MOB_ENDERMAN_SKIN: 189,
  MOB_CHICKEN_FEATHER: 190,
  MOB_VILLAGER_ROBE: 191,
  MOB_VILLAGER_SKIN: 192,
  MOB_WOLF_FUR: 193,
  MOB_PIGMAN_SKIN: 194,
  MOB_BLAZE_FIRE: 195,
  MOB_WITHER_SKELETON_BONE: 196,
  MOB_GHAST_BODY: 197,
  // モブの顔 (頭の正面だけに貼る専用タイル)
  MOB_CREEPER_FACE: 198,
  MOB_ZOMBIE_FACE: 199,
  MOB_SKELETON_FACE: 200,
  MOB_COW_FACE: 201,
  MOB_PIG_FACE: 202,
  MOB_SHEEP_FACE: 203,
  MOB_WOLF_FACE: 204,
  MOB_PIGMAN_FACE: 205,
  MOB_WITHER_SKELETON_FACE: 206,
  MOB_CHICKEN_FACE: 207,
  MOB_BLAZE_FACE: 208,
  // バケツ (アイテムアイコン用)
  BUCKET: 209,
  WATER_BUCKET: 210,
  LAVA_BUCKET: 211,
  // 建具 / 作業台
  DOOR_WOOD: 212,
  CRAFTING_TABLE_TOP: 213,
  CRAFTING_TABLE_SIDE: 214,
  DOOR_WOOD_TOP: 215,
  BED_HEAD_TOP: 216,
  BED_FOOT_TOP: 217,
  BED_SIDE: 218,
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
//   height: ブロックの高さ (ハーフブロック = 0.5, 通常 = 1)
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
    height: opts.height || 1,
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
defBlock(B.TNT, "tnt", "TNT", [TILE.TNT_TOP, TILE.TNT_SIDE, TILE.TNT_TOP], { hardness: 0.1 });
defBlock(B.GRAVEL, "gravel", "砂利", [TILE.GRAVEL, TILE.GRAVEL, TILE.GRAVEL], { hardness: 0.7 });
defBlock(B.CHEST, "chest", "チェスト", [TILE.CHEST_TOP, TILE.CHEST_SIDE, TILE.CHEST_TOP], { hardness: 1.2 });
defBlock(B.BED, "bed", "ベッド", [TILE.BED_TOP, TILE.PLANK, TILE.PLANK], { hardness: 0.5 });
defBlock(B.STONE_SLAB, "stone_slab", "石ハーフブロック", [TILE.STONE, TILE.STONE, TILE.STONE],
  { hardness: 1.4, pickable: true, minTier: 1, opaque: false, height: 0.5 });
defBlock(B.PLANK_SLAB, "plank_slab", "木材ハーフブロック", [TILE.PLANK, TILE.PLANK, TILE.PLANK],
  { hardness: 1.0, opaque: false, height: 0.5 });
defBlock(B.WHEAT_0, "wheat_0", "小麦 (芽)", [TILE.WHEAT_0, TILE.WHEAT_0, TILE.WHEAT_0],
  { opaque: false, solid: false, cross: true, hardness: 0.05, drops: null });
defBlock(B.WHEAT_1, "wheat_1", "小麦 (成長中)", [TILE.WHEAT_1, TILE.WHEAT_1, TILE.WHEAT_1],
  { opaque: false, solid: false, cross: true, hardness: 0.05, drops: null });
defBlock(B.WHEAT_2, "wheat_2", "小麦 (実り)", [TILE.WHEAT_2, TILE.WHEAT_2, TILE.WHEAT_2],
  { opaque: false, solid: false, cross: true, hardness: 0.05, drops: null });
defBlock(B.STONE_BRICK, "stone_brick", "石レンガ", [TILE.STONE_BRICK, TILE.STONE_BRICK, TILE.STONE_BRICK],
  { hardness: 1.8, pickable: true, minTier: 1 });
defBlock(B.MOSSY_COBBLE, "mossy_cobble", "苔むした丸石", [TILE.MOSSY_COBBLE, TILE.MOSSY_COBBLE, TILE.MOSSY_COBBLE],
  { hardness: 1.8, pickable: true, minTier: 1 });
defBlock(B.ICE, "ice", "氷", [TILE.ICE, TILE.ICE, TILE.ICE],
  { hardness: 0.4, drops: null });
defBlock(B.BOOKSHELF, "bookshelf", "本棚", [TILE.PLANK, TILE.BOOKSHELF, TILE.PLANK],
  { hardness: 1.2, drops: B.PLANK });
defBlock(B.PUMPKIN, "pumpkin", "カボチャ", [TILE.PUMPKIN_TOP, TILE.PUMPKIN_SIDE, TILE.PUMPKIN_TOP],
  { hardness: 0.8 });
defBlock(B.OBSIDIAN, "obsidian", "黒曜石", [TILE.OBSIDIAN, TILE.OBSIDIAN, TILE.OBSIDIAN],
  { hardness: 12, pickable: true, minTier: 4 });
defBlock(B.SANDSTONE, "sandstone", "砂岩", [TILE.SANDSTONE, TILE.SANDSTONE, TILE.SANDSTONE],
  { hardness: 1.5, pickable: true, minTier: 1 });

// --- 色付き羊毛 12 色 ---
WOOL_COLORS.forEach(([name, jp], i) => {
  const t = WOOL_TILE_BASE + i;
  defBlock(WOOL_ID_BASE + i, "wool_" + name, jp, [t, t, t], { hardness: 0.8 });
});

// --- 石材バリエーション ---
const stoneOpts = { hardness: 1.8, pickable: true, minTier: 1 };
defBlock(B.SMOOTH_STONE, "smooth_stone", "磨かれた石",
  [TILE.SMOOTH_STONE, TILE.SMOOTH_STONE, TILE.SMOOTH_STONE], stoneOpts);
defBlock(B.CRACKED_STONE_BRICK, "cracked_stone_brick", "ひび割れた石レンガ",
  [TILE.CRACKED_STONE_BRICK, TILE.CRACKED_STONE_BRICK, TILE.CRACKED_STONE_BRICK], stoneOpts);
defBlock(B.CHISELED_STONE_BRICK, "chiseled_stone_brick", "模様入り石レンガ",
  [TILE.CHISELED_STONE_BRICK, TILE.CHISELED_STONE_BRICK, TILE.CHISELED_STONE_BRICK], stoneOpts);
defBlock(B.GRANITE, "granite", "花崗岩",
  [TILE.GRANITE, TILE.GRANITE, TILE.GRANITE], stoneOpts);
defBlock(B.DIORITE, "diorite", "閃緑岩",
  [TILE.DIORITE, TILE.DIORITE, TILE.DIORITE], stoneOpts);
defBlock(B.ANDESITE, "andesite", "安山岩",
  [TILE.ANDESITE, TILE.ANDESITE, TILE.ANDESITE], stoneOpts);
defBlock(B.QUARTZ, "quartz", "クォーツブロック",
  [TILE.QUARTZ, TILE.QUARTZ, TILE.QUARTZ], stoneOpts);
defBlock(B.DARK_BRICK, "dark_brick", "黒レンガ",
  [TILE.DARK_BRICK, TILE.DARK_BRICK, TILE.DARK_BRICK], stoneOpts);

// --- 木材バリエーション ---
defBlock(B.BIRCH_PLANK, "birch_plank", "白樺の木材",
  [TILE.BIRCH_PLANK, TILE.BIRCH_PLANK, TILE.BIRCH_PLANK], { hardness: 1.2 });
defBlock(B.DARK_PLANK, "dark_plank", "ダークオークの木材",
  [TILE.DARK_PLANK, TILE.DARK_PLANK, TILE.DARK_PLANK], { hardness: 1.2 });

// --- 色付きガラス (ディザ半透明) ---
SGLASS_COLORS.forEach(([name, jp], i) => {
  const t = SGLASS_TILE_BASE + i;
  defBlock(SGLASS_ID_BASE + i, "glass_" + name, jp, [t, t, t],
    { opaque: false, hardness: 0.35, drops: null });
});

// --- 原木バリエーション ---
defBlock(B.BIRCH_LOG, "birch_log", "白樺の原木",
  [TILE.LOG_TOP, TILE.BIRCH_LOG_SIDE, TILE.LOG_TOP], { hardness: 1.3 });
defBlock(B.DARK_LOG, "dark_log", "ダークオークの原木",
  [TILE.LOG_TOP, TILE.DARK_LOG_SIDE, TILE.LOG_TOP], { hardness: 1.3 });

// --- ジャック・オ・ランタン (光源) ---
defBlock(B.JACK_O_LANTERN, "jack_o_lantern", "ジャック・オ・ランタン",
  [TILE.PUMPKIN_TOP, TILE.JACK_O_FACE, TILE.PUMPKIN_TOP],
  { hardness: 0.8, emissive: true });

// --- 鉱物ブロック ---
defBlock(B.IRON_BLOCK, "iron_block", "鉄ブロック",
  [TILE.IRON_BLOCK, TILE.IRON_BLOCK, TILE.IRON_BLOCK],
  { hardness: 2.4, pickable: true, minTier: 2 });
defBlock(B.COAL_BLOCK, "coal_block", "石炭ブロック",
  [TILE.COAL_BLOCK, TILE.COAL_BLOCK, TILE.COAL_BLOCK],
  { hardness: 2.0, pickable: true, minTier: 1 });

// --- テラコッタ 6 色 ---
TERRA_COLORS.forEach(([name, jp], i) => {
  const t = TERRA_TILE_BASE + i;
  defBlock(TERRA_ID_BASE + i, "terracotta_" + name, jp, [t, t, t],
    { hardness: 1.6, pickable: true, minTier: 1 });
});

// --- カーペット (高さ 1/16 の極薄ブロック, 羊毛タイルを流用) ---
defBlock(CARPET_ID_BASE, "carpet_white", "白のカーペット",
  [TILE.WOOL, TILE.WOOL, TILE.WOOL],
  { hardness: 0.2, opaque: false, height: 0.0625 });
WOOL_COLORS.forEach(([name, jp], i) => {
  const t = WOOL_TILE_BASE + i;
  defBlock(CARPET_ID_BASE + 1 + i, "carpet_" + name, jp.replace("の羊毛", "のカーペット"),
    [t, t, t], { hardness: 0.2, opaque: false, height: 0.0625 });
});

// --- ハーフブロック追加 ---
defBlock(B.STONE_BRICK_SLAB, "stone_brick_slab", "石レンガハーフ",
  [TILE.STONE_BRICK, TILE.STONE_BRICK, TILE.STONE_BRICK],
  { hardness: 1.6, pickable: true, minTier: 1, opaque: false, height: 0.5 });
defBlock(B.BRICK_SLAB, "brick_slab", "レンガハーフ",
  [TILE.BRICK, TILE.BRICK, TILE.BRICK],
  { hardness: 1.6, pickable: true, minTier: 1, opaque: false, height: 0.5 });
defBlock(B.SANDSTONE_SLAB, "sandstone_slab", "砂岩ハーフ",
  [TILE.SANDSTONE, TILE.SANDSTONE, TILE.SANDSTONE],
  { hardness: 1.4, pickable: true, minTier: 1, opaque: false, height: 0.5 });
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

function defItem(id, name, jp, tile, tool = null, food = 0) {
  ITEMS[id] = { id, name, jp, tile, tool, food };
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
defItem(I.PORK, "pork", "豚肉", TILE.PORK, null, 8);
defItem(I.BEEF, "beef", "牛肉", TILE.BEEF, null, 8);
defItem(I.CHICKEN_MEAT, "chicken_meat", "鶏肉", TILE.CHICKEN_MEAT, null, 6);
defItem(I.SEEDS, "seeds", "小麦の種", TILE.SEEDS);
ITEMS[I.SEEDS].seeds = true;   // 土 / 草 / 農地の上に植えられる
defItem(I.WHEAT, "wheat", "小麦", TILE.WHEAT_ITEM);
defItem(I.BREAD, "bread", "パン", TILE.BREAD, null, 10);

// --- 斧 (木こりが速くなる) ---
defItem(I.WOOD_AXE, "wood_axe", "木の斧", TILE.AXE_WOOD,
  { kind: "axe", tier: 1, speed: 2.5, damage: 3, durability: 60 });
defItem(I.STONE_AXE, "stone_axe", "石の斧", TILE.AXE_STONE,
  { kind: "axe", tier: 2, speed: 4.5, damage: 4, durability: 130 });
defItem(I.IRON_AXE, "iron_axe", "鉄の斧", TILE.AXE_IRON,
  { kind: "axe", tier: 3, speed: 7, damage: 5, durability: 250 });
defItem(I.DIAMOND_AXE, "diamond_axe", "ダイヤの斧", TILE.AXE_DIAMOND,
  { kind: "axe", tier: 4, speed: 10, damage: 6, durability: 600 });

// --- シャベル (土掘りが速くなる) ---
defItem(I.WOOD_SHOVEL, "wood_shovel", "木のシャベル", TILE.SHOVEL_WOOD,
  { kind: "shovel", tier: 1, speed: 2.5, damage: 2, durability: 60 });
defItem(I.STONE_SHOVEL, "stone_shovel", "石のシャベル", TILE.SHOVEL_STONE,
  { kind: "shovel", tier: 2, speed: 4.5, damage: 3, durability: 130 });
defItem(I.IRON_SHOVEL, "iron_shovel", "鉄のシャベル", TILE.SHOVEL_IRON,
  { kind: "shovel", tier: 3, speed: 7, damage: 3, durability: 250 });
defItem(I.DIAMOND_SHOVEL, "diamond_shovel", "ダイヤのシャベル", TILE.SHOVEL_DIAMOND,
  { kind: "shovel", tier: 4, speed: 10, damage: 4, durability: 600 });

// --- クワ (土を耕して農地にする) ---
defItem(I.WOOD_HOE, "wood_hoe", "木のクワ", TILE.HOE_WOOD,
  { kind: "hoe", tier: 1, speed: 1, damage: 2, durability: 60 });
defItem(I.STONE_HOE, "stone_hoe", "石のクワ", TILE.HOE_STONE,
  { kind: "hoe", tier: 2, speed: 1, damage: 2, durability: 130 });
defItem(I.IRON_HOE, "iron_hoe", "鉄のクワ", TILE.HOE_IRON,
  { kind: "hoe", tier: 3, speed: 1, damage: 2, durability: 250 });
defItem(I.DIAMOND_HOE, "diamond_hoe", "ダイヤのクワ", TILE.HOE_DIAMOND,
  { kind: "hoe", tier: 4, speed: 1, damage: 2, durability: 600 });

// --- 金の道具 (超高速だがすぐ壊れる) ---
defItem(I.GOLD_PICK, "gold_pick", "金のピッケル", TILE.PICK_GOLD,
  { kind: "pick", tier: 2, speed: 12, damage: 3, durability: 40 });
defItem(I.GOLD_SWORD, "gold_sword", "金の剣", TILE.SWORD_GOLD,
  { kind: "sword", tier: 2, speed: 1, damage: 5, durability: 40 });

// --- ハサミ (ヒツジの毛刈り) / 釣竿 ---
defItem(I.SHEARS, "shears", "ハサミ", TILE.SHEARS,
  { kind: "shears", tier: 1, speed: 1, damage: 1, durability: 60 });
defItem(I.FISHING_ROD, "fishing_rod", "釣竿", TILE.FISHING_ROD,
  { kind: "rod", tier: 1, speed: 1, damage: 1, durability: 40 });
defItem(I.FISH, "fish", "魚", TILE.FISH, null, 6);

// --- エンダードラゴン討伐関連アイテム ---
defItem(I.ENDER_PEARL, "ender_pearl", "エンダーパール", TILE.ENDER_PEARL);
defItem(I.EYE_OF_ENDER, "eye_of_ender", "エンダーアイ", TILE.EYE_OF_ENDER);
defItem(I.GUNPOWDER, "gunpowder", "火薬", TILE.GUNPOWDER);

// --- ネザー関連アイテム ---
defItem(I.FLINT, "flint", "火打ち石", TILE.FLINT);
defItem(I.FLINT_AND_STEEL, "flint_and_steel", "火打ち石と鉄", TILE.FLINT_AND_STEEL,
  { kind: "flint_and_steel", tier: 1, speed: 1, damage: 1, durability: 32 });
defItem(I.NETHER_QUARTZ, "nether_quartz", "ネザー水晶", TILE.NETHER_QUARTZ);
defItem(I.BLAZE_ROD, "blaze_rod", "ブレイズロッド", TILE.BLAZE_ROD);
defItem(I.COMPASS, "compass", "コンパス", TILE.COMPASS);
defItem(I.BONE, "bone", "ホネ", TILE.BONE);

// --- バケツ: 空バケツで水/マグマの発生源をすくうと入り数バケツになり,
// 使うと中身を設置して空バケツに戻る (main.js の placeAction 参照) ---
defItem(I.BUCKET, "bucket", "バケツ", TILE.BUCKET, { kind: "bucket" });
defItem(I.WATER_BUCKET, "water_bucket", "水入りバケツ", TILE.WATER_BUCKET,
  { kind: "fluid_bucket", fluid: B.WATER });
defItem(I.LAVA_BUCKET, "lava_bucket", "マグマ入りバケツ", TILE.LAVA_BUCKET,
  { kind: "fluid_bucket", fluid: B.LAVA_BLOCK });

// --- オリジナル建築ブロック ---

// ネオン 6 色 (光源)
NEON_COLORS.forEach(([name, jp], i) => {
  const t = NEON_TILE_BASE + i;
  defBlock(NEON_ID_BASE + i, "neon_" + name, jp, [t, t, t],
    { hardness: 0.4, emissive: true });
});

const deco = { hardness: 1.6, pickable: true, minTier: 1 };
defBlock(B.MARBLE, "marble", "大理石", [TILE.MARBLE, TILE.MARBLE, TILE.MARBLE], deco);
defBlock(B.MARBLE_BLACK, "marble_black", "黒大理石",
  [TILE.MARBLE_BLACK, TILE.MARBLE_BLACK, TILE.MARBLE_BLACK], deco);
defBlock(B.CHECKER, "checker", "市松ブロック", [TILE.CHECKER, TILE.CHECKER, TILE.CHECKER], deco);
defBlock(B.TATAMI, "tatami", "畳", [TILE.TATAMI, TILE.TATAMI, TILE.TATAMI], { hardness: 0.8 });
defBlock(B.SHOJI, "shoji", "障子", [TILE.SHOJI, TILE.SHOJI, TILE.SHOJI],
  { hardness: 0.4, opaque: false, drops: null });
defBlock(B.VERMILION, "vermilion", "朱塗りブロック",
  [TILE.VERMILION, TILE.VERMILION, TILE.VERMILION], { hardness: 1.2 });
defBlock(B.COPPER, "copper", "銅ブロック", [TILE.COPPER, TILE.COPPER, TILE.COPPER], deco);
defBlock(B.COPPER_OXIDIZED, "copper_oxidized", "緑青の銅",
  [TILE.COPPER_OXIDIZED, TILE.COPPER_OXIDIZED, TILE.COPPER_OXIDIZED], deco);
defBlock(B.CRYSTAL, "crystal", "クリスタル", [TILE.CRYSTAL, TILE.CRYSTAL, TILE.CRYSTAL],
  { hardness: 0.8, opaque: false, emissive: true });
defBlock(B.LAVA_BLOCK, "lava_block", "溶岩",
  [TILE.LAVA_BLOCK, TILE.LAVA_BLOCK, TILE.LAVA_BLOCK],
  { opaque: false, solid: false, hardness: Infinity, drops: null, emissive: true });
defBlock(B.ASPHALT, "asphalt", "アスファルト", [TILE.ASPHALT, TILE.ASPHALT, TILE.ASPHALT], deco);
defBlock(B.ROAD_LINE, "road_line", "白線アスファルト",
  [TILE.ROAD_LINE, TILE.ASPHALT, TILE.ASPHALT], deco);
defBlock(B.THATCH, "thatch", "わらブロック", [TILE.THATCH, TILE.THATCH, TILE.THATCH],
  { hardness: 0.6 });
defBlock(B.STEEL, "steel", "スチールパネル", [TILE.STEEL, TILE.STEEL, TILE.STEEL],
  { hardness: 2.2, pickable: true, minTier: 2 });
defBlock(B.HAZARD, "hazard", "危険ストライプ", [TILE.HAZARD, TILE.HAZARD, TILE.HAZARD], deco);
defBlock(B.PILLAR, "pillar", "白い柱", [TILE.MARBLE, TILE.PILLAR, TILE.MARBLE], deco);
defBlock(B.CLOUD, "cloud", "雲ブロック", [TILE.CLOUD, TILE.CLOUD, TILE.CLOUD],
  { hardness: 0.3, emissive: true }); // ほんのり光り, 下から見ても暗くならない

// コンクリート 8 色 (モダン建築向けのなめらかな単色)
CONCRETE_COLORS.forEach(([name, jp], i) => {
  const t = CONCRETE_TILE_BASE + i;
  defBlock(CONCRETE_ID_BASE + i, "concrete_" + name, jp, [t, t, t], deco);
});

// --- ジ・エンド関連ブロック ---
defBlock(B.END_STONE, "end_stone", "エンドストーン",
  [TILE.END_STONE, TILE.END_STONE, TILE.END_STONE],
  { hardness: 2.2, pickable: true, minTier: 1 });
defBlock(B.END_PORTAL_FRAME, "end_portal_frame", "エンドポータルフレーム",
  [TILE.END_PORTAL_FRAME, TILE.END_PORTAL_FRAME, TILE.END_PORTAL_FRAME],
  { hardness: Infinity, drops: null });
defBlock(B.END_PORTAL_FRAME_EYE, "end_portal_frame_eye", "エンダーアイ入りフレーム",
  [TILE.END_PORTAL_FRAME_EYE, TILE.END_PORTAL_FRAME, TILE.END_PORTAL_FRAME],
  { hardness: Infinity, drops: null, emissive: true });
defBlock(B.END_PORTAL, "end_portal", "エンドポータル",
  [TILE.END_PORTAL, TILE.END_PORTAL, TILE.END_PORTAL],
  { hardness: Infinity, drops: null, solid: false, opaque: false, emissive: true });
defBlock(B.END_CRYSTAL, "end_crystal", "エンダークリスタル",
  [TILE.END_CRYSTAL, TILE.END_CRYSTAL, TILE.END_CRYSTAL],
  { hardness: 1.0, drops: null, emissive: true });

// --- ネザー関連ブロック ---
defBlock(B.NETHERRACK, "netherrack", "ネザーラック",
  [TILE.NETHERRACK, TILE.NETHERRACK, TILE.NETHERRACK],
  { hardness: 1.2, pickable: true, minTier: 1 });
defBlock(B.SOUL_SAND, "soul_sand", "ソウルサンド",
  [TILE.SOUL_SAND, TILE.SOUL_SAND, TILE.SOUL_SAND], { hardness: 1.0 });
defBlock(B.NETHER_QUARTZ_ORE, "nether_quartz_ore", "ネザー水晶鉱石",
  [TILE.NETHER_QUARTZ_ORE, TILE.NETHER_QUARTZ_ORE, TILE.NETHER_QUARTZ_ORE],
  { hardness: 1.8, pickable: true, minTier: 1, drops: I.NETHER_QUARTZ });
defBlock(B.NETHER_PORTAL, "nether_portal", "ネザーポータル",
  [TILE.NETHER_PORTAL, TILE.NETHER_PORTAL, TILE.NETHER_PORTAL],
  { hardness: Infinity, drops: null, solid: false, opaque: false, emissive: true });
defBlock(B.NETHER_BRICK, "nether_brick", "ネザーレンガ",
  [TILE.NETHER_BRICK, TILE.NETHER_BRICK, TILE.NETHER_BRICK],
  { hardness: 2.0, pickable: true, minTier: 1 });

// --- ウィザー召喚関連 ---
defBlock(B.WITHER_SKULL, "wither_skull", "ウィザースケルトンの頭蓋骨",
  [TILE.WITHER_SKULL, TILE.WITHER_SKULL, TILE.WITHER_SKULL],
  { hardness: 1.0, pickable: true, minTier: 0 });
defBlock(B.NETHER_STAR, "nether_star", "ネザースター",
  [TILE.NETHER_STAR, TILE.NETHER_STAR, TILE.NETHER_STAR],
  { hardness: 1.0, drops: null, emissive: true });

// --- 農地 (クワで耕した土, 上面がわずかに低い) ---
defBlock(B.FARMLAND, "farmland", "農地", [TILE.FARMLAND, TILE.DIRT, TILE.DIRT],
  { hardness: 0.6, opaque: false, height: 0.9375, drops: B.DIRT });

// --- 階段ブロック ---
// L字形状 (下半分は全面, 上半分は奥側だけ) の専用メッシュで描画する (mesher.js)。
// 設置時のプレイヤーの向きに応じて north/east/south/west の 4 方向のうち
// 1 つに自動で回転する (main.js の placeAction 参照)。
// 当たり判定はハーフブロック (height: 0.5) と同じ扱いにし、既存の低い段差
// 自動よじ登り (player.js moveAxis) でそのまま歩いて上れるようにする。
const STAIR_ID_BASE = 189;   // 189-212: 6 素材 x 4 方向
const STAIR_DIRS = ["north", "east", "south", "west"]; // yaw 0/90/180/270° 順
const STAIR_MATERIALS = [
  ["stone_stairs", "石の階段", [TILE.STONE, TILE.STONE, TILE.STONE],
    { hardness: 1.6, pickable: true, minTier: 1 }],
  ["cobble_stairs", "丸石の階段", [TILE.COBBLE, TILE.COBBLE, TILE.COBBLE],
    { hardness: 1.8, pickable: true, minTier: 1 }],
  ["plank_stairs", "木材の階段", [TILE.PLANK, TILE.PLANK, TILE.PLANK],
    { hardness: 1.2 }],
  ["stone_brick_stairs", "石レンガの階段", [TILE.STONE_BRICK, TILE.STONE_BRICK, TILE.STONE_BRICK],
    { hardness: 1.8, pickable: true, minTier: 1 }],
  ["brick_stairs", "レンガの階段", [TILE.BRICK, TILE.BRICK, TILE.BRICK],
    { hardness: 1.8, pickable: true, minTier: 1 }],
  ["sandstone_stairs", "砂岩の階段", [TILE.SANDSTONE, TILE.SANDSTONE, TILE.SANDSTONE],
    { hardness: 1.4, pickable: true, minTier: 1 }],
];
STAIR_MATERIALS.forEach(([name, jp, tiles, opts], mi) => {
  const baseId = STAIR_ID_BASE + mi * 4;
  STAIR_DIRS.forEach((dirName, di) => {
    const id = baseId + di;
    defBlock(id, name + "_" + dirName, jp, tiles,
      { ...opts, opaque: false, height: 0.5, drops: baseId });
    BLOCKS[id].stairs = true;
    BLOCKS[id].stairDir = di;   // 0=north(-z) 1=east(+x) 2=south(+z) 3=west(-x): 低い段の開いている向き
  });
});

// --- ドア: 本家同様に下段+上段の2マス1組。薄い板状の専用メッシュ (mesher.js)。
// 設置時のプレイヤーの向きに応じて north/east/south/west で自動回転し,
// 常に閉状態で設置される (上段が自動でついてくる)。右クリックでどちらの段を
// 見ても開閉をトグルし, 上下段が連動する (main.js の placeAction 参照)。
// 開いている間は当たり判定なし ---
const DOOR_ID_BASE = 216;      // 216-219: 下段-閉, 220-223: 下段-開
const DOOR_TOP_ID_BASE = 227;  // 227-230: 上段-閉, 231-234: 上段-開
const DOOR_DIRS = ["north", "east", "south", "west"];
DOOR_DIRS.forEach((dirName, di) => {
  const closedId = DOOR_ID_BASE + di;
  const openId = DOOR_ID_BASE + 4 + di;
  const topClosedId = DOOR_TOP_ID_BASE + di;
  const topOpenId = DOOR_TOP_ID_BASE + 4 + di;
  defBlock(closedId, "door_wood_" + dirName + "_closed", "木のドア",
    [TILE.DOOR_WOOD, TILE.DOOR_WOOD, TILE.DOOR_WOOD],
    { opaque: false, hardness: 1.0, drops: DOOR_ID_BASE });
  defBlock(openId, "door_wood_" + dirName + "_open", "木のドア (開)",
    [TILE.DOOR_WOOD, TILE.DOOR_WOOD, TILE.DOOR_WOOD],
    { opaque: false, solid: false, hardness: 1.0, drops: DOOR_ID_BASE });
  defBlock(topClosedId, "door_wood_" + dirName + "_top_closed", "木のドア (上)",
    [TILE.DOOR_WOOD_TOP, TILE.DOOR_WOOD_TOP, TILE.DOOR_WOOD_TOP],
    { opaque: false, hardness: 1.0, drops: null });
  defBlock(topOpenId, "door_wood_" + dirName + "_top_open", "木のドア (上・開)",
    [TILE.DOOR_WOOD_TOP, TILE.DOOR_WOOD_TOP, TILE.DOOR_WOOD_TOP],
    { opaque: false, solid: false, hardness: 1.0, drops: null });
  BLOCKS[closedId].door = true; BLOCKS[closedId].doorDir = di; BLOCKS[closedId].doorOpen = false;
  BLOCKS[openId].door = true; BLOCKS[openId].doorDir = di; BLOCKS[openId].doorOpen = true;
  BLOCKS[topClosedId].door = true; BLOCKS[topClosedId].doorDir = di; BLOCKS[topClosedId].doorOpen = false;
  BLOCKS[topClosedId].doorTop = true;
  BLOCKS[topOpenId].door = true; BLOCKS[topOpenId].doorDir = di; BLOCKS[topOpenId].doorOpen = true;
  BLOCKS[topOpenId].doorTop = true;
});

// --- ベッド: 本家同様に頭側+足側の2マス1組, 高さの低い箱で描画 (mesher.js)。
// 設置時のプレイヤーの向きに応じて自動回転する。B.BED (レガシーの単体ブロック,
// 通常は直接設置されない) を持ち物としての基準アイテムとして扱い, 実際の設置は
// この BED_ID_BASE の頭/足ペアに変換する (main.js の placeAction 参照) ---
const BED_ID_BASE = 235;   // 235-238: 頭 (north/east/south/west), 239-242: 足
const BED_DIRS = ["north", "east", "south", "west"];
BED_DIRS.forEach((dirName, di) => {
  const headId = BED_ID_BASE + di;
  const footId = BED_ID_BASE + 4 + di;
  defBlock(headId, "bed_" + dirName + "_head", "ベッド (頭)",
    [TILE.BED_HEAD_TOP, TILE.BED_SIDE, TILE.PLANK],
    { opaque: false, hardness: 0.5, drops: B.BED });
  defBlock(footId, "bed_" + dirName + "_foot", "ベッド (足)",
    [TILE.BED_FOOT_TOP, TILE.BED_SIDE, TILE.PLANK],
    { opaque: false, hardness: 0.5, drops: null });
  BLOCKS[headId].bed = true; BLOCKS[headId].bedDir = di; BLOCKS[headId].bedFoot = false;
  BLOCKS[footId].bed = true; BLOCKS[footId].bedDir = di; BLOCKS[footId].bedFoot = true;
});

// --- フェンス: 中央の支柱 + 隣接するフェンスへ自動でつながる横木 (mesher.js) ---
defBlock(B.FENCE_PLANK, "fence_plank", "木のフェンス", [TILE.PLANK, TILE.PLANK, TILE.PLANK],
  { opaque: false, hardness: 1.2 });
BLOCKS[B.FENCE_PLANK].fence = true;

// --- 作業台: 見た目は通常の立方体ブロック。一部の道具レシピはこれの近くでしか
// クラフトできない (main.js の nearCraftingTable / RECIPES の needsTable 参照) ---
defBlock(B.CRAFTING_TABLE, "crafting_table", "作業台",
  [TILE.CRAFTING_TABLE_TOP, TILE.CRAFTING_TABLE_SIDE, TILE.PLANK], { hardness: 1.2 });

// 道具の効くブロック分類
[B.LOG, B.BIRCH_LOG, B.DARK_LOG, B.PLANK, B.BIRCH_PLANK, B.DARK_PLANK,
 B.PLANK_SLAB, B.BOOKSHELF, B.CHEST, B.BED, B.PUMPKIN, B.JACK_O_LANTERN,
 STAIR_ID_BASE + 2 * 4, STAIR_ID_BASE + 2 * 4 + 1, STAIR_ID_BASE + 2 * 4 + 2, STAIR_ID_BASE + 2 * 4 + 3,
 DOOR_ID_BASE, DOOR_ID_BASE + 1, DOOR_ID_BASE + 2, DOOR_ID_BASE + 3,
 DOOR_ID_BASE + 4, DOOR_ID_BASE + 5, DOOR_ID_BASE + 6, DOOR_ID_BASE + 7,
 DOOR_TOP_ID_BASE, DOOR_TOP_ID_BASE + 1, DOOR_TOP_ID_BASE + 2, DOOR_TOP_ID_BASE + 3,
 DOOR_TOP_ID_BASE + 4, DOOR_TOP_ID_BASE + 5, DOOR_TOP_ID_BASE + 6, DOOR_TOP_ID_BASE + 7,
 BED_ID_BASE, BED_ID_BASE + 1, BED_ID_BASE + 2, BED_ID_BASE + 3,
 BED_ID_BASE + 4, BED_ID_BASE + 5, BED_ID_BASE + 6, BED_ID_BASE + 7,
 B.FENCE_PLANK, B.CRAFTING_TABLE,
].forEach((id) => { BLOCKS[id].axeable = true; });
[B.DIRT, B.GRASS, B.SAND, B.GRAVEL, B.SNOW, B.FARMLAND,
].forEach((id) => { BLOCKS[id].shovelable = true; });

// ブロック / アイテムを問わず定義を引く
// (ブロック ID: 0-99 と 140-255, アイテム ID: 100-139)
function getDef(id) {
  return ITEMS[id] || BLOCKS[id];
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
