// ---------------------------------------------------------------
// プレイヤー: 物理 (AABB 衝突) / 移動 / 視線レイキャスト
// ---------------------------------------------------------------
"use strict";

const PLAYER_HALF_W = 0.3;   // 幅の半分
const PLAYER_HEIGHT = 1.8;
const EYE_HEIGHT = 1.62;

const GRAVITY = 24;
const JUMP_SPEED = 8.4;
const WALK_SPEED = 4.3;
const SPRINT_SPEED = 5.8;
const FLY_SPEED = 10.5;
const SWIM_SPEED = 3.0;
const REACH = 6;             // ブロックに届く距離

class Player {
  constructor(world) {
    this.world = world;
    this.pos = [8.5, 40, 8.5];   // 足元の座標
    this.vel = [0, 0, 0];
    this.yaw = 0;
    this.pitch = 0;
    this.onGround = false;
    this.flying = false;
    this.inWater = false;
    this.eyeInWater = false;

    // サバイバル要素
    this.creative = true;      // クリエイティブ中はダメージ無効
    this.maxHealth = 20;
    this.health = 20;
    this.maxAir = 10;          // 秒
    this.air = 10;
    this.maxFood = 20;         // 満腹度
    this.food = 20;
    this.starveTimer = 0;
    this.dead = false;
    this.hurtFlash = 0;        // ダメージ演出の残り時間
    this.time = 0;             // 内部時計
    this.lastDamageTime = -99;
    this.regenTimer = 0;
    this.drownTimer = 0;
    this.landImpact = 0;       // 着地時の速度
    this.sneaking = false;
  }

  // 足元 (AABB 直下) に支えがあるか
  hasSupport() {
    const y = Math.floor(this.pos[1] - 0.05);
    const x0 = Math.floor(this.pos[0] - PLAYER_HALF_W);
    const x1 = Math.floor(this.pos[0] + PLAYER_HALF_W - 1e-7);
    const z0 = Math.floor(this.pos[2] - PLAYER_HALF_W);
    const z1 = Math.floor(this.pos[2] + PLAYER_HALF_W - 1e-7);
    for (let z = z0; z <= z1; z++) {
      for (let x = x0; x <= x1; x++) {
        if (this.world.isSolidAt(x, y, z)) return true;
      }
    }
    return false;
  }

  takeDamage(n) {
    if (this.creative || this.dead || n <= 0) return;
    this.health = Math.max(0, this.health - n);
    this.hurtFlash = 0.45;
    this.lastDamageTime = this.time;
    if (this.health <= 0) this.dead = true;
  }

  spawn(x, z) {
    const y = this.world.surfaceY(Math.floor(x), Math.floor(z)) + 1;
    this.pos = [x, y + 0.01, z];
    this.vel = [0, 0, 0];
  }

  eyePos() {
    // スニーク中は視点が少し下がる
    const eye = this.sneaking ? EYE_HEIGHT - 0.15 : EYE_HEIGHT;
    return [this.pos[0], this.pos[1] + eye, this.pos[2]];
  }

  forward() {
    const cp = Math.cos(this.pitch);
    return [
      Math.sin(this.yaw) * cp,
      Math.sin(this.pitch),
      -Math.cos(this.yaw) * cp,
    ];
  }

