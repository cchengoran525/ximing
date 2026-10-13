// 齐青：狼兽人协助者。局内自主战斗 AI + 交互。
import { G, toast } from './state.js';
import { moveEntity, hasLOS, TS, RW, RH } from './world.js';
import { spawnBullet, spawnParts } from './bullets.js';
import { sfx } from './audio.js';
import { drawSpr } from './sprites.js';
import { WEAPONS } from './data_weapons.js';
import { dist, angleTo, clamp } from './utils.js';

// 伞枪（不在掉落池中，仅通过齐青交换获得）
export const PARASOL = {
  id: 'parasol', name: '齐青的防暴伞', rarity: 2, cost: 3, rate: 0.5,
  dmg: 5, speed: 270, spread: 0.04, count: 1, kind: 'bullet', pierce: 0,
  color: '#e9e7e0', size: 3, sfx: 'shoot', gunLen: 12, price: -1,
  desc: '聚碳酸酯伞骨，尾端藏着枪管。他说这叫“文明人的折中”。',
};

export function createCompanion(x, y) {
  const q = {
    x, y, r: 6, spd: 100, hp: 40, maxHp: 40,
    weapon: { id: 'parasol', def: PARASOL },
    cd: 1, meleeCd: 0, flash: 0, iT: 0,
    downed: false, downT: 0,
    strafeDir: 1, strafeT: 2,
    moveDir: { x: 0, y: 1 }, moving: false, walkT: 0,
    carried: [],   // 代管的武器 id 列表（最多 3）
    wolfBond: false,
    dodgeT: 0, dodgeDir: 1,
  };
  q.hurt = (dmg) => hurtCompanion(q, dmg);
  return q;
}

export function updateCompanion(q, dt) {
  if (!q) return;
  q.iT = Math.max(0, q.iT - dt);
  q.flash = Math.max(0, q.flash - dt);
  q.meleeCd = Math.max(0, q.meleeCd - dt);
  const p = G.player;

  if (q.downed) { q.downT += dt; return; }

  // 选目标
  let target = null, td = 1e9;
  for (const e of G.room.enemies) {
    if (e.dead || e.spawnT > 0) continue;
    const d = dist(q.x, q.y, e.x, e.y);
    if (d < td && (d < 230 || hasLOS(G.room, q.x, q.y, e.x, e.y))) { td = d; target = e; }
  }

  // 躲弹：附近有朝自己飞来的敌方子弹 → 侧移
  if (q.dodgeT <= 0) {
    for (const b of G.bullets) {
      if (b.friendly) continue;
      const d = dist(b.x, b.y, q.x, q.y);
      if (d < 44) {
        const toQ = angleTo(b.x, b.y, q.x, q.y);
        const bAng = Math.atan2(b.vy, b.vx);
        let diff = Math.abs((toQ - bAng) % Math.PI);
        if (diff > Math.PI / 2 - 0.5) {
          q.dodgeT = 0.32;
          q.dodgeDir = Math.random() < 0.5 ? 1 : -1;
          break;
        }
      }
    }
  }

  let vx = 0, vy = 0;
  if (target) {
    // 交战：保持 80~110 距离绕行
    const ang = angleTo(target.x, target.y, q.x, q.y);
    q.strafeT -= dt;
    if (q.strafeT <= 0) { q.strafeT = 1.2 + Math.random() * 1.8; q.strafeDir *= -1; }
    let want = ang;
    if (td > 105) want = ang + Math.PI;          // 靠近
    else if (td < 70) want = ang;                 // 后退
    else want = ang + Math.PI / 2 * q.strafeDir;  // 环绕
    if (q.dodgeT > 0) {
      q.dodgeT -= dt;
      want = ang + Math.PI / 2 * q.dodgeDir;
      vx = Math.cos(want) * 150; vy = Math.sin(want) * 150;
    } else {
      const sp = (td > 105 || td < 70) ? q.spd : q.spd * 0.7;
      vx = Math.cos(want) * sp; vy = Math.sin(want) * sp;
    }
    q.moving = true;
    q.moveDir = { x: Math.cos(want), y: Math.sin(want) };
    q.walkT += dt * 9;

    // 射击
    q.cd -= dt;
    if (q.cd <= 0 && td < 210 && hasLOS(G.room, q.x, q.y, target.x, target.y)) {
      const def = q.weapon.def;
      // 支线完成后的羁绊强化
      const bond = (G.meta && G.meta.flags.qiBond) ? 1.25 : 1;
      const rateMul = (q.wolfBond ? 1.3 : 1) * bond;
      q.cd = def.rate / rateMul * (0.9 + Math.random() * 0.25);
      const ang2 = angleTo(q.x, q.y, target.x, target.y) + (Math.random() - 0.5) * def.spread * 2;
      spawnBullet({
        x: q.x + Math.cos(ang2) * 11, y: q.y + Math.sin(ang2) * 11 - 2,
        vx: Math.cos(ang2) * def.speed, vy: Math.sin(ang2) * def.speed,
        dmg: def.dmg * bond, friendly: true, color: def.color, size: def.size, kind: def.kind,
        pierce: def.pierce || 0, explode: def.explode || 0, homing: def.homing || 0, ttl: 1.6,
      });
      q.flash = 0.06;
      sfx(def.sfx, 0.85 + Math.random() * 0.2);
    }
    // 伞击（近战击退）
    if (td < 30 && q.meleeCd <= 0) {
      q.meleeCd = 0.9;
      const a = angleTo(q.x, q.y, target.x, target.y);
      target.knockFrom && target.knockFrom(a, 90);
      target.hurt(6, { dir: a });
      spawnParts(target.x, target.y, { n: 5, colors: ['#e9e7e0', '#fff'], spd: 70, life: 0.2, dir: a, spread: 0.8 });
      sfx('bite');
    }
  } else {
    // 跟随玩家
    if (p) {
      const d = dist(q.x, q.y, p.x, p.y);
      if (d > 52) {
        const a = angleTo(q.x, q.y, p.x, p.y);
        const sp = d > 160 ? q.spd * 1.6 : q.spd;
        vx = Math.cos(a) * sp; vy = Math.sin(a) * sp;
        q.moving = true; q.walkT += dt * 9;
        q.moveDir = { x: Math.cos(a), y: Math.sin(a) };
      } else q.moving = false;
    }
  }
  moveEntity(G.room, q, vx * dt, vy * dt);
}

