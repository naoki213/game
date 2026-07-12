// ---------------------------------------------------------------
// ワールド: チャンク管理 / 地形生成 / 編集の永続化
// ---------------------------------------------------------------
"use strict";

const CHUNK_SIZE = 16;    // X/Z 方向
const CHUNK_H = 128;      // Y 方向 (ワールドの高さ) — 高い山と深い海のため 2 倍に拡張
const WATER_LEVEL = 46;   // 海面
const VILLAGE_GRID = 320; // 村の配置グリッド (ブロック)
const DESERT_TEMPLE_GRID = 260; // 砂漠の神殿の配置グリッド (ブロック)
const CAVE_LAVA_Y = 18;   // これより低い洞窟の空洞は溶岩で満たす
const LAVA_POOL_GRID = 40; // 地上のマグマだまりの配置グリッド (ブロック)

// エンドポータルの間 (ストロングホールド) の固定座標。シードによらず常に同じ場所
const STRONGHOLD = { x: 260, y: 20, z: 340 };

// ジ・エンド (最終決戦場)。通常の地形生成とは全く別の, 遠く離れた固定座標に
// 浮島 + 黒曜石の柱を生成する。シードによらず常に同じ内容
// ジ・エンド: 中央の本島 (islandR) + 空白の奈落 + 外周の浮島群 (outerR0..outerR1)。
// plateau は本島中央の平らな高台の高さ (岩盤の帰還ポータルの泉が乗る)
const END = {
  x: 100000, z: 0, y: 64,
  islandR: 48, pillarR: 32, plateau: 6,
  outerR0: 170, outerR1: 440, boundsR: 480,
};
const END_CITY_GRID = 96;   // 外周の島のエンドシティ配置グリッド (ブロック)

// ネザー。オーバーワールドとは別の, さらに遠く離れた固定領域に生成する
// 洞窟だらけの世界。オーバーワールド座標を 1/8 に縮めてこの領域内に写像する
// (本家の「ネザー経由の高速移動」の簡易版)
const NETHER = { x: -200000, z: 0, boundsR: 4000, lavaY: 30, scale: 8 };
function toNether(wx, wz) {
  return [NETHER.x + Math.floor(wx / NETHER.scale), NETHER.z + Math.floor(wz / NETHER.scale)];
}
function fromNether(nx, nz) {
  return [(nx - NETHER.x) * NETHER.scale, (nz - NETHER.z) * NETHER.scale];
}

// ネザーフォートレス。ネザー領域内の固定座標に生成される, ネザーレンガの
// 十字型の橋。ウィザースケルトンが徘徊する探索の目的地
const NETHER_FORTRESS = { x: NETHER.x + 50, z: NETHER.z + 30, y: 50 };

// ジャングル地帯 (オリジナル要素): スポーンから少し離れた固定ゾーン。
// 中心に神殿ダンジョンがあり, 最深部のスカイポータルから空島へ渡れる
const JUNGLE = { x: 420, z: 420, r: 130 };
const JUNGLE_TEMPLE_Y = 52;   // 神殿の土台の高さ (海面46より上。ゾーン中心は平らに整地)

// 空島 (オリジナル要素): 通常マップ上空の固定座標に浮かぶ島。
// 「空の加護」(神殿のポータルを通ると得られる) なしで空域 (y>96) に入ると
// 毒の瘴気でダメージを受ける。島にはボス「空の守護者」と宝, 騎乗できる鳥がいる
const SKY_ISLAND = { x: 250, z: -250, y: 104, r: 48 };  // スポーンから約350ブロック
const SKY_POISON_Y = 96;      // 瘴気が始まる高さ (空島の空域のみ)

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

