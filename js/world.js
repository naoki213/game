// ---------------------------------------------------------------
// ワールド: チャンク管理 / 地形生成 / 編集の永続化
// ---------------------------------------------------------------
"use strict";

const CHUNK_SIZE = 16;    // X/Z 方向
const CHUNK_H = 64;       // Y 方向 (ワールドの高さ)
const WATER_LEVEL = 27;   // 海面

// チャンク内インデックス: idx = (y << 8) | (z << 4) | x
function blockIndex(x, y, z) {
  return (y << 8) | (z << 4) | x;
}

class Chunk {
  constructor(cx, cz) {
    this.cx = cx;
    this.cz = cz;
    this.data = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE * CHUNK_H);
    this.dirty = true;        // メッシュ再構築が必要
    this.mesh = null;         // renderer が管理する GPU リソース
    this.generated = false;
  }

  get(x, y, z) {
    return this.data[(y << 8) | (z << 4) | x];
  }

  set(x, y, z, id) {
    this.data[(y << 8) | (z << 4) | x] = id;
  }
}

class World {
  constructor(seed) {
    this.seed = seed;
    this.chunks = new Map();          // "cx,cz" -> Chunk
    this.noise = new Perlin(seed);
    this.noiseCave = new Perlin(seed ^ 0x51ab3f);
    this.noiseBiome = new Perlin(seed ^ 0x9e3779b9);
    this.heightCache = new Map();     // 列の高さキャッシュ

    // プレイヤーの編集 (生成地形との差分): "cx,cz" -> Map(idx -> blockId)
    this.edits = new Map();
    this.editsDirty = false;
    this.loadEdits();
  }

  static key(cx, cz) { return cx + "," + cz; }

  getChunk(cx, cz) {
    return this.chunks.get(World.key(cx, cz));
  }

  // ---------------- 地形生成 ----------------

  // 列 (x, z) の地表高さとバイオーム情報
  columnInfo(x, z) {
    const key = x + "," + z;
    let info = this.heightCache.get(key);
    if (info) return info;

    const n = this.noise;
    // 大陸性: 大きなスケールで陸と海を分ける
    const cont = n.fbm2(x * 0.0025 + 300, z * 0.0025 - 300, 3);
    // 細かい起伏
    const base = n.fbm2(x * 0.008, z * 0.008, 4);
    // 山岳 (リッジノイズ): 尾根が立ち上がる。海上では抑える
    let ridge = 1 - Math.abs(n.noise2(x * 0.004 + 100, z * 0.004 - 100));
    ridge = Math.pow(Math.max(0, ridge - 0.55) / 0.45, 2);
    ridge *= smoothstep(-0.15, 0.2, cont);

    let h = 29 + cont * 19 + base * 5 + ridge * 24;
    if (h > 50) h = 50 + (h - 50) * 0.4; // 高山をなだらかに
    h = Math.round(clamp(h, 4, CHUNK_H - 8));

    // バイオーム: 湿度と温度
    const moist = this.noiseBiome.fbm2(x * 0.0035, z * 0.0035, 2);
    const temp = this.noiseBiome.fbm2(x * 0.003 + 500, z * 0.003 + 500, 2);

    let biome;
    if (h >= 46 || temp < -0.42) biome = "snow";
    else if (moist < -0.32 && h <= WATER_LEVEL + 6) biome = "desert";
    else if (moist > 0.12) biome = "forest";
    else biome = "plains";

    info = { h, biome };
    if (this.heightCache.size > 60000) this.heightCache.clear();
    this.heightCache.set(key, info);
    return info;
  }

  isCave(x, y, z, surfaceH) {
    if (y <= 2 || y > surfaceH - 4) return false;
    const c = this.noiseCave.noise3(x * 0.085, y * 0.11, z * 0.085);
    return c > 0.58;
  }

