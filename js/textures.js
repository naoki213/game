// ---------------------------------------------------------------
// プロシージャルテクスチャアトラス生成 (外部画像なし)
// 各タイル 16x16px, アトラスは 8x4 タイル = 128x64px
// ---------------------------------------------------------------
"use strict";

const TILE_PX = 16;
const ATLAS_COLS = 8;
const ATLAS_ROWS = 4;

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

  // --- 水 (半透明はシェーダ側で処理, ここは色のみ) ---
  paintTile(TILE.WATER, (x, y) => {
    const wave = Math.sin((x + y * 2) * 0.8) * 0.06;
    const v = 1 + wave + (rand() * 2 - 1) * 0.03;
    return px(52, 95, 218, v);
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

  // --- 羊毛 (もこもこの白) ---
  paintTile(TILE.WOOL, (x, y) => {
    const swirl = Math.sin(x * 1.9 + y * 0.7) * Math.sin(y * 1.7 - x * 0.5);
    const v = 0.93 + swirl * 0.05 + (rand() * 2 - 1) * 0.03;
    return px(238, 234, 228, v);
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

  const block = BLOCKS[blockId];
  const srcTile = (tile) => {
    const tx = (tile % ATLAS_COLS) * TILE_PX;
    const ty = Math.floor(tile / ATLAS_COLS) * TILE_PX;
    return [tx, ty];
  };

  // X 字植生 / 松明はタイルをそのまま描く
  if (block.cross || block.torch) {
    const [tx, ty] = srcTile(block.tiles[0]);
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
