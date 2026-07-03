// ---------------------------------------------------------------
// プロシージャルテクスチャアトラス生成 (外部画像なし)
// 各タイル 16x16px, アトラスは 8x4 タイル = 128x64px
// ---------------------------------------------------------------
"use strict";

const TILE_PX = 16;
const ATLAS_COLS = 8;
const ATLAS_ROWS = 16;   // 128x256 (POT)

// 各タイルの平均色 [r,g,b] (0..1) — 破壊パーティクルの色に使う
const TILE_AVG_COLORS = [];

// タイル番号 → アトラス UV (半テクセル内側にずらして滲みを防ぐ)
function tileUV(tile) {
  const tx = tile % ATLAS_COLS;
  const ty = Math.floor(tile / ATLAS_COLS);
  const eps = 0.5 / (ATLAS_COLS * TILE_PX); // 半テクセル
  return {
    u0: tx / ATLAS_COLS + eps,
    v0: ty / ATLAS_ROWS + eps * (ATLAS_COLS / ATLAS_ROWS),
    u1: (tx + 1) / ATLAS_COLS - eps,
    v1: (ty + 1) / ATLAS_ROWS - eps * (ATLAS_COLS / ATLAS_ROWS),
  };
}

// テクスチャアトラスを canvas に描いて返す
function buildTextureAtlas(seed) {
  const canvas = document.createElement("canvas");
  canvas.width = ATLAS_COLS * TILE_PX;
  canvas.height = ATLAS_ROWS * TILE_PX;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const rand = mulberry32(seed ^ 0x7e37e11e);

  // ピクセル単位で塗るヘルパー
  function paintTile(tile, fn) {
    const ox = (tile % ATLAS_COLS) * TILE_PX;
    const oy = Math.floor(tile / ATLAS_COLS) * TILE_PX;
    const img = ctx.createImageData(TILE_PX, TILE_PX);
    const d = img.data;
    for (let y = 0; y < TILE_PX; y++) {
      for (let x = 0; x < TILE_PX; x++) {
        const [r, g, b, a] = fn(x, y);
        const i = (y * TILE_PX + x) * 4;
        d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = a === undefined ? 255 : a;
      }
    }
    ctx.putImageData(img, ox, oy);
  }

  // 明るさをランダムに揺らす
  const jitter = (base, amt) => base + (rand() * 2 - 1) * amt;
  const px = (r, g, b, v, a) => [
    clamp(r * v, 0, 255) | 0, clamp(g * v, 0, 255) | 0, clamp(b * v, 0, 255) | 0, a,
  ];

  // --- 草ブロック上面 ---
  paintTile(TILE.GRASS_TOP, () => {
    const v = jitter(1, 0.13);
    return px(96, 168, 68, v);
  });

  // --- 草ブロック側面 (上部に草の縁) ---
  paintTile(TILE.GRASS_SIDE, (x, y) => {
    const edge = 3 + ((x * 7 + 3) % 3);   // ギザギザの草の境界
    if (y < edge) return px(96, 168, 68, jitter(1, 0.13));
    return px(134, 96, 67, jitter(1, 0.12));
  });

  // --- 土 ---
  paintTile(TILE.DIRT, () => {
    const v = jitter(1, 0.14);
    // 時々小石
    if (rand() < 0.06) return px(110, 78, 55, v);
    return px(134, 96, 67, v);
  });

  // --- 石 ---
  paintTile(TILE.STONE, () => {
    const v = jitter(1, 0.09);
    return px(127, 127, 127, v);
  });

  // --- 砂 ---
  paintTile(TILE.SAND, () => {
    const v = jitter(1, 0.08);
    return px(219, 207, 163, v);
  });

  // --- 水 (半透明・反射はシェーダ側で処理, ここは深めの色のみ) ---
  paintTile(TILE.WATER, (x, y) => {
    const wave = Math.sin((x + y * 2) * 0.8) * 0.05;
    const v = 1 + wave + (rand() * 2 - 1) * 0.02;
    return px(38, 82, 196, v);
  });

  // --- 原木側面 (縦の樹皮) ---
  paintTile(TILE.LOG_SIDE, (x) => {
    const stripe = (x % 4 === 0 || x % 7 === 0) ? 0.75 : 1;
    return px(104, 82, 50, jitter(stripe, 0.08));
  });

  // --- 原木断面 (年輪) ---
  paintTile(TILE.LOG_TOP, (x, y) => {
    const dx = x - 7.5, dy = y - 7.5;
    const r = Math.hypot(dx, dy);
    if (r > 7.2) return px(104, 82, 50, jitter(1, 0.08)); // 樹皮の縁
    const ring = (Math.floor(r) % 2 === 0) ? 1 : 0.85;
    return px(174, 140, 92, jitter(ring, 0.05));
  });

  // --- 葉 (穴あき / アルファ抜き) ---
  paintTile(TILE.LEAVES, () => {
    if (rand() < 0.18) return [0, 0, 0, 0];         // 透過穴
    const v = jitter(1, 0.2);
    return px(52, 128, 40, v);
  });

  // --- 木材 (横板) ---
  paintTile(TILE.PLANK, (x, y) => {
    const plankEdge = (y % 4 === 3) ? 0.72 : 1;
    const nail = (y % 4 === 1 && (x === 0 || x === 8)) ? 0.8 : 1;
    return px(178, 143, 90, jitter(plankEdge * nail, 0.05));
  });

  // --- ガラス (枠 + わずかな反射, 大部分は透明) ---
  paintTile(TILE.GLASS, (x, y) => {
    const border = x === 0 || y === 0 || x === 15 || y === 15;
    if (border) return [200, 220, 228, 255];
    // 斜めのハイライト
    if (x - y === 3 || x - y === 4) return [235, 245, 250, 160];
    return [0, 0, 0, 0];
  });

  // --- レンガ ---
  paintTile(TILE.BRICK, (x, y) => {
    const row = Math.floor(y / 4);
    const mortarY = y % 4 === 3;
    const shift = (row % 2) * 4;
    const mortarX = (x + shift) % 8 === 7;
    if (mortarY || mortarX) return px(188, 180, 170, jitter(1, 0.05));
    return px(150, 70, 58, jitter(1, 0.09));
  });

  // --- 丸石 ---
  paintTile(TILE.COBBLE, (x, y) => {
    const n = Math.sin(x * 1.7 + y * 0.9) + Math.sin(x * 0.6 - y * 1.9);
    const v = 0.85 + 0.18 * Math.abs(n % 1) + (rand() * 2 - 1) * 0.06;
    return px(118, 118, 118, v);
  });

  // --- 雪 (上面) ---
  paintTile(TILE.SNOW, () => px(240, 246, 250, jitter(1, 0.04)));

  // --- 雪付き土 (側面) ---
  paintTile(TILE.SNOW_SIDE, (x, y) => {
    const edge = 3 + ((x * 5 + 1) % 3);
    if (y < edge) return px(240, 246, 250, jitter(1, 0.04));
    return px(134, 96, 67, jitter(1, 0.12));
  });

  // --- 岩盤 ---
  paintTile(TILE.BEDROCK, () => {
    const v = rand() < 0.5 ? jitter(0.55, 0.1) : jitter(1, 0.15);
    return px(85, 85, 85, v);
  });

  // --- 石炭鉱石 ---
  {
    const spots = makeSpots(rand, 5);
    paintTile(TILE.COAL_ORE, (x, y) =>
      spots(x, y) ? px(38, 38, 38, jitter(1, 0.15)) : px(127, 127, 127, jitter(1, 0.09)));
  }

  // --- 鉄鉱石 ---
  {
    const spots = makeSpots(rand, 5);
    paintTile(TILE.IRON_ORE, (x, y) =>
      spots(x, y) ? px(216, 175, 147, jitter(1, 0.1)) : px(127, 127, 127, jitter(1, 0.09)));
  }

  // --- 草 (X 字植生, アルファ抜き) ---
  {
    // 列ごとの草の高さを先に決める
    const blades = [];
    for (let x = 0; x < 16; x++) {
      blades[x] = rand() < 0.55 ? 4 + (rand() * 9) | 0 : 0;
    }
    paintTile(TILE.TALL_GRASS, (x, y) => {
      if (blades[x] === 0 || y < 16 - blades[x]) return [0, 0, 0, 0];
      return px(88, 160, 60, jitter(1, 0.18));
    });
  }

  // --- タンポポ ---
  paintTile(TILE.FLOWER_YELLOW, (x, y) => {
    const dx = x - 7.5, dy = y - 4.5;
    if (dx * dx + dy * dy < 5.5) return px(245, 210, 50, jitter(1, 0.08)); // 花
    if ((x === 7 || x === 8) && y >= 7) return px(70, 140, 50, jitter(1, 0.1)); // 茎
    if (y >= 11 && (x === 5 || x === 10) && rand() < 0.7) return px(70, 140, 50, 1); // 葉
    return [0, 0, 0, 0];
  });

  // --- ポピー ---
  paintTile(TILE.FLOWER_RED, (x, y) => {
    const dx = x - 7.5, dy = y - 4;
    if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return px(40, 30, 30, 1); // 中心
    if (dx * dx + dy * dy < 4.5) return px(205, 40, 40, jitter(1, 0.1));
    if ((x === 7 || x === 8) && y >= 6) return px(70, 140, 50, jitter(1, 0.1));
    return [0, 0, 0, 0];
  });

  // --- グロウストーン ---
  paintTile(TILE.GLOWSTONE, (x, y) => {
    const n = Math.sin(x * 1.3) * Math.sin(y * 1.1);
    const bright = n > 0.15 || rand() < 0.12;
    return bright ? px(255, 220, 130, jitter(1, 0.06)) : px(180, 140, 70, jitter(1, 0.1));
  });

  // --- 破壊ひび割れ (5 段階, 進行するほど密になる) ---
  {
    // ランダムウォークでひびのピクセル集合を作る (段階ごとに本数が増える)
    const crackRand = mulberry32(seed ^ 0xc4ac4);
    const walks = [];
    for (let w = 0; w < 12; w++) {
      const pixels = [];
      let x = 2 + crackRand() * 12, y = 2 + crackRand() * 12;
      let dx = crackRand() * 2 - 1, dy = crackRand() * 2 - 1;
      for (let i = 0; i < 14; i++) {
        pixels.push(((x | 0) & 15) + (((y | 0) & 15) << 4));
        dx += (crackRand() - 0.5) * 0.9;
        dy += (crackRand() - 0.5) * 0.9;
        const m = Math.hypot(dx, dy) || 1;
        x += dx / m; y += dy / m;
        if (x < 0 || x > 15 || y < 0 || y > 15) break;
      }
      walks.push(pixels);
    }
    for (let stage = 0; stage < 5; stage++) {
      const set = new Set();
      const n = 3 + stage * 2;
      for (let w = 0; w < n && w < walks.length; w++) {
        for (const p of walks[w]) set.add(p);
      }
      paintTile(TILE.CRACK_0 + stage, (x, y) =>
        set.has(x + (y << 4)) ? [15, 12, 10, 200] : [0, 0, 0, 0]);
    }
  }

  // --- 松明 (中央の棒 + 光る先端) ---
  paintTile(TILE.TORCH, (x, y) => {
    if (x < 7 || x > 8) return [0, 0, 0, 0];
    if (y >= 4 && y <= 5) return px(255, 220, 120, jitter(1, 0.05)); // 炎
    if (y > 5 && y <= 14) return px(120, 90, 50, jitter(1, 0.1));    // 柄
    return [0, 0, 0, 0];
  });

  // --- 金鉱石 / ダイヤモンド鉱石 ---
  {
    const spots = makeSpots(rand, 4);
    paintTile(TILE.GOLD_ORE, (x, y) =>
      spots(x, y) ? px(250, 215, 80, jitter(1, 0.1)) : px(127, 127, 127, jitter(1, 0.09)));
  }
  {
    const spots = makeSpots(rand, 4);
    paintTile(TILE.DIAMOND_ORE, (x, y) =>
      spots(x, y) ? px(110, 235, 235, jitter(1, 0.1)) : px(127, 127, 127, jitter(1, 0.09)));
  }

  // --- 金ブロック / ダイヤモンドブロック ---
  paintTile(TILE.GOLD_BLOCK, (x, y) => {
    const border = x === 0 || y === 0 || x === 15 || y === 15;
    return px(250, 210, 70, jitter(border ? 0.8 : 1, 0.07));
  });
  paintTile(TILE.DIAMOND_BLOCK, (x, y) => {
    const border = x === 0 || y === 0 || x === 15 || y === 15;
    return px(100, 225, 220, jitter(border ? 0.8 : 1, 0.07));
  });

  // --- 道具 (ピッケル / 剣) ---
  const WOOD_COL = [140, 105, 60];
  const toolMats = [
    [TILE.PICK_WOOD, TILE.SWORD_WOOD, [168, 130, 80]],
    [TILE.PICK_STONE, TILE.SWORD_STONE, [140, 140, 140]],
    [TILE.PICK_IRON, TILE.SWORD_IRON, [225, 225, 230]],
    [TILE.PICK_DIAMOND, TILE.SWORD_DIAMOND, [95, 230, 225]],
    [TILE.PICK_GOLD, TILE.SWORD_GOLD, [250, 205, 60]],
  ];
  for (const [pickTile, swordTile, mat] of toolMats) {
    // ピッケル: 斜めの柄 + 上部のアーチ状ヘッド
    paintTile(pickTile, (x, y) => {
      if (y === 2 && x >= 4 && x <= 11) return px(mat[0], mat[1], mat[2], jitter(1, 0.06));
      if (y === 3 && ((x >= 2 && x <= 4) || (x >= 11 && x <= 13))) return px(mat[0], mat[1], mat[2], 1);
      if (y === 4 && ((x >= 1 && x <= 2) || (x >= 13 && x <= 14))) return px(mat[0], mat[1], mat[2], 0.9);
      if (y === 5 && (x === 1 || x === 14)) return px(mat[0], mat[1], mat[2], 0.85);
      if (y >= 4 && y <= 13 && Math.abs(x - (15 - y)) <= 0.5) return px(WOOD_COL[0], WOOD_COL[1], WOOD_COL[2], jitter(1, 0.08));
      return [0, 0, 0, 0];
    });
    // 剣: 斜めの刃 + つば + 柄
    paintTile(swordTile, (x, y) => {
      if (y >= 1 && y <= 9 && Math.abs(x - (13 - y)) <= 1) {
        const edge = x - (13 - y) === -1;
        return px(mat[0], mat[1], mat[2], edge ? 1.08 : 0.9);
      }
      if (y === 10 && x >= 1 && x <= 5) return px(90, 70, 45, 1);   // つば
      if (y >= 11 && y <= 13 && x === 13 - y + 1) return px(WOOD_COL[0], WOOD_COL[1], WOOD_COL[2], 1); // 柄
      return [0, 0, 0, 0];
    });
  }

  // --- 斧 / シャベル / クワ (素材 4 種) ---
  const toolMats2 = [
    [[168, 130, 80], TILE.AXE_WOOD, TILE.SHOVEL_WOOD, TILE.HOE_WOOD],
    [[140, 140, 140], TILE.AXE_STONE, TILE.SHOVEL_STONE, TILE.HOE_STONE],
    [[225, 225, 230], TILE.AXE_IRON, TILE.SHOVEL_IRON, TILE.HOE_IRON],
    [[95, 230, 225], TILE.AXE_DIAMOND, TILE.SHOVEL_DIAMOND, TILE.HOE_DIAMOND],
  ];
  const handle = (x, y) => y >= 3 && y <= 13 && Math.abs(x - (15 - y)) <= 0.5;
  for (const [mat, axeT, shovelT, hoeT] of toolMats2) {
    const m = (v = 1) => px(mat[0], mat[1], mat[2], jitter(v, 0.06));
    // 斧: 柄の上端の左側に刃
    paintTile(axeT, (x, y) => {
      if (y >= 2 && y <= 6 && x >= 6 && x <= 11 && x - 6 >= (y - 2) - 3 && x <= 12 - Math.abs(y - 4)) return m();
      if (y >= 1 && y <= 4 && x >= 9 && x <= 12) return m(0.95);
      if (handle(x, y)) return px(140, 105, 60, jitter(1, 0.08));
      return [0, 0, 0, 0];
    });
    // シャベル: 柄の上端に丸い刃先
    paintTile(shovelT, (x, y) => {
      const dx = x - 11.5, dy = y - 3.5;
      if (dx * dx + dy * dy < 7 && y <= 6) return m();
      if (handle(x, y)) return px(140, 105, 60, jitter(1, 0.08));
      return [0, 0, 0, 0];
    });
    // クワ: 上端から横に伸びて折れ曲がる刃
    paintTile(hoeT, (x, y) => {
      if (y === 2 && x >= 6 && x <= 12) return m();
      if (y >= 3 && y <= 5 && x >= 6 && x <= 7) return m(0.92);
      if (handle(x, y)) return px(140, 105, 60, jitter(1, 0.08));
      return [0, 0, 0, 0];
    });
  }

  // --- ハサミ ---
  paintTile(TILE.SHEARS, (x, y) => {
    const blade1 = Math.abs(x - y) <= 1 && x >= 3 && x <= 12;
    const blade2 = Math.abs(x - (15 - y)) <= 1 && x >= 3 && x <= 12;
    if (blade1 || blade2) {
      const isHandle = (blade1 && x >= 10) || (blade2 && x <= 5);
      if (isHandle) return px(170, 60, 50, 1);
      return px(210, 210, 215, jitter(1, 0.05));
    }
    return [0, 0, 0, 0];
  });

  // --- 釣竿 ---
  paintTile(TILE.FISHING_ROD, (x, y) => {
    if (y >= 2 && y <= 14 && Math.abs(x - (14 - y * 0.75)) <= 0.6) {
      return px(140, 105, 60, jitter(1, 0.08));  // 竿
    }
    if (x === 13 && y >= 2 && y <= 9) return px(220, 220, 220, 1); // 糸
    if (y === 10 && x >= 12 && x <= 13) return px(180, 180, 185, 1); // 針
    return [0, 0, 0, 0];
  });

  // --- 魚 ---
  paintTile(TILE.FISH, (x, y) => {
    const dx = x - 6.5, dy = y - 8;
    if (dx * dx * 0.6 + dy * dy < 8) {
      return px(130, 160, 180, jitter(dy < 0 ? 1.05 : 0.9, 0.06)); // 体
    }
    if (x >= 10 && x <= 12 && Math.abs(dy) <= (x - 9)) return px(110, 140, 160, 1); // 尾びれ
    if (x === 5 && y === 7) return [30, 30, 35, 255]; // 目
    return [0, 0, 0, 0];
  });

  // --- 農地 (上面: 湿った土に畝) ---
  paintTile(TILE.FARMLAND, (x, y) => {
    const furrow = y % 4 === 1;
    return px(furrow ? 70 : 100, furrow ? 45 : 68, furrow ? 30 : 45, jitter(1, 0.1));
  });

  // --- 素材アイテム (インゴット / ダイヤ) ---
  const ingot = (col) => (x, y) => {
    if (y >= 6 && y <= 10 && x >= 3 && x <= 12) {
      const corner = (y === 6 || y === 10) && (x === 3 || x === 12);
      if (corner) return [0, 0, 0, 0];
      return px(col[0], col[1], col[2], jitter(y === 7 ? 1.15 : 1, 0.05));
    }
    return [0, 0, 0, 0];
  };
  paintTile(TILE.INGOT_IRON, ingot([220, 220, 225]));
  paintTile(TILE.INGOT_GOLD, ingot([250, 205, 60]));
  paintTile(TILE.GEM_DIAMOND, (x, y) => {
    const d = Math.abs(x - 7.5) + Math.abs(y - 7.5);
    if (d < 5.5) return px(110, 235, 230, jitter(y < 8 ? 1.1 : 0.85, 0.06));
    return [0, 0, 0, 0];
  });

  // --- 弓 (弧 + 弦) ---
  paintTile(TILE.BOW, (x, y) => {
    // 弧: 左上から右下への曲線
    const arc = Math.hypot(x - 13, y - 13);
    if (arc >= 10 && arc <= 11.5 && x <= 12 && y <= 12) {
      return px(140, 105, 60, jitter(1, 0.08));
    }
    // 弦: 対角線
    if (Math.abs(x - y) <= 0 && x >= 3 && x <= 12) return px(230, 230, 225, 1);
    return [0, 0, 0, 0];
  });

  // --- 食料 (豚肉 / 牛肉 / 鶏肉) ---
  const meat = (main, dark, boneY) => (x, y) => {
    const dx = x - 8, dy = y - 8;
    if (dx * dx * 0.7 + dy * dy < 26) {
      const edge = dx * dx * 0.7 + dy * dy > 17;
      return px(edge ? dark[0] : main[0], edge ? dark[1] : main[1], edge ? dark[2] : main[2], jitter(1, 0.06));
    }
    if (boneY && y >= boneY && y <= boneY + 1 && x >= 11 && x <= 14) return px(240, 235, 225, 1);
    return [0, 0, 0, 0];
  };
  paintTile(TILE.PORK, meat([235, 150, 150], [190, 100, 100], 0));
  paintTile(TILE.BEEF, meat([170, 70, 55], [120, 45, 35], 0));
  paintTile(TILE.CHICKEN_MEAT, meat([225, 185, 130], [185, 140, 90], 4));

  // --- TNT ---
  paintTile(TILE.TNT_SIDE, (x, y) => {
    if (y >= 6 && y <= 9) {
      // 白帯に "TNT"
      const letters = (y === 7 || y === 8) && (x % 3 !== 0);
      return letters ? px(40, 30, 30, 1) : px(230, 225, 215, 1);
    }
    const stripe = (x % 4 < 2) ? 1 : 0.85;
    return px(200, 55, 45, jitter(stripe, 0.06));
  });
  paintTile(TILE.TNT_TOP, (x, y) => {
    const dx = Math.abs(x - 7.5), dy = Math.abs(y - 7.5);
    if (dx < 2 && dy < 2) return px(60, 50, 45, 1); // 導火線
    return px(200, 55, 45, jitter((x + y) % 2 ? 1 : 0.88, 0.05));
  });

  // --- 砂利 ---
  paintTile(TILE.GRAVEL, () => {
    const v = rand();
    if (v < 0.25) return px(105, 100, 95, jitter(1, 0.1));
    if (v < 0.5) return px(150, 143, 135, jitter(1, 0.1));
    return px(128, 122, 115, jitter(1, 0.12));
  });

  // --- チェスト ---
  paintTile(TILE.CHEST_SIDE, (x, y) => {
    const frame = x === 0 || y === 0 || x === 15 || y === 15;
    if (frame) return px(95, 70, 40, jitter(1, 0.06));
    // 留め金
    if (x >= 7 && x <= 8 && y >= 5 && y <= 9) return px(160, 160, 165, jitter(1, 0.08));
    const lid = y === 5;
    return px(155, 115, 65, jitter(lid ? 0.75 : 1, 0.07));
  });
  paintTile(TILE.CHEST_TOP, (x, y) => {
    const frame = x === 0 || y === 0 || x === 15 || y === 15;
    return px(frame ? 95 : 155, frame ? 70 : 115, frame ? 40 : 65, jitter(1, 0.07));
  });

  // --- ベッド (上面: 枕 + 赤い毛布) ---
  paintTile(TILE.BED_TOP, (x, y) => {
    const frame = x === 0 || x === 15;
    if (frame) return px(120, 90, 55, 1);
    if (y <= 4) return px(235, 235, 235, jitter(1, 0.04));   // 枕
    if (y === 5) return px(160, 30, 30, 1);                  // 毛布の縁
    return px(200, 45, 45, jitter(1, 0.06));                 // 毛布
  });

  // --- 小麦 (3 段階) ---
  {
    const stalks = [];
    for (let x = 0; x < 16; x++) stalks[x] = (x % 3 === 1) && crackIsh(x);
    function crackIsh(x) { return (x * 7 + 3) % 5 !== 0; }
    const wheatTile = (height, col, headCol) => (x, y) => {
      if (!stalks[x]) return [0, 0, 0, 0];
      const top = 15 - height;
      if (y < top) return [0, 0, 0, 0];
      // 穂 (最終段階のみ)
      if (headCol && y <= top + 3) return px(headCol[0], headCol[1], headCol[2], jitter(1, 0.08));
      return px(col[0], col[1], col[2], jitter(1, 0.12));
    };
    paintTile(TILE.WHEAT_0, wheatTile(4, [95, 165, 70], null));
    paintTile(TILE.WHEAT_1, wheatTile(9, [110, 160, 60], null));
    paintTile(TILE.WHEAT_2, wheatTile(13, [180, 160, 70], [215, 185, 90]));
  }

  // --- 小麦の種 / 小麦 / パン ---
  paintTile(TILE.SEEDS, (x, y) => {
    const spots = [[5, 8], [8, 6], [10, 9], [7, 10], [9, 11], [6, 6]];
    for (const [sx, sy] of spots) {
      if (Math.abs(x - sx) <= 0 && Math.abs(y - sy) <= 1) return px(120, 180, 90, 1);
    }
    return [0, 0, 0, 0];
  });
  paintTile(TILE.WHEAT_ITEM, (x, y) => {
    if (x >= 6 && x <= 9 && y >= 2 && y <= 13) {
      const head = y <= 6;
      return px(head ? 220 : 190, head ? 190 : 165, head ? 95 : 75, jitter(1, 0.08));
    }
    return [0, 0, 0, 0];
  });
  paintTile(TILE.BREAD, (x, y) => {
    const dx = x - 8, dy = y - 8;
    if (dx * dx * 0.5 + dy * dy < 22) {
      const crust = dx * dx * 0.5 + dy * dy > 13;
      return px(crust ? 150 : 205, crust ? 100 : 160, crust ? 55 : 105, jitter(1, 0.06));
    }
    return [0, 0, 0, 0];
  });

  // --- 石レンガ ---
  paintTile(TILE.STONE_BRICK, (x, y) => {
    const row = Math.floor(y / 8);
    const mortarY = y % 8 === 7;
    const shift = (row % 2) * 4;
    const mortarX = (x + shift) % 8 === 7;
    if (mortarY || mortarX) return px(90, 90, 92, jitter(1, 0.05));
    return px(130, 130, 132, jitter(1, 0.07));
  });

  // --- 苔むした丸石 ---
  paintTile(TILE.MOSSY_COBBLE, (x, y) => {
    const n = Math.sin(x * 1.7 + y * 0.9) + Math.sin(x * 0.6 - y * 1.9);
    const mossy = Math.sin(x * 1.1 - y * 1.3) > 0.35 || rand() < 0.08;
    if (mossy) return px(90, 130, 70, jitter(1, 0.1));
    const v = 0.85 + 0.18 * Math.abs(n % 1) + (rand() * 2 - 1) * 0.06;
    return px(118, 118, 118, v);
  });

  // --- 氷 ---
  paintTile(TILE.ICE, (x, y) => {
    const streak = (x + y * 2) % 9 < 2 ? 1.1 : 1;
    return px(155, 195, 235, jitter(streak, 0.05));
  });

  // --- 本棚 (側面) ---
  paintTile(TILE.BOOKSHELF, (x, y) => {
    const frame = y <= 0 || y >= 15 || y === 7 || y === 8;
    if (frame) return px(178, 143, 90, jitter(1, 0.05));
    // 本の背表紙
    const bookCols = [[170, 60, 55], [70, 100, 170], [90, 150, 75], [190, 160, 70], [140, 80, 160]];
    const c = bookCols[(x * 7 + (y > 8 ? 3 : 0)) % bookCols.length];
    if (x % 3 === 2 && rand() < 0.4) return px(120, 95, 65, 1); // 隙間
    return px(c[0], c[1], c[2], jitter(1, 0.08));
  });

  // --- カボチャ ---
  paintTile(TILE.PUMPKIN_SIDE, (x) => {
    const ridge = x % 4 === 0 ? 0.8 : 1;
    return px(225, 130, 30, jitter(ridge, 0.07));
  });
  paintTile(TILE.PUMPKIN_TOP, (x, y) => {
    const dx = Math.abs(x - 7.5), dy = Math.abs(y - 7.5);
    if (dx < 1.5 && dy < 1.5) return px(90, 120, 45, 1); // ヘタ
    const ridge = (x + y) % 4 === 0 ? 0.85 : 1;
    return px(210, 120, 28, jitter(ridge, 0.07));
  });

  // --- 黒曜石 ---
  paintTile(TILE.OBSIDIAN, (x, y) => {
    const sheen = Math.sin(x * 0.9 + y * 1.4) > 0.75;
    if (sheen) return px(70, 45, 105, jitter(1, 0.1));
    return px(25, 18, 38, jitter(1, 0.15));
  });

  // --- 砂岩 ---
  paintTile(TILE.SANDSTONE, (x, y) => {
    const band = y % 5 === 4 ? 0.88 : 1;
    return px(215, 200, 150, jitter(band, 0.05));
  });

  // --- 羊毛 (白 + 12 色) ---
  const woolPainter = (r, g, b) => (x, y) => {
    const swirl = Math.sin(x * 1.9 + y * 0.7) * Math.sin(y * 1.7 - x * 0.5);
    const v = 0.93 + swirl * 0.05 + (rand() * 2 - 1) * 0.03;
    return px(r, g, b, v);
  };
  paintTile(TILE.WOOL, woolPainter(238, 234, 228));
  WOOL_COLORS.forEach(([, , c], i) => {
    paintTile(WOOL_TILE_BASE + i, woolPainter(c[0], c[1], c[2]));
  });

  // --- 石材バリエーション ---
  paintTile(TILE.SMOOTH_STONE, (x, y) => {
    const border = y === 15 ? 0.85 : 1;
    return px(160, 160, 162, jitter(border, 0.03));
  });
  paintTile(TILE.CRACKED_STONE_BRICK, (x, y) => {
    const row = Math.floor(y / 8);
    const mortar = y % 8 === 7 || (x + (row % 2) * 4) % 8 === 7;
    // ひび
    const crack = Math.abs((x * 13 + y * 7) % 16 - y) <= 0 && x > 2 && x < 14;
    if (crack) return px(70, 70, 72, 1);
    if (mortar) return px(90, 90, 92, jitter(1, 0.05));
    return px(125, 125, 127, jitter(1, 0.08));
  });
  paintTile(TILE.CHISELED_STONE_BRICK, (x, y) => {
    const outer = x === 0 || y === 0 || x === 15 || y === 15;
    const ring = (x === 3 || x === 12 || y === 3 || y === 12) &&
      x >= 3 && x <= 12 && y >= 3 && y <= 12;
    if (outer) return px(95, 95, 97, jitter(1, 0.04));
    if (ring) return px(105, 105, 108, jitter(1, 0.04));
    return px(140, 140, 142, jitter(1, 0.05));
  });
  paintTile(TILE.GRANITE, () => {
    const v = rand();
    if (v < 0.2) return px(120, 75, 60, jitter(1, 0.1));
    if (v < 0.35) return px(200, 165, 140, jitter(1, 0.08));
    return px(170, 115, 95, jitter(1, 0.09));
  });
  paintTile(TILE.DIORITE, () => {
    const v = rand();
    if (v < 0.25) return px(120, 120, 125, jitter(1, 0.1));
    return px(215, 215, 218, jitter(1, 0.06));
  });
  paintTile(TILE.ANDESITE, () => {
    const v = rand();
    if (v < 0.25) return px(110, 112, 108, jitter(1, 0.08));
    return px(150, 152, 148, jitter(1, 0.06));
  });
  paintTile(TILE.QUARTZ, (x, y) => {
    const vein = (x * 3 + y) % 11 === 0 ? 0.94 : 1;
    return px(236, 232, 226, jitter(vein, 0.03));
  });
  paintTile(TILE.DARK_BRICK, (x, y) => {
    const row = Math.floor(y / 4);
    const mortarY = y % 4 === 3;
    const mortarX = (x + (row % 2) * 4) % 8 === 7;
    if (mortarY || mortarX) return px(45, 30, 35, jitter(1, 0.08));
    return px(75, 40, 45, jitter(1, 0.1));
  });

  // --- 木材バリエーション ---
  const plankPainter = (r, g, b) => (x, y) => {
    const plankEdge = (y % 4 === 3) ? 0.72 : 1;
    const nail = (y % 4 === 1 && (x === 0 || x === 8)) ? 0.8 : 1;
    return px(r, g, b, jitter(plankEdge * nail, 0.05));
  };
  paintTile(TILE.BIRCH_PLANK, plankPainter(215, 200, 160));
  paintTile(TILE.DARK_PLANK, plankPainter(95, 70, 45));

  // --- 色付きガラス (枠 + 市松ディザで半透明に見せる) ---
  SGLASS_COLORS.forEach(([, , c], i) => {
    paintTile(SGLASS_TILE_BASE + i, (x, y) => {
      const border = x === 0 || y === 0 || x === 15 || y === 15;
      if (border) return px(c[0], c[1], c[2], 1);
      if ((x + y) % 2 === 0) return [c[0], c[1], c[2], 255];
      return [0, 0, 0, 0];
    });
  });

  // --- 原木バリエーション (側面) ---
  paintTile(TILE.BIRCH_LOG_SIDE, (x, y) => {
    // 白樺: 白地に黒い横縞
    const dash = (y * 5 + x * 2) % 13 < 2 && x % 4 < 2;
    if (dash) return px(45, 45, 42, jitter(1, 0.1));
    return px(216, 214, 200, jitter(1, 0.05));
  });
  paintTile(TILE.DARK_LOG_SIDE, (x) => {
    const stripe = (x % 4 === 0 || x % 7 === 0) ? 0.72 : 1;
    return px(62, 45, 28, jitter(stripe, 0.1));
  });

  // --- ジャック・オ・ランタンの顔 ---
  paintTile(TILE.JACK_O_FACE, (x, y) => {
    // 三角の目 (2つ)
    const eye = (dxc, w) => y >= 4 && y <= 6 && Math.abs(x - dxc) <= (y - 4);
    const eyes = eye(4, 2) || eye(11, 2);
    // ギザギザの口
    const mouth = y >= 9 && y <= 11 && x >= 3 && x <= 12 &&
      !(y === 9 && x % 3 === 0) && !(y === 11 && x % 3 === 1);
    if (eyes || mouth) return px(255, 220, 110, jitter(1, 0.05)); // 光る顔
    const ridge = x % 4 === 0 ? 0.8 : 1;
    return px(225, 130, 30, jitter(ridge, 0.07));
  });

  // --- 鉄ブロック / 石炭ブロック ---
  paintTile(TILE.IRON_BLOCK, (x, y) => {
    const border = x === 0 || y === 0 || x === 15 || y === 15;
    const rivet = (x === 2 || x === 13) && (y === 2 || y === 13);
    if (rivet) return px(170, 170, 175, 1);
    return px(border ? 185 : 220, border ? 185 : 220, border ? 190 : 225, jitter(1, 0.03));
  });
  paintTile(TILE.COAL_BLOCK, (x, y) => {
    const sheen = Math.sin(x * 1.3 + y * 0.8) > 0.8;
    return px(sheen ? 60 : 38, sheen ? 60 : 38, sheen ? 62 : 40, jitter(1, 0.12));
  });

  // --- テラコッタ (マットな土もの) ---
  TERRA_COLORS.forEach(([, , c], i) => {
    paintTile(TERRA_TILE_BASE + i, (x, y) => {
      const band = y % 6 === 5 ? 0.92 : 1;
      return px(c[0], c[1], c[2], jitter(band, 0.05));
    });
  });

  // --- 各タイルの平均色を計算 ---
  const full = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  for (let tile = 0; tile < ATLAS_COLS * ATLAS_ROWS; tile++) {
    const ox = (tile % ATLAS_COLS) * TILE_PX;
    const oy = Math.floor(tile / ATLAS_COLS) * TILE_PX;
    let r = 0, g = 0, b = 0, n = 0;
    for (let y = 0; y < TILE_PX; y++) {
      for (let x = 0; x < TILE_PX; x++) {
        const i = ((oy + y) * canvas.width + ox + x) * 4;
        if (full[i + 3] < 128) continue;
        r += full[i]; g += full[i + 1]; b += full[i + 2]; n++;
      }
    }
    TILE_AVG_COLORS[tile] = n > 0
      ? [r / n / 255, g / n / 255, b / n / 255]
      : [0.5, 0.5, 0.5];
  }

  return canvas;
}

