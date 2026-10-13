// 主角 夕明：移动 / 翻滚 / 射击 / 数值与 Buff
import { G } from './state.js';
import { moveEntity } from './world.js';
import { spawnBullet, spawnParts } from './bullets.js';
import { sfx } from './audio.js';
import { drawSpr } from './sprites.js';
import { WEAPONS, RARITY } from './data_weapons.js';
import { BUFFS, TALENTS } from './data_buffs.js';
import { SKILLS } from './data_skills.js';
import { angleTo, clamp } from './utils.js';
import { Input } from './input.js';

export function mkWeapon(id) { return { id, def: WEAPONS[id], cd: 0 }; }

export function createPlayer(x, y, meta) {
  const p = {
    x, y, r: 6, spd: 108,
    hp: 6, maxHp: 6, en: 100, maxEn: 100, enRegen: 9,
    slots: [mkWeapon('pistol'), null], cur: 0, cds: [0, 0],
    dashT: 0, dashCd: 0, rollRot: 0,
    iT: 0, flash: 0, fireFlash: 0, walkT: 0,
    aim: 0, moveDir: { x: 0, y: 1 }, moving: false,
    buffs: [], shield: 0, regenT: 0,
    stats: {}, burst: null, dead: false, wolfBond: false, floorShield: false,
    skill: null, skillCd: 0,
  };
  // 应用局外天赋
  if (meta && meta.equipped) {
    for (const tid of meta.equipped) {
      const t = TALENTS[tid];
      if (!t) continue;
      if (t.buff) addBuff(p, BUFFS[t.buff]);
      if (t.special === 'wolfBond') p.wolfBond = true;
      if (t.special === 'startWeapon') {
        const pool = meta.weapons.filter(w => WEAPONS[w] && WEAPONS[w].price > 0);
        if (pool.length) p.slots[1] = mkWeapon(pool[Math.floor(Math.random() * pool.length)]);
      }
    }
  }
  recompute(p); // 保证 stats 完整初始化
  p.hp = p.maxHp;
  p.hurt = (dmg) => hurtPlayer(p, dmg);
  return p;
}

export function addBuff(p, buff) {
  p.buffs.push(buff.id);
  recompute(p);
}

export function recompute(p) {
  const s = { maxHp: 6, maxEn: 100, dmgMul: 1, rateMul: 1, dashCdMul: 1, spdMul: 1, partsMul: 1, regen: false, floorShield: false };
  for (const id of p.buffs) {
    const b = BUFFS[id];
    if (!b) continue;
    if (b.stat) {
      if (b.stat.maxHp) s.maxHp += b.stat.maxHp;
      if (b.stat.maxEn) s.maxEn += b.stat.maxEn;
      if (b.stat.dmgMul) s.dmgMul += b.stat.dmgMul;
      if (b.stat.rateMul) s.rateMul += b.stat.rateMul;
      if (b.stat.dashCdMul) s.dashCdMul += b.stat.dashCdMul;
      if (b.stat.spdMul) s.spdMul += b.stat.spdMul;
      if (b.stat.partsMul) s.partsMul += b.stat.partsMul;
    }
    if (b.special === 'regen') s.regen = true;
    if (b.special === 'floorShield') s.floorShield = true;
  }
  p.stats = s;
  const hpR = s.maxHp - p.maxHp; if (hpR > 0) p.hp = Math.min(s.maxHp, p.hp + hpR);
  const enR = s.maxEn - p.maxEn; if (enR > 0) p.en = Math.min(s.maxEn, p.en + enR);
  p.maxHp = s.maxHp; p.maxEn = s.maxEn;
}

export function playerPartsMul(p) { return p.stats.partsMul || 1; }

function fireOne(p, def, aim) {
  const dmg = def.dmg * p.stats.dmgMul;
  const muzzleX = p.x + Math.cos(aim) * 11, muzzleY = p.y + Math.sin(aim) * 11 - 2;
  const count = def.count || 1;
  for (let i = 0; i < count; i++) {
    let ang = aim + (Math.random() - 0.5) * def.spread * 2;
    let spd = def.speed * (def.kind === 'flame' ? 0.75 + Math.random() * 0.5 : 0.94 + Math.random() * 0.12);
    const o = {
      x: muzzleX, y: muzzleY, vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd,
      dmg, friendly: true, color: def.color, size: def.size, kind: def.kind,
      pierce: def.pierce || 0, explode: def.explode || 0, burn: def.burn || 0,
      knock: def.knock || 0, homing: def.homing || 0,
      ttl: def.kind === 'flame' ? 0.22 + Math.random() * 0.12 : 1.6,
    };
    spawnBullet(o);
  }
  spawnParts(muzzleX, muzzleY, { n: 3, colors: [def.color, '#fff'], spd: 60, life: 0.12, size: 2, dir: aim, spread: 0.9 });
  p.fireFlash = 0.07;
  sfx(def.sfx, 0.9 + Math.random() * 0.2);
}

