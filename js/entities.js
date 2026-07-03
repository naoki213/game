// ---------------------------------------------------------------
// 動物モブ: ブタ / ヒツジ / ニワトリ
// ボックスモデルを頂点色付き三角形で描画 (renderer の progPoint を流用)
// ---------------------------------------------------------------
"use strict";

// 種族定義: parts は [ox, oy, oz, w, h, d, r, g, b]
// (エンティティ原点=足元中心, 単位はブロック, +Z が正面)
const MOB_TYPES = {
  pig: {
    speed: 1.4,
    halfW: 0.4, height: 0.9,
    parts: [
      // 胴体
      [-0.4, 0.35, -0.5, 0.8, 0.5, 1.0, 0.93, 0.62, 0.66],
      // 頭
      [-0.28, 0.42, 0.42, 0.56, 0.45, 0.42, 0.95, 0.66, 0.70],
      // 鼻
      [-0.1, 0.5, 0.82, 0.2, 0.14, 0.06, 0.85, 0.5, 0.55],
      // 脚 x4
      [-0.35, 0, -0.42, 0.22, 0.36, 0.22, 0.88, 0.56, 0.60],
      [0.13, 0, -0.42, 0.22, 0.36, 0.22, 0.88, 0.56, 0.60],
      [-0.35, 0, 0.2, 0.22, 0.36, 0.22, 0.88, 0.56, 0.60],
      [0.13, 0, 0.2, 0.22, 0.36, 0.22, 0.88, 0.56, 0.60],
    ],
  },
  sheep: {
    speed: 1.2,
    halfW: 0.45, height: 1.1,
    drops: 21, dropN: 2,   // 羊毛

    parts: [
      // もこもこの胴体
      [-0.45, 0.45, -0.55, 0.9, 0.65, 1.1, 0.92, 0.92, 0.90],
      // 頭
      [-0.22, 0.75, 0.5, 0.44, 0.4, 0.35, 0.85, 0.80, 0.75],
      // 脚 x4
      [-0.35, 0, -0.45, 0.2, 0.5, 0.2, 0.80, 0.78, 0.74],
      [0.15, 0, -0.45, 0.2, 0.5, 0.2, 0.80, 0.78, 0.74],
      [-0.35, 0, 0.22, 0.2, 0.5, 0.2, 0.80, 0.78, 0.74],
      [0.15, 0, 0.22, 0.2, 0.5, 0.2, 0.80, 0.78, 0.74],
    ],
  },
  zombie: {
    speed: 2.3,
    halfW: 0.32, height: 1.9,
    health: 10,
    hostile: true,
    parts: [
      // 脚 x2 (暗い青のズボン)
      [-0.22, 0, -0.11, 0.2, 0.72, 0.22, 0.22, 0.25, 0.45],
      [0.02, 0, -0.11, 0.2, 0.72, 0.22, 0.22, 0.25, 0.45],
      // 胴体 (青いシャツ)
      [-0.25, 0.72, -0.14, 0.5, 0.62, 0.28, 0.25, 0.45, 0.65],
      // 腕 x2 (前に突き出した緑の腕)
      [-0.43, 1.08, -0.1, 0.18, 0.18, 0.72, 0.4, 0.6, 0.3],
      [0.25, 1.08, -0.1, 0.18, 0.18, 0.72, 0.4, 0.6, 0.3],
      // 頭 (緑)
      [-0.25, 1.34, -0.25, 0.5, 0.5, 0.5, 0.38, 0.58, 0.28],
    ],
  },
  skeleton: {
    speed: 2.0,
    halfW: 0.3, height: 1.9,
    health: 10,
    hostile: true,
    ranged: true,
    parts: [
      // 脚 x2 (細い骨)
      [-0.18, 0, -0.08, 0.13, 0.75, 0.16, 0.82, 0.82, 0.78],
      [0.05, 0, -0.08, 0.13, 0.75, 0.16, 0.82, 0.82, 0.78],
      // 胴体 (あばら)
      [-0.2, 0.75, -0.12, 0.4, 0.6, 0.24, 0.72, 0.72, 0.68],
      // 腕 x2
      [-0.34, 0.85, -0.08, 0.12, 0.5, 0.16, 0.8, 0.8, 0.76],
      [0.22, 0.85, -0.08, 0.12, 0.5, 0.16, 0.8, 0.8, 0.76],
      // 頭 (白い骨)
      [-0.22, 1.35, -0.22, 0.44, 0.44, 0.44, 0.9, 0.9, 0.86],
    ],
  },
  creeper: {
    speed: 2.6,
    halfW: 0.3, height: 1.7,
    health: 12,
    hostile: true,
    creeper: true,
    noBurn: true,
    parts: [
      // 脚 x4 (低い)
      [-0.25, 0, -0.28, 0.22, 0.4, 0.24, 0.28, 0.55, 0.25],
      [0.03, 0, -0.28, 0.22, 0.4, 0.24, 0.28, 0.55, 0.25],
      [-0.25, 0, 0.06, 0.22, 0.4, 0.24, 0.28, 0.55, 0.25],
      [0.03, 0, 0.06, 0.22, 0.4, 0.24, 0.28, 0.55, 0.25],
      // 縦長の胴体
      [-0.2, 0.4, -0.15, 0.4, 0.85, 0.3, 0.33, 0.65, 0.3],
      // 頭
      [-0.24, 1.25, -0.24, 0.48, 0.45, 0.48, 0.36, 0.68, 0.33],
    ],
  },
  chicken: {
    speed: 1.6,
    halfW: 0.25, height: 0.7,
    parts: [
      // 体
      [-0.22, 0.25, -0.3, 0.44, 0.4, 0.55, 0.96, 0.94, 0.90],
      // 頭
      [-0.13, 0.55, 0.18, 0.26, 0.3, 0.24, 0.97, 0.95, 0.92],
      // くちばし
      [-0.06, 0.66, 0.42, 0.12, 0.08, 0.1, 0.95, 0.65, 0.2],
      // とさか
      [-0.05, 0.5, 0.3, 0.1, 0.08, 0.1, 0.9, 0.25, 0.2],
      // 脚 x2
      [-0.14, 0, -0.05, 0.08, 0.28, 0.08, 0.9, 0.65, 0.25],
      [0.06, 0, -0.05, 0.08, 0.28, 0.08, 0.9, 0.65, 0.25],
    ],
  },
};

