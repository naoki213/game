// ---------------------------------------------------------------
// 最小限の行列 / ベクトルユーティリティ (列優先, WebGL 互換)
// ---------------------------------------------------------------
"use strict";

const Mat4 = {
  create() {
    const m = new Float32Array(16);
    m[0] = m[5] = m[10] = m[15] = 1;
    return m;
  },

  perspective(out, fovy, aspect, near, far) {
    const f = 1.0 / Math.tan(fovy / 2);
    out.fill(0);
    out[0] = f / aspect;
    out[5] = f;
    out[10] = (far + near) / (near - far);
    out[11] = -1;
    out[14] = (2 * far * near) / (near - far);
    return out;
  },

  // カメラ位置 + 前方 / 上ベクトルからビュー行列を作る
  lookDir(out, eye, forward, up) {
    // z 軸 = -forward
    let zx = -forward[0], zy = -forward[1], zz = -forward[2];
    let len = Math.hypot(zx, zy, zz);
    zx /= len; zy /= len; zz /= len;

    // x 軸 = up × z
    let xx = up[1] * zz - up[2] * zy;
    let xy = up[2] * zx - up[0] * zz;
    let xz = up[0] * zy - up[1] * zx;
    len = Math.hypot(xx, xy, xz);
    xx /= len; xy /= len; xz /= len;

    // y 軸 = z × x
    const yx = zy * xz - zz * xy;
    const yy = zz * xx - zx * xz;
    const yz = zx * xy - zy * xx;

    out[0] = xx; out[1] = yx; out[2] = zx; out[3] = 0;
    out[4] = xy; out[5] = yy; out[6] = zy; out[7] = 0;
    out[8] = xz; out[9] = yz; out[10] = zz; out[11] = 0;
    out[12] = -(xx * eye[0] + xy * eye[1] + xz * eye[2]);
    out[13] = -(yx * eye[0] + yy * eye[1] + yz * eye[2]);
    out[14] = -(zx * eye[0] + zy * eye[1] + zz * eye[2]);
    out[15] = 1;
    return out;
  },

  multiply(out, a, b) {
    const a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3];
    const a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7];
    const a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11];
    const a30 = a[12], a31 = a[13], a32 = a[14], a33 = a[15];

    for (let i = 0; i < 4; i++) {
      const b0 = b[i * 4], b1 = b[i * 4 + 1], b2 = b[i * 4 + 2], b3 = b[i * 4 + 3];
      out[i * 4] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
      out[i * 4 + 1] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
      out[i * 4 + 2] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
      out[i * 4 + 3] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;
    }
    return out;
  },
};

Mat4.translation = function (out, x, y, z) {
  out.fill(0);
  out[0] = out[5] = out[10] = out[15] = 1;
  out[12] = x; out[13] = y; out[14] = z;
  return out;
};

Mat4.rotationX = function (out, a) {
  const c = Math.cos(a), s = Math.sin(a);
  out.fill(0);
  out[0] = 1; out[15] = 1;
  out[5] = c; out[6] = s;
  out[9] = -s; out[10] = c;
  return out;
};

Mat4.rotationY = function (out, a) {
  const c = Math.cos(a), s = Math.sin(a);
  out.fill(0);
  out[5] = 1; out[15] = 1;
  out[0] = c; out[2] = -s;
  out[8] = s; out[10] = c;
  return out;
};

Mat4.scaling = function (out, s) {
  out.fill(0);
  out[0] = out[5] = out[10] = s;
  out[15] = 1;
  return out;
};

// ビュー射影行列から視錐台の 6 平面を抽出する (Gribb-Hartmann 法)
function extractFrustumPlanes(m, planes) {
  // planes: Float32Array(24) — 各平面 [a,b,c,d]
  const rows = [
    [m[3] + m[0], m[7] + m[4], m[11] + m[8], m[15] + m[12]],   // left
    [m[3] - m[0], m[7] - m[4], m[11] - m[8], m[15] - m[12]],   // right
    [m[3] + m[1], m[7] + m[5], m[11] + m[9], m[15] + m[13]],   // bottom
    [m[3] - m[1], m[7] - m[5], m[11] - m[9], m[15] - m[13]],   // top
    [m[3] + m[2], m[7] + m[6], m[11] + m[10], m[15] + m[14]],  // near
    [m[3] - m[2], m[7] - m[6], m[11] - m[10], m[15] - m[14]],  // far
  ];
  for (let i = 0; i < 6; i++) {
    const [a, b, c, d] = rows[i];
    const inv = 1 / Math.hypot(a, b, c);
    planes[i * 4] = a * inv;
    planes[i * 4 + 1] = b * inv;
    planes[i * 4 + 2] = c * inv;
    planes[i * 4 + 3] = d * inv;
  }
  return planes;
}

// 球が視錐台内 (一部でも) にあるか
function sphereInFrustum(planes, x, y, z, radius) {
  for (let i = 0; i < 6; i++) {
    const d = planes[i * 4] * x + planes[i * 4 + 1] * y + planes[i * 4 + 2] * z + planes[i * 4 + 3];
    if (d < -radius) return false;
  }
  return true;
}

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function smoothstep(a, b, t) {
  t = clamp((t - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}