  // 移動入力 (input: {fwd, strafe, up, jump, sneak, sprint}) を反映して 1 ステップ進める
  update(dt, input) {
    const world = this.world;
    this.time += dt;
    this.hurtFlash = Math.max(0, this.hurtFlash - dt);
    if (this.dead) return;

    // 体の中心と目が水中か
    const bx = Math.floor(this.pos[0]);
    const bz = Math.floor(this.pos[2]);
    this.inWater = BLOCKS[world.getBlock(bx, Math.floor(this.pos[1] + 0.4), bz)].fluid === "water";
    this.eyeInWater = BLOCKS[world.getBlock(bx, Math.floor(this.pos[1] + EYE_HEIGHT), bz)].fluid === "water";

    // --- 水平方向の希望速度 (ヨー基準) ---
    const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
    let dx = input.strafe * cos + input.fwd * sin;
    let dz = input.strafe * sin - input.fwd * cos;
    const len = Math.hypot(dx, dz);
    if (len > 1) { dx /= len; dz /= len; }

    let speed = input.sprint ? SPRINT_SPEED : WALK_SPEED;
    if (this.flying) speed = input.sprint ? FLY_SPEED * 2 : FLY_SPEED;
    else if (this.inWater) speed = SWIM_SPEED;

    // スニーク: 減速 + 端から落ちない
    this.sneaking = input.sneak && !this.flying && !this.inWater;
    if (this.sneaking) speed *= 0.35;

    // ソウルサンドの上は歩きにくい (本家準拠)
    if (this.onGround && !this.flying &&
        this.world.getBlock(Math.floor(this.pos[0]), Math.floor(this.pos[1] - 0.05), Math.floor(this.pos[2])) === B.SOUL_SAND) {
      speed *= 0.5;
    }

    // 水平速度は即応 (地上) / 少し慣性 (空中)
    const accel = this.onGround || this.flying ? 20 : 6;
    this.vel[0] = lerp(this.vel[0], dx * speed, Math.min(accel * dt, 1));
    this.vel[2] = lerp(this.vel[2], dz * speed, Math.min(accel * dt, 1));

    // --- 垂直方向 ---
    if (this.flying) {
      const target = (input.jump ? 1 : 0) * FLY_SPEED + (input.sneak ? -1 : 0) * FLY_SPEED;
      this.vel[1] = lerp(this.vel[1], target, Math.min(12 * dt, 1));
    } else if (this.inWater) {
      this.vel[1] -= GRAVITY * 0.25 * dt;
      if (input.jump) this.vel[1] = lerp(this.vel[1], 4.0, Math.min(10 * dt, 1));
      this.vel[1] = clamp(this.vel[1], -3.5, 4.5);
    } else {
      this.vel[1] -= GRAVITY * dt;
      if (input.jump && this.onGround) {
        this.vel[1] = JUMP_SPEED;
        this.onGround = false;
        if (!this.creative) this.food = Math.max(0, this.food - 0.12);
      }
      this.vel[1] = Math.max(this.vel[1], -50);
    }

    // --- 軸ごとの衝突解決 ---
    const sneakGuard = this.sneaking && this.onGround;
    this._wasGrounded = this.onGround;   // 自動ステップ判定用 (リセット前の値)
    this.onGround = false;
    for (const axis of [0, 2]) {
      const old = this.pos[axis];
      this.moveAxis(axis, this.vel[axis] * dt);
      // スニーク中は足場から踏み出さない (本家準拠)
      if (sneakGuard && !this.hasSupport()) {
        this.pos[axis] = old;
        this.vel[axis] = 0;
      }
    }
    this.moveAxis(1, this.vel[1] * dt);

    // --- 落下ダメージ ---
    if (this.landImpact > 13 && !this.inWater && !this.flying) {
      this.takeDamage(Math.ceil((this.landImpact - 13) * 0.6));
    }
    this.landImpact = 0;

    // --- 酸素と溺れ ---
    if (this.eyeInWater && !this.flying && !this.creative) {
      this.air = Math.max(0, this.air - dt);
      if (this.air <= 0) {
        this.drownTimer += dt;
        if (this.drownTimer >= 1) {
          this.drownTimer -= 1;
          this.takeDamage(2);
        }
      }
    } else {
      this.air = Math.min(this.maxAir, this.air + dt * 2.5);
      this.drownTimer = 0;
    }

    // --- 満腹度の消費と飢餓 ---
    if (!this.creative) {
      const moving = Math.hypot(this.vel[0], this.vel[2]) > 0.5;
      let drain = 0.012;                        // 基礎代謝
      if (input.sprint && moving) drain += 0.05; // ダッシュは腹が減る
      this.food = Math.max(0, this.food - drain * dt);
      if (this.food <= 0) {
        this.starveTimer += dt;
        if (this.starveTimer >= 4) {
          this.starveTimer -= 4;
          if (this.health > 1) this.takeDamage(1); // 飢餓では死なない
        }
      } else {
        this.starveTimer = 0;
      }
    }

    // --- 自然回復 (満腹度が高く 6 秒間ダメージなしのとき, 食料を消費して回復) ---
    if (this.health < this.maxHealth && this.time - this.lastDamageTime > 6 &&
        (this.creative || this.food >= 18)) {
      this.regenTimer += dt;
      if (this.regenTimer >= 2.5) {
        this.regenTimer -= 2.5;
        this.health++;
        if (!this.creative) this.food = Math.max(0, this.food - 0.6);
      }
    } else if (this.health >= this.maxHealth) {
      this.regenTimer = 0;
    }

    // 奈落に落ちたら復帰
    if (this.pos[1] < -20) {
      this.spawn(this.pos[0], this.pos[2]);
    }
  }

