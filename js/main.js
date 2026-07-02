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
  const mobs = new MobManager(world);
  const items = new ItemManager(world);

  // ---------------- ゲームモード (クリエイティブ / サバイバル) ----------------

  let gameMode = localStorage.getItem("mcjs_mode") === "survival" ? "survival" : "creative";
  player.creative = gameMode === "creative";

  // サバイバルの所持ブロック数
  const invCounts = new Map();
  let invDirty = false;
  try {
    const saved = JSON.parse(localStorage.getItem("mcjs_inv_" + seed));
    if (Array.isArray(saved)) {
      for (const [id, n] of saved) {
        if (BLOCKS[id] && n > 0) invCounts.set(id, n);
      }
    }
  } catch (e) { /* 壊れたデータは無視 */ }

  function addItem(id, n = 1) {
    invCounts.set(id, (invCounts.get(id) || 0) + n);
    invDirty = true;
    updateHotbarCounts();
  }

  function consumeItem(id) {
    if (gameMode === "creative") return true;
    const c = invCounts.get(id) || 0;
    if (c <= 0) return false;
    invCounts.set(id, c - 1);
    invDirty = true;
    updateHotbarCounts();
    return true;
  }

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

  // 保存されたホットバー構成を復元
  try {
    const savedBar = JSON.parse(localStorage.getItem("mcjs_hotbar"));
    if (Array.isArray(savedBar) && savedBar.length === HOTBAR_BLOCKS.length &&
        savedBar.every((id) => BLOCKS[id] && id !== B.AIR)) {
      savedBar.forEach((id, i) => { HOTBAR_BLOCKS[i] = id; });
    }
  } catch (e) { /* 壊れたデータは無視 */ }
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
    const count = document.createElement("span");
    count.className = "count";
    slot.append(icon, key, name, count);
    hotbarEl.appendChild(slot);
    slotEls.push(slot);
  });

  // サバイバルでは所持数を表示し, 持っていないブロックは薄くする
  function updateHotbarCounts() {
    for (let i = 0; i < HOTBAR_BLOCKS.length; i++) {
      const countEl = slotEls[i].querySelector(".count");
      const iconEl = slotEls[i].querySelector("canvas");
      if (gameMode === "creative") {
        countEl.textContent = "";
        iconEl.style.opacity = "1";
      } else {
        const c = invCounts.get(HOTBAR_BLOCKS[i]) || 0;
        countEl.textContent = c > 0 ? String(c) : "";
        iconEl.style.opacity = c > 0 ? "1" : "0.35";
      }
    }
  }

  function selectSlot(i) {
    selectedSlot = ((i % HOTBAR_BLOCKS.length) + HOTBAR_BLOCKS.length) % HOTBAR_BLOCKS.length;
    slotEls.forEach((el, j) => el.classList.toggle("selected", j === selectedSlot));
  }

  // ---------------- サバイバル UI (ハート / 酸素) ----------------

  const heartsEl = document.getElementById("hearts");
  const bubblesEl = document.getElementById("bubbles");
  const hurtOverlayEl = document.getElementById("hurt-overlay");
  const deathOverlayEl = document.getElementById("death-overlay");
  const heartFills = [];
  const bubbleEls = [];

  for (let i = 0; i < 10; i++) {
    const h = document.createElement("span");
    h.className = "heart";
    h.textContent = "♥";
    const fill = document.createElement("span");
    fill.className = "fill";
    fill.textContent = "♥";
    h.appendChild(fill);
    heartsEl.appendChild(h);
    heartFills.push(fill);
  }
  for (let i = 0; i < 10; i++) {
    const b = document.createElement("span");
    b.className = "bubble";
    b.textContent = "●";
    bubblesEl.appendChild(b);
    bubbleEls.push(b);
  }

  let lastHealth = -1, lastAir = -1;
  let deathTimer = 0;

  // --- モード切替とトースト表示 ---
  const statusBarsEl = document.getElementById("status-bars");
  const toastEl = document.getElementById("toast");
  let toastTimer = null;

  function showToast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove("show"), 1800);
  }

  function applyModeUI() {
    // クリエイティブでは体力 / 酸素を表示しない (本家準拠)
    statusBarsEl.style.visibility = gameMode === "creative" ? "hidden" : "visible";
    updateHotbarCounts();
  }

  function setMode(m) {
    gameMode = m;
    localStorage.setItem("mcjs_mode", m);
    player.creative = m === "creative";
    if (m === "survival") player.flying = false;
    applyModeUI();
    showToast(m === "survival" ? "サバイバルモード (G で切替)" : "クリエイティブモード (G で切替)");
  }

  applyModeUI();

  function updateSurvivalUI(dt) {
    if (player.health !== lastHealth) {
      lastHealth = player.health;
      for (let i = 0; i < 10; i++) {
        const hp = player.health - i * 2;
        heartFills[i].style.width = hp >= 2 ? "100%" : hp === 1 ? "50%" : "0";
      }
    }
    const airCount = Math.ceil(player.air);
    if (airCount !== lastAir) {
      lastAir = airCount;
      const show = player.eyeInWater || player.air < player.maxAir;
      bubblesEl.style.visibility = show ? "visible" : "hidden";
      for (let i = 0; i < 10; i++) {
        bubbleEls[i].classList.toggle("empty", i >= airCount);
      }
    }
    hurtOverlayEl.style.opacity = Math.min(player.hurtFlash * 2.2, 1);

    // 死亡 → 少し置いてリスポーン
    if (player.dead) {
      if (deathTimer === 0) {
        deathOverlayEl.classList.remove("hidden");
        sound.thud();
      }
      deathTimer += dt;
      if (deathTimer > 2.2) {
        deathTimer = 0;
        player.respawn();
        deathOverlayEl.classList.add("hidden");
      }
    }
  }

  // ---------------- インベントリ (E キー) ----------------

  const inventoryEl = document.getElementById("inventory");
  const inventoryGrid = document.getElementById("inventory-grid");
  let inventoryOpen = false;

  for (const block of BLOCKS) {
    if (!block || block.id === B.AIR || block.id === B.WATER || block.id === B.BEDROCK) continue;
    const item = document.createElement("div");
    item.className = "inv-item";
    const icon = document.createElement("canvas");
    icon.width = icon.height = 48;
    drawBlockIcon(icon, block.id, atlas);
    const label = document.createElement("span");
    label.textContent = block.jp;
    item.append(icon, label);
    item.addEventListener("click", () => {
      HOTBAR_BLOCKS[selectedSlot] = block.id;
      drawBlockIcon(slotEls[selectedSlot].querySelector("canvas"), block.id, atlas);
      slotEls[selectedSlot].querySelector(".name").textContent = block.jp;
      localStorage.setItem("mcjs_hotbar", JSON.stringify(HOTBAR_BLOCKS));
      updateHotbarCounts();
      closeInventory();
    });
    inventoryGrid.appendChild(item);
  }

  function openInventory() {
    inventoryOpen = true;
    inventoryEl.classList.remove("hidden");
    document.exitPointerLock();
  }

  function closeInventory() {
    inventoryOpen = false;
    inventoryEl.classList.add("hidden");
    canvas.requestPointerLock();
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

  // タッチデバイス判定 (タッチ操作 UI を出すか)
  const isTouch = window.matchMedia("(pointer: coarse)").matches || "ontouchstart" in window;
  const virt = { fwd: 0, strafe: 0, jump: false, sneak: false };

  function lockPointer() {
    canvas.requestPointerLock();
  }

  document.getElementById("play-btn").addEventListener("click", () => {
    sound.ensure();
    if (isTouch) {
      paused = false;
      overlay.classList.add("hidden");
    } else {
      lockPointer();
    }
  });

  canvas.addEventListener("click", () => {
    if (paused && !isTouch) lockPointer();
  });

  document.addEventListener("pointerlockchange", () => {
    paused = document.pointerLockElement !== canvas;
    // インベントリを開いている間はポーズ画面を出さない
    overlay.classList.toggle("hidden", !paused || inventoryOpen);
    if (paused) {
      keys.clear();
      heldButtons.clear();
    } else if (inventoryOpen) {
      inventoryOpen = false;
      inventoryEl.classList.add("hidden");
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
    // インベントリが開いている間は E / Esc で閉じるだけ
    if (inventoryOpen) {
      if (e.code === "KeyE" || e.code === "Escape") closeInventory();
      return;
    }
    if (paused) return;
    if (e.code === "F3") e.preventDefault();
    if (e.repeat) return;
    keys.add(e.code);

    if (e.code === "KeyE") {
      openInventory();
      return;
    }
    if (e.code === "KeyM") {
      const on = sound.toggleMusic();
      console.log(on ? "BGM: ON" : "BGM: OFF");
      return;
    }
    if (e.code === "KeyP") {
      pendingShot = true;
      return;
    }

    switch (e.code) {
      case "Space": {
        const now = performance.now();
        if (now - lastSpaceTime < 280 && gameMode === "creative") {
          player.flying = !player.flying;
          player.vel[1] = 0;
        }
        lastSpaceTime = now;
        break;
      }
      case "KeyF":
        if (gameMode !== "creative") {
          showToast("飛行はクリエイティブモード限定です");
          break;
        }
        player.flying = !player.flying;
        player.vel[1] = 0;
        break;
      case "KeyG":
        setMode(gameMode === "survival" ? "creative" : "survival");
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
    if (e.button === 0) {
      swingTimer = 0;
      if (tryPunch()) return;
      if (gameMode === "creative") {
        const hit = player.raycast();
        if (hit) breakBlockAt(hit);
        actionCooldown = ACTION_REPEAT;
      }
    } else if (e.button === 2) {
      placeAction();
      actionCooldown = ACTION_REPEAT;
    }
  });

  document.addEventListener("mouseup", (e) => heldButtons.delete(e.button));
  document.addEventListener("contextmenu", (e) => e.preventDefault());

  // ---------------- 破壊パーティクル ----------------

  const MAX_PARTICLES = 400;
  const particles = [];                                  // {pos, vel, life}
  const particleData = new Float32Array(MAX_PARTICLES * 6); // [x,y,z,r,g,b]

  // モブ死亡時などの汎用パフ
  function spawnPuff(x, y, z, col) {
    for (let i = 0; i < 10; i++) {
      if (particles.length >= MAX_PARTICLES) break;
      particles.push({
        pos: [x + (Math.random() - 0.5) * 0.6, y + Math.random() * 1.2, z + (Math.random() - 0.5) * 0.6],
        vel: [(Math.random() - 0.5) * 3, Math.random() * 3 + 0.5, (Math.random() - 0.5) * 3],
        life: 0.4 + Math.random() * 0.3,
        col: [col[0], col[1], col[2]],
      });
    }
  }

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

  // モブが視線上にいれば叩く。叩いたら true
  function tryPunch() {
    const hit = player.raycast();
    const fwd = player.forward();
    const mob = mobs.pick(player.eyePos(), fwd, hit ? hit.t : REACH);
    if (mob) {
      mobs.punch(mob, fwd);
      sound.thud();
      return true;
    }
    return false;
  }

  // ブロックを実際に破壊する (ドロップ・上に乗った植生の処理込み)
  function breakBlockAt(hit) {
    const block = BLOCKS[hit.id];
    if (!isFinite(block.hardness)) return;
    if (!world.setBlock(hit.pos[0], hit.pos[1], hit.pos[2], B.AIR)) return;
    spawnBreakParticles(hit.pos[0], hit.pos[1], hit.pos[2], hit.id);
    sound.break_();
    if (gameMode === "survival" && block.drops !== null && block.drops !== B.AIR) {
      items.spawn(block.drops, hit.pos[0], hit.pos[1], hit.pos[2]);
    }
    // 上に乗っていた植生 / 松明も壊す
    const [bx, by, bz] = hit.pos;
    const above = world.getBlock(bx, by + 1, bz);
    const ab = BLOCKS[above];
    if (above !== B.AIR && (ab.cross || ab.torch)) {
      world.setBlock(bx, by + 1, bz, B.AIR);
      if (gameMode === "survival" && ab.drops !== null) items.spawn(ab.drops, bx, by + 1, bz);
    }
  }

  // 右クリック / タップでの設置
  function placeAction() {
    swingTimer = 0;
    const hit = player.raycast();
    if (!hit) return;
    const [px, py, pz] = hit.prev;
    const cur = world.getBlock(px, py, pz);
    if (cur !== B.AIR && cur !== B.WATER) return;
    const id = HOTBAR_BLOCKS[selectedSlot];
    if (isSolid(id) && player.intersectsBlock(px, py, pz)) return;
    // 松明と植生は下が固体ブロックのときだけ置ける
    if ((BLOCKS[id].torch || BLOCKS[id].cross) && !world.isSolidAt(px, py - 1, pz)) return;
    if (!consumeItem(id)) return;
    if (world.setBlock(px, py, pz, id)) {
      sound.place();
    } else if (gameMode === "survival") {
      addItem(id); // 失敗したら返却
    }
  }

  // 旧 API 互換 (テスト / デバッグフック用): 即時破壊 / 設置
  function doAction(button) {
    swingTimer = 0;
    if (button === 0) {
      if (tryPunch()) return;
      const hit = player.raycast();
      if (hit) breakBlockAt(hit);
    } else if (button === 2) {
      placeAction();
    }
  }

  // ---------------- 採掘 (サバイバルは長押しで掘る) ----------------

  let breakTargetKey = null;
  let breakTargetPos = null;
  let breakProgress = 0;
  let touchHoldBreak = false;   // タッチの長押しフラグ

  function updateBreaking(dt) {
    const breaking = heldButtons.has(0) || touchHoldBreak;
    if (!breaking) {
      breakTargetKey = null;
      breakProgress = 0;
      return;
    }
    const hit = player.raycast();
    if (!hit) {
      breakTargetKey = null;
      breakProgress = 0;
      return;
    }

    if (gameMode === "creative") {
      // クリエイティブ: 一定間隔で即時破壊
      actionCooldown -= dt;
      if (actionCooldown <= 0) {
        swingTimer = 0;
        breakBlockAt(hit);
        actionCooldown = ACTION_REPEAT;
      }
      return;
    }

    // サバイバル: 硬さに応じて掘り進める
    const key = hit.pos.join(",");
    if (key !== breakTargetKey) {
      breakTargetKey = key;
      breakTargetPos = hit.pos;
      breakProgress = 0;
    }
    const hard = BLOCKS[hit.id].hardness;
    if (!isFinite(hard)) {
      breakProgress = 0;
      return;
    }
    breakProgress += dt / hard;
    if (breakProgress >= 1) {
      breakBlockAt(hit);
      breakTargetKey = null;
      breakProgress = 0;
    }
  }

  // ---------------- タッチ操作 ----------------

  if (isTouch) {
    const touchUI = document.getElementById("touch-ui");
    touchUI.classList.remove("hidden");
    canvas.style.touchAction = "none";

    // --- ポーズボタン ---
    document.getElementById("btn-pause").addEventListener("click", () => {
      paused = true;
      overlay.classList.remove("hidden");
      keys.clear();
      heldButtons.clear();
    });

    // --- ジャンプ / 飛行 / 下降ボタン ---
    const btnJump = document.getElementById("btn-jump");
    const btnFly = document.getElementById("btn-fly");
    const btnDown = document.getElementById("btn-down");

    btnJump.addEventListener("touchstart", (e) => { e.preventDefault(); virt.jump = true; });
    btnJump.addEventListener("touchend", () => { virt.jump = false; });
    btnDown.addEventListener("touchstart", (e) => { e.preventDefault(); virt.sneak = true; });
    btnDown.addEventListener("touchend", () => { virt.sneak = false; });
    btnFly.addEventListener("touchstart", (e) => {
      e.preventDefault();
      if (gameMode !== "creative") {
        showToast("飛行はクリエイティブモード限定です");
        return;
      }
      player.flying = !player.flying;
      player.vel[1] = 0;
      btnDown.classList.toggle("hidden", !player.flying);
    });

    // --- バーチャルジョイスティック ---
    const joy = document.getElementById("joystick");
    const knob = document.getElementById("joystick-knob");
    let joyId = null;

    const updateJoy = (t) => {
      const rect = joy.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      let dx = (t.clientX - cx) / (rect.width / 2);
      let dy = (t.clientY - cy) / (rect.height / 2);
      const mag = Math.hypot(dx, dy);
      if (mag > 1) { dx /= mag; dy /= mag; }
      virt.strafe = dx;
      virt.fwd = -dy;
      knob.style.transform =
        `translate(calc(-50% + ${dx * rect.width * 0.3}px), calc(-50% + ${dy * rect.height * 0.3}px))`;
    };

    const resetJoy = () => {
      joyId = null;
      virt.strafe = 0;
      virt.fwd = 0;
      knob.style.transform = "translate(-50%, -50%)";
    };

    joy.addEventListener("touchstart", (e) => {
      e.preventDefault();
      if (joyId !== null) return;
      const t = e.changedTouches[0];
      joyId = t.identifier;
      updateJoy(t);
    });
    document.addEventListener("touchmove", (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === joyId) { updateJoy(t); e.preventDefault(); }
      }
    }, { passive: false });
    document.addEventListener("touchend", (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === joyId) resetJoy();
      }
    });
    document.addEventListener("touchcancel", resetJoy);

    // --- 視点ドラッグ + タップ設置 / 長押し破壊 ---
    let lookId = null;
    let lookLast = null;
    let tapStart = 0;
    let movedDist = 0;
    let breakDelay = null;
    let breaking = false;

    const stopBreaking = () => {
      clearTimeout(breakDelay);
      breakDelay = null;
      breaking = false;
      touchHoldBreak = false;
    };

    canvas.addEventListener("touchstart", (e) => {
      if (paused) return;
      e.preventDefault(); // 合成マウスイベントを抑止
      if (lookId !== null) return;
      const t = e.changedTouches[0];
      lookId = t.identifier;
      lookLast = [t.clientX, t.clientY];
      tapStart = performance.now();
      movedDist = 0;
      // 長押しで破壊開始 (サバイバルは掘り続ける)
      breakDelay = setTimeout(() => {
        breaking = true;
        touchHoldBreak = true;
        actionCooldown = 0;
      }, 420);
    }, { passive: false });

    canvas.addEventListener("touchmove", (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier !== lookId) continue;
        const dx = t.clientX - lookLast[0];
        const dy = t.clientY - lookLast[1];
        movedDist += Math.hypot(dx, dy);
        if (movedDist > 14) stopBreaking(); // ドラッグ中は破壊しない
        const sens = 0.0058;
        player.yaw += dx * sens;
        player.pitch = clamp(player.pitch - dy * sens,
          -Math.PI / 2 + 0.01, Math.PI / 2 - 0.01);
        lookLast = [t.clientX, t.clientY];
        e.preventDefault();
      }
    }, { passive: false });

    const endLook = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier !== lookId) continue;
        // 短いタップ (ドラッグ・長押しでない) はモブ攻撃 → 設置
        if (movedDist <= 14 && !breaking && performance.now() - tapStart < 350) {
          if (!tryPunch()) placeAction();
        }
        stopBreaking();
        lookId = null;
      }
    };
    canvas.addEventListener("touchend", endLook);
    canvas.addEventListener("touchcancel", endLook);
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
  let swingTimer = 1;      // 1 = スイング終了
  let pendingShot = false;
  let stepAccum = 0;

  function frame(now) {
    requestAnimationFrame(frame);
    let dt = Math.min((now - lastT) / 1000, 0.1);
    lastT = now;
    elapsed += dt;

    // --- 入力の集約 ---
    const input = {
      fwd: clamp((keys.has("KeyW") ? 1 : 0) - (keys.has("KeyS") ? 1 : 0) + virt.fwd, -1, 1),
      strafe: clamp((keys.has("KeyD") ? 1 : 0) - (keys.has("KeyA") ? 1 : 0) + virt.strafe, -1, 1),
      jump: keys.has("Space") || virt.jump,
      sneak: keys.has("ShiftLeft") || keys.has("ShiftRight") || virt.sneak,
      sprint: keys.has("ControlLeft") || keys.has("ControlRight"),
    };

    if (!paused) {
      // 物理は細かいサブステップで安定させる
      const steps = Math.max(1, Math.ceil(dt / (1 / 120)));
      const sub = dt / steps;
      for (let i = 0; i < steps; i++) player.update(sub, input);

      // 採掘 (長押しで掘る / クリエイティブは連続破壊)
      updateBreaking(dt);

      // 右クリック長押しで連続設置
      if (heldButtons.has(2) && !heldButtons.has(0)) {
        actionCooldown -= dt;
        if (actionCooldown <= 0) {
          placeAction();
          actionCooldown = ACTION_REPEAT;
        }
      }

      // アイテムドロップの回収
      items.update(dt, player, (id) => {
        addItem(id);
        sound.pickup();
      });

      timeOfDay = (timeOfDay + dt / DAY_LENGTH) % 1;
      updateParticles(dt);

      // モブ更新 (夜はゾンビ, 昼は動物が湧く)
      const daylightNow = smoothstep(-0.1, 0.22, Math.sin(timeOfDay * Math.PI * 2));
      mobs.update(dt, player, daylightNow);
      for (const death of mobs.deaths) {
        const col = MOB_TYPES[death.type].parts[0];
        spawnPuff(death.pos[0], death.pos[1], death.pos[2], [col[6], col[7], col[8]]);
        sound.thud();
      }
      if (mobs.groanRequest) sound.groan();

      updateSurvivalUI(dt);

      // 歩行ボビングと足音
      const hSpeed = Math.hypot(player.vel[0], player.vel[2]);
      if (player.onGround && hSpeed > 0.5) {
        bobPhase += hSpeed * dt * 2.2;
        bobAmount = Math.min(bobAmount + dt * 4, 1);
        if (!player.inWater) {
          stepAccum += hSpeed * dt;
          if (stepAccum > 2.8) {
            stepAccum = 0;
            sound.step();
          }
        }
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
      entities: mobs.buildVertexData(),
      items: items.items,
      crack: (gameMode === "survival" && breakProgress > 0.02 && breakTargetPos)
        ? { pos: breakTargetPos, stage: Math.min(4, (breakProgress * 5) | 0) }
        : null,
      held: {
        id: HOTBAR_BLOCKS[selectedSlot],
        // サバイバルで掘っている間は連続スイング
        swing: (gameMode === "survival" && breakTargetKey) ? (elapsed * 3) % 1 : swingTimer,
      },
    });

    swingTimer = Math.min(swingTimer + dt * 4.5, 1);

    // スクリーンショット保存 (描画直後の同一フレーム内で取得)
    if (pendingShot) {
      pendingShot = false;
      canvas.toBlob((blob) => {
        if (!blob) return;
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = `minecraft-js_${Date.now()}.png`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 5000);
      });
    }

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
        `チャンク: ${Math.floor(p[0]) >> 4}, ${Math.floor(p[2]) >> 4} (計 ${world.chunks.size})  モブ: ${mobs.mobs.length}\n` +
        `バイオーム: ${biomeInfo.biome}  シード: ${seed}\n` +
        `時刻: ${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}\n` +
        `${player.flying ? "飛行中 " : ""}${player.onGround ? "接地 " : ""}${player.inWater ? "水中" : ""}`;
    }

    // --- 自動セーブ ---
    saveTimer += dt;
    if (saveTimer > 4) {
      saveTimer = 0;
      world.saveEdits();
      if (invDirty) {
        invDirty = false;
        try {
          localStorage.setItem("mcjs_inv_" + seed, JSON.stringify([...invCounts]));
        } catch (e) { /* 容量超過などは無視 */ }
      }
    }
  }

  // テスト / デバッグ用フック (コンソールから操作できる)
  window.__mc = {
    player,
    world,
    mobs,
    items,
    inv: invCounts,
    get mode() { return gameMode; },
    setMode,
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
