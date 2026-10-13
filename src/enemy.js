// 敌人 AI 与 Boss 行为
import { G } from './state.js';
import { moveEntity, hasLOS, entityFits, solidAtPx, TS, T } from './world.js';
import { spawnBullet, spawnParts, explode, addZone, addTelegraph } from './bullets.js';
import { sfx } from './audio.js';
import { drawSpr, drawFlash } from './sprites.js';
import { ENEMIES, BOSSES } from './data_enemies.js';
import { AFFIXES } from './data_affixes.js';
import { dist, angleTo, clamp, TAU } from './utils.js';
import { hurtPlayer } from './player.js';

const rand = (a, b) => a + Math.random() * (b - a);

// 目标：诱饵存在时优先吸引敌人
function tgt() {
  return (G.decoy && G.decoy.t > 0) ? G.decoy : G.player;
}
// 攻击间隔（受词缀/契约影响）
function cds(e) {
  const m = (e.cdMul || 1);
  return [e.def.cd[0] * m, e.def.cd[1] * m];
}

// 飞行单位：能越过大件家具，但撞墙 / 闸门 / 柱子会停
const FLY_BLOCK = new Set([T.WALL, T.WALL_WINDOW, T.WALL_POSTER, T.WALL_GRAFFITI, T.WALL_CRACK, T.WALL_SIGN,
  T.WALL_NEON, T.WALL_WHITEBOARD, T.WALL_PAINTING, T.WALL_BANNER, T.WALL_ELEVATOR, T.COLUMN, T.LAMP, T.BOOTH, T.PUMP]);
function flyBlocked(room, px, py) {
  const tx = Math.floor(px / TS), ty = Math.floor(py / TS);
  if (tx < 0 || ty < 0 || tx >= room.w || ty >= room.h) return true;
  const t = room.grid[ty * room.w + tx];
  if (t === T.VOID) return true;
  if (t === T.GATE) {
    const reg = room.gates && room.gates.get(ty * room.w + tx);
    return !!(reg && room.lockedRegions && room.lockedRegions.has(reg));
  }
  return FLY_BLOCK.has(t);
}
function moveFlying(room, e, dx, dy) {
  const r = e.r;
  if (dx !== 0) {
    const nx = e.x + dx;
    const edge = dx > 0 ? nx + r : nx - r;
    if (!flyBlocked(room, edge, e.y - r + 1) && !flyBlocked(room, edge, e.y) && !flyBlocked(room, edge, e.y + r - 1)) e.x = nx;
  }
  if (dy !== 0) {
    const ny = e.y + dy;
    const edge = dy > 0 ? ny + r : ny - r;
    if (!flyBlocked(room, e.x - r + 1, edge) && !flyBlocked(room, e.x, edge) && !flyBlocked(room, e.x + r - 1, edge)) e.y = ny;
  }
}

// 把敌人限制在自己所属房间内（避免挤闸门、跑到别的房间）
function clampHome(e) {
  if (!e.home) return;
  const reg = G.room.regionByKey.get(e.home);
  if (!reg) return;
  const m = 1.5 * TS;
  e.x = clamp(e.x, reg.x0 * TS + m, (reg.x0 + reg.w) * TS - m);
  e.y = clamp(e.y, reg.y0 * TS + m, (reg.y0 + reg.h) * TS - m);
}

export function createEnemy(typeId, x, y, elite = false) {
  const def = BOSSES[typeId] || ENEMIES[typeId];
  const boss = !!BOSSES[typeId];
  const e = {
    def, typeId, boss, elite, x, y,
    r: def.r + (elite ? 1 : 0),
    hp: def.hp, maxHp: def.hp,
    speed: def.speed,
    t: Math.random() * 10, cd: rand(0.8, 1.6),
    state: 'move', teleT: 0, flash: 0, dead: false,
    moveDir: { x: 0, y: 1 }, walkT: Math.random() * 2,
    spawnT: 0.7, burst: 0, burstT: 0,
    dmgMul: elite ? 1.3 : 1,
    pat: -1, patT: 2.2, volley: null, beam: null, beamTick: 0,
    adds: 0, orbA: Math.random() * TAU,
    stunT: 0, dashT: 0, dashDir: { x: 0, y: 0 }, aimDir: 0,
    burnT: 0, burnTick: 0, driveA: Math.random() * TAU,
    cdMul: 1, affix: null, shieldHp: 0, shieldMax: 0, burnAura: false, auraTick: 0,
  };
  if (elite) e.hp = e.maxHp = Math.round(def.hp * 2.2);
  e.hurt = (dmg, opts) => hurtEnemy(e, dmg, opts);
  e.knockFrom = (ang, force) => {
    const nx = e.x + Math.cos(ang) * force * 0.12, ny = e.y + Math.sin(ang) * force * 0.12;
    if (entityFits(G.room, nx, e.y, e.r)) e.x = nx;
    if (entityFits(G.room, e.x, ny, e.r)) e.y = ny;
  };
  return e;
}

