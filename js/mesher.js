// ---------------------------------------------------------------
// チャンクメッシュ生成: 隣接面カリング + 頂点 AO + ライティング
//
// ライトは 2 チャンネル:
//   スカイライト  — 空から届く光。BFS で洞窟の入口へ減衰しながら伝播
//   ブロックライト — グロウストーン等の発光ブロックから BFS で伝播
// チャンク境界を越える光のため、周囲 8 ブロックのマージン付きで
// チャンクごとに計算する (再計算はチャンク再メッシュ時)。
//
// 頂点フォーマット: [x, y, z, u, v, shade, sky, block] (float x8)
// ---------------------------------------------------------------
"use strict";

// 6 方向の面定義。corners は外側から見て反時計回り (CCW)。
// uv は corners と同順で [u, v] (v=0 がタイル上端)。
const FACES = [
  { // +X (東)
    dir: [1, 0, 0], shade: 0.8,
    corners: [[1, 1, 1], [1, 0, 1], [1, 0, 0], [1, 1, 0]],
    uvs: [[0, 0], [0, 1], [1, 1], [1, 0]],
  },
  { // -X (西)
    dir: [-1, 0, 0], shade: 0.8,
    corners: [[0, 1, 0], [0, 0, 0], [0, 0, 1], [0, 1, 1]],
    uvs: [[0, 0], [0, 1], [1, 1], [1, 0]],
  },
  { // +Y (上)
    dir: [0, 1, 0], shade: 1.0,
    corners: [[0, 1, 0], [0, 1, 1], [1, 1, 1], [1, 1, 0]],
    uvs: [[0, 0], [0, 1], [1, 1], [1, 0]],
  },
  { // -Y (下)
    dir: [0, -1, 0], shade: 0.5,
    corners: [[0, 0, 1], [0, 0, 0], [1, 0, 0], [1, 0, 1]],
    uvs: [[0, 0], [0, 1], [1, 1], [1, 0]],
  },
  { // +Z (南)
    dir: [0, 0, 1], shade: 0.7,
    corners: [[0, 1, 1], [0, 0, 1], [1, 0, 1], [1, 1, 1]],
    uvs: [[0, 0], [0, 1], [1, 1], [1, 0]],
  },
  { // -Z (北)
    dir: [0, 0, -1], shade: 0.7,
    corners: [[1, 1, 0], [1, 0, 0], [0, 0, 0], [0, 1, 0]],
    uvs: [[0, 0], [0, 1], [1, 1], [1, 0]],
  },
];

// 階段ブロックの形状データ (dir: 0=north 1=east 2=south 3=west, blocks.js の
// STAIR_DIRS と対応)。下段は常に全面のハーフブロック、上段は「開いている」
// 方向と反対側の半分だけ一段高い箱。
const STAIR_UPPER_BOX = [
  { x0: 0, x1: 1, y0: 0.5, y1: 1, z0: 0.5, z1: 1 },   // north: 開放 -z, 奥は +z 側
  { x0: 0, x1: 0.5, y0: 0.5, y1: 1, z0: 0, z1: 1 },   // east:  開放 +x, 奥は -x 側
  { x0: 0, x1: 1, y0: 0.5, y1: 1, z0: 0, z1: 0.5 },   // south: 開放 +z, 奥は -z 側
  { x0: 0.5, x1: 1, y0: 0.5, y1: 1, z0: 0, z1: 1 },   // west:  開放 -x, 奥は +x 側
];
const STAIR_OPEN_TOP = [
  { x0: 0, x1: 1, y0: 0.5, y1: 0.5, z0: 0, z1: 0.5 },
  { x0: 0.5, x1: 1, y0: 0.5, y1: 0.5, z0: 0, z1: 1 },
  { x0: 0, x1: 1, y0: 0.5, y1: 0.5, z0: 0.5, z1: 1 },
  { x0: 0, x1: 0.5, y0: 0.5, y1: 0.5, z0: 0, z1: 1 },
];
// 上段のうち, 踏み板との境目 (蹴込み面) は常に描画。FACES のインデックス (0=+X 1=-X 4=+Z 5=-Z)
const STAIR_RISER_FACE = [5, 0, 4, 1];