const MOB_NAMES = Object.keys(MOB_TYPES);
const MOB_GRAVITY = 22;

// 面ごとのシェーディング (上 / 側面 / 下)
const BOX_SHADE = { top: 1.0, bottom: 0.55, north: 0.7, south: 0.75, east: 0.85, west: 0.62 };

class Mob {
  constructor(type, x, y, z) {
    this.type = type;
    this.def = MOB_TYPES[type];
    this.pos = [x, y, z];
    this.vel = [0, 0, 0];
    this.yaw = Math.random() * Math.PI * 2;
    this.onGround = false;
    this.state = "idle";           // idle | walk
    this.stateTime = 1 + Math.random() * 2;
    this.walkPhase = 0;
    this.bob = 0;
    this.health = this.def.health || 6;
    this.hurt = 0;                 // 被弾の赤フラッシュ残り時間
    this.attackCooldown = 0;
    this.burnAccum = 0;
  }

  update(dt, world, player, daylight, mgr) {
    this.hurt = Math.max(0, this.hurt - dt);
    this.attackCooldown = Math.max(0, this.attackCooldown - dt);

    let chasing = false;
    if (this.def.hostile) {
      // --- 昼は燃えてダメージ (クリーパーは燃えない) ---
      if (daylight > 0.5 && !this.def.noBurn) {
        this.burnAccum += dt;
        if (this.burnAccum >= 1) {
          this.burnAccum -= 1;
          this.health -= 3;
          this.hurt = 0.3;
        }
      }
      // --- プレイヤーを追跡 ---
      const dx = player.pos[0] - this.pos[0];
      const dy = player.pos[1] - this.pos[1];
      const dz = player.pos[2] - this.pos[2];
      const distH = Math.hypot(dx, dz);
      if (!player.dead && distH < 28 && Math.abs(dy) < 12) {
        chasing = true;
        this.yaw = Math.atan2(dx, dz);
        this.state = "walk";

        if (this.def.ranged) {
          // --- スケルトン: 距離を保ちつつ弓を撃つ ---
          if (distH < 5) this.yaw += Math.PI;          // 近すぎたら後退
          else if (distH < 12) this.state = "idle";    // 射程内では足を止める
          if (distH < 15 && Math.abs(dy) < 6 && this.attackCooldown <= 0 && mgr) {
            this.attackCooldown = 2.2;
            mgr.shootArrow(this, player);
          }
        } else if (this.def.creeper) {
          // --- クリーパー: 接近して自爆 ---
          if (this.fuse == null && distH < 2.4 && Math.abs(dy) < 2) {
            this.fuse = 1.3;
            if (mgr) mgr.hissRequest = true;
          }
          if (this.fuse != null && distH > 5) this.fuse = null; // 離れたら解除
          if (this.fuse != null) {
            this.state = "idle";
            this.fuse -= dt;
            if (this.fuse <= 0) {
              if (mgr) mgr.explosions.push({ pos: [...this.pos] });
              this.health = 0;
            }
          }
        } else if (distH < 1.4 && Math.abs(dy) < 2 && this.attackCooldown <= 0) {
          // --- ゾンビ: 近接攻撃 ---
          this.attackCooldown = 1.1;
          player.takeDamage(3);
          // ノックバック
          const d = distH || 1;
          player.vel[0] += (dx / d) * 6;
          player.vel[2] += (dz / d) * 6;
          player.vel[1] = Math.max(player.vel[1], 3.5);
        }
      } else if (this.def.creeper) {
        this.fuse = null;
      }
    }

    // --- 状態遷移 (ふらふら歩く) ---
    if (!chasing) {
      this.stateTime -= dt;
      if (this.stateTime <= 0) {
        if (this.state === "idle") {
          this.state = "walk";
          this.yaw = Math.random() * Math.PI * 2;
          this.stateTime = 1.5 + Math.random() * 3;
        } else {
          this.state = "idle";
          this.stateTime = 1 + Math.random() * 3;
        }
      }
    }

    // --- 移動 ---
    const speed = this.state === "walk" ? this.def.speed : 0;
    const tx = Math.sin(this.yaw) * speed;
    const tz = Math.cos(this.yaw) * speed;
    this.vel[0] = lerp(this.vel[0], tx, Math.min(8 * dt, 1));
    this.vel[2] = lerp(this.vel[2], tz, Math.min(8 * dt, 1));
    this.vel[1] -= MOB_GRAVITY * dt;
    this.vel[1] = Math.max(this.vel[1], -30);

    // 水中では浮く
    const bx = Math.floor(this.pos[0]);
    const bz = Math.floor(this.pos[2]);
    if (world.getBlock(bx, Math.floor(this.pos[1] + 0.3), bz) === B.WATER) {
      this.vel[1] = Math.max(this.vel[1], 1.5);
    }

    const wasBlocked = this.moveAxis(world, 0, this.vel[0] * dt) |
                       this.moveAxis(world, 2, this.vel[2] * dt);
    this.onGround = false;
    this.moveAxis(world, 1, this.vel[1] * dt);

    // 壁にぶつかったらジャンプ (段差登り)
    if (wasBlocked && this.onGround) {
      this.vel[1] = 7;
    } else if (wasBlocked && this.state === "walk" && Math.random() < 0.05) {
      this.yaw += Math.PI * (0.5 + Math.random());
    }

    // 歩行アニメーション
    const hSpeed = Math.hypot(this.vel[0], this.vel[2]);
    this.walkPhase += hSpeed * dt * 3.2;
    this.bob = hSpeed > 0.3 ? Math.sin(this.walkPhase * Math.PI * 2) : 0;
  }