  respawn() {
    this.health = this.maxHealth;
    this.air = this.maxAir;
    this.food = this.maxFood;
    this.dead = false;
    this.vel = [0, 0, 0];
    this.flying = false;
    // ベッドで設定したリスポーン地点があればそこへ
    if (this.spawnPoint) this.spawn(this.spawnPoint[0], this.spawnPoint[2]);
    else this.spawn(8.5, 8.5);
  }

  // AABB を 1 軸だけ動かして衝突解決
  moveAxis(axis, delta) {
    if (delta === 0) return;
    this.pos[axis] += delta;

    const min = [
      this.pos[0] - PLAYER_HALF_W,
      this.pos[1],
      this.pos[2] - PLAYER_HALF_W,
    ];
    const max = [
      this.pos[0] + PLAYER_HALF_W,
      this.pos[1] + PLAYER_HEIGHT,
      this.pos[2] + PLAYER_HALF_W,
    ];

    const x0 = Math.floor(min[0]), x1 = Math.floor(max[0] - 1e-7);
    const y0 = Math.floor(min[1]), y1 = Math.floor(max[1] - 1e-7);
    const z0 = Math.floor(min[2]), z1 = Math.floor(max[2] - 1e-7);

    for (let y = y0; y <= y1; y++) {
      for (let z = z0; z <= z1; z++) {
        for (let x = x0; x <= x1; x++) {
          const bh = this.world.blockHeightAt(x, y, z);
          if (bh === 0) continue;
          const blockTop = y + bh;
          // ハーフブロックの上半分は空: AABB が実体と重ならなければ無視
          if (this.pos[1] >= blockTop - 1e-6) continue;

          // 衝突: 移動方向に応じて押し戻す
          if (axis === 0 || axis === 2) {
            // 低い段差 (ハーフブロック) は自動で登る
            if (this._wasGrounded && bh < 1 && blockTop - this.pos[1] <= 0.55) {
              this.pos[1] = blockTop + 1e-4;
              continue;
            }
          }
          if (axis === 0) {
            this.pos[0] = delta > 0
              ? x - PLAYER_HALF_W - 1e-4
              : x + 1 + PLAYER_HALF_W + 1e-4;
            this.vel[0] = 0;
          } else if (axis === 2) {
            this.pos[2] = delta > 0
              ? z - PLAYER_HALF_W - 1e-4
              : z + 1 + PLAYER_HALF_W + 1e-4;
            this.vel[2] = 0;
          } else {
            if (delta > 0) {
              this.pos[1] = y - PLAYER_HEIGHT - 1e-4;
            } else {
              this.pos[1] = blockTop + 1e-4;
              this.onGround = true;
              // 着地速度を記録 (落下ダメージ用)
              this.landImpact = Math.max(this.landImpact, -this.vel[1]);
            }
            this.vel[1] = 0;
          }
          return;
        }
      }
    }
  }

  // プレイヤーの AABB がブロック (x,y,z) と重なるか (設置時の埋まり防止)
  intersectsBlock(x, y, z) {
    return (
      x + 1 > this.pos[0] - PLAYER_HALF_W && x < this.pos[0] + PLAYER_HALF_W &&
      z + 1 > this.pos[2] - PLAYER_HALF_W && z < this.pos[2] + PLAYER_HALF_W &&
      y + 1 > this.pos[1] && y < this.pos[1] + PLAYER_HEIGHT
    );
  }