// ドアの形状データ (dir: 0=north 1=east 2=south 3=west, blocks.js の DOOR_DIRS と対応)。
// 閉状態は dir 側の壁際に張り付く薄い板, 開状態は隣接する壁際まで 90 度回転した板
// (どちらも共通のヒンジ角を軸に回転させた形なので寸法に矛盾がない)
const DOOR_THICK = 0.1875;
const DOOR_CLOSED_BOX = [
  { x0: 0, x1: 1, y0: 0, y1: 1, z0: 0, z1: DOOR_THICK },
  { x0: 1 - DOOR_THICK, x1: 1, y0: 0, y1: 1, z0: 0, z1: 1 },
  { x0: 0, x1: 1, y0: 0, y1: 1, z0: 1 - DOOR_THICK, z1: 1 },
  { x0: 0, x1: DOOR_THICK, y0: 0, y1: 1, z0: 0, z1: 1 },
];
const DOOR_OPEN_BOX = [
  { x0: 0, x1: DOOR_THICK, y0: 0, y1: 1, z0: 0, z1: 1 },
  { x0: 0, x1: 1, y0: 0, y1: 1, z0: 0, z1: DOOR_THICK },
  { x0: 1 - DOOR_THICK, x1: 1, y0: 0, y1: 1, z0: 0, z1: 1 },
  { x0: 0, x1: 1, y0: 0, y1: 1, z0: 1 - DOOR_THICK, z1: 1 },
];

// フェンスの形状データ: 中央の支柱 + 隣接フェンスへ繋がる横木 (2段)
const FENCE_POST = { x0: 0.375, x1: 0.625, y0: 0, y1: 1, z0: 0.375, z1: 0.625 };
const FENCE_ARM_DIRS = [[1, 0, "x"], [-1, 0, "x"], [0, 1, "z"], [0, -1, "z"]];
const FENCE_RAIL_Y = [[0.75, 0.9375], [0.375, 0.5]];

// 窓ガラスの形状データ: フェンスと同じ考え方だが薄い板が全高 (1段) でつながる
const PANE_POST = { x0: 0.4375, x1: 0.5625, y0: 0, y1: 1, z0: 0.4375, z1: 0.5625 };
const PANE_ARM_DIRS = FENCE_ARM_DIRS;

// ベッドの形状: 高さの低い箱 (本家同様, 頭側/足側の2マス1組)。
// dir (0=north 1=east 2=south 3=west) は頭から足に向かう方向
const BED_HEIGHT = 0.5625;
const BED_DIR_OFFSET = [[0, 0, -1], [1, 0, 0], [0, 0, 1], [-1, 0, 0]];

// 汎用の箱を1個メッシュに積む (階段/ドア/フェンスなど非立方体の特殊形状で共用)。
// 通常ブロックと同じ UV 規則 (角のローカル座標に応じて面ごとに割り当て) を使う
// tiles は単一タイル番号, または通常ブロックと同じ [top, side, bottom] 配列
function pushLitBox(target, wx, y, wz, box, tiles, sky, blk, skipFaces) {
  const tileArr = Array.isArray(tiles) ? tiles : [tiles, tiles, tiles];
  for (let f = 0; f < 6; f++) {
    if (skipFaces && skipFaces[f]) continue;
    const face = FACES[f];
    const tile = f === 2 ? tileArr[0] : f === 3 ? tileArr[2] : tileArr[1];
    const uv = tileUV(tile);
    const vi = target.count;
    for (let ci = 0; ci < 4; ci++) {
      const c = face.corners[ci];
      const xF = c[0] ? box.x1 : box.x0;
      const yF = c[1] ? box.y1 : box.y0;
      const zF = c[2] ? box.z1 : box.z0;
      let u, v;
      switch (f) {
        case 0: u = 1 - zF; v = 1 - yF; break;
        case 1: u = zF; v = 1 - yF; break;
        case 2: u = xF; v = zF; break;
        case 3: u = xF; v = 1 - zF; break;
        case 4: u = xF; v = 1 - yF; break;
        default: u = 1 - xF; v = 1 - yF; break;
      }
      target.verts.push(
        wx + xF, y + yF, wz + zF,
        lerp(uv.u0, uv.u1, u), lerp(uv.v0, uv.v1, v),
        f * 4 + face.shade,
        sky, blk
      );
    }
    target.indices.push(vi, vi + 1, vi + 2, vi, vi + 2, vi + 3);
    target.count += 4;
  }
}