export function tryFire(p) {
  const slot = p.slots[p.cur];
  if (!slot) return;
  const def = slot.def;
  if (p.en < def.cost) {
    if (Input.mpressed) sfx('deny');
    return;
  }
  p.en -= def.cost;
  if (def.burst) {
    p.burst = { n: def.burst - 1, t: def.burstGap, def, cd: def.rate / p.stats.rateMul };
    fireOne(p, def, p.aim);
    p.cds[p.cur] = def.burstGap * 2;
  } else {
    fireOne(p, def, p.aim);
    p.cds[p.cur] = def.rate / p.stats.rateMul;
  }
}

export function updatePlayer(p, dt) {
  if (p.dead) return;
  // 契约负面效果
  const ct = (G.run && G.run.contract) ? G.run.contract.id : null;
  for (let i = 0; i < 2; i++) p.cds[i] = Math.max(0, p.cds[i] - dt);
  p.iT = Math.max(0, p.iT - dt);
  p.flash = Math.max(0, p.flash - dt);
  p.fireFlash = Math.max(0, p.fireFlash - dt);
  p.dashCd = Math.max(0, p.dashCd - dt);
  p.skillCd = Math.max(0, p.skillCd - dt);
  p.en = Math.min(p.maxEn, p.en + p.enRegen * (ct === 'silent' ? 0.6 : 1) * dt);

  // 连发队列
  if (p.burst) {
    p.burst.t -= dt;
    if (p.burst.t <= 0) {
      fireOne(p, p.burst.def, p.aim);
      p.burst.n--;
      p.burst.t = p.burst.def.burstGap;
      if (p.burst.n <= 0) { p.cds[p.cur] = p.burst.cd; p.burst = null; }
    }
  }

  // 切换武器（Q）
  if (Input.just('KeyQ') && p.slots[1] && !G.dialog) {
    p.cur = p.cur === 0 ? 1 : 0;
    p.burst = null; // 打断上一把武器的连发队列
    sfx('ui');
  }

  // 主动技能（F）
  if (Input.just('KeyF') && p.skill && p.skillCd <= 0 && !G.dialog) useSkill(p);

  // 翻滚
  const ax = Input.axis();
  if ((Input.just('Space') || Input.just('ShiftLeft')) && p.dashCd <= 0 && p.dashT <= 0) {
    p.dashT = 0.22;
    p.dashCd = 1.1 * p.stats.dashCdMul * (ct === 'silent' ? 1.4 : 1);
    p.iT = Math.max(p.iT, 0.35);
    if (ax.x || ax.y) p.dashDir = { x: ax.x, y: ax.y };
    else p.dashDir = { x: Math.cos(p.aim), y: Math.sin(p.aim) };
    sfx('dash');
    spawnParts(p.x, p.y + 4, { n: 6, colors: ['#c9c9c9', '#8a8a92'], spd: 40, life: 0.3, size: 2 });
  }

  // 移动
  let vx, vy;
  if (p.dashT > 0) {
    p.dashT -= dt;
    p.rollRot += 22 * dt;
    vx = p.dashDir.x * 290; vy = p.dashDir.y * 290;
    if (Math.random() < dt * 30) spawnParts(p.x, p.y + 3, { n: 1, colors: ['#e6bd55', '#2a2a34'], spd: 20, life: 0.25, size: 2 });
  } else {
    p.rollRot = 0;
    vx = ax.x * p.spd * p.stats.spdMul; vy = ax.y * p.spd * p.stats.spdMul;
    p.moving = !!(ax.x || ax.y);
    if (p.moving) {
      p.moveDir = { x: ax.x, y: ax.y };
      p.walkT += dt * 9;
    }
  }
  moveEntity(G.room, p, vx * dt, vy * dt);

  // 瞄准与射击（鼠标坐标 + 摄像机偏移 = 世界坐标）
  const mw = G.mworld || { x: Input.mx, y: Input.my };
  p.aim = angleTo(p.x, p.y, mw.x, mw.y);
  if (Input.mdown && !G.dialog && p.dashT <= 0 && p.cds[p.cur] <= 0) tryFire(p);

  // 绷带回血
  if (p.stats.regen) {
    p.regenT += dt;
    if (p.regenT >= 8) { p.regenT = 0; if (p.hp < p.maxHp) { p.hp = Math.min(p.maxHp, p.hp + 1); sfx('pickup'); } }
  }
}

