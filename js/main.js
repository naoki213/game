// ---------------------------------------------------------------
// メイン: 初期化 / 入力 / チャンクストリーミング / ゲームループ
// ---------------------------------------------------------------
"use strict";

(function () {
  const RENDER_DIST = 5;        // 描画半径 (チャンク数)
  const DAY_LENGTH = 600;       // 昼夜 1 サイクル (秒)
  const ACTION_REPEAT = 0.22;   // 破壊/設置の長押しリピート間隔 (秒)

  // ---------------- 初期化 ----------------

  let seed = parseInt(localStorage.getItem("mcjs_seed"), 10);
  if (!Number.isFinite(seed)) {
    seed = (Math.random() * 0x7fffffff) | 0;
    localStorage.setItem("mcjs_seed", String(seed));
  }

  const canvas = document.getElementById("game");
  const atlas = buildTextureAtlas(seed);
  const renderer = new Renderer(canvas, atlas);
  const world = new World(seed);
  const player = new Player(world);
  const sound = new Sound();

  // スポーン地点周辺を先に同期生成してからスポーン
  for (let cz = -1; cz <= 1; cz++) {
    for (let cx = -1; cx <= 1; cx++) {
      world.generateChunk(cx, cz);
    }
  }
  player.spawn(8.5, 8.5);
  player.yaw = Math.PI * 0.25;

  // ---------------- HUD (ホットバー) ----------------

  let selectedSlot = 0;
  const hotbarEl = document.getElementById("hotbar");
  const slotEls = [];
  HOTBAR_BLOCKS.forEach((blockId, i) => {
    const slot = document.createElement("div");
    slot.className = "slot" + (i === 0 ? " selected" : "");
    const icon = document.createElement("canvas");
    icon.width = icon.height = 48;
    drawBlockIcon(icon, blockId, atlas);
    const key = document.createElement("span");
    key.className = "key";
    key.textContent = String(i + 1);
    const name = document.createElement("span");
    name.className = "name";
    name.textContent = BLOCKS[blockId].jp;
    slot.append(icon, key, name);
    hotbarEl.appendChild(slot);
    slotEls.push(slot);
  });

  function selectSlot(i) {
    selectedSlot = ((i % HOTBAR_BLOCKS.length) + HOTBAR_BLOCKS.length) % HOTBAR_BLOCKS.length;
    slotEls.forEach((el, j) => el.classList.toggle("selected", j === selectedSlot));
  }

  // ---------------- 入力 ----------------

  const keys = new Set();
  const overlay = document.getElementById("overlay");
  const debugEl = document.getElementById("debug");
  const waterOverlayEl = document.getElementById("water-overlay");
  let paused = true;
  let showDebug = false;
  let lastSpaceTime = 0;
  const heldButtons = new Set();
  let actionCooldown = 0;

  function lockPointer() {
    canvas.requestPointerLock();
  }

  document.getElementById("play-btn").addEventListener("click", () => {
    sound.ensure();
    lockPointer();
  });

  canvas.addEventListener("click", () => {
    if (paused) lockPointer();
  });

  document.addEventListener("pointerlockchange", () => {
    paused = document.pointerLockElement !== canvas;
    overlay.classList.toggle("hidden", !paused);
    if (paused) {
      keys.clear();
      heldButtons.clear();
    }
  });

  document.addEventListener("mousemove", (e) => {
    if (paused) return;
    const sens = 0.0024;
    player.yaw += e.movementX * sens;
    player.pitch -= e.movementY * sens;
    player.pitch = clamp(player.pitch, -Math.PI / 2 + 0.01, Math.PI / 2 - 0.01);
  });

  document.addEventListener("keydown", (e) => {
    if (paused) return;
    if (e.code === "F3") e.preventDefault();
    if (e.repeat) return;
    keys.add(e.code);

    switch (e.code) {
      case "Space": {
        const now = performance.now();
        if (now - lastSpaceTime < 280) {
          player.flying = !player.flying;
          player.vel[1] = 0;
        }
        lastSpaceTime = now;
        break;
      }
      case "KeyF":
        player.flying = !player.flying;
        player.vel[1] = 0;
        break;
      case "F3":
        showDebug = !showDebug;
        debugEl.classList.toggle("visible", showDebug);
        break;
      case "KeyN": {
        document.exitPointerLock();
        const input = prompt(
          "新しいワールドのシード値を入力してください (空欄でランダム)\n" +
          "※ 現在のワールドは保存されたままです");
        if (input === null) break;
        let newSeed;
        if (input.trim() === "") {
          newSeed = (Math.random() * 0x7fffffff) | 0;
        } else if (/^-?\d+$/.test(input.trim())) {
          newSeed = parseInt(input.trim(), 10) | 0;
        } else {
          // 文字列は簡易ハッシュでシード化
          newSeed = 0;
          for (const ch of input) newSeed = (Math.imul(newSeed, 31) + ch.codePointAt(0)) | 0;
        }
        world.saveEdits();
        localStorage.setItem("mcjs_seed", String(newSeed));
        location.reload();
        break;
      }
      case "Digit1": case "Digit2": case "Digit3":
      case "Digit4": case "Digit5": case "Digit6":
      case "Digit7": case "Digit8": case "Digit9":
        selectSlot(parseInt(e.code.slice(5), 10) - 1);
        break;
    }
  });

  document.addEventListener("keyup", (e) => keys.delete(e.code));

  document.addEventListener("wheel", (e) => {
    if (paused) return;
    selectSlot(selectedSlot + (e.deltaY > 0 ? 1 : -1));
  }, { passive: true });

  canvas.addEventListener("mousedown", (e) => {
    if (paused) return;
    heldButtons.add(e.button);
    doAction(e.button);
    actionCooldown = ACTION_REPEAT;
  });

  document.addEventListener("mouseup", (e) => heldButtons.delete(e.button));
  document.addEventListener("contextmenu", (e) => e.preventDefault());

  // ---------------- 破壊パーティクル ----------------

  const MAX_PARTICLES = 400;
  const particles = [];                                  // {pos, vel, life}
  const particleData = new Float32Array(MAX_PARTICLES * 6); // [x,y,z,r,g,b]

  function spawnBreakParticles(x, y, z, blockId) {
    const tile = BLOCKS[blockId].tiles[1];
    const col = TILE_AVG_COLORS[tile] || [0.5, 0.5, 0.5];
    for (let i = 0; i < 14; i++) {
      if (particles.length >= MAX_PARTICLES) break;
      particles.push({
        pos: [x + 0.2 + Math.random() * 0.6, y + 0.2 + Math.random() * 0.6, z + 0.2 + Math.random() * 0.6],
        vel: [(Math.random() - 0.5) * 4, Math.random() * 4 + 1, (Math.random() - 0.5) * 4],
        life: 0.45 + Math.random() * 0.3,
        col: [
          col[0] * (0.8 + Math.random() * 0.4),
          col[1] * (0.8 + Math.random() * 0.4),
          col[2] * (0.8 + Math.random() * 0.4),
        ],
      });
    }
  }

  function updateParticles(dt) {
    // 物理更新と寿命切れの除去
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.life -= dt;
      if (p.life <= 0) {
        particles.splice(i, 1);
        continue;
      }
      p.vel[1] -= 18 * dt;
      const nx = p.pos[0] + p.vel[0] * dt;
      const ny = p.pos[1] + p.vel[1] * dt;
      const nz = p.pos[2] + p.vel[2] * dt;
      // 地面で跳ねずに止まる
      if (world.isSolidAt(Math.floor(nx), Math.floor(ny), Math.floor(nz))) {
        p.vel = [0, 0, 0];
      } else {
        p.pos = [nx, ny, nz];
      }
    }
    // 描画用バッファへ詰め直す
    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      const o = i * 6;
      particleData[o] = p.pos[0];
      particleData[o + 1] = p.pos[1];
      particleData[o + 2] = p.pos[2];
      particleData[o + 3] = p.col[0];
      particleData[o + 4] = p.col[1];
      particleData[o + 5] = p.col[2];
    }
  }

  function doAction(button) {
    const hit = player.raycast();
    if (!hit) return;

    if (button === 0) {
      // 破壊
      if (hit.id === B.BEDROCK) return;
      if (world.setBlock(hit.pos[0], hit.pos[1], hit.pos[2], B.AIR)) {
        spawnBreakParticles(hit.pos[0], hit.pos[1], hit.pos[2], hit.id);
        sound.break_();
      }
    } else if (button === 2) {
      // 設置
      const [px, py, pz] = hit.prev;
      const cur = world.getBlock(px, py, pz);
      if (cur !== B.AIR && cur !== B.WATER) return;
      const id = HOTBAR_BLOCKS[selectedSlot];
      if (isSolid(id) && player.intersectsBlock(px, py, pz)) return;
      if (world.setBlock(px, py, pz, id)) {
        sound.place();
      }
    }
  }

  // ---------------- チャンクストリーミング ----------------

  function streamChunks() {
    const pcx = Math.floor(player.pos[0]) >> 4;
    const pcz = Math.floor(player.pos[2]) >> 4;

    // 必要チャンクを距離順に集める
    // (ライト計算に斜め隣接チャンクも必要なため, データ生成は描画半径 +2)
    const wanted = [];
    const genDist = RENDER_DIST + 2;
    for (let dz = -genDist; dz <= genDist; dz++) {
      for (let dx = -genDist; dx <= genDist; dx++) {
        const d2 = dx * dx + dz * dz;
        if (d2 > genDist * genDist + 1) continue;
        wanted.push([pcx + dx, pcz + dz, d2]);
      }
    }
    wanted.sort((a, b) => a[2] - b[2]);

    // 生成 (フレームあたりの予算)
    let genBudget = 3;
    for (const [cx, cz] of wanted) {
      if (genBudget <= 0) break;
      const chunk = world.getChunk(cx, cz);
      if (!chunk || !chunk.generated) {
        world.generateChunk(cx, cz);
        genBudget--;
      }
    }

    // メッシュ再構築 (近い順, 4 近傍が生成済みのチャンクのみ)
    let meshBudget = 2;
    const rd2 = RENDER_DIST * RENDER_DIST + 1;
    for (const [cx, cz, d2] of wanted) {
      if (meshBudget <= 0) break;
      if (d2 > rd2) continue;
      const chunk = world.getChunk(cx, cz);
      if (!chunk || !chunk.generated || !chunk.dirty) continue;
      // ライト計算のため周囲 8 チャンクすべての生成が必要
      let nbOk = true;
      for (let dz = -1; dz <= 1 && nbOk; dz++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (!world.getChunk(cx + dx, cz + dz)?.generated) { nbOk = false; break; }
        }
      }
      if (!nbOk) continue;
      renderer.uploadChunkMesh(chunk, buildChunkMesh(world, chunk));
      chunk.dirty = false;
      meshBudget--;
    }

    // 範囲外のチャンクを破棄
    const dropDist = RENDER_DIST + 3;
    for (const [key, chunk] of world.chunks) {
      const dx = chunk.cx - pcx, dz = chunk.cz - pcz;
      if (dx * dx + dz * dz > dropDist * dropDist) {
        renderer.deleteChunkMesh(chunk);
        world.chunks.delete(key);
      }
    }
  }

  // ---------------- 昼夜サイクル ----------------

  function computeEnv(timeOfDay, fov) {
    const angle = timeOfDay * Math.PI * 2;
    let sx = Math.cos(angle), sy = Math.sin(angle), sz = 0.28;
    const sl = Math.hypot(sx, sy, sz);
    const sunDir = [sx / sl, sy / sl, sz / sl];
    const daylight = smoothstep(-0.1, 0.22, sy);

    const mix3 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
    let zenith = mix3([0.015, 0.03, 0.09], [0.4, 0.66, 0.99], daylight);
    let horizon = mix3([0.05, 0.08, 0.16], [0.74, 0.85, 0.96], daylight);

    // 朝焼け / 夕焼け
    const sunset = Math.max(0, 1 - Math.abs(sy) / 0.32);
    horizon = mix3(horizon, [0.96, 0.52, 0.28], sunset * 0.6);
    zenith = mix3(zenith, [0.45, 0.3, 0.42], sunset * 0.25);

    let fog = horizon.slice();
    let fogEnd = RENDER_DIST * CHUNK_SIZE - 6;
    let fogStart = fogEnd * 0.55;

    // 水中
    if (player.eyeInWater) {
      fog = mix3([0.07, 0.2, 0.45], [0.02, 0.05, 0.15], 1 - daylight);
      fogStart = 0;
      fogEnd = 16;
    }

    return { sunDir, daylight, zenith, horizon, fog, fogStart, fogEnd, fov };
  }

  // ---------------- ゲームループ ----------------

  let timeOfDay = 0.16;   // 朝からスタート
  let elapsed = 0;
  let lastT = performance.now();
  let fps = 0, frames = 0, fpsTimer = 0;
  let saveTimer = 0;
  const baseFov = (70 * Math.PI) / 180;
  let fovCurrent = baseFov;
  let bobPhase = 0;
  let bobAmount = 0;

  function frame(now) {
    requestAnimationFrame(frame);
    let dt = Math.min((now - lastT) / 1000, 0.1);
    lastT = now;
    elapsed += dt;

    // --- 入力の集約 ---
    const input = {
      fwd: (keys.has("KeyW") ? 1 : 0) - (keys.has("KeyS") ? 1 : 0),
      strafe: (keys.has("KeyD") ? 1 : 0) - (keys.has("KeyA") ? 1 : 0),
      jump: keys.has("Space"),
      sneak: keys.has("ShiftLeft") || keys.has("ShiftRight"),
      sprint: keys.has("ControlLeft") || keys.has("ControlRight"),
    };

    if (!paused) {
      // 物理は細かいサブステップで安定させる
      const steps = Math.max(1, Math.ceil(dt / (1 / 120)));
      const sub = dt / steps;
      for (let i = 0; i < steps; i++) player.update(sub, input);

      // 長押しで連続破壊/設置
      if (heldButtons.size > 0) {
        actionCooldown -= dt;
        if (actionCooldown <= 0) {
          if (heldButtons.has(0)) doAction(0);
          else if (heldButtons.has(2)) doAction(2);
          actionCooldown = ACTION_REPEAT;
        }
      }

      timeOfDay = (timeOfDay + dt / DAY_LENGTH) % 1;
      updateParticles(dt);

      // 歩行ボビング
      const hSpeed = Math.hypot(player.vel[0], player.vel[2]);
      if (player.onGround && hSpeed > 0.5) {
        bobPhase += hSpeed * dt * 2.2;
        bobAmount = Math.min(bobAmount + dt * 4, 1);
      } else {
        bobAmount = Math.max(bobAmount - dt * 4, 0);
      }
    }

    streamChunks();

    // --- 描画 ---
    const sprinting = input.sprint && (input.fwd > 0 || player.flying);
    fovCurrent = lerp(fovCurrent, baseFov * (sprinting ? 1.12 : 1), Math.min(8 * dt, 1));
    const env = computeEnv(timeOfDay, fovCurrent);

    const hit = paused ? null : player.raycast();

    // チャンクを距離順に (水パスの奥→手前描画のため)
    const pcx = player.pos[0], pcz = player.pos[2];
    const chunkList = [...world.chunks.values()].filter((c) => c.mesh);
    chunkList.sort((a, b) => {
      const da = (a.cx * 16 + 8 - pcx) ** 2 + (a.cz * 16 + 8 - pcz) ** 2;
      const db = (b.cx * 16 + 8 - pcx) ** 2 + (b.cz * 16 + 8 - pcz) ** 2;
      return da - db;
    });

    const camPos = player.eyePos();
    camPos[1] += Math.sin(bobPhase * Math.PI * 2) * 0.055 * bobAmount;

    const drawCalls = renderer.render({
      camPos,
      forward: player.forward(),
      chunks: chunkList,
      env,
      fov: fovCurrent,
      highlight: hit ? hit.pos : null,
      time: elapsed,
      particles: { data: particleData, count: particles.length },
    });

    waterOverlayEl.classList.toggle("active", player.eyeInWater);

    // --- FPS / デバッグ ---
    frames++;
    fpsTimer += dt;
    if (fpsTimer >= 1) {
      fps = frames;
      frames = 0;
      fpsTimer -= 1;
    }

    if (showDebug) {
      const p = player.pos;
      const biomeInfo = world.columnInfo(Math.floor(p[0]), Math.floor(p[2]));
      const hours = ((timeOfDay * 24 + 6) % 24) | 0;
      const mins = ((timeOfDay * 24 * 60) % 60) | 0;
      debugEl.textContent =
        `FPS: ${fps}  描画: ${drawCalls} calls\n` +
        `XYZ: ${p[0].toFixed(1)} / ${p[1].toFixed(1)} / ${p[2].toFixed(1)}\n` +
        `チャンク: ${Math.floor(p[0]) >> 4}, ${Math.floor(p[2]) >> 4} (計 ${world.chunks.size})\n` +
        `バイオーム: ${biomeInfo.biome}  シード: ${seed}\n` +
        `時刻: ${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}\n` +
        `${player.flying ? "飛行中 " : ""}${player.onGround ? "接地 " : ""}${player.inWater ? "水中" : ""}`;
    }

    // --- 自動セーブ ---
    saveTimer += dt;
    if (saveTimer > 4) {
      saveTimer = 0;
      world.saveEdits();
    }
  }

  // テスト / デバッグ用フック (コンソールから操作できる)
  window.__mc = {
    player,
    world,
    seed,
    selectSlot,
    setTime: (t) => { timeOfDay = ((t % 1) + 1) % 1; },
    action: doAction,
  };

  window.addEventListener("beforeunload", () => world.saveEdits());
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) world.saveEdits();
  });

  requestAnimationFrame(frame);
})();