// この面を描画すべきか
function shouldDrawFace(id, neighborId) {
  if (neighborId === B.AIR) return true;
  const nb = BLOCKS[neighborId];
  if (nb.opaque) return false;
  // 透明ブロック同士 (水-水, ガラス-ガラス, 葉-葉) の内部面は張らない
  return neighborId !== id;
}

// 頂点 AO: side1/side2/corner の遮蔽から 0..3 (3 = 遮蔽なし)
function vertexAO(s1, s2, c) {
  if (s1 && s2) return 0;
  return 3 - (s1 + s2 + c);
}

const AO_FACTOR = [0.55, 0.7, 0.85, 1.0];

// ---------------- ライト計算 ----------------

const LIGHT_MARGIN = 8;                       // チャンク外周のマージン
const LSX = CHUNK_SIZE + LIGHT_MARGIN * 2;    // 32
const LSZ = LSX;
const L_CELLS = LSX * LSZ * CHUNK_H;

// スクラッチバッファ (使い回し。シングルスレッド前提)
const lightBlocks = new Uint8Array(L_CELLS);  // ブロック ID
const lightSky = new Uint8Array(L_CELLS);     // スカイライト 0..15
const lightBlk = new Uint8Array(L_CELLS);     // ブロックライト 0..15
const lightQueue = new Int32Array(L_CELLS * 2);

function lIdx(x, y, z) {
  // x, z: 0..LSX-1 (リージョン座標), y: 0..CHUNK_H-1
  return (y * LSZ + z) * LSX + x;
}

// チャンク + マージンのブロックを集めてライトを BFS 伝播する
function computeLight(world, chunk) {
  lightBlocks.fill(0);
  lightSky.fill(0);
  lightBlk.fill(0);

  // --- 周囲 3x3 チャンクからブロック ID をコピー ---
  for (let dz = -1; dz <= 1; dz++) {
    for (let dx = -1; dx <= 1; dx++) {
      const c = world.getChunk(chunk.cx + dx, chunk.cz + dz);
      if (!c || !c.generated) continue;
      const bx = dx * CHUNK_SIZE + LIGHT_MARGIN; // リージョン内の基準
      const bz = dz * CHUNK_SIZE + LIGHT_MARGIN;
      for (let y = 0; y < CHUNK_H; y++) {
        for (let lz = 0; lz < CHUNK_SIZE; lz++) {
          const rz = bz + lz;
          if (rz < 0 || rz >= LSZ) continue;
          const rowSrc = (y << 8) | (lz << 4);
          const rowDst = (y * LSZ + rz) * LSX + bx;
          for (let lx = 0; lx < CHUNK_SIZE; lx++) {
            const rx = bx + lx;
            if (rx < 0 || rx >= LSX) continue;
            lightBlocks[rowDst + lx] = c.data[rowSrc | lx];
          }
        }
      }
    }
  }

  let tail = 0;

  // --- スカイライト: 各列の最初の不透明ブロックまで 15 ---
  for (let rz = 0; rz < LSZ; rz++) {
    for (let rx = 0; rx < LSX; rx++) {
      let level = 15;
      for (let y = CHUNK_H - 1; y >= 0; y--) {
        const i = lIdx(rx, y, rz);
        const id = lightBlocks[i];
        if (OPAQUE_LUT[id]) break;
        lightSky[i] = level;
        lightQueue[tail++] = i;
        if (id === B.WATER) {
          // 水面から下は別途減衰伝播に任せる (2/ブロック)
          for (let wy = y, l = level; wy >= 0; wy--) {
            const wi = lIdx(rx, wy, rz);
            const wid = lightBlocks[wi];
            if (OPAQUE_LUT[wid]) break;
            lightSky[wi] = l;
            lightQueue[tail++] = wi;
            if (wid === B.WATER) l = Math.max(l - 2, 0);
          }
          break;
        }
        // 葉は不透明ではないが光をわずかに遮る (木の下に木漏れ日の木陰ができる)
        if (id === B.LEAVES) level = Math.max(0, level - 2);
      }
    }
  }

  // --- 発光ブロック ---
  const blkQueue = [];
  for (let i = 0; i < L_CELLS; i++) {
    const lv = LIGHT_LUT[lightBlocks[i]];
    if (lv > 0) {
      lightBlk[i] = lv;
      blkQueue.push(i);
    }
  }

  // --- BFS 伝播 (6 近傍, 1 減衰) ---
  propagate(lightSky, lightQueue, tail);
  if (blkQueue.length > 0) {
    for (let i = 0; i < blkQueue.length; i++) lightQueue[i] = blkQueue[i];
    propagate(lightBlk, lightQueue, blkQueue.length);
  }
}