// ---- 主动技能 ----
export function useSkill(p) {
  const sk = p.skill;
  if (!sk) return;
  const def = SKILLS[sk.id];
  if (!def) return;
  if (sk.id === 'bomb') {
    const a = p.aim;
    spawnBullet({
      x: p.x + Math.cos(a) * 14, y: p.y + Math.sin(a) * 14,
      vx: Math.cos(a) * 250, vy: Math.sin(a) * 250,
      dmg: 16, friendly: true, kind: 'grenade', explode: 46, size: 5,
      color: '#f2b05e', ttl: 2,
    });
    spawnParts(p.x + Math.cos(a) * 14, p.y + Math.sin(a) * 14, { n: 5, colors: ['#fff', '#f2b05e'], spd: 70, life: 0.2, dir: a, spread: 1 });
    sfx('shoot_big');
    G.shake = Math.max(G.shake, 2);
  } else if (sk.id === 'decoy') {
    const a = p.aim;
    G.decoy = { x: p.x + Math.cos(a) * 26, y: p.y + Math.sin(a) * 26, r: 7, t: 6, max: 6 };
    spawnParts(G.decoy.x, G.decoy.y, { n: 8, colors: ['#6fe8e0', '#fff'], spd: 60, life: 0.35 });
    sfx('teleport');
  } else if (sk.id === 'bandage') {
    p.hp = Math.min(p.maxHp, p.hp + 2);
    spawnParts(p.x, p.y, { n: 10, colors: ['#6ac07a', '#fff'], spd: 50, life: 0.45, dir: -Math.PI / 2, spread: 2 });
    sfx('heal');
  }
  p.skillCd = def.cd;
}

export function hurtPlayer(p, dmg) {
  if (p.dead || p.iT > 0 || G.god) return;
  // 契约：血债
  if (G.run && G.run.contract && G.run.contract.id === 'blooddebt') dmg *= 1.3;
  dmg = Math.max(1, Math.round(dmg));
  if (p.shield > 0) {
    p.shield--;
    p.iT = 0.7;
    sfx('hit_hard');
    spawnParts(p.x, p.y, { n: 8, colors: ['#6fe8e0', '#fff'], spd: 70, life: 0.3 });
    return;
  }
  p.hp -= dmg;
  p.iT = 0.85;
  p.flash = 0.15;
  G.shake = Math.max(G.shake, 3.5);
  sfx('hurt');
  spawnParts(p.x, p.y, { n: 8, colors: ['#e05540', '#a03a44'], spd: 80, life: 0.4, grav: 60 });
  if (p.hp <= 0) { p.hp = 0; p.dead = true; }
}

export function drawPlayer(ctx) {
  const p = G.player;
  if (!p || p.dead) return;
  const blink = p.iT > 0 && Math.sin(G.time * 30) > 0;
  ctx.globalAlpha = blink ? 0.45 : 1;

  // 阴影
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath(); ctx.ellipse(p.x, p.y + 7, 6, 3, 0, 0, 7); ctx.fill();

  if (p.dashT > 0) {
    drawSpr(ctx, 'player_side_0', p.x, p.y, { rot: p.rollRot });
  } else {
    const frame = p.moving ? Math.floor(p.walkT) % 2 : 0;
    let name;
    if (Math.abs(p.moveDir.x) > Math.abs(p.moveDir.y)) name = 'player_side_' + frame;
    else if (p.moveDir.y < 0) name = 'player_up_' + frame;
    else name = 'player_down_' + frame;
    const flip = Math.abs(p.moveDir.x) > Math.abs(p.moveDir.y) && p.moveDir.x < 0;
    drawSpr(ctx, name, p.x, p.y, { flip });
  }

  // 武器（随鼠标旋转）
  const slot = p.slots[p.cur];
  if (slot) {
    ctx.save();
    ctx.translate(p.x, p.y + 1);
    ctx.rotate(p.aim);
    ctx.fillStyle = '#3a3f46';
    ctx.fillRect(2, -2, slot.def.gunLen, 4);
    ctx.fillStyle = RARITY[slot.def.rarity].color;
    ctx.fillRect(slot.def.gunLen, -1.5, 2, 3);
    if (p.fireFlash > 0) {
      ctx.fillStyle = '#fff';
      ctx.fillRect(slot.def.gunLen + 2, -2, 3, 4);
      ctx.globalAlpha = 0.5;
      ctx.fillRect(slot.def.gunLen + 2, -4, 6, 8);
      ctx.globalAlpha = blink ? 0.45 : 1;
    }
    ctx.restore();
  }

  // 护盾圈
  if (p.shield > 0) {
    ctx.strokeStyle = '#6fe8e0';
    ctx.globalAlpha = 0.5 + Math.sin(G.time * 5) * 0.2;
    ctx.beginPath(); ctx.arc(p.x, p.y, 10, 0, 7); ctx.stroke();
    ctx.globalAlpha = 1;
  }
  ctx.globalAlpha = 1;
}