  // 戻り値: この軸で衝突したか
  moveAxis(world, axis, delta) {
    if (delta === 0) return false;
    this.pos[axis] += delta;
    const hw = this.def.halfW, h = this.def.height;

    const x0 = Math.floor(this.pos[0] - hw), x1 = Math.floor(this.pos[0] + hw - 1e-7);
    const y0 = Math.floor(this.pos[1]), y1 = Math.floor(this.pos[1] + h - 1e-7);
    const z0 = Math.floor(this.pos[2] - hw), z1 = Math.floor(this.pos[2] + hw - 1e-7);

    for (let y = y0; y <= y1; y++) {
      for (let z = z0; z <= z1; z++) {
        for (let x = x0; x <= x1; x++) {
          if (!world.isSolidAt(x, y, z)) continue;
          if (axis === 0) {
            this.pos[0] = delta > 0 ? x - hw - 1e-4 : x + 1 + hw + 1e-4;
            this.vel[0] = 0;
          } else if (axis === 2) {
            this.pos[2] = delta > 0 ? z - hw - 1e-4 : z + 1 + hw + 1e-4;
            this.vel[2] = 0;
          } else {
            if (delta > 0) {
              this.pos[1] = y - h - 1e-4;
            } else {
              this.pos[1] = y + 1 + 1e-4;
              this.onGround = true;
            }
            this.vel[1] = 0;
          }
          return true;
        }
      }
    }
    return false;
  }

