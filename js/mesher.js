// ---------------------------------------------------------------
// チャンクメッシュ生成: 隣接面カリング + 頂点 AO
// 頂点フォーマット: [x, y, z, u, v, light] (float x6)
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

// チャンクのメッシュを構築。{ opaque, water } の各 Float32Array/インデックスを返す
function buildChunkMesh(world, chunk) {
  const ox = chunk.cx * CHUNK_SIZE;
  const oz = chunk.cz * CHUNK_SIZE;

  const opaque = { verts: [], indices: [], count: 0 };
  const water = { verts: [], indices: [], count: 0 };

  const data = chunk.data;

  // 隣接ブロック取得 (チャンク内は高速パス)
  function getNb(lx, y, lz) {
    if (y < 0) return B.BEDROCK;
    if (y >= CHUNK_H) return B.AIR;
    if (lx >= 0 && lx < 16 && lz >= 0 && lz < 16) {
      return data[(y << 8) | (lz << 4) | lx];
    }
    return world.getBlock(ox + lx, y, oz + lz);
  }

  const opaqueNb = (lx, y, lz) => isOpaque(getNb(lx, y, lz));

  for (let y = 0; y < CHUNK_H; y++) {
    for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        const id = data[(y << 8) | (lz << 4) | lx];
        if (id === B.AIR) continue;

        const block = BLOCKS[id];
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

          // 面法線方向の隣接セル基準で AO を計算
          const nx = lx + dx, ny = y + dy, nz = lz + dz;
          // 面平面内の接線軸 (dir 以外の 2 軸)
          const axis = dx !== 0 ? 0 : dy !== 0 ? 1 : 2;
          const t1 = axis === 0 ? 1 : 0;          // 接線軸 1
          const t2 = axis === 2 ? 1 : 2;          // 接線軸 2

          const aos = new Array(4);
          const lights = new Array(4);
          for (let ci = 0; ci < 4; ci++) {
            const c = face.corners[ci];
            let ao = 3;
            if (!block.emissive && !isWater) {
              // 角の座標 (0/1) から接線方向のオフセット (±1)
              const o1 = c[t1] === 1 ? 1 : -1;
              const o2 = c[t2] === 1 ? 1 : -1;
              const p1 = [nx, ny, nz]; p1[t1] += o1;
              const p2 = [nx, ny, nz]; p2[t2] += o2;
              const pc = [nx, ny, nz]; pc[t1] += o1; pc[t2] += o2;
              const s1 = opaqueNb(p1[0], p1[1], p1[2]) ? 1 : 0;
              const s2 = opaqueNb(p2[0], p2[1], p2[2]) ? 1 : 0;
              const cc = opaqueNb(pc[0], pc[1], pc[2]) ? 1 : 0;
              ao = vertexAO(s1, s2, cc);
            }
            aos[ci] = ao;
            lights[ci] = baseShade * AO_FACTOR[ao];
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
              lights[ci]
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
