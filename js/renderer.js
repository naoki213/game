// ---------------------------------------------------------------
// WebGL レンダラ: ワールド / 空 / 雲 / ブロックハイライト
// ---------------------------------------------------------------
"use strict";

const WORLD_VS = `
precision mediump float;
attribute vec3 aPos;
attribute vec2 aUV;
attribute float aShade;   // AOシェード + 法線インデックス*4 をパック
attribute float aSky;
attribute float aBlock;
uniform mat4 uMVP;
uniform vec3 uCamPos;
uniform vec3 uSunDir;
uniform float uDaylight;
uniform float uWave;      // 1 = 水 (波アニメーション)
uniform float uTime;
varying vec2 vUV;
varying float vLight;
varying float vWarm;
varying float vSkyShare;  // 光のうちスカイライト由来の割合 (太陽の色温度用)
varying float vDist;
varying vec3 vWorldPos;
void main() {
  vec3 pos = aPos;

  // aShade から法線インデックスと AO シェードを取り出す
  float idx = floor(aShade * 0.25 + 0.001);
  float shade = aShade - idx * 4.0;

  // 水面の波
  if (uWave > 0.5) {
    pos.y += sin(pos.x * 1.1 + uTime * 1.8) * 0.045
           + cos(pos.z * 0.9 + uTime * 1.4) * 0.045;
  }
  // 草花の先端: 根元は揺れず, 先端だけそよ風でなびく (idx 7 = 植生の先端)
  if (idx > 6.5) {
    float sway = sin(uTime * 1.6 + pos.x * 0.7 + pos.z * 0.7) * 0.09;
    pos.x += sway;
    pos.z += sway * 0.6;
  }
  gl_Position = uMVP * vec4(pos, 1.0);
  vUV = aUV;
  vWorldPos = pos;

  // 面の法線 (idx 6/7 = 植生など方向なし)
  vec3 N = vec3(0.0);
  if (idx < 0.5) N = vec3(1.0, 0.0, 0.0);
  else if (idx < 1.5) N = vec3(-1.0, 0.0, 0.0);
  else if (idx < 2.5) N = vec3(0.0, 1.0, 0.0);
  else if (idx < 3.5) N = vec3(0.0, -1.0, 0.0);
  else if (idx < 4.5) N = vec3(0.0, 0.0, 1.0);
  else if (idx < 5.5) N = vec3(0.0, 0.0, -1.0);

  // 太陽方向のディレクショナルライト (影MOD風の面ごとの陰影)
  float diff = idx > 5.5 ? 0.55 : max(dot(N, uSunDir), 0.0);
  float direct = 0.5 + 0.62 * diff;

  float dayFactor = mix(0.13, 1.0, uDaylight);
  float skyTerm = aSky * dayFactor * direct;
  float br = max(max(skyTerm, aBlock), 0.045);
  vLight = shade * br;
  vSkyShare = skyTerm / max(skyTerm + aBlock, 0.001);
  vWarm = clamp(aBlock - skyTerm, 0.0, 1.0);
  vDist = distance(pos.xz, uCamPos.xz);
}`;

const WORLD_FS = `
precision mediump float;
uniform sampler2D uTex;
uniform vec3 uFogColor;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec3 uCamPos;
uniform float uFogStart;
uniform float uFogEnd;
uniform float uDaylight;
uniform float uAlpha;
uniform float uWave;
uniform float uTime;
varying vec2 vUV;
varying float vLight;
varying float vWarm;
varying float vSkyShare;
varying float vDist;
varying vec3 vWorldPos;
void main() {
  vec4 tex = texture2D(uTex, vUV);
  if (uAlpha >= 1.0 && tex.a < 0.5) discard;

  // 夜は青く, 発光ブロックの近くは暖色, 太陽光は色温度つき
  vec3 nightTint = mix(vec3(0.8, 0.88, 1.2), vec3(1.0), uDaylight);
  vec3 tint = mix(nightTint, vec3(1.15, 1.0, 0.8), vWarm);
  tint *= mix(vec3(1.0), uSunColor, vSkyShare);
  vec3 col = tex.rgb * vLight * tint;
  float alpha = tex.a * uAlpha;

  // 水: 太陽の鏡面反射 + フレネルで角度により透け方が変わる
  if (uWave > 0.5) {
    vec3 V = normalize(uCamPos - vWorldPos);
    vec3 N = normalize(vec3(
      sin(vWorldPos.x * 1.4 + uTime * 1.9) * 0.10,
      1.0,
      cos(vWorldPos.z * 1.2 + uTime * 1.5) * 0.10));
    float spec = pow(max(dot(reflect(-uSunDir, N), V), 0.0), 90.0);
    col += vec3(1.0, 0.95, 0.8) * spec * 1.2 * uDaylight;
    float fres = pow(1.0 - max(dot(V, N), 0.0), 2.5);
    alpha = uAlpha * mix(0.82, 1.5, fres);
    alpha = min(alpha, 0.95);
    // 空の色を少し映り込ませる
    col = mix(col, uFogColor * 1.1, fres * 0.45 * uDaylight);
  }

  // フォグ + 太陽方向の大気散乱 (夕日が霞に滲む)
  vec3 viewDir = normalize(vWorldPos - uCamPos);
  float sunAmt = pow(max(dot(viewDir, uSunDir), 0.0), 10.0);
  vec3 fogCol = mix(uFogColor, vec3(1.0, 0.75, 0.5), sunAmt * 0.65 * uDaylight);
  float fog = clamp((vDist - uFogStart) / (uFogEnd - uFogStart), 0.0, 1.0);
  col = mix(col, fogCol, fog * fog);

  // 軽いトーンマッピング (コントラストと彩度をわずかに強調)
  col = col * 1.06 - 0.015;
  float grey = dot(col, vec3(0.299, 0.587, 0.114));
  col = mix(vec3(grey), col, 1.08);

  gl_FragColor = vec4(col, alpha);
}`;

