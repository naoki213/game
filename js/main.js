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
        if (getDef(id) && n > 0) invCounts.set(id, n); // 道具・防具などのアイテムも復元する
      }
    }
  } catch (e) { /* 壊れたデータは無視 */ }

  // 道具の耐久値 (アイテム ID → 残り耐久)。壊れたら所持数 -1
  const toolDur = new Map();
  try {
    const saved = JSON.parse(localStorage.getItem("mcjs_tooldur_" + seed));
    if (Array.isArray(saved)) for (const [id, d] of saved) toolDur.set(id, d);
  } catch (e) { /* ignore */ }

  function heldTool() {
    const id = HOTBAR_BLOCKS[selectedSlot];
    const def = getDef(id);
    if (!def || !def.tool) return null;
    // サバイバルでは所持していないと使えない
    if (gameMode === "survival" && (invCounts.get(id) || 0) <= 0) return null;
    return { id, ...def.tool };
  }

  function damageTool(id) {
    if (gameMode !== "survival") return;
    const def = getDef(id);
    if (!def || !def.tool) return;
    const cur = toolDur.has(id) ? toolDur.get(id) : def.tool.durability;
    if (cur <= 1) {
      // 道具が壊れる
      invCounts.set(id, Math.max(0, (invCounts.get(id) || 0) - 1));
      toolDur.delete(id);
      sound.blip(180, 0.18, "sawtooth", 0.25);
      showToast(def.jp + " が壊れた!");
    } else {
      toolDur.set(id, cur - 1);
    }
    invDirty = true;
    updateHotbarCounts();
  }

  // ---------------- 防具 (装備・防御ポイント・耐久) ----------------
  // スロット (head/chest/legs/feet) ごとに { id, dur } を装備する。
  // 合計防御ポイントは player.takeDamage のダメージ軽減に使われ,
  // 被弾のたびに装備中の全部位の耐久が 1 ずつ減り, 0 になると壊れる
  const ARMOR_SLOTS = ["head", "chest", "legs", "feet"];
  const equippedArmor = { head: null, chest: null, legs: null, feet: null };
  try {
    const saved = JSON.parse(localStorage.getItem("mcjs_armor_" + seed));
    if (saved) {
      for (const slot of ARMOR_SLOTS) {
        const e = saved[slot];
        if (e && getDef(e.id) && getDef(e.id).armor && e.dur > 0) equippedArmor[slot] = e;
      }
    }
  } catch (e) { /* ignore */ }

  function syncArmor() {
    let pts = 0;
    for (const slot of ARMOR_SLOTS) {
      if (equippedArmor[slot]) pts += getDef(equippedArmor[slot].id).armor.points;
    }
    player.armorPoints = pts;
    localStorage.setItem("mcjs_armor_" + seed, JSON.stringify(equippedArmor));
    updateArmorHud();
    invDirty = true;
  }

  // 被弾時: 装備中の全部位の耐久を 1 消費 (0 で壊れる)
  player.onArmorDamage = () => {
    for (const slot of ARMOR_SLOTS) {
      const e = equippedArmor[slot];
      if (!e) continue;
      e.dur--;
      if (e.dur <= 0) {
        showToast(getDef(e.id).jp + " が壊れた!");
        sound.blip(180, 0.18, "sawtooth", 0.25);
        equippedArmor[slot] = null;
      }
    }
    syncArmor();
  };

  // 持ち物画面で防具をクリックすると装備 / 装備中のものをもう一度クリックで外す
  function equipArmor(id) {
    const def = getDef(id);
    if (!def || !def.armor) return;
    const slot = def.armor.slot;
    const prev = equippedArmor[slot];
    if (prev && prev.id === id) {
      equippedArmor[slot] = null;
      if (gameMode === "survival") addItem(id);
      showToast(def.jp + " を外した");
    } else {
      if (gameMode === "survival") {
        if ((invCounts.get(id) || 0) <= 0) { showToast(def.jp + " を持っていない"); return; }
        consumeItem(id);
        if (prev) addItem(prev.id);
      }
      equippedArmor[slot] = { id, dur: def.armor.durability };
      showToast(def.jp + " を装備した");
      sound.place();
    }
    syncArmor();
  }

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

  // ---------------- HUD (ホットバー) ----------------

  let selectedSlot = 0;
  const hotbarEl = document.getElementById("hotbar");
  const slotEls = [];

  // 保存されたホットバー構成を復元
  try {
    const savedBar = JSON.parse(localStorage.getItem("mcjs_hotbar"));
    if (Array.isArray(savedBar) && savedBar.length === HOTBAR_BLOCKS.length &&
        savedBar.every((id) => getDef(id) && id !== B.AIR)) {
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
    name.textContent = getDef(blockId).jp;
    const count = document.createElement("span");
    count.className = "count";
    const durbar = document.createElement("span");
    durbar.className = "durbar";
    durbar.innerHTML = "<i></i>";
    slot.append(icon, key, name, count, durbar);
    // タップ / クリックでスロット選択 (スマホの手持ち切替)
    slot.addEventListener("click", (e) => {
      e.stopPropagation();
      selectSlot(i);
    });
    hotbarEl.appendChild(slot);
    slotEls.push(slot);
  });

  // サバイバルでは所持数・耐久値を表示し, 持っていないものは薄くする
  function updateHotbarCounts() {
    for (let i = 0; i < HOTBAR_BLOCKS.length; i++) {
      const id = HOTBAR_BLOCKS[i];
      const def = getDef(id);
      const countEl = slotEls[i].querySelector(".count");
      const iconEl = slotEls[i].querySelector("canvas");
      const durEl = slotEls[i].querySelector(".durbar");

      // 耐久バー (道具のみ, ダメージがあるときだけ表示)
      let showDur = false;
      if (def && def.tool && gameMode === "survival" && toolDur.has(id)) {
        const ratio = toolDur.get(id) / def.tool.durability;
        if (ratio < 1) {
          showDur = true;
          const bar = durEl.querySelector("i");
          bar.style.width = (ratio * 100).toFixed(0) + "%";
          bar.style.background = ratio > 0.5 ? "#5ad25a" : ratio > 0.2 ? "#e8c33a" : "#e04f3a";
        }
      }
      durEl.style.display = showDur ? "block" : "none";

      const nameEl = slotEls[i].querySelector(".name");
      if (gameMode === "creative") {
        countEl.textContent = "";
        iconEl.style.visibility = "visible";
        nameEl.style.visibility = "visible";
        iconEl.style.opacity = "1";
      } else {
        // サバイバル: 持っていないアイテムはスロットに表示しない (空に見える)
        const c = invCounts.get(id) || 0;
        countEl.textContent = c > 0 ? String(c) : "";
        iconEl.style.visibility = c > 0 ? "visible" : "hidden";
        nameEl.style.visibility = c > 0 ? "visible" : "hidden";
        iconEl.style.opacity = "1";
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

  // 満腹度ゲージ (肉アイコン 10 個)
  const hungerEl = document.getElementById("hunger");
  const foodFills = [];
  for (let i = 0; i < 10; i++) {
    const f = document.createElement("span");
    f.className = "food";
    const base = document.createElement("span");
    base.className = "base";
    base.textContent = "🍖";
    const fill = document.createElement("span");
    fill.className = "fill";
    fill.textContent = "🍖";
    f.append(base, fill);
    hungerEl.appendChild(f);
    foodFills.push(fill);
  }
  let lastFood = -1;

  // 防御ポイントゲージ (盾アイコン 10 個 = 20 ポイント。ステータスバーの上の段に表示)
  const armorBarEl = document.createElement("div");
  armorBarEl.id = "armorbar";
  const statusBarsForArmor = heartsEl.parentNode;
  statusBarsForArmor.parentNode.insertBefore(armorBarEl, statusBarsForArmor);
  const armorIcons = [];
  for (let i = 0; i < 10; i++) {
    const s = document.createElement("span");
    s.className = "shield";
    s.textContent = "🛡";
    armorBarEl.appendChild(s);
    armorIcons.push(s);
  }
  function updateArmorHud() {
    const pts = player.armorPoints;
    armorBarEl.style.display = (gameMode === "survival" && pts > 0) ? "flex" : "none";
    for (let i = 0; i < 10; i++) {
      armorIcons[i].classList.toggle("on", pts >= (i + 1) * 2 - 1);
    }
  }
  syncArmor(); // 保存済みの装備を反映

  // ボス HP バー (エンダードラゴン / ウィザー戦で画面上部に表示)
  const bossBarEl = document.createElement("div");
  bossBarEl.id = "bossbar";
  bossBarEl.innerHTML = '<div class="boss-label"></div><div class="boss-track"><div class="boss-fill"></div></div>';
  document.body.appendChild(bossBarEl);
  const bossLabelEl = bossBarEl.querySelector(".boss-label");
  const bossFillEl = bossBarEl.querySelector(".boss-fill");
  function updateBossBar() {
    let name = null, hp = 0, max = 1;
    const d = mobs.dragon;
    if (d && !d.dead && world.isInEnd(player.pos[0], player.pos[2])) {
      name = "エンダードラゴン";
      hp = d.health; max = d.maxHealth;
    } else {
      // ウィザー戦もボスバー対象 (近くにいるときだけ)
      for (const m of mobs.mobs) {
        if (m.type === "wither_boss" && !m.dead) {
          const dx = m.pos[0] - player.pos[0], dz = m.pos[2] - player.pos[2];
          if (dx * dx + dz * dz < 80 * 80) { name = "ウィザー"; hp = m.health; max = m.def.health; }
          break;
        }
      }
    }
    bossBarEl.style.display = name ? "block" : "none";
    if (name) {
      bossLabelEl.textContent = name;
      bossFillEl.style.width = Math.max(0, hp / max * 100).toFixed(1) + "%";
    }
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
    // クリエイティブでは体力 / 酸素 / 満腹度を表示しない (本家準拠)
    statusBarsEl.style.visibility = gameMode === "creative" ? "hidden" : "visible";
    updateHotbarCounts();
    updateModeBtn();
  }

  function setMode(m) {
    gameMode = m;
    localStorage.setItem("mcjs_mode", m);
    player.creative = m === "creative";
    if (m === "survival") player.flying = false;
    applyModeUI();
    updateArmorHud();
    showToast(m === "survival" ? "サバイバルモード" : "クリエイティブモード");
  }

  // ポーズ画面のモード切替ボタン (スマホでも切替できるように)
  const modeBtn = document.getElementById("mode-btn");
  modeBtn.addEventListener("click", () => {
    setMode(gameMode === "survival" ? "creative" : "survival");
  });
  function updateModeBtn() {
    modeBtn.textContent =
      "モード: " + (gameMode === "survival" ? "サバイバル" : "クリエイティブ") + " (押して切替)";
  }
  applyModeUI();

  // 新しいワールドの生成 (N キー / ポーズ画面のボタン)。
  // prompt() はスマホのフルスクリーン中にブラウザが無視するため,
  // ページ内のモーダルダイアログで入力を受け付ける
  const newWorldModal = document.createElement("div");
  newWorldModal.id = "newworld-modal";
  newWorldModal.className = "hidden";
  newWorldModal.innerHTML =
    '<div class="nw-inner">' +
    '<h2>🌍 新しいワールドを作る</h2>' +
    '<p>シード値を入力してください (空欄でランダム)。<br>現在のワールドは保存されたままです。</p>' +
    '<input type="text" id="nw-seed" placeholder="シード値 (任意)" autocomplete="off">' +
    '<div class="nw-buttons">' +
    '<button id="nw-create">作成</button>' +
    '<button id="nw-cancel">キャンセル</button>' +
    "</div></div>";
  document.body.appendChild(newWorldModal);

  function startNewWorldFlow() {
    document.exitPointerLock();
    newWorldModal.classList.remove("hidden");
    document.getElementById("nw-seed").value = "";
  }
  function createNewWorld() {
    const input = document.getElementById("nw-seed").value;
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
  }
  document.getElementById("nw-create").addEventListener("click", createNewWorld);
  document.getElementById("nw-cancel").addEventListener("click", () => {
    newWorldModal.classList.add("hidden");
  });
  newWorldModal.addEventListener("click", (e) => {
    if (e.target === newWorldModal) newWorldModal.classList.add("hidden");
  });
  document.getElementById("newworld-btn").addEventListener("click", startNewWorldFlow);

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
    // 満腹度 (0.5 刻み)
    const foodHalf = Math.round(player.food * 2) / 2;
    if (foodHalf !== lastFood) {
      lastFood = foodHalf;
      for (let i = 0; i < 10; i++) {
        const v = player.food - i * 2;
        foodFills[i].style.width = v >= 2 ? "100%" : v >= 1 ? "50%" : "0";
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

  // カテゴリタブ (ブロックが多いので絞り込めるように)
  const INV_CATS = [
    ["all", "すべて"], ["nature", "自然"], ["build", "建材"],
    ["color", "彩色"], ["original", "オリジナル"], ["tool", "道具"],
  ];
  let invFilter = "all";
  const NATURE_IDS = new Set([
    B.GRASS, B.DIRT, B.STONE, B.SAND, B.LOG, B.LEAVES, B.SNOW,
    B.COAL_ORE, B.IRON_ORE, B.GOLD_ORE, B.DIAMOND_ORE, B.GRAVEL,
    B.TALL_GRASS, B.FLOWER_YELLOW, B.FLOWER_RED, B.WHEAT_0, B.WHEAT_1,
    B.WHEAT_2, B.ICE, B.PUMPKIN, B.OBSIDIAN, B.BIRCH_LOG, B.DARK_LOG,
    B.FARMLAND,
  ]);
  function invCategory(id) {
    if (ITEMS[id]) return "tool";
    if (id >= 140) return "original";
    if (NATURE_IDS.has(id)) return "nature";
    if (id === B.WOOL ||
        (id >= WOOL_ID_BASE && id < WOOL_ID_BASE + WOOL_COLORS.length) ||
        (id >= SGLASS_ID_BASE && id < SGLASS_ID_BASE + SGLASS_COLORS.length) ||
        (id >= TERRA_ID_BASE && id < TERRA_ID_BASE + TERRA_COLORS.length) ||
        (id >= CARPET_ID_BASE && id < CARPET_ID_BASE + 13)) return "color";
    return "build";
  }
  const invTabsEl = document.createElement("div");
  invTabsEl.className = "inv-tabs";
  INV_CATS.forEach(([cat, jp]) => {
    const btn = document.createElement("button");
    btn.textContent = jp;
    btn.className = cat === invFilter ? "active" : "";
    btn.addEventListener("click", () => {
      invFilter = cat;
      invTabsEl.querySelectorAll("button").forEach((b) => b.classList.toggle("active", b === btn));
      refreshInventoryCounts();
    });
    invTabsEl.appendChild(btn);
  });
  inventoryGrid.parentNode.insertBefore(invTabsEl, inventoryGrid);

  const gridDefs = [
    ...BLOCKS.filter((b) => b && b.id !== B.AIR && b.id !== B.WATER && b.id !== B.BEDROCK &&
      !(b.fluid && !b.fluidSource) &&     // 流れる水/マグマは持ち物に出さない
      !(b.stairs && b.stairDir !== 0)),   // 階段は方向違いの重複表示を避け, 基準の1つだけ出す
    ...Object.values(ITEMS),
  ];
  for (const block of gridDefs) {
    const item = document.createElement("div");
    item.className = "inv-item";
    item.dataset.blockId = String(block.id);
    item.dataset.cat = invCategory(block.id);
    const icon = document.createElement("canvas");
    icon.width = icon.height = 48;
    drawBlockIcon(icon, block.id, atlas);
    const label = document.createElement("span");
    label.textContent = block.jp;
    const badge = document.createElement("span");
    badge.className = "count";
    item.append(icon, label, badge);
    item.addEventListener("click", () => {
      // 防具はクリックで装備 / 解除 (ホットバーには入れない)
      if (getDef(block.id).armor) {
        equipArmor(block.id);
        refreshInventoryCounts();
        return;
      }
      HOTBAR_BLOCKS[selectedSlot] = block.id;
      drawBlockIcon(slotEls[selectedSlot].querySelector("canvas"), block.id, atlas);
      slotEls[selectedSlot].querySelector(".name").textContent = block.jp;
      localStorage.setItem("mcjs_hotbar", JSON.stringify(HOTBAR_BLOCKS));
      updateHotbarCounts();
      closeInventory();
    });
    inventoryGrid.appendChild(item);
  }

  // ---------------- クラフト (サバイバル) ----------------

  const RECIPES = [
    { out: B.PLANK, outN: 4, in: [[B.LOG, 1]] },
    { out: B.TORCH, outN: 4, in: [[B.PLANK, 2]] },
    { out: B.TORCH, outN: 8, in: [[B.COAL_ORE, 1], [B.PLANK, 1]] },
    // 道具
    { out: I.WOOD_PICK, outN: 1, in: [[B.PLANK, 3]] },
    { out: I.STONE_PICK, outN: 1, in: [[B.COBBLE, 3], [B.PLANK, 2]] },
    { out: I.IRON_PICK, outN: 1, in: [[I.IRON_INGOT, 3], [B.PLANK, 2]] },
    { out: I.DIAMOND_PICK, outN: 1, in: [[I.DIAMOND, 3], [B.PLANK, 2]] },
    { out: I.WOOD_SWORD, outN: 1, in: [[B.PLANK, 2]] },
    { out: I.BOW, outN: 1, in: [[B.PLANK, 3]] },
    { out: I.STONE_SWORD, outN: 1, in: [[B.COBBLE, 2], [B.PLANK, 1]] },
    { out: I.IRON_SWORD, outN: 1, in: [[I.IRON_INGOT, 2], [B.PLANK, 1]] },
    { out: I.DIAMOND_SWORD, outN: 1, in: [[I.DIAMOND, 2], [B.PLANK, 1]] },
    // 精錬 (木材を燃料に)
    { out: I.IRON_INGOT, outN: 1, in: [[B.IRON_ORE, 1], [B.PLANK, 1]] },
    { out: I.GOLD_INGOT, outN: 1, in: [[B.GOLD_ORE, 1], [B.PLANK, 1]] },
    { out: B.GLASS, outN: 2, in: [[B.SAND, 2]] },
    { out: B.STONE, outN: 2, in: [[B.COBBLE, 2]] },
    { out: B.BRICK, outN: 2, in: [[B.STONE, 2]] },
    { out: B.TNT, outN: 2, in: [[B.SAND, 4], [B.COAL_ORE, 1]] },
    { out: B.CHEST, outN: 1, in: [[B.PLANK, 8]] },
    { out: B.BED, outN: 1, in: [[B.WOOL, 3], [B.PLANK, 3]] },
    { out: B.STONE_SLAB, outN: 4, in: [[B.STONE, 2]] },
    { out: B.PLANK_SLAB, outN: 4, in: [[B.PLANK, 2]] },
    { out: I.BREAD, outN: 1, in: [[I.WHEAT, 3]] },
    { out: B.STONE_BRICK, outN: 4, in: [[B.STONE, 4]] },
    { out: B.SANDSTONE, outN: 1, in: [[B.SAND, 4]] },
    { out: B.BOOKSHELF, outN: 1, in: [[B.PLANK, 6]] },
    // 装飾ブロック
    { out: B.GOLD_BLOCK, outN: 1, in: [[I.GOLD_INGOT, 4]] },
    { out: B.DIAMOND_BLOCK, outN: 1, in: [[I.DIAMOND, 4]] },
    { out: B.GLOWSTONE, outN: 1, in: [[B.TORCH, 4], [B.GLASS, 1]] },
    // 石材バリエーション
    { out: B.SMOOTH_STONE, outN: 1, in: [[B.STONE, 1]] },
    { out: B.CRACKED_STONE_BRICK, outN: 1, in: [[B.STONE_BRICK, 1]] },
    { out: B.CHISELED_STONE_BRICK, outN: 2, in: [[B.STONE_BRICK, 2]] },
    { out: B.GRANITE, outN: 2, in: [[B.STONE, 1], [B.SAND, 1]] },
    { out: B.DIORITE, outN: 2, in: [[B.STONE, 1], [B.GRAVEL, 1]] },
    { out: B.ANDESITE, outN: 2, in: [[B.COBBLE, 1], [B.GRAVEL, 1]] },
    { out: B.QUARTZ, outN: 1, in: [[B.SANDSTONE, 2]] },
    { out: B.DARK_BRICK, outN: 2, in: [[B.BRICK, 2]] },
    // 木材バリエーション
    { out: B.BIRCH_PLANK, outN: 1, in: [[B.PLANK, 1]] },
    { out: B.DARK_PLANK, outN: 1, in: [[B.PLANK, 1]] },
    // ハーフブロック
    { out: B.STONE_BRICK_SLAB, outN: 4, in: [[B.STONE_BRICK, 2]] },
    { out: B.BRICK_SLAB, outN: 4, in: [[B.BRICK, 2]] },
    { out: B.SANDSTONE_SLAB, outN: 4, in: [[B.SANDSTONE, 2]] },
    // 階段 (north 向きが基本の見た目で、設置時にプレイヤーの向きへ自動回転する)
    { out: STAIR_ID_BASE + 0 * 4, outN: 2, in: [[B.STONE, 3]] },
    { out: STAIR_ID_BASE + 1 * 4, outN: 2, in: [[B.COBBLE, 3]] },
    { out: STAIR_ID_BASE + 2 * 4, outN: 2, in: [[B.PLANK, 3]] },
    { out: STAIR_ID_BASE + 3 * 4, outN: 2, in: [[B.STONE_BRICK, 3]] },
    { out: STAIR_ID_BASE + 4 * 4, outN: 2, in: [[B.BRICK, 3]] },
    { out: STAIR_ID_BASE + 5 * 4, outN: 2, in: [[B.SANDSTONE, 3]] },
    { out: I.BUCKET, outN: 1, in: [[I.IRON_INGOT, 3]] },
    // 建具・作業台 (north 向きが基本の見た目で、設置時にプレイヤーの向きへ自動回転する)
    { out: B.CRAFTING_TABLE, outN: 1, in: [[B.PLANK, 4]] },
    { out: DOOR_ID_BASE, outN: 1, in: [[B.PLANK, 3]] },
    { out: B.FENCE_PLANK, outN: 2, in: [[B.PLANK, 2]] },
    { out: B.GLASS_PANE, outN: 4, in: [[B.GLASS, 2]] },
    { out: B.PURPUR, outN: 4, in: [[B.CHORUS_FLOWER, 1]] },
    // 防具 (本家準拠の素材数。作業台が必要)
    { out: I.IRON_HELMET, outN: 1, in: [[I.IRON_INGOT, 5]] },
    { out: I.IRON_CHESTPLATE, outN: 1, in: [[I.IRON_INGOT, 8]] },
    { out: I.IRON_LEGGINGS, outN: 1, in: [[I.IRON_INGOT, 7]] },
    { out: I.IRON_BOOTS, outN: 1, in: [[I.IRON_INGOT, 4]] },
    { out: I.GOLD_HELMET, outN: 1, in: [[I.GOLD_INGOT, 5]] },
    { out: I.GOLD_CHESTPLATE, outN: 1, in: [[I.GOLD_INGOT, 8]] },
    { out: I.GOLD_LEGGINGS, outN: 1, in: [[I.GOLD_INGOT, 7]] },
    { out: I.GOLD_BOOTS, outN: 1, in: [[I.GOLD_INGOT, 4]] },
    { out: I.DIAMOND_HELMET, outN: 1, in: [[I.DIAMOND, 5]] },
    { out: I.DIAMOND_CHESTPLATE, outN: 1, in: [[I.DIAMOND, 8]] },
    { out: I.DIAMOND_LEGGINGS, outN: 1, in: [[I.DIAMOND, 7]] },
    { out: I.DIAMOND_BOOTS, outN: 1, in: [[I.DIAMOND, 4]] },
  ];

  // 色付き羊毛: 羊毛 1 → 各色 1
  WOOL_COLORS.forEach((_, i) => {
    RECIPES.push({ out: WOOL_ID_BASE + i, outN: 1, in: [[B.WOOL, 1]] });
  });
  // 色付きガラス: ガラス 1 + 対応する色の羊毛 1
  SGLASS_COLORS.forEach(([name], i) => {
    const wi = WOOL_COLORS.findIndex(([wn]) => wn === name);
    RECIPES.push({
      out: SGLASS_ID_BASE + i, outN: 1,
      in: [[B.GLASS, 1], [WOOL_ID_BASE + (wi >= 0 ? wi : 0), 1]],
    });
  });
  // テラコッタ: 土 1 + 砂 1 → 2
  TERRA_COLORS.forEach((_, i) => {
    RECIPES.push({ out: TERRA_ID_BASE + i, outN: 2, in: [[B.DIRT, 1], [B.SAND, 1]] });
  });
  // カーペット: 対応する羊毛 1 → 2
  RECIPES.push({ out: CARPET_ID_BASE, outN: 2, in: [[B.WOOL, 1]] });
  WOOL_COLORS.forEach((_, i) => {
    RECIPES.push({ out: CARPET_ID_BASE + 1 + i, outN: 2, in: [[WOOL_ID_BASE + i, 1]] });
  });
  // 原木バリエーション / ランタン / 鉱物ブロック
  RECIPES.push(
    { out: B.BIRCH_LOG, outN: 1, in: [[B.LOG, 1]] },
    { out: B.DARK_LOG, outN: 1, in: [[B.LOG, 1]] },
    { out: B.JACK_O_LANTERN, outN: 1, in: [[B.PUMPKIN, 1], [B.TORCH, 1]] },
    { out: B.IRON_BLOCK, outN: 1, in: [[I.IRON_INGOT, 4]] },
    { out: B.COAL_BLOCK, outN: 1, in: [[B.COAL_ORE, 2]] },
  );
  // オリジナル建築ブロック
  const NEON_WOOL = [0, 6, 4, 8, 5, 2]; // 赤,青,緑,桃,空色,黄 に対応する羊毛
  NEON_COLORS.forEach((_, i) => {
    RECIPES.push({
      out: NEON_ID_BASE + i, outN: 2,
      in: [[B.GLOWSTONE, 1], [WOOL_ID_BASE + NEON_WOOL[i], 1]],
    });
  });
  RECIPES.push(
    { out: B.MARBLE, outN: 2, in: [[B.STONE, 2]] },
    { out: B.MARBLE_BLACK, outN: 2, in: [[B.STONE, 1], [B.COAL_ORE, 1]] },
    { out: B.CHECKER, outN: 2, in: [[B.MARBLE, 1], [B.MARBLE_BLACK, 1]] },
    { out: B.TATAMI, outN: 2, in: [[I.WHEAT, 2], [B.PLANK, 1]] },
    { out: B.SHOJI, outN: 4, in: [[B.PLANK, 2], [B.WOOL, 1]] },
    { out: B.VERMILION, outN: 4, in: [[B.PLANK, 2], [WOOL_ID_BASE, 1]] },
    { out: B.COPPER, outN: 2, in: [[I.IRON_INGOT, 1], [WOOL_ID_BASE + 1, 1]] },
    { out: B.COPPER_OXIDIZED, outN: 1, in: [[B.COPPER, 1]] },
    { out: B.CRYSTAL, outN: 4, in: [[I.DIAMOND, 1], [B.GLASS, 2]] },
    { out: B.LAVA_BLOCK, outN: 2, in: [[B.OBSIDIAN, 1], [B.COAL_ORE, 1]] },
    { out: B.ASPHALT, outN: 4, in: [[B.GRAVEL, 2], [B.COAL_ORE, 1]] },
    { out: B.ROAD_LINE, outN: 2, in: [[B.ASPHALT, 2]] },
    { out: B.THATCH, outN: 2, in: [[I.WHEAT, 3]] },
    { out: B.STEEL, outN: 4, in: [[I.IRON_INGOT, 2], [B.COAL_ORE, 1]] },
    { out: B.HAZARD, outN: 4, in: [[WOOL_ID_BASE + 2, 1], [WOOL_ID_BASE + 10, 1]] },
    { out: B.PILLAR, outN: 2, in: [[B.MARBLE, 2]] },
    { out: B.CLOUD, outN: 2, in: [[B.WOOL, 2]] },
  );
  // コンクリート (石 + 対応色の羊毛)。白のみ白羊毛 (B.WOOL) を使う
  const CONCRETE_WOOL = [-1, 9, 10, 0, 1, 2, 4, 6]; // 白,灰,黒,赤,橙,黄,緑,青
  CONCRETE_COLORS.forEach((_, i) => {
    const wool = CONCRETE_WOOL[i] < 0 ? B.WOOL : WOOL_ID_BASE + CONCRETE_WOOL[i];
    RECIPES.push({ out: CONCRETE_ID_BASE + i, outN: 4, in: [[B.STONE, 2], [wool, 1]] });
  });

  // 追加の道具
  RECIPES.push(
    // 斧
    { out: I.WOOD_AXE, outN: 1, in: [[B.PLANK, 3]] },
    { out: I.STONE_AXE, outN: 1, in: [[B.COBBLE, 3], [B.PLANK, 2]] },
    { out: I.IRON_AXE, outN: 1, in: [[I.IRON_INGOT, 3], [B.PLANK, 2]] },
    { out: I.DIAMOND_AXE, outN: 1, in: [[I.DIAMOND, 3], [B.PLANK, 2]] },
    // シャベル
    { out: I.WOOD_SHOVEL, outN: 1, in: [[B.PLANK, 2]] },
    { out: I.STONE_SHOVEL, outN: 1, in: [[B.COBBLE, 1], [B.PLANK, 2]] },
    { out: I.IRON_SHOVEL, outN: 1, in: [[I.IRON_INGOT, 1], [B.PLANK, 2]] },
    { out: I.DIAMOND_SHOVEL, outN: 1, in: [[I.DIAMOND, 1], [B.PLANK, 2]] },
    // クワ
    { out: I.WOOD_HOE, outN: 1, in: [[B.PLANK, 3]] },
    { out: I.STONE_HOE, outN: 1, in: [[B.COBBLE, 2], [B.PLANK, 2]] },
    { out: I.IRON_HOE, outN: 1, in: [[I.IRON_INGOT, 2], [B.PLANK, 2]] },
    { out: I.DIAMOND_HOE, outN: 1, in: [[I.DIAMOND, 2], [B.PLANK, 2]] },
    // 金の道具 / その他
    { out: I.GOLD_PICK, outN: 1, in: [[I.GOLD_INGOT, 3], [B.PLANK, 2]] },
    { out: I.GOLD_SWORD, outN: 1, in: [[I.GOLD_INGOT, 2], [B.PLANK, 1]] },
    { out: I.SHEARS, outN: 1, in: [[I.IRON_INGOT, 2]] },
    { out: I.FISHING_ROD, outN: 1, in: [[B.PLANK, 3], [B.WOOL, 1]] },
    // エンダードラゴン討伐に向けて: エンダーパール + 火薬 → エンダーアイ
    { out: I.EYE_OF_ENDER, outN: 1, in: [[I.ENDER_PEARL, 1], [I.GUNPOWDER, 1]] },
    // ネザーへ渡るための道具と素材
    { out: I.FLINT_AND_STEEL, outN: 1, in: [[I.IRON_INGOT, 1], [I.FLINT, 1]] },
    { out: B.QUARTZ, outN: 1, in: [[I.NETHER_QUARTZ, 1]] },
    { out: B.NETHER_BRICK, outN: 2, in: [[B.NETHERRACK, 2], [B.COAL_ORE, 1]] },
    // ナビゲーション
    { out: I.COMPASS, outN: 1, in: [[I.IRON_INGOT, 4]] },
  );

  const craftSectionEl = document.getElementById("craft-section");
  const craftListEl = document.getElementById("craft-list");
  const craftRows = [];

  for (const recipe of RECIPES) {
    const row = document.createElement("div");
    row.className = "craft-row";
    const icon = document.createElement("canvas");
    icon.width = icon.height = 40;
    drawBlockIcon(icon, recipe.out, atlas);
    const desc = document.createElement("span");
    desc.className = "craft-desc";
    const btn = document.createElement("button");
    btn.textContent = "作成";
    btn.addEventListener("click", () => {
      if (!canCraft(recipe)) return;
      for (const [id, n] of recipe.in) {
        invCounts.set(id, (invCounts.get(id) || 0) - n);
      }
      invDirty = true;
      addItem(recipe.out, recipe.outN);
      // 道具はホットバーに自動セット (空きが優先, なければ選択枠)
      const outDef = getDef(recipe.out);
      if (outDef.tool && !HOTBAR_BLOCKS.includes(recipe.out)) {
        HOTBAR_BLOCKS[selectedSlot] = recipe.out;
        drawBlockIcon(slotEls[selectedSlot].querySelector("canvas"), recipe.out, atlas);
        slotEls[selectedSlot].querySelector(".name").textContent = outDef.jp;
        localStorage.setItem("mcjs_hotbar", JSON.stringify(HOTBAR_BLOCKS));
        updateHotbarCounts();
      }
      sound.pickup();
      refreshCraftUI();
      refreshInventoryCounts();
    });
    row.append(icon, desc, btn);
    craftListEl.appendChild(row);
    craftRows.push({ recipe, desc, btn });
  }

  // 道具レシピは作業台の近く (半径4ブロック以内) でしかクラフトできない
  // (クリエイティブでは制限なし)
  function recipeNeedsTable(recipe) {
    const def = getDef(recipe.out);
    return !!(def.tool || def.armor);
  }
  function nearCraftingTable() {
    const px = Math.floor(player.pos[0]), py = Math.floor(player.pos[1]), pz = Math.floor(player.pos[2]);
    for (let dx = -4; dx <= 4; dx++)
      for (let dy = -2; dy <= 2; dy++)
        for (let dz = -4; dz <= 4; dz++)
          if (world.getBlock(px + dx, py + dy, pz + dz) === B.CRAFTING_TABLE) return true;
    return false;
  }

  function canCraft(recipe) {
    if (gameMode !== "creative" && recipeNeedsTable(recipe) && !nearCraftingTable()) return false;
    return recipe.in.every(([id, n]) => (invCounts.get(id) || 0) >= n);
  }

  function refreshCraftUI() {
    const tableNearby = gameMode === "creative" || nearCraftingTable();
    for (const { recipe, desc, btn } of craftRows) {
      const parts = recipe.in.map(([id, n]) => {
        const have = invCounts.get(id) || 0;
        const cls = have >= n ? "" : ' class="lack"';
        return `<span${cls}>${getDef(id).jp} ×${n} (所持 ${have})</span>`;
      });
      const needsTable = recipeNeedsTable(recipe) && !tableNearby;
      const tableNote = needsTable ? ' <span class="lack">(作業台が近くに必要)</span>' : "";
      desc.innerHTML = `${getDef(recipe.out).jp} ×${recipe.outN} ← ` + parts.join(" + ") + tableNote;
      btn.disabled = !canCraft(recipe);
    }
  }

  // インベントリのブロック一覧: サバイバルでは持っている物だけを表示
  let invEmptyNote = null;

  function refreshInventoryCounts() {
    const els = inventoryGrid.querySelectorAll(".inv-item");
    let visible = 0;
    els.forEach((el) => {
      const id = parseInt(el.dataset.blockId, 10);
      const badge = el.querySelector(".count");
      if (invFilter !== "all" && el.dataset.cat !== invFilter) {
        el.style.display = "none";
        return;
      }
      // 装備中の防具は所持数 0 でも表示し, クリックで外せるようにする
      const def = getDef(id);
      const equipped = !!(def && def.armor && equippedArmor[def.armor.slot] &&
        equippedArmor[def.armor.slot].id === id);
      el.classList.toggle("equipped", equipped);
      if (gameMode === "creative") {
        badge.textContent = equipped ? "装備中" : "";
        el.style.opacity = "1";
        el.style.display = "";
        visible++;
      } else {
        const c = invCounts.get(id) || 0;
        badge.textContent = equipped ? "装備中" : (c > 0 ? String(c) : "");
        el.style.display = (c > 0 || equipped) ? "" : "none";
        el.style.opacity = "1";
        if (c > 0 || equipped) visible++;
      }
    });
    // 何も持っていないときの案内
    if (!invEmptyNote) {
      invEmptyNote = document.createElement("div");
      invEmptyNote.className = "empty-note";
      invEmptyNote.textContent = "(まだ何も持っていない — ブロックを掘って集めよう)";
      inventoryGrid.appendChild(invEmptyNote);
    }
    invEmptyNote.textContent = invFilter === "all"
      ? "(まだ何も持っていない — ブロックを掘って集めよう)"
      : "(このカテゴリに表示できるものがない)";
    invEmptyNote.style.display = visible === 0 ? "" : "none";
  }

  function openInventory() {
    inventoryOpen = true;
    inventoryEl.classList.remove("hidden");
    craftSectionEl.classList.toggle("hidden", gameMode !== "survival");
    refreshCraftUI();
    refreshInventoryCounts();
    document.exitPointerLock();
  }

  function closeInventory() {
    inventoryOpen = false;
    inventoryEl.classList.add("hidden");
    if (!isTouch) canvas.requestPointerLock();
  }

  // モーダルの背景タップで閉じる (スマホ向け)
  inventoryEl.addEventListener("click", (e) => {
    if (e.target === inventoryEl) closeInventory();
  });

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
  const virt = { fwd: 0, strafe: 0, jump: false, sneak: false, sprint: false };
  if (isTouch) document.body.classList.add("touch");

  function lockPointer() {
    canvas.requestPointerLock();
  }

  // スマホ: 全画面 + 横画面に固定する (ユーザー操作の中で呼ぶこと)
  async function enterLandscape() {
    try {
      if (document.documentElement.requestFullscreen && !document.fullscreenElement) {
        await document.documentElement.requestFullscreen({ navigationUI: "hide" });
      }
    } catch (e) { /* 非対応環境は無視 */ }
    try {
      if (screen.orientation && screen.orientation.lock) {
        await screen.orientation.lock("landscape");
      }
    } catch (e) { /* iOS Safari 等は縦向き警告で代替 */ }
  }

  // 縦向きのままプレイしようとしたら回転を促す
  const rotateOverlayEl = document.getElementById("rotate-overlay");
  function updateRotateOverlay() {
    const portrait = window.matchMedia("(orientation: portrait)").matches;
    rotateOverlayEl.classList.toggle("hidden", !(isTouch && !paused && portrait));
  }
  window.addEventListener("resize", updateRotateOverlay);
  window.matchMedia("(orientation: portrait)").addEventListener?.("change", updateRotateOverlay);

  document.getElementById("play-btn").addEventListener("click", () => {
    sound.ensure();
    if (isTouch) {
      enterLandscape();
      paused = false;
      overlay.classList.add("hidden");
      updateRotateOverlay();
    } else {
      lockPointer();
    }
  });

  canvas.addEventListener("click", () => {
    if (paused && !isTouch) lockPointer();
  });

  document.addEventListener("pointerlockchange", () => {
    paused = document.pointerLockElement !== canvas;
    // インベントリ / チェストを開いている間はポーズ画面を出さない
    overlay.classList.toggle("hidden", !paused || inventoryOpen || chestOpen);
    if (paused) {
      keys.clear();
      heldButtons.clear();
    } else {
      if (inventoryOpen) {
        inventoryOpen = false;
        inventoryEl.classList.add("hidden");
      }
      if (chestOpen) {
        chestOpen = false;
        chestModalEl.classList.add("hidden");
      }
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
    // インベントリ / チェストが開いている間は E / Esc で閉じるだけ
    if (inventoryOpen) {
      if (e.code === "KeyE" || e.code === "Escape") closeInventory();
      return;
    }
    if (chestOpen) {
      if (e.code === "KeyE" || e.code === "Escape") closeChest();
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
      case "KeyN":
        startNewWorldFlow();
        break;
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

  // ピックブロック (ミドルクリック): 見ているブロックをホットバーの選択枠へ
  function pickBlock() {
    const hit = player.raycast();
    if (!hit) return;
    const def = BLOCKS[hit.id];
    if (!def) return;
    if (gameMode === "survival" && (invCounts.get(hit.id) || 0) <= 0) {
      showToast(def.jp + " はまだ持っていない");
      return;
    }
    HOTBAR_BLOCKS[selectedSlot] = hit.id;
    drawBlockIcon(slotEls[selectedSlot].querySelector("canvas"), hit.id, atlas);
    slotEls[selectedSlot].querySelector(".name").textContent = def.jp;
    localStorage.setItem("mcjs_hotbar", JSON.stringify(HOTBAR_BLOCKS));
    updateHotbarCounts();
  }

  canvas.addEventListener("mousedown", (e) => {
    if (paused) return;
    heldButtons.add(e.button);
    if (e.button === 1) {
      e.preventDefault();
      pickBlock();
      return;
    }
    if (e.button === 0) {
      swingTimer = 0;
      if (tryPunch()) return;
      const hit = player.raycast();
      if (hit && hit.id === B.TNT) {
        igniteTNT(hit.pos[0], hit.pos[1], hit.pos[2]);
        actionCooldown = ACTION_REPEAT;
        return;
      }
      if (gameMode === "creative") {
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

  const MAX_PARTICLES = 900;
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
      // 地面で跳ねずに止まる (雨粒は着地で消える)
      if (world.isSolidAt(Math.floor(nx), Math.floor(ny), Math.floor(nz))) {
        if (p.rain) { particles.splice(i, 1); continue; }
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

  // ---------------- ランダムティック (作物の成長) ----------------

  let randomTickTimer = 0;

  function updateRandomTicks(dt) {
    randomTickTimer += dt;
    if (randomTickTimer < 0.25) return;
    randomTickTimer = 0;
    const pcx = Math.floor(player.pos[0]) >> 4;
    const pcz = Math.floor(player.pos[2]) >> 4;
    // チャンクごとにランダムなセルを叩く (本家のランダムティック方式)。
    // ワールドの高さが 128 に拡張された分, 密度が薄まらないよう回数も増やす
    const ticksPerChunk = 80 * (CHUNK_H / 64);
    for (let dz = -2; dz <= 2; dz++) {
      for (let dx = -2; dx <= 2; dx++) {
        const chunk = world.getChunk(pcx + dx, pcz + dz);
        if (!chunk || !chunk.generated) continue;
        for (let k = 0; k < ticksPerChunk; k++) {
          const i = (Math.random() * chunk.data.length) | 0;
          const id = chunk.data[i];
          if (id === B.WHEAT_0 || id === B.WHEAT_1) {
            const lx = i & 15, lz = (i >> 4) & 15, ly = i >> 8;
            // 農地の上なら2倍の速さで育つ
            const below = ly > 0 ? chunk.get(lx, ly - 1, lz) : 0;
            const p = below === B.FARMLAND ? 1.0 : 0.5;
            if (Math.random() < p) {
              world.setBlock(chunk.cx * 16 + lx, ly, chunk.cz * 16 + lz, id + 1);
            }
          }
        }
      }
    }
  }

  // ---------------- 水/マグマの流動 (本家準拠のレベル制シミュレーション) ----------------
  // 水源はレベル8 / マグマ源はレベル4。流れブロックは供給元より 1 低いレベルを
  // 持ち (ブロック ID にエンコード, blocks.js の WATER_FLOW_BASE / LAVA_FLOW_BASE),
  // レベルが低いほど水面が低く描画される。ルールは本家準拠:
  //   - 下へ落ちられる間は横に広がらない。落下柱は満水位で, 着地点から改めて全幅で広がる
  //   - 水は 4 ブロック以内にある「落ちられる穴」への最短方向だけに流れる
  //     (重力で低い地形へ吸い寄せられる挙動)。穴が無ければ全方向へ
  //   - 供給が絶たれた流れは再計算で段階的に引いて消える (水源をすくうと乾く)
  //   - マグマはゆっくり流れ (4ティックに1回), 水と触れると黒曜石/丸石/石になる
  const fluidQueue = new Set();     // "x,y,z" (次に再計算するセル)
  const FLUID_BUDGET = 80;          // 1 ティックで処理する上限 (負荷対策)
  const FLUID_DIRS6 = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
  const FLUID_DIRS4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];

  const fluidMax = (type) => type === "water" ? 8 : 4;          // 源のレベル
  const fluidMaxFlow = (type) => type === "water" ? 7 : 3;      // 流れの最大レベル (落下柱)
  const fluidFlowId = (type, lv) => type === "water"
    ? WATER_FLOW_BASE + Math.min(lv, 7) - 1
    : LAVA_FLOW_BASE + Math.min(lv, 3) - 1;

  // 流体がレベル lv で入り込めるマスか (空気 / 草花 / より低いレベルの同種の流れ)
  function fluidCanEnter(id, type, lv) {
    if (id === B.AIR) return true;
    const b = BLOCKS[id];
    if (b.cross) return true;   // 草花・小麦は押し流す
    return b.fluid === type && !b.fluidSource && b.fluidLevel < lv;
  }

  function queueFluidCheck(x, y, z) {
    if (BLOCKS[world.getBlock(x, y, z)].fluid) fluidQueue.add(x + "," + y + "," + z);
  }
  // ブロックの破壊/設置で状況が変わったとき, 隣接する流体を再計算の対象にする
  function queueFluidNeighbors(x, y, z) {
    for (const [dx, dy, dz] of FLUID_DIRS6) queueFluidCheck(x + dx, y + dy, z + dz);
  }

  // 水とマグマの接触 (本家準拠): 水に触れたマグマは源なら黒曜石, 流れなら丸石に。
  // マグマが水へ流れ込むと, その水は石になる
  function fluidContact(x, y, z, intoType) {
    const b = BLOCKS[world.getBlock(x, y, z)];
    if (!b.fluid || b.fluid === intoType) return false;
    if (intoType === "water") {
      world.setBlock(x, y, z, b.fluidSource ? B.OBSIDIAN : B.COBBLE);
    } else {
      world.setBlock(x, y, z, B.STONE);
    }
    queueFluidNeighbors(x, y, z);
    return true;
  }

  // このマスを流体 (通り道/落ち先) として通れるか
  function fluidPassable(x, y, z) {
    const b = BLOCKS[world.getBlock(x, y, z)];
    return !b.solid || b.cross;
  }

  // 水の横方向の流れ先: 本家同様, 一歩目から 4 ブロック以内で「下に落ちられる」
  // マスへの最短方向だけに流す。穴が見つからなければ全方向へ広がる
  function waterFlowDirs(x, y, z) {
    const costs = [];
    let best = Infinity;
    for (const [dx, dz] of FLUID_DIRS4) {
      let cost = Infinity;
      const sx = x + dx, sz = z + dz;
      if (fluidPassable(sx, y, sz)) {
        const visited = new Set([sx + "," + sz]);
        let frontier = [[sx, sz]];
        outer:
        for (let d = 0; d < 4 && frontier.length; d++) {
          const next = [];
          for (const [cx, cz] of frontier) {
            if (fluidPassable(cx, y - 1, cz)) { cost = d; break outer; }
            for (const [ex, ez] of FLUID_DIRS4) {
              const tx = cx + ex, tz = cz + ez;
              const k = tx + "," + tz;
              if (visited.has(k)) continue;
              visited.add(k);
              if (fluidPassable(tx, y, tz)) next.push([tx, tz]);
            }
          }
          frontier = next;
        }
      }
      costs.push(cost);
      if (cost < best) best = cost;
    }
    if (best === Infinity) return FLUID_DIRS4;
    return FLUID_DIRS4.filter((_, i) => costs[i] === best);
  }

  let fluidTickTimer = 0, fluidTickNo = 0;
  function updateFluidSpread(dt) {
    fluidTickTimer += dt;
    if (fluidTickTimer < 0.25) return;
    fluidTickTimer = 0;
    fluidTickNo++;
    if (fluidQueue.size === 0) return;
    let budget = FLUID_BUDGET;
    const pending = [...fluidQueue];
    fluidQueue.clear();
    for (const key of pending) {
      const [x, y, z] = key.split(",").map(Number);
      const b = BLOCKS[world.getBlock(x, y, z)];
      if (!b.fluid) continue;
      const type = b.fluid;
      // マグマは本家同様ゆっくり流れる
      if (type === "lava" && fluidTickNo % 4 !== 0) { fluidQueue.add(key); continue; }
      if (budget-- <= 0) { fluidQueue.add(key); continue; }

      // --- 流れブロック: 供給の再計算 (供給が絶たれたら引いていく) ---
      let lv = fluidMax(type);
      if (!b.fluidSource) {
        let wanted = 0;
        if (BLOCKS[world.getBlock(x, y + 1, z)].fluid === type) {
          wanted = fluidMaxFlow(type);   // 上から注がれる落下柱は満水位
        } else {
          for (const [dx, dz] of FLUID_DIRS4) {
            const nb = BLOCKS[world.getBlock(x + dx, y, z + dz)];
            if (nb.fluid === type) wanted = Math.max(wanted, nb.fluidLevel - 1);
          }
        }
        if (wanted <= 0) {           // 供給なし → 消えて, 下流にも再計算を伝える
          world.setBlock(x, y, z, B.AIR);
          queueFluidNeighbors(x, y, z);
          continue;
        }
        if (wanted !== b.fluidLevel) {   // 供給が変わった → レベル更新して伝播
          world.setBlock(x, y, z, fluidFlowId(type, wanted));
          fluidQueue.add(key);
          queueFluidNeighbors(x, y, z);
          continue;
        }
        lv = b.fluidLevel;
      }

      // --- 下へ流れる (落下中は横に広がらない, 本家準拠) ---
      if (fluidContact(x, y - 1, z, type)) continue;
      const belowId = world.getBlock(x, y - 1, z);
      if (fluidCanEnter(belowId, type, fluidMaxFlow(type))) {
        world.setBlock(x, y - 1, z, fluidFlowId(type, fluidMaxFlow(type)));
        queueFluidCheck(x, y - 1, z);
        continue;
      }

      // --- 横へ広がる: 水は近くの穴へ向かう方向を優先 (マグマは全方向) ---
      if (lv <= 1) continue;
      const dirs = type === "water" ? waterFlowDirs(x, y, z) : FLUID_DIRS4;
      for (const [dx, dz] of dirs) {
        const nx = x + dx, nz = z + dz;
        if (fluidContact(nx, y, nz, type)) continue;
        if (fluidCanEnter(world.getBlock(nx, y, nz), type, lv - 1)) {
          world.setBlock(nx, y, nz, fluidFlowId(type, lv - 1));
          queueFluidCheck(nx, y, nz);
        }
      }
    }
  }

  // ---------------- 葉の腐敗 (木を切ると葉が枯れる) ----------------

  const leafDecay = [];         // {x, y, z, t}
  const LEAF_SCAN_R = 4;
  const LEAF_QUEUE_MAX = 400;
  const DIRS6 = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];

  function queueLeafDecayAround(x, y, z) {
    for (let dy = -LEAF_SCAN_R; dy <= LEAF_SCAN_R; dy++) {
      for (let dz = -LEAF_SCAN_R; dz <= LEAF_SCAN_R; dz++) {
        for (let dx = -LEAF_SCAN_R; dx <= LEAF_SCAN_R; dx++) {
          if (leafDecay.length >= LEAF_QUEUE_MAX) return;
          if (world.getBlock(x + dx, y + dy, z + dz) === B.LEAVES) {
            leafDecay.push({ x: x + dx, y: y + dy, z: z + dz, t: 0.6 + Math.random() * 2.5 });
          }
        }
      }
    }
  }

  // 葉づたいに距離4以内へ原木があるか (BFS)
  function hasLogNearby(x, y, z) {
    const visited = new Set([x + "," + y + "," + z]);
    const queue = [[x, y, z, 0]];
    while (queue.length) {
      const [cx, cy, cz, d] = queue.shift();
      if (d >= LEAF_SCAN_R) continue;
      for (const [ox, oy, oz] of DIRS6) {
        const nx = cx + ox, ny = cy + oy, nz = cz + oz;
        const key = nx + "," + ny + "," + nz;
        if (visited.has(key)) continue;
        visited.add(key);
        const id = world.getBlock(nx, ny, nz);
        if (id === B.LOG) return true;
        if (id === B.LEAVES) queue.push([nx, ny, nz, d + 1]);
      }
    }
    return false;
  }

  function updateLeafDecay(dt) {
    let budget = 5; // フレームあたりの枯れ処理数
    for (let i = leafDecay.length - 1; i >= 0; i--) {
      const l = leafDecay[i];
      l.t -= dt;
      if (l.t > 0 || budget <= 0) continue;
      budget--;
      leafDecay.splice(i, 1);
      if (world.getBlock(l.x, l.y, l.z) !== B.LEAVES) continue;
      if (hasLogNearby(l.x, l.y, l.z)) continue;
      world.setBlock(l.x, l.y, l.z, B.AIR);
      spawnBreakParticles(l.x, l.y, l.z, B.LEAVES);
      // 隣の葉も連鎖して枯れる
      for (const [ox, oy, oz] of DIRS6) {
        if (leafDecay.length >= LEAF_QUEUE_MAX) break;
        if (world.getBlock(l.x + ox, l.y + oy, l.z + oz) === B.LEAVES) {
          leafDecay.push({ x: l.x + ox, y: l.y + oy, z: l.z + oz, t: 0.4 + Math.random() * 1.5 });
        }
      }
    }
  }

  // ---------------- 天候 (雨) ----------------

  let raining = false;
  let weatherTimer = 90 + Math.random() * 180;
  let rainAccum = 0;

  function updateWeather(dt) {
    weatherTimer -= dt;
    if (weatherTimer <= 0) {
      raining = !raining;
      weatherTimer = raining ? 50 + Math.random() * 80 : 120 + Math.random() * 240;
      showToast(raining ? "雨が降ってきた" : "雨が上がった");
      if (raining) sound.startRain();
      else sound.stopRain();
    }
    if (!raining) return;

    // プレイヤー周辺に雨粒を撒く
    rainAccum += dt * 110;
    const eye = player.eyePos();
    while (rainAccum >= 1) {
      rainAccum -= 1;
      if (particles.length >= MAX_PARTICLES - 30) break; // 破壊パーティクル用に余裕を残す
      const ang = Math.random() * Math.PI * 2;
      const r = Math.random() * 14;
      particles.push({
        pos: [eye[0] + Math.cos(ang) * r, eye[1] + 5 + Math.random() * 9, eye[2] + Math.sin(ang) * r],
        vel: [1.2, -22, 0],
        life: 1.1,
        col: [0.45, 0.55, 0.85],
        rain: true,
      });
    }
  }

  // ---------------- チェスト ----------------

  const chests = new Map();   // "x,y,z" -> Map(itemId -> count)
  let chestsDirty = false;
  try {
    const saved = JSON.parse(localStorage.getItem("mcjs_chests_" + seed));
    if (saved && typeof saved === "object") {
      for (const key of Object.keys(saved)) {
        const m = new Map();
        for (const [id, n] of saved[key]) {
          if (getDef(id) && n > 0) m.set(id, n);
        }
        chests.set(key, m);
      }
    }
  } catch (e) { /* ignore */ }

  const chestModalEl = document.getElementById("chest-modal");
  const chestGridEl = document.getElementById("chest-grid");
  const chestInvGridEl = document.getElementById("chest-inv-grid");
  let chestOpen = false;
  let chestKey = null;

  function chestAt(key) {
    let c = chests.get(key);
    if (!c) { c = new Map(); chests.set(key, c); }
    return c;
  }

  // ネザーフォートレスの宝箱: 初めて近づいたときに一度だけ中身を詰める
  let fortressLootGiven = localStorage.getItem("mcjs_fortloot_" + seed) === "1";
  function updateFortressLoot() {
    if (fortressLootGiven) return;
    const { x: fx, z: fz, y: fy } = NETHER_FORTRESS;
    const dx = player.pos[0] - fx, dz = player.pos[2] - (fz + 1);
    if (dx * dx + dz * dz > 12 * 12) return;
    if (world.getBlock(fx, fy + 1, fz + 1) !== B.CHEST) return;
    fortressLootGiven = true;
    localStorage.setItem("mcjs_fortloot_" + seed, "1");
    const c = chestAt([fx, fy + 1, fz + 1].join(","));
    c.set(I.NETHER_QUARTZ, 8);
    c.set(I.GOLD_INGOT, 4);
    c.set(I.GUNPOWDER, 6);
    c.set(I.BLAZE_ROD, 2);
    c.set(I.FLINT, 4);
    showToast("🏰 ネザーフォートレスの宝箱を見つけた!");
  }

  // 砂漠の神殿: 宝物庫に踏み込んだら一度だけ宝箱を詰めて隠しトラップを起爆する
  let templeTriggered = new Set();
  try {
    templeTriggered = new Set(JSON.parse(localStorage.getItem("mcjs_temple_" + seed) || "[]"));
  } catch (e) { /* ignore */ }
  function updateDesertTempleLoot() {
    const t = world.desertTempleNear(player.pos[0], player.pos[2]);
    if (!t) return;
    const key = t.cx + "," + t.cz;
    if (templeTriggered.has(key)) return;
    const gy = t.y - 5; // world.js の stampDesertTemple と合わせた宝物庫の床
    const dx = player.pos[0] - t.cx, dz = player.pos[2] - t.cz, dy = player.pos[1] - gy;
    if (dx * dx + dz * dz > 3.5 * 3.5 || dy < -1 || dy > 4) return;
    templeTriggered.add(key);
    localStorage.setItem("mcjs_temple_" + seed, JSON.stringify([...templeTriggered]));
    for (const [ddx, ddz] of [[-2, -2], [2, -2], [-2, 2], [2, 2]]) {
      const cxx = t.cx + ddx, czz = t.cz + ddz;
      if (world.getBlock(cxx, gy, czz) !== B.CHEST) continue;
      const c = chestAt([cxx, gy, czz].join(","));
      c.set(I.GOLD_INGOT, 2 + ((Math.random() * 4) | 0));
      c.set(B.DIAMOND_ORE, 1 + ((Math.random() * 2) | 0));
      c.set(I.EYE_OF_ENDER, 1);
      c.set(B.TNT, 2);
    }
    showToast("⚠️ 砂漠の神殿の宝物庫だ… 何かが怪しく光った!");
    sound.hiss();
    for (const [ddx, ddz] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) {
      if (world.getBlock(t.cx + ddx, gy - 2, t.cz + ddz) === B.TNT) {
        igniteTNT(t.cx + ddx, gy - 2, t.cz + ddz, 1.0 + Math.random() * 0.6);
      }
    }
  }

  // 村の民家のチェスト: 初回接近時に一度だけ生活用品を詰める
  let villageChestLooted = new Set();
  try {
    villageChestLooted = new Set(JSON.parse(localStorage.getItem("mcjs_villagechest_" + seed) || "[]"));
  } catch (e) { /* ignore */ }
  function updateVillageChestLoot() {
    const gx = Math.floor(player.pos[0] / VILLAGE_GRID);
    const gz = Math.floor(player.pos[2] / VILLAGE_GRID);
    for (let dgz = -1; dgz <= 1; dgz++) {
      for (let dgx = -1; dgx <= 1; dgx++) {
        const v = world.villageInCell(gx + dgx, gz + dgz);
        if (!v) continue;
        for (const b of v.buildings) {
          if (!b.chest) continue;
          const [cx, cy, cz] = b.chest;
          const key = cx + "," + cy + "," + cz;
          if (villageChestLooted.has(key)) continue;
          const dx = player.pos[0] - cx, dy = player.pos[1] - cy, dz = player.pos[2] - cz;
          if (dx * dx + dy * dy + dz * dz > 6 * 6) continue;
          if (world.getBlock(cx, cy, cz) !== B.CHEST) continue;
          villageChestLooted.add(key);
          localStorage.setItem("mcjs_villagechest_" + seed, JSON.stringify([...villageChestLooted]));
          const c = chestAt([cx, cy, cz].join(","));
          c.set(I.BREAD, 2 + ((Math.random() * 3) | 0));
          c.set(I.SEEDS, 2 + ((Math.random() * 3) | 0));
          c.set(B.PLANK, 4 + ((Math.random() * 5) | 0));
          c.set(B.TORCH, 3);
          if (Math.random() < 0.35) c.set(I.IRON_INGOT, 1 + ((Math.random() * 2) | 0));
          showToast("🏠 民家のチェストに生活用品が入っていた");
        }
      }
    }
  }

  // エンドシティ: 最上階の宝箱に初回接近時に一度だけ宝を詰める
  let endCityLooted = new Set();
  try {
    endCityLooted = new Set(JSON.parse(localStorage.getItem("mcjs_endcity_" + seed) || "[]"));
  } catch (e) { /* ignore */ }
  function updateEndCityLoot() {
    if (!world.isInEnd(player.pos[0], player.pos[2])) return;
    const c = world.endCityNear(player.pos[0], player.pos[2]);
    if (!c) return;
    const key = c.cx + "," + c.cz;
    if (endCityLooted.has(key)) return;
    const [chx, chy, chz] = c.chest;
    const dx = player.pos[0] - chx, dy = player.pos[1] - chy, dz = player.pos[2] - chz;
    if (dx * dx + dy * dy + dz * dz > 8 * 8) return;
    if (world.getBlock(chx, chy, chz) !== B.CHEST) return;
    endCityLooted.add(key);
    localStorage.setItem("mcjs_endcity_" + seed, JSON.stringify([...endCityLooted]));
    const chest = chestAt([chx, chy, chz].join(","));
    chest.set(I.DIAMOND, 2 + ((Math.random() * 3) | 0));
    chest.set(I.ENDER_PEARL, 3 + ((Math.random() * 3) | 0));
    chest.set(I.GOLD_INGOT, 4 + ((Math.random() * 4) | 0));
    chest.set(B.PURPUR, 16);
    showToast("🏯 エンドシティの宝箱を見つけた!");
  }

  function makeItemCell(id, n, onClick) {
    const el = document.createElement("div");
    el.className = "inv-item";
    const icon = document.createElement("canvas");
    icon.width = icon.height = 48;
    drawBlockIcon(icon, id, atlas);
    const label = document.createElement("span");
    label.textContent = getDef(id).jp;
    const badge = document.createElement("span");
    badge.className = "count";
    badge.textContent = String(n);
    el.append(icon, label, badge);
    el.addEventListener("click", onClick);
    return el;
  }

  function renderChestUI() {
    const chest = chestAt(chestKey);
    chestGridEl.innerHTML = "";
    chestInvGridEl.innerHTML = "";

    let any = false;
    for (const [id, n] of chest) {
      if (n <= 0) continue;
      any = true;
      chestGridEl.appendChild(makeItemCell(id, n, () => {
        // チェスト → 持ち物 (全部)
        chest.delete(id);
        addItem(id, n);
        chestsDirty = true;
        sound.pickup();
        renderChestUI();
      }));
    }
    if (!any) {
      const note = document.createElement("div");
      note.className = "empty-note";
      note.textContent = "(空っぽ)";
      chestGridEl.appendChild(note);
    }

    let anyInv = false;
    for (const [id, n] of invCounts) {
      if (n <= 0) continue;
      anyInv = true;
      chestInvGridEl.appendChild(makeItemCell(id, n, () => {
        // 持ち物 → チェスト (全部)
        invCounts.set(id, 0);
        invDirty = true;
        chest.set(id, (chest.get(id) || 0) + n);
        chestsDirty = true;
        updateHotbarCounts();
        sound.place();
        renderChestUI();
      }));
    }
    if (!anyInv) {
      const note = document.createElement("div");
      note.className = "empty-note";
      note.textContent = "(何も持っていない)";
      chestInvGridEl.appendChild(note);
    }
  }

  function openChest(pos) {
    chestKey = pos.join(",");
    chestOpen = true;
    chestModalEl.classList.remove("hidden");
    renderChestUI();
    document.exitPointerLock();
  }

  function closeChest() {
    chestOpen = false;
    chestModalEl.classList.add("hidden");
    if (!isTouch) canvas.requestPointerLock();
  }

  chestModalEl.addEventListener("click", (e) => {
    if (e.target === chestModalEl) closeChest();
  });

  // ---------------- ベッド (睡眠 / リスポーン地点) ----------------

  const sleepOverlayEl = document.getElementById("sleep-overlay");
  let sleeping = false;
  try {
    const sp = JSON.parse(localStorage.getItem("mcjs_spawn_" + seed));
    if (Array.isArray(sp) && sp.length === 3 && sp.every(Number.isFinite)) {
      player.spawnPoint = sp;
    }
  } catch (e) { /* ignore */ }

  function trySleep(pos) {
    if (sleeping) return;
    // ネザー / ジ・エンドでベッドに入ると爆発する (本家準拠)
    if (world.isInNether(pos[0], pos[2]) || world.isInEnd(pos[0], pos[2])) {
      world.setBlock(pos[0], pos[1], pos[2], B.AIR);
      explode(pos[0] + 0.5, pos[1] + 0.5, pos[2] + 0.5, 3.2);
      spawnPuff(pos[0] + 0.5, pos[1] + 0.5, pos[2] + 0.5, [1, 0.6, 0.2]);
      sound.blip(90, 0.6, "sawtooth", 0.4);
      showToast("💥 ここでは眠れない…!");
      const dx = player.pos[0] - pos[0], dy = player.pos[1] - pos[1], dz = player.pos[2] - pos[2];
      if (Math.hypot(dx, dy, dz) < 4) player.takeDamage(6);
      return;
    }
    const daylight = smoothstep(-0.1, 0.22, Math.sin(timeOfDay * Math.PI * 2));
    player.spawnPoint = [pos[0] + 0.5, pos[1] + 1, pos[2] + 0.5];
    localStorage.setItem("mcjs_spawn_" + seed, JSON.stringify(player.spawnPoint));
    if (daylight > 0.3) {
      showToast("リスポーン地点を設定した (眠れるのは夜だけ)");
      return;
    }
    sleeping = true;
    sleepOverlayEl.classList.add("show");
    showToast("おやすみなさい…");
    setTimeout(() => {
      timeOfDay = 0.165; // 朝
      sleepOverlayEl.classList.remove("show");
      sleeping = false;
      showToast("朝になった (リスポーン地点を設定)");
    }, 1400);
  }

  // ---------------- 爆発 (クリーパー / TNT) ----------------

  const primedTNT = [];   // 点火済み TNT {id, pos, fuse, spin:false, scale:1}

  function igniteTNT(x, y, z, fuse = 1.5) {
    world.setBlock(x, y, z, B.AIR);
    primedTNT.push({
      id: B.TNT,
      pos: [x + 0.5, y, z + 0.5],
      fuse,
      phase: 0,
      spin: false,
      scale: 1,
    });
    sound.hiss();
  }

  function updatePrimedTNT(dt) {
    for (let i = primedTNT.length - 1; i >= 0; i--) {
      const t = primedTNT[i];
      t.fuse -= dt;
      if (t.fuse <= 0) {
        primedTNT.splice(i, 1);
        explode(t.pos[0], t.pos[1] + 0.5, t.pos[2], 3.4); // TNT はクリーパーより強力
      }
    }
  }

  function explode(x, y, z, R = 2.6) {
    for (let by = Math.floor(y - R); by <= Math.floor(y + R); by++) {
      for (let bz = Math.floor(z - R); bz <= Math.floor(z + R); bz++) {
        for (let bx = Math.floor(x - R); bx <= Math.floor(x + R); bx++) {
          const d = Math.hypot(bx + 0.5 - x, by + 0.5 - y, bz + 0.5 - z);
          if (d > R) continue;
          const id = world.getBlock(bx, by, bz);
          if (id === B.AIR || id === B.WATER || id === B.BEDROCK) continue;
          if (!isFinite(BLOCKS[id].hardness)) continue;
          // TNT は誘爆する (少し遅れて連鎖)
          if (id === B.TNT) {
            igniteTNT(bx, by, bz, 0.3 + Math.random() * 0.5);
            continue;
          }
          world.setBlock(bx, by, bz, B.AIR);
          // 一部のブロックはアイテム化して飛び散る
          if (gameMode === "survival" && Math.random() < 0.3 &&
              BLOCKS[id].drops !== null && BLOCKS[id].drops !== B.AIR) {
            items.spawn(BLOCKS[id].drops, bx, by, bz);
          }
        }
      }
    }
    // プレイヤーへのダメージとノックバック
    const pdx = player.pos[0] - x;
    const pdy = (player.pos[1] + 0.9) - y;
    const pdz = player.pos[2] - z;
    const pd = Math.hypot(pdx, pdy, pdz);
    if (pd < 7) {
      player.takeDamage(Math.ceil((1 - pd / 7) * 15));
      const k = ((1 - pd / 7) * 12) / (pd || 1);
      player.vel[0] += pdx * k;
      player.vel[1] += Math.abs(pdy * k) * 0.5 + 4;
      player.vel[2] += pdz * k;
    }
    spawnPuff(x, y - 0.5, z, [0.5, 0.47, 0.42]);
    spawnPuff(x, y + 0.5, z, [0.75, 0.6, 0.3]);
    spawnPuff(x, y, z, [0.35, 0.33, 0.3]);
    sound.explosion();
  }

  // ---------------- 落下ブロック (砂の重力) ----------------

  const fallingBlocks = [];   // {id, pos, vel, phase, spin:false, scale:1}
  const GRAVITY_BLOCKS = new Set([B.SAND, B.GRAVEL]);

  // セル (x,y,z) の砂 / 砂利が支えを失っていたら落下エンティティ化する
  function checkFalling(x, y, z) {
    if (y <= 0 || y >= CHUNK_H) return;
    const id = world.getBlock(x, y, z);
    if (!GRAVITY_BLOCKS.has(id)) return;
    const below = world.getBlock(x, y - 1, z);
    if (isSolid(below)) return;
    if (!world.setBlock(x, y, z, B.AIR)) return;
    fallingBlocks.push({
      id,
      pos: [x + 0.5, y, z + 0.5],
      vel: 0,
      phase: 0,
      spin: false,
      scale: 1,
    });
    // 上に積まれた分も連鎖して落ちる
    checkFalling(x, y + 1, z);
  }

  function updateFallingBlocks(dt) {
    for (let i = fallingBlocks.length - 1; i >= 0; i--) {
      const f = fallingBlocks[i];
      f.vel = Math.min(f.vel + 18 * dt, 30);
      f.pos[1] -= f.vel * dt;
      const cx = Math.floor(f.pos[0]);
      const cz = Math.floor(f.pos[2]);
      if (f.pos[1] < -5) { fallingBlocks.splice(i, 1); continue; }
      // 下のセルに着地したか
      if (world.isSolidAt(cx, Math.floor(f.pos[1] - 0.02), cz)) {
        const landY = Math.floor(f.pos[1] - 0.02) + 1;
        fallingBlocks.splice(i, 1);
        const cur = world.getBlock(cx, landY, cz);
        if ((cur === B.AIR || BLOCKS[cur].fluid) && world.setBlock(cx, landY, cz, f.id)) {
          sound.thud();
        } else if (gameMode === "survival") {
          items.spawn(f.id, cx, landY, cz); // 置けなければアイテム化
        }
      }
    }
  }

  // モブが視線上にいれば叩く。叩いたら true (剣でダメージ増加)
  function tryPunch() {
    const hit = player.raycast();
    const fwd = player.forward();
    const maxDist = hit ? hit.t : REACH;
    // エンダードラゴン (剣で殴る)
    if (mobs.dragon && !mobs.dragon.dead) {
      const dt2 = mobs.dragon.rayHit(player.eyePos(), fwd, maxDist);
      if (dt2 < maxDist) {
        const tool = heldTool();
        const damage = tool ? tool.damage : 2;
        mobs.hitDragon(damage, fwd);
        sound.thud();
        if (tool && tool.kind === "sword") damageTool(tool.id);
        return true;
      }
    }
    const mob = mobs.pick(player.eyePos(), fwd, maxDist);
    if (mob) {
      const tool = heldTool();
      const damage = tool ? tool.damage : 2;
      mobs.punch(mob, fwd, damage);
      sound.thud();
      if (tool && tool.kind === "sword") damageTool(tool.id);
      return true;
    }
    return false;
  }

  // ブロックを実際に破壊する (ドロップ・道具の消耗・上に乗った植生の処理込み)
  function breakBlockAt(hit) {
    const block = BLOCKS[hit.id];
    if (!isFinite(block.hardness)) return;
    const tool = heldTool();
    if (!world.setBlock(hit.pos[0], hit.pos[1], hit.pos[2], B.AIR)) return;
    spawnBreakParticles(hit.pos[0], hit.pos[1], hit.pos[2], hit.id);
    sound.break_();
    if (hit.id === B.END_CRYSTAL) explodeEndCrystal(hit.pos[0], hit.pos[1], hit.pos[2]);
    if (gameMode === "survival") {
      // 階層不足のピッケルではドロップしない (本家準拠)
      const tier = tool && tool.kind === "pick" ? tool.tier : 0;
      const canDrop = block.minTier === 0 || tier >= block.minTier;
      if (canDrop && block.drops !== null && block.drops !== B.AIR) {
        items.spawn(block.drops, hit.pos[0], hit.pos[1], hit.pos[2]);
      }
      // 特殊ドロップ: 草→種 (30%), 小麦→段階に応じて
      if (hit.id === B.TALL_GRASS && Math.random() < 0.3) {
        items.spawn(I.SEEDS, hit.pos[0], hit.pos[1], hit.pos[2]);
      } else if (hit.id === B.WHEAT_2) {
        items.spawn(I.WHEAT, hit.pos[0], hit.pos[1], hit.pos[2]);
        items.spawn(I.SEEDS, hit.pos[0], hit.pos[1], hit.pos[2],
          1 + (Math.random() < 0.5 ? 1 : 0));
      } else if (hit.id === B.WHEAT_0 || hit.id === B.WHEAT_1) {
        items.spawn(I.SEEDS, hit.pos[0], hit.pos[1], hit.pos[2]);
      } else if (hit.id === B.GRAVEL && Math.random() < 0.12) {
        items.spawn(I.FLINT, hit.pos[0], hit.pos[1], hit.pos[2]);
      }
      // 道具の消耗 (硬いブロックのみ)
      if (tool && block.hardness >= 0.3) damageTool(tool.id);
    }
    // チェストを壊したら中身をばらまく
    if (hit.id === B.CHEST) {
      const key = hit.pos.join(",");
      const c = chests.get(key);
      if (c) {
        for (const [id, n] of c) {
          if (n > 0) items.spawn(id, hit.pos[0], hit.pos[1], hit.pos[2], n);
        }
        chests.delete(key);
        chestsDirty = true;
      }
    }
    // 上に乗っていた植生 / 松明も壊す
    const [bx, by, bz] = hit.pos;
    const above = world.getBlock(bx, by + 1, bz);
    const ab = BLOCKS[above];
    if (above !== B.AIR && (ab.cross || ab.torch)) {
      world.setBlock(bx, by + 1, bz, B.AIR);
      if (gameMode === "survival" && ab.drops !== null) items.spawn(ab.drops, bx, by + 1, bz);
    }
    // 上の砂は支えを失って落下する
    checkFalling(bx, by + 1, bz);
    // 原木を切ったら周囲の葉が枯れ始める
    if (hit.id === B.LOG) queueLeafDecayAround(bx, by, bz);
    // 隣に水/マグマがあれば, できた空気マスへ広がってくる
    queueFluidNeighbors(bx, by, bz);
    // ドア (上下段) / ベッド (頭足) はどちらか片方を壊すともう片方も消える
    if (block.door) {
      const py2 = by + (block.doorTop ? -1 : 1);
      if (BLOCKS[world.getBlock(bx, py2, bz)].door) world.setBlock(bx, py2, bz, B.AIR);
    } else if (block.bed) {
      const [odx, , odz] = BED_DIR_OFFSET[block.bedDir];
      const [px2, pz2] = block.bedFoot ? [bx - odx, bz - odz] : [bx + odx, bz + odz];
      if (BLOCKS[world.getBlock(px2, by, pz2)].bed) world.setBlock(px2, by, pz2, B.AIR);
    }
  }

  // 右クリック / タップでの設置 (弓を持っていれば射撃)
  let bowCooldown = 0;
  // 釣りの状態
  let fishing = false;
  let fishingTimer = 0;
  let fishingPos = null;

  function updateFishing(dt) {
    if (!fishing) return;
    // 動くと中断
    if (Math.hypot(player.pos[0] - fishingPos[0], player.pos[2] - fishingPos[2]) > 1.2) {
      fishing = false;
      showToast("動いたので魚が逃げた");
      return;
    }
    fishingTimer -= dt;
    if (fishingTimer <= 0) {
      fishing = false;
      if (Math.random() < 0.75) {
        addItem(I.FISH);
        sound.pickup();
        showToast("魚が釣れた! 🐟");
        const tool = heldTool();
        if (tool && tool.kind === "rod") damageTool(tool.id);
      } else {
        showToast("逃げられた…");
      }
    }
  }

  // ---------------- エンドポータル (ストロングホールド) ----------------

  function endPortalFrameCoords() {
    const { x: sx, z: sz, y: sy } = STRONGHOLD;
    const py = sy + 2;   // 高台の上 (world.js の stampStronghold と合わせる)
    const coords = [];
    for (let dz = -2; dz <= 2; dz++) {
      for (let dx = -2; dx <= 2; dx++) {
        const m = Math.max(Math.abs(dx), Math.abs(dz));
        if (m === 2 && !(Math.abs(dx) === 2 && Math.abs(dz) === 2)) coords.push([sx + dx, py, sz + dz]);
      }
    }
    return coords;
  }

  // プレイヤーから見た目標地点の 8 方位と概算距離を返す ([方角, 距離])
  function compassBearing(tx, tz) {
    const dx = tx - player.pos[0], dz = tz - player.pos[2];
    const dist = Math.round(Math.hypot(dx, dz));
    let ang = Math.atan2(dx, dz);
    if (ang < 0) ang += Math.PI * 2;
    const dirs = ["北", "北東", "東", "南東", "南", "南西", "西", "北西"];
    return [dirs[Math.round(ang / (Math.PI / 4)) % 8], dist];
  }

  function tryActivateEndPortal() {
    const filled = endPortalFrameCoords().every(
      ([x, y, z]) => world.getBlock(x, y, z) === B.END_PORTAL_FRAME_EYE);
    if (!filled) return;
    const { x: sx, z: sz, y: sy } = STRONGHOLD;
    const py = sy + 2;   // 高台の上 (world.js の stampStronghold と合わせる)
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        world.setBlock(sx + dx, py, sz + dz, B.END_PORTAL);
      }
    }
    sound.blip(300, 0.5, "sine", 0.3);
    showToast("🌀 エンドポータルが起動した! 中に入るとジ・エンドへ渡れる");
  }

  // ---------------- ジ・エンドへの行き来 ----------------

  let endReturnPos = null; // ジ・エンドへ渡る前のオーバーワールド座標
  let portalCooldown = 0;

  let dragonDefeated = localStorage.getItem("mcjs_dragon_" + seed) === "1";

  function enterEnd() {
    endReturnPos = [...player.pos];
    const { x: ex, y: ey, z: ez, plateau } = END;
    // 浮島とその周辺チャンクを先に同期生成してから送る (奈落に落とさないため)
    for (let cz = (ez - 64) >> 4; cz <= (ez + 64) >> 4; cz++) {
      for (let cx = (ex - 64) >> 4; cx <= (ex + 64) >> 4; cx++) {
        world.generateChunk(cx, cz);
      }
    }
    player.pos = [ex + 0.5, ey + plateau + 3, ez - 12 + 0.5];
    player.vel = [0, 0, 0];
    player.flying = false;
    if (dragonDefeated) {
      // 討伐済みなら泉のポータルが開いていることを保証する (旧セーブの移行も兼ねる)
      for (let dz = -1; dz <= 1; dz++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dz === 0) continue;
          world.setBlock(ex + dx, ey + plateau + 2, ez + dz, B.END_PORTAL);
        }
      }
    }
    if (!dragonDefeated && !mobs.dragon) {
      mobs.dragon = new Dragon(ex, ey, ez);
      showToast("🌌 ジ・エンドへ渡った… 🐉 エンダードラゴンが待ち構えている!");
    } else if (dragonDefeated) {
      showToast("🌌 ジ・エンドへ渡った…");
    } else {
      showToast("🌌 ジ・エンドへ渡った… 🐉 エンダードラゴンがまだ生きている!");
    }
    sound.blip(200, 0.6, "sine", 0.3);
  }

  // 目玉のクリスタルを破壊したときの爆発 (地形は壊さない。近くにいると爆風ダメージ)
  function explodeEndCrystal(x, y, z) {
    spawnPuff(x + 0.5, y + 0.5, z + 0.5, [1, 0.7, 1]);
    spawnPuff(x + 0.5, y + 0.5, z + 0.5, [0.8, 0.3, 0.9]);
    sound.blip(150, 0.35, "sawtooth", 0.3);
    const dx = player.pos[0] - (x + 0.5);
    const dy = player.pos[1] - (y + 0.5);
    const dz = player.pos[2] - (z + 0.5);
    if (dx * dx + dy * dy + dz * dz < 5 * 5) {
      player.takeDamage(5);
      const pd = Math.hypot(dx, dz) || 1;
      player.vel[0] += (dx / pd) * 7;
      player.vel[2] += (dz / pd) * 7;
      player.vel[1] = Math.max(player.vel[1], 5);
    }
  }

  // ドラゴンを倒したときの勝利演出 (脱出ポータルを設置)
  function handleDragonVictory() {
    const pos = mobs.dragonDeathPos;
    if (!pos) return;
    mobs.dragonDeathPos = null;
    mobs.dragon = null;
    dragonDefeated = true;
    localStorage.setItem("mcjs_dragon_" + seed, "1");
    const { x: ex, y: ey, z: ez, plateau } = END;
    // 中央の岩盤の泉に帰還ポータルを点火し, 頂上にドラゴンの卵を置く (本家準拠)
    const py = ey + plateau;
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dz === 0) continue; // 中央は岩盤の柱
        world.setBlock(ex + dx, py + 2, ez + dz, B.END_PORTAL);
      }
    }
    world.setBlock(ex, py + 5, ez, B.DRAGON_EGG);
    spawnPuff(pos[0], pos[1], pos[2], [0.9, 0.5, 1]);
    sound.blip(120, 1.2, "sine", 0.4);
    showToast("🐉✨ エンダードラゴンを討伐した! 泉のポータルが開いた ✨🐉");
  }

  function exitEnd() {
    const back = endReturnPos || [8.5, world.surfaceY(8, 8) + 1, 8.5];
    player.pos = [...back];
    player.vel = [0, 0, 0];
    showToast("オーバーワールドに帰還した");
    sound.blip(500, 0.4, "sine", 0.25);
  }

  // ---------------- ネザーポータル (プレイヤーが黒曜石で組む) ----------------

  // (ox,oy,oz) の空気ブロックから, 平面上を隣接する空気セルへ flood fill し,
  // 綺麗な長方形かつ周囲がすべて黒曜石になっているか判定して起動する
  function tryIgnitePortal(ox, oy, oz) {
    if (world.getBlock(ox, oy, oz) !== B.AIR) return false;
    const isObs = (x, y, z) => world.getBlock(x, y, z) === B.OBSIDIAN;

    let axis = null; // 'x': 枠は zy 平面 (x 固定) / 'z': 枠は xy 平面 (z 固定)
    // 東西 (x 方向) に黒曜石があれば, その方向に幅を持つ = z が固定 (xy 平面)
    if (isObs(ox - 1, oy, oz) || isObs(ox + 1, oy, oz)) axis = "z";
    else if (isObs(ox, oy, oz - 1) || isObs(ox, oy, oz + 1)) axis = "x";
    if (!axis) return false;

    const visited = new Set();
    const key = (x, y, z) => x + "," + y + "," + z;
    const queue = [[ox, oy, oz]];
    const cells = [];
    visited.add(key(ox, oy, oz));
    while (queue.length) {
      const [x, y, z] = queue.pop();
      cells.push([x, y, z]);
      if (cells.length > 40) return false; // 大きすぎる
      const neighbors = axis === "x"
        ? [[x, y + 1, z], [x, y - 1, z], [x, y, z + 1], [x, y, z - 1]]
        : [[x, y + 1, z], [x, y - 1, z], [x + 1, y, z], [x - 1, y, z]];
      for (const [nx, ny, nz] of neighbors) {
        const k = key(nx, ny, nz);
        if (visited.has(k)) continue;
        visited.add(k);
        if (world.getBlock(nx, ny, nz) !== B.AIR) continue;
        queue.push([nx, ny, nz]);
      }
    }

    let minY = Infinity, maxY = -Infinity, minH = Infinity, maxH = -Infinity;
    for (const [x, y, z] of cells) {
      minY = Math.min(minY, y); maxY = Math.max(maxY, y);
      const h = axis === "x" ? z : x;
      minH = Math.min(minH, h); maxH = Math.max(maxH, h);
    }
    const w = maxH - minH + 1, h2 = maxY - minY + 1;
    if (w < 2 || w > 4 || h2 < 3 || h2 > 5) return false;
    if (cells.length !== w * h2) return false; // 穴のない綺麗な長方形のみ許可

    const fixed = axis === "x" ? ox : oz;
    for (let y = minY - 1; y <= maxY + 1; y++) {
      for (let hh = minH - 1; hh <= maxH + 1; hh++) {
        const onBorder = y < minY || y > maxY || hh < minH || hh > maxH;
        if (!onBorder) continue;
        const x = axis === "x" ? fixed : hh;
        const z = axis === "x" ? hh : fixed;
        if (!isObs(x, y, z)) return false;
      }
    }

    for (const [x, y, z] of cells) world.setBlock(x, y, z, B.NETHER_PORTAL);
    return true;
  }

  function updateEndPortalTravel(dt) {
    portalCooldown = Math.max(0, portalCooldown - dt);
    const inEndNow = world.isInEnd(player.pos[0], player.pos[2]);

    // 奈落に落ちたら送還 (ジ・エンドの浮島の外に落下)
    if (inEndNow && player.pos[1] < END.y - 45) {
      player.takeDamage(4);
      exitEnd();
      return;
    }

    if (portalCooldown > 0) return;
    const feet = world.getBlock(
      Math.floor(player.pos[0]), Math.floor(player.pos[1] + 0.4), Math.floor(player.pos[2]));
    if (feet !== B.END_PORTAL) return;
    portalCooldown = 3;
    if (!inEndNow) enterEnd();
    else exitEnd();
  }

  // ---------------- ネザーへの行き来 ----------------

  let netherReturnPos = null;
  let netherPortalCooldown = 0;

  function enterNether() {
    netherReturnPos = [...player.pos];
    const [nx, nz] = toNether(player.pos[0], player.pos[2]);
    for (let cz = (nz - 24) >> 4; cz <= (nz + 24) >> 4; cz++) {
      for (let cx = (nx - 24) >> 4; cx <= (nx + 24) >> 4; cx++) {
        world.generateChunk(cx, cz);
      }
    }
    const sy = world.findSafeNetherY(nx, nz);
    player.pos = [nx + 0.5, sy, nz + 0.5];
    player.vel = [0, 0, 0];
    player.flying = false;
    showToast("🔥 ネザーへ渡った…");
    sound.blip(150, 0.6, "sawtooth", 0.3);
  }

  function exitNether() {
    const back = netherReturnPos || [8.5, world.surfaceY(8, 8) + 1, 8.5];
    const bx = Math.floor(back[0]), bz = Math.floor(back[2]);
    world.generateChunk(bx >> 4, bz >> 4);
    // 戻り先が塞がれていたら, 頭上 2 マス分空くところまで安全な高さに調整する
    // (彷徨わないよう上限を設ける)
    let by = Math.floor(back[1]);
    const top = Math.min(CHUNK_H - 3, by + 40);
    while (by < top && (world.isSolidAt(bx, by, bz) || world.isSolidAt(bx, by + 1, bz))) by++;
    player.pos = [back[0], Math.max(back[1], by), back[2]];
    player.vel = [0, 0, 0];
    showToast("オーバーワールドに帰還した");
    sound.blip(450, 0.4, "sine", 0.25);
  }

  function updateNetherPortalTravel(dt) {
    netherPortalCooldown = Math.max(0, netherPortalCooldown - dt);
    if (netherPortalCooldown > 0) return;
    const feet = world.getBlock(
      Math.floor(player.pos[0]), Math.floor(player.pos[1] + 0.4), Math.floor(player.pos[2]));
    if (feet !== B.NETHER_PORTAL) return;
    netherPortalCooldown = 3;
    if (!world.isInNether(player.pos[0], player.pos[2])) enterNether();
    else exitNether();
  }

  // 溶岩に触れるとダメージ (水中と違って燃え続ける)
  let lavaBurnAccum = 0;
  function updateLavaDamage(dt) {
    const inLava = BLOCKS[world.getBlock(
      Math.floor(player.pos[0]), Math.floor(player.pos[1] + 0.5), Math.floor(player.pos[2]))].fluid === "lava";
    if (!inLava) { lavaBurnAccum = 0; return; }
    lavaBurnAccum += dt;
    if (lavaBurnAccum >= 0.5) {
      lavaBurnAccum -= 0.5;
      player.takeDamage(4);
      player.vel[1] = Math.max(player.vel[1], 2.5); // 少し浮かせる (泳げないので溺れ防止)
    }
  }

  // マグマブロックの上に立つとダメージ (本家準拠: スニーク中はノーダメージ)
  let magmaBurnAccum = 0;
  function updateMagmaDamage(dt) {
    const onMagma = player.onGround && !player.sneaking &&
      world.getBlock(Math.floor(player.pos[0]), Math.floor(player.pos[1] - 0.05),
        Math.floor(player.pos[2])) === B.MAGMA;
    if (!onMagma) { magmaBurnAccum = 0; return; }
    magmaBurnAccum += dt;
    if (magmaBurnAccum >= 0.5) {
      magmaBurnAccum -= 0.5;
      player.takeDamage(1);
    }
  }

  // プレイヤーの水平方向の向きを 90 度刻みの north/east/south/west (0-3) に丸める
  function yawToDir4(yaw) {
    const a = ((yaw % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    return Math.round(a / (Math.PI / 2)) % 4;
  }
  // 階段の設置向き決定: 素材はそのままに, 向きだけプレイヤーの方向に合わせる
  function stairFacingId(id, yaw) {
    const mi = Math.floor((id - STAIR_ID_BASE) / 4);
    return STAIR_ID_BASE + mi * 4 + yawToDir4(yaw);
  }
  // ドアの開閉をトグル (右クリックで開ける/閉める)。上下段が連動する
  function toggleDoor(pos, id) {
    const b = BLOCKS[id];
    const base = b.doorTop ? DOOR_TOP_ID_BASE : DOOR_ID_BASE;
    const newId = base + (b.doorOpen ? 0 : 4) + b.doorDir;
    world.setBlock(pos[0], pos[1], pos[2], newId);
    // 相方の段 (上/下) も一緒に切り替える
    const py2 = pos[1] + (b.doorTop ? -1 : 1);
    const otherId = world.getBlock(pos[0], py2, pos[2]);
    if (BLOCKS[otherId].door && BLOCKS[otherId].doorTop !== b.doorTop) {
      const ob = BLOCKS[otherId];
      const obase = ob.doorTop ? DOOR_TOP_ID_BASE : DOOR_ID_BASE;
      world.setBlock(pos[0], py2, pos[2], obase + (ob.doorOpen ? 0 : 4) + ob.doorDir);
    }
    sound.step();
  }

  function placeAction() {
    swingTimer = 0;
    // 弓: 矢を放つ
    const tool = heldTool();
    if (tool && tool.kind === "bow") {
      if (bowCooldown > 0) return;
      bowCooldown = 0.6;
      mobs.playerShoot(player.eyePos(), player.forward());
      sound.bow();
      damageTool(tool.id);
      return;
    }
    // 火打ち石と鉄: 黒曜石の枠の内側を狙うとネザーポータルを起動する
    if (tool && tool.kind === "flint_and_steel") {
      const hit = player.raycast();
      if (hit && hit.id === B.OBSIDIAN) {
        const [px, py, pz] = hit.prev;
        if (tryIgnitePortal(px, py, pz)) {
          sound.blip(180, 0.4, "sawtooth", 0.25);
          showToast("🔥 ネザーポータルが起動した!");
          damageTool(tool.id);
        } else {
          showToast("枠が正しくない (幅2-4 x 高さ3-5 の黒曜石の長方形が必要)");
        }
      }
      return;
    }
    // クワ: 草 / 土を耕して農地に
    if (tool && tool.kind === "hoe") {
      const hit = player.raycast();
      if (hit && (hit.id === B.GRASS || hit.id === B.DIRT) &&
          world.getBlock(hit.pos[0], hit.pos[1] + 1, hit.pos[2]) === B.AIR) {
        world.setBlock(hit.pos[0], hit.pos[1], hit.pos[2], B.FARMLAND);
        sound.step();
        damageTool(tool.id);
      }
      return;
    }
    // ハサミ: ヒツジの毛刈り (殺さずに羊毛を得る)
    if (tool && tool.kind === "shears") {
      const hit = player.raycast();
      const mob = mobs.pick(player.eyePos(), player.forward(), hit ? hit.t : REACH);
      if (mob && mob.type === "sheep") {
        if (mob.shearUntil && elapsed < mob.shearUntil) {
          showToast("この羊はまだ毛が生えそろっていない");
          return;
        }
        mob.shearUntil = elapsed + 90; // 毛が生えるまで90秒
        items.spawn(B.WOOL, Math.floor(mob.pos[0]), Math.floor(mob.pos[1]), Math.floor(mob.pos[2]),
          1 + (Math.random() < 0.5 ? 1 : 0));
        sound.blip(600, 0.08, "square", 0.15);
        damageTool(tool.id);
      }
      return;
    }
    // 釣竿: 水に向かって投げる
    if (tool && tool.kind === "rod") {
      if (fishing) {
        // 引き上げ (早すぎると逃げる)
        fishing = false;
        showToast("何も釣れなかった…");
        return;
      }
      // 視線の先に水があるか
      const eye = player.eyePos();
      const fwd = player.forward();
      let foundWater = false;
      for (let t = 1; t <= 9; t += 0.5) {
        const id = world.getBlock(
          Math.floor(eye[0] + fwd[0] * t),
          Math.floor(eye[1] + fwd[1] * t),
          Math.floor(eye[2] + fwd[2] * t));
        if (BLOCKS[id].fluid === "water") { foundWater = true; break; }
        if (id !== B.AIR) break;
      }
      if (!foundWater) {
        showToast("水に向かって使おう");
        return;
      }
      fishing = true;
      fishingTimer = 3 + Math.random() * 5;
      fishingPos = [...player.pos];
      showToast("ウキを垂らした…");
      sound.blip(400, 0.1, "sine", 0.15);
      return;
    }
    // 空のバケツ: 狙った先が水/マグマの発生源ならすくって入りバケツにする
    // (通常の raycast は水を透過するので, 水も止まる raycastFluid を使う)
    if (tool && tool.kind === "bucket") {
      const hit = player.raycastFluid();
      if (hit && (hit.id === B.WATER || hit.id === B.LAVA_BLOCK)) {
        const filledId = hit.id === B.WATER ? I.WATER_BUCKET : I.LAVA_BUCKET;
        if (!consumeItem(I.BUCKET)) return;
        world.setBlock(hit.pos[0], hit.pos[1], hit.pos[2], B.AIR);
        // 源を失った周囲の流れが引いていくように再計算を促す
        queueFluidNeighbors(hit.pos[0], hit.pos[1], hit.pos[2]);
        addItem(filledId);
        sound.place();
        return;
      }
    }
    // 水/マグマ入りバケツ: 中身を設置して空バケツに戻る
    if (tool && tool.kind === "fluid_bucket") {
      const hit = player.raycastFluid();
      if (hit) {
        const [px, py, pz] = hit.prev;
        const cur = world.getBlock(px, py, pz);
        if (cur === B.AIR || BLOCKS[cur].fluid) {
          if (!consumeItem(tool.id)) return;
          if (world.setBlock(px, py, pz, tool.fluid)) {
            addItem(I.BUCKET);
            sound.place();
            checkFalling(px, py, pz);
            queueFluidCheck(px, py, pz); // 注いだ源から低い方へ流れ出す
          } else if (gameMode === "survival") {
            addItem(tool.id); // 失敗したら返却
          }
          return;
        }
      }
    }
    // チェスト / ベッド / ドアは右クリックで開く・眠る・開閉 (スニーク中は通常設置)
    const hitFirst = player.raycast();
    if (hitFirst && !player.sneaking) {
      if (hitFirst.id === B.CHEST) { openChest(hitFirst.pos); return; }
      if (hitFirst.id === B.BED || BLOCKS[hitFirst.id].bed) { trySleep(hitFirst.pos); return; }
      if (BLOCKS[hitFirst.id].door) { toggleDoor(hitFirst.pos, hitFirst.id); return; }
    }
    // エンダーアイ: フレームに埋め込むか, 使ってストロングホールドの方角を知る
    const heldDef = getDef(HOTBAR_BLOCKS[selectedSlot]);
    if (heldDef && heldDef.id === I.EYE_OF_ENDER) {
      if (hitFirst && hitFirst.id === B.END_PORTAL_FRAME) {
        if (!consumeItem(I.EYE_OF_ENDER)) return;
        world.setBlock(hitFirst.pos[0], hitFirst.pos[1], hitFirst.pos[2], B.END_PORTAL_FRAME_EYE);
        sound.blip(700, 0.15, "sine", 0.2);
        showToast("エンダーアイをはめ込んだ");
        tryActivateEndPortal();
      } else {
        if (!consumeItem(I.EYE_OF_ENDER)) return;
        const [dir, dist] = compassBearing(STRONGHOLD.x, STRONGHOLD.z);
        sound.blip(500, 0.2, "sine", 0.18);
        showToast(`エンダーアイが ${dir} の方角へ輝きながら飛んでいった… (残り約${dist}ブロック)`);
        // エンダーアイが実際にその方角へ飛んでいくのが見える演出
        // (山なりに上昇してから, 重力で落ちて消える)
        const edx = STRONGHOLD.x - player.pos[0], edz = STRONGHOLD.z - player.pos[2];
        const elen = Math.hypot(edx, edz) || 1;
        const eye = player.eyePos();
        const fwd = player.forward();
        for (let i = 0; i < 8; i++) {
          particles.push({
            pos: [eye[0] + fwd[0] * 0.5, eye[1] + fwd[1] * 0.5, eye[2] + fwd[2] * 0.5],
            vel: [(edx / elen) * 6 + (Math.random() - 0.5), 5.5 + Math.random() * 1.5,
              (edz / elen) * 6 + (Math.random() - 0.5)],
            life: 1.2 + Math.random() * 0.4,
            col: [0.55, 0.25, 0.85],
          });
        }
      }
      return;
    }
    // コンパス: スポーン地点 (ベッドがあればそこ) の方角と距離を表示 (消費しない)
    if (heldDef && heldDef.id === I.COMPASS) {
      const sp = player.spawnPoint || [8.5, 0, 8.5];
      const [dir, dist] = compassBearing(sp[0], sp[2]);
      sound.blip(600, 0.12, "sine", 0.12);
      showToast(`🧭 スポーン地点は ${dir} の方角, 約${dist}ブロック先`);
      return;
    }
    // ホネ: オオカミに与えると, まれに手なずけられる
    if (heldDef && heldDef.id === I.BONE) {
      const hit = player.raycast();
      const mob = mobs.pick(player.eyePos(), player.forward(), hit ? hit.t : REACH);
      if (mob && mob.type === "wolf" && !mob.tamed) {
        if (!consumeItem(I.BONE)) return;
        if (Math.random() < 0.34) {
          mob.tamed = true;
          showToast("🐺 オオカミを手なずけた!");
          sound.blip(700, 0.15, "sine", 0.2);
        } else {
          showToast("オオカミにホネをあげた…");
          sound.blip(400, 0.1, "sine", 0.15);
        }
      }
      return;
    }
    // 種: 土 / 草ブロックの上面に植える
    if (heldDef && heldDef.seeds) {
      if (!hitFirst) return;
      const [px, py, pz] = hitFirst.prev;
      if ((hitFirst.id === B.GRASS || hitFirst.id === B.DIRT || hitFirst.id === B.FARMLAND) &&
          py === hitFirst.pos[1] + 1 &&
          world.getBlock(px, py, pz) === B.AIR) {
        if (!consumeItem(heldDef.id)) return;
        world.setBlock(px, py, pz, B.WHEAT_0);
        sound.place();
      }
      return;
    }
    // 食料: 食べる
    if (heldDef && heldDef.food) {
      if (gameMode !== "survival") return;
      if (player.food >= player.maxFood - 0.5) {
        showToast("お腹がいっぱいだ");
        return;
      }
      if (!consumeItem(heldDef.id)) return;
      player.food = Math.min(player.maxFood, player.food + heldDef.food);
      sound.eat();
      return;
    }
    const hit = player.raycast();
    if (!hit) return;
    const [px, py, pz] = hit.prev;
    const cur = world.getBlock(px, py, pz);
    if (cur !== B.AIR && !BLOCKS[cur].fluid) return;
    const id = HOTBAR_BLOCKS[selectedSlot];
    if (!BLOCKS[id]) return; // 道具・素材は設置できない
    if (isSolid(id) && player.intersectsBlock(px, py, pz)) return;
    // 松明・植生・カーペットは下が固体ブロックのときだけ置ける
    if ((BLOCKS[id].torch || BLOCKS[id].cross || BLOCKS[id].height <= 0.1) &&
        !world.isSolidAt(px, py - 1, pz)) return;
    // ドア: 本家同様に上にもう1マス必要 (2マス構造)。閉状態で下段+上段を同時に設置
    if (BLOCKS[id].door && !BLOCKS[id].doorTop) {
      if (world.getBlock(px, py + 1, pz) !== B.AIR) {
        showToast("ドアの上にスペースが必要");
        return;
      }
      if (!consumeItem(id)) return;
      const dir = yawToDir4(player.yaw);
      world.setBlock(px, py, pz, DOOR_ID_BASE + dir);
      world.setBlock(px, py + 1, pz, DOOR_TOP_ID_BASE + dir);
      sound.place();
      return;
    }
    // ベッド: 本家同様に頭側+足側の2マス構造。プレイヤーの向きに応じて自動回転
    if (id === B.BED) {
      const dir = yawToDir4(player.yaw);
      const [odx, , odz] = BED_DIR_OFFSET[dir];
      const fx = px + odx, fz = pz + odz;
      const footCur = world.getBlock(fx, py, fz);
      if (footCur !== B.AIR && !BLOCKS[footCur].fluid) {
        showToast("ベッドを置くスペースが足りない");
        return;
      }
      if (!consumeItem(id)) return;
      world.setBlock(px, py, pz, BED_ID_BASE + dir);
      world.setBlock(fx, py, fz, BED_ID_BASE + 4 + dir);
      sound.place();
      return;
    }
    if (!consumeItem(id)) return;
    // 階段: プレイヤーの向きに合わせて north/east/south/west のいずれかに回転
    const placeId = BLOCKS[id].stairs ? stairFacingId(id, player.yaw) : id;
    if (world.setBlock(px, py, pz, placeId)) {
      sound.place();
      checkFalling(px, py, pz); // 空中に置いた砂は落ちる
      queueFluidNeighbors(px, py, pz); // 流れを塞いだ場合, 下流が引いていく
      if (id === B.WITHER_SKULL) tryDetectWither(px, py, pz);
    } else if (gameMode === "survival") {
      addItem(id); // 失敗したら返却
    }
  }

  // ---------------- ウィザー召喚 ----------------
  // ソウルサンドで T 字 (縦棒 + 横棒 3 個) を組み, 頭蓋骨を上の 3 マスに
  // 置くと召喚される (本家準拠)。頭蓋骨はウィザースケルトンのレアドロップ
  function tryDetectWither(px, py, pz) {
    if (mobs.countType("wither_boss") > 0) return false;
    const check = (cx, cy, cz, dx, dz) => {
      for (let d = -1; d <= 1; d++) {
        if (world.getBlock(cx + dx * d, cy, cz + dz * d) !== B.WITHER_SKULL) return false;
        if (world.getBlock(cx + dx * d, cy - 1, cz + dz * d) !== B.SOUL_SAND) return false;
      }
      return world.getBlock(cx, cy - 2, cz) === B.SOUL_SAND;
    };
    for (const [dx, dz] of [[1, 0], [0, 1]]) {
      for (let off = -1; off <= 1; off++) {
        const cx = px - dx * off, cz = pz - dz * off;
        if (!check(cx, py, cz, dx, dz)) continue;
        for (let d = -1; d <= 1; d++) {
          world.setBlock(cx + dx * d, py, cz + dz * d, B.AIR);
          world.setBlock(cx + dx * d, py - 1, cz + dz * d, B.AIR);
        }
        world.setBlock(cx, py - 2, cz, B.AIR);
        spawnWitherBoss(cx + 0.5, py + 0.5, cz + 0.5);
        return true;
      }
    }
    return false;
  }

  function spawnWitherBoss(x, y, z) {
    mobs.mobs.push(new Mob("wither_boss", x, y, z));
    spawnPuff(x, y, z, [0.15, 0.15, 0.18]);
    explode(x, y, z, 3.5);
    sound.blip(60, 1.0, "sawtooth", 0.5);
    showToast("💀 ウィザーが召喚された!");
  }

  // 旧 API 互換 (テスト / デバッグフック用): 即時破壊 / 設置
  function doAction(button) {
    swingTimer = 0;
    if (button === 0) {
      if (tryPunch()) return;
      const hit = player.raycast();
      if (!hit) return;
      if (hit.id === B.TNT) igniteTNT(hit.pos[0], hit.pos[1], hit.pos[2]);
      else breakBlockAt(hit);
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

    // TNT は叩くと点火する (両モード)
    if (hit.id === B.TNT) {
      igniteTNT(hit.pos[0], hit.pos[1], hit.pos[2]);
      breakTargetKey = null;
      breakProgress = 0;
      actionCooldown = ACTION_REPEAT;
      swingTimer = 0;
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

    // サバイバル: 硬さと道具に応じて掘り進める
    const key = hit.pos.join(",");
    if (key !== breakTargetKey) {
      breakTargetKey = key;
      breakTargetPos = hit.pos;
      breakProgress = 0;
    }
    const block = BLOCKS[hit.id];
    let hard = block.hardness;
    if (!isFinite(hard)) {
      breakProgress = 0;
      return;
    }
    // 適した道具で加速: 石系はピッケル (素手は激遅), 木系は斧, 土系はシャベル
    const tool = heldTool();
    if (block.pickable) {
      if (tool && tool.kind === "pick") hard /= tool.speed;
      else hard *= 3.2;
    } else if (block.axeable && tool && tool.kind === "axe") {
      hard /= tool.speed;
    } else if (block.shovelable && tool && tool.kind === "shovel") {
      hard /= tool.speed;
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
      updateRotateOverlay();
    });

    // --- インベントリボタン (🎒) ---
    document.getElementById("btn-inventory").addEventListener("click", () => {
      if (paused) return;
      if (chestOpen) { closeChest(); return; }
      if (inventoryOpen) closeInventory();
      else openInventory();
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
      // スティックを前いっぱいに倒すとダッシュ
      virt.sprint = -dy > 0.92;
      knob.style.transform =
        `translate(calc(-50% + ${dx * rect.width * 0.3}px), calc(-50% + ${dy * rect.height * 0.3}px))`;
    };

    const resetJoy = () => {
      joyId = null;
      virt.strafe = 0;
      virt.fwd = 0;
      virt.sprint = false;
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
    // ジ・エンド: 太陽も昼夜もない, 暗い虚空
    if (world.isInEnd(player.pos[0], player.pos[2])) {
      return {
        sunDir: [0, 1, 0],
        daylight: 0.55,
        minLight: 0.42,
        zenith: [0.03, 0.012, 0.05],
        horizon: [0.09, 0.03, 0.11],
        fog: [0.05, 0.02, 0.08],
        fogStart: 12,
        fogEnd: RENDER_DIST * CHUNK_SIZE - 6,
        fov,
        sunColor: [1, 0.92, 1],
        noClouds: true,
      };
    }
    // ネザー: 太陽も昼夜もない, 赤く霞んだ空間 (本家のように全体を明るく底上げ)
    if (world.isInNether(player.pos[0], player.pos[2])) {
      return {
        sunDir: [0, 1, 0],
        daylight: 1.0,
        minLight: 0.62,
        zenith: [0.3, 0.09, 0.06],
        horizon: [0.52, 0.19, 0.1],
        fog: [0.45, 0.17, 0.09],
        fogStart: 16,
        fogEnd: 72,
        fov,
        sunColor: [1.15, 0.75, 0.55],
        noClouds: true,
      };
    }
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

    // 太陽光の色温度 (正午は白, 朝夕は暖色)
    const sunColor = mix3([1.02, 1.0, 0.96], [1.25, 0.85, 0.6], sunset * 0.85);

    let effectiveDaylight = daylight;
    let fogEnd = RENDER_DIST * CHUNK_SIZE - 6;

    // 雨: 空が灰色になり, 暗く, 視界が悪くなる
    if (raining) {
      const grey = [0.5, 0.53, 0.58];
      zenith = mix3(zenith, grey, 0.55 * daylight + 0.1);
      horizon = mix3(horizon, grey, 0.55 * daylight + 0.1);
      effectiveDaylight *= 0.8;
      fogEnd *= 0.82;
    }

    let fog = horizon.slice();
    let fogStart = fogEnd * 0.55;

    // 水中
    if (player.eyeInWater) {
      fog = mix3([0.07, 0.2, 0.45], [0.02, 0.05, 0.15], 1 - daylight);
      fogStart = 0;
      fogEnd = 16;
    }

    return { sunDir, daylight: effectiveDaylight, zenith, horizon, fog, fogStart, fogEnd, fov, sunColor };
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

  // プレイヤー / モブの足元に落ちる柔らかい接地シャドウ (簡易版)
  function buildShadowQuads() {
    const verts = [];
    const push = (ex, ez, feetY, halfW) => {
      let gy = -1;
      for (let d = 0; d <= 6; d++) {
        const by = Math.floor(feetY) - d;
        if (by < 0) break;
        if (world.isSolidAt(Math.floor(ex), by, Math.floor(ez))) { gy = by + 1; break; }
      }
      if (gy < 0) return;
      const gap = feetY - gy;
      const alpha = clamp(1 - gap / 5, 0, 1);
      if (alpha <= 0.02) return;
      const r = halfW, y = gy + 0.02;
      const quad = [
        [ex - r, y, ez - r, -1, -1], [ex + r, y, ez - r, 1, -1], [ex + r, y, ez + r, 1, 1],
        [ex - r, y, ez - r, -1, -1], [ex + r, y, ez + r, 1, 1], [ex - r, y, ez + r, -1, 1],
      ];
      for (const [x, yy, z, u, v] of quad) verts.push(x, yy, z, u, v, alpha);
    };
    push(player.pos[0], player.pos[2], player.pos[1], 0.32);
    for (const m of mobs.mobs) push(m.pos[0], m.pos[2], m.pos[1], m.def.halfW);
    return new Float32Array(verts);
  }

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
      sprint: keys.has("ControlLeft") || keys.has("ControlRight") || virt.sprint,
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
      items.update(dt, player, (id, n) => {
        addItem(id, n);
        sound.pickup();
      });
      updateFallingBlocks(dt);
      updatePrimedTNT(dt);
      updateLeafDecay(dt);
      updateRandomTicks(dt);
      updateFluidSpread(dt);
      updateFishing(dt);
      bowCooldown = Math.max(0, bowCooldown - dt);

      timeOfDay = (timeOfDay + dt / DAY_LENGTH) % 1;
      updateParticles(dt);

      updateWeather(dt);
      updateEndPortalTravel(dt);
      updateNetherPortalTravel(dt);
      updateLavaDamage(dt);
      updateMagmaDamage(dt);
      updateFortressLoot();
      updateDesertTempleLoot();
      updateEndCityLoot();
      updateVillageChestLoot();
      updateBossBar();

      // モブ更新 (夜はゾンビ, 昼は動物が湧く。雨の日は敵モブが燃えない)
      const daylightNow = smoothstep(-0.1, 0.22, Math.sin(timeOfDay * Math.PI * 2));
      mobs.update(dt, player, raining ? daylightNow * 0.45 : daylightNow);
      for (const death of mobs.deaths) {
        const def = MOB_TYPES[death.type];
        const col = def.parts[0];
        spawnPuff(death.pos[0], death.pos[1], death.pos[2], [col[6], col[7], col[8]]);
        sound.thud();
        // モブのドロップ (ヒツジ → 羊毛)
        if (gameMode === "survival" && def.drops) {
          const n = 1 + ((Math.random() * (def.dropN || 1)) | 0);
          for (let k = 0; k < n; k++) {
            items.spawn(def.drops,
              Math.floor(death.pos[0]), Math.floor(death.pos[1]), Math.floor(death.pos[2]));
          }
        }
        // ウィザースケルトン: まれに頭蓋骨をドロップ (ウィザー召喚に必要)
        if (gameMode === "survival" && death.type === "wither_skeleton" && Math.random() < 0.08) {
          items.spawn(B.WITHER_SKULL,
            Math.floor(death.pos[0]), Math.floor(death.pos[1]), Math.floor(death.pos[2]));
        }
      }
      if (mobs.groanRequest) sound.groan();
      if (mobs.hissRequest) sound.hiss();
      if (mobs.shootRequest) sound.bow();
      for (const ex of mobs.explosions) {
        explode(ex.pos[0], ex.pos[1] + 0.8, ex.pos[2]);
      }
      mobs.explosions.length = 0;
      handleDragonVictory();

      updateSurvivalUI(dt);

      // 歩行ボビングと足音 (周波数は歩行1.5Hz程度に抑える)
      const hSpeed = Math.hypot(player.vel[0], player.vel[2]);
      if (player.onGround && hSpeed > 0.5) {
        bobPhase += hSpeed * dt * 0.35;
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
    camPos[1] += Math.sin(bobPhase * Math.PI * 2) * 0.05 * bobAmount;

    const entityData = mobs.buildVertexData();
    const drawCalls = renderer.render({
      camPos,
      forward: player.forward(),
      chunks: chunkList,
      env,
      fov: fovCurrent,
      highlight: hit ? hit.pos : null,
      time: elapsed,
      particles: { data: particleData, count: particles.length },
      entities: entityData.verts,
      entitiesTex: entityData.texVerts,
      shadows: buildShadowQuads(),
      items: (fallingBlocks.length > 0 || primedTNT.length > 0)
        ? items.items.concat(fallingBlocks, primedTNT)
        : items.items,
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
          localStorage.setItem("mcjs_tooldur_" + seed, JSON.stringify([...toolDur]));
        } catch (e) { /* 容量超過などは無視 */ }
      }
      if (chestsDirty) {
        chestsDirty = false;
        try {
          const obj = {};
          for (const [key, m] of chests) {
            const arr = [...m].filter(([, n]) => n > 0);
            if (arr.length > 0) obj[key] = arr;
          }
          localStorage.setItem("mcjs_chests_" + seed, JSON.stringify(obj));
        } catch (e) { /* ignore */ }
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
    setRain: (r) => { raining = r; weatherTimer = 9999; },
    get raining() { return raining; },
    action: doAction,
    pickBlock,
    hotbar: HOTBAR_BLOCKS,
    get slot() { return selectedSlot; },
    placeAction,
    tryActivateEndPortal,
    endPortalFrameCoords,
    enterEnd,
    exitEnd,
    get endReturnPos() { return endReturnPos; },
    get dragonDefeated() { return dragonDefeated; },
    tryIgnitePortal,
    enterNether,
    exitNether,
    get netherReturnPos() { return netherReturnPos; },
    chests,
    tryDetectWither,
    spawnWitherBoss,
    particles,
    buildShadowQuads,
    renderer,
    queueFluidCheck,
    queueFluidNeighbors,
    equipArmor,
    equippedArmor,
    addItem,
  };

  window.addEventListener("beforeunload", () => world.saveEdits());
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) world.saveEdits();
  });

  requestAnimationFrame(frame);
})();