export function hurtCompanion(q, dmg) {
  if (!q || q.downed || q.iT > 0) return;
  q.hp -= dmg;
  q.iT = 0.5; q.flash = 0.12;
  sfx('hit');
  spawnParts(q.x, q.y, { n: 5, colors: ['#7b7f88', '#a03a44'], spd: 60, life: 0.3 });
  if (q.hp <= 0) {
    q.hp = 0; q.downed = true; q.downT = 0;
    sfx('die');
    toast('齐青倒下了！靠近按 E 扶起他', '#e8b84a');
  }
}

export function drawCompanion(ctx) {
  const q = G.companion;
  if (!q) return;
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath(); ctx.ellipse(q.x, q.y + 7, 6, 3, 0, 0, 7); ctx.fill();

  if (q.downed) {
    drawSpr(ctx, 'qiqing_side_0', q.x, q.y + 3, { rot: Math.PI / 2, alpha: 0.85 });
    // 扶起进度提示
    ctx.strokeStyle = '#e8b84a';
    ctx.beginPath(); ctx.arc(q.x, q.y - 14, 5, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * clamp(q.downT / 999, 0, 1)); ctx.stroke();
    if (G.player && dist(G.player.x, G.player.y, q.x, q.y) < 26) {
      ctx.fillStyle = '#e8e2d0';
      ctx.font = 'bold 9px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('E 扶起', q.x, q.y - 22);
    }
    return;
  }

  const frame = q.moving ? Math.floor(q.walkT) % 2 : 0;
  let name = 'qiqing_down_' + frame;
  let flip = false;
  if (Math.abs(q.moveDir.x) > Math.abs(q.moveDir.y)) { name = 'qiqing_side_0'; flip = q.moveDir.x < 0; }
  else if (q.moveDir.y < 0) name = 'qiqing_up_0';
  drawSpr(ctx, name, q.x, q.y, { flip, alpha: q.iT > 0 && Math.sin(G.time * 30) > 0 ? 0.5 : 1 });

  // 伞枪
  let ang = 0;
  const p = G.player;
  if (q.moving) ang = Math.atan2(q.moveDir.y, q.moveDir.x);
  else if (p) ang = angleTo(q.x, q.y, p.x, p.y);
  ctx.save();
  ctx.translate(q.x, q.y + 1);
  ctx.rotate(ang);
  ctx.fillStyle = '#8c2f3a';
  ctx.fillRect(2, -2, 10, 3);
  ctx.fillStyle = '#3a3f46';
  ctx.fillRect(12, -1.5, 3, 3);
  if (q.flash > 0) { ctx.fillStyle = '#fff'; ctx.fillRect(15, -2, 3, 4); }
  ctx.restore();
}
