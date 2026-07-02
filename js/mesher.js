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
      for (let y = CHUNK_H - 1; y >= 0; y--) {
        const i = lIdx(rx, y, rz);
        const id = lightBlocks[i];
        if (OPAQUE_LUT[id]) break;
        // 水中はスカイライトを減衰させる (2/ブロック)
        lightSky[i] = 15;
        lightQueue[tail++] = i;
        if (id === B.WATER) {
          // 水面から下は別途減衰伝播に任せる
          for (let wy = y, l = 15; wy >= 0; wy--) {
            const wi = lIdx(rx, wy, rz);
            const wid = lightBlocks[wi];
            if (OPAQUE_LUT[wid]) break;
            lightSky[wi] = l;
            lightQueue[tail++] = wi;
            if (wid === B.WATER) l = Math.max(l - 2, 0);
          }
          break;
        }
      }
    }
  }

  // --- 発光ブロック ---
  const blkQueue = [];
  for (let i = 0; i < L_CELLS; i++) {
    if (EMISSIVE_LUT[lightBlocks[i]]) {
      lightBlk[i] = 15;
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
              opaque.verts.push(q[ci][0], q[ci][1], q[ci][2],
                quadUV[ci][0], quadUV[ci][1], 0.95, sky, blk);
            }
            // 両面 (表裏の三角形を両方積む)
            opaque.indices.push(vi, vi + 1, vi + 2, vi, vi + 2, vi + 3);
            opaque.indices.push(vi + 2, vi + 1, vi, vi + 3, vi + 2, vi);
            opaque.count += 4;
          }
          continue;
        }

        const isWater = id === B.WATER;
        const target = isWater ? water : opaque;
        // 水面: 上が空気なら少し低くして水面らしく
        const topOffset = (isWater && getNb(lx, y + 1, lz) !== B.WATER) ? -0.125 : 0;

        for (let f = 0; f < 6; f++) {
          const face = FACES[f];
          const [dx, dy, dz] = face.dir;
          const nbId = getNb(lx + dx, y + dy, lz + dz);
          if (!shouldDrawFace(id, nbId)) continue;
          // 水中から見た水側面は省略 (上面のみ描く)
          if (isWater && f !== 2 && nbId !== B.AIR && !BLOCKS[nbId].opaque) continue;

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

          // 頂点を追加
          const vi = target.count;
          for (let ci = 0; ci < 4; ci++) {
            const c = face.corners[ci];
            const cy = c[1] === 1 ? 1 + topOffset : 0;
            target.verts.push(
              ox + lx + c[0],
              y + cy,
              oz + lz + c[2],
              lerp(uv.u0, uv.u1, face.uvs[ci][0]),
              lerp(uv.v0, uv.v1, face.uvs[ci][1]),
              shades[ci],
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
  };
}