  // レイと AABB の交差 (ヒットしたら距離, しなければ Infinity)
  rayHit(origin, dir, maxDist) {
    const hw = this.def.halfW, h = this.def.height;
    const min = [this.pos[0] - hw, this.pos[1], this.pos[2] - hw];
    const max = [this.pos[0] + hw, this.pos[1] + h, this.pos[2] + hw];
    let tmin = 0, tmax = maxDist;
    for (let a = 0; a < 3; a++) {
      if (Math.abs(dir[a]) < 1e-9) {
        if (origin[a] < min[a] || origin[a] > max[a]) return Infinity;
        continue;
      }
      let t1 = (min[a] - origin[a]) / dir[a];
      let t2 = (max[a] - origin[a]) / dir[a];
      if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
      tmin = Math.max(tmin, t1);
      tmax = Math.min(tmax, t2);
      if (tmin > tmax) return Infinity;
    }
    return tmin;
  }
}

class MobManager {
  constructor(world) {
    this.world = world;
    this.mobs = [];
    this.spawnTimer = 0;
    this.maxAnimals = 12;
    this.maxZombies = 8;
    this.deaths = [];        // 今フレーム死んだモブ (演出は main 側)
    this.explosions = [];    // クリーパーの爆発 (処理は main 側)
    this.arrows = [];        // スケルトンの矢
    this.groanRequest = false;
    this.hissRequest = false;
    this.shootRequest = false;
  }

  shootArrow(mob, player) {
    const from = [mob.pos[0], mob.pos[1] + 1.4, mob.pos[2]];
    const dx = player.pos[0] - from[0];
    const dy = (player.pos[1] + 1.1) - from[1];
    const dz = player.pos[2] - from[2];
    const len = Math.hypot(dx, dy, dz) || 1;
    const SPEED = 17;
    this.arrows.push({
      pos: from,
      vel: [
        (dx / len) * SPEED + (Math.random() - 0.5) * 1.2,
        (dy / len) * SPEED + 1.4,   // 少し山なりに
        (dz / len) * SPEED + (Math.random() - 0.5) * 1.2,
      ],
      life: 3,
    });
    this.shootRequest = true;
  }

  // プレイヤーが矢を放つ (弓)
  playerShoot(origin, dir) {
    const SPEED = 22;
    this.arrows.push({
      pos: [origin[0] + dir[0] * 0.4, origin[1] + dir[1] * 0.4, origin[2] + dir[2] * 0.4],
      vel: [dir[0] * SPEED, dir[1] * SPEED, dir[2] * SPEED],
      life: 3,
      fromPlayer: true,
    });
  }