function hurtEnemy(e, dmg, opts = {}) {
  if (e.dead || e.spawnT > 0) return;
  // 护甲词缀：先破盾
  if (e.shieldHp > 0) {
    e.shieldHp -= dmg;
    sfx('hit_hard');
    spawnParts(e.x, e.y, { n: 5, colors: ['#6fe8e0', '#fff'], spd: 70, life: 0.25, size: 2 });
    if (e.shieldHp <= 0) {
      e.shieldHp = 0;
      spawnParts(e.x, e.y, { n: 12, colors: ['#6fe8e0', '#d8f8ff'], spd: 110, life: 0.45, size: 3 });
      sfx('boom');
    }
    e.flash = 0.08;
    return;
  }
  // 正面护盾（镇暴警 / 铁幕）
  if (e.def.front && G.player) {
    const n = angleTo(G.player.x, G.player.y, e.x, e.y);
    if (opts.dir !== undefined && Math.abs(((opts.dir - n) % TAU + TAU) % TAU - Math.PI) < Math.PI / 2.2) {
      dmg *= e.def.front;
      sfx('hit_hard');
      spawnParts(e.x + Math.cos(opts.dir) * e.r, e.y + Math.sin(opts.dir) * e.r, { n: 3, colors: ['#fff', '#6fe8e0'], spd: 80, life: 0.2 });
    }
  }
  e.hp -= dmg;
  e.flash = 0.1;
  if (opts.knock) e.knockFrom(opts.dir, opts.knock);
  if (opts.burn) { e.burnT = Math.max(e.burnT, 2.4); }
  if (e.hp <= 0) {
    e.dead = true;
    sfx('die');
    spawnParts(e.x, e.y, { n: e.boss ? 30 : 12, colors: ['#8c3038', '#5a5a62', '#3a3a44'], spd: e.boss ? 150 : 90, life: 0.6, size: e.boss ? 4 : 2, grav: 80 });
    if (e.boss) { G.shake = Math.max(G.shake, 8); sfx('boom'); }
  }
}

function fireShot(e, shot, ang) {
  const count = shot.count || 1;
  for (let i = 0; i < count; i++) {
    const a = ang + (Math.random() - 0.5) * (shot.spread || 0.1) * 2;
    const spd = shot.speed * rand(0.92, 1.08);
    spawnBullet({
      x: e.x + Math.cos(a) * 8, y: e.y + Math.sin(a) * 8,
      vx: Math.cos(a) * spd, vy: Math.sin(a) * spd,
      dmg: Math.round(shot.dmg * e.dmgMul), friendly: false,
      color: '#f2806a', size: 3, ttl: 2.4,
    });
  }
  sfx('shoot', rand(0.7, 0.9));
}

function moveToward(e, tx, ty, sp, dt) {
  const a = angleTo(e.x, e.y, tx, ty);
  moveEntity(G.room, e, Math.cos(a) * sp * dt, Math.sin(a) * sp * dt);
  e.moveDir = { x: Math.cos(a), y: Math.sin(a) };
  e.walkT += dt * 8;
}

// 敌人间简单分离，避免堆叠
function separate(e, dt) {
  for (const o of G.room.enemies) {
    if (o === e || o.dead) continue;
    const d = dist(e.x, e.y, o.x, o.y);
    const min = e.r + o.r + 2;
    if (d < min && d > 0.01) {
      const a = angleTo(o.x, o.y, e.x, e.y);
      const push = (min - d) * 3 * dt;
      if (entityFits(G.room, e.x + Math.cos(a) * push * 10, e.y, e.r)) e.x += Math.cos(a) * push * 10;
      if (entityFits(G.room, e.x, e.y + Math.sin(a) * push * 10, e.r)) e.y += Math.sin(a) * push * 10;
    }
  }
}

function contactDamage(e, dt) {
  if (!e.def.touch || e.spawnT > 0) return;
  const p = G.player;
  if (p && !p.dead && dist(e.x, e.y, p.x, p.y) < e.r + p.r) hurtPlayer(p, Math.round(e.def.touch * (e.dmgMul || 1)));
}

function updateBurn(e, dt) {
  if (e.burnT > 0) {
    e.burnT -= dt;
    e.burnTick -= dt;
    if (Math.random() < dt * 8) spawnParts(e.x, e.y - 4, { n: 1, colors: ['#f2824a', '#f2b05e'], spd: 20, life: 0.3, size: 2, dir: -Math.PI / 2, spread: 0.6 });
    if (e.burnTick <= 0) { e.burnTick = 0.5; e.hp -= 1; e.flash = 0.06; if (e.hp <= 0 && !e.dead) hurtEnemy(e, 0.01, {}); }
  }
}

export function applyAffix(e, id) {
  const a = AFFIXES[id];
  if (!a) return;
  e.affix = id;
  e.affixColor = a.color;
  if (id === 'rage') { e.speed *= 1.4; e.cdMul = (e.cdMul || 1) * 0.65; }
  else if (id === 'shield') { e.shieldHp = e.shieldMax = Math.round(e.maxHp * 0.6); }
  else if (id === 'burn') { e.burnAura = true; }
  else if (id === 'split') { /* 死亡时在 run 侧分裂 */ }
  else if (id === 'stealth') { /* 绘制时处理半透明 */ }
}

function updateBurnAura(e, dt) {
  if (!e.burnAura) return;
  e.auraTick -= dt;
  if (Math.random() < dt * 14) {
    const a = Math.random() * TAU;
    spawnParts(e.x + Math.cos(a) * 18, e.y + Math.sin(a) * 18, { n: 1, colors: ['#f2824a', '#f2b05e'], spd: 18, life: 0.4, size: 2, dir: -Math.PI / 2, spread: 1.2 });
  }
  const p = G.player;
  if (e.auraTick <= 0 && p && !p.dead && dist(e.x, e.y, p.x, p.y) < 46) {
    hurtPlayer(p, 2);
    e.auraTick = 0.9;
  }
}