  // 視線方向のブロックを DDA (Amanatides & Woo) で探索
  // 戻り値: { pos: [x,y,z], prev: [x,y,z] } または null
  raycast() {
    const world = this.world;
    const origin = this.eyePos();
    const dir = this.forward();

    let x = Math.floor(origin[0]);
    let y = Math.floor(origin[1]);
    let z = Math.floor(origin[2]);

    const stepX = dir[0] > 0 ? 1 : -1;
    const stepY = dir[1] > 0 ? 1 : -1;
    const stepZ = dir[2] > 0 ? 1 : -1;

    const invX = dir[0] !== 0 ? Math.abs(1 / dir[0]) : Infinity;
    const invY = dir[1] !== 0 ? Math.abs(1 / dir[1]) : Infinity;
    const invZ = dir[2] !== 0 ? Math.abs(1 / dir[2]) : Infinity;

    let tX = dir[0] !== 0
      ? (dir[0] > 0 ? (x + 1 - origin[0]) : (origin[0] - x)) * invX : Infinity;
    let tY = dir[1] !== 0
      ? (dir[1] > 0 ? (y + 1 - origin[1]) : (origin[1] - y)) * invY : Infinity;
    let tZ = dir[2] !== 0
      ? (dir[2] > 0 ? (z + 1 - origin[2]) : (origin[2] - z)) * invZ : Infinity;

    let px = x, py = y, pz = z;
    let t = 0;

    while (t <= REACH) {
      const id = world.getBlock(x, y, z);
      if (id !== B.AIR && BLOCKS[id].fluid !== "water") {
        return { pos: [x, y, z], prev: [px, py, pz], id, t };
      }
      px = x; py = y; pz = z;
      if (tX < tY && tX < tZ) {
        x += stepX; t = tX; tX += invX;
      } else if (tY < tZ) {
        y += stepY; t = tY; tY += invY;
      } else {
        z += stepZ; t = tZ; tZ += invZ;
      }
    }
    return null;
  }

  // バケツ用: raycast() と違い水も透過せず, 最初に当たったブロック
  // (水/マグマ含む) で止まる
  raycastFluid() {
    const world = this.world;
    const origin = this.eyePos();
    const dir = this.forward();

    let x = Math.floor(origin[0]);
    let y = Math.floor(origin[1]);
    let z = Math.floor(origin[2]);

    const stepX = dir[0] > 0 ? 1 : -1;
    const stepY = dir[1] > 0 ? 1 : -1;
    const stepZ = dir[2] > 0 ? 1 : -1;

    const invX = dir[0] !== 0 ? Math.abs(1 / dir[0]) : Infinity;
    const invY = dir[1] !== 0 ? Math.abs(1 / dir[1]) : Infinity;
    const invZ = dir[2] !== 0 ? Math.abs(1 / dir[2]) : Infinity;

    let tX = dir[0] !== 0
      ? (dir[0] > 0 ? (x + 1 - origin[0]) : (origin[0] - x)) * invX : Infinity;
    let tY = dir[1] !== 0
      ? (dir[1] > 0 ? (y + 1 - origin[1]) : (origin[1] - y)) * invY : Infinity;
    let tZ = dir[2] !== 0
      ? (dir[2] > 0 ? (z + 1 - origin[2]) : (origin[2] - z)) * invZ : Infinity;

    let px = x, py = y, pz = z;
    let t = 0;

    while (t <= REACH) {
      const id = world.getBlock(x, y, z);
      if (id !== B.AIR) {
        return { pos: [x, y, z], prev: [px, py, pz], id, t };
      }
      px = x; py = y; pz = z;
      if (tX < tY && tX < tZ) {
        x += stepX; t = tX; tX += invX;
      } else if (tY < tZ) {
        y += stepY; t = tY; tY += invY;
      } else {
        z += stepZ; t = tZ; tZ += invZ;
      }
    }
    return null;
  }
}