function propagate(channel, queue, tail) {
  const planeSize = LSX * LSZ;
  let head = 0;

  const spread = (i, next) => {
    if (channel[i] >= next || OPAQUE_LUT[lightBlocks[i]]) return;
    // 水中はさらに減衰
    const v = lightBlocks[i] === B.WATER ? next - 1 : next;
    if (v > 0 && channel[i] < v) {
      channel[i] = v;
      if (tail < queue.length) queue[tail++] = i;
    }
  };

  while (head < tail) {
    const i = queue[head++];
    const L = channel[i];
    if (L <= 1) continue;
    const y = (i / planeSize) | 0;
    const rem = i - y * planeSize;
    const z = (rem / LSX) | 0;
    const x = rem - z * LSX;
    const next = L - 1;

    if (x > 0) spread(i - 1, next);
    if (x < LSX - 1) spread(i + 1, next);
    if (z > 0) spread(i - LSX, next);
    if (z < LSZ - 1) spread(i + LSX, next);
    if (y > 0) spread(i - planeSize, next);
    if (y < CHUNK_H - 1) spread(i + planeSize, next);
  }
}

// ---------------- メッシュ構築 ----------------

// チャンクのメッシュを構築。{ opaque, water } の各 Float32Array/インデックスを返す
function buildChunkMesh(world, chunk) {
  const ox = chunk.cx * CHUNK_SIZE;
  const oz = chunk.cz * CHUNK_SIZE;

  computeLight(world, chunk);

  const opaque = { verts: [], indices: [], count: 0 };
  const water = { verts: [], indices: [], count: 0 };
  const lava = { verts: [], indices: [], count: 0 };

  const data = chunk.data;

  // 隣接ブロック取得 (チャンク内は高速パス, 範囲外はライトリージョンから)
  function getNb(lx, y, lz) {
    if (y < 0) return B.BEDROCK;
    if (y >= CHUNK_H) return B.AIR;
    if (lx >= 0 && lx < 16 && lz >= 0 && lz < 16) {
      return data[(y << 8) | (lz << 4) | lx];
    }
    return lightBlocks[lIdx(lx + LIGHT_MARGIN, y, lz + LIGHT_MARGIN)];
  }

  const opaqueNb = (lx, y, lz) => isOpaque(getNb(lx, y, lz));

  // セル (チャンクローカル座標) のライトを取得。y 範囲外は空 / 暗闇
  function skyAt(lx, y, lz) {
    if (y >= CHUNK_H) return 15;
    if (y < 0) return 0;
    return lightSky[lIdx(lx + LIGHT_MARGIN, y, lz + LIGHT_MARGIN)];
  }
  function blkAt(lx, y, lz) {
    if (y >= CHUNK_H || y < 0) return 0;
    return lightBlk[lIdx(lx + LIGHT_MARGIN, y, lz + LIGHT_MARGIN)];
  }

  for (let y = 0; y < CHUNK_H; y++) {
    for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        const id = data[(y << 8) | (lz << 4) | lx];
        if (id === B.AIR) continue;

        const block = BLOCKS[id];

        // --- 松明: 中央の細い棒 (4 側面 + 上面) ---
        if (block.torch) {
          const uv = tileUV(block.tiles[0]);
          const uA = lerp(uv.u0, uv.u1, 7 / 16), uB = lerp(uv.u0, uv.u1, 9 / 16);
          const vA = lerp(uv.v0, uv.v1, 4 / 16), vB = lerp(uv.v0, uv.v1, 14 / 16);
          const x0 = ox + lx + 7 / 16, x1 = ox + lx + 9 / 16;
          const z0 = oz + lz + 7 / 16, z1 = oz + lz + 9 / 16;
          const y0 = y, y1 = y + 10 / 16;
          // [TL, BL, BR, TR] × 4 側面 + 上面
          const quads = [
            { c: [[x1, y1, z1], [x1, y0, z1], [x1, y0, z0], [x1, y1, z0]], uv: [uA, vA, uB, vB] },
            { c: [[x0, y1, z0], [x0, y0, z0], [x0, y0, z1], [x0, y1, z1]], uv: [uA, vA, uB, vB] },
            { c: [[x0, y1, z1], [x0, y0, z1], [x1, y0, z1], [x1, y1, z1]], uv: [uA, vA, uB, vB] },
            { c: [[x1, y1, z0], [x1, y0, z0], [x0, y0, z0], [x0, y1, z0]], uv: [uA, vA, uB, vB] },
            { c: [[x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0]],
              uv: [uA, lerp(uv.v0, uv.v1, 4 / 16), uB, lerp(uv.v0, uv.v1, 6 / 16)] },
          ];
          for (const q of quads) {
            const vi = opaque.count;
            const [qu0, qv0, qu1, qv1] = q.uv;
            const uvs = [[qu0, qv0], [qu0, qv1], [qu1, qv1], [qu1, qv0]];
            for (let ci = 0; ci < 4; ci++) {
              opaque.verts.push(q.c[ci][0], q.c[ci][1], q.c[ci][2],
                uvs[ci][0], uvs[ci][1], 25.0, 1.0, 1.0);
            }
            opaque.indices.push(vi, vi + 1, vi + 2, vi, vi + 2, vi + 3);
            opaque.count += 4;
          }
          continue;
        }

        // --- X 字植生 (草花): 対角の板ポリ 2 枚を両面で張る ---
        if (block.cross) {
          const uv = tileUV(block.tiles[0]);
          const x0 = ox + lx, z0 = oz + lz;
          const sky = skyAt(lx, y, lz) / 15;
          const blk = blkAt(lx, y, lz) / 15;
          // 2 枚の対角クアッド, 各 [TL, BL, BR, TR]
          const quads = [
            [[x0, y + 1, z0], [x0, y, z0], [x0 + 1, y, z0 + 1], [x0 + 1, y + 1, z0 + 1]],
            [[x0 + 1, y + 1, z0], [x0 + 1, y, z0], [x0, y, z0 + 1], [x0, y + 1, z0 + 1]],
          ];
          const quadUV = [[uv.u0, uv.v0], [uv.u0, uv.v1], [uv.u1, uv.v1], [uv.u1, uv.v0]];
          for (const q of quads) {
            const vi = opaque.count;
            for (let ci = 0; ci < 4; ci++) {
              // 24 + shade = 法線インデックス 6 (方向なし)。
              // 先端 (ci 0,3) は 28 + shade = インデックス 7 にして, 頂点シェーダで
              // 根元は揺れず先端だけそよ風で揺れるようにする
              const top = ci === 0 || ci === 3;
              opaque.verts.push(q[ci][0], q[ci][1], q[ci][2],
                quadUV[ci][0], quadUV[ci][1], top ? 28.95 : 24.95, sky, blk);
            }
            // 両面 (表裏の三角形を両方積む)
            opaque.indices.push(vi, vi + 1, vi + 2, vi, vi + 2, vi + 3);
            opaque.indices.push(vi + 2, vi + 1, vi, vi + 3, vi + 2, vi);
            opaque.count += 4;
          }
          continue;
        }

        // --- ベッド: 高さの低い箱を1つ積む (頭/足の間の面は常に描かない) ---
        if (block.bed) {
          const wx = ox + lx, wz = oz + lz;
          const sky = skyAt(lx, y, lz) / 15;
          const blk = blkAt(lx, y, lz) / 15;
          const box = { x0: 0, x1: 1, y0: 0, y1: BED_HEIGHT, z0: 0, z1: 1 };
          const [odx, , odz] = BED_DIR_OFFSET[block.bedDir];
          const towardPartner = block.bedFoot ? [-odx, 0, -odz] : [odx, 0, odz];
          const skip = [false, false, false, false, false, false];
          for (let f = 0; f < 6; f++) {
            const fd = FACES[f].dir;
            if (fd[0] === towardPartner[0] && fd[1] === towardPartner[1] && fd[2] === towardPartner[2]) {
              skip[f] = true;
              continue;
            }
            if (!shouldDrawFace(id, getNb(lx + fd[0], y + fd[1], lz + fd[2]))) skip[f] = true;
          }
          pushLitBox(opaque, wx, y, wz, box, block.tiles, sky, blk, skip);
          continue;
        }

        // --- ドア: 開閉状態に応じた薄い板を1枚積む ---
        if (block.door) {
          const wx = ox + lx, wz = oz + lz;
          const sky = skyAt(lx, y, lz) / 15;
          const blk = blkAt(lx, y, lz) / 15;
          const box = (block.doorOpen ? DOOR_OPEN_BOX : DOOR_CLOSED_BOX)[block.doorDir];
          pushLitBox(opaque, wx, y, wz, box, block.tiles[1], sky, blk);
          continue;
        }

        // --- フェンス: 中央の支柱 + 隣接フェンスへつながる横木2段 ---
        if (block.fence) {
          const wx = ox + lx, wz = oz + lz;
          const sky = skyAt(lx, y, lz) / 15;
          const blk = blkAt(lx, y, lz) / 15;
          const tile = block.tiles[1];
          pushLitBox(opaque, wx, y, wz, FENCE_POST, tile, sky, blk);
          for (const [dx, dz, axis] of FENCE_ARM_DIRS) {
            const nb = BLOCKS[getNb(lx + dx, y, lz + dz)];
            if (!nb || !nb.fence) continue;
            for (const [ry0, ry1] of FENCE_RAIL_Y) {
              const box = axis === "x"
                ? (dx > 0
                  ? { x0: 0.625, x1: 1, y0: ry0, y1: ry1, z0: 0.4375, z1: 0.5625 }
                  : { x0: 0, x1: 0.375, y0: ry0, y1: ry1, z0: 0.4375, z1: 0.5625 })
                : (dz > 0
                  ? { x0: 0.4375, x1: 0.5625, y0: ry0, y1: ry1, z0: 0.625, z1: 1 }
                  : { x0: 0.4375, x1: 0.5625, y0: ry0, y1: ry1, z0: 0, z1: 0.375 });
              pushLitBox(opaque, wx, y, wz, box, tile, sky, blk);
            }
          }
          continue;
        }

        // --- 窓ガラス: 中央の支柱 + 隣接する窓ガラスへつながる全高の板 ---
        if (block.pane) {
          const wx = ox + lx, wz = oz + lz;
          const sky = skyAt(lx, y, lz) / 15;
          const blk = blkAt(lx, y, lz) / 15;
          const tile = block.tiles[1];
          pushLitBox(opaque, wx, y, wz, PANE_POST, tile, sky, blk);
          for (const [dx, dz, axis] of PANE_ARM_DIRS) {
            const nb = BLOCKS[getNb(lx + dx, y, lz + dz)];
            if (!nb || !nb.pane) continue;
            const box = axis === "x"
              ? (dx > 0
                ? { x0: 0.5625, x1: 1, y0: 0, y1: 1, z0: 0.4375, z1: 0.5625 }
                : { x0: 0, x1: 0.4375, y0: 0, y1: 1, z0: 0.4375, z1: 0.5625 })
              : (dz > 0
                ? { x0: 0.4375, x1: 0.5625, y0: 0, y1: 1, z0: 0.5625, z1: 1 }
                : { x0: 0.4375, x1: 0.5625, y0: 0, y1: 1, z0: 0, z1: 0.4375 });
            pushLitBox(opaque, wx, y, wz, box, tile, sky, blk);
          }
          continue;
        }

        // --- 階段: 下段 (全面ハーフ) + 上段 (奥半分だけ一段高い) の2箱を積む ---
        if (block.stairs) {
          const dir = block.stairDir;
          const wx = ox + lx, wz = oz + lz;
          const sky = skyAt(lx, y, lz) / 15;
          const blk = blkAt(lx, y, lz) / 15;
          const tiles = block.tiles;

          const pushStairFace = (f, box) => {
            const face = FACES[f];
            const tile = f === 2 ? tiles[0] : f === 3 ? tiles[2] : tiles[1];
            const uv = tileUV(tile);
            const vi = opaque.count;
            for (let ci = 0; ci < 4; ci++) {
              const c = face.corners[ci];
              const xF = c[0] ? box.x1 : box.x0;
              const yF = c[1] ? box.y1 : box.y0;
              const zF = c[2] ? box.z1 : box.z0;
              let u, v;
              switch (f) {
                case 0: u = 1 - zF; v = 1 - yF; break;
                case 1: u = zF; v = 1 - yF; break;
                case 2: u = xF; v = zF; break;
                case 3: u = xF; v = 1 - zF; break;
                case 4: u = xF; v = 1 - yF; break;
                default: u = 1 - xF; v = 1 - yF; break;
              }
              opaque.verts.push(
                wx + xF, y + yF, wz + zF,
                lerp(uv.u0, uv.u1, u), lerp(uv.v0, uv.v1, v),
                f * 4 + face.shade,
                sky, blk
              );
            }
            opaque.indices.push(vi, vi + 1, vi + 2, vi, vi + 2, vi + 3);
            opaque.count += 4;
          };

          const lowerBox = { x0: 0, x1: 1, y0: 0, y1: 0.5, z0: 0, z1: 1 };
          for (const f of [0, 1, 4, 5]) {
            const [dx, , dz] = FACES[f].dir;
            if (shouldDrawFace(id, getNb(lx + dx, y, lz + dz))) pushStairFace(f, lowerBox);
          }
          if (shouldDrawFace(id, getNb(lx, y - 1, lz))) pushStairFace(3, lowerBox);
          // 下段の踏み板 (開いている側の上面) は常に露出しているので無条件に描画
          pushStairFace(2, STAIR_OPEN_TOP[dir]);

          const upperBox = STAIR_UPPER_BOX[dir];
          const riserFace = STAIR_RISER_FACE[dir];
          for (const f of [0, 1, 4, 5]) {
            if (f === riserFace) { pushStairFace(f, upperBox); continue; }
            const [dx, , dz] = FACES[f].dir;
            if (shouldDrawFace(id, getNb(lx + dx, y, lz + dz))) pushStairFace(f, upperBox);
          }
          if (shouldDrawFace(id, getNb(lx, y + 1, lz))) pushStairFace(2, upperBox);
          continue;
        }

        const isWater = id === B.WATER;
        const isLava = id === B.LAVA_BLOCK;
        const isFluid = isWater || isLava;
        const target = isWater ? water : isLava ? lava : opaque;
        const blockTop = block.height;   // ハーフブロック = 0.5
        // 水面: 上が空気なら少し低くして水面らしく。マグマは粘性が高く沈みは控えめ
        const topOffset = isWater && getNb(lx, y + 1, lz) !== B.WATER ? -0.125
          : isLava && getNb(lx, y + 1, lz) !== B.LAVA_BLOCK ? -0.06 : 0;

        for (let f = 0; f < 6; f++) {
          const face = FACES[f];
          const [dx, dy, dz] = face.dir;
          const nbId = getNb(lx + dx, y + dy, lz + dz);
          if (!shouldDrawFace(id, nbId)) {
            // ハーフブロック: 上面は常に描く (上のブロックとの間に隙間がある)。
            // 底面も下が不透明ブロックでなければ描く
            if (!(blockTop < 1 && (f === 2 || (f === 3 && !isOpaque(nbId))))) continue;
          }
          // 流体内部から見た側面は省略 (上面のみ描く)
          if (isFluid && f !== 2 && nbId !== B.AIR && !BLOCKS[nbId].opaque) continue;

          const tile = f === 2 ? block.tiles[0] : f === 3 ? block.tiles[2] : block.tiles[1];
          const uv = tileUV(tile);
          const baseShade = block.emissive ? 1.0 : face.shade;

          // 面法線方向の隣接セル基準で AO とライトを計算
          const nx = lx + dx, ny = y + dy, nz = lz + dz;
          // 面平面内の接線軸 (dir 以外の 2 軸)
          const axis = dx !== 0 ? 0 : dy !== 0 ? 1 : 2;
          const t1 = axis === 0 ? 1 : 0;          // 接線軸 1
          const t2 = axis === 2 ? 1 : 2;          // 接線軸 2

          const aos = new Array(4);
          const shades = new Array(4);
          const skys = new Array(4);
          const blks = new Array(4);

          for (let ci = 0; ci < 4; ci++) {
            const c = face.corners[ci];
            if (block.emissive) {
              // 発光ブロック自身は常に最大光量
              aos[ci] = 3;
              shades[ci] = 1.0;
              skys[ci] = 1.0;
              blks[ci] = 1.0;
              continue;
            }

            // 角の座標 (0/1) から接線方向のオフセット (±1)
            const o1 = c[t1] === 1 ? 1 : -1;
            const o2 = c[t2] === 1 ? 1 : -1;
            const p1 = [nx, ny, nz]; p1[t1] += o1;
            const p2 = [nx, ny, nz]; p2[t2] += o2;
            const pc = [nx, ny, nz]; pc[t1] += o1; pc[t2] += o2;

            const s1 = opaqueNb(p1[0], p1[1], p1[2]) ? 1 : 0;
            const s2 = opaqueNb(p2[0], p2[1], p2[2]) ? 1 : 0;
            const cc = opaqueNb(pc[0], pc[1], pc[2]) ? 1 : 0;

            let ao = 3;
            if (!isWater) ao = vertexAO(s1, s2, cc);
            aos[ci] = ao;
            shades[ci] = baseShade * AO_FACTOR[ao];

            // 頂点周囲の非遮蔽セルのライトを平均してスムーズに
            let sSum = skyAt(nx, ny, nz);
            let bSum = blkAt(nx, ny, nz);
            let n = 1;
            if (!s1) { sSum += skyAt(p1[0], p1[1], p1[2]); bSum += blkAt(p1[0], p1[1], p1[2]); n++; }
            if (!s2) { sSum += skyAt(p2[0], p2[1], p2[2]); bSum += blkAt(p2[0], p2[1], p2[2]); n++; }
            if (!cc && !(s1 && s2)) { sSum += skyAt(pc[0], pc[1], pc[2]); bSum += blkAt(pc[0], pc[1], pc[2]); n++; }
            skys[ci] = sSum / n / 15;
            blks[ci] = bSum / n / 15;
          }

          // 頂点を追加 (ハーフブロックは高さと側面 UV を圧縮)
          const sideVTop = (blockTop < 1 && f !== 2 && f !== 3) ? 1 - blockTop : 0;
          const vi = target.count;
          for (let ci = 0; ci < 4; ci++) {
            const c = face.corners[ci];
            const cy = c[1] === 1 ? blockTop + topOffset : 0;
            target.verts.push(
              ox + lx + c[0],
              y + cy,
              oz + lz + c[2],
              lerp(uv.u0, uv.u1, face.uvs[ci][0]),
              lerp(uv.v0, uv.v1, face.uvs[ci][1] === 0 ? sideVTop : face.uvs[ci][1]),
              f * 4 + shades[ci],   // 法線インデックスをパック
              skys[ci],
              blks[ci]
            );
          }

          // AO の異方性対策: 対角の明るさで三角形分割を反転
          if (aos[0] + aos[2] > aos[1] + aos[3]) {
            target.indices.push(vi, vi + 1, vi + 2, vi, vi + 2, vi + 3);
          } else {
            target.indices.push(vi + 1, vi + 2, vi + 3, vi + 1, vi + 3, vi);
          }
          target.count += 4;
        }
      }
    }
  }

  return {
    opaque: {
      verts: new Float32Array(opaque.verts),
      indices: new Uint32Array(opaque.indices),
    },
    water: {
      verts: new Float32Array(water.verts),
      indices: new Uint32Array(water.indices),
    },
    lava: {
      verts: new Float32Array(lava.verts),
      indices: new Uint32Array(lava.indices),
    },
  };
}