  generateChunk(cx, cz) {
    const key = World.key(cx, cz);
    let chunk = this.chunks.get(key);
    if (chunk && chunk.generated) return chunk;
    if (!chunk) {
      chunk = new Chunk(cx, cz);
      this.chunks.set(key, chunk);
    }

    const ox = cx * CHUNK_SIZE;
    const oz = cz * CHUNK_SIZE;
    const seed = this.seed;

    // --- 列ごとの基本地形 ---
    for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        const wx = ox + lx, wz = oz + lz;
        const { h, biome } = this.columnInfo(wx, wz);
        const sandy = biome === "desert" || h <= WATER_LEVEL + 1;

        for (let y = 0; y <= h; y++) {
          let id;
          if (y === 0) {
            id = B.BEDROCK;
          } else if (this.isCave(wx, y, wz, h)) {
            id = B.AIR;
          } else if (y === h) {
            if (sandy) id = B.SAND;
            else if (biome === "snow") id = B.SNOW;
            else id = B.GRASS;
          } else if (y >= h - 3) {
            id = sandy ? B.SAND : B.DIRT;
          } else {
            id = B.STONE;
            // 鉱石 (深いほど貴重な鉱石が出る)
            const r = hash3(wx, y, wz, seed);
            if (y < 42 && r < 0.014) id = B.COAL_ORE;
            else if (y < 26 && r >= 0.014 && r < 0.021) id = B.IRON_ORE;
            else if (y < 18 && r >= 0.021 && r < 0.0242) id = B.GOLD_ORE;
            else if (y < 13 && r >= 0.0242 && r < 0.0262) id = B.DIAMOND_ORE;
            else if (r >= 0.03 && r < 0.037) id = B.GRAVEL; // 砂利ポケット
          }
          chunk.set(lx, y, lz, id);
        }

        // 水
        for (let y = h + 1; y <= WATER_LEVEL; y++) {
          chunk.set(lx, y, lz, B.WATER);
        }
      }
    }

    // --- 木の生成 (チャンク内に完全に収まる位置のみ) ---
    for (let lz = 2; lz < CHUNK_SIZE - 2; lz++) {
      for (let lx = 2; lx < CHUNK_SIZE - 2; lx++) {
        const wx = ox + lx, wz = oz + lz;
        const { h, biome } = this.columnInfo(wx, wz);
        if (h <= WATER_LEVEL) continue;
        if (chunk.get(lx, h, lz) !== B.GRASS) continue;

        const density = biome === "forest" ? 0.022 : biome === "plains" ? 0.004 : 0;
        if (density === 0) continue;
        if (hash2(wx, wz, seed ^ 0xa5a5) >= density) continue;

        const trunkH = 4 + ((hash2(wx, wz, seed ^ 0x1234) * 3) | 0);
        const topY = h + trunkH;
        if (topY + 2 >= CHUNK_H) continue;

        // 幹
        for (let y = h + 1; y <= topY; y++) chunk.set(lx, y, lz, B.LOG);
        chunk.set(lx, h, lz, B.DIRT); // 根元は土に

        // 葉: 上部 2 層は十字型, その下 2 層は 5x5 (角抜き)
        for (let dy = -2; dy <= 1; dy++) {
          const y = topY + dy;
          const r = dy >= 0 ? 1 : 2;
          for (let dz = -r; dz <= r; dz++) {
            for (let dx = -r; dx <= r; dx++) {
              if (dx === 0 && dz === 0 && dy < 0) continue; // 幹の位置
              // 角を確率で抜いて丸みを出す
              if (Math.abs(dx) === r && Math.abs(dz) === r &&
                  hash3(wx + dx, y, wz + dz, seed) < 0.6) continue;
              const tx = lx + dx, tz = lz + dz;
              if (chunk.get(tx, y, tz) === B.AIR) chunk.set(tx, y, tz, B.LEAVES);
            }
          }
        }
        chunk.set(lx, topY + 1, lz, B.LEAVES); // てっぺん
      }
    }

    // --- 草花の生成 (草ブロックの上, 空きセルのみ) ---
    for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        const wx = ox + lx, wz = oz + lz;
        const { h, biome } = this.columnInfo(wx, wz);
        if (biome !== "plains" && biome !== "forest") continue;
        if (h + 1 >= CHUNK_H) continue;
        if (chunk.get(lx, h, lz) !== B.GRASS) continue;
        if (chunk.get(lx, h + 1, lz) !== B.AIR) continue;

        const r = hash2(wx, wz, seed ^ 0x77aa11);
        if (r < 0.09) {
          chunk.set(lx, h + 1, lz, B.TALL_GRASS);
        } else if (r < 0.102) {
          chunk.set(lx, h + 1, lz,
            hash2(wx, wz, seed ^ 0x33cc) < 0.5 ? B.FLOWER_YELLOW : B.FLOWER_RED);
        }
      }
    }

    // --- 保存済みの編集を適用 ---
    const edits = this.edits.get(key);
    if (edits) {
      for (const [idx, id] of edits) chunk.data[idx] = id;
    }

    chunk.generated = true;
    chunk.dirty = true;
    return chunk;
  }

  // ---------------- ブロックアクセス ----------------

  getBlock(wx, wy, wz) {
    if (wy < 0 || wy >= CHUNK_H) return B.AIR;
    const cx = wx >> 4, cz = wz >> 4;
    const chunk = this.chunks.get(World.key(cx, cz));
    if (!chunk || !chunk.generated) return B.STONE; // 未生成領域は不透明扱い (面を張らない)
    return chunk.get(wx & 15, wy, wz & 15);
  }

  // 当たり判定用: 未生成領域は空気扱いにしない (めり込み防止で solid)
  isSolidAt(wx, wy, wz) {
    if (wy < 0) return true;
    if (wy >= CHUNK_H) return false;
    const chunk = this.chunks.get(World.key(wx >> 4, wz >> 4));
    if (!chunk || !chunk.generated) return true;
    return isSolid(chunk.get(wx & 15, wy, wz & 15));
  }

  // 当たり判定用の実効高さ (0 = 非固体, ハーフブロック = 0.5)
  blockHeightAt(wx, wy, wz) {
    if (wy < 0) return 1;
    if (wy >= CHUNK_H) return 0;
    const chunk = this.chunks.get(World.key(wx >> 4, wz >> 4));
    if (!chunk || !chunk.generated) return 1;
    const b = BLOCKS[chunk.get(wx & 15, wy, wz & 15)];
    return b.solid ? b.height : 0;
  }

  setBlock(wx, wy, wz, id) {
    if (wy < 0 || wy >= CHUNK_H) return false;
    const cx = wx >> 4, cz = wz >> 4;
    const key = World.key(cx, cz);
    const chunk = this.chunks.get(key);
    if (!chunk || !chunk.generated) return false;

    const lx = wx & 15, lz = wz & 15;
    if (chunk.get(lx, wy, lz) === id) return false;
    chunk.set(lx, wy, lz, id);
    chunk.dirty = true;

    // 編集差分を記録
    let edits = this.edits.get(key);
    if (!edits) { edits = new Map(); this.edits.set(key, edits); }
    edits.set(blockIndex(lx, wy, lz), id);
    this.editsDirty = true;

    // ライトはチャンク境界を越えて 8 ブロックまで影響するため,
    // 境界近くの編集は隣接チャンクも再メッシュする
    const markDirty = (ncx, ncz) => {
      const c = this.chunks.get(World.key(ncx, ncz));
      if (c) c.dirty = true;
    };
    const west = lx < 8, east = lx >= 8;
    const north = lz < 8, south = lz >= 8;
    if (west) markDirty(cx - 1, cz);
    if (east) markDirty(cx + 1, cz);
    if (north) markDirty(cx, cz - 1);
    if (south) markDirty(cx, cz + 1);
    if (west && north) markDirty(cx - 1, cz - 1);
    if (west && south) markDirty(cx - 1, cz + 1);
    if (east && north) markDirty(cx + 1, cz - 1);
    if (east && south) markDirty(cx + 1, cz + 1);
    return true;
  }

  // 地表の高さ (スポーン用, 木も考慮して実ブロックを見る)
  surfaceY(wx, wz) {
    for (let y = CHUNK_H - 1; y > 0; y--) {
      const id = this.getBlock(wx, y, wz);
      if (isSolid(id) && id !== B.LEAVES) return y;
    }
    return WATER_LEVEL;
  }

  // ---------------- 永続化 (localStorage) ----------------

  storageKey() { return "mcjs_edits_" + this.seed; }

  loadEdits() {
    try {
      const raw = localStorage.getItem(this.storageKey());
      if (!raw) return;
      const obj = JSON.parse(raw);
      for (const key of Object.keys(obj)) {
        const m = new Map();
        const arr = obj[key]; // [idx, id, idx, id, ...]
        for (let i = 0; i < arr.length; i += 2) m.set(arr[i], arr[i + 1]);
        this.edits.set(key, m);
      }
    } catch (e) {
      console.warn("セーブデータの読み込みに失敗:", e);
    }
  }

  saveEdits() {
    if (!this.editsDirty) return;
    try {
      const obj = {};
      for (const [key, m] of this.edits) {
        const arr = [];
        for (const [idx, id] of m) { arr.push(idx, id); }
        obj[key] = arr;
      }
      localStorage.setItem(this.storageKey(), JSON.stringify(obj));
      this.editsDirty = false;
    } catch (e) {
      console.warn("セーブに失敗:", e);
    }
  }
}