// ---------------- 普通 AI ----------------
const AI = {
  gunner(e, dt) {
    const p = tgt(), d = dist(e.x, e.y, p.x, p.y), los = hasLOS(G.room, e.x, e.y, p.x, p.y);
    const [lo, hi] = e.def.keepRange;
    if (e.state === 'tele') {
      e.teleT -= dt;
      if (e.teleT <= 0) { fireShot(e, e.def.shot, angleTo(e.x, e.y, p.x, p.y)); e.state = 'move'; e.cd = rand(...cds(e)); }
      return;
    }
    if (!los || d > hi) moveToward(e, p.x, p.y, e.speed, dt);
    else if (d < lo) moveToward(e, e.x * 2 - p.x, e.y * 2 - p.y, e.speed * 0.8, dt);
    else {
      const a = angleTo(p.x, p.y, e.x, e.y) + Math.PI / 2 * (Math.sin(e.t * 1.7) > 0 ? 1 : -1);
      moveEntity(G.room, e, Math.cos(a) * e.speed * 0.6 * dt, Math.sin(a) * e.speed * 0.6 * dt);
      e.walkT += dt * 6;
      e.moveDir = { x: Math.cos(a), y: Math.sin(a) };
    }
    e.cd -= dt;
    if (e.cd <= 0 && los && d < 280) { e.state = 'tele'; e.teleT = 0.35; }
  },

  rusher(e, dt) {
    const p = tgt(), d = dist(e.x, e.y, p.x, p.y), los = hasLOS(G.room, e.x, e.y, p.x, p.y);
    if (e.state === 'tele') {
      e.teleT -= dt;
      if (e.teleT <= 0) { fireShot(e, e.def.shot, angleTo(e.x, e.y, p.x, p.y)); e.state = 'move'; e.cd = rand(...cds(e)); }
      return;
    }
    if (d > e.def.range) moveToward(e, p.x, p.y, e.speed, dt);
    e.cd -= dt;
    if (e.cd <= 0 && d < e.def.range + 40 && los) { e.state = 'tele'; e.teleT = 0.3; }
  },

  flyer(e, dt) {
    const p = tgt();
    e.orbA += dt * 0.9;
    const tx = p.x + Math.cos(e.orbA) * e.def.orbit, ty = p.y + Math.sin(e.orbA) * e.def.orbit;
    const a = angleTo(e.x, e.y, tx, ty);
    // 悬浮：能越过大件家具，但不会穿墙 / 闸门
    moveFlying(G.room, e, Math.cos(a) * e.speed * dt, Math.sin(a) * e.speed * dt);
    e.walkT += dt * 10;
    e.moveDir = { x: Math.cos(a), y: Math.sin(a) };
    e.cd -= dt;
    if (e.cd <= 0) {
      fireShot(e, e.def.shot, angleTo(e.x, e.y, p.x, p.y));
      e.cd = rand(...cds(e));
    }
  },

  turret(e, dt) {
    const p = tgt();
    if (e.burst > 0) {
      e.burstT -= dt;
      if (e.burstT <= 0) { fireShot(e, { ...e.def.shot, count: 1 }, angleTo(e.x, e.y, p.x, p.y)); e.burst--; e.burstT = 0.14; }
      return;
    }
    e.cd -= dt;
    if (e.cd <= 0 && hasLOS(G.room, e.x, e.y, p.x, p.y) && dist(e.x, e.y, p.x, p.y) < 300) {
      e.burst = e.def.shot.count; e.burstT = 0; e.cd = rand(...cds(e));
    }
  },

  dog(e, dt) {
    const p = tgt(), d = dist(e.x, e.y, p.x, p.y);
    if (e.dashT > 0) {
      e.dashT -= dt;
      moveEntity(G.room, e, Math.cos(e.dashDir) * 245 * dt, Math.sin(e.dashDir) * 245 * dt);
      e.moveDir = { x: Math.cos(e.dashDir), y: Math.sin(e.dashDir) };
      if (e.dashT <= 0) e.cd = rand(...cds(e));
      return;
    }
    if (e.state === 'tele') {
      e.teleT -= dt;
      if (e.teleT <= 0) { e.state = 'move'; e.dashT = 0.32; e.dashDir = angleTo(e.x, e.y, p.x, p.y); sfx('charge'); }
      return;
    }
    const a = angleTo(p.x, p.y, e.x, e.y) + Math.PI / 2 * (Math.sin(e.t * 2.3) > 0 ? 1 : -1);
    moveEntity(G.room, e, Math.cos(a) * e.speed * 0.8 * dt, Math.sin(a) * e.speed * 0.8 * dt);
    e.walkT += dt * 12;
    e.moveDir = { x: Math.cos(a), y: Math.sin(a) };
    e.cd -= dt;
    if (e.cd <= 0 && d < 140) { e.state = 'tele'; e.teleT = 0.32; }
  },

  shield(e, dt) {
    const p = tgt(), d = dist(e.x, e.y, p.x, p.y);
    if (d > 30) moveToward(e, p.x, p.y, e.speed, dt);
    e.cd -= dt;
    // 盾击只针对真人玩家
    const rp = G.player;
    if (e.cd <= 0 && rp && !rp.dead && dist(e.x, e.y, rp.x, rp.y) < 46) {
      const a = angleTo(e.x, e.y, rp.x, rp.y);
      const nx = rp.x + Math.cos(a) * 26, ny = rp.y + Math.sin(a) * 26;
      if (entityFits(G.room, nx, rp.y, rp.r)) rp.x = nx;
      if (entityFits(G.room, rp.x, ny, rp.r)) rp.y = ny;
      hurtPlayer(rp, Math.round(4 * e.dmgMul));
      sfx('hit_hard');
      e.cd = rand(...cds(e));
    }
  },

  charger(e, dt) {
    const p = tgt(), d = dist(e.x, e.y, p.x, p.y);
    if (e.stunT > 0) { e.stunT -= dt; return; }
    if (e.dashT > 0) {
      const ox = e.x, oy = e.y;
      e.dashT -= dt;
      moveEntity(G.room, e, Math.cos(e.dashDir) * e.def.dashSpeed * dt, Math.sin(e.dashDir) * e.def.dashSpeed * dt);
      if (dist(ox, oy, e.x, e.y) < e.def.dashSpeed * dt * 0.3) { // 撞墙
        e.stunT = 1.0; e.dashT = 0;
        G.shake = Math.max(G.shake, 3);
        sfx('hit_hard');
        spawnParts(e.x, e.y, { n: 8, colors: ['#c9c9c9', '#8c3038'], spd: 90, life: 0.4 });
      }
      if (e.dashT <= 0) e.cd = rand(...cds(e));
      return;
    }
    if (e.state === 'tele') {
      e.teleT -= dt;
      if (e.teleT <= 0) { e.state = 'move'; e.dashT = 0.7; e.dashDir = e.aimDir; sfx('charge'); }
      return;
    }
    moveToward(e, p.x, p.y, e.speed * 0.7, dt);
    e.cd -= dt;
    if (e.cd <= 0 && d < 220 && hasLOS(G.room, e.x, e.y, p.x, p.y)) {
      e.state = 'tele'; e.teleT = 0.6; e.aimDir = angleTo(e.x, e.y, p.x, p.y);
    }
  },

  sniper(e, dt) {
    const p = tgt(), d = dist(e.x, e.y, p.x, p.y), los = hasLOS(G.room, e.x, e.y, p.x, p.y);
    const [lo, hi] = e.def.keepRange;
    if (e.state === 'aim') {
      e.teleT -= dt;
      if (e.teleT <= 0) { fireShot(e, e.def.shot, angleTo(e.x, e.y, p.x, p.y)); e.state = 'move'; e.cd = rand(...cds(e)); }
      return;
    }
    if (d < lo) moveToward(e, e.x * 2 - p.x, e.y * 2 - p.y, e.speed, dt);
    else if (d > hi) moveToward(e, p.x, p.y, e.speed, dt);
    else {
      const a = angleTo(p.x, p.y, e.x, e.y) + Math.PI / 2 * (Math.sin(e.t) > 0 ? 1 : -1);
      moveEntity(G.room, e, Math.cos(a) * e.speed * 0.5 * dt, Math.sin(a) * e.speed * 0.5 * dt);
      e.moveDir = { x: Math.cos(a), y: Math.sin(a) };
    }
    e.cd -= dt;
    if (e.cd <= 0 && los && d < 320) { e.state = 'aim'; e.teleT = e.def.aimTime; }
  },

  thrower(e, dt) {
    const p = tgt(), d = dist(e.x, e.y, p.x, p.y), los = hasLOS(G.room, e.x, e.y, p.x, p.y);
    const [lo, hi] = e.def.keepRange;
    if (!los || d > hi) moveToward(e, p.x, p.y, e.speed, dt);
    else if (d < lo) moveToward(e, e.x * 2 - p.x, e.y * 2 - p.y, e.speed * 0.7, dt);
    else {
      const a = angleTo(p.x, p.y, e.x, e.y) + Math.PI / 2 * (Math.sin(e.t * 2) > 0 ? 1 : -1);
      moveEntity(G.room, e, Math.cos(a) * e.speed * 0.5 * dt, Math.sin(a) * e.speed * 0.5 * dt);
      e.moveDir = { x: Math.cos(a), y: Math.sin(a) };
    }
    e.cd -= dt;
    if (e.cd <= 0 && los) {
      const T = 0.9;
      const tx = p.x + (Math.random() - 0.5) * 30, ty = p.y + (Math.random() - 0.5) * 30;
      spawnBullet({
        x: e.x, y: e.y - 6, vx: (tx - e.x) / T, vy: (ty - e.y) / T,
        dmg: 0, friendly: false, kind: 'molotov', z: 20, vz: 130 * T, ttl: 3,
      });
      sfx('shoot', 0.6);
      e.cd = rand(...cds(e));
    }
  },
};

