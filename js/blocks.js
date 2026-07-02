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
};

// 各ブロックの属性
//   tiles: [top, side, bottom]
//   opaque: 完全不透明 (隣接面をカリングできる / AO を落とす)
//   solid:  当たり判定あり
//   emissive: 自己発光 (シェーディングを弱める)
//   cross: X 字型の板ポリで描画する植生 (草花)
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
  };
}

defBlock(B.AIR, "air", "空気", [0, 0, 0], { opaque: false, solid: false });
defBlock(B.GRASS, "grass", "草ブロック", [TILE.GRASS_TOP, TILE.GRASS_SIDE, TILE.DIRT]);
defBlock(B.DIRT, "dirt", "土", [TILE.DIRT, TILE.DIRT, TILE.DIRT]);
defBlock(B.STONE, "stone", "石", [TILE.STONE, TILE.STONE, TILE.STONE]);
defBlock(B.SAND, "sand", "砂", [TILE.SAND, TILE.SAND, TILE.SAND]);
defBlock(B.WATER, "water", "水", [TILE.WATER, TILE.WATER, TILE.WATER], { opaque: false, solid: false });
defBlock(B.LOG, "log", "原木", [TILE.LOG_TOP, TILE.LOG_SIDE, TILE.LOG_TOP]);
defBlock(B.LEAVES, "leaves", "葉", [TILE.LEAVES, TILE.LEAVES, TILE.LEAVES], { opaque: false });
defBlock(B.PLANK, "plank", "木材", [TILE.PLANK, TILE.PLANK, TILE.PLANK]);
defBlock(B.GLASS, "glass", "ガラス", [TILE.GLASS, TILE.GLASS, TILE.GLASS], { opaque: false });
defBlock(B.BRICK, "brick", "レンガ", [TILE.BRICK, TILE.BRICK, TILE.BRICK]);
defBlock(B.COBBLE, "cobblestone", "丸石", [TILE.COBBLE, TILE.COBBLE, TILE.COBBLE]);
defBlock(B.SNOW, "snow", "雪ブロック", [TILE.SNOW, TILE.SNOW_SIDE, TILE.DIRT]);
defBlock(B.BEDROCK, "bedrock", "岩盤", [TILE.BEDROCK, TILE.BEDROCK, TILE.BEDROCK]);
defBlock(B.COAL_ORE, "coal_ore", "石炭鉱石", [TILE.COAL_ORE, TILE.COAL_ORE, TILE.COAL_ORE]);
defBlock(B.IRON_ORE, "iron_ore", "鉄鉱石", [TILE.IRON_ORE, TILE.IRON_ORE, TILE.IRON_ORE]);
defBlock(B.GLOWSTONE, "glowstone", "グロウストーン", [TILE.GLOWSTONE, TILE.GLOWSTONE, TILE.GLOWSTONE], { emissive: true });
defBlock(B.TALL_GRASS, "tall_grass", "草", [TILE.TALL_GRASS, TILE.TALL_GRASS, TILE.TALL_GRASS], { opaque: false, solid: false, cross: true });
defBlock(B.FLOWER_YELLOW, "flower_yellow", "タンポポ", [TILE.FLOWER_YELLOW, TILE.FLOWER_YELLOW, TILE.FLOWER_YELLOW], { opaque: false, solid: false, cross: true });
defBlock(B.FLOWER_RED, "flower_red", "ポピー", [TILE.FLOWER_RED, TILE.FLOWER_RED, TILE.FLOWER_RED], { opaque: false, solid: false, cross: true });

// ホットバーに並ぶブロック (1–9 キー)
const HOTBAR_BLOCKS = [
  B.GRASS, B.DIRT, B.STONE, B.PLANK, B.LOG,
  B.LEAVES, B.GLASS, B.BRICK, B.GLOWSTONE,
];

function isOpaque(id) { return BLOCKS[id].opaque; }
function isSolid(id) { return BLOCKS[id].solid; }