const SKY_VS = `
attribute vec2 aPos;
uniform vec3 uForward;
uniform vec3 uRight;
uniform vec3 uUp;
varying vec3 vRay;
void main() {
  gl_Position = vec4(aPos, 0.9999, 1.0);
  vRay = uForward + aPos.x * uRight + aPos.y * uUp;
}`;

const SKY_FS = `
precision mediump float;
uniform vec3 uZenith;
uniform vec3 uHorizon;
uniform vec3 uSunDir;
uniform float uDaylight;
varying vec3 vRay;

float hash(vec3 p) {
  p = fract(p * 0.3183099 + 0.1);
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}

void main() {
  vec3 r = normalize(vRay);
  float t = pow(max(r.y, 0.0), 0.55);
  vec3 col = mix(uHorizon, uZenith, t);
  if (r.y < 0.0) col = mix(uHorizon, uHorizon * 0.35, min(-r.y * 3.0, 1.0));

  // 太陽
  float sd = dot(r, uSunDir);
  col += vec3(1.0, 0.85, 0.55) * smoothstep(0.9990, 0.9996, sd);
  col += vec3(1.0, 0.6, 0.3) * pow(max(sd, 0.0), 160.0) * 0.5 * uDaylight;

  // 月
  float md = dot(r, -uSunDir);
  col += vec3(0.85, 0.9, 1.0) * smoothstep(0.9995, 0.9998, md) * 0.9;

  // 星 (夜のみ)
  if (uDaylight < 0.35 && r.y > 0.02) {
    vec3 cell = floor(r * 160.0);
    float star = step(0.9975, hash(cell));
    float tw = 0.6 + 0.4 * hash(cell + 7.0);
    col += vec3(star * tw) * (1.0 - uDaylight / 0.35);
  }

  gl_FragColor = vec4(col, 1.0);
}`;

const POINT_VS = `
attribute vec3 aPos;
attribute vec3 aCol;
uniform mat4 uMVP;
uniform float uPointScale;
varying vec3 vCol;
void main() {
  gl_Position = uMVP * vec4(aPos, 1.0);
  gl_PointSize = clamp(uPointScale / max(gl_Position.w, 0.1), 2.0, 14.0);
  vCol = aCol;
}`;

const POINT_FS = `
precision mediump float;
uniform float uLight;
varying vec3 vCol;
void main() {
  gl_FragColor = vec4(vCol * uLight, 1.0);
}`;

const SHADOW_VS = `
attribute vec3 aPos;
attribute vec2 aUV;
attribute float aAlpha;
uniform mat4 uMVP;
varying vec2 vUV;
varying float vAlpha;
void main() {
  gl_Position = uMVP * vec4(aPos, 1.0);
  vUV = aUV;
  vAlpha = aAlpha;
}`;

const SHADOW_FS = `
precision mediump float;
varying vec2 vUV;
varying float vAlpha;
void main() {
  float d = length(vUV);
  if (d > 1.0) discard;
  float a = (1.0 - d * d) * vAlpha;
  gl_FragColor = vec4(0.0, 0.0, 0.0, a * 0.45);
}`;

const COLOR_VS = `
attribute vec3 aPos;
uniform mat4 uMVP;
uniform vec3 uOffset;
void main() {
  gl_Position = uMVP * vec4(aPos + uOffset, 1.0);
}`;