// 切妻屋根: 建物 (x0,z0)-(w x d) の上に, 短い方の軸を傾斜方向にして棟を通す。
// stairBase は STAIR_ID_BASE + 素材インデックス*4 (0=north 1=east 2=south 3=west
// が閉じた並び。低い段の開いている向きが「下り方向」になるようにする)。
// maxRise で棟の高さを頭打ちにし, 幅が広い建物では平らな棟が続くようにする
function buildGableRoof(set, x0, z0, w, d, y0, stairBase, wallMat, maxRise) {
  const ridgeAxis = w >= d ? "x" : "z";
  const span = ridgeAxis === "x" ? d : w;
  const half = (span - 1) / 2;
  for (let i = 0; i < span; i++) {
    const distFromCenter = Math.abs(i - half);
    const rise = Math.min(Math.round(half - distFromCenter), maxRise);
    const y = y0 + rise;
    const isRidge = rise >= maxRise;
    const lowSideIsNear = i < half;
    if (ridgeAxis === "x") {
      const dir = lowSideIsNear ? 0 : 2;
      for (let dx = 0; dx < w; dx++) set(x0 + dx, y, z0 + i, isRidge ? wallMat : stairBase + dir);
    } else {
      const dir = lowSideIsNear ? 3 : 1;
      for (let dz = 0; dz < d; dz++) set(x0 + i, y, z0 + dz, isRidge ? wallMat : stairBase + dir);
    }
  }
  // 妻壁 (棟の傾斜に合わせた三角の壁を両端に埋める)
  for (let i = 0; i < span; i++) {
    const distFromCenter = Math.abs(i - half);
    const rise = Math.min(Math.round(half - distFromCenter), maxRise);
    const roofY = y0 + rise;
    for (let y = y0; y <= roofY; y++) {
      if (ridgeAxis === "x") {
        set(x0, y, z0 + i, wallMat);
        set(x0 + w - 1, y, z0 + i, wallMat);
      } else {
        set(x0 + i, y, z0, wallMat);
        set(x0 + i, y, z0 + d - 1, wallMat);
      }
    }
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
    this.templeCache = new Map();     // 砂漠の神殿グリッドのキャッシュ
    this.endCityCache = new Map();    // エンドシティグリッドのキャッシュ
    this.lavaPoolCache = new Map();   // 地上のマグマだまりグリッドのキャッシュ
    this.entranceCandCache = new Map();  // 洞窟の入り口候補 (グリッドセル) のキャッシュ
    this.entranceColCache = new Map();   // 列ごとの近傍入り口候補リストのキャッシュ

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

    // ジャングル地帯 (固定ゾーン): ゾーン内はジャングルで, 海に沈まないよう
    // 底上げする。中心部は神殿を置くために平らに整地する
    const jdx = x - JUNGLE.x, jdz = z - JUNGLE.z;
    const jd = Math.sqrt(jdx * jdx + jdz * jdz);
    if (jd < JUNGLE.r) {
      biome = "jungle";
      h = Math.max(h, WATER_LEVEL + 3);
      if (jd < 40) {
        const t = smoothstep(24, 40, jd); // 中心ほど JUNGLE_TEMPLE_Y に寄せる (大神殿ぶん広く)
        h = Math.round(JUNGLE_TEMPLE_Y * (1 - t) + h * t);
      }
    }

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
    if (y <= 2) return false;
    if (y > surfaceH - 4) {
      // 地表付近は通常ふさぐが, 入り口候補の近くだけ, 自然な洞窟ノイズと
      // 同じ見た目の蛇行トンネルで地表まで開けることを許可する
      if (y > surfaceH) return false;
      return this.isCaveEntrance(x, y, z);
    }
    return this.caveNoiseAt(x, y, z, surfaceH);
  }

  // ---------------- 洞窟の入り口 ----------------
  // まばらな格子点ごとに低確率で入り口候補を置き, そこから下向きに
  // ノイズで蛇行するトンネルを掘り, 自然な洞窟 (caveNoiseAt) にぶつかったら
  // そこで終わる。垂直な竪穴や幾何学的なスロープではなく, 本家のように
  // 不定形で蛇行する自然な穴になる

  // 入り口トンネルの, 入り口からの深さ (step) における中心座標。
  // 滑らかなノイズで左右に蛇行させる
  entranceTunnelCenter(ex, ez, seedX, seedZ, step) {
    const w = step * 0.22;
    const dx = this.noiseCave2.noise2(w + seedX, seedX * 0.6) * 3.2;
    const dz = this.noiseCave2.noise2(seedZ * 0.6, w + seedZ) * 3.2;
    return [ex + dx, ez + dz];
  }

  // グリッドセルごとの入り口候補 (存在しなければ null)
  caveEntranceCandidate(gx, gz) {
    const key = gx + "," + gz;
    let c = this.entranceCandCache.get(key);
    if (c !== undefined) return c;
    c = null;
    const CELL = 8;
    if (hash2(gx, gz, this.seed ^ 0x1ca7e) < 0.05) {
      const ex = gx * CELL + 2 + Math.floor(hash2(gx, gz, this.seed ^ 0xe17a01) * (CELL - 4));
      const ez = gz * CELL + 2 + Math.floor(hash2(gx, gz, this.seed ^ 0x0e18a2) * (CELL - 4));
      const eh = this.columnInfo(ex, ez).h;
      if (eh > WATER_LEVEL + 3) {
        const seedX = hash2(gx, gz, this.seed ^ 0x2a11) * 1000;
        const seedZ = hash2(gx, gz, this.seed ^ 0x3b22) * 1000;
        // 蛇行トンネルに沿って, 自然な洞窟にぶつかるまでの深さを探す
        // (見つからなければ短い袋小路として扱う)
        let depth = 12;
        for (let step = 2; step <= 24; step++) {
          const y = eh - step;
          if (y <= 3) { depth = step - 1; break; }
          const [tx, tz] = this.entranceTunnelCenter(ex, ez, seedX, seedZ, step);
          const localH = this.columnInfo(Math.round(tx), Math.round(tz)).h;
          if (this.caveNoiseAt(Math.round(tx), y, Math.round(tz), localH)) { depth = step; break; }
        }
        c = { ex, ez, eh, seedX, seedZ, depth };
      }
    }
    this.entranceCandCache.set(key, c);
    return c;
  }

  // (x, z) 列の近くにある入り口候補のリスト (複数チャンクにまたがるため周囲も見る)
  nearbyEntranceCandidates(x, z) {
    const key = x + "," + z;
    let list = this.entranceColCache.get(key);
    if (list) return list;
    list = [];
    const CELL = 8, R = 16;
    const gx0 = Math.floor((x - R) / CELL), gx1 = Math.floor((x + R) / CELL);
    const gz0 = Math.floor((z - R) / CELL), gz1 = Math.floor((z + R) / CELL);
    for (let gz = gz0; gz <= gz1; gz++) {
      for (let gx = gx0; gx <= gx1; gx++) {
        const c = this.caveEntranceCandidate(gx, gz);
        if (c) list.push(c);
      }
    }
    if (this.entranceColCache.size > 60000) this.entranceColCache.clear();
    this.entranceColCache.set(key, list);
    return list;
  }

  // (x, y, z) が入り口の蛇行トンネルの内部かどうか
  isCaveEntrance(x, y, z) {
    const candidates = this.nearbyEntranceCandidates(x, z);
    for (const c of candidates) {
      const step = c.eh - y;
      if (step < 0 || step > c.depth + 1) continue;
      const [tx, tz] = this.entranceTunnelCenter(c.ex, c.ez, c.seedX, c.seedZ, step);
      const dx = x - tx, dz = z - tz;
      const edgeNoise = this.noiseCave2.noise2(x * 0.4 + 40, z * 0.4 - 40);
      const radius = 1.7 + edgeNoise * 0.7 + Math.min(step, 3) * 0.15;
      if (dx * dx + dz * dz <= radius * radius) return true;
    }
    return false;
  }

  // 地上のマグマだまり (まれに平地にできる小さな溶岩の池)
  surfaceLavaPool(x, z, h) {
    const key = x + "," + z;
    let v = this.lavaPoolCache.get(key);
    if (v !== undefined) return v;
    v = false;

    if (h > WATER_LEVEL + 2) {
      const CELL = LAVA_POOL_GRID;
      const gx = Math.floor(x / CELL), gz = Math.floor(z / CELL);
      if (hash2(gx, gz, this.seed ^ 0x7a11a2) < 0.05) {
        const px = gx * CELL + 5 + Math.floor(hash2(gx, gz, this.seed ^ 0x3a2b1c) * (CELL - 10));
        const pz = gz * CELL + 5 + Math.floor(hash2(gx, gz, this.seed ^ 0x4b1c2d) * (CELL - 10));
        const ph = this.columnInfo(px, pz).h;
        if (ph > WATER_LEVEL + 2) {
          const dx = x - px, dz = z - pz;
          const rNoise = this.noiseCave2.noise2(x * 0.3 + 80, z * 0.3 - 80);
          const radius = 3 + rNoise * 1.6;
          if (dx * dx + dz * dz <= radius * radius) v = true;
        }
      }
    }

    if (this.lavaPoolCache.size > 60000) this.lavaPoolCache.clear();
    this.lavaPoolCache.set(key, v);
    return v;
  }

  isInEnd(x, z) {
    return Math.hypot(x - END.x, z - END.z) <= END.boundsR;
  }

  isInNether(x, z) {
    return Math.hypot(x - NETHER.x, z - NETHER.z) <= NETHER.boundsR;
  }

  // 10 本の柱の上にあるエンダークリスタルの座標 (generateEndChunk と同じ式)
  endCrystalCoords() {
    const { x: ex, z: ez, y: ey, pillarR } = END;
    const N = 10;
    const coords = [];
    for (let i = 0; i < N; i++) {
      const ang = (i / N) * Math.PI * 2;
      const px = Math.round(ex + Math.cos(ang) * pillarR);
      const pz = Math.round(ez + Math.sin(ang) * pillarR);
      const pillarTop = ey + 10 + (i * 5) % 21;
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
    // --- ネザー: 通常の地形生成を完全にスキップして洞窟だらけの世界を作る ---
    if (this.isInNether(ox + 8, oz + 8) || this.isInNether(ox, oz) || this.isInNether(ox + 15, oz + 15)) {
      return this.generateNetherChunk(chunk);
    }

    // --- 列ごとの基本地形 ---
    for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        const wx = ox + lx, wz = oz + lz;
        const { h, biome } = this.columnInfo(wx, wz);
        const sandy = biome === "desert" || h <= WATER_LEVEL + 1;
        const lavaPool = this.surfaceLavaPool(wx, wz, h);

        for (let y = 0; y <= h; y++) {
          let id;
          if (y === 0) {
            id = B.BEDROCK;
          } else if (this.isCave(wx, y, wz, h)) {
            id = y <= CAVE_LAVA_Y ? B.LAVA_BLOCK : B.AIR; // 深い洞窟は溶岩で満たす
          } else if (lavaPool && y >= h - 1) {
            id = B.LAVA_BLOCK; // 地上のマグマだまり
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

        const density = biome === "forest" ? 0.022 : biome === "plains" ? 0.004
          : biome === "jungle" ? 0.03 : 0;
        if (density === 0) continue;
        if (hash2(wx, wz, seed ^ 0xa5a5) >= density) continue;

        // ジャングルの木: 高い幹 (7-11) + 大きな樹冠。太い木は専用処理
        if (biome === "jungle") {
          if (lx < 3 || lx > 12 || lz < 3 || lz > 12) continue; // 樹冠半径3がはみ出す位置は諦める
          const jTrunkH = 7 + ((hash2(wx, wz, seed ^ 0x1234) * 5) | 0);
          const jTopY = h + jTrunkH;
          if (jTopY + 2 >= CHUNK_H) continue;
          for (let y = h + 1; y <= jTopY; y++) chunk.set(lx, y, lz, B.JUNGLE_LOG);
          chunk.set(lx, h, lz, B.DIRT);
          for (let dy = -2; dy <= 1; dy++) {
            const y = jTopY + dy;
            const r = dy >= 0 ? 2 : 3;
            for (let dz = -r; dz <= r; dz++) {
              for (let dx = -r; dx <= r; dx++) {
                if (dx === 0 && dz === 0 && dy < 0) continue;
                if (Math.abs(dx) === r && Math.abs(dz) === r &&
                    hash3(wx + dx, y, wz + dz, seed) < 0.5) continue;
                const tx = lx + dx, tz = lz + dz;
                if (chunk.get(tx, y, tz) === B.AIR) chunk.set(tx, y, tz, B.JUNGLE_LEAVES);
              }
            }
          }
          chunk.set(lx, jTopY + 1, lz, B.JUNGLE_LEAVES);
          continue;
        }

        // 樹種: オーク (標準) / 白樺 (細く高い) / ダークオーク (低く密な樹冠)
        const tr = hash2(wx, wz, seed ^ 0x7ee5);
        const type = biome === "forest"
          ? (tr < 0.6 ? "oak" : tr < 0.85 ? "birch" : "dark")
          : (tr < 0.8 ? "oak" : "birch");
        const logId = type === "birch" ? B.BIRCH_LOG : type === "dark" ? B.DARK_LOG : B.LOG;
        const leafId = type === "birch" ? B.BIRCH_LEAVES : type === "dark" ? B.DARK_LEAVES : B.LEAVES;
        const trunkH = type === "birch"
          ? 5 + ((hash2(wx, wz, seed ^ 0x1234) * 3) | 0)     // 白樺: 5-7 と高め
          : type === "dark"
            ? 3 + ((hash2(wx, wz, seed ^ 0x1234) * 2) | 0)   // ダークオーク: 3-4 と低め
            : 4 + ((hash2(wx, wz, seed ^ 0x1234) * 3) | 0);  // オーク: 4-6
        const topY = h + trunkH;
        if (topY + 2 >= CHUNK_H) continue;

        // 幹
        for (let y = h + 1; y <= topY; y++) chunk.set(lx, y, lz, logId);
        chunk.set(lx, h, lz, B.DIRT); // 根元は土に

        // 葉: 樹種ごとの形 (オーク: 丸い塊 / 白樺: 細い柱状 / ダークオーク: 角の残る密な樹冠)
        for (let dy = -2; dy <= 1; dy++) {
          const y = topY + dy;
          const r = type === "birch" ? (dy >= 1 ? 0 : 1) : (dy >= 0 ? 1 : 2);
          for (let dz = -r; dz <= r; dz++) {
            for (let dx = -r; dx <= r; dx++) {
              if (dx === 0 && dz === 0 && dy < 0) continue; // 幹の位置
              // 角を確率で抜いて丸みを出す (ダークオークはほぼ残して角ばった樹冠に)
              const cornerDrop = type === "dark" ? 0.15 : 0.6;
              if (Math.abs(dx) === r && Math.abs(dz) === r &&
                  hash3(wx + dx, y, wz + dz, seed) < cornerDrop) continue;
              const tx = lx + dx, tz = lz + dz;
              if (chunk.get(tx, y, tz) === B.AIR) chunk.set(tx, y, tz, leafId);
            }
          }
        }
        chunk.set(lx, topY + 1, lz, leafId); // てっぺん
      }
    }

    // --- 草花の生成 (草ブロックの上, 空きセルのみ) ---
    for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        const wx = ox + lx, wz = oz + lz;
        const { h, biome } = this.columnInfo(wx, wz);
        if (biome !== "plains" && biome !== "forest" && biome !== "jungle") continue;
        if (h + 1 >= CHUNK_H) continue;
        if (chunk.get(lx, h, lz) !== B.GRASS) continue;
        if (chunk.get(lx, h + 1, lz) !== B.AIR) continue;

        const r = hash2(wx, wz, seed ^ 0x77aa11);
        if (biome === "jungle" && r < 0.3) {
          chunk.set(lx, h + 1, lz, B.TALL_GRASS);   // ジャングルは下草が濃い
        } else if (r < 0.09) {
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

    // --- 砂漠の神殿を刻印 ---
    this.stampDesertTemples(chunk);

    // --- ストロングホールド (エンドポータルの間) を刻印 ---
    this.stampStronghold(chunk);

    // --- ジャングルの神殿ダンジョンと空島を刻印 ---
    this.stampJungleTemple(chunk);
    this.stampSkyIsland(chunk);

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

  // 外周の浮島のノイズ値 (リングの内外の縁でフェードアウトして途切れる)
  endOuterNoise(wx, wz, d) {
    const { x: ex, z: ez, outerR0, outerR1 } = END;
    if (d === undefined) d = Math.hypot(wx - ex, wz - ez);
    const n = this.noiseBiome.fbm2(wx * 0.02 + 7000, wz * 0.02 - 7000, 3);
    const edgeFade = Math.max(0, Math.min((d - outerR0) / 40, (outerR1 - d) / 40, 1));
    return n - (1 - edgeFade) * 0.3;
  }

  // 外周の浮島の表面高さ (島ごとに緩やかに上下する)
  endOuterSurfY(wx, wz) {
    return END.y - 4 + Math.round(this.noise.noise2(wx * 0.03 + 5000, wz * 0.03 - 5000) * 5);
  }

  generateEndChunk(chunk) {
    const ox = chunk.cx * CHUNK_SIZE;
    const oz = chunk.cz * CHUNK_SIZE;
    const { x: ex, z: ez, y: ey, islandR, pillarR, plateau, outerR0, outerR1 } = END;
    const seed = this.seed;

    for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        const wx = ox + lx, wz = oz + lz;
        const dx = wx - ex, dz = wz - ez;
        const d = Math.hypot(dx, dz);

        if (d <= islandR) {
          // 本島: 中央が平らな高台の盛り上がり + 下側のふくらみ + 縁の欠け
          const edgeNoise = hash2(wx, wz, seed ^ 0xe4d1) * 3;
          if (d > islandR - 2 && edgeNoise < 1.1) continue; // 縁を不揃いに欠けさせる
          const dome = Math.round(Math.max(0, (islandR - Math.max(d, 10)) * 0.16));
          const bottom = ey - 4 - dome * 2 - Math.round(hash2(wx, wz, seed ^ 0xe4d2) * 2);
          for (let y = bottom; y <= ey + dome; y++) chunk.set(lx, y, lz, B.END_STONE);
        } else if (d >= outerR0 && d <= outerR1) {
          // 外周の浮島群 (本島から奈落を挟んだ先に広がる)
          const v = this.endOuterNoise(wx, wz, d);
          if (v <= 0.16) continue;
          const surf = this.endOuterSurfY(wx, wz);
          const thick = 2 + Math.round((v - 0.16) * 45);
          for (let y = surf - thick; y <= surf; y++) chunk.set(lx, y, lz, B.END_STONE);
          // コーラスツリー (紫の樹木状の植物)
          if (v > 0.22 && hash2(wx, wz, seed ^ 0xc071) < 0.02) {
            const h = 2 + Math.floor(hash2(wx, wz, seed ^ 0xc082) * 4);
            for (let i = 1; i <= h; i++) chunk.set(lx, surf + i, lz, B.CHORUS_PLANT);
            chunk.set(lx, surf + h + 1, lz, B.CHORUS_FLOWER);
          }
        }
      }
    }

    const set = (wx, y, wz, id) => {
      if (wx < ox || wx > ox + 15 || wz < oz || wz > oz + 15 || y < 1 || y >= CHUNK_H) return;
      chunk.set(wx - ox, y, wz - oz, id);
    };

    // --- 黒曜石の柱 (太い円柱, 高さにばらつき) + てっぺんのエンダークリスタル。
    // 特に高い柱のクリスタルは鉄格子風の檻の中 (本家準拠) ---
    const N = 10;
    for (let i = 0; i < N; i++) {
      const ang = (i / N) * Math.PI * 2;
      const px = Math.round(ex + Math.cos(ang) * pillarR);
      const pz = Math.round(ez + Math.sin(ang) * pillarR);
      if (px + 3 < ox || px - 3 > ox + 15 || pz + 3 < oz || pz - 3 > oz + 15) continue;
      const h = 10 + (i * 5) % 21;
      const top = ey + h;
      for (let ddx = -2; ddx <= 2; ddx++) {
        for (let ddz = -2; ddz <= 2; ddz++) {
          if (ddx * ddx + ddz * ddz > 5.5) continue;
          for (let y = ey - 4; y <= top; y++) set(px + ddx, y, pz + ddz, B.OBSIDIAN);
        }
      }
      set(px, top + 1, pz, B.END_CRYSTAL);
      if (h >= 28) {
        for (let ddx = -1; ddx <= 1; ddx++) {
          for (let ddz = -1; ddz <= 1; ddz++) {
            if (Math.max(Math.abs(ddx), Math.abs(ddz)) === 1) {
              set(px + ddx, top + 1, pz + ddz, B.GLASS_PANE);
              set(px + ddx, top + 2, pz + ddz, B.GLASS_PANE);
            }
            set(px + ddx, top + 3, pz + ddz, B.STONE_SLAB);
          }
        }
      }
    }

    // --- 中央の高台に岩盤の泉 (帰還ポータルの台座)。ポータル本体と
    // ドラゴンの卵はドラゴン討伐時に main.js が設置する ---
    const py = ey + plateau;
    for (let ddx = -2; ddx <= 2; ddx++) {
      for (let ddz = -2; ddz <= 2; ddz++) {
        if (Math.abs(ddx) === 2 && Math.abs(ddz) === 2) continue; // 角を落とす
        set(ex + ddx, py + 1, ez + ddz, B.BEDROCK);
      }
    }
    for (let y = py + 2; y <= py + 4; y++) set(ex, y, ez, B.BEDROCK);

    // --- エンドシティ (外周の島に立つプルパーの塔) ---
    this.stampEndCity(chunk);

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

  // ---------------- エンドシティ ----------------
  // 外周の島のグリッドセルごとに決定論的に配置される, プルパーの塔。
  // 最上階に宝箱 (中身は main.js が初回接近時に詰める)

  endCityInCell(gx, gz) {
    const key = gx + "," + gz;
    if (this.endCityCache.has(key)) return this.endCityCache.get(key);
    let city = null;
    if (hash2(gx, gz, this.seed ^ 0xec17) < 0.65) {
      const G = END_CITY_GRID;
      const cx = gx * G + 20 + Math.floor(hash2(gx, gz, this.seed ^ 0xec18) * (G - 40));
      const cz = gz * G + 20 + Math.floor(hash2(gx, gz, this.seed ^ 0xec19) * (G - 40));
      const d = Math.hypot(cx - END.x, cz - END.z);
      // 外周リングの内側で, 島が十分に大きい場所にだけ建てる
      if (d >= END.outerR0 + 25 && d <= END.outerR1 - 25 &&
          this.endOuterNoise(cx, cz, d) > 0.26) {
        const y = this.endOuterSurfY(cx, cz);
        city = { cx, cz, y, chest: [cx, y + 12, cz] };
      }
    }
    this.endCityCache.set(key, city);
    return city;
  }

  // (wx, wz) の近くのエンドシティ (宝箱の初回ルート判定に使う)
  endCityNear(wx, wz) {
    const gx = Math.floor(wx / END_CITY_GRID);
    const gz = Math.floor(wz / END_CITY_GRID);
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        const c = this.endCityInCell(gx + dx, gz + dz);
        if (c && Math.abs(wx - c.cx) < 12 && Math.abs(wz - c.cz) < 12) return c;
      }
    }
    return null;
  }

  stampEndCity(chunk) {
    const ox = chunk.cx * CHUNK_SIZE;
    const oz = chunk.cz * CHUNK_SIZE;
    const g0x = Math.floor((ox - 16) / END_CITY_GRID);
    const g1x = Math.floor((ox + 31) / END_CITY_GRID);
    const g0z = Math.floor((oz - 16) / END_CITY_GRID);
    const g1z = Math.floor((oz + 31) / END_CITY_GRID);
    const set = (wx, y, wz, id) => {
      if (wx < ox || wx > ox + 15 || wz < oz || wz > oz + 15 || y < 1 || y >= CHUNK_H) return;
      chunk.set(wx - ox, y, wz - oz, id);
    };
    for (let gz = g0z; gz <= g1z; gz++) {
      for (let gx = g0x; gx <= g1x; gx++) {
        const c = this.endCityInCell(gx, gz);
        if (!c) continue;
        if (c.cx + 4 < ox || c.cx - 4 > ox + 15 || c.cz + 4 < oz || c.cz - 4 > oz + 15) continue;
        // 塔: 半径3のプルパーの円筒 (中は吹き抜け) + 基礎 + 最上階の床
        for (let ddx = -3; ddx <= 3; ddx++) {
          for (let ddz = -3; ddz <= 3; ddz++) {
            const r2 = ddx * ddx + ddz * ddz;
            if (r2 > 12.5) continue;
            const wall = r2 > 5.5;
            for (let y = c.y - 2; y <= c.y; y++) set(c.cx + ddx, y, c.cz + ddz, B.PURPUR); // 基礎
            for (let y = c.y + 1; y <= c.y + 10; y++) {
              set(c.cx + ddx, y, c.cz + ddz, wall ? B.PURPUR : B.AIR);
            }
            set(c.cx + ddx, c.y + 11, c.cz + ddz, B.PURPUR); // 最上階の床
            if (wall && (ddx + ddz) % 2 === 0) set(c.cx + ddx, c.y + 12, c.cz + ddz, B.PURPUR); // 胸壁
          }
        }
        // 南側の入口 (2マス)
        set(c.cx, c.y + 1, c.cz + 3, B.AIR);
        set(c.cx, c.y + 2, c.cz + 3, B.AIR);
        // 壁の窓ガラス (四面の中段)
        for (const [wdx, wdz] of [[3, 0], [-3, 0], [0, -3]]) {
          set(c.cx + wdx, c.y + 6, c.cz + wdz, B.GLASS_PANE);
        }
        // 最上階の宝箱
        set(c.chest[0], c.chest[1], c.chest[2], B.CHEST);
      }
    }
  }

  // ---------------- ネザー ----------------
  // 上下を岩盤で挟んだ, ネザーラックの塊を洞窟ノイズでくり抜いた世界。
  // 低い場所 (y < NETHER.lavaY) の空洞は溶岩の海になる

  isNetherCave(wx, y, wz) {
    const n = this.noiseCave.noise3(wx * 0.06 + 4000, y * 0.09 - 4000, wz * 0.06 + 4000);
    const n2 = this.noiseCave2.noise3(wx * 0.03 - 4000, y * 0.05 + 4000, wz * 0.03 - 4000);
    return n > 0.26 || n2 > 0.35;
  }

  generateNetherChunk(chunk) {
    const ox = chunk.cx * CHUNK_SIZE;
    const oz = chunk.cz * CHUNK_SIZE;
    const seed = this.seed;
    const caveCol = new Uint8Array(CHUNK_H);

    for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        const wx = ox + lx, wz = oz + lz;
        chunk.set(lx, 0, lz, B.BEDROCK);
        chunk.set(lx, CHUNK_H - 1, lz, B.BEDROCK);
        for (let y = 1; y <= CHUNK_H - 2; y++) {
          caveCol[y] = this.isNetherCave(wx, y, wz) ? 1 : 0;
        }
        // ソウルサンドの谷 (大きなノイズで低地にまとまって分布)
        const soul = this.noiseBiome.fbm2(wx * 0.02 + 900, wz * 0.02 - 900, 2);

        for (let y = 1; y <= CHUNK_H - 2; y++) {
          if (caveCol[y]) {
            chunk.set(lx, y, lz, y < NETHER.lavaY ? B.LAVA_BLOCK : B.AIR);
            continue;
          }
          const floor = y < CHUNK_H - 2 && caveCol[y + 1];       // 上が空洞 = 床の表層
          const nearFloor = floor ||
            (y < CHUNK_H - 3 && caveCol[y + 2] && !caveCol[y + 1]); // 表層の1つ下まで
          const ceiling = y > 1 && caveCol[y - 1];               // 下が空洞 = 天井
          const r = hash3(wx, y, wz, seed ^ 0x4e37e2);

          let id = B.NETHERRACK;
          if (nearFloor && soul > 0.22 && y <= NETHER.lavaY + 14) {
            id = B.SOUL_SAND;      // ソウルサンドの谷 (深さ2の表層)
          } else if (floor && y <= NETHER.lavaY + 3 && hash2(wx, wz, seed ^ 0x77aa) < 0.35) {
            id = B.MAGMA;          // 溶岩の海の岸辺・海底にマグマブロック
          } else if (floor && r < 0.05) {
            id = B.MAGMA;          // 床のあちこちに散らばるマグマブロック
          } else if (r < 0.012) {
            id = B.NETHER_QUARTZ_ORE;
          } else if (!floor && !ceiling && r < 0.014) {
            id = B.LAVA_BLOCK;     // 壁の中の隠れ溶岩だまり (掘り当てると噴き出す)
          }
          chunk.set(lx, y, lz, id);

          // 天井から垂れ下がるグロウストーンの塊 (本家風のシャンデリア)
          if (ceiling && y > NETHER.lavaY + 10) {
            const cl = hash2(wx >> 3, wz >> 3, seed ^ 0x91ee);   // 8x8 のクラスタ単位
            if (cl < 0.22 && hash2(wx, wz, seed ^ 0x3d71) < 0.4) {
              chunk.set(lx, y - 1, lz, B.GLOWSTONE);
              if (caveCol[y - 2] && hash2(wx, wz, seed ^ 0x5e2f) < 0.35) {
                chunk.set(lx, y - 2, lz, B.GLOWSTONE);
              }
            }
          }
        }

        // 溶岩滝: まれに高い天井の溶岩源から溶岩が流れ落ちる
        if (hash2(wx, wz, seed ^ 0x66b1) < 0.0025) {
          for (let y = CHUNK_H - 16; y > NETHER.lavaY + 12; y--) {
            if (!caveCol[y] && caveCol[y - 1]) {   // 天井を発見
              chunk.set(lx, y, lz, B.LAVA_BLOCK);  // 天井に埋まった溶岩源
              for (let fy = y - 1; fy >= NETHER.lavaY && caveCol[fy]; fy--) {
                chunk.set(lx, fy, lz, LAVA_FLOW_BASE + 2);  // 満水位の落下柱
              }
              break;
            }
          }
        }
      }
    }

    // --- ネザーフォートレスを刻印 ---
    this.stampNetherFortress(chunk);

    // --- 保存済みの編集を適用 ---
    const key = World.key(chunk.cx, chunk.cz);
    const edits = this.edits.get(key);
    if (edits) {
      for (const [idx, id] of edits) chunk.data[idx] = id;
    }

    chunk.generated = true;
    chunk.dirty = true;
    return chunk;
  }

  // ネザー要塞: 中央の砦 (城塞) + 4方向へ伸びる長い橋 + 橋の途中の門塔。
  // 本家のネザーフォートレスを意識した, ネザーレンガ造りの大型構造物
  stampNetherFortress(chunk) {
    const ox = chunk.cx * CHUNK_SIZE;
    const oz = chunk.cz * CHUNK_SIZE;
    const { x: fx, z: fz, y: fy } = NETHER_FORTRESS;
    const R = 44;
    if (ox + 15 < fx - R || ox > fx + R || oz + 15 < fz - R || oz > fz + R) return;

    const set = (wx, y, wz, id) => {
      if (wx < ox || wx > ox + 15 || wz < oz || wz > oz + 15 || y < 1 || y >= CHUNK_H) return;
      chunk.set(wx - ox, y, wz - oz, id);
    };
    const fill = (x0, y0, z0, x1, y1, z1, id) => {
      for (let y = y0; y <= y1; y++)
        for (let z = z0; z <= z1; z++)
          for (let x = x0; x <= x1; x++) set(x, y, z, id);
    };

    // --- 通行スペースをくり抜く (橋筋 + 中央広場のみ。全域はくり抜かない) ---
    fill(fx - 40, fy + 1, fz - 4, fx + 40, fy + 9, fz + 4, B.AIR);   // 東西の橋筋
    fill(fx - 4, fy + 1, fz - 40, fx + 4, fy + 9, fz + 40, B.AIR);   // 南北の橋筋
    fill(fx - 8, fy + 1, fz - 8, fx + 8, fy + 10, fz + 8, B.AIR);    // 中央

    // --- 長い橋 (幅5の床 + 胸壁 + 定間隔の支柱) ---
    fill(fx - 2, fy, fz - 40, fx + 2, fy, fz + 40, B.NETHER_BRICK);  // 南北
    fill(fx - 40, fy, fz - 2, fx + 40, fy, fz + 2, B.NETHER_BRICK);  // 東西
    for (let z = fz - 40; z <= fz + 40; z++) {
      if ((z - fz) % 2 === 0) { set(fx - 2, fy + 1, z, B.NETHER_BRICK); set(fx + 2, fy + 1, z, B.NETHER_BRICK); }
    }
    for (let x = fx - 40; x <= fx + 40; x++) {
      if ((x - fx) % 2 === 0) { set(x, fy + 1, fz - 2, B.NETHER_BRICK); set(x, fy + 1, fz + 2, B.NETHER_BRICK); }
    }
    // 支柱 (10ブロックごとに橋の下へ)
    for (let off = 10; off <= 40; off += 10) {
      for (const s of [-1, 1]) {
        fill(fx - 2, Math.max(2, fy - 18), fz + off * s, fx - 2, fy - 1, fz + off * s, B.NETHER_BRICK);
        fill(fx + 2, Math.max(2, fy - 18), fz + off * s, fx + 2, fy - 1, fz + off * s, B.NETHER_BRICK);
        fill(fx + off * s, Math.max(2, fy - 18), fz - 2, fx + off * s, fy - 1, fz - 2, B.NETHER_BRICK);
        fill(fx + off * s, Math.max(2, fy - 18), fz + 2, fx + off * s, fy - 1, fz + 2, B.NETHER_BRICK);
      }
    }

    // --- 中央の砦 (13x13, 壁 + 屋根 + 狭間窓 + 4方向の門) ---
    fill(fx - 6, fy, fz - 6, fx + 6, fy, fz + 6, B.NETHER_BRICK);        // 床
    fill(fx - 5, fy + 1, fz - 5, fx + 5, fy + 5, fz + 5, B.AIR);         // 内部
    for (let y = fy + 1; y <= fy + 5; y++) {                             // 壁
      for (let d = -6; d <= 6; d++) {
        set(fx + d, y, fz - 6, B.NETHER_BRICK); set(fx + d, y, fz + 6, B.NETHER_BRICK);
        set(fx - 6, y, fz + d, B.NETHER_BRICK); set(fx + 6, y, fz + d, B.NETHER_BRICK);
      }
    }
    // 4方向の門 (幅3 x 高さ3, 橋と直結)
    fill(fx - 1, fy + 1, fz - 6, fx + 1, fy + 3, fz - 6, B.AIR);
    fill(fx - 1, fy + 1, fz + 6, fx + 1, fy + 3, fz + 6, B.AIR);
    fill(fx - 6, fy + 1, fz - 1, fx - 6, fy + 3, fz + 1, B.AIR);
    fill(fx + 6, fy + 1, fz - 1, fx + 6, fy + 3, fz + 1, B.AIR);
    // 狭間窓 (壁の中段)
    for (const d of [-3, 3]) {
      set(fx + d, fy + 3, fz - 6, B.AIR); set(fx + d, fy + 3, fz + 6, B.AIR);
      set(fx - 6, fy + 3, fz + d, B.AIR); set(fx + 6, fy + 3, fz + d, B.AIR);
    }
    fill(fx - 6, fy + 6, fz - 6, fx + 6, fy + 6, fz + 6, B.NETHER_BRICK); // 屋根
    for (let d = -6; d <= 6; d++) {                                       // 屋上の胸壁
      if (d % 2 === 0) {
        set(fx + d, fy + 7, fz - 6, B.NETHER_BRICK); set(fx + d, fy + 7, fz + 6, B.NETHER_BRICK);
        set(fx - 6, fy + 7, fz + d, B.NETHER_BRICK); set(fx + 6, fy + 7, fz + d, B.NETHER_BRICK);
      }
    }
    // 内部の照明 (天井四隅のグロウストーン)
    for (const [dx, dz] of [[-4, -4], [4, -4], [-4, 4], [4, 4]]) {
      set(fx + dx, fy + 5, fz + dz, B.GLOWSTONE);
    }
    // 砦の支柱 (四隅から地面へ)
    for (const [dx, dz] of [[-6, -6], [6, -6], [-6, 6], [6, 6]]) {
      fill(fx + dx, Math.max(2, fy - 18), fz + dz, fx + dx, fy - 1, fz + dz, B.NETHER_BRICK);
    }
    // 宝箱 x3 (中身は main.js 側で初回訪問時に埋める)
    set(fx, fy + 1, fz + 1, B.CHEST);
    set(fx - 4, fy + 1, fz - 4, B.CHEST);
    set(fx + 4, fy + 1, fz - 4, B.CHEST);

    // --- 門塔 (各橋の途中 ±16 に, 橋をまたぐアーチ) ---
    for (const s of [-1, 1]) {
      const gx = fx + 16 * s;
      fill(gx - 2, fy + 1, fz - 3, gx + 2, fy + 6, fz + 3, B.NETHER_BRICK); // 東西橋の門塔
      fill(gx - 2, fy + 1, fz - 1, gx + 2, fy + 3, fz + 1, B.AIR);          // アーチ通路
      set(gx, fy + 4, fz, B.GLOWSTONE);                                      // 通路の天井照明
      for (let d = -3; d <= 3; d += 2) {                                     // 屋上の胸壁
        set(gx - 2, fy + 7, fz + d, B.NETHER_BRICK);
        set(gx + 2, fy + 7, fz + d, B.NETHER_BRICK);
      }
      const gz = fz + 16 * s;
      fill(fx - 3, fy + 1, gz - 2, fx + 3, fy + 6, gz + 2, B.NETHER_BRICK); // 南北橋の門塔
      fill(fx - 1, fy + 1, gz - 2, fx + 1, fy + 3, gz + 2, B.AIR);          // アーチ通路
      set(fx, fy + 4, gz, B.GLOWSTONE);
      for (let d = -3; d <= 3; d += 2) {
        set(fx + d, fy + 7, gz - 2, B.NETHER_BRICK);
        set(fx + d, fy + 7, gz + 2, B.NETHER_BRICK);
      }
    }
  }

  // ジャングルの神殿ダンジョン: 苔むした石レンガのピラミッド。地下へ降りる階段の
  // 先に宝物庫とスカイポータルの間がある (オリジナル要素)
  stampJungleTemple(chunk) {
    const ox = chunk.cx * CHUNK_SIZE;
    const oz = chunk.cz * CHUNK_SIZE;
    const tx = JUNGLE.x, tz = JUNGLE.z, ty = JUNGLE_TEMPLE_Y;
    const R = 42;
    if (ox + 15 < tx - R || ox > tx + R || oz + 15 < tz - R || oz > tz + R) return;

    const set = (wx, y, wz, id) => {
      if (wx < ox || wx > ox + 15 || wz < oz || wz > oz + 15 || y < 1 || y >= CHUNK_H) return;
      chunk.set(wx - ox, y, wz - oz, id);
    };
    const fill = (x0, y0, z0, x1, y1, z1, id) => {
      for (let y = y0; y <= y1; y++)
        for (let z = z0; z <= z1; z++)
          for (let x = x0; x <= x1; x++) set(x, y, z, id);
    };
    // 苔むした石レンガと普通の石レンガの混合 (遺跡らしい風合い)
    const brick = (x, y, z) =>
      hash3(x, y, z, 0x7357) < 0.6 ? B.MOSSY_STONE_BRICK : B.STONE_BRICK;
    const fillBrick = (x0, y0, z0, x1, y1, z1) => {
      for (let y = y0; y <= y1; y++)
        for (let z = z0; z <= z1; z++)
          for (let x = x0; x <= x1; x++) set(x, y, z, brick(x, y, z));
    };

    // --- ピラミッド本体 (25x25 の階段状, 11 段の大神殿) ---
    fill(tx - 13, ty + 1, tz - 13, tx + 13, ty + 16, tz + 13, B.AIR); // 上空を開ける
    for (let i = 0; i <= 10; i++) {
      const half = 12 - i;
      fillBrick(tx - half, ty + 1 + i, tz - half, tx + half, ty + 1 + i, tz + half);
    }
    set(tx, ty + 12, tz, B.GLOWSTONE); // 頂上の灯り

    // 大広間 (内部をくり抜く) + 柱 + 中央の祭壇
    fill(tx - 7, ty + 1, tz - 7, tx + 7, ty + 5, tz + 7, B.AIR);
    for (const [dx, dz] of [[-5, -5], [5, -5], [-5, 5], [5, 5]]) {
      fillBrick(tx + dx, ty + 1, tz + dz, tx + dx, ty + 5, tz + dz);
      set(tx + dx, ty + 5, tz + dz, B.GLOWSTONE); // 柱の頂を照らす
    }
    fillBrick(tx - 1, ty + 1, tz - 1, tx + 1, ty + 1, tz + 1); // 祭壇の台座
    set(tx, ty + 2, tz, B.GLOWSTONE);                          // 祭壇の光

    // 入口 (南側, 幅3 x 高さ4 の大きな門)
    fill(tx - 1, ty + 1, tz - 13, tx + 1, ty + 4, tz - 7, B.AIR);

    // --- 地下へ降りる階段 (北へ 1 ずつ下がる, 10 段) ---
    for (let k = 0; k <= 10; k++) {
      const y = ty - k, z = tz + 4 + k;
      fillBrick(tx - 1, y, z, tx + 1, y, z);           // 踏み面
      fill(tx - 1, y + 1, z, tx + 1, y + 3, z, B.AIR); // 頭上
      // 側壁 (自然の土がこぼれないように)
      set(tx - 2, y + 1, z, brick(tx - 2, y + 1, z));
      set(tx + 2, y + 1, z, brick(tx + 2, y + 1, z));
    }

    // --- 衛兵の間 (階段を降りた先の前室) ---
    fillBrick(tx - 7, ty - 11, tz + 15, tx + 7, ty - 4, tz + 25);   // 外殻
    fill(tx - 6, ty - 10, tz + 16, tx + 6, ty - 5, tz + 24, B.AIR); // 内部
    fill(tx - 1, ty - 10, tz + 15, tx + 1, ty - 8, tz + 15, B.AIR); // 階段からの入口
    for (const [dx, dz] of [[-4, 18], [4, 18], [-4, 22], [4, 22]]) {
      fillBrick(tx + dx, ty - 10, tz + dz, tx + dx, ty - 5, tz + dz); // 列柱
      set(tx + dx, ty - 5, tz + dz, B.GLOWSTONE);
    }
    set(tx + 5, ty - 10, tz + 24, B.CHEST); // 前室の宝箱

    // --- ポータルの間 (最深部の大部屋) ---
    fillBrick(tx - 6, ty - 11, tz + 26, tx + 6, ty - 4, tz + 36);   // 外殻
    fill(tx - 5, ty - 10, tz + 27, tx + 5, ty - 5, tz + 35, B.AIR); // 内部
    fill(tx - 1, ty - 10, tz + 25, tx + 1, ty - 8, tz + 26, B.AIR); // 前室からの通路
    for (const [dx, dz] of [[-5, 27], [5, 27], [-5, 35], [5, 35]]) {
      set(tx + dx, ty - 5, tz + dz, B.GLOWSTONE);
    }
    // 宝箱 x2 (中身は main.js が初回訪問時に埋める)
    set(tx - 4, ty - 10, tz + 34, B.CHEST);
    set(tx + 4, ty - 10, tz + 34, B.CHEST);
    // スカイポータル (奥の壁際, 2x4 の枠)
    const pz = tz + 34;
    for (let x = tx - 1; x <= tx + 2; x++) {
      set(x, ty - 11, pz, B.MOSSY_STONE_BRICK);
      set(x, ty - 6, pz, B.MOSSY_STONE_BRICK);
    }
    for (let y = ty - 10; y <= ty - 7; y++) {
      set(tx - 1, y, pz, B.MOSSY_STONE_BRICK);
      set(tx + 2, y, pz, B.MOSSY_STONE_BRICK);
      set(tx, y, pz, B.SKY_PORTAL);
      set(tx + 1, y, pz, B.SKY_PORTAL);
    }
  }

  // 空島: 上空に浮かぶ楕円形の島。中央はボスアリーナ, 帰りのスカイポータルと
  // 宝箱, 騎乗できる鳥が待っている (オリジナル要素)
  stampSkyIsland(chunk) {
    const ox = chunk.cx * CHUNK_SIZE;
    const oz = chunk.cz * CHUNK_SIZE;
    const { x: sx, z: sz, y: sy, r: sr } = SKY_ISLAND;
    // 衛星の小島 (本島の東) も含めた範囲で刻印判定する
    const ix = sx + sr + 24, iz = sz - 14, ir = 12;
    const R = sr + 44;
    if (ox + 15 < sx - R || ox > sx + R || oz + 15 < sz - R || oz > sz + R) return;

    const set = (wx, y, wz, id) => {
      if (wx < ox || wx > ox + 15 || wz < oz || wz > oz + 15 || y < 1 || y >= CHUNK_H) return;
      chunk.set(wx - ox, y, wz - oz, id);
    };

    // 雲の島のかたまりを 1 つ刻印する。「雲に乗っている」イメージ:
    // ふわふわした雲ブロックの土台に土がまだらに混ざり, 土の上には草が生える
    const stampBlob = (cxw, czw, rr, baseY, domeH, arenaR) => {
      for (let lz = 0; lz < CHUNK_SIZE; lz++) {
        for (let lx = 0; lx < CHUNK_SIZE; lx++) {
          const wx = ox + lx, wz = oz + lz;
          const dx = wx - cxw, dz = wz - czw;
          const d = Math.sqrt(dx * dx + dz * dz) / rr;
          if (d >= 1) continue;
          const arena = d < arenaR;
          const hump = 1 - d * d;
          const yTop = arena ? baseY + domeH : baseY + Math.round(hump * domeH);
          // 雲らしくふわっと波打つ下面
          const depth = Math.round((1 - d) * (rr * 0.34) *
            (0.55 + hash2(wx, wz, 0x55c) * 0.7));
          const yBot = Math.max(2, baseY - depth);
          // 列ごとに雲か土かをまだらに決める (中心の広場周辺は土多め)
          const dirtCol = hash2(wx, wz, 0xc10d) < (d < 0.55 ? 0.45 : 0.25);
          for (let y = yBot; y <= yTop; y++) {
            let id = B.CLOUD;
            if (arena && y === yTop) id = B.STONE_BRICK;            // 中央の広場
            else if (dirtCol && y === yTop) id = B.GRASS;           // 土の列は草地
            else if (dirtCol && y >= yTop - 2) id = B.DIRT;
            chunk.set(lx, y, lz, id);
          }
          // 上空を確実に開けておく (雲/他構造との干渉避け)
          for (let y = yTop + 1; y <= Math.min(CHUNK_H - 1, baseY + 22); y++) {
            if (chunk.get(lx, y, lz) !== B.AIR) chunk.set(lx, y, lz, B.AIR);
          }
          // 固有の植生: 草地には空草がびっしり, まれに光る星の花
          if (!arena && yTop + 1 < CHUNK_H) {
            const pv = hash2(wx, wz, 0xf10a);
            if (dirtCol && pv < 0.3) chunk.set(lx, yTop + 1, lz, B.SKY_GRASS);
            else if (pv > 0.975) chunk.set(lx, yTop + 1, lz, B.STAR_FLOWER);
          }
        }
      }
    };

    // --- 本島 (半径 sr) と衛星の小島 ---
    stampBlob(sx, sz, sr, sy, 7, 0.3);
    stampBlob(ix, iz, ir, sy + 2, 3, 0);

    const floorY = sy + 7; // 中央広場の床の高さ

    // --- 帰りのスカイポータル (広場から離れた西の端, 雲の桟橋の上) ---
    const px2 = sx - sr + 4;   // 桟橋の中心 x (島の西端近く)
    // 雲の桟橋 (7x7 の平場)
    for (let dz = -3; dz <= 3; dz++) {
      for (let dx = -3; dx <= 3; dx++) {
        set(px2 + dx, sy + 1, sz + dz, B.CLOUD);
        for (let y = sy + 2; y <= sy + 8; y++) set(px2 + dx, y, sz + dz, B.AIR);
      }
    }
    const pfx = px2 - 1;   // ポータル面の x (2セル: pfx, pfx+1)
    for (let x = pfx - 1; x <= pfx + 2; x++) {
      set(x, sy + 1, sz, B.MOSSY_STONE_BRICK); // 土台 (桟橋と面一)
      set(x, sy + 5, sz, B.MOSSY_STONE_BRICK);
    }
    for (let y = sy + 2; y <= sy + 4; y++) {
      set(pfx - 1, y, sz, B.MOSSY_STONE_BRICK);
      set(pfx + 2, y, sz, B.MOSSY_STONE_BRICK);
      set(pfx, y, sz, B.SKY_PORTAL);
      set(pfx + 1, y, sz, B.SKY_PORTAL);
    }

    // --- 宝箱 x3 (広場の東側と南側) ---
    set(sx + 12, floorY + 1, sz + 5, B.CHEST);
    set(sx + 12, floorY + 1, sz - 5, B.CHEST);
    set(sx + 5, floorY + 1, sz + 12, B.CHEST);

    // --- 照明の柱 (広場の縁) ---
    for (const [dx, dz] of [[-10, -10], [10, -10], [-10, 10], [10, 10], [0, -13], [0, 13]]) {
      set(sx + dx, floorY + 1, sz + dz, B.STONE_BRICK);
      set(sx + dx, floorY + 2, sz + dz, B.GLOWSTONE);
    }

    // --- 衛星の小島の宝箱 (鳥で飛んで取りに行くおまけ) ---
    set(ix, sy + 2 + 3 + 1, iz, B.CHEST);

    // --- 空の木 (白い幹 + 淡い桜色の空葉。下界には無い固有の木) ---
    const trees = [
      [sx + 24, sz + 14], [sx - 20, sz + 26], [sx + 5, sz - 28],
      [sx - 28, sz - 12], [sx + 30, sz - 18], [sx - 8, sz + 34],
    ];
    for (const [tx2, tz2] of trees) {
      const dx = tx2 - sx, dz = tz2 - sz;
      const d = Math.sqrt(dx * dx + dz * dz) / sr;
      if (d >= 0.92) continue;
      const gy = sy + Math.round((1 - d * d) * 7); // その位置の地表
      for (let y = gy + 1; y <= gy + 5; y++) set(tx2, y, tz2, B.BIRCH_LOG);
      for (let dy = 4; dy <= 6; dy++) {
        const r = dy === 6 ? 1 : 2;
        for (let ddz = -r; ddz <= r; ddz++) {
          for (let ddx = -r; ddx <= r; ddx++) {
            if (ddx === 0 && ddz === 0 && dy < 6) continue;
            set(tx2 + ddx, gy + dy + 1, tz2 + ddz, B.SKY_LEAVES);
          }
        }
      }
    }
  }

  // ネザーの (nx, y, nz) 付近で安全な (溶岩に埋まっていない, 頭上が開けた) 足場の Y を探す。
  // 見つからなければ nx,nz に人工的な足場を彫って安全を確保する
  findSafeNetherY(nx, nz) {
    for (let y = 100; y >= 2; y--) {
      const foot = this.getBlock(nx, y, nz);
      if (foot !== B.AIR && !BLOCKS[foot].fluid && foot !== B.MAGMA) {
        if (this.getBlock(nx, y + 1, nz) === B.AIR && this.getBlock(nx, y + 2, nz) === B.AIR) {
          return y + 1;
        }
      }
    }
    // 見つからなければ y=64 に人工の足場を彫る
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        this.setBlock(nx + dx, 64, nz + dz, B.NETHERRACK);
        this.setBlock(nx + dx, 65, nz + dz, B.AIR);
        this.setBlock(nx + dx, 66, nz + dz, B.AIR);
      }
    }
    return 65;
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
        // 本家より規模の大きい村: 家の軒数と広がりを拡張
        const n = 7 + Math.floor(hash2(gx, gz, this.seed ^ 0x3333) * 5);
        for (let i = 0; i < n; i++) {
          const ang = (i / n) * Math.PI * 2 + hash2(gx, gz + i * 7, this.seed ^ 0x4444) * 0.8;
          const dist = 10 + hash2(gx + i * 7, gz, this.seed ^ 0x5555) * 26;
          const w = 5 + 2 * Math.floor(hash2(i, gx ^ gz, this.seed ^ 0x66) * 2);   // 5 or 7
          const d = 5 + 2 * Math.floor(hash2(i * 3, gx ^ gz, this.seed ^ 0x77) * 2);
          const bx = Math.round(cx + Math.cos(ang) * dist) - (w >> 1);
          const bz = Math.round(cz + Math.sin(ang) * dist) - (d >> 1);
          const bh = this.columnInfo(bx + (w >> 1), bz + (d >> 1)).h;
          if (bh <= WATER_LEVEL || bh > WATER_LEVEL + 20) continue;
          const b = { type: "house", x: bx, z: bz, w, d, door: i % 4 };
          // 半分ほどの家には生活用品の入ったチェストを置く (中身は main.js が初回接近時に詰める)
          if (hash2(gx * 31 + i, gz * 17 + i, this.seed ^ 0xc4e5) < 0.5) {
            b.chest = [bx + w - 2, bh + 1, bz + d - 2];
          }
          buildings.push(b);
        }

        // 教会: 村の北側, 尖塔 (鐘楼) つき。ドアは南向き固定 (村の中心を向く)
        const churchDist = 26 + hash2(gx, gz, this.seed ^ 0x7001) * 10;
        const churchAng = -Math.PI / 2 + (hash2(gx, gz, this.seed ^ 0x7002) - 0.5) * 0.5;
        const chW = 9, chD = 17;
        const cbx = Math.round(cx + Math.cos(churchAng) * churchDist) - (chW >> 1);
        const cbz = Math.round(cz + Math.sin(churchAng) * churchDist) - (chD >> 1);
        const chH = this.columnInfo(cbx + (chW >> 1), cbz + (chD >> 1)).h;
        if (chH > WATER_LEVEL && chH < WATER_LEVEL + 20)
          buildings.push({ type: "church", x: cbx, z: cbz, w: chW, d: chD });

        // 見張り塔: 村の南側, 螺旋階段で登れる。ドアは北向き固定 (村の中心を向く)
        const towerDist = 28 + hash2(gx, gz, this.seed ^ 0x7003) * 10;
        const towerAng = Math.PI / 2 + (hash2(gx, gz, this.seed ^ 0x7004) - 0.5) * 0.5;
        const twW = 5, twD = 5;
        const tbx = Math.round(cx + Math.cos(towerAng) * towerDist) - (twW >> 1);
        const tbz = Math.round(cz + Math.sin(towerAng) * towerDist) - (twD >> 1);
        const twH = this.columnInfo(tbx + (twW >> 1), tbz + (twD >> 1)).h;
        if (twH > WATER_LEVEL && twH < WATER_LEVEL + 20)
          buildings.push({ type: "tower", x: tbx, z: tbz, w: twW, d: twD });

        // 神殿: 村の東側, 大理石の柱廊 (壁のない開放的な西洋神殿風)
        const templeDist = 24 + hash2(gx, gz, this.seed ^ 0x7005) * 12;
        const templeAng = (hash2(gx, gz, this.seed ^ 0x7006) - 0.5) * 0.5;
        const tpW = 11, tpD = 9;
        const tpx = Math.round(cx + Math.cos(templeAng) * templeDist) - (tpW >> 1);
        const tpz = Math.round(cz + Math.sin(templeAng) * templeDist) - (tpD >> 1);
        const tpH = this.columnInfo(tpx + (tpW >> 1), tpz + (tpD >> 1)).h;
        if (tpH > WATER_LEVEL && tpH < WATER_LEVEL + 20)
          buildings.push({ type: "temple", x: tpx, z: tpz, w: tpW, d: tpD });

        village = { cx, cz, buildings };
      }
    }
    this.villageCache.set(key, village);
    return village;
  }

  stampVillages(chunk) {
    const ox = chunk.cx * CHUNK_SIZE;
    const oz = chunk.cz * CHUNK_SIZE;
    // 建物は村の中心から最大 ~40 ブロック (教会/塔/神殿を含め拡張) → 隣接グリッドセルも確認
    const g0x = Math.floor((ox - 80) / VILLAGE_GRID);
    const g1x = Math.floor((ox + 96) / VILLAGE_GRID);
    const g0z = Math.floor((oz - 80) / VILLAGE_GRID);
    const g1z = Math.floor((oz + 96) / VILLAGE_GRID);
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

    if (b.type === "house") {
      // 洋風の家: 丸石基礎 + 木材の壁 (原木の角柱 + 中段の原木の梁で半木造風) +
      // 切妻屋根 (石レンガの階段) + 本家同様の2マスドア + 窓ガラス + 煙突
      const floorY = baseY;
      const topY = floorY + 3;   // 壁の最上段 (この上から屋根)
      const midX = b.x + (b.w >> 1);
      const midZ = b.z + (b.d >> 1);
      const doorDirMap = [0, 2, 3, 1]; // b.door (0=北 1=南 2=西 3=東の壁) → ドアの向き

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
          for (let y = floorY + 1; y <= topY + b.w + 2; y++) set(wx, y, wz, B.AIR);

          // 壁 (角は原木の柱, 中段 (floorY+2) は原木の梁で半木造 (Tudor) 風に)
          if (edge) {
            set(wx, floorY + 1, wz, corner ? B.LOG : B.PLANK);
            set(wx, floorY + 2, wz, corner ? B.LOG : B.LOG);
            set(wx, floorY + 3, wz, corner ? B.LOG : B.PLANK);
          }
        }
      }

      // 切妻屋根 (石レンガの階段) + 妻壁
      buildGableRoof(set, b.x, b.z, b.w, b.d, topY + 1,
        STAIR_ID_BASE + 3 * 4, B.PLANK, 3);

      // ドア (向きに応じた辺の中央, 本家同様の下段+上段の2マス構造)
      let doorX = midX, doorZ = b.z;
      if (b.door === 1) doorZ = b.z + b.d - 1;
      else if (b.door === 2) { doorX = b.x; doorZ = midZ; }
      else if (b.door === 3) { doorX = b.x + b.w - 1; doorZ = midZ; }
      const doorDir = doorDirMap[b.door];
      set(doorX, floorY + 1, doorZ, DOOR_ID_BASE + doorDir);
      set(doorX, floorY + 2, doorZ, DOOR_TOP_ID_BASE + doorDir);

      // 窓 (ドア以外の辺の中央に窓ガラス)
      const sides = [[midX, b.z], [midX, b.z + b.d - 1], [b.x, midZ], [b.x + b.w - 1, midZ]];
      sides.forEach(([wx, wz], i) => {
        if (i !== b.door) set(wx, floorY + 2, wz, B.GLASS_PANE);
      });

      // 煙突 (隅の1つに, 屋根を突き抜けて立つ丸石の柱)
      const chimX = b.x + 1, chimZ = b.z + 1;
      for (let y = floorY + 1; y <= topY + 5; y++) set(chimX, y, chimZ, B.COBBLE);

      // 室内の松明
      set(midX, floorY + 1, midZ, B.TORCH);

      // 生活用品のチェスト (villageInCell で決めた家のみ)
      if (b.chest) set(b.chest[0], b.chest[1], b.chest[2], B.CHEST);
      return;
    }

    if (b.type === "church") {
      this.stampChurch(chunk, ox, oz, b, set, baseY);
      return;
    }

    if (b.type === "tower") {
      this.stampTower(chunk, ox, oz, b, set, baseY);
      return;
    }

    if (b.type === "temple") {
      this.stampVillageTemple(chunk, ox, oz, b, set, baseY);
      return;
    }
  }

  // ---------------- 教会 ----------------
  // 石レンガの身廊 + 切妻屋根 + 正面の鐘塔 (十字架つき尖塔) + アーチ窓
  stampChurch(chunk, ox, oz, b, set, baseY) {
    const floorY = baseY;
    const topY = floorY + 6;
    const midX = b.x + (b.w >> 1);

    for (let dz = 0; dz < b.d; dz++) {
      for (let dx = 0; dx < b.w; dx++) {
        const wx = b.x + dx, wz = b.z + dz;
        const edge = dx === 0 || dz === 0 || dx === b.w - 1 || dz === b.d - 1;
        const gh = this.columnInfo(wx, wz).h;
        for (let y = Math.min(gh, floorY); y < floorY; y++) set(wx, y, wz, B.STONE_BRICK);
        set(wx, floorY, wz, B.SMOOTH_STONE);
        for (let y = floorY + 1; y <= topY + 12; y++) set(wx, y, wz, B.AIR);
        if (edge) for (let y = floorY + 1; y <= topY; y++) set(wx, y, wz, B.STONE_BRICK);
      }
    }

    // 側面のアーチ窓 (2マスの縦長窓ガラス)
    for (let dz = 2; dz < b.d - 2; dz += 3) {
      set(b.x, floorY + 2, b.z + dz, B.GLASS_PANE);
      set(b.x, floorY + 3, b.z + dz, B.GLASS_PANE);
      set(b.x + b.w - 1, floorY + 2, b.z + dz, B.GLASS_PANE);
      set(b.x + b.w - 1, floorY + 3, b.z + dz, B.GLASS_PANE);
    }

    // 切妻屋根 (石レンガの階段) + 妻壁
    buildGableRoof(set, b.x, b.z, b.w, b.d, topY + 1, STAIR_ID_BASE + 3 * 4, B.STONE_BRICK, 5);

    // 正面 (南側) のドア: 本家同様の下段+上段の2マス構造, 南向き固定
    const doorZ = b.z + b.d - 1;
    set(midX, floorY + 1, doorZ, DOOR_ID_BASE + 2);
    set(midX, floorY + 2, doorZ, DOOR_TOP_ID_BASE + 2);

    // 鐘塔: 正面中央に立つ, 屋根より高い石レンガの塔。四面に鐘楼の開口部
    const twX0 = midX - 1, twZ0 = b.z + b.d - 3;
    const twBase = topY + 1, twTop = topY + 9;
    for (let y = twBase; y <= twTop; y++) {
      for (let dz = 0; dz < 3; dz++) {
        for (let dx = 0; dx < 3; dx++) {
          const wx = twX0 + dx, wz = twZ0 + dz;
          const edge = dx === 0 || dx === 2 || dz === 0 || dz === 2;
          if (edge) set(wx, y, wz, B.STONE_BRICK);
          else set(wx, y, wz, B.AIR);
        }
      }
    }
    // 鐘楼の開口部 (四面の中央を2段くり抜く)
    const belfryY0 = twBase + 3;
    set(twX0 + 1, belfryY0, twZ0, B.AIR); set(twX0 + 1, belfryY0 + 1, twZ0, B.AIR);
    set(twX0 + 1, belfryY0, twZ0 + 2, B.AIR); set(twX0 + 1, belfryY0 + 1, twZ0 + 2, B.AIR);
    set(twX0, belfryY0, twZ0 + 1, B.AIR); set(twX0, belfryY0 + 1, twZ0 + 1, B.AIR);
    set(twX0 + 2, belfryY0, twZ0 + 1, B.AIR); set(twX0 + 2, belfryY0 + 1, twZ0 + 1, B.AIR);

    // 尖塔の先端 + 十字架
    const midZTower = twZ0 + 1;
    for (let dz = 0; dz < 3; dz++) for (let dx = 0; dx < 3; dx++) set(twX0 + dx, twTop + 1, twZ0 + dz, B.STONE_BRICK);
    set(midX, twTop + 2, midZTower, B.STONE_BRICK);
    set(midX, twTop + 3, midZTower, B.FENCE_PLANK);
    set(midX, twTop + 4, midZTower, B.FENCE_PLANK);
    set(midX - 1, twTop + 4, midZTower, B.FENCE_PLANK);
    set(midX + 1, twTop + 4, midZTower, B.FENCE_PLANK);

    // 内陣の祭壇 + 松明
    const midZ = b.z + (b.d >> 1);
    set(midX, floorY + 1, b.z + 1, B.QUARTZ);
    set(midX, floorY + 1, b.z + 2, B.TORCH);
    set(b.x + 2, floorY + 2, midZ, B.TORCH);
    set(b.x + b.w - 3, floorY + 2, midZ, B.TORCH);
  }

  // ---------------- 見張り塔 ----------------
  // 石レンガの塔。内部は螺旋階段で最上階 (胸壁つき) まで登れる
  stampTower(chunk, ox, oz, b, set, baseY) {
    const floorY = baseY;
    const topY = floorY + 20;
    const midX = b.x + (b.w >> 1), midZ = b.z + (b.d >> 1);

    for (let dz = 0; dz < b.d; dz++) {
      for (let dx = 0; dx < b.w; dx++) {
        const wx = b.x + dx, wz = b.z + dz;
        const edge = dx === 0 || dz === 0 || dx === b.w - 1 || dz === b.d - 1;
        const gh = this.columnInfo(wx, wz).h;
        for (let y = Math.min(gh, floorY); y < floorY; y++) set(wx, y, wz, B.COBBLE);
        set(wx, floorY, wz, B.STONE_BRICK);
        for (let y = floorY + 1; y < topY; y++) set(wx, y, wz, edge ? B.STONE_BRICK : B.AIR);
        // 窓 (四面それぞれ中央に小窓を並べる)
        if (edge) {
          for (let y = floorY + 3; y < topY - 1; y += 4) {
            const onWindowFace =
              (dz === 0 && dx === midX - b.x) || (dz === b.d - 1 && dx === midX - b.x) ||
              (dx === 0 && dz === midZ - b.z) || (dx === b.w - 1 && dz === midZ - b.z);
            if (onWindowFace) set(wx, y, wz, B.GLASS_PANE);
          }
        }
      }
    }

    // ドア: 北向き固定 (村の中心を向く)
    set(midX, floorY + 1, b.z, DOOR_ID_BASE + 0);
    set(midX, floorY + 2, b.z, DOOR_TOP_ID_BASE + 0);

    // 螺旋階段 (内側 3x3 の壁沿いを1周8マスで, 最上階近くまで登る。
    // 中央 (1,1) は吹き抜けのまま開けておく)
    const ring = [[1, 0], [2, 0], [2, 1], [2, 2], [1, 2], [0, 2], [0, 1], [0, 0]];
    const steps = topY - floorY - 1;
    for (let h = 0; h < steps; h++) {
      const [rdx, rdz] = ring[h % ring.length];
      const dir = rdz === 0 ? 0 : rdx === 2 ? 1 : rdz === 2 ? 2 : 3;
      set(b.x + 1 + rdx, floorY + 1 + h, b.z + 1 + rdz, STAIR_ID_BASE + 1 * 4 + dir);
    }

    // 最上階の床 + 胸壁 (交互に高い丸石の凹凸)
    for (let dz = 0; dz < b.d; dz++) {
      for (let dx = 0; dx < b.w; dx++) {
        set(b.x + dx, topY, b.z + dz, B.STONE_BRICK);
      }
    }
    for (let dz = 0; dz < b.d; dz++) {
      for (let dx = 0; dx < b.w; dx++) {
        const edge = dx === 0 || dz === 0 || dx === b.w - 1 || dz === b.d - 1;
        if (edge && (dx + dz) % 2 === 0) set(b.x + dx, topY + 1, b.z + dz, B.COBBLE);
      }
    }
    set(midX, topY + 1, midZ, B.TORCH);
  }

  // ---------------- 神殿 (村用) ----------------
  // 壁のない大理石の柱廊 (西洋の神殿風): 高台 + 柱 + 平らな屋根 + 中央の祭壇
  stampVillageTemple(chunk, ox, oz, b, set, baseY) {
    const floorY = baseY + 1; // 数段の階段で一段高くする
    const topY = floorY + 5;
    const midX = b.x + (b.w >> 1), midZ = b.z + (b.d >> 1);

    for (let dz = -1; dz < b.d + 1; dz++) {
      for (let dx = -1; dx < b.w + 1; dx++) {
        const wx = b.x + dx, wz = b.z + dz;
        const inside = dx >= 0 && dx < b.w && dz >= 0 && dz < b.d;
        const gh = this.columnInfo(wx, wz).h;
        for (let y = Math.min(gh, floorY - 1); y < floorY; y++) set(wx, y, wz, B.SANDSTONE);
        if (inside) {
          set(wx, floorY, wz, B.MARBLE);
          for (let y = floorY + 1; y <= topY + 2; y++) set(wx, y, wz, B.AIR);
        } else {
          set(wx, floorY - 1, wz, B.MARBLE); // 高台の縁
        }
      }
    }

    // 柱 (外周の四隅 + 各辺の中間に配置)
    const colXs = [0, Math.floor((b.w - 1) / 2), b.w - 1];
    const colZs = [0, Math.floor((b.d - 1) / 2), b.d - 1];
    const cols = new Set();
    for (const dx of colXs) for (const dz of [0, b.d - 1]) cols.add(dx + "," + dz);
    for (const dz of colZs) for (const dx of [0, b.w - 1]) cols.add(dx + "," + dz);
    for (const key of cols) {
      const [dx, dz] = key.split(",").map(Number);
      for (let y = floorY + 1; y <= topY; y++) set(b.x + dx, y, b.z + dz, B.PILLAR);
    }

    // 平らな屋根 (大理石)
    for (let dz = -1; dz < b.d + 1; dz++) {
      for (let dx = -1; dx < b.w + 1; dx++) {
        set(b.x + dx, topY + 1, b.z + dz, B.MARBLE);
      }
    }

    // 中央の祭壇 (石英 + 金塊 + 松明)
    set(midX, floorY + 1, midZ, B.QUARTZ);
    set(midX, floorY + 2, midZ, B.GOLD_BLOCK);
    set(midX - 1, floorY + 1, midZ, B.TORCH);
    set(midX + 1, floorY + 1, midZ, B.TORCH);
  }

  // ---------------- 砂漠の神殿 ----------------
  // 砂漠グリッドごとに決定論的に配置される, 段状の砂岩ピラミッド。
  // 頂上中央の縦穴を降りると地下に宝物庫 (チェスト4つ + 隠しトラップ) がある

  desertTempleInCell(gx, gz) {
    const key = gx + "," + gz;
    if (this.templeCache.has(key)) return this.templeCache.get(key);
    let temple = null;
    if (hash2(gx, gz, this.seed ^ 0x8a41d5) < 0.5) {
      const G = DESERT_TEMPLE_GRID;
      const cx = gx * G + 60 + Math.floor(hash2(gx, gz, this.seed ^ 0x1a2b) * (G - 120));
      const cz = gz * G + 60 + Math.floor(hash2(gx, gz, this.seed ^ 0x3c4d) * (G - 120));
      const info = this.columnInfo(cx, cz);
      if (info.biome === "desert" && info.h > WATER_LEVEL + 1) {
        temple = { cx, cz, y: info.h + 1 };
      }
    }
    this.templeCache.set(key, temple);
    return temple;
  }

  // (x, z) の近くの神殿を探す (main.js が宝物庫トリガーの判定に使う)
  desertTempleNear(wx, wz) {
    const gx = Math.floor(wx / DESERT_TEMPLE_GRID);
    const gz = Math.floor(wz / DESERT_TEMPLE_GRID);
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        const t = this.desertTempleInCell(gx + dx, gz + dz);
        if (t && Math.abs(wx - t.cx) < 8 && Math.abs(wz - t.cz) < 8) return t;
      }
    }
    return null;
  }

  stampDesertTemples(chunk) {
    const ox = chunk.cx * CHUNK_SIZE;
    const oz = chunk.cz * CHUNK_SIZE;
    const R = 12;
    const g0x = Math.floor((ox - R) / DESERT_TEMPLE_GRID);
    const g1x = Math.floor((ox + 15 + R) / DESERT_TEMPLE_GRID);
    const g0z = Math.floor((oz - R) / DESERT_TEMPLE_GRID);
    const g1z = Math.floor((oz + 15 + R) / DESERT_TEMPLE_GRID);
    for (let gz = g0z; gz <= g1z; gz++) {
      for (let gx = g0x; gx <= g1x; gx++) {
        const t = this.desertTempleInCell(gx, gz);
        if (t) this.stampDesertTemple(chunk, ox, oz, t);
      }
    }
  }

  stampDesertTemple(chunk, ox, oz, t) {
    const { cx, cz, y: baseY } = t;
    const R = 9;
    if (ox + 15 < cx - R || ox > cx + R || oz + 15 < cz - R || oz > cz + R) return;
    const seed = this.seed;
    const set = (wx, y, wz, id) => {
      if (wx < ox || wx > ox + 15 || wz < oz || wz > oz + 15 || y < 1 || y >= CHUNK_H) return;
      chunk.set(wx - ox, y, wz - oz, id);
    };
    const fill = (x0, y0, z0, x1, y1, z1, id) => {
      for (let y = y0; y <= y1; y++)
        for (let z = z0; z <= z1; z++)
          for (let x = x0; x <= x1; x++) set(x, y, z, id);
    };

    // 段状のピラミッド本体 (砂岩, 途中に彩色テラコッタの帯を挟む)
    const topY = baseY + 8;
    for (let level = 0; level <= 8; level++) {
      const r = 8 - level;
      const y = baseY + level;
      for (let dz = -r; dz <= r; dz++) {
        for (let dx = -r; dx <= r; dx++) {
          const edge = Math.max(Math.abs(dx), Math.abs(dz)) === r;
          let id = B.SANDSTONE;
          if (edge && (level === 2 || level === 5)) {
            id = TERRA_ID_BASE + (hash2(cx + dx, cz + dz, seed ^ 0x5a5a) < 0.5 ? 1 : 4); // 橙 or 青緑
          }
          set(cx + dx, y, cz + dz, id);
        }
      }
    }

    // 地下の宝物庫 (7x7, 高さ4) + 四隅にチェスト
    const gy = baseY - 5; // 宝物庫の床
    fill(cx - 3, gy, cz - 3, cx + 3, gy + 3, cz + 3, B.AIR);
    fill(cx - 3, gy - 1, cz - 3, cx + 3, gy - 1, cz + 3, B.SANDSTONE);
    fill(cx - 3, gy + 4, cz - 3, cx + 3, gy + 4, cz + 3, B.SANDSTONE);
    for (const [wx0, wz0, wx1, wz1] of [
      [cx - 3, cz - 3, cx + 3, cz - 3], [cx - 3, cz + 3, cx + 3, cz + 3],
      [cx - 3, cz - 3, cx - 3, cz + 3], [cx + 3, cz - 3, cx + 3, cz + 3],
    ]) {
      fill(wx0, gy, wz0, wx1, gy + 3, wz1, B.SANDSTONE);
    }
    for (const [dx, dz] of [[-2, -2], [2, -2], [-2, 2], [2, 2]]) {
      set(cx + dx, gy, cz + dz, B.CHEST);
    }
    // 床下に隠した起爆用 TNT (main.js が宝物庫に入ったのを検知して着火する)
    fill(cx - 1, gy - 2, cz - 1, cx + 1, gy - 2, cz + 1, B.TNT);

    // 頂上中央から宝物庫まで貫く縦穴 (ここを掘り進んで中に入る)
    for (let y = gy + 4; y <= topY; y++) set(cx, y, cz, B.AIR);
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

    // --- 本家風のポータルの間: 溶岩の堀に囲まれた石レンガの高台の上に
    // エンドポータルの枠が乗る。南側の橋から渡り, 高台の縁に上がって
    // フレームを飛び越えて中に入る ---
    for (let dz = -R + 1; dz <= R - 1; dz++) {
      for (let dx = -R + 1; dx <= R - 1; dx++) {
        const m = Math.max(Math.abs(dx), Math.abs(dz));
        // 溶岩の堀 (高台の周りの1マス。南の橋の部分は床を残す)
        if (m === 4 && !(Math.abs(dx) <= 1 && dz === 4)) {
          set(sx + dx, sy, sz + dz, B.LAVA_BLOCK);
        }
        // 高台 (7x7, 角を落とした円盤)
        if (m <= 3 && !(Math.abs(dx) === 3 && Math.abs(dz) === 3)) {
          set(sx + dx, sy + 1, sz + dz, B.STONE_BRICK);
        }
      }
    }
    // エンドポータルの枠 (5x5, 角抜き = 12 ブロック) を高台の上に
    const py = sy + 2;
    for (let dz = -2; dz <= 2; dz++) {
      for (let dx = -2; dx <= 2; dx++) {
        const m = Math.max(Math.abs(dx), Math.abs(dz));
        if (m === 2 && !(Math.abs(dx) === 2 && Math.abs(dz) === 2)) {
          set(sx + dx, py, sz + dz, B.END_PORTAL_FRAME);
        }
      }
    }
    // 南側の階段 (橋から高台へジャンプなしで上れる)
    for (let dx = -1; dx <= 1; dx++) {
      set(sx + dx, sy + 1, sz + 4, STAIR_ID_BASE + 3 * 4 + 2); // 石レンガの階段 (南向き)
    }
    // 高台の四隅の飾り (模様入り石レンガ)
    for (const [cdx, cdz] of [[-3, -2], [3, -2], [-3, 2], [3, 2], [-2, -3], [2, -3], [-2, 3], [2, 3]]) {
      set(sx + cdx, sy + 1, sz + cdz, B.CHISELED_STONE_BRICK);
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
