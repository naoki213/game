// ---------------------------------------------------------------
// ワールド: チャンク管理 / 地形生成 / 編集の永続化
// ---------------------------------------------------------------
"use strict";

const CHUNK_SIZE = 16;    // X/Z 方向
const CHUNK_H = 128;      // Y 方向 (ワールドの高さ) — 高い山と深い海のため 2 倍に拡張
const WATER_LEVEL = 46;   // 海面
const VILLAGE_GRID = 320; // 村の配置グリッド (ブロック)

// エンドポータルの間 (ストロングホールド) の固定座標。シードによらず常に同じ場所
const STRONGHOLD = { x: 260, y: 20, z: 340 };

// ジ・エンド (最終決戦場)。通常の地形生成とは全く別の, 遠く離れた固定座標に
// 浮島 + 黒曜石の柱を生成する。シードによらず常に同じ内容
const END = { x: 100000, z: 0, y: 64, islandR: 26, pillarR: 19, boundsR: 110 };

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
    this.noiseCave2 = new Perlin(seed ^ 0x77aa1e);
    this.noiseBiome = new Perlin(seed ^ 0x9e3779b9);
    this.heightCache = new Map();     // 列の高さキャッシュ
    this.villageCache = new Map();    // 村グリッドのキャッシュ
    this.entranceCache = new Map();   // 洞窟の入り口 (竪穴) のキャッシュ

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
    // 山岳 (リッジノイズ 2 種を重ねて複雑な尾根にする): 海上では抑える
    let ridge = 1 - Math.abs(n.noise2(x * 0.004 + 100, z * 0.004 - 100));
    ridge = Math.pow(Math.max(0, ridge - 0.55) / 0.45, 2);
    ridge *= smoothstep(-0.1, 0.2, cont);
    let ridge2 = 1 - Math.abs(n.noise2(x * 0.0095 - 200, z * 0.0095 + 200));
    ridge2 = Math.pow(Math.max(0, ridge2 - 0.62) / 0.38, 2);
    ridge2 *= smoothstep(0.05, 0.3, cont);

    let h = WATER_LEVEL - 3 + cont * 34 + base * 7 + ridge * 46 + ridge2 * 20;
    // 深海: 大陸ノイズが強く負のところはさらに掘り下げて深い海溝にする
    if (cont < -0.2) {
      const t = Math.min(1, (-cont - 0.2) / 0.55);
      h -= t * t * 28;
    }
    // 最高峰をなだらかにして極端になりすぎないようにする
    const peak = WATER_LEVEL + 62;
    if (h > peak) h = peak + (h - peak) * 0.35;
    h = Math.round(clamp(h, 6, CHUNK_H - 14));

    // バイオーム: 湿度と温度
    const moist = this.noiseBiome.fbm2(x * 0.0035, z * 0.0035, 2);
    const temp = this.noiseBiome.fbm2(x * 0.003 + 500, z * 0.003 + 500, 2);

    let biome;
    if (h >= WATER_LEVEL + 34 || temp < -0.42) biome = "snow";
    else if (moist < -0.32 && h <= WATER_LEVEL + 6) biome = "desert";
    else if (moist > 0.12) biome = "forest";
    else biome = "plains";

    info = { h, biome };
    if (this.heightCache.size > 60000) this.heightCache.clear();
    this.heightCache.set(key, info);
    return info;
  }

  // 洞窟ノイズそのもの (地表付近の "ふさぐ" ゲートを含まない)。
  // isCave() と, 入り口の竪穴が自然の洞窟にぶつかるかの探索の両方から使う
  caveNoiseAt(x, y, z, surfaceH) {
    // 塊状の洞窟 (閾値を下げて量を増やした)
    const c = this.noiseCave.noise3(x * 0.085, y * 0.11, z * 0.085);
    if (c > 0.54) return true;
    // スパゲッティ洞窟 (2 つのノイズの零面が交差する細長いトンネル。太く/繋がりやすくした)
    const a = this.noiseCave.noise3(x * 0.045, y * 0.07, z * 0.045);
    const b = this.noiseCave2.noise3(x * 0.045 + 77, y * 0.07 + 77, z * 0.045 + 77);
    if (Math.abs(a) < 0.085 && Math.abs(b) < 0.085) return true;
    // 深層の大空洞 (ワールドが高くなった分, 対象レンジを拡張)
    if (y < 52 && this.noiseCave2.noise3(x * 0.02, y * 0.045, z * 0.02) > 0.46) return true;
    // 中層の広間 (新規レイヤー: 洞窟の総量を増やす)
    if (y > 30 && y < surfaceH - 10 &&
        this.noiseCave.noise3(x * 0.03 + 500, y * 0.06 + 500, z * 0.03 + 500) > 0.62) return true;
    return false;
  }

  isCave(x, y, z, surfaceH) {
    if (y <= 2 || y > surfaceH - 4) return false;
    return this.caveNoiseAt(x, y, z, surfaceH);
  }

  // 洞窟の入り口 (地表に開く竪穴)。まばらな格子点に候補地を置き,
  // そこから地下の自然な洞窟にぶつかるまで掘り下げる。見つからなければ
  // 浅い袋小路の竪穴になる。戻り値は「この座標が入り口の穴なら底の Y」,
  // 入り口でなければ -1
  caveEntranceBottom(x, z, h) {
    const key = x + "," + z;
    let bottom = this.entranceCache.get(key);
    if (bottom !== undefined) return bottom;
    bottom = -1;

    if (h > WATER_LEVEL + 3) {
      const CELL = 8;
      const gx = Math.floor(x / CELL), gz = Math.floor(z / CELL);
      if (hash2(gx, gz, this.seed ^ 0x1ca7e) < 0.05) {
        const ex = gx * CELL + 2 + Math.floor(hash2(gx, gz, this.seed ^ 0xe17a01) * (CELL - 4));
        const ez = gz * CELL + 2 + Math.floor(hash2(gx, gz, this.seed ^ 0x0e18a2) * (CELL - 4));
        const dx = x - ex, dz = z - ez;
        // 不定形の縁: ノイズで半径を揺らして自然な穴の形にする
        const rNoise = this.noiseCave2.noise2(x * 0.35 + 40, z * 0.35 - 40);
        const radius = 1.5 + rNoise * 0.9;
        if (dx * dx + dz * dz <= radius * radius) {
          const eh = this.columnInfo(ex, ez).h;
          if (eh > WATER_LEVEL + 3) {
            const MAX_SEARCH = 24, FALLBACK_DEPTH = 14;
            let found = -1;
            for (let d = 4; d <= MAX_SEARCH; d++) {
              const cy = eh - d;
              if (cy <= 3) break;
              if (this.caveNoiseAt(ex, cy, ez, eh)) { found = cy; break; }
            }
            bottom = found >= 0 ? found : Math.max(4, eh - FALLBACK_DEPTH);
          }
        }
      }
    }

    if (this.entranceCache.size > 60000) this.entranceCache.clear();
    this.entranceCache.set(key, bottom);
    return bottom;
  }

  isInEnd(x, z) {
    return Math.hypot(x - END.x, z - END.z) <= END.boundsR;
  }

  // 8 本の柱の上にあるエンダークリスタルの座標 (generateEndChunk と同じ式)
  endCrystalCoords() {
    const { x: ex, z: ez, y: ey, pillarR } = END;
    const N = 8;
    const coords = [];
    for (let i = 0; i < N; i++) {
      const ang = (i / N) * Math.PI * 2;
      const px = Math.round(ex + Math.cos(ang) * pillarR);
      const pz = Math.round(ez + Math.sin(ang) * pillarR);
      const pillarTop = ey + 7 + (i % 3) * 5;
      coords.push([px, pillarTop + 1, pz]);
    }
    return coords;
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

    // --- ジ・エンド: 通常の地形生成を完全にスキップして専用の浮島を作る ---
    if (this.isInEnd(ox + 8, oz + 8) || this.isInEnd(ox, oz) || this.isInEnd(ox + 15, oz + 15)) {
      return this.generateEndChunk(chunk);
    }

    // --- 列ごとの基本地形 ---
    for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        const wx = ox + lx, wz = oz + lz;
        const { h, biome } = this.columnInfo(wx, wz);
        const sandy = biome === "desert" || h <= WATER_LEVEL + 1;
        const entranceBottom = this.caveEntranceBottom(wx, wz, h);

        for (let y = 0; y <= h; y++) {
          let id;
          if (y === 0) {
            id = B.BEDROCK;
          } else if (entranceBottom >= 0 && y > entranceBottom) {
            id = B.AIR; // 洞窟の入り口 (地表からの竪穴)
          } else if (this.isCave(wx, y, wz, h)) {
            id = B.AIR;
          } else if (y === h) {
            if (sandy) id = B.SAND;
            else if (biome === "snow") id = B.SNOW;
            else id = B.GRASS;
          } else if (y >= h - 3) {
            id = sandy ? B.SAND : B.DIRT;
          } else if (sandy && y >= h - 6) {
            id = B.SANDSTONE;   // 砂漠の砂の下は砂岩
          } else {
            id = B.STONE;
            // 鉱石 (深いほど貴重な鉱石が出る)
            const r = hash3(wx, y, wz, seed);
            if (y < 84 && r < 0.014) id = B.COAL_ORE;
            else if (y < 52 && r >= 0.014 && r < 0.021) id = B.IRON_ORE;
            else if (y < 36 && r >= 0.021 && r < 0.0242) id = B.GOLD_ORE;
            else if (y < 26 && r >= 0.0242 && r < 0.0262) id = B.DIAMOND_ORE;
            else if (y < 14 && r >= 0.027 && r < 0.0285) id = B.OBSIDIAN; // 最深部の黒曜石
            else if (r >= 0.03 && r < 0.037) id = B.GRAVEL; // 砂利ポケット
          }
          chunk.set(lx, y, lz, id);
        }

        // 水 (雪原の水面は凍る)
        for (let y = h + 1; y <= WATER_LEVEL; y++) {
          chunk.set(lx, y, lz,
            biome === "snow" && y === WATER_LEVEL ? B.ICE : B.WATER);
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
        } else if (r < 0.1032) {
          chunk.set(lx, h + 1, lz, B.PUMPKIN);   // 野生のカボチャ
        }
      }
    }

    // --- 村の建物を刻印 ---
    this.stampVillages(chunk);

    // --- ストロングホールド (エンドポータルの間) を刻印 ---
    this.stampStronghold(chunk);

    // --- 保存済みの編集を適用 ---
    const edits = this.edits.get(key);
    if (edits) {
      for (const [idx, id] of edits) chunk.data[idx] = id;
    }

    chunk.generated = true;
    chunk.dirty = true;
    return chunk;
  }

  // ---------------- ジ・エンド (最終決戦場) ----------------

  generateEndChunk(chunk) {
    const ox = chunk.cx * CHUNK_SIZE;
    const oz = chunk.cz * CHUNK_SIZE;
    const { x: ex, z: ez, y: ey, islandR, pillarR } = END;

    for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        const wx = ox + lx, wz = oz + lz;
        const dx = wx - ex, dz = wz - ez;
        const d = Math.hypot(dx, dz);
        if (d > islandR) continue;
        // 中心が緩やかに盛り上がったエンドストーンの浮島 + 縁の欠け
        const edgeNoise = hash2(wx, wz, this.seed ^ 0xe4d1) * 3;
        if (d > islandR - 2 && edgeNoise < 1.1) continue; // 縁を不揃いに欠けさせる
        const dome = Math.round(Math.max(0, (islandR - d) * 0.14));
        const topY = ey + dome;
        for (let y = ey - 5; y <= topY; y++) chunk.set(lx, y, lz, B.END_STONE);
      }
    }

    // 黒曜石の柱 + てっぺんのエンダークリスタル (中心を囲む円状に配置)
    const N = 8;
    for (let i = 0; i < N; i++) {
      const ang = (i / N) * Math.PI * 2;
      const px = Math.round(ex + Math.cos(ang) * pillarR);
      const pz = Math.round(ez + Math.sin(ang) * pillarR);
      if (px < ox || px > ox + 15 || pz < oz || pz > oz + 15) continue;
      const lx = px - ox, lz = pz - oz;
      const pillarTop = ey + 7 + (i % 3) * 5; // 高さにばらつきをつける
      for (let y = ey - 3; y <= pillarTop; y++) chunk.set(lx, y, lz, B.OBSIDIAN);
      chunk.set(lx, pillarTop + 1, lz, B.END_CRYSTAL);
    }

    // --- 保存済みの編集を適用 (クリスタル破壊やポータル設置などを復元) ---
    const key = World.key(chunk.cx, chunk.cz);
    const edits = this.edits.get(key);
    if (edits) {
      for (const [idx, id] of edits) chunk.data[idx] = id;
    }

    chunk.generated = true;
    chunk.dirty = true;
    return chunk;
  }

  // ---------------- 村の生成 ----------------
  // 世界を 320 ブロックのグリッドに分け、セルごとに決定論的に村を配置する

  villageInCell(gx, gz) {
    const key = gx + "," + gz;
    if (this.villageCache.has(key)) return this.villageCache.get(key);

    let village = null;
    if (hash2(gx, gz, this.seed ^ 0x76a9c3) < 0.5) {
      const G = VILLAGE_GRID;
      const cx = gx * G + 80 + Math.floor(hash2(gx, gz, this.seed ^ 0x1111) * (G - 160));
      const cz = gz * G + 80 + Math.floor(hash2(gx, gz, this.seed ^ 0x2222) * (G - 160));
      const center = this.columnInfo(cx, cz);
      // 平地にしか村はできない
      if (center.h > WATER_LEVEL + 1 && center.h < WATER_LEVEL + 20) {
        const buildings = [{ type: "well", x: cx - 1, z: cz - 1, w: 3, d: 3 }];
        const n = 4 + Math.floor(hash2(gx, gz, this.seed ^ 0x3333) * 3);
        for (let i = 0; i < n; i++) {
          const ang = (i / n) * Math.PI * 2 + hash2(gx, gz + i * 7, this.seed ^ 0x4444) * 0.8;
          const dist = 9 + hash2(gx + i * 7, gz, this.seed ^ 0x5555) * 12;
          const w = 5 + 2 * Math.floor(hash2(i, gx ^ gz, this.seed ^ 0x66) * 2);   // 5 or 7
          const d = 5 + 2 * Math.floor(hash2(i * 3, gx ^ gz, this.seed ^ 0x77) * 2);
          const bx = Math.round(cx + Math.cos(ang) * dist) - (w >> 1);
          const bz = Math.round(cz + Math.sin(ang) * dist) - (d >> 1);
          const bh = this.columnInfo(bx + (w >> 1), bz + (d >> 1)).h;
          if (bh <= WATER_LEVEL || bh > WATER_LEVEL + 20) continue;
          buildings.push({ type: "house", x: bx, z: bz, w, d, door: i % 4 });
        }
        village = { cx, cz, buildings };
      }
    }
    this.villageCache.set(key, village);
    return village;
  }

  stampVillages(chunk) {
    const ox = chunk.cx * CHUNK_SIZE;
    const oz = chunk.cz * CHUNK_SIZE;
    // 建物は村の中心から最大 ~30 ブロック → 隣接グリッドセルも確認
    const g0x = Math.floor((ox - 48) / VILLAGE_GRID);
    const g1x = Math.floor((ox + 64) / VILLAGE_GRID);
    const g0z = Math.floor((oz - 48) / VILLAGE_GRID);
    const g1z = Math.floor((oz + 64) / VILLAGE_GRID);
    for (let gz = g0z; gz <= g1z; gz++) {
      for (let gx = g0x; gx <= g1x; gx++) {
        const v = this.villageInCell(gx, gz);
        if (!v) continue;
        for (const b of v.buildings) this.stampBuilding(chunk, ox, oz, b);
      }
    }
  }

  stampBuilding(chunk, ox, oz, b) {
    // チャンクと重ならなければ何もしない
    if (b.x + b.w - 1 < ox || b.x > ox + 15 || b.z + b.d - 1 < oz || b.z > oz + 15) return;
    const seed = this.seed;
    const set = (wx, y, wz, id) => {
      if (wx < ox || wx > ox + 15 || wz < oz || wz > oz + 15 || y < 1 || y >= CHUNK_H) return;
      chunk.set(wx - ox, y, wz - oz, id);
    };
    const baseY = this.columnInfo(b.x + (b.w >> 1), b.z + (b.d >> 1)).h;

    if (b.type === "well") {
      // 井戸: 3x3 の丸石枠 + 中央の水 + 屋根
      for (let dz = 0; dz < 3; dz++) {
        for (let dx = 0; dx < 3; dx++) {
          const wx = b.x + dx, wz = b.z + dz;
          const mid = dx === 1 && dz === 1;
          for (let y = baseY - 2; y <= baseY; y++) {
            set(wx, y, wz, mid && y > baseY - 2 ? B.WATER : B.COBBLE);
          }
          for (let y = baseY + 1; y <= baseY + 3; y++) set(wx, y, wz, B.AIR);
          const corner = (dx === 0 || dx === 2) && (dz === 0 || dz === 2);
          if (corner) {
            set(wx, baseY + 1, wz, B.COBBLE);
            set(wx, baseY + 2, wz, B.COBBLE);
          }
          set(wx, baseY + 3, wz, B.STONE_SLAB);
        }
      }
      return;
    }

    // 家: 丸石基礎 + 木材の壁 + 原木の柱 + ハーフブロックの屋根
    const floorY = baseY;
    const topY = floorY + 4;
    const midX = b.x + (b.w >> 1);
    const midZ = b.z + (b.d >> 1);

    for (let dz = 0; dz < b.d; dz++) {
      for (let dx = 0; dx < b.w; dx++) {
        const wx = b.x + dx, wz = b.z + dz;
        const edge = dx === 0 || dz === 0 || dx === b.w - 1 || dz === b.d - 1;
        const corner = (dx === 0 || dx === b.w - 1) && (dz === 0 || dz === b.d - 1);

        // 床と基礎 (地形の低いところは丸石で埋める)
        const gh = this.columnInfo(wx, wz).h;
        for (let y = Math.min(gh, floorY); y < floorY; y++) {
          set(wx, y, wz, hash3(wx, y, wz, seed ^ 0xa0a0) < 0.25 ? B.MOSSY_COBBLE : B.COBBLE);
        }
        set(wx, floorY, wz, B.PLANK);

        // 内部と上空をくり抜く (丘や木を除去)
        for (let y = floorY + 1; y <= topY + 2; y++) set(wx, y, wz, B.AIR);

        // 壁
        if (edge) {
          for (let y = floorY + 1; y <= floorY + 3; y++) {
            set(wx, y, wz, corner ? B.LOG : B.PLANK);
          }
        }
        // 屋根
        set(wx, topY, wz, edge ? B.PLANK : B.PLANK_SLAB);
      }
    }

    // ドア (向きに応じた辺の中央, 2 マス分の開口)
    let doorX = midX, doorZ = b.z;
    if (b.door === 1) doorZ = b.z + b.d - 1;
    else if (b.door === 2) { doorX = b.x; doorZ = midZ; }
    else if (b.door === 3) { doorX = b.x + b.w - 1; doorZ = midZ; }
    set(doorX, floorY + 1, doorZ, B.AIR);
    set(doorX, floorY + 2, doorZ, B.AIR);

    // 窓 (ドア以外の辺の中央にガラス)
    const sides = [[midX, b.z], [midX, b.z + b.d - 1], [b.x, midZ], [b.x + b.w - 1, midZ]];
    sides.forEach(([wx, wz], i) => {
      if (i !== b.door) set(wx, floorY + 2, wz, B.GLASS);
    });

    // 室内の松明
    set(midX, floorY + 1, midZ, B.TORCH);
  }

  // ---------------- ストロングホールド (エンドポータルの間) ----------------
  // シードに関わらず常に同じ座標に生成される, 最終目標へ向かう固定の部屋。
  // エンダーアイを使うとこの座標への方角と距離が分かる (main.js 側)。

  stampStronghold(chunk) {
    const ox = chunk.cx * CHUNK_SIZE;
    const oz = chunk.cz * CHUNK_SIZE;
    const { x: sx, z: sz, y: sy } = STRONGHOLD;
    const R = 7; // 部屋の半径 (床は 15x15)
    if (ox + 15 < sx - R || ox > sx + R || oz + 15 < sz - R || oz > sz + R) return;

    const set = (wx, y, wz, id) => {
      if (wx < ox || wx > ox + 15 || wz < oz || wz > oz + 15 || y < 1 || y >= CHUNK_H) return;
      chunk.set(wx - ox, y, wz - oz, id);
    };
    const fill = (x0, y0, z0, x1, y1, z1, id) => {
      for (let y = y0; y <= y1; y++)
        for (let z = z0; z <= z1; z++)
          for (let x = x0; x <= x1; x++) set(x, y, z, id);
    };

    // 部屋を掘って石レンガで囲む (床・天井・壁)
    fill(sx - R, sy - 1, sz - R, sx + R, sy, sz + R, B.STONE_BRICK);
    fill(sx - R + 1, sy + 1, sz - R + 1, sx + R - 1, sy + 5, sz + R - 1, B.AIR);
    fill(sx - R, sy + 6, sz - R, sx + R, sy + 6, sz + R, B.STONE_BRICK);
    for (const [wx0, wz0, wx1, wz1] of [
      [sx - R, sz - R, sx + R, sz - R], [sx - R, sz + R, sx + R, sz + R],
      [sx - R, sz - R, sx - R, sz + R], [sx + R, sz - R, sx + R, sz + R],
    ]) {
      fill(wx0, sy + 1, wz0, wx1, sy + 6, wz1, B.STONE_BRICK);
    }
    // ひび割れ模様を混ぜる (雰囲気づくり)
    for (let dz = -R; dz <= R; dz++) {
      for (let dx = -R; dx <= R; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== R) continue;
        if (hash2(sx + dx, sz + dz, this.seed ^ 0x57accc) < 0.3) {
          for (let y = sy + 1; y <= sy + 5; y++) set(sx + dx, y, sz + dz, B.CRACKED_STONE_BRICK);
        }
      }
    }
    // 壁の松明
    for (const [tx, tz] of [[sx - R + 1, sz], [sx + R - 1, sz], [sx, sz - R + 1], [sx, sz + R - 1]]) {
      set(tx, sy + 3, tz, B.TORCH);
    }

    // --- エンドポータルの枠 (5x5, 角抜き = 12 ブロック) ---
    const py = sy + 1;
    for (let dz = -2; dz <= 2; dz++) {
      for (let dx = -2; dx <= 2; dx++) {
        const m = Math.max(Math.abs(dx), Math.abs(dz));
        if (m === 2 && !(Math.abs(dx) === 2 && Math.abs(dz) === 2)) {
          set(sx + dx, py, sz + dz, B.END_PORTAL_FRAME);
        }
      }
    }
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