  updateArrows(dt, player) {
    for (let i = this.arrows.length - 1; i >= 0; i--) {
      const a = this.arrows[i];
      a.life -= dt;
      if (a.life <= 0) { this.arrows.splice(i, 1); continue; }
      a.vel[1] -= 7 * dt;
      a.pos[0] += a.vel[0] * dt;
      a.pos[1] += a.vel[1] * dt;
      a.pos[2] += a.vel[2] * dt;

      if (a.fromPlayer) {
        // プレイヤーの矢 → モブに命中
        let hitMob = null;
        for (const m of this.mobs) {
          const hw = m.def.halfW + 0.15;
          if (Math.abs(a.pos[0] - m.pos[0]) < hw &&
              Math.abs(a.pos[2] - m.pos[2]) < hw &&
              a.pos[1] > m.pos[1] - 0.1 && a.pos[1] < m.pos[1] + m.def.height + 0.1) {
            hitMob = m;
            break;
          }
        }
        if (hitMob) {
          hitMob.health -= 5;
          hitMob.hurt = 0.35;
          hitMob.vel[0] += a.vel[0] * 0.15;
          hitMob.vel[1] = 4;
          hitMob.vel[2] += a.vel[2] * 0.15;
          this.arrows.splice(i, 1);
          continue;
        }
      } else {
        // 敵の矢 → プレイヤーに命中
        const dx = a.pos[0] - player.pos[0];
        const dz = a.pos[2] - player.pos[2];
        const dy = a.pos[1] - player.pos[1];
        if (!player.dead && Math.abs(dx) < 0.5 && Math.abs(dz) < 0.5 && dy > -0.2 && dy < 1.9) {
          player.takeDamage(3);
          player.vel[0] += a.vel[0] * 0.12;
          player.vel[2] += a.vel[2] * 0.12;
          this.arrows.splice(i, 1);
          continue;
        }
      }
      // ブロック命中
      if (this.world.isSolidAt(Math.floor(a.pos[0]), Math.floor(a.pos[1]), Math.floor(a.pos[2]))) {
        this.arrows.splice(i, 1);
      }
    }
  }

  update(dt, player, daylight) {
    this.deaths.length = 0;
    this.groanRequest = false;
    this.hissRequest = false;
    this.shootRequest = false;
    this.updateArrows(dt, player);
    const playerPos = player.pos;

    // --- スポーン ---
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this.spawnTimer = 2;
      this.trySpawn(playerPos, daylight);
    }