const COLOR_FS = `
precision mediump float;
uniform vec4 uColor;
void main() {
  gl_FragColor = uColor;
}`;

class Renderer {
  constructor(canvas, atlasCanvas) {
    this.canvas = canvas;
    const gl = canvas.getContext("webgl", { antialias: false, alpha: false });
    if (!gl) throw new Error("WebGL に対応していません");
    this.gl = gl;

    this.uint32Ext = gl.getExtension("OES_element_index_uint");
    if (!this.uint32Ext) console.warn("OES_element_index_uint が使えません");

    // --- プログラム ---
    this.progWorld = this.createProgram(WORLD_VS, WORLD_FS);
    this.progSky = this.createProgram(SKY_VS, SKY_FS);
    this.progColor = this.createProgram(COLOR_VS, COLOR_FS);
    this.progPoint = this.createProgram(POINT_VS, POINT_FS);
    this.progShadow = this.createProgram(SHADOW_VS, SHADOW_FS);

    // パーティクル用の動的バッファ
    this.particleBuf = gl.createBuffer();
    this.entityBuf = gl.createBuffer();
    this.shadowBuf = gl.createBuffer();

    // --- テクスチャアトラス ---
    this.atlas = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.atlas);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, atlasCanvas);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    // --- 空 (フルスクリーンクアッド) ---
    this.skyBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.skyBuf);
    gl.bufferData(gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, 1, -1, 1, 1, -1, 1]), gl.STATIC_DRAW);

    // --- ブロックハイライト (単位立方体の 12 辺) ---
    const e = 0.002; // 面とちらつかないよう少し外側へ
    const lo = -e, hi = 1 + e;
    const C = [
      [lo, lo, lo], [hi, lo, lo], [hi, lo, hi], [lo, lo, hi],
      [lo, hi, lo], [hi, hi, lo], [hi, hi, hi], [lo, hi, hi],
    ];
    const edges = [0,1,1,2,2,3,3,0, 4,5,5,6,6,7,7,4, 0,4,1,5,2,6,3,7];
    const lineVerts = [];
    for (const i of edges) lineVerts.push(...C[i]);
    this.highlightBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.highlightBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(lineVerts), gl.STATIC_DRAW);
    this.highlightCount = edges.length;

    // --- 雲メッシュ (静的な板ポリの集合, uOffset で流す) ---
    this.buildClouds();

    // 行列と視錐台
    this.proj = Mat4.create();
    this.view = Mat4.create();
    this.mvp = Mat4.create();
    this.frustum = new Float32Array(24);
    this.tmpA = Mat4.create();
    this.tmpB = Mat4.create();
    this.tmpC = Mat4.create();

    // 手持ちブロックのメッシュキャッシュ (blockId -> {vbo, ibo, count})
    this.heldMeshes = new Map();
    // ひび割れ段階ごとのメッシュキャッシュ
    this.crackMeshes = new Map();

    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);
    gl.frontFace(gl.CCW);
  }

  createProgram(vsSrc, fsSrc) {
    const gl = this.gl;
    const compile = (type, src) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        throw new Error("シェーダのコンパイル失敗: " + gl.getShaderInfoLog(s));
      }
      return s;
    };
    const prog = gl.createProgram();
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, vsSrc));
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, fsSrc));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      throw new Error("シェーダのリンク失敗: " + gl.getProgramInfoLog(prog));
    }
    // attribute / uniform の位置をキャッシュ
    const info = { prog, attribs: {}, uniforms: {} };
    const nAttr = gl.getProgramParameter(prog, gl.ACTIVE_ATTRIBUTES);
    for (let i = 0; i < nAttr; i++) {
      const a = gl.getActiveAttrib(prog, i);
      info.attribs[a.name] = gl.getAttribLocation(prog, a.name);
    }
    const nUni = gl.getProgramParameter(prog, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < nUni; i++) {
      const u = gl.getActiveUniform(prog, i);
      info.uniforms[u.name] = gl.getUniformLocation(prog, u.name);
    }
    return info;
  }

  buildClouds() {
    const gl = this.gl;
    const noise = new Perlin(1234567);
    const verts = [];
    const GRID = 36, CELL = 14, Y = 92;
    const half = (GRID * CELL) / 2;
    for (let gz = 0; gz < GRID; gz++) {
      for (let gx = 0; gx < GRID; gx++) {
        const n = noise.fbm2(gx * 0.18, gz * 0.18, 3);
        if (n < 0.18) continue;
        const x0 = gx * CELL - half, z0 = gz * CELL - half;
        const x1 = x0 + CELL, z1 = z0 + CELL;
        verts.push(
          x0, Y, z0, x0, Y, z1, x1, Y, z1,
          x0, Y, z0, x1, Y, z1, x1, Y, z0,
        );
      }
    }
    this.cloudBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.cloudBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(verts), gl.STATIC_DRAW);
    this.cloudCount = verts.length / 3;
    this.cloudSpan = GRID * CELL;
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.floor(this.canvas.clientWidth * dpr);
    const h = Math.floor(this.canvas.clientHeight * dpr);
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    this.gl.viewport(0, 0, w, h);
    this.aspect = w / Math.max(h, 1);
  }

  // チャンクメッシュを GPU に転送
  uploadChunkMesh(chunk, meshData) {
    const gl = this.gl;
    if (chunk.mesh) this.deleteChunkMesh(chunk);

    const make = (data) => {
      if (data.indices.length === 0) return null;
      const vbo = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
      gl.bufferData(gl.ARRAY_BUFFER, data.verts, gl.STATIC_DRAW);
      const ibo = gl.createBuffer();
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, data.indices, gl.STATIC_DRAW);
      return { vbo, ibo, count: data.indices.length };
    };

    chunk.mesh = {
      opaque: make(meshData.opaque),
      water: make(meshData.water),
    };
  }

  deleteChunkMesh(chunk) {
    const gl = this.gl;
    if (!chunk.mesh) return;
    for (const part of ["opaque", "water"]) {
      const m = chunk.mesh[part];
      if (m) {
        gl.deleteBuffer(m.vbo);
        gl.deleteBuffer(m.ibo);
      }
    }
    chunk.mesh = null;
  }

  bindWorldAttribs(vbo) {
    const gl = this.gl;
    const a = this.progWorld.attribs;
    const stride = 32; // 8 floats: pos3 + uv2 + shade + sky + block
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.enableVertexAttribArray(a.aPos);
    gl.vertexAttribPointer(a.aPos, 3, gl.FLOAT, false, stride, 0);
    gl.enableVertexAttribArray(a.aUV);
    gl.vertexAttribPointer(a.aUV, 2, gl.FLOAT, false, stride, 12);
    gl.enableVertexAttribArray(a.aShade);
    gl.vertexAttribPointer(a.aShade, 1, gl.FLOAT, false, stride, 20);
    gl.enableVertexAttribArray(a.aSky);
    gl.vertexAttribPointer(a.aSky, 1, gl.FLOAT, false, stride, 24);
    gl.enableVertexAttribArray(a.aBlock);
    gl.vertexAttribPointer(a.aBlock, 1, gl.FLOAT, false, stride, 28);
  }

  // メインの描画
  render(state) {
    const gl = this.gl;
    const { camPos, forward, chunks, env, fov, highlight, time } = state;

    this.resize();

    // --- 行列 ---
    Mat4.perspective(this.proj, fov, this.aspect, 0.1, 1000);
    Mat4.lookDir(this.view, camPos, forward, [0, 1, 0]);
    Mat4.multiply(this.mvp, this.proj, this.view);
    extractFrustumPlanes(this.mvp, this.frustum);

    gl.clearColor(env.fog[0], env.fog[1], env.fog[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    // --- 空 ---
    this.drawSky(forward, env);

    // --- 不透明パス ---
    const pw = this.progWorld;
    gl.useProgram(pw.prog);
    gl.uniformMatrix4fv(pw.uniforms.uMVP, false, this.mvp);
    gl.uniform3fv(pw.uniforms.uCamPos, camPos);
    gl.uniform3fv(pw.uniforms.uFogColor, env.fog);
    gl.uniform3fv(pw.uniforms.uSunDir, env.sunDir);
    gl.uniform3fv(pw.uniforms.uSunColor, env.sunColor || [1, 1, 1]);
    gl.uniform1f(pw.uniforms.uFogStart, env.fogStart);
    gl.uniform1f(pw.uniforms.uFogEnd, env.fogEnd);
    gl.uniform1f(pw.uniforms.uDaylight, env.daylight);
    gl.uniform1f(pw.uniforms.uAlpha, 1.0);
    gl.uniform1f(pw.uniforms.uWave, 0);
    gl.uniform1f(pw.uniforms.uTime, time);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.atlas);
    gl.uniform1i(pw.uniforms.uTex, 0);

    const R = CHUNK_SIZE / 2;
    const chunkRadius = Math.hypot(R, CHUNK_H / 2, R);
    const visible = [];
    for (const chunk of chunks) {
      if (!chunk.mesh) continue;
      const cx = chunk.cx * CHUNK_SIZE + R;
      const cz = chunk.cz * CHUNK_SIZE + R;
      if (!sphereInFrustum(this.frustum, cx, CHUNK_H / 2, cz, chunkRadius)) continue;
      visible.push(chunk);
    }

    gl.disable(gl.BLEND);
    let drawCalls = 0;
    for (const chunk of visible) {
      const m = chunk.mesh.opaque;
      if (!m) continue;
      this.bindWorldAttribs(m.vbo);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, m.ibo);
      gl.drawElements(gl.TRIANGLES, m.count, gl.UNSIGNED_INT, 0);
      drawCalls++;
    }

    // --- 接地シャドウ (プレイヤー / モブの足元に落ちる柔らかい影) ---
    if (state.shadows && state.shadows.length > 0) {
      const ps = this.progShadow;
      gl.useProgram(ps.prog);
      gl.uniformMatrix4fv(ps.uniforms.uMVP, false, this.mvp);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.disable(gl.CULL_FACE);
      gl.depthMask(false);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.shadowBuf);
      gl.bufferData(gl.ARRAY_BUFFER, state.shadows, gl.DYNAMIC_DRAW);
      gl.enableVertexAttribArray(ps.attribs.aPos);
      gl.vertexAttribPointer(ps.attribs.aPos, 3, gl.FLOAT, false, 24, 0);
      gl.enableVertexAttribArray(ps.attribs.aUV);
      gl.vertexAttribPointer(ps.attribs.aUV, 2, gl.FLOAT, false, 24, 12);
      gl.enableVertexAttribArray(ps.attribs.aAlpha);
      gl.vertexAttribPointer(ps.attribs.aAlpha, 1, gl.FLOAT, false, 24, 20);
      gl.drawArrays(gl.TRIANGLES, 0, state.shadows.length / 6);
      gl.depthMask(true);
      gl.disable(gl.BLEND);
      gl.enable(gl.CULL_FACE);
      gl.useProgram(pw.prog);
    }

    // --- 破壊ひび割れ (対象ブロックに重ねる) ---
    if (state.crack) {
      this.drawCrack(state.crack.pos, state.crack.stage);
    }

    // --- アイテムドロップ (回転するミニブロック) ---
    if (state.items && state.items.length > 0) {
      this.drawItemDrops(state.items, camPos, time);
    }

    // --- エンティティ (動物モブ) ---
    if (state.entities && state.entities.length > 0) {
      const pp = this.progPoint;
      gl.useProgram(pp.prog);
      gl.disable(gl.CULL_FACE); // ボックスの面順は保証しないため両面描画
      gl.uniformMatrix4fv(pp.uniforms.uMVP, false, this.mvp);
      gl.uniform1f(pp.uniforms.uPointScale, 1);
      gl.uniform1f(pp.uniforms.uLight, lerp(0.22, 1.0, env.daylight));
      gl.bindBuffer(gl.ARRAY_BUFFER, this.entityBuf);
      gl.bufferData(gl.ARRAY_BUFFER, state.entities, gl.DYNAMIC_DRAW);
      gl.enableVertexAttribArray(pp.attribs.aPos);
      gl.vertexAttribPointer(pp.attribs.aPos, 3, gl.FLOAT, false, 24, 0);
      gl.enableVertexAttribArray(pp.attribs.aCol);
      gl.vertexAttribPointer(pp.attribs.aCol, 3, gl.FLOAT, false, 24, 12);
      gl.drawArrays(gl.TRIANGLES, 0, state.entities.length / 6);
      gl.enable(gl.CULL_FACE);
      gl.useProgram(pw.prog);
    }

    // --- 水パス (半透明, 奥から手前へ) ---
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.uniform1f(pw.uniforms.uAlpha, 0.62);
    gl.uniform1f(pw.uniforms.uWave, 1);
    gl.disable(gl.CULL_FACE); // 水面は下からも見えるように
    for (let i = visible.length - 1; i >= 0; i--) {
      const m = visible[i].mesh.water;
      if (!m) continue;
      this.bindWorldAttribs(m.vbo);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, m.ibo);
      gl.drawElements(gl.TRIANGLES, m.count, gl.UNSIGNED_INT, 0);
      drawCalls++;
    }
    gl.uniform1f(pw.uniforms.uWave, 0);
    gl.enable(gl.CULL_FACE);

    // --- 破壊パーティクル (点スプライト) ---
    if (state.particles && state.particles.count > 0) {
      const pp = this.progPoint;
      gl.useProgram(pp.prog);
      gl.disable(gl.BLEND);
      gl.uniformMatrix4fv(pp.uniforms.uMVP, false, this.mvp);
      gl.uniform1f(pp.uniforms.uPointScale, this.canvas.height * 0.08);
      gl.uniform1f(pp.uniforms.uLight, lerp(0.25, 1.0, env.daylight));
      gl.bindBuffer(gl.ARRAY_BUFFER, this.particleBuf);
      gl.bufferData(gl.ARRAY_BUFFER,
        state.particles.data.subarray(0, state.particles.count * 6), gl.DYNAMIC_DRAW);
      gl.enableVertexAttribArray(pp.attribs.aPos);
      gl.vertexAttribPointer(pp.attribs.aPos, 3, gl.FLOAT, false, 24, 0);
      gl.enableVertexAttribArray(pp.attribs.aCol);
      gl.vertexAttribPointer(pp.attribs.aCol, 3, gl.FLOAT, false, 24, 12);
      gl.drawArrays(gl.POINTS, 0, state.particles.count);
      gl.enable(gl.BLEND);
    }

    // --- ブロックハイライト ---
    if (highlight) {
      const pc = this.progColor;
      gl.useProgram(pc.prog);
      gl.uniformMatrix4fv(pc.uniforms.uMVP, false, this.mvp);
      gl.uniform3f(pc.uniforms.uOffset, highlight[0], highlight[1], highlight[2]);
      gl.uniform4f(pc.uniforms.uColor, 0, 0, 0, 0.7);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.highlightBuf);
      gl.enableVertexAttribArray(pc.attribs.aPos);
      gl.vertexAttribPointer(pc.attribs.aPos, 3, gl.FLOAT, false, 0, 0);
      gl.drawArrays(gl.LINES, 0, this.highlightCount);
    }

    // --- 雲 (ジ・エンドには存在しない) ---
    if (!env.noClouds) this.drawClouds(camPos, env, time);

    // --- 手持ちブロック ---
    if (state.held) {
      this.drawHeldItem(state.held.id, env, state.held.swing);
    }

    gl.disable(gl.BLEND);
    return drawCalls;
  }

  // ---------------- 破壊ひび割れ ----------------

  getCrackMesh(stage) {
    let mesh = this.crackMeshes.get(stage);
    if (mesh) return mesh;

    const gl = this.gl;
    const uv = tileUV(TILE.CRACK_0 + stage);
    const verts = [];
    const indices = [];
    let count = 0;
    const e = 0.004; // Z ファイティング防止に少し膨らませる
    for (const face of FACES) {
      for (let ci = 0; ci < 4; ci++) {
        const c = face.corners[ci];
        verts.push(
          c[0] === 1 ? 1 + e : -e,
          c[1] === 1 ? 1 + e : -e,
          c[2] === 1 ? 1 + e : -e,
          lerp(uv.u0, uv.u1, face.uvs[ci][0]),
          lerp(uv.v0, uv.v1, face.uvs[ci][1]),
          25.0, 1.0, 1.0
        );
      }
      indices.push(count, count + 1, count + 2, count, count + 2, count + 3);
      count += 4;
    }
    const vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(verts), gl.STATIC_DRAW);
    const ibo = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint32Array(indices), gl.STATIC_DRAW);
    mesh = { vbo, ibo, count: indices.length };
    this.crackMeshes.set(stage, mesh);
    return mesh;
  }

  drawCrack(pos, stage) {
    const gl = this.gl;
    const pw = this.progWorld;
    const mesh = this.getCrackMesh(clamp(stage, 0, 4));

    gl.useProgram(pw.prog);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.depthMask(false);

    const T = Mat4.translation(this.tmpA, pos[0], pos[1], pos[2]);
    Mat4.multiply(this.tmpB, this.mvp, T);
    gl.uniformMatrix4fv(pw.uniforms.uMVP, false, this.tmpB);
    gl.uniform1f(pw.uniforms.uAlpha, 0.95); // 1 未満にして discard を避けブレンドする

    this.bindWorldAttribs(mesh.vbo);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, mesh.ibo);
    gl.drawElements(gl.TRIANGLES, mesh.count, gl.UNSIGNED_INT, 0);

    gl.depthMask(true);
    gl.disable(gl.BLEND);
    // uMVP / uAlpha を戻す
    gl.uniformMatrix4fv(pw.uniforms.uMVP, false, this.mvp);
    gl.uniform1f(pw.uniforms.uAlpha, 1.0);
  }

  // ---------------- アイテムドロップ ----------------

  drawItemDrops(items, camPos, time) {
    const gl = this.gl;
    const pw = this.progWorld;
    gl.useProgram(pw.prog);
    gl.disable(gl.CULL_FACE); // 植生アイテムの両面用

    for (const it of items) {
      const dx = it.pos[0] - camPos[0], dz = it.pos[2] - camPos[2];
      if (dx * dx + dz * dz > 48 * 48) continue;
      const mesh = this.getHeldMesh(it.id);
      // 通常ドロップは回転 + 浮遊, 落下ブロック (spin:false) は等倍で静止
      const spin = it.spin !== false;
      const bobY = spin ? Math.sin(time * 2.2 + it.phase) * 0.05 + 0.18 : 0.5;
      const T = Mat4.translation(this.tmpA, it.pos[0], it.pos[1] + bobY, it.pos[2]);
      Mat4.multiply(this.tmpB, this.mvp, T);
      const Ry = Mat4.rotationY(this.tmpA, spin ? time * 1.4 + it.phase : 0);
      Mat4.multiply(this.tmpC, this.tmpB, Ry);
      const S = Mat4.scaling(this.tmpA, it.scale || 0.28);
      Mat4.multiply(this.tmpB, this.tmpC, S);
      gl.uniformMatrix4fv(pw.uniforms.uMVP, false, this.tmpB);
      this.bindWorldAttribs(mesh.vbo);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, mesh.ibo);
      gl.drawElements(gl.TRIANGLES, mesh.count, gl.UNSIGNED_INT, 0);
    }

    gl.enable(gl.CULL_FACE);
    gl.uniformMatrix4fv(pw.uniforms.uMVP, false, this.mvp);
  }

  // ---------------- 手持ちブロック ----------------

  getHeldMesh(blockId) {
    let mesh = this.heldMeshes.get(blockId);
    if (mesh) return mesh;

    const gl = this.gl;
    const block = getDef(blockId);
    const verts = [];
    const indices = [];
    let count = 0;

    if (!block.tiles || block.cross || block.torch) {
      // アイテム / X 字植生 / 松明: 2 枚の対角クアッド (原点中心)
      const uv = tileUV(block.tiles ? block.tiles[0] : block.tile);
      const quads = [
        [[-0.5, 0.5, -0.5], [-0.5, -0.5, -0.5], [0.5, -0.5, 0.5], [0.5, 0.5, 0.5]],
        [[0.5, 0.5, -0.5], [0.5, -0.5, -0.5], [-0.5, -0.5, 0.5], [-0.5, 0.5, 0.5]],
      ];
      const quadUV = [[uv.u0, uv.v0], [uv.u0, uv.v1], [uv.u1, uv.v1], [uv.u1, uv.v0]];
      for (const q of quads) {
        for (let ci = 0; ci < 4; ci++) {
          verts.push(q[ci][0], q[ci][1], q[ci][2], quadUV[ci][0], quadUV[ci][1], 25.0, 1.0, 0.0);
        }
        indices.push(count, count + 1, count + 2, count, count + 2, count + 3);
        indices.push(count + 2, count + 1, count, count + 3, count + 2, count);
        count += 4;
      }
    } else {
      const blk = block.emissive ? 1.0 : 0.0;
      const hgt = block.height || 1; // ハーフブロックは低く表示
      FACES.forEach((face, fi) => {
        const tile = face.dir[1] === 1 ? block.tiles[0]
          : face.dir[1] === -1 ? block.tiles[2] : block.tiles[1];
        const uv = tileUV(tile);
        for (let ci = 0; ci < 4; ci++) {
          const c = face.corners[ci];
          verts.push(
            c[0] - 0.5, c[1] * hgt - 0.5, c[2] - 0.5,
            lerp(uv.u0, uv.u1, face.uvs[ci][0]),
            lerp(uv.v0, uv.v1, face.uvs[ci][1]),
            fi * 4 + face.shade, 1.0, blk
          );
        }
        indices.push(count, count + 1, count + 2, count, count + 2, count + 3);
        count += 4;
      });
    }

    const vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(verts), gl.STATIC_DRAW);
    const ibo = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint32Array(indices), gl.STATIC_DRAW);

    mesh = { vbo, ibo, count: indices.length };
    this.heldMeshes.set(blockId, mesh);
    return mesh;
  }

  drawHeldItem(blockId, env, swing) {
    const gl = this.gl;
    const mesh = this.getHeldMesh(blockId);
    const pw = this.progWorld;

    // 画面手前に常に表示 (深度をクリア)
    gl.clear(gl.DEPTH_BUFFER_BIT);
    gl.disable(gl.BLEND);
    gl.useProgram(pw.prog);

    // スイング: 下がりつつ少し回る
    const s = Math.sin(Math.min(swing, 1) * Math.PI);
    const proj = Mat4.perspective(this.tmpC, (70 * Math.PI) / 180, this.aspect, 0.05, 10);
    const T = Mat4.translation(this.tmpA, 0.85, -0.75 - s * 0.3, -1.7);
    Mat4.multiply(this.tmpB, proj, T);                      // tmpB = P*T
    const Ry = Mat4.rotationY(this.tmpA, 0.62 + s * 0.9);
    Mat4.multiply(this.tmpC, this.tmpB, Ry);                // tmpC = P*T*Ry
    const Rx = Mat4.rotationX(this.tmpA, -0.12 - s * 0.5);
    Mat4.multiply(this.tmpB, this.tmpC, Rx);                // tmpB = P*T*Ry*Rx
    const S = Mat4.scaling(this.tmpA, 0.55);
    Mat4.multiply(this.tmpC, this.tmpB, S);                 // 最終 MVP

    gl.uniformMatrix4fv(pw.uniforms.uMVP, false, this.tmpC);
    gl.uniform3f(pw.uniforms.uCamPos, 0, 0, 0);             // フォグ無効化 (距離 ~0)
    // 手持ちは夜でも見えるよう最低輝度を確保
    gl.uniform1f(pw.uniforms.uDaylight, Math.max(env.daylight, 0.45));
    gl.uniform1f(pw.uniforms.uAlpha, 1.0);

    this.bindWorldAttribs(mesh.vbo);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, mesh.ibo);
    gl.disable(gl.CULL_FACE); // 植生の両面用
    gl.drawElements(gl.TRIANGLES, mesh.count, gl.UNSIGNED_INT, 0);
    gl.enable(gl.CULL_FACE);
  }

  drawSky(forward, env) {
    const gl = this.gl;
    const ps = this.progSky;
    gl.useProgram(ps.prog);
    gl.depthMask(false);
    gl.disable(gl.CULL_FACE);

    // カメラ基底からレイを計算 (逆行列不要)
    const tanF = Math.tan(env.fov / 2);
    const up = [0, 1, 0];
    const f = forward;
    // right = forward × up
    let rx = f[1] * up[2] - f[2] * up[1];
    let ry = f[2] * up[0] - f[0] * up[2];
    let rz = f[0] * up[1] - f[1] * up[0];
    const rl = Math.hypot(rx, ry, rz) || 1;
    rx /= rl; ry /= rl; rz /= rl;
    // trueUp = right × forward
    const ux = ry * f[2] - rz * f[1];
    const uy = rz * f[0] - rx * f[2];
    const uz = rx * f[1] - ry * f[0];

    gl.uniform3fv(ps.uniforms.uForward, f);
    gl.uniform3f(ps.uniforms.uRight, rx * tanF * this.aspect, ry * tanF * this.aspect, rz * tanF * this.aspect);
    gl.uniform3f(ps.uniforms.uUp, ux * tanF, uy * tanF, uz * tanF);
    gl.uniform3fv(ps.uniforms.uZenith, env.zenith);
    gl.uniform3fv(ps.uniforms.uHorizon, env.horizon);
    gl.uniform3fv(ps.uniforms.uSunDir, env.sunDir);
    gl.uniform1f(ps.uniforms.uDaylight, env.daylight);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.skyBuf);
    gl.enableVertexAttribArray(ps.attribs.aPos);
    gl.vertexAttribPointer(ps.attribs.aPos, 2, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 6);

    gl.depthMask(true);
    gl.enable(gl.CULL_FACE);
  }

  drawClouds(camPos, env, time) {
    const gl = this.gl;
    const pc = this.progColor;
    gl.useProgram(pc.prog);
    gl.depthMask(false);
    gl.disable(gl.CULL_FACE);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    gl.uniformMatrix4fv(pc.uniforms.uMVP, false, this.mvp);
    const b = lerp(0.35, 1.0, env.daylight);
    gl.uniform4f(pc.uniforms.uColor, b, b, b * 1.02, 0.55);

    // 雲はゆっくり東へ流れる。カメラ位置でタイル状に繰り返す
    const drift = time * 1.6;
    const span = this.cloudSpan;
    const baseX = Math.round((camPos[0] - drift) / span) * span + drift;
    const baseZ = Math.round(camPos[2] / span) * span;

    gl.bindBuffer(gl.ARRAY_BUFFER, this.cloudBuf);
    gl.enableVertexAttribArray(pc.attribs.aPos);
    gl.vertexAttribPointer(pc.attribs.aPos, 3, gl.FLOAT, false, 0, 0);
    gl.uniform3f(pc.uniforms.uOffset, baseX, 0, baseZ);
    gl.drawArrays(gl.TRIANGLES, 0, this.cloudCount);

    gl.depthMask(true);
    gl.enable(gl.CULL_FACE);
  }
}