// ---------------- Boss AI ----------------
function spawnAdd(typeId, e) {
  // 在远离玩家的空地刷出增援（当前区域附近）
  const room = G.room;
  const reg = room.engagedRegion || room.regions[0];
  for (let i = 0; i < 24; i++) {
    const x = (reg.x0 + 2 + Math.random() * (reg.w - 4)) * TS;
    const y = (reg.y0 + 2 + Math.random() * (reg.h - 4)) * TS;
    if (entityFits(room, x, y, 8) && dist(x, y, G.player.x, G.player.y) > 110) {
      const m = createEnemy(typeId, x, y);
      G.room.enemies.push(m);
      spawnParts(x, y, { n: 8, colors: ['#8c3038', '#3a3a44'], spd: 70, life: 0.5 });
      return true;
    }
  }
  return false;
}

const BOSS_AI = {
  boss_indoor(e, dt) {
    const p = tgt(), d = dist(e.x, e.y, p.x, p.y);
    const phase = e.hp < e.maxHp * 0.4 ? 1 : 0;
    const spd = e.speed * (1 + 0.4 * phase);
    if (e.beam) {
      e.beam.t -= dt;
      e.beam.ang += e.beam.spd * dt * (1 + 0.4 * phase);
      e.beamTick -= dt;
      // 光束碰撞
      let hx = e.x, hy = e.y;
      for (let l = 10; l < 300; l += 8) {
        const px = e.x + Math.cos(e.beam.ang) * l, py = e.y + Math.sin(e.beam.ang) * l;
        if (solidAtPx(G.room, px, py)) break;
        hx = px; hy = py;
        if (e.beamTick <= 0 && G.player && !G.player.dead && dist(px, py, G.player.x, G.player.y) < 9) { hurtPlayer(G.player, 4); e.beamTick = 0.35; }
      }
      e.beam.hx = hx; e.beam.hy = hy;
      if (e.beam.t <= 0) e.beam = null;
      if (d > 150) moveToward(e, p.x, p.y, spd * 0.6, dt);
      return;
    }
    if (e.volley) {
      e.volley.t -= dt;
      if (e.volley.t <= 0) {
        if (e.volley.type === 'radial') {
          for (let i = 0; i < 12; i++) {
            const a = i / 12 * TAU + e.t;
            spawnBullet({ x: e.x, y: e.y, vx: Math.cos(a) * 120, vy: Math.sin(a) * 120, dmg: 3, friendly: false, color: '#f2806a', size: 3, ttl: 2.6 });
          }
          sfx('shoot_big', 0.7);
        } else {
          for (let i = 0; i < 3; i++) {
            const a = angleTo(e.x, e.y, p.x, p.y) + (i - 1) * 0.18;
            spawnBullet({ x: e.x, y: e.y, vx: Math.cos(a) * 200, vy: Math.sin(a) * 200, dmg: 3, friendly: false, color: '#f2806a', size: 3, ttl: 2 });
          }
          sfx('shoot', 0.7);
        }
        e.volley.n--;
        e.volley.t = 0.42;
        if (e.volley.n <= 0) e.volley = null;
      }
      if (d > 140) moveToward(e, p.x, p.y, spd * 0.5, dt);
      return;
    }
    if (d > 170) moveToward(e, p.x, p.y, spd, dt);
    else if (d < 100) moveToward(e, e.x * 2 - p.x, e.y * 2 - p.y, spd * 0.7, dt);
    e.patT -= dt;
    if (e.patT <= 0) {
      e.pat = (e.pat + 1) % 4;
      e.patT = rand(2.2, 3.0) / (1 + 0.3 * phase);
      if (e.pat === 0) e.volley = { n: 2, t: 0.3, type: 'radial' };
      else if (e.pat === 1) e.volley = { n: 3, t: 0.25, type: 'aimed' };
      else if (e.pat === 2) {
        if (e.adds < 2 && spawnAdd('guard', e)) { e.adds += 2; sfx('alarm'); }
        else e.volley = { n: 2, t: 0.3, type: 'radial' };
      } else {
        e.beam = { ang: angleTo(e.x, e.y, p.x, p.y), spd: (Math.random() < 0.5 ? 1 : -1) * 1.5, t: 2.3, hx: e.x, hy: e.y };
        e.beamTick = 0;
        sfx('alarm');
      }
    }
  },

  boss_street(e, dt) {
    const p = tgt(), d = dist(e.x, e.y, p.x, p.y);
    const phase = e.hp < e.maxHp * 0.4 ? 1 : 0;
    if (e.dashT > 0) {
      const ox = e.x, oy = e.y;
      e.dashT -= dt;
      moveEntity(G.room, e, Math.cos(e.dashDir) * 250 * dt, Math.sin(e.dashDir) * 250 * dt);
      if (dist(ox, oy, e.x, e.y) < 250 * dt * 0.3) { // 撞墙冲击波
        e.dashT = 0;
        G.shake = Math.max(G.shake, 6); sfx('boom');
        for (let i = 0; i < 14; i++) {
          const a = i / 14 * TAU;
          spawnBullet({ x: e.x, y: e.y, vx: Math.cos(a) * 130, vy: Math.sin(a) * 130, dmg: 4, friendly: false, color: '#7de0e8', size: 3, ttl: 1.8 });
        }
        e.patT = 1.6;
      }
      return;
    }
    if (e.state === 'tele') {
      e.teleT -= dt;
      if (e.teleT <= 0) { e.dashT = 0.9; e.dashDir = e.aimDir; sfx('charge'); }
      return;
    }
    if (d > 150) moveToward(e, p.x, p.y, e.speed * (1 + 0.3 * phase), dt);
    e.patT -= dt;
    if (e.patT <= 0) {
      e.pat = (e.pat + 1) % 3;
      e.patT = rand(2.4, 3.2) / (1 + 0.3 * phase);
      if (e.pat === 0) {
        // 迫击炮齐射
        sfx('alarm');
        const maxX = G.room.w * TS - TS * 2, maxY = G.room.h * TS - TS * 2;
        for (let i = 0; i < 5; i++) {
          const tx = p.x + rand(-70, 70), ty = p.y + rand(-70, 70);
          addTelegraph(clamp(tx, TS * 2, maxX), clamp(ty, TS * 2, maxY), 26, 0.95, () => explode(tx, ty, 28, 5, false));
        }
      } else if (e.pat === 1) {
        e.state = 'tele'; e.teleT = 0.7; e.aimDir = angleTo(e.x, e.y, p.x, p.y);
      } else {
        for (let i = 0; i < 18; i++) {
          const a = i / 18 * TAU;
          const spd = i % 2 ? 90 : 125;
          spawnBullet({ x: e.x, y: e.y, vx: Math.cos(a) * spd, vy: Math.sin(a) * spd, dmg: 4, friendly: false, color: '#7de0e8', size: 3, ttl: 2.6 });
        }
        sfx('shoot_big', 0.6);
      }
    }
  },

  boss_highway(e, dt) {
    const p = tgt();
    const phase = e.hp < e.maxHp * 0.4 ? 1 : 0;
    if (e.dashT > 0) {
      e.dashT -= dt;
      moveEntity(G.room, e, Math.cos(e.dashDir) * 300 * dt, Math.sin(e.dashDir) * 300 * dt);
      if (Math.random() < dt * 10) addZone(e.x, e.y, { r: 16, t: 2, dps: 2 });
      if (e.dashT <= 0) e.patT = 1.4;
      return;
    }
    if (e.state === 'tele') {
      e.teleT -= dt;
      if (e.teleT <= 0) { e.dashT = 0.8; e.dashDir = e.aimDir; sfx('charge'); }
      return;
    }
    // 8 字漂移
    e.driveA += dt * (0.9 + 0.5 * phase);
    const cx = G.room.w * TS / 2, cy = G.room.h * TS / 2;
    const tx = cx + Math.sin(e.driveA) * 150, ty = cy + Math.sin(e.driveA * 2) * 62;
    moveToward(e, tx, ty, e.speed * (1 + 0.5 * phase), dt);
    e.patT -= dt;
    if (e.patT <= 0) {
      e.pat = (e.pat + 1) % 4;
      e.patT = rand(2.0, 2.8) / (1 + 0.3 * phase);
      if (e.pat === 0) {
        e.volley = { n: 3, t: 0.2, type: 'fan' };
        e.patT = 999; // 由 volley 结束后恢复
        e.volleyDone = () => { e.patT = rand(1.6, 2.4); };
      } else if (e.pat === 1) {
        if (e.adds < 4 && spawnAdd('scav', e)) { e.adds += 2; sfx('alarm'); }
      } else if (e.pat === 2) {
        for (let i = -1; i <= 1; i++) {
          const a = angleTo(e.x, e.y, p.x, p.y) + i * 0.5;
          addZone(e.x + Math.cos(a) * 50, e.y + Math.sin(a) * 50, { r: 18, t: 2.5, dps: 2 });
        }
        sfx('flame');
      } else {
        e.state = 'tele'; e.teleT = 0.6; e.aimDir = angleTo(e.x, e.y, p.x, p.y);
      }
    }
    if (e.volley) {
      e.volley.t -= dt;
      if (e.volley.t <= 0) {
        for (let i = 0; i < 8; i++) {
          const a = angleTo(e.x, e.y, p.x, p.y) + (i - 3.5) * 0.14;
          spawnBullet({ x: e.x, y: e.y, vx: Math.cos(a) * 160, vy: Math.sin(a) * 160, dmg: 4, friendly: false, color: '#f2b05e', size: 3, ttl: 2 });
        }
        sfx('shotgun', 0.8);
        e.volley.n--; e.volley.t = 0.35;
        if (e.volley.n <= 0) { e.volley = null; e.patT = rand(1.8, 2.6); }
      }
    }
  },
  // ---- 最终 Boss：议长 ----
  boss_council(e, dt) {
    const p = tgt(), d = dist(e.x, e.y, p.x, p.y);
    const phase = e.hp < e.maxHp * 0.5 ? 1 : 0;
    const maxX = G.room.w * TS - TS * 2, maxY = G.room.h * TS - TS * 2;
    // 双光束
    if (e.beams && e.beams.length) {
      let done = true;
      for (const b of e.beams) {
        b.t -= dt;
        b.ang += b.spd * dt * (1 + 0.35 * phase);
        b.tick -= dt;
        let hx = e.x, hy = e.y;
        for (let l = 10; l < 300; l += 8) {
          const px = e.x + Math.cos(b.ang) * l, py = e.y + Math.sin(b.ang) * l;
          if (solidAtPx(G.room, px, py)) break;
          hx = px; hy = py;
          if (b.tick <= 0 && G.player && !G.player.dead && dist(px, py, G.player.x, G.player.y) < 9) { hurtPlayer(G.player, 5); b.tick = 0.4; }
        }
        b.hx = hx; b.hy = hy;
        if (b.t > 0) done = false;
      }
      if (done) e.beams = null;
      if (d > 170) moveToward(e, p.x, p.y, e.speed * 0.5, dt);
      return;
    }
    // 连发弹幕
    if (e.volley) {
      e.volley.t -= dt;
      if (e.volley.t <= 0) {
        if (e.volley.type === 'ring') {
          const n = 14;
          for (let i = 0; i < n; i++) {
            const a = i / n * TAU + e.volley.spin;
            spawnBullet({ x: e.x, y: e.y, vx: Math.cos(a) * 125, vy: Math.sin(a) * 125, dmg: 4, friendly: false, color: '#e8c14a', size: 3, ttl: 2.6 });
          }
          e.volley.spin += 0.22;
          sfx('shoot_big', 0.6);
        } else {
          const base = angleTo(e.x, e.y, p.x, p.y);
          for (let i = -4; i <= 4; i++) {
            const a = base + i * 0.16;
            spawnBullet({ x: e.x, y: e.y, vx: Math.cos(a) * 165, vy: Math.sin(a) * 165, dmg: 4, friendly: false, color: '#f2c9b0', size: 3, ttl: 2.4 });
          }
          sfx('shotgun', 0.7);
        }
        e.volley.n--;
        e.volley.t = 0.5;
        if (e.volley.n <= 0) e.volley = null;
      }
      return;
    }
    // 槌击后摇
    if (e.slam) {
      e.slam.t -= dt;
      if (e.slam.t <= 0) e.slam = null;
      if (d > 150) moveToward(e, p.x, p.y, e.speed * 0.6, dt);
      return;
    }
    // 短距瞬移
    e.blinkT = (e.blinkT || 6) - dt;
    if (e.blinkT <= 0 && d < 170) {
      e.blinkT = 7 - phase * 2.5;
      spawnParts(e.x, e.y, { n: 14, colors: ['#b070e0', '#3a3040'], spd: 90, life: 0.45 });
      sfx('teleport');
      const reg = G.room.engagedRegion || G.room.regions[0];
      for (let i = 0; i < 30; i++) {
        const nx = (reg.x0 + 3 + Math.random() * (reg.w - 6)) * TS;
        const ny = (reg.y0 + 3 + Math.random() * (reg.h - 6)) * TS;
        if (entityFits(G.room, nx, ny, e.r) && dist(nx, ny, p.x, p.y) > 130) { e.x = nx; e.y = ny; break; }
      }
      spawnParts(e.x, e.y, { n: 14, colors: ['#b070e0', '#fff'], spd: 90, life: 0.45 });
      return;
    }
    if (d > 210) moveToward(e, p.x, p.y, e.speed * (1 + 0.4 * phase), dt);
    else if (d < 110) moveToward(e, e.x * 2 - p.x, e.y * 2 - p.y, e.speed * 0.8, dt);
    // 二阶段：脚边留下火毯
    if (phase) {
      e.fireTick = (e.fireTick || 0) - dt;
      if (e.fireTick <= 0) {
        e.fireTick = 1.7;
        addZone(clamp(e.x + rand(-50, 50), TS * 2, maxX), clamp(e.y + rand(-50, 50), TS * 2, maxY), { r: 20, t: 3, dps: 2 });
      }
    }
    e.patT -= dt;
    if (e.patT <= 0) {
      e.pat = (e.pat + 1) % 4;
      e.patT = rand(2.4, 3.4) / (1 + 0.3 * phase);
      if (e.pat === 0) e.volley = { n: 2 + phase, t: 0.3, type: 'ring', spin: 0 };
      else if (e.pat === 1) {
        if (e.adds < 4 && (spawnAdd('swat', e) || spawnAdd('guard', e))) { e.adds += 2; sfx('alarm'); }
        else e.volley = { n: 3, t: 0.28, type: 'wall' };
      } else if (e.pat === 2) {
        sfx('alarm');
        for (let i = 0; i < 3; i++) {
          const tx = clamp(p.x + rand(-60, 60), TS * 2, maxX), ty = clamp(p.y + rand(-60, 60), TS * 2, maxY);
          addTelegraph(tx, ty, 30, 1.0, () => { explode(tx, ty, 32, 6, false); addZone(tx, ty, { r: 18, t: 2, dps: 2 }); });
        }
        e.slam = { t: 1.1 };
      } else {
        e.beams = [
          { ang: angleTo(e.x, e.y, p.x, p.y), spd: (Math.random() < 0.5 ? 1 : -1) * 1.4, t: 2.2, tick: 0, hx: e.x, hy: e.y },
          { ang: angleTo(e.x, e.y, p.x, p.y) + Math.PI, spd: (Math.random() < 0.5 ? -1 : 1) * 1.4, t: 2.2, tick: 0, hx: e.x, hy: e.y },
        ];
        sfx('alarm');
      }
    }
  },
};