    // --- 更新 & デスポーン ---
    for (let i = this.mobs.length - 1; i >= 0; i--) {
      const m = this.mobs[i];
      const dx = m.pos[0] - playerPos[0];
      const dz = m.pos[2] - playerPos[2];
      if (dx * dx + dz * dz > 90 * 90 || m.pos[1] < -10) {
        this.mobs.splice(i, 1);
        continue;
      }
      // 遠くのモブは間引いて更新
      if (dx * dx + dz * dz > 48 * 48 && Math.random() < 0.5) continue;
      m.update(dt, this.world, player, daylight, this);

      if (m.health <= 0) {
        this.deaths.push({ pos: [...m.pos], type: m.type });
        this.mobs.splice(i, 1);
        continue;
      }
      // 近くのゾンビはうめき声
      if (m.def.hostile && dx * dx + dz * dz < 12 * 12 && Math.random() < dt * 0.12) {
        this.groanRequest = true;
      }
    }
  }

  count(hostile) {
    let n = 0;
    for (const m of this.mobs) if (!!m.def.hostile === hostile) n++;
    return n;
  }

  trySpawn(playerPos, daylight) {
    // プレイヤーの周囲 20–50 ブロックのランダム地点
    const ang = Math.random() * Math.PI * 2;
    const dist = 20 + Math.random() * 30;
    const x = Math.floor(playerPos[0] + Math.cos(ang) * dist);
    const z = Math.floor(playerPos[2] + Math.sin(ang) * dist);

    const chunk = this.world.getChunk(x >> 4, z >> 4);
    if (!chunk || !chunk.generated) return;

    const y = this.world.surfaceY(x, z);
    if (y + 1 <= WATER_LEVEL) return;

    if (daylight < 0.3) {
      // 夜: 敵モブ (ゾンビ / スケルトン / クリーパー)
      if (this.count(true) >= this.maxZombies) return;
      const r = Math.random();
      const type = r < 0.45 ? "zombie" : r < 0.75 ? "skeleton" : "creeper";
      this.mobs.push(new Mob(type, x + 0.5, y + 1.01, z + 0.5));
    } else if (daylight > 0.5) {
      // 昼: 動物 (草の上のみ)
      if (this.count(false) >= this.maxAnimals) return;
      if (this.world.getBlock(x, y, z) !== B.GRASS) return;
      const passive = MOB_NAMES.filter((n) => !MOB_TYPES[n].hostile);
      const type = passive[(Math.random() * passive.length) | 0];
      this.mobs.push(new Mob(type, x + 0.5, y + 1.01, z + 0.5));
    }
  }

  // 視線上のモブを探す
  pick(origin, dir, maxDist) {
    let best = null, bestT = maxDist;
    for (const m of this.mobs) {
      const t = m.rayHit(origin, dir, maxDist);
      if (t < bestT) { bestT = t; best = m; }
    }
    return best;
  }

  // 叩いてダメージ + ノックバック
  punch(mob, dir, damage = 2) {
    mob.health -= damage;
    mob.hurt = 0.35;
    mob.vel[0] += dir[0] * 7;
    mob.vel[2] += dir[2] * 7;
    mob.vel[1] = 5;
    if (!mob.def.hostile) {
      mob.state = "walk";
      mob.yaw = Math.atan2(dir[0], dir[2]); // 叩かれた方向へ逃げる
      mob.stateTime = 2;
    }
  }

  // 描画用の頂点配列 [x,y,z,r,g,b] を組み立てる
  buildVertexData() {
    const verts = [];
    for (const m of this.mobs) {
      const sin = Math.sin(m.yaw), cos = Math.cos(m.yaw);
      const bobY = Math.abs(m.bob) * 0.04;
      const hurtT = m.hurt > 0 ? 0.55 : 0;
      // クリーパーの導火線: 白く点滅
      const flashT = (m.fuse != null && Math.sin(m.fuse * 24) > 0) ? 0.75 : 0;
      for (let pi = 0; pi < m.def.parts.length; pi++) {
        const p = m.def.parts[pi];
        let [ox, oy, oz, w, h, d, r, g, b] = p;
        if (hurtT > 0) {
          // 被弾中は赤くフラッシュ
          r = r + (1 - r) * hurtT;
          g *= 1 - hurtT;
          b *= 1 - hurtT;
        }
        if (flashT > 0) {
          r = r + (1 - r) * flashT;
          g = g + (1 - g) * flashT;
          b = b + (1 - b) * flashT;
        }
        // 脚は歩行時に前後へ振る
        const isLeg = oy === 0;
        if (isLeg && m.bob !== 0) {
          const dir = (pi % 2 === 0 ? 1 : -1) * m.bob * 0.12;
          oz += dir;
        }
        pushBox(verts, m.pos, sin, cos, ox, oy + bobY, oz, w, h, d, r, g, b);
      }
    }

    // 矢: 速度方向を向いた細い棒
    for (const a of this.arrows) {
      const yaw = Math.atan2(a.vel[0], a.vel[2]);
      pushBox(verts, a.pos, Math.sin(yaw), Math.cos(yaw),
        -0.035, -0.035, -0.3, 0.07, 0.07, 0.6, 0.5, 0.4, 0.28);
    }
    return new Float32Array(verts);
  }
}

// ---------------- アイテムドロップ ----------------

class ItemManager {
  constructor(world) {
    this.world = world;
    this.items = [];   // {id, pos, vel, phase, age}
  }

  spawn(blockId, x, y, z) {
    if (this.items.length > 120) this.items.shift();
    this.items.push({
      id: blockId,
      pos: [x + 0.5, y + 0.3, z + 0.5],
      vel: [(Math.random() - 0.5) * 2.2, 2.5 + Math.random() * 1.5, (Math.random() - 0.5) * 2.2],
      phase: Math.random() * Math.PI * 2,
      age: 0,
    });
  }