// 鉱石の斑点パターンを作る: 2x2 の塊を数個
function makeSpots(rand, count) {
  const cells = new Set();
  for (let i = 0; i < count; i++) {
    const sx = 1 + (rand() * 13) | 0;
    const sy = 1 + (rand() * 13) | 0;
    cells.add(sx + sy * 16);
    cells.add(sx + 1 + sy * 16);
    cells.add(sx + (sy + 1) * 16);
    if (rand() < 0.5) cells.add(sx + 1 + (sy + 1) * 16);
  }
  return (x, y) => cells.has(x + y * 16);
}

// ホットバー用のブロックアイコンを canvas に描く (擬似等角投影)
function drawBlockIcon(canvas, blockId, atlas) {
  const ctx = canvas.getContext("2d");
  const s = canvas.width;
  ctx.clearRect(0, 0, s, s);
  ctx.imageSmoothingEnabled = false;

  const block = getDef(blockId);
  const srcTile = (tile) => {
    const tx = (tile % ATLAS_COLS) * TILE_PX;
    const ty = Math.floor(tile / ATLAS_COLS) * TILE_PX;
    return [tx, ty];
  };

  // アイテム / X 字植生 / 松明はタイルをそのまま描く
  if (!block.tiles || block.cross || block.torch) {
    const [tx, ty] = srcTile(block.tiles ? block.tiles[0] : block.tile);
    ctx.drawImage(atlas, tx, ty, TILE_PX, TILE_PX, s * 0.08, s * 0.08, s * 0.84, s * 0.84);
    return;
  }

  const cx = s / 2;
  const topH = s * 0.28;   // 上面のつぶれ具合
  const half = s * 0.46;

  // 上面 (菱形)
  {
    const [tx, ty] = srcTile(block.tiles[0]);
    ctx.save();
    ctx.translate(cx, topH);
    ctx.transform(1, 0.5, -1, 0.5, 0, 0); // 菱形へシアー
    ctx.scale(half / TILE_PX, half / TILE_PX);
    ctx.drawImage(atlas, tx, ty, TILE_PX, TILE_PX, 0, -TILE_PX, TILE_PX, TILE_PX);
    ctx.restore();
  }
  // 左面
  {
    const [tx, ty] = srcTile(block.tiles[1]);
    ctx.save();
    ctx.translate(cx - half, topH + half * 0.5);
    ctx.transform(1, 0.5, 0, 1, 0, 0);
    ctx.scale(half / TILE_PX, (s - topH - half * 0.5) / TILE_PX * 0.92);
    ctx.globalAlpha = 1;
    ctx.drawImage(atlas, tx, ty, TILE_PX, TILE_PX, 0, -TILE_PX * 0.5, TILE_PX, TILE_PX);
    ctx.fillStyle = "rgba(0,0,0,0.25)";
    ctx.fillRect(0, -TILE_PX * 0.5, TILE_PX, TILE_PX);
    ctx.restore();
  }
  // 右面
  {
    const [tx, ty] = srcTile(block.tiles[1]);
    ctx.save();
    ctx.translate(cx, topH + half);
    ctx.transform(1, -0.5, 0, 1, 0, 0);
    ctx.scale(half / TILE_PX, (s - topH - half * 0.5) / TILE_PX * 0.92);
    ctx.drawImage(atlas, tx, ty, TILE_PX, TILE_PX, 0, 0, TILE_PX, TILE_PX);
    ctx.fillStyle = "rgba(0,0,0,0.42)";
    ctx.fillRect(0, 0, TILE_PX, TILE_PX);
    ctx.restore();
  }
}