export function updateEnemy(e, dt) {
  if (e.dead) return;
  e.t += dt;
  e.flash = Math.max(0, e.flash - dt);
  if (e.spawnT > 0) { e.spawnT -= dt; return; }
  updateBurn(e, dt);
  updateBurnAura(e, dt);
  if (e.boss) BOSS_AI[e.def.ai](e, dt);
  else AI[e.def.ai](e, dt);
  clampHome(e);
  separate(e, dt);
  contactDamage(e, dt);
}

export function drawEnemy(ctx, e) {
  // 出生动画
  if (e.spawnT > 0) {
    const p = 1 - e.spawnT / 0.7;
    ctx.strokeStyle = '#e05540';
    ctx.globalAlpha = 0.7;
    ctx.beginPath(); ctx.arc(e.x, e.y, 14 * (1 - p) + 4, 0, 7); ctx.stroke();
    ctx.globalAlpha = 0.3 + p * 0.5;
    drawSpr(ctx, e.def.sprite, e.x, e.y, { scale: 0.5 + p * 0.5 });
    ctx.globalAlpha = 1;
    return;
  }
  if (e.dead) return;

  if (e.elite) {
    const ac = e.affixColor || '#b070e0';
    ctx.fillStyle = ac + '40';
    ctx.beginPath(); ctx.arc(e.x, e.y + 4, e.r + 5, 0, 7); ctx.fill();
    ctx.globalAlpha = 0.55;
    ctx.strokeStyle = ac;
    ctx.beginPath(); ctx.arc(e.x, e.y + 4, e.r + 5, 0, 7); ctx.stroke();
    ctx.globalAlpha = 1;
  }

  const p = G.player;
  const flip = p ? p.x < e.x : false;
  const opts = { flip };
  if (e.stunT > 0) opts.rot = Math.sin(G.time * 20) * 0.08;
  // 潜行词缀：远处近乎隐形
  if (e.affix === 'stealth' && p && dist(e.x, e.y, p.x, p.y) > 130) opts.alpha = 0.22;

  // 阴影
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath(); ctx.ellipse(e.x, e.y + 7, e.r + 1, 3, 0, 0, 7); ctx.fill();

  if (e.flash > 0) drawFlash(ctx, e.def.sprite, e.x, e.y, opts);
  else drawSpr(ctx, e.def.sprite, e.x, e.y, opts);

  // 炮塔炮管
  if (e.typeId === 'turret' && p) {
    const a = angleTo(e.x, e.y, p.x, p.y);
    ctx.save(); ctx.translate(e.x, e.y); ctx.rotate(a);
    ctx.fillStyle = '#2c3036'; ctx.fillRect(4, -2, 12, 4);
    ctx.restore();
  }
  // 无人机悬浮
  if (e.typeId === 'drone') {
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.beginPath(); ctx.ellipse(e.x, e.y + 10, 5, 2, 0, 0, 7); ctx.fill();
  }
  // 蓄力/瞄准提示
  if (e.state === 'tele' && e.teleT > 0) {
    ctx.fillStyle = '#e05540';
    ctx.font = 'bold 10px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('!', e.x, e.y - 12);
  }
  if (e.typeId === 'sniper' && e.state === 'aim' && p) {
    const a = angleTo(e.x, e.y, p.x, p.y);
    ctx.strokeStyle = '#e05540';
    ctx.globalAlpha = 0.25 + (1 - e.teleT / e.def.aimTime) * 0.6;
    ctx.beginPath(); ctx.moveTo(e.x, e.y); ctx.lineTo(p.x, p.y); ctx.stroke();
    ctx.globalAlpha = 1;
  }
  if (e.typeId === 'biker' && e.state === 'tele') {
    ctx.strokeStyle = '#e05540';
    ctx.setLineDash([4, 4]);
    ctx.globalAlpha = 0.6;
    ctx.beginPath(); ctx.moveTo(e.x, e.y);
    ctx.lineTo(e.x + Math.cos(e.aimDir) * 200, e.y + Math.sin(e.aimDir) * 200);
    ctx.stroke();
    ctx.setLineDash([]); ctx.globalAlpha = 1;
  }
  // Boss 光束（可多条）
  const beams = e.beams && e.beams.length ? e.beams : (e.beam ? [e.beam] : null);
  if (beams) {
    for (const b of beams) {
      ctx.strokeStyle = '#e05540';
      ctx.lineWidth = 3;
      ctx.globalAlpha = 0.85;
      ctx.beginPath(); ctx.moveTo(e.x, e.y); ctx.lineTo(b.hx, b.hy); ctx.stroke();
      ctx.lineWidth = 1;
      ctx.strokeStyle = '#fff';
      ctx.globalAlpha = 0.6;
      ctx.beginPath(); ctx.moveTo(e.x, e.y); ctx.lineTo(b.hx, b.hy); ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
  // 护甲词缀：护盾环
  if (e.shieldHp > 0) {
    const ratio = clamp(e.shieldHp / (e.shieldMax || 1), 0, 1);
    ctx.strokeStyle = '#6fe8e0';
    ctx.lineWidth = 2;
    ctx.globalAlpha = 0.35 + ratio * 0.45;
    ctx.beginPath(); ctx.arc(e.x, e.y, e.r + 7, -Math.PI / 2, -Math.PI / 2 + TAU * ratio); ctx.stroke();
    ctx.lineWidth = 1;
    ctx.globalAlpha = 1;
  }
  // 精英血条 + 词缀名
  if (e.elite) {
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(e.x - 10, e.y - 15, 20, 3);
    ctx.fillStyle = e.affixColor || '#b070e0';
    ctx.fillRect(e.x - 10, e.y - 15, 20 * clamp(e.hp / e.maxHp, 0, 1), 3);
    if (e.affix && AFFIXES[e.affix]) {
      ctx.font = '7px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = e.affixColor;
      ctx.fillText(AFFIXES[e.affix].name, e.x, e.y - 19);
    }
  }
}