  // onPickup(blockId) — プレイヤーが拾ったときに呼ばれる
  update(dt, player, onPickup) {
    const world = this.world;
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      it.age += dt;
      if (it.age > 240) { this.items.splice(i, 1); continue; }

      // --- プレイヤーへの吸い寄せと回収 ---
      const px = player.pos[0] - it.pos[0];
      const py = (player.pos[1] + 0.4) - it.pos[1];
      const pz = player.pos[2] - it.pos[2];
      const d2h = px * px + pz * pz;              // 水平距離
      const d2 = d2h + py * py;
      if (it.age > 0.5) {
        // 回収は水平距離ベース (アイテムは地面に転がっているため)
        if (d2h < 0.9 * 0.9 && py > -1.2 && py < 2.0) {
          this.items.splice(i, 1);
          onPickup(it.id);
          continue;
        }
        if (d2 < 2.5 * 2.5) {
          const d = Math.sqrt(d2) || 1;
          const pull = 22;                        // 重力に勝てる強さ
          it.vel[0] += (px / d) * pull * dt;
          it.vel[1] += (py / d) * pull * dt;
          it.vel[2] += (pz / d) * pull * dt;
        }
      }

      // --- 物理 (簡易: 軸ごとに判定して止める) ---
      it.vel[1] -= 16 * dt;
      it.vel[1] = Math.max(it.vel[1], -20);
      // 水に浮く
      if (world.getBlock(Math.floor(it.pos[0]), Math.floor(it.pos[1]), Math.floor(it.pos[2])) === B.WATER) {
        it.vel[1] = Math.min(it.vel[1] + 40 * dt, 1.2);
        it.vel[0] *= 0.95; it.vel[2] *= 0.95;
      }
      for (let a = 0; a < 3; a++) {
        const next = it.pos[a] + it.vel[a] * dt;
        const test = [it.pos[0], it.pos[1], it.pos[2]];
        test[a] = next + (a === 1 ? -0.05 : 0);
        if (world.isSolidAt(Math.floor(test[0]), Math.floor(test[1]), Math.floor(test[2]))) {
          if (a === 1 && it.vel[1] < 0) {
            // 着地: 摩擦で滑りを止める
            it.vel[0] *= 0.6;
            it.vel[2] *= 0.6;
          }
          it.vel[a] = 0;
        } else {
          it.pos[a] = next;
        }
      }
      if (it.pos[1] < -10) this.items.splice(i, 1);
    }
  }
}

// ボックスをエンティティのヨーで回転させて三角形 36 頂点を積む
function pushBox(verts, pos, sin, cos, ox, oy, oz, w, h, d, r, g, b) {
  // ローカル 8 頂点
  const corners = [];
  for (let i = 0; i < 8; i++) {
    const lx = ox + ((i & 1) ? w : 0);
    const ly = oy + ((i & 2) ? h : 0);
    const lz = oz + ((i & 4) ? d : 0);
    // Y 軸回転
    corners.push([
      pos[0] + lx * cos + lz * sin,
      pos[1] + ly,
      pos[2] + -lx * sin + lz * cos,
    ]);
  }
  // 各面: [4 頂点のインデックス, シェード]
  const faces = [
    [[2, 6, 7, 3], BOX_SHADE.top],
    [[0, 1, 5, 4], BOX_SHADE.bottom],
    [[4, 5, 7, 6], BOX_SHADE.south],   // +Z (正面)
    [[1, 0, 2, 3], BOX_SHADE.north],   // -Z
    [[1, 3, 7, 5], BOX_SHADE.east],    // +X
    [[4, 6, 2, 0], BOX_SHADE.west],    // -X
  ];
  for (const [idx, shade] of faces) {
    const quad = idx.map((i) => corners[i]);
    const cr = r * shade, cg = g * shade, cb = b * shade;
    // 2 三角形 (両面は不要: 面は外向き。カリング無効で描くので順序は気にしない)
    for (const tri of [[0, 1, 2], [0, 2, 3]]) {
      for (const vi of tri) {
        verts.push(quad[vi][0], quad[vi][1], quad[vi][2], cr, cg, cb);
      }
    }
  }
}
