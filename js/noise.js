// ---------------------------------------------------------------
// シード付き乱数 + 改良パーリンノイズ (2D / 3D) + fBm
// ---------------------------------------------------------------
"use strict";

// mulberry32: 高速なシード付き PRNG
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 座標ベースの決定的ハッシュ (0..1) — 木や鉱石の配置に使う
function hash2(x, z, seed) {
  let h = Math.imul(x, 374761393) + Math.imul(z, 668265263) + Math.imul(seed, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

function hash3(x, y, z, seed) {
  let h = Math.imul(x, 374761393) + Math.imul(y, 3266489917) +
          Math.imul(z, 668265263) + Math.imul(seed, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

class Perlin {
  constructor(seed) {
    const rand = mulberry32(seed);
    const p = new Uint8Array(256);
    for (let i = 0; i < 256; i++) p[i] = i;
    // Fisher–Yates シャッフル
    for (let i = 255; i > 0; i--) {
      const j = (rand() * (i + 1)) | 0;
      const t = p[i]; p[i] = p[j]; p[j] = t;
    }
    this.perm = new Uint8Array(512);
    for (let i = 0; i < 512; i++) this.perm[i] = p[i & 255];
  }

  static fade(t) { return t * t * t * (t * (t * 6 - 15) + 10); }

  static grad2(h, x, y) {
    switch (h & 7) {
      case 0: return x + y;
      case 1: return -x + y;
      case 2: return x - y;
      case 3: return -x - y;
      case 4: return x;
      case 5: return -x;
      case 6: return y;
      default: return -y;
    }
  }

  static grad3(h, x, y, z) {
    const g = h & 15;
    const u = g < 8 ? x : y;
    const v = g < 4 ? y : (g === 12 || g === 14 ? x : z);
    return ((g & 1) === 0 ? u : -u) + ((g & 2) === 0 ? v : -v);
  }

  // 2D パーリンノイズ, 出力はおよそ [-1, 1]
  noise2(x, y) {
    const X = Math.floor(x) & 255;
    const Y = Math.floor(y) & 255;
    x -= Math.floor(x);
    y -= Math.floor(y);
    const u = Perlin.fade(x);
    const v = Perlin.fade(y);
    const p = this.perm;
    const a = p[X] + Y, b = p[X + 1] + Y;
    return lerp(
      lerp(Perlin.grad2(p[a], x, y), Perlin.grad2(p[b], x - 1, y), u),
      lerp(Perlin.grad2(p[a + 1], x, y - 1), Perlin.grad2(p[b + 1], x - 1, y - 1), u),
      v
    );
  }

  // 3D パーリンノイズ, 出力はおよそ [-1, 1]
  noise3(x, y, z) {
    const X = Math.floor(x) & 255;
    const Y = Math.floor(y) & 255;
    const Z = Math.floor(z) & 255;
    x -= Math.floor(x);
    y -= Math.floor(y);
    z -= Math.floor(z);
    const u = Perlin.fade(x);
    const v = Perlin.fade(y);
    const w = Perlin.fade(z);
    const p = this.perm;
    const A = p[X] + Y, AA = p[A] + Z, AB = p[A + 1] + Z;
    const B = p[X + 1] + Y, BA = p[B] + Z, BB = p[B + 1] + Z;
    return lerp(
      lerp(
        lerp(Perlin.grad3(p[AA], x, y, z), Perlin.grad3(p[BA], x - 1, y, z), u),
        lerp(Perlin.grad3(p[AB], x, y - 1, z), Perlin.grad3(p[BB], x - 1, y - 1, z), u),
        v
      ),
      lerp(
        lerp(Perlin.grad3(p[AA + 1], x, y, z - 1), Perlin.grad3(p[BA + 1], x - 1, y, z - 1), u),
        lerp(Perlin.grad3(p[AB + 1], x, y - 1, z - 1), Perlin.grad3(p[BB + 1], x - 1, y - 1, z - 1), u),
        v
      ),
      w
    );
  }

  // フラクタルブラウン運動 (オクターブ合成), 出力はおよそ [-1, 1]
  fbm2(x, y, octaves, lacunarity = 2.0, gain = 0.5) {
    let sum = 0, amp = 1, freq = 1, norm = 0;
    for (let i = 0; i < octaves; i++) {
      sum += this.noise2(x * freq, y * freq) * amp;
      norm += amp;
      amp *= gain;
      freq *= lacunarity;
    }
    return sum / norm;
  }
}
